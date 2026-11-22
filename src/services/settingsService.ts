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
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Banner, Coupon, DeliveryZone, Review, SiteSettings, AuditLog, PaymentSettings } from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';
import { safeSetLocalStorage } from '../utils/safeStorage';
import { isFirestoreWriteBackedOff, markFirestoreWriteError } from '../lib/firestoreWriteGuard';

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
  storeName: 'Selvee',
  storeDescription: 'Premium clothing brand specializing in curated menswear, shirts, panjabi, and contemporary attire.',
  phone: '+880 1700-000000',
  email: 'mensfabricofficial@gmail.com',
  address: 'Dhaka, Bangladesh',
  whatsapp: '+8801700000000',
  facebookUrl: 'https://facebook.com',
  instagramUrl: 'https://instagram.com',
  youtubeUrl: '',
  tiktokUrl: '',
  xUrl: '',
  announcementText: 'Welcome to Selvee — Save 5% on online payment!',
  announcementActive: true,
  freeDeliveryThreshold: 2500,
  paymentSettings: defaultPaymentSettings,
};

const normalizeBrandText = (val: string | undefined, fallback = ''): string => {
  if (!val) return fallback;
  return val.replace(/men'?s\s*fabric/gi, 'Selvee');
};

const LOCAL_SETTINGS_KEY = 'selvee_site_settings_v3';
const LOCAL_DELIVERY_ZONES_KEY = 'selvee_delivery_zones_v3';
const LOCAL_BANNERS_KEY = 'selvee_banners_catalog_v3';
const LOCAL_COUPONS_KEY = 'selvee_coupons_catalog_v3';
const LOCAL_CONSUMED_COUPONS_KEY = 'mf_consumed_coupons_v1';

export const getConsumedCouponSet = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(LOCAL_CONSUMED_COUPONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map((v) => String(v).trim().toUpperCase()).filter(Boolean));
      }
    }
  } catch {
    // ignore
  }
  return new Set();
};

export const addConsumedCouponTokens = (tokens: (string | undefined | null)[]) => {
  if (typeof window === 'undefined') return;
  try {
    const set = getConsumedCouponSet();
    tokens.forEach((t) => {
      if (t && t.trim()) {
        set.add(t.trim().toUpperCase());
      }
    });
    localStorage.setItem(LOCAL_CONSUMED_COUPONS_KEY, JSON.stringify(Array.from(set).slice(-300)));
  } catch {
    // ignore
  }
};

// Purge legacy MEN'S FABRIC localStorage caches so old demo items never load
if (typeof window !== 'undefined') {
  try {
    ['mf_site_settings_v2', 'mf_delivery_zones_v2', 'mf_banners_catalog_v2', 'mf_coupons_catalog_v2'].forEach((k) => {
      if (localStorage.getItem(k)) localStorage.removeItem(k);
    });
  } catch {
    // ignore
  }
}

export const sortDeliveryZones = (zones: DeliveryZone[]): DeliveryZone[] => {
  return [...zones].sort((a, b) => {
    const aInside = a.id === 'dhaka' || a.name.toLowerCase().includes('inside');
    const bInside = b.id === 'dhaka' || b.name.toLowerCase().includes('inside');
    if (aInside && !bInside) return -1;
    if (!aInside && bInside) return 1;
    const aOutside = a.id === 'outside-dhaka' || a.name.toLowerCase().includes('outside');
    const bOutside = b.id === 'outside-dhaka' || b.name.toLowerCase().includes('outside');
    if (aOutside && !bOutside) return -1;
    if (!aOutside && bOutside) return 1;
    return 0;
  });
};

const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  { id: 'dhaka', name: 'Inside Dhaka City', charge: 70, estimatedDays: '1 - 2 Days', active: true },
  { id: 'outside-dhaka', name: 'Outside Dhaka (Nationwide)', charge: 130, estimatedDays: '2 - 4 Days', active: true },
];

// Shared singleton live state (never emits stale localStorage before Firestore onSnapshot)
let liveSettings: SiteSettings | null = null;
let liveDeliveryZones: DeliveryZone[] | null = null;
let liveAllBanners: Banner[] | null = null;
let liveCoupons: Coupon[] | null = null;
let liveReviewsAdmin: Review[] | null = null;
let liveAuditLogs: AuditLog[] | null = null;

const settingsListeners = new Set<(s: SiteSettings) => void>();
const deliveryZonesListeners = new Set<(z: DeliveryZone[]) => void>();
const bannersListeners = new Set<(b: Banner[]) => void>();
const couponsListeners = new Set<(c: Coupon[]) => void>();
const reviewsAdminListeners = new Set<(r: Review[]) => void>();
const auditLogsListeners = new Set<(l: AuditLog[]) => void>();

let sharedSettingsUnsub: Unsubscribe | null = null;
let sharedDeliveryZonesUnsub: Unsubscribe | null = null;
let sharedBannersUnsub: Unsubscribe | null = null;
let sharedCouponsUnsub: Unsubscribe | null = null;
let sharedReviewsAdminUnsub: Unsubscribe | null = null;
let sharedAuditLogsUnsub: Unsubscribe | null = null;

export const getLocalDeliveryZones = (): DeliveryZone[] => {
  if (liveDeliveryZones !== null) return liveDeliveryZones;
  try {
    const raw = localStorage.getItem(LOCAL_DELIVERY_ZONES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return sortDeliveryZones(parsed);
    }
  } catch {
    // ignore
  }
  return sortDeliveryZones(DEFAULT_DELIVERY_ZONES);
};

export const saveLocalDeliveryZones = (zones: DeliveryZone[]) => {
  const sorted = sortDeliveryZones(zones);
  liveDeliveryZones = sorted;
  deliveryZonesListeners.forEach((cb) => cb(sorted));
  safeSetLocalStorage(LOCAL_DELIVERY_ZONES_KEY, sorted, { maxChars: 120_000 });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mf_delivery_zones_updated', { detail: sorted }));
  }
};

export const getLocalSettings = (): SiteSettings => {
  if (liveSettings !== null) return liveSettings;
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
  liveSettings = settings;
  settingsListeners.forEach((cb) => cb(settings));
  safeSetLocalStorage(LOCAL_SETTINGS_KEY, settings, {
    stripInlineData: true,
    maxChars: 200_000,
  });
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
        const currentPay = local.paymentSettings || defaultPaymentSettings;
        const merged = {
          ...local,
          ...data,
          storeName: normalizeBrandText(data?.storeName, defaultSettings.storeName),
          announcementText: normalizeBrandText(data?.announcementText, defaultSettings.announcementText),
          storeDescription: normalizeBrandText(data?.storeDescription, defaultSettings.storeDescription),
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

  // Instant accessors returning hydrated live memory (never stale localStorage)
  getInstantSettings(): SiteSettings | null {
    return liveSettings;
  },

  getInstantBanners(activeOnly = true): Banner[] {
    const list = liveAllBanners ?? [];
    return activeOnly ? list.filter((b) => b.active) : list;
  },

  getInstantCoupons(): Coupon[] {
    return liveCoupons ?? [];
  },

  getInstantDeliveryZones(): DeliveryZone[] {
    return liveDeliveryZones ?? sortDeliveryZones(DEFAULT_DELIVERY_ZONES);
  },

  // Realtime settings subscription (shared Firestore persistentLocalCache stream)
  subscribeToSettings(callback: (settings: SiteSettings) => void): Unsubscribe {
    settingsListeners.add(callback);
    if (liveSettings !== null) {
      callback(liveSettings);
    }

    if (!sharedSettingsUnsub) {
      try {
        sharedSettingsUnsub = onSnapshot(
          doc(db, 'settings', 'general'),
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const merged = {
                ...defaultSettings,
                ...data,
                storeName: normalizeBrandText(data?.storeName, defaultSettings.storeName),
                announcementText: normalizeBrandText(data?.announcementText, defaultSettings.announcementText),
                storeDescription: normalizeBrandText(data?.storeDescription, defaultSettings.storeDescription),
                paymentSettings: {
                  ...defaultPaymentSettings,
                  ...(data?.paymentSettings || {}),
                  bkash: { ...defaultPaymentSettings.bkash, ...(data?.paymentSettings?.bkash || {}) },
                  nagad: { ...defaultPaymentSettings.nagad, ...(data?.paymentSettings?.nagad || {}) },
                  rocket: { ...defaultPaymentSettings.rocket, ...(data?.paymentSettings?.rocket || {}) },
                },
              } as SiteSettings;
              liveSettings = merged;
              safeSetLocalStorage(LOCAL_SETTINGS_KEY, merged, {
                stripInlineData: true,
                maxChars: 200_000,
              });
              settingsListeners.forEach((cb) => cb(merged));
            } else if (liveSettings === null) {
              liveSettings = defaultSettings;
              settingsListeners.forEach((cb) => cb(defaultSettings));
            }
          },
          (err) => {
            console.warn('Realtime settings remote notice (using fallback):', err);
            if (liveSettings === null) {
              const fallback = getLocalSettings();
              liveSettings = fallback;
              settingsListeners.forEach((cb) => cb(fallback));
            }
          }
        );
      } catch (e) {
        console.warn('Settings subscription exception:', e);
      }
    }

    return () => {
      settingsListeners.delete(callback);
    };
  },

  // Realtime banners subscription (shared single listener, no prefetch or stale localStorage race)
  subscribeToBanners(callback: (banners: Banner[]) => void, activeOnly = true): Unsubscribe {
    const wrapped = (all: Banner[]) => callback(activeOnly ? all.filter((b) => b.active) : all);
    bannersListeners.add(wrapped);
    if (liveAllBanners !== null) {
      wrapped(liveAllBanners);
    }

    if (!sharedBannersUnsub) {
      try {
        sharedBannersUnsub = onSnapshot(
          collection(db, 'banners'),
          (snap) => {
            const list: Banner[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Banner));
            list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            liveAllBanners = list;
            safeSetLocalStorage(LOCAL_BANNERS_KEY, list, {
              stripInlineData: true,
              maxChars: 200_000,
            });
            bannersListeners.forEach((cb) => cb(list));
          },
          (err) => {
            console.warn('Realtime banners remote notice:', err);
            if (liveAllBanners === null) {
              const fallback = this.getLocalBanners();
              liveAllBanners = fallback;
              bannersListeners.forEach((cb) => cb(fallback));
            }
          }
        );
      } catch {
        // ignore
      }
    }

    return () => {
      bannersListeners.delete(wrapped);
    };
  },

  getLocalBanners(): Banner[] {
    if (liveAllBanners !== null) return liveAllBanners;
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
    liveAllBanners = list;
    bannersListeners.forEach((cb) => cb(list));
    safeSetLocalStorage(LOCAL_BANNERS_KEY, list, {
      stripInlineData: true,
      maxChars: 200_000,
    });
  },

  // Banners
  async getBanners(activeOnly = true): Promise<Banner[]> {
    const local = this.getLocalBanners();
    try {
      let q = activeOnly
        ? query(collection(db, 'banners'), where('active', '==', true))
        : collection(db, 'banners');
      const snap = await getDocs(q);
      if (!snap.empty) {
        const list: Banner[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Banner));
        list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
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
        id: newId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'banners', newId), payload, { merge: true });
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
      await setDoc(doc(db, 'banners', id), payload, { merge: true });
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
  normalizeCouponState(coupon: Coupon, consumedSet = getConsumedCouponSet()): Coupon {
    const idUpper = (coupon.id || '').trim().toUpperCase();
    const codeUpper = (coupon.code || '').trim().toUpperCase();
    const isConsumed =
      (idUpper && consumedSet.has(idUpper)) || (codeUpper && consumedSet.has(codeUpper));
    const effectiveLimit =
      coupon.discountType === 'free_delivery'
        ? coupon.usageLimit || 1
        : coupon.usageLimit || 0;
    const reachedLimit = Boolean(effectiveLimit > 0 && (coupon.usedCount || 0) >= effectiveLimit);
    if (isConsumed || reachedLimit) {
      return {
        ...coupon,
        usedCount: Math.max(coupon.usedCount || 0, effectiveLimit || 1),
        active: false,
      };
    }
    return coupon;
  },

  getLocalCoupons(): Coupon[] {
    if (liveCoupons !== null) return liveCoupons;
    try {
      const raw = localStorage.getItem(LOCAL_COUPONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const consumed = getConsumedCouponSet();
          return parsed.map((c) => this.normalizeCouponState(c, consumed));
        }
      }
    } catch {
      // ignore
    }
    return [];
  },

  saveLocalCoupons(list: Coupon[]) {
    const consumed = getConsumedCouponSet();
    const normalized = list.map((c) => this.normalizeCouponState(c, consumed));
    liveCoupons = normalized;
    couponsListeners.forEach((cb) => cb(normalized));
    safeSetLocalStorage(LOCAL_COUPONS_KEY, normalized, { maxChars: 150_000 });
  },

  subscribeToCoupons(callback: (coupons: Coupon[]) => void): Unsubscribe {
    couponsListeners.add(callback);
    if (liveCoupons !== null) {
      callback(liveCoupons);
    }

    if (!sharedCouponsUnsub) {
      try {
        sharedCouponsUnsub = onSnapshot(
          collection(db, 'coupons'),
          (snap) => {
            const consumed = getConsumedCouponSet();
            const remoteList: Coupon[] = [];
            snap.forEach((d) =>
              remoteList.push(this.normalizeCouponState({ id: d.id, ...d.data() } as Coupon, consumed))
            );
            liveCoupons = remoteList;
            safeSetLocalStorage(LOCAL_COUPONS_KEY, remoteList, { maxChars: 150_000 });
            couponsListeners.forEach((cb) => cb(remoteList));
          },
          () => {
            if (liveCoupons === null) {
              const fallback = this.getLocalCoupons();
              liveCoupons = fallback;
              couponsListeners.forEach((cb) => cb(fallback));
            }
          }
        );
      } catch {
        // ignore
      }
    }

    return () => {
      couponsListeners.delete(callback);
    };
  },

  async getCoupons(): Promise<Coupon[]> {
    const local = this.getLocalCoupons();
    const consumed = getConsumedCouponSet();
    try {
      const snap = await getDocs(collection(db, 'coupons'));
      const remoteList: Coupon[] = [];
      snap.forEach((d) => remoteList.push({ id: d.id, ...d.data() } as Coupon));

      const mergedMap = new Map<string, Coupon>();
      remoteList.forEach((c) => mergedMap.set(c.id, this.normalizeCouponState(c, consumed)));
      local.forEach((c) => {
        if (!mergedMap.has(c.id)) {
          mergedMap.set(c.id, this.normalizeCouponState(c, consumed));
        } else {
          const remoteItem = mergedMap.get(c.id)!;
          const maxUsed = Math.max(remoteItem.usedCount || 0, c.usedCount || 0);
          const effLimit =
            (remoteItem.discountType || c.discountType) === 'free_delivery'
              ? remoteItem.usageLimit || c.usageLimit || 1
              : remoteItem.usageLimit || c.usageLimit || 0;
          const reachedLimit = Boolean(effLimit > 0 && maxUsed >= effLimit);
          mergedMap.set(
            c.id,
            this.normalizeCouponState(
              {
                ...c,
                ...remoteItem,
                usedCount: maxUsed,
                active: reachedLimit ? false : remoteItem.active && c.active,
              },
              consumed
            )
          );
        }
      });
      const combined = Array.from(mergedMap.values());
      this.saveLocalCoupons(combined);
      return combined;
    } catch {
      // ignore
    }
    return local;
  },

  doesCouponMatchCustomer(
    coupon: Coupon,
    user?: { uid?: string; email?: string | null; phone?: string | null }
  ): boolean {
    const targetUid = coupon.targetCustomerUid && !coupon.targetCustomerUid.startsWith('guest-')
      ? coupon.targetCustomerUid.trim()
      : '';
    const targetEmail = coupon.targetCustomerEmail?.trim().toLowerCase() || '';
    const targetPhoneDigits = coupon.targetCustomerPhone
      ? coupon.targetCustomerPhone.replace(/[^0-9]/g, '').slice(-10)
      : '';

    // Public coupon (no user restriction)
    if (!targetUid && !targetEmail && !targetPhoneDigits) {
      return true;
    }

    if (!user) return false;

    const userUid = user.uid && user.uid !== 'guest' ? user.uid.trim() : '';
    const userEmail = user.email?.trim().toLowerCase() || '';
    const userPhoneDigits = user.phone ? user.phone.replace(/[^0-9]/g, '').slice(-10) : '';

    if (targetUid && userUid && targetUid === userUid) return true;
    if (targetEmail && userEmail && targetEmail === userEmail) return true;
    if (targetPhoneDigits && targetPhoneDigits.length >= 10 && userPhoneDigits === targetPhoneDigits) {
      return true;
    }

    return false;
  },

  isCouponValidForUse(coupon: Coupon, extraConsumed?: Set<string>): boolean {
    if (!coupon || !coupon.active) return false;
    const consumed = getConsumedCouponSet();
    const idUpper = (coupon.id || '').trim().toUpperCase();
    const codeUpper = (coupon.code || '').trim().toUpperCase();
    if (
      (idUpper && (consumed.has(idUpper) || extraConsumed?.has(idUpper))) ||
      (codeUpper && (consumed.has(codeUpper) || extraConsumed?.has(codeUpper)))
    ) {
      return false;
    }
    if (coupon.expiryDate) {
      const exp = coupon.expiryDate.includes('T')
        ? new Date(coupon.expiryDate)
        : new Date(`${coupon.expiryDate}T23:59:59`);
      if (!isNaN(exp.getTime()) && exp < new Date()) return false;
    }
    const effectiveLimit =
      coupon.discountType === 'free_delivery' ? coupon.usageLimit || 1 : coupon.usageLimit;
    if (effectiveLimit && (coupon.usedCount || 0) >= effectiveLimit) {
      return false;
    }
    return true;
  },

  getActiveFreeDeliveryForUser(
    coupons: Coupon[],
    user?: { uid?: string; email?: string | null; phone?: string | null },
    extraConsumed?: Set<string>
  ): Coupon | null {
    if (!user) return null;
    for (const c of coupons) {
      if (c.discountType !== 'free_delivery') continue;
      if (c.autoApply === false) continue;
      const hasTarget = Boolean(
        (c.targetCustomerUid && !c.targetCustomerUid.startsWith('guest-')) ||
        c.targetCustomerEmail ||
        c.targetCustomerPhone
      );
      if (!hasTarget) continue;
      if (this.isCouponValidForUse(c, extraConsumed) && this.doesCouponMatchCustomer(c, user)) {
        return c;
      }
    }
    return null;
  },

  async markCouponUsed(couponIdOrCode: string, syncLocalOnly = false, customerUid?: string) {
    if (!couponIdOrCode || !couponIdOrCode.trim()) return;
    const rawNeedle = couponIdOrCode.trim();
    const needle = rawNeedle.toUpperCase();
    const current = this.getLocalCoupons();
    const matchedCoupon = current.find(
      (c) => c.id === rawNeedle || c.id.toUpperCase() === needle || c.code.toUpperCase() === needle
    );
    let nextUsedCount = 1;
    let shouldDeactivate = false;

    const updated = current.map((c) => {
      if (matchedCoupon && c.id === matchedCoupon.id) {
        const effectiveLimit =
          c.discountType === 'free_delivery' ? c.usageLimit || 1 : c.usageLimit;
        nextUsedCount = Math.max((c.usedCount || 0) + 1, effectiveLimit || 1);
        shouldDeactivate = Boolean(
          (effectiveLimit && nextUsedCount >= effectiveLimit) ||
          c.discountType === 'free_delivery'
        );
        return {
          ...c,
          usedCount: nextUsedCount,
          ...(shouldDeactivate ? { active: false } : {}),
        };
      }
      return c;
    });

    const tokensToRecord = [
      rawNeedle,
      needle,
      matchedCoupon?.id,
      matchedCoupon?.code,
    ].filter(Boolean) as string[];

    // Only permanently blacklist in local consumed set if it's a 1-time / free_delivery coupon or reached its limit
    if (shouldDeactivate || !matchedCoupon || matchedCoupon.discountType === 'free_delivery' || (matchedCoupon.usageLimit || 0) <= 1) {
      addConsumedCouponTokens(tokensToRecord);
    }

    if (matchedCoupon) {
      this.saveLocalCoupons(updated);
    }

    if (syncLocalOnly) return;

    // Persist coupon update to Firestore (both by doc ID and by code query as backup)
    if (matchedCoupon) {
      try {
        await setDoc(
          doc(db, 'coupons', matchedCoupon.id),
          {
            usedCount: nextUsedCount,
            ...(shouldDeactivate ? { active: false } : {}),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('Remote markCouponUsed notice:', e);
      }
    } else {
      try {
        const directSnap = await getDoc(doc(db, 'coupons', rawNeedle));
        if (directSnap.exists()) {
          const data = directSnap.data() as Coupon;
          const effLimit = data.discountType === 'free_delivery' ? data.usageLimit || 1 : data.usageLimit;
          const used = Math.max((data.usedCount || 0) + 1, effLimit || 1);
          const deactivate = Boolean((effLimit && used >= effLimit) || data.discountType === 'free_delivery');
          await setDoc(
            doc(db, 'coupons', directSnap.id),
            {
              usedCount: used,
              ...(deactivate ? { active: false } : {}),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          const q = query(collection(db, 'coupons'), where('code', '==', needle), limit(5));
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            const data = d.data() as Coupon;
            const effLimit = data.discountType === 'free_delivery' ? data.usageLimit || 1 : data.usageLimit;
            const used = Math.max((data.usedCount || 0) + 1, effLimit || 1);
            const deactivate = Boolean((effLimit && used >= effLimit) || data.discountType === 'free_delivery');
            await setDoc(
              doc(db, 'coupons', d.id),
              {
                usedCount: used,
                ...(deactivate ? { active: false } : {}),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }
        }
      } catch {
        // ignore
      }
    }

    // Also record consumed tokens on customer's Firestore profile for cross-device permanence
    if (customerUid && customerUid !== 'guest') {
      const upperTokens = Array.from(
        new Set(tokensToRecord.map((t) => t.trim().toUpperCase()).filter(Boolean))
      );
      if (upperTokens.length > 0) {
        try {
          await setDoc(
            doc(db, 'users', customerUid),
            {
              consumedCoupons: arrayUnion(...upperTokens),
            },
            { merge: true }
          );
        } catch {
          // ignore
        }
      }
    }
  },

  async createCoupon(coupon: Omit<Coupon, 'id' | 'usedCount'>) {
    const cleanCode = coupon.code.toUpperCase().trim();
    const slug = cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'cpn';
    const newId = `cpn-${slug}-${Date.now().toString(36)}`;
    const newCoupon: Coupon = {
      ...coupon,
      id: newId,
      code: cleanCode,
      usedCount: 0,
    };
    const current = this.getLocalCoupons();
    const updated = [newCoupon, ...current.filter((c) => c.id !== newId && c.code !== cleanCode)];
    this.saveLocalCoupons(updated);

    try {
      const payload = sanitizeForFirestore({
        ...coupon,
        id: newId,
        code: cleanCode,
        usedCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'coupons', newId), payload, { merge: true });
    } catch (e) {
      console.warn('Remote coupon save notice (saved in local store):', e);
    }
    return newId;
  },

  async updateCoupon(id: string, coupon: Partial<Coupon>) {
    const current = this.getLocalCoupons();
    const cleanCode = coupon.code ? coupon.code.toUpperCase().trim() : undefined;
    const updated = current.map((c) =>
      c.id === id ? { ...c, ...coupon, ...(cleanCode ? { code: cleanCode } : {}) } : c
    );
    this.saveLocalCoupons(updated);

    try {
      const payload = sanitizeForFirestore({
        ...coupon,
        ...(cleanCode ? { code: cleanCode } : {}),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'coupons', id), payload, { merge: true });
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
        const finalZones = sortDeliveryZones(Array.from(mergedMap.values()));
        if (finalZones.length > 0) {
          saveLocalDeliveryZones(finalZones);
          return finalZones;
        }
      }
    } catch (e) {
      console.warn('Delivery zones remote notice (using local-first):', e);
    }
    return sortDeliveryZones(local);
  },

  subscribeToDeliveryZones(callback: (zones: DeliveryZone[]) => void): Unsubscribe {
    deliveryZonesListeners.add(callback);
    if (liveDeliveryZones !== null) {
      callback(liveDeliveryZones);
    }

    if (!sharedDeliveryZonesUnsub) {
      try {
        sharedDeliveryZonesUnsub = onSnapshot(
          collection(db, 'deliveryZones'),
          (snap) => {
            const remoteList: DeliveryZone[] = [];
            snap.forEach((d) => remoteList.push({ id: d.id, ...d.data() } as DeliveryZone));
            const sorted = sortDeliveryZones(
              remoteList.length > 0 ? remoteList : DEFAULT_DELIVERY_ZONES
            );
            liveDeliveryZones = sorted;
            safeSetLocalStorage(LOCAL_DELIVERY_ZONES_KEY, sorted, { maxChars: 120_000 });
            deliveryZonesListeners.forEach((cb) => cb(sorted));
          },
          () => {
            if (liveDeliveryZones === null) {
              const fallback = getLocalDeliveryZones();
              liveDeliveryZones = fallback;
              deliveryZonesListeners.forEach((cb) => cb(fallback));
            }
          }
        );
      } catch {
        // ignore
      }
    }

    return () => {
      deliveryZonesListeners.delete(callback);
    };
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
    if (!productId) return [];
    const getMillis = (val: any): number => {
      if (!val) return 0;
      if (typeof val.toMillis === 'function') return val.toMillis();
      if (typeof val.seconds === 'number') return val.seconds * 1000;
      if (typeof val === 'number') return val;
      const parsed = Date.parse(String(val));
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    try {
      const q = query(
        collection(db, 'reviews'),
        where('productId', '==', productId)
      );
      const snap = await getDocs(q);
      const list: Review[] = [];
      snap.forEach((d) => {
        const data = d.data() as Omit<Review, 'id'>;
        if (data.approved === true) {
          list.push({ id: d.id, ...data } as Review);
        }
      });
      return list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
    } catch (err) {
      console.warn('Could not load product reviews:', err);
      return [];
    }
  },

  subscribeToProductReviews(productId: string, onUpdate: (reviews: Review[]) => void): Unsubscribe {
    if (!productId) {
      onUpdate([]);
      return () => {};
    }

    const getMillis = (val: any): number => {
      if (!val) return 0;
      if (typeof val.toMillis === 'function') return val.toMillis();
      if (typeof val.seconds === 'number') return val.seconds * 1000;
      if (typeof val === 'number') return val;
      const parsed = Date.parse(String(val));
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    const q = query(
      collection(db, 'reviews'),
      where('productId', '==', productId)
    );

    return onSnapshot(
      q,
      (snap) => {
        const list: Review[] = [];
        snap.forEach((d) => {
          const data = d.data() as Omit<Review, 'id'>;
          if (data.approved === true) {
            list.push({ id: d.id, ...data } as Review);
          }
        });
        list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        onUpdate(list);
      },
      async (err) => {
        console.warn('Real-time reviews listener notice, falling back to one-time fetch:', err);
        const fallback = await this.getProductReviews(productId);
        onUpdate(fallback);
      }
    );
  },

  async getAllReviewsAdmin(): Promise<Review[]> {
    const getMillis = (val: any): number => {
      if (!val) return 0;
      if (typeof val.toMillis === 'function') return val.toMillis();
      if (typeof val.seconds === 'number') return val.seconds * 1000;
      if (typeof val === 'number') return val;
      const parsed = Date.parse(String(val));
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    try {
      const snap = await getDocs(collection(db, 'reviews'));
      const list: Review[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Review));
      return list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
    } catch (err) {
      console.warn('Could not load admin reviews:', err);
      return [];
    }
  },

  subscribeToReviewsAdmin(onUpdate: (reviews: Review[]) => void): Unsubscribe {
    const getMillis = (val: any): number => {
      if (!val) return 0;
      if (typeof val.toMillis === 'function') return val.toMillis();
      if (typeof val.seconds === 'number') return val.seconds * 1000;
      if (typeof val === 'number') return val;
      const parsed = Date.parse(String(val));
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    reviewsAdminListeners.add(onUpdate);
    if (liveReviewsAdmin !== null) {
      onUpdate(liveReviewsAdmin);
    }

    if (!sharedReviewsAdminUnsub) {
      try {
        sharedReviewsAdminUnsub = onSnapshot(
          collection(db, 'reviews'),
          (snap) => {
            const list: Review[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Review));
            list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
            liveReviewsAdmin = list;
            reviewsAdminListeners.forEach((cb) => cb(list));
          },
          () => {
            if (liveReviewsAdmin === null) {
              liveReviewsAdmin = [];
              reviewsAdminListeners.forEach((cb) => cb([]));
            }
          }
        );
      } catch {
        // ignore
      }
    }

    return () => {
      reviewsAdminListeners.delete(onUpdate);
    };
  },

  async submitReview(review: Omit<Review, 'id' | 'createdAt' | 'approved'>) {
    await addDoc(
      collection(db, 'reviews'),
      sanitizeForFirestore({
        ...review,
        approved: false, // Requires admin approval
        createdAt: serverTimestamp(),
      })
    );
  },

  async updateReviewApproval(id: string, approved: boolean) {
    await updateDoc(doc(db, 'reviews', id), { approved });
  },

  async deleteReview(id: string) {
    await deleteDoc(doc(db, 'reviews', id));
  },

  // Audit Logs
  async logAdminAction(
    adminUid: string,
    adminEmail: string,
    action: string,
    target: string,
    details?: string,
    meta?: { entityType?: string; beforeValue?: string; afterValue?: string }
  ) {
    if (isFirestoreWriteBackedOff()) return;
    try {
      await addDoc(
        collection(db, 'auditLogs'),
        sanitizeForFirestore({
          adminUid,
          adminEmail,
          action,
          target,
          entityType: meta?.entityType || undefined,
          beforeValue: meta?.beforeValue || undefined,
          afterValue: meta?.afterValue || undefined,
          details: details || '',
          timestamp: serverTimestamp(),
        })
      );
    } catch (err) {
      markFirestoreWriteError(err);
    }
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    try {
      const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(150));
      const snap = await getDocs(q);
      const list: AuditLog[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AuditLog));
      return list;
    } catch {
      return [];
    }
  },

  subscribeToAuditLogs(onUpdate: (logs: AuditLog[]) => void): Unsubscribe {
    auditLogsListeners.add(onUpdate);
    if (liveAuditLogs !== null) {
      onUpdate(liveAuditLogs);
    }

    if (!sharedAuditLogsUnsub) {
      try {
        const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(150));
        sharedAuditLogsUnsub = onSnapshot(
          q,
          (snap) => {
            const list: AuditLog[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AuditLog));
            liveAuditLogs = list;
            auditLogsListeners.forEach((cb) => cb(list));
          },
          () => {
            if (liveAuditLogs === null) {
              liveAuditLogs = [];
              auditLogsListeners.forEach((cb) => cb([]));
            }
          }
        );
      } catch {
        // ignore
      }
    }

    return () => {
      auditLogsListeners.delete(onUpdate);
    };
  },
};
