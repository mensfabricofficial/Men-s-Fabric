import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  startAfter,
  QueryDocumentSnapshot,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { Product, Category } from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';

// Pure empty database catalog by default (NO demo products, strictly user/admin created items)
export const DEFAULT_PRODUCTS: Product[] = [];

const DEMO_PRODUCT_IDS = new Set([
  'prod-sahara-277055',
  'prod-sahara-277056',
  'prod-sahara-277069',
  'prod-sahara-277070',
  'prod-royal-panjabi-101',
  'prod-egyptian-shirt-201',
  'prod-linen-shirt-202',
  'prod-supima-polo-301',
  'prod-tailored-trouser-401',
  'prod-chino-pant-402',
]);

export const DEFAULT_CATEGORIES: Category[] = [];

const LOCAL_PRODUCTS_KEY = 'selvee_products_catalog_v3';
const LOCAL_CATEGORIES_KEY = 'selvee_categories_catalog_v3';
const LOCAL_PENDING_SYNC_KEY = 'selvee_pending_sync_ids_v1';
const UPDATE_EVENT_NAME = 'selvee_products_updated';
const CATEGORY_UPDATE_EVENT = 'selvee_categories_updated';

// Purge legacy MEN'S FABRIC demo localStorage keys on startup
if (typeof window !== 'undefined') {
  try {
    ['mf_products_catalog_v2', 'mf_categories_catalog_v2'].forEach((k) => {
      if (localStorage.getItem(k)) localStorage.removeItem(k);
    });
  } catch {
    // ignore
  }
}

// In-memory catalog cache for instantaneous zero-latency product navigation
const cachedProductsMap = new Map<string, Product>();
let lastFirestoreSyncStatus: { ok: boolean; error?: string } = { ok: true };

// Shared singleton live state so page transitions never re-query Firestore or flash old data
let liveActiveProducts: Product[] | null = null;
let liveCategories: Category[] | null = null;
const activeProductListeners = new Set<(products: Product[]) => void>();
const categoryListeners = new Set<(categories: Category[]) => void>();
let sharedActiveUnsub: Unsubscribe | null = null;
let sharedCategoriesUnsub: Unsubscribe | null = null;

const getPendingSyncIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(LOCAL_PENDING_SYNC_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // ignore
  }
  return new Set();
};

const markPendingSyncId = (id: string, pending: boolean) => {
  try {
    const set = getPendingSyncIds();
    if (pending) set.add(id);
    else set.delete(id);
    localStorage.setItem(LOCAL_PENDING_SYNC_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
};

const getTimeMs = (t: any): number => {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  if (typeof t === 'string') return Date.parse(t) || 0;
  if (typeof t === 'number') return t;
  return 0;
};

const fromFirestoreValue = (v: any): any => {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue?.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) {
    const out: Record<string, any> = {};
    const fields = v.mapValue?.fields || {};
    for (const k of Object.keys(fields)) out[k] = fromFirestoreValue(fields[k]);
    return out;
  }
  return null;
};

export const parseRestQueryDocs = (rows: any): Record<string, any>[] => {
  if (!Array.isArray(rows)) return [];
  const out: Record<string, any>[] = [];
  for (const row of rows) {
    const docObj = row?.document;
    if (!docObj?.name || !docObj?.fields) continue;
    const id = docObj.name.split('/').pop();
    const parsed: Record<string, any> = { id };
    for (const k of Object.keys(docObj.fields)) {
      parsed[k] = fromFirestoreValue(docObj.fields[k]);
    }
    out.push(parsed);
  }
  return out;
};

let hasRemoteSnapshotArrived = false;

export const cacheProductRecord = (prod: Product) => {
  if (!prod || !prod.id) return;
  cachedProductsMap.set(prod.id, prod);
  if (prod.slug) {
    cachedProductsMap.set(prod.slug, prod);
    cachedProductsMap.set(prod.slug.toLowerCase().trim(), prod);
  }
  if (prod.sku) {
    cachedProductsMap.set(prod.sku, prod);
    cachedProductsMap.set(prod.sku.toLowerCase().trim(), prod);
  }
  if (prod.name) {
    const slugified = prod.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (slugified) cachedProductsMap.set(slugified, prod);
  }
};

export const productService = {
  // Get persistent local products (reconstructs deduplicated images[0] from thumbnail)
  getLocalProducts(): Product[] {
    try {
      const saved = localStorage.getItem(LOCAL_PRODUCTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const realItems = parsed
            .filter((p) => p && p.id && !DEMO_PRODUCT_IDS.has(p.id))
            .map((p) => ({
              ...p,
              images:
                Array.isArray(p.images) && p.images.length > 0
                  ? p.images
                  : p.thumbnail
                    ? [p.thumbnail]
                    : [],
            }));
          if (realItems.length !== parsed.length) {
            this.saveLocalProducts(realItems);
          }
          realItems.forEach(cacheProductRecord);
          return realItems;
        }
      }
    } catch {
      // ignore
    }
    return [];
  },

  // Save to local storage with image deduplication to avoid 5MB quota overflow
  saveLocalProducts(list: Product[]) {
    try {
      const compact = list.map((p) => ({
        ...p,
        images:
          p.thumbnail && Array.isArray(p.images) && p.images.length === 1 && p.images[0] === p.thumbnail
            ? []
            : p.images,
      }));
      localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(compact));
    } catch {
      // ignore quota limits (IndexedDB persistentLocalCache handles large catalogs)
    }
    list.forEach(cacheProductRecord);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT_NAME, { detail: list }));
    }
  },

  // Synchronous instant accessor for zero-skeleton page navigation
  getInstantActiveProducts(): Product[] | null {
    if (liveActiveProducts !== null) return liveActiveProducts;
    const local = this.getLocalProducts().filter((p) => p.active !== false);
    return local.length > 0 ? local : null;
  },

  getInstantCategories(): Category[] | null {
    if (liveCategories !== null) return liveCategories;
    const local = this.getLocalCategories();
    return local.length > 0 ? local : null;
  },

  ensureSharedActiveListener(onError?: (err: any) => void) {
    if (sharedActiveUnsub) return;
    try {
      const q = query(collection(db, 'products'), where('active', '==', true));
      sharedActiveUnsub = onSnapshot(
        q,
        (snap) => {
          const remoteList: Product[] = [];
          snap.forEach((d) => {
            const data = d.data() as Product;
            if (data.active !== false) {
              const prod = { ...data, id: d.id };
              remoteList.push(prod);
              cacheProductRecord(prod);
              markPendingSyncId(d.id, false);
            }
          });

          // Authoritative remote catalog + only genuinely unsynced local drafts (never stale demo data)
          const pendingIds = getPendingSyncIds();
          const map = new Map<string, Product>();
          remoteList.forEach((p) => map.set(p.id, p));
          if (pendingIds.size > 0) {
            this.getLocalProducts()
              .filter((p) => p.active !== false && pendingIds.has(p.id))
              .forEach((p) => {
                if (!map.has(p.id)) map.set(p.id, p);
              });
          }

          const merged = Array.from(map.values());
          merged.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));

          hasRemoteSnapshotArrived = true;
          liveActiveProducts = merged;
          this.saveLocalProducts(merged);
          activeProductListeners.forEach((cb) => cb(merged));
        },
        (err) => {
          console.warn('Real-time active products remote notice:', err);
          if (liveActiveProducts === null) {
            const fallback = this.getLocalProducts().filter((p) => p.active !== false);
            liveActiveProducts = fallback;
            activeProductListeners.forEach((cb) => cb(fallback));
          }
          if (onError) onError(err);
        }
      );
    } catch (e) {
      console.warn('Firestore subscription exception:', e);
    }

    // Consume early HTML <head> parallel REST prefetch if snapshot hasn't arrived yet
    const prefetch = typeof window !== 'undefined' ? (window as any).__SELVEE_PREFETCH__ : null;
    if (prefetch?.products && !hasRemoteSnapshotArrived) {
      Promise.resolve(prefetch.products)
        .then((rows) => {
          if (hasRemoteSnapshotArrived) return;
          const docs = parseRestQueryDocs(rows);
          if (docs.length === 0) return;
          const prefetched: Product[] = docs.map((d: any) => ({
            ...d,
            images: Array.isArray(d.images) && d.images.length > 0 ? d.images : d.thumbnail ? [d.thumbnail] : [],
          }));
          prefetched.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
          prefetched.forEach(cacheProductRecord);
          liveActiveProducts = prefetched;
          this.saveLocalProducts(prefetched);
          activeProductListeners.forEach((cb) => cb(prefetched));
        })
        .catch(() => {});
    }
  },

  ensureSharedCategoriesListener() {
    if (sharedCategoriesUnsub) return;
    let remoteCatArrived = false;
    try {
      const q = query(collection(db, 'categories'), orderBy('sortOrder', 'asc'));
      sharedCategoriesUnsub = onSnapshot(
        q,
        (snap) => {
          remoteCatArrived = true;
          const list: Category[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Category));
          liveCategories = list;
          this.saveLocalCategories(list);
          categoryListeners.forEach((cb) => cb(list));
        },
        (err) => {
          console.warn('Real-time categories remote notice:', err);
        }
      );
    } catch {
      // ignore
    }

    const prefetch = typeof window !== 'undefined' ? (window as any).__SELVEE_PREFETCH__ : null;
    if (prefetch?.categories) {
      Promise.resolve(prefetch.categories)
        .then((rows) => {
          if (remoteCatArrived) return;
          const docs = parseRestQueryDocs(rows) as Category[];
          if (docs.length === 0) return;
          liveCategories = docs;
          this.saveLocalCategories(docs);
          categoryListeners.forEach((cb) => cb(docs));
        })
        .catch(() => {});
    }
  },

  // Real-time listener for active products (Customer Home & Shop pages)
  subscribeToActiveProducts(callback: (products: Product[]) => void, onError?: (err: any) => void): Unsubscribe {
    activeProductListeners.add(callback);

    // 1. Emit immediately ONLY if we already have real live/cached products (0ms)
    const instant = this.getInstantActiveProducts();
    if (instant !== null) {
      callback(instant);
    }

    // 2. Listen to local update events (e.g. instant updates after admin creates a product)
    const handleLocalUpdate = (e: any) => {
      const list = ((e.detail as Product[]) || this.getLocalProducts()).filter((p) => p.active !== false);
      liveActiveProducts = list;
      callback(list);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(UPDATE_EVENT_NAME, handleLocalUpdate);
    }

    // 3. Ensure shared Firestore realtime listener is running
    this.ensureSharedActiveListener(onError);

    // Safety fallback if first-ever Firestore connection takes >4s
    const safetyTimer = instant === null
      ? window.setTimeout(() => {
          if (liveActiveProducts === null) {
            callback([]);
          }
        }, 4000)
      : null;

    return () => {
      if (safetyTimer) window.clearTimeout(safetyTimer);
      activeProductListeners.delete(callback);
      if (typeof window !== 'undefined') {
        window.removeEventListener(UPDATE_EVENT_NAME, handleLocalUpdate);
      }
    };
  },

  // Real-time listener for all products (Admin panel)
  subscribeToAllProductsAdmin(callback: (products: Product[]) => void, onError?: (err: any) => void): Unsubscribe {
    // 1. Immediately emit local products if present for instant admin render
    const initial = this.getLocalProducts();
    if (initial.length > 0) {
      callback(initial);
    }

    // 2. Listen to local update events
    const handleLocalUpdate = (e: any) => {
      const list = (e.detail as Product[]) || this.getLocalProducts();
      callback(list);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(UPDATE_EVENT_NAME, handleLocalUpdate);
    }

    // 3. Connect to Firestore realtime listener
    let firestoreUnsub: (() => void) | null = null;
    try {
      const colRef = collection(db, 'products');
      firestoreUnsub = onSnapshot(
        colRef,
        (snap) => {
          const remoteList: Product[] = [];
          snap.forEach((d) => {
            const prod = { ...(d.data() as Product), id: d.id };
            remoteList.push(prod);
            cacheProductRecord(prod);
            markPendingSyncId(d.id, false);
          });

          const pendingIds = getPendingSyncIds();
          const map = new Map<string, Product>();
          remoteList.forEach((p) => map.set(p.id, p));
          if (pendingIds.size > 0) {
            this.getLocalProducts()
              .filter((p) => pendingIds.has(p.id))
              .forEach((p) => {
                if (!map.has(p.id)) map.set(p.id, p);
              });
          }

          const merged = Array.from(map.values());
          merged.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return timeB - timeA;
          });
          this.saveLocalProducts(merged);
          callback(merged);
        },
        (err) => {
          console.warn('Admin real-time products remote notice (using local-first):', err);
          callback(this.getLocalProducts());
          if (onError) onError(err);
        }
      );
    } catch (e) {
      console.warn('Admin Firestore subscription exception:', e);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(UPDATE_EVENT_NAME, handleLocalUpdate);
      }
      if (firestoreUnsub) firestoreUnsub();
    };
  },

  // Real-time listener for categories
  subscribeToCategories(callback: (categories: Category[]) => void): Unsubscribe {
    categoryListeners.add(callback);

    const instant = this.getInstantCategories();
    if (instant !== null) {
      callback(instant);
    }

    const handleLocalCat = (e: any) => {
      const list = (e.detail as Category[]) || this.getLocalCategories();
      liveCategories = list;
      callback(list);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(CATEGORY_UPDATE_EVENT, handleLocalCat);
    }

    this.ensureSharedCategoriesListener();

    return () => {
      categoryListeners.delete(callback);
      if (typeof window !== 'undefined') {
        window.removeEventListener(CATEGORY_UPDATE_EVENT, handleLocalCat);
      }
    };
  },

  getLocalCategories(): Category[] {
    try {
      const saved = localStorage.getItem(LOCAL_CATEGORIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  },

  saveLocalCategories(list: Category[]) {
    try {
      localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CATEGORY_UPDATE_EVENT, { detail: list }));
    }
  },

  // Get all active products for the public catalog (Shop page)
  async getAllActiveProducts(): Promise<Product[]> {
    try {
      const q = query(collection(db, 'products'), where('active', '==', true));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const list: Product[] = [];
        snap.forEach((d) => {
          const data = d.data() as Product;
          list.push({ ...data, id: d.id });
        });
        list.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return timeB - timeA;
        });
        this.saveLocalProducts(list);
        return list;
      }
    } catch (err) {
      console.warn('Remote fetch active products notice, using persistent local store:', err);
    }
    return this.getLocalProducts().filter((p) => p.active !== false);
  },

  // Get active products for customer shop & home with filters
  async getProducts(params?: {
    category?: string;
    gender?: string;
    featured?: boolean;
    newArrival?: boolean;
    bestSeller?: boolean;
    minPrice?: number;
    maxPrice?: number;
    searchQuery?: string;
    limitCount?: number;
    lastDoc?: QueryDocumentSnapshot | null;
  }) {
    try {
      const allActive = await this.getAllActiveProducts();
      let filtered = allActive;

      if (params?.featured) {
        filtered = filtered.filter((p) => p.featured);
      }
      if (params?.newArrival) {
        filtered = filtered.filter((p) => p.newArrival);
      }
      if (params?.bestSeller) {
        filtered = filtered.filter((p) => p.bestSeller);
      }
      if (params?.category) {
        filtered = filtered.filter(
          (p) => p.category === params.category || p.slug === params.category || p.categoryName === params.category
        );
      }
      if (params?.gender && params.gender !== 'all') {
        filtered = filtered.filter((p) => p.gender === params.gender || p.gender === 'unisex');
      }
      if (params?.searchQuery) {
        const lower = params.searchQuery.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(lower) ||
            p.description?.toLowerCase().includes(lower) ||
            p.sku?.toLowerCase().includes(lower) ||
            p.tags?.some((t) => t.toLowerCase().includes(lower))
        );
      }
      if (params?.minPrice !== undefined) {
        filtered = filtered.filter((p) => (p.salePrice || p.price) >= params.minPrice!);
      }
      if (params?.maxPrice !== undefined) {
        filtered = filtered.filter((p) => (p.salePrice || p.price) <= params.maxPrice!);
      }

      const limitNum = params?.limitCount || filtered.length;
      return {
        products: filtered.slice(0, limitNum),
        lastDoc: null,
      };
    } catch (error) {
      console.warn('Error filtering products:', error);
      return { products: this.getLocalProducts().slice(0, 10), lastDoc: null };
    }
  },

  // Admin get all products (including inactive)
  async getAllProductsAdmin() {
    try {
      const snap = await getDocs(collection(db, 'products'));
      if (!snap.empty) {
        const list: Product[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as Product), id: d.id }));
        list.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return timeB - timeA;
        });
        this.saveLocalProducts(list);
        return list;
      }
    } catch (err) {
      console.warn('Remote fetch products notice, using persistent local store');
    }
    return this.getLocalProducts();
  },

  // Get single product by ID or Slug (Bulletproof multi-strategy lookup)
  async getProductById(idOrSlug: string): Promise<Product | null> {
    try {
      if (!idOrSlug) return null;
      const cleanParam = decodeURIComponent(idOrSlug).trim().replace(/^\/+|\/+$/g, '');
      if (!cleanParam) return null;
      const lowerParam = cleanParam.toLowerCase();

      // 1. Instant Cache Check (0ms response)
      const cached = cachedProductsMap.get(cleanParam) || cachedProductsMap.get(lowerParam);
      if (cached) {
        return cached;
      }

      // 2. Direct local storage check
      const localList = this.getLocalProducts();
      const localMatch = localList.find(
        (p) =>
          p.id === cleanParam ||
          p.slug === cleanParam ||
          (p.slug && p.slug.toLowerCase().trim() === lowerParam) ||
          (p.sku && p.sku.toLowerCase().trim() === lowerParam) ||
          p.name.toLowerCase().trim() === lowerParam ||
          p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === lowerParam
      );
      if (localMatch) {
        cacheProductRecord(localMatch);
        return localMatch;
      }

      // 3. Firestore Document ID lookup
      try {
        const docRef = doc(db, 'products', cleanParam);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const item = { id: docSnap.id, ...docSnap.data() } as Product;
          cacheProductRecord(item);
          return item;
        }
      } catch {
        // Continue
      }

      // 4. Firestore Slug query lookup
      try {
        const q = query(collection(db, 'products'), where('slug', '==', cleanParam), limit(1));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          const item = { id: querySnap.docs[0].id, ...querySnap.docs[0].data() } as Product;
          cacheProductRecord(item);
          return item;
        }
      } catch {
        // Continue
      }

      return null;
    } catch (error) {
      console.warn('Error fetching product by ID/slug:', error);
      return null;
    }
  },

  // Create product (Admin)
  async createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const totalStock = data.variants && data.variants.length > 0
      ? data.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
      : Number(data.totalStock) || 0;

    const newId = `prod-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const newProduct: Product = {
      ...data,
      id: newId,
      totalStock,
      active: data.active !== false,
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    };

    // Save to local catalog immediately (0ms responsiveness)
    const current = this.getLocalProducts();
    const updated = [newProduct, ...current.filter((p) => p.id !== newId)];
    this.saveLocalProducts(updated);

    // Mark pending until remote confirms
    markPendingSyncId(newId, true);

    // Attempt remote Firestore persistence with explicit ID matching local
    try {
      const payload = sanitizeForFirestore({
        ...data,
        id: newId,
        totalStock,
        active: data.active !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'products', newId), payload, { merge: true });
      markPendingSyncId(newId, false);
      lastFirestoreSyncStatus = { ok: true };
    } catch (e: any) {
      console.warn('Remote product save notice (saved to local catalog):', e);
      lastFirestoreSyncStatus = {
        ok: false,
        error: e?.code === 'permission-denied'
          ? 'Firebase Permission Denied: Your Firestore database rules rejected write access.'
          : (e?.message || 'Sync failed'),
      };
    }

    return newId;
  },

  // Update product (Admin)
  async updateProduct(id: string, data: Partial<Product>) {
    let totalStock = data.totalStock;
    if (data.variants && data.variants.length > 0) {
      totalStock = data.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    }

    // Update local catalog immediately
    const current = this.getLocalProducts();
    const updated = current.map((p) => {
      if (p.id === id) {
        return {
          ...p,
          ...data,
          ...(data.active !== undefined ? { active: Boolean(data.active) } : {}),
          ...(totalStock !== undefined ? { totalStock } : {}),
          updatedAt: new Date().toISOString() as any,
        };
      }
      return p;
    });
    this.saveLocalProducts(updated);

    // Attempt remote Firestore persistence with setDoc merge (never throws No document to update)
    try {
      const payload = sanitizeForFirestore({
        ...data,
        ...(data.active !== undefined ? { active: Boolean(data.active) } : {}),
        ...(totalStock !== undefined ? { totalStock } : {}),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'products', id), payload, { merge: true });
      lastFirestoreSyncStatus = { ok: true };
    } catch (e: any) {
      console.warn('Remote product update notice (saved to local catalog):', e);
      lastFirestoreSyncStatus = {
        ok: false,
        error: e?.code === 'permission-denied'
          ? 'Firebase Permission Denied: Your Firestore database rules rejected update access.'
          : (e?.message || 'Update sync failed'),
      };
    }
  },

  // Quick Stock Update (Admin)
  async quickUpdateStock(id: string, newStock: number) {
    const safeStock = Math.max(0, Math.floor(newStock));

    // Update local catalog immediately
    const current = this.getLocalProducts();
    const updated = current.map((p) => (p.id === id ? { ...p, totalStock: safeStock } : p));
    this.saveLocalProducts(updated);

    // Attempt remote Firestore persistence
    try {
      await setDoc(
        doc(db, 'products', id),
        {
          totalStock: safeStock,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Remote stock update notice (saved to local catalog):', e);
    }
  },

  // Automatically decrement product inventory when an order is placed
  async decrementProductStock(
    items: { productId: string; size?: string; color?: string; quantity: number }[]
  ): Promise<void> {
    if (!items || items.length === 0) return;

    const currentProducts = this.getLocalProducts();
    const updatedProducts = currentProducts.map((p) => {
      const matchingItems = items.filter((it) => it.productId === p.id);
      if (matchingItems.length === 0) return p;

      let newTotalStock = typeof p.totalStock === 'number' ? p.totalStock : 0;
      let newVariants = p.variants ? [...p.variants] : [];

      for (const it of matchingItems) {
        const qty = Number(it.quantity) || 1;
        newTotalStock = Math.max(0, newTotalStock - qty);

        if (newVariants.length > 0) {
          newVariants = newVariants.map((v) => {
            const sizeMatches = !it.size || it.size === 'Standard' || v.size === it.size;
            const colorMatches = !it.color || it.color === 'Standard' || !v.color || v.color === it.color;
            if (sizeMatches && colorMatches) {
              return { ...v, stock: Math.max(0, (v.stock || 0) - qty) };
            }
            return v;
          });
        }
      }

      if (newVariants.length > 0) {
        newTotalStock = newVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
      }

      return {
        ...p,
        totalStock: newTotalStock,
        variants: newVariants,
        updatedAt: new Date().toISOString() as any,
      };
    });

    // 1. Immediately update persistent local catalog and dispatch event for instant UI update
    this.saveLocalProducts(updatedProducts);

    // 2. Persist to Firestore for all affected products
    for (const it of items) {
      const updatedP = updatedProducts.find((p) => p.id === it.productId);
      if (updatedP) {
        try {
          const payload = sanitizeForFirestore({
            totalStock: updatedP.totalStock,
            variants: updatedP.variants || [],
            updatedAt: serverTimestamp(),
          });
          await setDoc(doc(db, 'products', updatedP.id), payload, { merge: true });
        } catch (err) {
          console.warn(`Remote stock decrement notice for ${updatedP.id}:`, err);
        }
      }
    }
  },

  // Delete product (Admin)
  async deleteProduct(id: string) {
    // 1. Delete from local memory cache & catalog immediately
    cachedProductsMap.delete(id);
    const current = this.getLocalProducts();
    const updated = current.filter((p) => p.id !== id);
    this.saveLocalProducts(updated);

    // 2. Attempt remote Firestore persistence without throwing to caller
    try {
      await deleteDoc(doc(db, 'products', id));
      lastFirestoreSyncStatus = { ok: true };
    } catch (e: any) {
      console.warn('Remote product delete notice (removed from local catalog):', e);
      lastFirestoreSyncStatus = {
        ok: false,
        error: e?.code === 'permission-denied'
          ? 'Firebase Permission Denied: Your Firestore database rules rejected delete access.'
          : (e?.message || 'Delete sync failed'),
      };
    }
  },

  // Get last Firestore sync status
  getLastSyncStatus(): { ok: boolean; error?: string } {
    return lastFirestoreSyncStatus;
  },

  // Bulk-sync all locally created products to remote Firestore
  async syncAllProductsToFirestore(): Promise<{ success: number; failed: number; error?: string }> {
    const list = this.getLocalProducts();
    let success = 0;
    let failed = 0;
    let lastErr = '';

    for (const p of list) {
      try {
        const payload = sanitizeForFirestore({
          ...p,
          active: p.active !== false,
          totalStock: typeof p.totalStock === 'number' ? p.totalStock : 0,
          updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'products', p.id), payload, { merge: true });
        success++;
      } catch (err: any) {
        failed++;
        lastErr = err?.code === 'permission-denied'
          ? 'Firebase Permission Denied in Firestore Rules'
          : (err?.message || 'Sync failed');
      }
    }

    lastFirestoreSyncStatus = failed === 0 ? { ok: true } : { ok: false, error: lastErr };
    return { success, failed, error: lastErr };
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    try {
      const q = query(collection(db, 'categories'), orderBy('sortOrder', 'asc'));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const list: Category[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Category));
        this.saveLocalCategories(list);
        return list;
      }
    } catch {
      // ignore
    }
    return this.getLocalCategories();
  },

  async createCategory(cat: Omit<Category, 'id'>) {
    const newId = `cat-${Date.now().toString(36)}`;
    const newCat: Category = { ...cat, id: newId };
    const current = this.getLocalCategories();
    this.saveLocalCategories([...current, newCat]);

    try {
      await setDoc(
        doc(db, 'categories', newId),
        {
          ...cat,
          id: newId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Remote category save notice:', e);
    }
    return newId;
  },

  async updateCategory(id: string, cat: Partial<Category>) {
    const current = this.getLocalCategories();
    const updated = current.map((c) => (c.id === id ? { ...c, ...cat } : c));
    this.saveLocalCategories(updated);

    try {
      await setDoc(
        doc(db, 'categories', id),
        {
          ...cat,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Remote category update notice:', e);
    }
  },

  async deleteCategory(id: string) {
    const current = this.getLocalCategories();
    this.saveLocalCategories(current.filter((c) => c.id !== id));

    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (e) {
      console.warn('Remote category delete notice:', e);
    }
  },

  // Client-side image compression utility: downsamples large camera/phone photos to ~50KB for instant load
  async compressImage(file: File, maxWidth = 800, quality = 0.72): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } else {
            resolve(result);
          }
        };
        img.onerror = () => resolve(result);
        img.src = result;
      };
      reader.onerror = () => resolve('/assets/aistudio/selvee1_8ff37f5b.jpg');
      reader.readAsDataURL(file);
    });
  },

  // Resilient Image Upload with offline and cloud fallback
  async uploadImage(file: File, folder = 'products'): Promise<string> {
    try {
      const base64Data = await this.compressImage(file);
      try {
        const ext = file.name.split('.').pop() || 'jpg';
        const filename = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
        const storageRef = ref(storage, filename);
        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
      } catch (cloudErr) {
        console.warn('Firebase Storage offline, using compressed image:', cloudErr);
        return base64Data;
      }
    } catch (err) {
      console.error('Image upload failed:', err);
      return '/assets/aistudio/selvee1_8ff37f5b.jpg';
    }
  },
};

// Immediately warm up public product & category listeners on boot for instant zero-latency rendering
if (typeof window !== 'undefined') {
  productService.ensureSharedActiveListener();
  productService.ensureSharedCategoriesListener();
}

