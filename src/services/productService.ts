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
import { Product, Category, StockMovementEntry, StockMovementType } from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';
import { safeSetLocalStorage } from '../utils/safeStorage';
import { isFirestoreWriteBackedOff, markFirestoreWriteError } from '../lib/firestoreWriteGuard';

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
const LOCAL_STOCK_MOVEMENTS_KEY = 'selvee_stock_movements_v1';
const UPDATE_EVENT_NAME = 'selvee_products_updated';
const CATEGORY_UPDATE_EVENT = 'selvee_categories_updated';
const STOCK_MOVEMENT_EVENT = 'selvee_stock_movements_updated';
const STOCK_MOVEMENTS_DOC = doc(db, 'settings', 'stock_movements');

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
let liveAllProducts: Product[] | null = null;
let liveCategories: Category[] | null = null;
let liveStockMovements: StockMovementEntry[] | null = null;

const activeProductListeners = new Set<(products: Product[]) => void>();
const allProductListeners = new Set<(products: Product[]) => void>();
const categoryListeners = new Set<(categories: Category[]) => void>();
const stockMovementListeners = new Set<(list: StockMovementEntry[]) => void>();

let sharedActiveUnsub: Unsubscribe | null = null;
let sharedAllProductsUnsub: Unsubscribe | null = null;
let sharedCategoriesUnsub: Unsubscribe | null = null;
let sharedStockMovementsUnsub: Unsubscribe | null = null;

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

const persistProductsBackup = (list: Product[]) => {
  const compact = list.slice(0, 200).map((p) => ({
    ...p,
    images:
      p.thumbnail && Array.isArray(p.images) && p.images.length === 1 && p.images[0] === p.thumbnail
        ? []
        : p.images,
  }));
  safeSetLocalStorage(LOCAL_PRODUCTS_KEY, compact, {
    stripInlineData: true,
    maxChars: 350_000,
  });
  list.forEach(cacheProductRecord);
};

export const productService = {
  // Read live memory first, then localStorage backup (used by mutators & offline error fallbacks)
  getLocalProducts(): Product[] {
    if (liveAllProducts !== null) return liveAllProducts;
    if (liveActiveProducts !== null) return liveActiveProducts;
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
            persistProductsBackup(realItems);
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

  // Optimistic mutator save: updates live memory + backup and notifies subscribers synchronously (0ms)
  saveLocalProducts(list: Product[]) {
    persistProductsBackup(list);
    liveAllProducts = list;
    const activeOnly = list.filter((p) => p.active !== false);
    liveActiveProducts = activeOnly;
    allProductListeners.forEach((cb) => cb(list));
    activeProductListeners.forEach((cb) => cb(activeOnly));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT_NAME, { detail: list }));
    }
  },

  // Synchronous instant accessors returning ONLY hydrated live memory (never stale localStorage)
  getInstantActiveProducts(): Product[] | null {
    return liveActiveProducts;
  },

  getInstantAllProducts(): Product[] {
    return liveAllProducts ?? [];
  },

  getInstantCategories(): Category[] | null {
    return liveCategories;
  },

  getInstantStockMovements(): StockMovementEntry[] {
    return liveStockMovements ?? [];
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

          const pendingIds = getPendingSyncIds();
          const map = new Map<string, Product>();
          remoteList.forEach((p) => map.set(p.id, p));
          if (pendingIds.size > 0 && liveAllProducts) {
            liveAllProducts
              .filter((p) => p.active !== false && pendingIds.has(p.id))
              .forEach((p) => {
                if (!map.has(p.id)) map.set(p.id, p);
              });
          }

          const merged = Array.from(map.values());
          merged.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));

          liveActiveProducts = merged;
          if (liveAllProducts === null) {
            persistProductsBackup(merged);
          }
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
  },

  ensureSharedAllProductsListener(onError?: (err: any) => void) {
    if (sharedAllProductsUnsub) return;
    try {
      sharedAllProductsUnsub = onSnapshot(
        collection(db, 'products'),
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
          if (pendingIds.size > 0 && liveAllProducts) {
            liveAllProducts
              .filter((p) => pendingIds.has(p.id))
              .forEach((p) => {
                if (!map.has(p.id)) map.set(p.id, p);
              });
          }

          const merged = Array.from(map.values());
          merged.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));

          liveAllProducts = merged;
          liveActiveProducts = merged.filter((p) => p.active !== false);
          persistProductsBackup(merged);
          allProductListeners.forEach((cb) => cb(merged));
          activeProductListeners.forEach((cb) => cb(liveActiveProducts!));
        },
        (err) => {
          console.warn('Admin real-time products remote notice:', err);
          if (liveAllProducts === null) {
            const fallback = this.getLocalProducts();
            liveAllProducts = fallback;
            allProductListeners.forEach((cb) => cb(fallback));
          }
          if (onError) onError(err);
        }
      );
    } catch (e) {
      console.warn('Admin Firestore subscription exception:', e);
    }
  },

  ensureSharedCategoriesListener() {
    if (sharedCategoriesUnsub) return;
    try {
      const q = query(collection(db, 'categories'), orderBy('sortOrder', 'asc'));
      sharedCategoriesUnsub = onSnapshot(
        q,
        (snap) => {
          const list: Category[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Category));
          liveCategories = list;
          safeSetLocalStorage(LOCAL_CATEGORIES_KEY, list, {
            stripInlineData: true,
            maxChars: 200_000,
          });
          categoryListeners.forEach((cb) => cb(list));
        },
        (err) => {
          console.warn('Real-time categories remote notice:', err);
          if (liveCategories === null) {
            const fallback = this.getLocalCategories();
            liveCategories = fallback;
            categoryListeners.forEach((cb) => cb(fallback));
          }
        }
      );
    } catch {
      // ignore
    }
  },

  // Real-time listener for active products (Customer Home & Shop pages)
  subscribeToActiveProducts(callback: (products: Product[]) => void, onError?: (err: any) => void): Unsubscribe {
    activeProductListeners.add(callback);

    const instant = this.getInstantActiveProducts();
    if (instant !== null) {
      callback(instant);
    }

    this.ensureSharedActiveListener(onError);

    const safetyTimer =
      instant === null
        ? window.setTimeout(() => {
            if (liveActiveProducts === null) {
              callback([]);
            }
          }, 4000)
        : null;

    return () => {
      if (safetyTimer) window.clearTimeout(safetyTimer);
      activeProductListeners.delete(callback);
    };
  },

  // Real-time listener for all products (Admin panel - shared warm stream)
  subscribeToAllProductsAdmin(callback: (products: Product[]) => void, onError?: (err: any) => void): Unsubscribe {
    allProductListeners.add(callback);
    if (liveAllProducts !== null) {
      callback(liveAllProducts);
    }
    this.ensureSharedAllProductsListener(onError);

    return () => {
      allProductListeners.delete(callback);
    };
  },

  // Real-time listener for categories
  subscribeToCategories(callback: (categories: Category[]) => void): Unsubscribe {
    categoryListeners.add(callback);

    const instant = this.getInstantCategories();
    if (instant !== null) {
      callback(instant);
    }

    this.ensureSharedCategoriesListener();

    return () => {
      categoryListeners.delete(callback);
    };
  },

  getLocalCategories(): Category[] {
    if (liveCategories !== null) return liveCategories;
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
    liveCategories = list;
    categoryListeners.forEach((cb) => cb(list));
    safeSetLocalStorage(LOCAL_CATEGORIES_KEY, list, {
      stripInlineData: true,
      maxChars: 200_000,
    });
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
            (p.name || '').toLowerCase().includes(lower) ||
            (p.description || '').toLowerCase().includes(lower) ||
            (p.sku || '').toLowerCase().includes(lower) ||
            (p.tags || []).some((t) => (t || '').toLowerCase().includes(lower))
        );
      }
      if (params?.minPrice !== undefined) {
        filtered = filtered.filter((p) => (Number(p.salePrice) || Number(p.price) || 0) >= params.minPrice!);
      }
      if (params?.maxPrice !== undefined) {
        filtered = filtered.filter((p) => (Number(p.salePrice) || Number(p.price) || 0) <= params.maxPrice!);
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
      const writePromise = setDoc(doc(db, 'products', newId), payload, { merge: true })
        .then(() => {
          markPendingSyncId(newId, false);
          lastFirestoreSyncStatus = { ok: true };
        })
        .catch((err) => {
          console.warn('Background product write notice:', err);
        });
      await Promise.race([
        writePromise,
        new Promise<void>((resolve) => setTimeout(resolve, 1800)),
      ]);
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
      const writePromise = setDoc(doc(db, 'products', id), payload, { merge: true })
        .then(() => {
          lastFirestoreSyncStatus = { ok: true };
        })
        .catch((err) => {
          console.warn('Background product update notice:', err);
        });
      await Promise.race([
        writePromise,
        new Promise<void>((resolve) => setTimeout(resolve, 1800)),
      ]);
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

  // Stock Movement Audit History
  getLocalStockMovements(): StockMovementEntry[] {
    if (liveStockMovements !== null) return liveStockMovements;
    try {
      const raw = localStorage.getItem(LOCAL_STOCK_MOVEMENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  },

  saveLocalStockMovements(list: StockMovementEntry[]) {
    const trimmed = list.slice(0, 350);
    liveStockMovements = trimmed;
    stockMovementListeners.forEach((cb) => cb(trimmed));
    safeSetLocalStorage(LOCAL_STOCK_MOVEMENTS_KEY, trimmed.slice(0, 100), {
      maxChars: 150_000,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(STOCK_MOVEMENT_EVENT, { detail: trimmed }));
    }
  },

  async recordStockMovement(
    entry: Omit<StockMovementEntry, 'id' | 'date' | 'timestamp'> & { date?: string; timestamp?: string }
  ): Promise<StockMovementEntry> {
    const saved = await this.recordStockMovementsBatch([entry]);
    return saved[0];
  },

  async recordStockMovementsBatch(
    entries: Array<Omit<StockMovementEntry, 'id' | 'date' | 'timestamp'> & { date?: string; timestamp?: string }>
  ): Promise<StockMovementEntry[]> {
    if (!entries || entries.length === 0) return [];
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const records: StockMovementEntry[] = entries.map((entry, idx) => ({
      ...entry,
      id: `stk_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      date: entry.date || `${yyyy}-${mm}-${dd}`,
      timestamp: entry.timestamp || now.toISOString(),
    }));

    const next = [...records, ...this.getLocalStockMovements()].slice(0, 350);
    this.saveLocalStockMovements(next);

    if (!isFirestoreWriteBackedOff()) {
      try {
        await setDoc(
          STOCK_MOVEMENTS_DOC,
          sanitizeForFirestore({
            items: next.slice(0, 100),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
      } catch (err) {
        markFirestoreWriteError(err);
      }
    }
    return records;
  },

  subscribeToStockMovements(cb: (list: StockMovementEntry[]) => void): Unsubscribe {
    stockMovementListeners.add(cb);
    if (liveStockMovements !== null) {
      cb(liveStockMovements);
    }

    if (!sharedStockMovementsUnsub) {
      try {
        sharedStockMovementsUnsub = onSnapshot(
          STOCK_MOVEMENTS_DOC,
          (snap) => {
            if (snap.exists() && Array.isArray(snap.data()?.items)) {
              const sorted = [...(snap.data().items as StockMovementEntry[])]
                .filter((m) => Boolean(m?.id))
                .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
                .slice(0, 350);
              liveStockMovements = sorted;
              safeSetLocalStorage(LOCAL_STOCK_MOVEMENTS_KEY, sorted.slice(0, 100), {
                maxChars: 150_000,
              });
              stockMovementListeners.forEach((listener) => listener(sorted));
            } else if (liveStockMovements === null) {
              liveStockMovements = [];
              stockMovementListeners.forEach((listener) => listener([]));
            }
          },
          () => {
            if (liveStockMovements === null) {
              const fallback = this.getLocalStockMovements();
              liveStockMovements = fallback;
              stockMovementListeners.forEach((listener) => listener(fallback));
            }
          }
        );
      } catch {
        // ignore
      }
    }

    return () => {
      stockMovementListeners.delete(cb);
    };
  },

  // Quick Stock Update (Admin)
  async quickUpdateStock(
    id: string,
    newStock: number,
    meta?: { reason?: string; staffName?: string; type?: StockMovementType }
  ) {
    const safeStock = Math.max(0, Math.floor(newStock));

    // Update local catalog immediately
    const current = this.getLocalProducts();
    const target = current.find((p) => p.id === id);
    const prevStock = Number(target?.totalStock) || 0;
    const updated = current.map((p) => (p.id === id ? { ...p, totalStock: safeStock } : p));
    this.saveLocalProducts(updated);

    if (target && safeStock !== prevStock) {
      this.recordStockMovement({
        productId: target.id,
        productName: target.name,
        sku: target.sku || '',
        previousStock: prevStock,
        change: safeStock - prevStock,
        newStock: safeStock,
        type: meta?.type || 'manual',
        reason: meta?.reason || 'Quick catalog stock edit',
        staffName: meta?.staffName || 'Admin',
      }).catch(() => {});
    }

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

  // Explicit Stock Adjustment (Add, Manual Set, Damaged Deduction) with Audit Trail
  async adjustProductStockWithMovement(params: {
    productId: string;
    mode: 'add' | 'set' | 'damaged';
    quantity: number;
    reason: string;
    staffName: string;
    referenceId?: string;
  }): Promise<Product | null> {
    const current = this.getLocalProducts();
    const target = current.find((p) => p.id === params.productId);
    if (!target) return null;

    const prevStock = Math.max(0, Number(target.totalStock) || 0);
    const qty = Math.max(0, Math.floor(Number(params.quantity) || 0));
    let newStock = prevStock;
    let damagedStock = Number(target.damagedStock) || 0;

    if (params.mode === 'add') {
      newStock = prevStock + qty;
    } else if (params.mode === 'set') {
      newStock = qty;
    } else if (params.mode === 'damaged') {
      newStock = Math.max(0, prevStock - qty);
      damagedStock += Math.min(prevStock, qty);
    }

    const updatedProduct: Product = {
      ...target,
      totalStock: newStock,
      damagedStock,
      updatedAt: new Date().toISOString() as any,
    };

    this.saveLocalProducts(current.map((p) => (p.id === target.id ? updatedProduct : p)));

    await this.recordStockMovement({
      productId: target.id,
      productName: target.name,
      sku: target.sku || '',
      previousStock: prevStock,
      change: newStock - prevStock,
      newStock,
      type: params.mode === 'damaged' ? 'damaged' : 'adjustment',
      reason:
        params.reason.trim() ||
        (params.mode === 'damaged'
          ? `Damaged / defective stock write-off (-${qty} pcs)`
          : params.mode === 'add'
            ? `Manual stock addition (+${qty} pcs)`
            : `Manual stock count reset (${prevStock} -> ${newStock})`),
      referenceId: params.referenceId,
      staffName: params.staffName || 'Admin',
    });

    try {
      await setDoc(
        doc(db, 'products', target.id),
        sanitizeForFirestore({
          totalStock: newStock,
          damagedStock,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
    } catch {
      // queued offline
    }

    return updatedProduct;
  },

  // Automatically decrement product inventory when an order is placed or stock-approved
  async decrementProductStock(
    items: { productId: string; size?: string; color?: string; quantity: number }[],
    syncLocalOnly = false,
    meta?: { reason?: string; referenceId?: string; staffName?: string; type?: StockMovementType }
  ): Promise<void> {
    if (!items || items.length === 0) return;

    const currentProducts = this.getLocalProducts();
    const movementsToLog: Array<Omit<StockMovementEntry, 'id' | 'date' | 'timestamp'>> = [];

    const updatedProducts = currentProducts.map((p) => {
      const matchingItems = items.filter((it) => it.productId === p.id);
      if (matchingItems.length === 0) return p;

      const prevTotalStock = typeof p.totalStock === 'number' ? p.totalStock : 0;
      let newTotalStock = prevTotalStock;
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

      movementsToLog.push({
        productId: p.id,
        productName: p.name,
        sku: p.sku || '',
        size: matchingItems.map((m) => m.size).filter(Boolean).join(', '),
        color: matchingItems.map((m) => m.color).filter(Boolean).join(', '),
        previousStock: prevTotalStock,
        change: newTotalStock - prevTotalStock,
        newStock: newTotalStock,
        type: meta?.type || 'sale',
        reason: meta?.reason || 'Order / POS stock deduction',
        referenceId: meta?.referenceId,
        staffName: meta?.staffName || 'System',
      });

      return {
        ...p,
        totalStock: newTotalStock,
        variants: newVariants,
        updatedAt: new Date().toISOString() as any,
      };
    });

    // 1. Immediately update persistent local catalog and dispatch event for instant UI update
    this.saveLocalProducts(updatedProducts);
    if (movementsToLog.length > 0) {
      this.recordStockMovementsBatch(movementsToLog).catch(() => {});
    }

    if (syncLocalOnly || isFirestoreWriteBackedOff()) return;

    // 2. Persist to Firestore once per affected product ID
    const writtenIds = new Set<string>();
    for (const it of items) {
      if (writtenIds.has(it.productId)) continue;
      writtenIds.add(it.productId);
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
          markFirestoreWriteError(err);
          console.warn(`Remote stock decrement notice for ${updatedP.id}:`, err);
        }
      }
    }
  },

  // Restore product inventory when an order is returned or cancelled after stock deduction
  async restoreProductStock(
    items: { productId: string; size?: string; color?: string; quantity: number }[],
    meta?: { reason?: string; referenceId?: string; staffName?: string }
  ): Promise<void> {
    if (!items || items.length === 0) return;

    const currentProducts = this.getLocalProducts();
    const movementsToLog: Array<Omit<StockMovementEntry, 'id' | 'date' | 'timestamp'>> = [];

    const updatedProducts = currentProducts.map((p) => {
      const matchingItems = items.filter((it) => it.productId === p.id);
      if (matchingItems.length === 0) return p;

      const prevTotalStock = typeof p.totalStock === 'number' ? p.totalStock : 0;
      let newTotalStock = prevTotalStock;
      let newVariants = p.variants ? [...p.variants] : [];

      for (const it of matchingItems) {
        const qty = Math.max(0, Number(it.quantity) || 0);
        if (qty <= 0) continue;
        newTotalStock = newTotalStock + qty;

        if (newVariants.length > 0) {
          newVariants = newVariants.map((v) => {
            const sizeMatches = !it.size || it.size === 'Standard' || v.size === it.size;
            const colorMatches = !it.color || it.color === 'Standard' || !v.color || v.color === it.color;
            if (sizeMatches && colorMatches) {
              return { ...v, stock: (Number(v.stock) || 0) + qty };
            }
            return v;
          });
        }
      }

      if (newVariants.length > 0) {
        newTotalStock = newVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
      }

      if (newTotalStock !== prevTotalStock) {
        movementsToLog.push({
          productId: p.id,
          productName: p.name,
          sku: p.sku || '',
          size: matchingItems.map((m) => m.size).filter(Boolean).join(', '),
          color: matchingItems.map((m) => m.color).filter(Boolean).join(', '),
          previousStock: prevTotalStock,
          change: newTotalStock - prevTotalStock,
          newStock: newTotalStock,
          type: 'return',
          reason: meta?.reason || 'Order return / cancellation restock',
          referenceId: meta?.referenceId,
          staffName: meta?.staffName || 'System',
        });
      }

      return {
        ...p,
        totalStock: newTotalStock,
        variants: newVariants,
        updatedAt: new Date().toISOString() as any,
      };
    });

    this.saveLocalProducts(updatedProducts);
    if (movementsToLog.length > 0) {
      this.recordStockMovementsBatch(movementsToLog).catch(() => {});
    }

    if (isFirestoreWriteBackedOff()) return;

    const writtenIds = new Set<string>();
    for (const it of items) {
      if (writtenIds.has(it.productId)) continue;
      writtenIds.add(it.productId);
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
          markFirestoreWriteError(err);
          console.warn(`Remote stock restore notice for ${updatedP.id}:`, err);
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
      const writePromise = setDoc(
        doc(db, 'categories', newId),
        {
          ...cat,
          id: newId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch((e) => {
        console.warn('Remote category save notice:', e);
      });
      await Promise.race([
        writePromise,
        new Promise<void>((resolve) => setTimeout(resolve, 1800)),
      ]);
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
      const writePromise = setDoc(
        doc(db, 'categories', id),
        {
          ...cat,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch((e) => {
        console.warn('Remote category update notice:', e);
      });
      await Promise.race([
        writePromise,
        new Promise<void>((resolve) => setTimeout(resolve, 1800)),
      ]);
    } catch (e) {
      console.warn('Remote category update notice:', e);
    }
  },

  async deleteCategory(id: string) {
    const current = this.getLocalCategories();
    this.saveLocalCategories(current.filter((c) => c.id !== id));

    try {
      const delPromise = deleteDoc(doc(db, 'categories', id)).catch((e) => {
        console.warn('Remote category delete notice:', e);
      });
      await Promise.race([
        delPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 1800)),
      ]);
    } catch (e) {
      console.warn('Remote category delete notice:', e);
    }
  },

  // High-definition adaptive image encoder: preserves crisp 2K/4K clarity while staying safe for cloud/Firestore storage
  async compressImage(
    file: File,
    maxWidth = 2560,
    quality = 0.93,
    maxChars = 220000
  ): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (!result) {
          resolve('/assets/aistudio/selvee1_8ff37f5b.jpg');
          return;
        }

        // Preserve small original high-res files untouched (zero re-compression loss)
        if (result.length <= maxChars && file.size <= 240 * 1024) {
          resolve(result);
          return;
        }

        const img = new Image();
        img.onload = () => {
          const encodeWith = (targetW: number, q: number, mime: string): string => {
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;
            if (width > targetW) {
              height = Math.round((height * targetW) / width);
              width = targetW;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return result;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            return canvas.toDataURL(mime, q);
          };

          // Prefer crisp WebP (35%+ sharper per byte than JPEG), fallback to JPEG if unsupported
          let mime = 'image/webp';
          let encoded = encodeWith(maxWidth, quality, mime);
          if (!encoded.startsWith('data:image/webp')) {
            mime = 'image/jpeg';
            encoded = encodeWith(maxWidth, quality, mime);
          }

          // Gently step down only if exceeding Firestore safety budget so multi-image docs never fail
          const attempts: [number, number][] = [
            [maxWidth, 0.90],
            [Math.min(maxWidth, 2048), 0.88],
            [Math.min(maxWidth, 1800), 0.84],
            [Math.min(maxWidth, 1600), 0.80],
            [Math.min(maxWidth, 1440), 0.76],
          ];
          for (const [w, q] of attempts) {
            if (encoded.length <= maxChars) break;
            encoded = encodeWith(w, q, mime);
          }

          resolve(encoded);
        };
        img.onerror = () => resolve(result);
        img.src = result;
      };
      reader.onerror = () => resolve('/assets/aistudio/selvee1_8ff37f5b.jpg');
      reader.readAsDataURL(file);
    });
  },

  // Resilient Image Upload: attempts raw full-resolution cloud upload first, falls back to crisp HD WebP
  async uploadImage(file: File, folder = 'products'): Promise<string> {
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filename = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const storageRef = ref(storage, filename);

      // Upload raw original 4K/full-res file if Firebase Storage responds cleanly
      const uploadTask = uploadBytes(storageRef, file).then(() => getDownloadURL(storageRef));
      const timeoutTask = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Storage upload timeout')), 4500)
      );

      try {
        return await Promise.race([uploadTask, timeoutTask]);
      } catch (cloudErr) {
        console.warn('Firebase Storage offline, using HD compressed image:', cloudErr);
        const isBanner = folder === 'banners';
        return await this.compressImage(
          file,
          isBanner ? 3840 : 2560,
          0.93,
          isBanner ? 580000 : 220000
        );
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

