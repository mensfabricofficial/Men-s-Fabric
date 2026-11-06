import {
  collection,
  doc,
  getDocs,
  getDoc,
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

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'panjabi', name: 'Panjabi', slug: 'panjabi', active: true, sortOrder: 1, image: '/assets/aistudio/image_86004842.png' },
  { id: 'shirts', name: 'Shirts', slug: 'shirts', active: true, sortOrder: 2, image: '/logo.jpg' },
  { id: 'polos', name: 'T-Shirts & Polos', slug: 'polos', active: true, sortOrder: 3, image: '/logo.jpg' },
  { id: 'pants', name: 'Pants & Trousers', slug: 'pants', active: true, sortOrder: 4, image: '/logo.jpg' },
  { id: 'casuals', name: 'Casual Wear', slug: 'casuals', active: true, sortOrder: 5, image: '/logo.jpg' },
];

const LOCAL_PRODUCTS_KEY = 'mf_products_catalog_v2';
const LOCAL_CATEGORIES_KEY = 'mf_categories_catalog_v2';
const UPDATE_EVENT_NAME = 'mf_products_updated';
const CATEGORY_UPDATE_EVENT = 'mf_categories_updated';

// In-memory catalog cache for instantaneous zero-latency product navigation
const cachedProductsMap = new Map<string, Product>();

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
  // Get persistent local products (purges any legacy demo items)
  getLocalProducts(): Product[] {
    try {
      const saved = localStorage.getItem(LOCAL_PRODUCTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Strictly purge any legacy demo products
          const realItems = parsed.filter((p) => p && p.id && !DEMO_PRODUCT_IDS.has(p.id));
          if (realItems.length !== parsed.length) {
            localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(realItems));
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

  // Save to local storage and notify listeners
  saveLocalProducts(list: Product[]) {
    try {
      localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
    list.forEach(cacheProductRecord);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT_NAME, { detail: list }));
    }
  },

  // Real-time listener for active products (Customer Home & Shop pages)
  subscribeToActiveProducts(callback: (products: Product[]) => void, onError?: (err: any) => void): Unsubscribe {
    // 1. Immediately emit local products for 0ms page load
    const initial = this.getLocalProducts().filter((p) => p.active !== false);
    callback(initial);

    // 2. Listen to local update events
    const handleLocalUpdate = (e: any) => {
      const list = (e.detail as Product[]) || this.getLocalProducts();
      callback(list.filter((p) => p.active !== false));
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
          if (!snap.empty) {
            const list: Product[] = [];
            snap.forEach((d) => {
              const data = d.data() as Product;
              if (data.active !== false) {
                const prod = { ...data, id: d.id };
                list.push(prod);
                cacheProductRecord(prod);
              }
            });
            list.sort((a, b) => {
              const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
              const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
              return timeB - timeA;
            });
            this.saveLocalProducts(list);
            callback(list);
          }
        },
        (err) => {
          console.warn('Real-time active products remote notice (using local-first):', err);
          if (onError) onError(err);
        }
      );
    } catch (e) {
      console.warn('Firestore subscription exception:', e);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(UPDATE_EVENT_NAME, handleLocalUpdate);
      }
      if (firestoreUnsub) firestoreUnsub();
    };
  },

  // Real-time listener for all products (Admin panel)
  subscribeToAllProductsAdmin(callback: (products: Product[]) => void, onError?: (err: any) => void): Unsubscribe {
    // 1. Immediately emit local products for instant admin render (0ms delay)
    const initial = this.getLocalProducts();
    callback(initial);

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
          if (!snap.empty) {
            const list: Product[] = [];
            snap.forEach((d) => {
              const prod = { ...(d.data() as Product), id: d.id };
              list.push(prod);
              cacheProductRecord(prod);
            });
            list.sort((a, b) => {
              const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
              const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
              return timeB - timeA;
            });
            this.saveLocalProducts(list);
            callback(list);
          }
        },
        (err) => {
          console.warn('Admin real-time products remote notice (using local-first):', err);
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
    // 1. Immediately emit categories
    const initial = this.getLocalCategories();
    callback(initial);

    const handleLocalCat = (e: any) => {
      const list = (e.detail as Category[]) || this.getLocalCategories();
      callback(list);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(CATEGORY_UPDATE_EVENT, handleLocalCat);
    }

    let firestoreUnsub: (() => void) | null = null;
    try {
      const q = query(collection(db, 'categories'), orderBy('sortOrder', 'asc'));
      firestoreUnsub = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            const list: Category[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Category));
            this.saveLocalCategories(list);
            callback(list);
          }
        },
        (err) => {
          console.warn('Real-time categories remote notice (using local):', err);
        }
      );
    } catch {
      // ignore
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(CATEGORY_UPDATE_EVENT, handleLocalCat);
      }
      if (firestoreUnsub) firestoreUnsub();
    };
  },

  getLocalCategories(): Category[] {
    try {
      const saved = localStorage.getItem(LOCAL_CATEGORIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(DEFAULT_CATEGORIES));
    } catch {
      // ignore
    }
    return DEFAULT_CATEGORIES;
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
      const colRef = collection(db, 'products');
      const snap = await getDocs(colRef);
      if (!snap.empty) {
        const list: Product[] = [];
        snap.forEach((d) => {
          const data = d.data() as Product;
          if (data.active !== false) {
            list.push({ ...data, id: d.id });
          }
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
      console.warn('Remote fetch active products notice, using persistent local store');
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
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    };

    // Save to local catalog immediately (0ms responsiveness)
    const current = this.getLocalProducts();
    const updated = [newProduct, ...current];
    this.saveLocalProducts(updated);

    // Attempt remote Firestore persistence
    try {
      const payload = sanitizeForFirestore({
        ...data,
        totalStock,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'products'), payload);
    } catch (e) {
      console.warn('Remote product save notice (saved to local catalog):', e);
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
          ...(totalStock !== undefined ? { totalStock } : {}),
          updatedAt: new Date().toISOString() as any,
        };
      }
      return p;
    });
    this.saveLocalProducts(updated);

    // Attempt remote Firestore persistence
    try {
      const payload = sanitizeForFirestore({
        ...data,
        ...(totalStock !== undefined ? { totalStock } : {}),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'products', id), payload);
    } catch (e) {
      console.warn('Remote product update notice (saved to local catalog):', e);
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
      await updateDoc(doc(db, 'products', id), {
        totalStock: safeStock,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('Remote stock update notice (saved to local catalog):', e);
    }
  },

  // Delete product (Admin)
  async deleteProduct(id: string) {
    // Delete from local catalog immediately
    const current = this.getLocalProducts();
    const updated = current.filter((p) => p.id !== id);
    this.saveLocalProducts(updated);

    // Attempt remote Firestore persistence
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (e) {
      console.warn('Remote product delete notice (removed from local catalog):', e);
    }
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
      await addDoc(collection(db, 'categories'), {
        ...cat,
        createdAt: serverTimestamp(),
      });
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
      await updateDoc(doc(db, 'categories', id), {
        ...cat,
        updatedAt: serverTimestamp(),
      });
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

  // Client-side image compression utility: downsamples large camera/phone photos to ~50KB
  async compressImage(file: File, maxWidth = 1200, quality = 0.82): Promise<string> {
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
      reader.onerror = () => resolve('/logo.jpg');
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
      return '/logo.jpg';
    }
  },
};
