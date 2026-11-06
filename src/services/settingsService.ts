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
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Banner, Coupon, DeliveryZone, Review, SiteSettings, AuditLog, PaymentSettings } from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';

export const defaultPaymentSettings: PaymentSettings = {
  codEnabled: true,
  onlineDiscountType: 'percentage',
  onlineDiscountValue: 5, // 5% discount for online prepayment!
  onlineDiscountActive: true,
  bkash: {
    enabled: true,
    accountType: 'Personal (Send Money)',
    number: '01700-000000',
    instructions: '1. Open your bKash app or dial *247#.\n2. Choose "Send Money".\n3. Enter the bKash number provided above.\n4. Enter the exact Total Amount.\n5. Complete the payment, then enter your Sender Number & TrxID below.',
  },
  nagad: {
    enabled: true,
    accountType: 'Personal (Send Money)',
    number: '01700-000000',
    instructions: '1. Open your Nagad app or dial *167#.\n2. Choose "Send Money".\n3. Enter the Nagad number provided above.\n4. Enter the exact Total Amount.\n5. Complete the payment, then enter your Sender Number & TrxID below.',
  },
  rocket: {
    enabled: true,
    accountType: 'Personal (Send Money)',
    number: '01700-000000-0',
    instructions: '1. Open your Rocket app or dial *322#.\n2. Choose "Send Money".\n3. Enter the Rocket number provided above.\n4. Enter the exact Total Amount.\n5. Complete the payment, then enter your Sender Number & TrxID below.',
  },
};

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
  paymentSettings: defaultPaymentSettings,
};

const LOCAL_SETTINGS_KEY = 'mf_site_settings_v2';
const LOCAL_DELIVERY_ZONES_KEY = 'mf_delivery_zones_v2';
const LOCAL_BANNERS_KEY = 'mf_banners_catalog_v2';
const LOCAL_COUPONS_KEY = 'mf_coupons_catalog_v2';

const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  { id: 'dhaka', name: 'Inside Dhaka City', charge: 70, estimatedDays: '1 - 2 Days', active: true },
  { id: 'outside-dhaka', name: 'Outside Dhaka (Nationwide)', charge: 130, estimatedDays: '2 - 4 Days', active: true },
];

export const getLocalDeliveryZones = (): DeliveryZone[] => {
  try {
    const raw = localStorage.getItem(LOCAL_DELIVERY_ZONES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_DELIVERY_ZONES;
};

export const saveLocalDeliveryZones = (zones: DeliveryZone[]) => {
  try {
    localStorage.setItem(LOCAL_DELIVERY_ZONES_KEY, JSON.stringify(zones));
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mf_delivery_zones_updated', { detail: zones }));
  }
};

export const getLocalSettings = (): SiteSettings => {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...defaultSettings,
          ...parsed,
          paymentSettings: {
            ...defaultPaymentSettings,
            ...(parsed?.paymentSettings || {}),
            bkash: { ...defaultPaymentSettings.bkash, ...(parsed?.paymentSettings?.bkash || {}) },
            nagad: { ...defaultPaymentSettings.nagad, ...(parsed?.paymentSettings?.nagad || {}) },
            rocket: { ...defaultPaymentSettings.rocket, ...(parsed?.paymentSettings?.rocket || {}) },
          },
        };
      }
    }
  } catch {
    // ignore
  }
  return defaultSettings;
};

export const saveLocalSettings = (settings: SiteSettings) => {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mf_settings_updated', { detail: settings }));
  }
};

export const settingsService = {
  // Get Site Settings (Local-first & Firestore synchronized with timestamp merge)
  async getSettings(): Promise<SiteSettings> {
    const local = getLocalSettings();
    try {
      const snap = await getDoc(doc(db, 'settings', 'general'));
      if (snap.exists()) {
        const data = snap.data();
        const localTimestamp = (local as any)._lastUpdated || 0;
        const remoteTimestamp = data?.updatedAt?.toMillis ? data.updatedAt.toMillis() : (typeof data?.updatedAt === 'number' ? data.updatedAt : 0);

        // If local was updated more recently than remote, keep local values and push update
        if (localTimestamp > remoteTimestamp && localTimestamp > 0) {
          try {
            await setDoc(doc(db, 'settings', 'general'), sanitizeForFirestore({ ...local, updatedAt: serverTimestamp() }), { merge: true });
          } catch {
            // ignore
          }
          return local;
        }

        const currentPay = local.paymentSettings || defaultPaymentSettings;
        const merged = {
          ...local,
          ...data,
          paymentSettings: {
            ...currentPay,
            ...(data?.paymentSettings || {}),
            bkash: { ...(currentPay.bkash || defaultPaymentSettings.bkash), ...(data?.paymentSettings?.bkash || {}) },
            nagad: { ...(currentPay.nagad || defaultPaymentSettings.nagad), ...(data?.paymentSettings?.nagad || {}) },
            rocket: { ...(currentPay.rocket || defaultPaymentSettings.rocket), ...(data?.paymentSettings?.rocket || {}) },
          },
        } as SiteSettings;
        saveLocalSettings(merged);
        return merged;
      }
    } catch (e) {
      console.warn('Remote settings fetch notice (using local-first):', e);
    }
    return local;
  },

  // Update Site Settings (Local-first immediate update + remote save)
  async updateSettings(settings: Partial<SiteSettings>) {
    const current = getLocalSettings();
    const currentPay = current.paymentSettings || defaultPaymentSettings;
    const now = Date.now();
    const merged: SiteSettings = {
      ...current,
      ...settings,
      paymentSettings: {
        ...currentPay,
        ...(settings.paymentSettings || {}),
        bkash: { ...(currentPay.bkash || defaultPaymentSettings.bkash), ...(settings.paymentSettings?.bkash || {}) },
        nagad: { ...(currentPay.nagad || defaultPaymentSettings.nagad), ...(settings.paymentSettings?.nagad || {}) },
        rocket: { ...(currentPay.rocket || defaultPaymentSettings.rocket), ...(settings.paymentSettings?.rocket || {}) },
      },
      ...({ _lastUpdated: now } as any),
    };

    // 1. Immediately save to persistent local store and broadcast (0ms delay)
    saveLocalSettings(merged);

    // 2. Persist to Firestore
    try {
      const payload = sanitizeForFirestore({
        ...merged,
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'settings', 'general'), payload, { merge: true });
    } catch (e) {
      console.warn('Remote settings save notice (saved in local store):', e);
    }
  },

  // Realtime settings subscription
  subscribeToSettings(callback: (settings: SiteSettings) => void): Unsubscribe {
    // 1. Immediately emit local settings for 0ms page load
    callback(getLocalSettings());

    // 2. Listen to local update events
    const handleLocal = (e: any) => {
      callback((e.detail as SiteSettings) || getLocalSettings());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('mf_settings_updated', handleLocal);
    }

    // 3. Connect to Firestore realtime listener
    let firestoreUnsub: (() => void) | null = null;
    try {
      firestoreUnsub = onSnapshot(
        doc(db, 'settings', 'general'),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const local = getLocalSettings();
            const currentPay = local.paymentSettings || defaultPaymentSettings;
            const merged = {
              ...local,
              ...data,
              paymentSettings: {
                ...currentPay,
                ...(data?.paymentSettings || {}),
                bkash: { ...(currentPay.bkash || defaultPaymentSettings.bkash), ...(data?.paymentSettings?.bkash || {}) },
                nagad: { ...(currentPay.nagad || defaultPaymentSettings.nagad), ...(data?.paymentSettings?.nagad || {}) },
                rocket: { ...(currentPay.rocket || defaultPaymentSettings.rocket), ...(data?.paymentSettings?.rocket || {}) },
              },
            } as SiteSettings;
            saveLocalSettings(merged);
            callback(merged);
          }
        },
        (err) => {
          console.warn('Realtime settings remote notice (using local-first):', err);
        }
      );
    } catch (e) {
      console.warn('Settings subscription exception:', e);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mf_settings_updated', handleLocal);
      }
      if (firestoreUnsub) firestoreUnsub();
    };
  },

  // Realtime banners subscription
  subscribeToBanners(callback: (banners: Banner[]) => void): Unsubscribe {
    callback(this.getLocalBanners());

    const handleLocal = (e: any) => {
      callback((e.detail as Banner[]) || this.getLocalBanners());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('mf_banners_updated', handleLocal);
    }

    let firestoreUnsub: (() => void) | null = null;
    try {
      const q = query(collection(db, 'banners'), orderBy('sortOrder', 'asc'));
      firestoreUnsub = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            const list: Banner[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Banner));
            this.saveLocalBanners(list);
            callback(list);
          }
        },
        (err) => {
          console.warn('Realtime banners remote notice (using local-first):', err);
        }
      );
    } catch {
      // ignore
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mf_banners_updated', handleLocal);
      }
      if (firestoreUnsub) firestoreUnsub();
    };
  },

  getLocalBanners(): Banner[] {
    try {
      const raw = localStorage.getItem(LOCAL_BANNERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  },

  saveLocalBanners(list: Banner[]) {
    try {
      localStorage.setItem(LOCAL_BANNERS_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mf_banners_updated', { detail: list }));
    }
  },

  // Banners
  async getBanners(activeOnly = true): Promise<Banner[]> {
    const local = this.getLocalBanners();
    try {
      let q = query(collection(db, 'banners'), orderBy('sortOrder', 'asc'));
      if (activeOnly) {
        q = query(collection(db, 'banners'), where('active', '==', true), orderBy('sortOrder', 'asc'));
      }
      const snap = await getDocs(q);
      if (!snap.empty) {
        const list: Banner[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Banner));
        this.saveLocalBanners(list);
        return list;
      }
    } catch (e) {
      console.warn('Banners remote notice (using local-first):', e);
    }
    return activeOnly ? local.filter((b) => b.active) : local;
  },

  async createBanner(banner: Omit<Banner, 'id'>) {
    const newId = `banner-${Date.now().toString(36)}`;
    const newBanner: Banner = { ...banner, id: newId };
    const current = this.getLocalBanners();
    this.saveLocalBanners([...current, newBanner]);

    try {
      const payload = sanitizeForFirestore({
        ...banner,
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'banners'), payload);
    } catch (e) {
      console.warn('Remote banner save notice (saved in local store):', e);
    }
    return newId;
  },

  async updateBanner(id: string, banner: Partial<Banner>) {
    const current = this.getLocalBanners();
    const updated = current.map((b) => (b.id === id ? { ...b, ...banner } : b));
    this.saveLocalBanners(updated);

    try {
      const payload = sanitizeForFirestore({
        ...banner,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'banners', id), payload);
    } catch (e) {
      console.warn('Remote banner update notice (saved in local store):', e);
    }
  },

  async deleteBanner(id: string) {
    const current = this.getLocalBanners();
    this.saveLocalBanners(current.filter((b) => b.id !== id));

    try {
      await deleteDoc(doc(db, 'banners', id));
    } catch (e) {
      console.warn('Remote banner delete notice (removed from local store):', e);
    }
  },

  // Coupons
  getLocalCoupons(): Coupon[] {
    try {
      const raw = localStorage.getItem(LOCAL_COUPONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  },

  saveLocalCoupons(list: Coupon[]) {
    try {
      localStorage.setItem(LOCAL_COUPONS_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mf_coupons_updated', { detail: list }));
    }
  },

  async getCoupons(): Promise<Coupon[]> {
    const local = this.getLocalCoupons();
    try {
      const snap = await getDocs(collection(db, 'coupons'));
      if (!snap.empty) {
        const list: Coupon[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Coupon));
        this.saveLocalCoupons(list);
        return list;
      }
    } catch {
      // ignore
    }
    return local;
  },

  async createCoupon(coupon: Omit<Coupon, 'id' | 'usedCount'>) {
    const newId = `cpn-${coupon.code.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const newCoupon: Coupon = {
      ...coupon,
      id: newId,
      code: coupon.code.toUpperCase().trim(),
      usedCount: 0,
    };
    const current = this.getLocalCoupons();
    this.saveLocalCoupons([newCoupon, ...current]);

    try {
      const payload = sanitizeForFirestore({
        ...coupon,
        code: coupon.code.toUpperCase().trim(),
        usedCount: 0,
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'coupons'), payload);
    } catch (e) {
      console.warn('Remote coupon save notice (saved in local store):', e);
    }
    return newId;
  },

  async updateCoupon(id: string, coupon: Partial<Coupon>) {
    const current = this.getLocalCoupons();
    const updated = current.map((c) => (c.id === id ? { ...c, ...coupon } : c));
    this.saveLocalCoupons(updated);

    try {
      const payload = sanitizeForFirestore({
        ...coupon,
        ...(coupon.code ? { code: coupon.code.toUpperCase().trim() } : {}),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'coupons', id), payload);
    } catch (e) {
      console.warn('Remote coupon update notice (saved in local store):', e);
    }
  },

  async deleteCoupon(id: string) {
    const current = this.getLocalCoupons();
    this.saveLocalCoupons(current.filter((c) => c.id !== id));

    try {
      await deleteDoc(doc(db, 'coupons', id));
    } catch (e) {
      console.warn('Remote coupon delete notice (removed from local store):', e);
    }
  },

  // Delivery Zones (Local-first & Firestore resilient)
  async getDeliveryZones(): Promise<DeliveryZone[]> {
    const local = getLocalDeliveryZones();
    try {
      const snap = await getDocs(collection(db, 'deliveryZones'));
      if (!snap.empty) {
        const remoteList: DeliveryZone[] = [];
        snap.forEach((d) => remoteList.push({ id: d.id, ...d.data() } as DeliveryZone));

        // Intelligent merge: local updates take precedence if newer or equal
        const mergedMap = new Map<string, DeliveryZone>();
        remoteList.forEach((rz) => mergedMap.set(rz.id, rz));
        local.forEach((lz) => {
          const rz = mergedMap.get(lz.id);
          if (!rz) {
            mergedMap.set(lz.id, lz);
          } else {
            const lTime = typeof (lz as any).updatedAt === 'number' ? (lz as any).updatedAt : 0;
            const rTime = (rz as any).updatedAt?.toMillis ? (rz as any).updatedAt.toMillis() : (typeof (rz as any).updatedAt === 'number' ? (rz as any).updatedAt : 0);
            if (lTime >= rTime || !rTime) {
              mergedMap.set(lz.id, { ...rz, ...lz });
            }
          }
        });
        const finalZones = Array.from(mergedMap.values());
        if (finalZones.length > 0) {
          saveLocalDeliveryZones(finalZones);
          return finalZones;
        }
      }
    } catch (e) {
      console.warn('Delivery zones remote notice (using local-first):', e);
    }
    return local;
  },

  async saveDeliveryZone(zone: Omit<DeliveryZone, 'id'>, id?: string) {
    const targetId =
      id ||
      (zone.name.toLowerCase().includes('outside')
        ? 'outside-dhaka'
        : zone.name.toLowerCase().includes('dhaka')
        ? 'dhaka'
        : `zone-${Date.now()}`);

    const now = Date.now();
    const newZone: DeliveryZone = {
      ...zone,
      id: targetId,
      ...({ updatedAt: now } as any),
    };

    // 1. Immediately update local storage and notify all listeners (0ms delay)
    const current = getLocalDeliveryZones();
    const idx = current.findIndex((z) => z.id === targetId);
    let updated: DeliveryZone[];
    if (idx >= 0) {
      updated = [...current];
      updated[idx] = newZone;
    } else {
      updated = [...current, newZone];
    }
    saveLocalDeliveryZones(updated);

    // 2. Persist to Firestore
    try {
      const payload = sanitizeForFirestore({ ...zone, id: targetId, updatedAt: serverTimestamp() });
      await setDoc(doc(db, 'deliveryZones', targetId), payload, { merge: true });
    } catch (e) {
      console.warn('Remote delivery zone save notice (saved in local store):', e);
    }

    return targetId;
  },

  async deleteDeliveryZone(id: string) {
    const current = getLocalDeliveryZones();
    const updated = current.filter((z) => z.id !== id);
    saveLocalDeliveryZones(updated);

    try {
      await deleteDoc(doc(db, 'deliveryZones', id));
    } catch (e) {
      console.warn('Remote delivery zone delete notice (deleted from local store):', e);
    }
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
