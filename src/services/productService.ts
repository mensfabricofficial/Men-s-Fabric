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
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { Product, Category } from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';

export const productService = {
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
      const colRef = collection(db, 'products');
      // Query active products
      let q = query(colRef, where('active', '==', true), orderBy('createdAt', 'desc'));

      if (params?.featured) {
        q = query(colRef, where('active', '==', true), where('featured', '==', true), limit(params.limitCount || 8));
      } else if (params?.newArrival) {
        q = query(colRef, where('active', '==', true), where('newArrival', '==', true), limit(params.limitCount || 8));
      } else if (params?.bestSeller) {
        q = query(colRef, where('active', '==', true), where('bestSeller', '==', true), limit(params.limitCount || 8));
      } else if (params?.category) {
        q = query(colRef, where('active', '==', true), where('category', '==', params.category), limit(params.limitCount || 24));
      } else if (params?.limitCount) {
        q = query(colRef, where('active', '==', true), orderBy('createdAt', 'desc'), limit(params.limitCount));
      }

      const snapshot = await getDocs(q);
      const products: Product[] = [];
      snapshot.forEach((docSnap) => {
        products.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });

      // Filter in-memory for flexible searches / secondary filters without requiring 20 compound indexes
      let filtered = products;
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
      if (params?.gender && params.gender !== 'all') {
        filtered = filtered.filter((p) => p.gender === params.gender || p.gender === 'unisex');
      }

      return {
        products: filtered,
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      };
    } catch (error) {
      console.warn('Error fetching products:', error);
      return { products: [], lastDoc: null };
    }
  },

  // Admin get all products (including inactive)
  async getAllProductsAdmin() {
    try {
      const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: Product[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Product));
      return list;
    } catch (err) {
      console.warn('Admin fetch products error:', err);
      return [];
    }
  },

  // Get single product by ID or Slug
  async getProductById(idOrSlug: string): Promise<Product | null> {
    try {
      // 1. Try direct ID lookup
      const docRef = doc(db, 'products', idOrSlug);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Product;
      }

      // 2. Try slug lookup
      const q = query(collection(db, 'products'), where('slug', '==', idOrSlug), limit(1));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const item = querySnap.docs[0];
        return { id: item.id, ...item.data() } as Product;
      }
      return null;
    } catch (error) {
      console.warn('Error fetching product by ID/slug:', error);
      return null;
    }
  },

  // Create product (Admin)
  async createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) {
    const totalStock = data.variants && data.variants.length > 0
      ? data.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
      : Number(data.totalStock) || 0;

    const payload = sanitizeForFirestore({
      ...data,
      totalStock,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const res = await addDoc(collection(db, 'products'), payload);
    return res.id;
  },

  // Update product (Admin)
  async updateProduct(id: string, data: Partial<Product>) {
    let totalStock = data.totalStock;
    if (data.variants) {
      totalStock = data.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    }
    const payload = sanitizeForFirestore({
      ...data,
      ...(totalStock !== undefined ? { totalStock } : {}),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'products', id), payload);
  },

  // Delete product (Admin)
  async deleteProduct(id: string) {
    await deleteDoc(doc(db, 'products', id));
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    try {
      const q = query(collection(db, 'categories'), orderBy('sortOrder', 'asc'));
      const snap = await getDocs(q);
      const list: Category[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Category));
      return list;
    } catch (err) {
      console.warn('Error fetching categories:', err);
      return [];
    }
  },

  async createCategory(cat: Omit<Category, 'id'>) {
    const res = await addDoc(collection(db, 'categories'), {
      ...cat,
      createdAt: serverTimestamp(),
    });
    return res.id;
  },

  async updateCategory(id: string, cat: Partial<Category>) {
    await updateDoc(doc(db, 'categories', id), {
      ...cat,
      updatedAt: serverTimestamp(),
    });
  },

  async deleteCategory(id: string) {
    await deleteDoc(doc(db, 'categories', id));
  },

  // Upload image to Firebase Storage with compression
  async uploadImage(file: File, folder = 'products'): Promise<string> {
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const storagePath = `${folder}/${timestamp}_${cleanFileName}`;
    const fileRef = ref(storage, storagePath);

    const uploadTask = uploadBytesResumable(fileRef, file, {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000',
    });

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        null,
        (error) => reject(error),
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        }
      );
    });
  },
};
