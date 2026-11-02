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
  orderBy,
  serverTimestamp,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Banner, Coupon, DeliveryZone, Review, SiteSettings, AuditLog } from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';

export const defaultSettings: SiteSettings = {
  storeName: "MEN'S FABRIC",
  storeDescription: 'Premium clothing brand specializing in curated menswear, shirts, panjabi, and contemporary attire.',
  phone: '+880 1700-000000',
  email: 'mensfabricofficial@gmail.com',
  address: 'Dhaka, Bangladesh',
  whatsapp: '+8801700000000',
  facebookUrl: 'https://facebook.com/mensfabricofficial',
  instagramUrl: 'https://instagram.com/mensfabricofficial',
  youtubeUrl: '',
  tiktokUrl: '',
  announcementText: '🔥 Welcome to MEN\'S FABRIC — Free Shipping on Orders Over ৳2500!',
  announcementActive: true,
  freeDeliveryThreshold: 2500,
};

export const settingsService = {
  // Get Site Settings
  async getSettings(): Promise<SiteSettings> {
    try {
      const snap = await getDoc(doc(db, 'settings', 'general'));
      if (snap.exists()) {
        return { ...defaultSettings, ...snap.data() } as SiteSettings;
      }
      return defaultSettings;
    } catch {
      return defaultSettings;
    }
  },

  // Update Site Settings
  async updateSettings(settings: Partial<SiteSettings>) {
    const payload = sanitizeForFirestore({
      ...settings,
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'settings', 'general'), payload, { merge: true });
  },

  // Banners
  async getBanners(activeOnly = true): Promise<Banner[]> {
    try {
      let q = query(collection(db, 'banners'), orderBy('sortOrder', 'asc'));
      if (activeOnly) {
        q = query(collection(db, 'banners'), where('active', '==', true), orderBy('sortOrder', 'asc'));
      }
      const snap = await getDocs(q);
      const list: Banner[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Banner));
      return list;
    } catch (e) {
      console.warn('Error fetching banners:', e);
      return [];
    }
  },

  async createBanner(banner: Omit<Banner, 'id'>) {
    const payload = sanitizeForFirestore({
      ...banner,
      createdAt: serverTimestamp(),
    });
    const res = await addDoc(collection(db, 'banners'), payload);
    return res.id;
  },

  async updateBanner(id: string, banner: Partial<Banner>) {
    const payload = sanitizeForFirestore({
      ...banner,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'banners', id), payload);
  },

  async deleteBanner(id: string) {
    await deleteDoc(doc(db, 'banners', id));
  },

  // Coupons
  async getCoupons(): Promise<Coupon[]> {
    try {
      const snap = await getDocs(collection(db, 'coupons'));
      const list: Coupon[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Coupon));
      return list;
    } catch {
      return [];
    }
  },

  async createCoupon(coupon: Omit<Coupon, 'id' | 'usedCount'>) {
    const payload = sanitizeForFirestore({
      ...coupon,
      code: coupon.code.toUpperCase().trim(),
      usedCount: 0,
      createdAt: serverTimestamp(),
    });
    const res = await addDoc(collection(db, 'coupons'), payload);
    return res.id;
  },

  async updateCoupon(id: string, coupon: Partial<Coupon>) {
    const payload = sanitizeForFirestore({
      ...coupon,
      ...(coupon.code ? { code: coupon.code.toUpperCase().trim() } : {}),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'coupons', id), payload);
  },

  async deleteCoupon(id: string) {
    await deleteDoc(doc(db, 'coupons', id));
  },

  // Delivery Zones
  async getDeliveryZones(): Promise<DeliveryZone[]> {
    try {
      const snap = await getDocs(collection(db, 'deliveryZones'));
      const list: DeliveryZone[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as DeliveryZone));
      return list;
    } catch {
      return [];
    }
  },

  async saveDeliveryZone(zone: Omit<DeliveryZone, 'id'>, id?: string) {
    const payload = sanitizeForFirestore(zone);
    if (id) {
      await updateDoc(doc(db, 'deliveryZones', id), { ...payload, updatedAt: serverTimestamp() });
      return id;
    } else {
      const res = await addDoc(collection(db, 'deliveryZones'), { ...payload, createdAt: serverTimestamp() });
      return res.id;
    }
  },

  async deleteDeliveryZone(id: string) {
    await deleteDoc(doc(db, 'deliveryZones', id));
  },

  // Reviews
  async getProductReviews(productId: string): Promise<Review[]> {
    try {
      const q = query(
        collection(db, 'reviews'),
        where('productId', '==', productId),
        where('approved', '==', true),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const list: Review[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Review));
      return list;
    } catch {
      return [];
    }
  },

  async getAllReviewsAdmin(): Promise<Review[]> {
    try {
      const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: Review[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Review));
      return list;
    } catch {
      return [];
    }
  },

  async submitReview(review: Omit<Review, 'id' | 'createdAt' | 'approved'>) {
    await addDoc(collection(db, 'reviews'), {
      ...review,
      approved: false, // Requires admin approval
      createdAt: serverTimestamp(),
    });
  },

  async updateReviewApproval(id: string, approved: boolean) {
    await updateDoc(doc(db, 'reviews', id), { approved });
  },

  async deleteReview(id: string) {
    await deleteDoc(doc(db, 'reviews', id));
  },

  // Audit Logs
  async logAdminAction(adminUid: string, adminEmail: string, action: string, target: string, details?: string) {
    try {
      await addDoc(collection(db, 'auditLogs'), {
        adminUid,
        adminEmail,
        action,
        target,
        details: details || '',
        timestamp: serverTimestamp(),
      });
    } catch {
      // Non-blocking
    }
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    try {
      const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(50));
      const snap = await getDocs(q);
      const list: AuditLog[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AuditLog));
      return list;
    } catch {
      return [];
    }
  },
};
