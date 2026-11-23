import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Unsubscribe,
  getDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppNotification, NotificationType, OrderStatus, PaymentStatus } from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';
import { isFirestoreWriteBackedOff, markFirestoreWriteError } from '../lib/firestoreWriteGuard';

const LOCAL_NOTIFS_KEY = 'selvee_notifications_cache_v1';
const LOCAL_READ_KEY = 'selvee_read_notifs_v1';
const LOCAL_PUSHED_KEY = 'selvee_pushed_notifs_v1';
const LOCAL_MUTED_KEY = 'selvee_notif_muted_v1';
const LOCAL_ORDERS_KEY = 'mf_placed_orders_v2';
const LOCAL_PUSHED_SIGS_KEY = 'selvee_pushed_sigs_v1';
const LOCAL_PUBLISHED_IDS_KEY = 'selvee_published_notif_ids_v1';
const CUSTOMER_DEVICE_KEY = 'selvee_customer_device_id_v1';
const FEED_DOC_PATH = doc(db, 'settings', 'notifications_feed');
const MAX_FEED_ITEMS = 25;
let feedWriteQueue: Promise<void> = Promise.resolve();
const pushedInMemory = new Set<string>();
const publishedIdsLock = new Set<string>();
const recentPublishedSigs = new Map<string, number>();

const hasRecentlyPublishedId = (id: string): boolean => {
  if (publishedIdsLock.has(id)) return true;
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(LOCAL_PUBLISHED_IDS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.includes(id);
  } catch {
    return false;
  }
};

const rememberPublishedId = (id: string) => {
  publishedIdsLock.add(id);
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_PUBLISHED_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const prev: string[] = Array.isArray(parsed) ? parsed : [];
    const next = [id, ...prev.filter((x) => x !== id)].slice(0, 60);
    localStorage.setItem(LOCAL_PUBLISHED_IDS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
};

// Shared singleton live notifications state (prevents stale localStorage flash on load)
let liveNotifications: AppNotification[] | null = null;
const notificationsListeners = new Set<(items: AppNotification[]) => void>();
let sharedFeedUnsub: Unsubscribe | null = null;
let sharedCollectionUnsub: Unsubscribe | null = null;
let lastFeedItems: AppNotification[] = [];
let lastCollectionItems: AppNotification[] = [];
const sessionOptimisticNotifs = new Map<string, AppNotification>();

export const getCustomerDeviceId = (): string => {
  if (typeof window === 'undefined') return 'SERVER';
  try {
    let id = localStorage.getItem(CUSTOMER_DEVICE_KEY);
    if (!id) {
      const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
      id = `CUS-${Date.now().toString(36).toUpperCase()}-${rand}`;
      localStorage.setItem(CUSTOMER_DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'CLIENT';
  }
};

export interface CustomerIdentity {
  uid?: string;
  email?: string;
  phone?: string;
  orderNumbers?: string[];
  isAdmin?: boolean;
  isApprovedAdminDevice?: boolean;
  emailVerified?: boolean;
  verifiedDeviceId?: string;
  verifiedDeviceIds?: string[];
  currentDeviceId?: string;
}

const normalizePhone = (phone?: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

const normalizeOrderNo = (num?: string): string => {
  if (!num) return '';
  return num.trim().toUpperCase().replace(/^#/, '').replace(/^MF-/, '');
};

const getLocalOrderNumbersAndPhones = (): { orderNumbers: string[]; phones: string[] } => {
  const orderNumbers: string[] = [];
  const phones: string[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((o: any) => {
          if (o?.orderNumber) orderNumbers.push(normalizeOrderNo(o.orderNumber));
          if (o?.customerPhone) phones.push(normalizePhone(o.customerPhone));
          if (o?.shippingAddress?.phone) phones.push(normalizePhone(o.shippingAddress.phone));
        });
      }
    }
  } catch {
    // ignore
  }
  return {
    orderNumbers: Array.from(new Set(orderNumbers.filter(Boolean))),
    phones: Array.from(new Set(phones.filter((p) => p.length >= 10))),
  };
};

export const getLocalCachedNotifications = (): AppNotification[] => {
  if (liveNotifications !== null) return liveNotifications;
  try {
    const raw = localStorage.getItem(LOCAL_NOTIFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      }
    }
  } catch {
    // ignore
  }
  return [];
};

const persistNotificationsBackup = (list: AppNotification[]) => {
  try {
    const sorted = [...list]
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
      .slice(0, MAX_FEED_ITEMS);
    localStorage.setItem(LOCAL_NOTIFS_KEY, JSON.stringify(sorted));
  } catch {
    // ignore
  }
};

const emitNotificationsState = () => {
  const map = new Map<string, AppNotification>();
  lastFeedItems.forEach((n) => {
    if (n?.id) map.set(n.id, n);
  });
  lastCollectionItems.forEach((n) => {
    if (n?.id) map.set(n.id, n);
  });
  sessionOptimisticNotifs.forEach((n, id) => {
    if (map.has(id)) {
      sessionOptimisticNotifs.delete(id);
    } else {
      map.set(id, n);
    }
  });
  const sorted = Array.from(map.values())
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
    .slice(0, MAX_FEED_ITEMS);
  liveNotifications = sorted;
  persistNotificationsBackup(sorted);
  notificationsListeners.forEach((cb) => cb(sorted));
};

export const getReadNotificationIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(LOCAL_READ_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // ignore
  }
  return new Set();
};

export const saveReadNotificationIds = (ids: Set<string>) => {
  try {
    localStorage.setItem(LOCAL_READ_KEY, JSON.stringify(Array.from(ids).slice(-250)));
  } catch {
    // ignore
  }
};

const getPushedNotificationIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(LOCAL_PUSHED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // ignore
  }
  return new Set();
};

const markNotificationPushed = (id: string) => {
  try {
    const set = getPushedNotificationIds();
    set.add(id);
    localStorage.setItem(LOCAL_PUSHED_KEY, JSON.stringify(Array.from(set).slice(-250)));
  } catch {
    // ignore
  }
};

export const isNotificationsMuted = (): boolean => {
  try {
    return localStorage.getItem(LOCAL_MUTED_KEY) === '1';
  } catch {
    return false;
  }
};

export const setNotificationsMuted = (muted: boolean) => {
  try {
    localStorage.setItem(LOCAL_MUTED_KEY, muted ? '1' : '0');
  } catch {
    // ignore
  }
};

export const isNotificationForCustomer = (
  notif: AppNotification,
  identity: CustomerIdentity
): boolean => {
  if (!notif) return false;

  // Strictly no notifications unless logged in
  if (!identity.uid || identity.uid === 'guest') {
    return false;
  }

  // Logged into Admin Panel -> ONLY approved admin device notifications (admin_new_order)
  if (identity.isAdmin) {
    return Boolean(identity.isApprovedAdminDevice && notif.audience === 'authorized_devices');
  }

  // Logged into User Panel (regular customer) -> NEVER receive admin new-order notifications,
  // even if this browser was previously approved as an admin device
  if (notif.audience === 'authorized_devices') {
    return false;
  }

  // Verified customer rule: must have emailVerified === true and bound device match
  if (!identity.emailVerified) {
    return false;
  }
  const allowedDevices = new Set<string>([
    ...(identity.verifiedDeviceIds || []),
    ...(identity.verifiedDeviceId ? [identity.verifiedDeviceId] : []),
  ]);
  if (
    allowedDevices.size > 0 &&
    identity.currentDeviceId &&
    !allowedDevices.has(identity.currentDeviceId)
  ) {
    return false;
  }

  if (notif.audience === 'all') return true;

  const { orderNumbers: localOrders, phones: localPhones } = getLocalOrderNumbersAndPhones();

  if (notif.targetUid && identity.uid && identity.uid !== 'guest' && notif.targetUid === identity.uid) {
    return true;
  }
  if (
    notif.targetEmail &&
    identity.email &&
    notif.targetEmail.trim().toLowerCase() === identity.email.trim().toLowerCase()
  ) {
    return true;
  }

  const targetPhone = normalizePhone(notif.targetPhone);
  if (targetPhone.length >= 10) {
    const idPhone = normalizePhone(identity.phone);
    if (idPhone === targetPhone || localPhones.includes(targetPhone)) {
      return true;
    }
  }

  const targetOrd = normalizeOrderNo(notif.targetOrderNumber);
  if (targetOrd) {
    const knownOrders = new Set([
      ...localOrders,
      ...(identity.orderNumbers || []).map(normalizeOrderNo),
    ]);
    if (knownOrders.has(targetOrd)) {
      return true;
    }
  }

  return false;
};

export const getBrowserNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

export const requestMobileNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    const result = await new Promise<NotificationPermission>((resolve) => {
      try {
        const maybePromise = Notification.requestPermission((cbPerm) => {
          resolve(cbPerm);
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(resolve).catch(() => resolve(Notification.permission));
        }
      } catch {
        resolve(Notification.permission);
      }
    });
    if (result === 'granted') {
      setNotificationsMuted(false);
    }
    return result;
  } catch {
    return Notification.permission;
  }
};

const getRecentPushedSigs = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(LOCAL_PUSHED_SIGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const cutoff = Date.now() - 120000; // 2 minute dedup window across tabs
        const clean: Record<string, number> = {};
        Object.entries(parsed).forEach(([k, v]) => {
          if (typeof v === 'number' && v > cutoff) clean[k] = v;
        });
        return clean;
      }
    }
  } catch {
    // ignore
  }
  return {};
};

const markSigPushed = (sig: string) => {
  try {
    const clean = getRecentPushedSigs();
    clean[sig] = Date.now();
    localStorage.setItem(LOCAL_PUSHED_SIGS_KEY, JSON.stringify(clean));
  } catch {
    // ignore
  }
};

export const triggerNativeMobileNotification = async (notif: AppNotification): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if (isNotificationsMuted()) return false;
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;

  const pushed = getPushedNotificationIds();
  if (pushedInMemory.has(notif.id) || pushed.has(notif.id)) return false;

  const isTestNotif = notif.id.startsWith('test-');

  // Cross-tab & identical-content dedup lock (prevents 2x-3x popups if multiple callers fire)
  const contentSig = `${notif.type}|${notif.title}|${notif.targetOrderNumber || ''}|${notif.message}`;
  const recentSigs = getRecentPushedSigs();
  if (!isTestNotif && recentSigs[contentSig]) {
    pushedInMemory.add(notif.id);
    markNotificationPushed(notif.id);
    return false;
  }

  // Do not fire OS popups for stale notifications older than 12 hours on fresh devices
  const ageMs = Date.now() - (notif.createdAtMs || 0);
  if (!isTestNotif && ageMs > 12 * 60 * 60 * 1000) {
    pushedInMemory.add(notif.id);
    markNotificationPushed(notif.id);
    return false;
  }

  // Acquire synchronous lock BEFORE any await
  pushedInMemory.add(notif.id);
  markNotificationPushed(notif.id);
  if (!isTestNotif) {
    markSigPushed(contentSig);
  }

  try {
    if ('serviceWorker' in navigator) {
      let reg: ServiceWorkerRegistration | undefined =
        (await navigator.serviceWorker.getRegistration('/').catch(() => undefined)) ||
        (await navigator.serviceWorker.getRegistration().catch(() => undefined));

      if (!reg) {
        reg = await navigator.serviceWorker
          .register('/sw.js', { scope: '/', updateViaCache: 'none' })
          .catch(() => undefined);
      }

      if (!reg || !reg.active) {
        reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 4000)),
        ]);
      }

      if (reg && reg.active && 'showNotification' in reg) {
        try {
          await reg.showNotification(notif.title, {
            body: notif.message,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: notif.id,
            vibrate: [200, 100, 200],
            renotify: false,
            requireInteraction: Boolean(notif.important),
            data: { url: notif.actionUrl || '/' },
          } as NotificationOptions);
          return true;
        } catch {
          await reg.showNotification(notif.title, {
            body: notif.message,
            icon: '/pwa-192x192.png',
            tag: notif.id,
            data: { url: notif.actionUrl || '/' },
          });
          return true;
        }
      }
    }

    const n = new Notification(notif.title, {
      body: notif.message,
      icon: '/pwa-192x192.png',
      tag: notif.id,
    });
    n.onclick = () => {
      window.focus();
      if (notif.actionUrl) {
        window.history.pushState({}, '', notif.actionUrl);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      n.close();
    };
    return true;
  } catch {
    return false;
  }
};

const ORDER_STATUS_MESSAGES: Record<OrderStatus, { title: string; body: string; important?: boolean }> = {
  pending: {
    title: 'Order Placed Successfully',
    body: 'We received your order and will confirm it shortly.',
  },
  confirmed: {
    title: 'Order Confirmed',
    body: 'Your order has been confirmed and queued for preparation.',
    important: true,
  },
  processing: {
    title: 'Order In Preparation',
    body: 'Our team is carefully preparing and quality-checking your garments.',
  },
  packed: {
    title: 'Order Packed & Ready',
    body: 'Your Selvee parcel has been packed and is ready for courier handover.',
  },
  shipped: {
    title: 'Order Shipped — On The Way',
    body: 'Your parcel has been dispatched and is now in transit to your address.',
    important: true,
  },
  delivered: {
    title: 'Order Delivered',
    body: 'Your Selvee order has been delivered. Thank you for shopping with us!',
    important: true,
  },
  cancelled: {
    title: 'Order Cancelled',
    body: 'Your order has been cancelled. Contact support if you need assistance.',
    important: true,
  },
  returned: {
    title: 'Order Return Processed',
    body: 'Your return request has been recorded by our team.',
  },
};

export const notificationService = {
  getInstantNotifications(): AppNotification[] {
    return liveNotifications ?? [];
  },

  async publishNotification(input: {
    id?: string;
    type: NotificationType;
    title: string;
    message: string;
    audience: 'all' | 'customer' | 'authorized_devices';
    targetUid?: string;
    targetEmail?: string;
    targetPhone?: string;
    targetOrderNumber?: string;
    actionUrl?: string;
    couponCode?: string;
    important?: boolean;
    createdBy?: string;
  }): Promise<AppNotification> {
    const now = Date.now();
    const id =
      input.id ||
      `notif-${now.toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

    const existingLive = liveNotifications ?? [];
    if (input.id) {
      const alreadyLive = existingLive.find((n) => n.id === id);
      if (hasRecentlyPublishedId(id) || alreadyLive) {
        return alreadyLive || {
          id,
          type: input.type,
          title: input.title.trim(),
          message: input.message.trim(),
          audience: input.audience,
          createdAt: new Date(now).toISOString(),
          createdAtMs: now,
        };
      }
    }

    const contentSig = `${input.type}|${input.title.trim()}|${input.message.trim()}|${input.targetOrderNumber || ''}`;
    const lastPub = recentPublishedSigs.get(contentSig);
    if (lastPub && now - lastPub < 30000) {
      const existingMatch = existingLive.find((n) => n.title === input.title.trim() && n.message === input.message.trim());
      if (existingMatch) return existingMatch;
    }
    rememberPublishedId(id);
    recentPublishedSigs.set(contentSig, now);

    const notif: AppNotification = {
      id,
      type: input.type,
      title: input.title.trim(),
      message: input.message.trim(),
      audience: input.audience,
      targetUid: input.targetUid?.trim() || undefined,
      targetEmail: input.targetEmail?.trim().toLowerCase() || undefined,
      targetPhone: input.targetPhone?.trim() || undefined,
      targetOrderNumber: input.targetOrderNumber?.trim() || undefined,
      actionUrl: input.actionUrl || '/',
      couponCode: input.couponCode?.trim().toUpperCase() || undefined,
      important: Boolean(input.important),
      readBy: [],
      createdAt: new Date(now).toISOString(),
      createdAtMs: now,
      createdBy: input.createdBy || 'system',
    };

    // 1. Update live memory optimistically (skip authorized_devices on non-admin browsers)
    const hasAdminDevice =
      typeof window !== 'undefined' && Boolean(localStorage.getItem('selvee_admin_device_id_v2'));
    if (notif.audience !== 'authorized_devices' || hasAdminDevice) {
      sessionOptimisticNotifs.set(id, notif);
      emitNotificationsState();
    }

    if (isFirestoreWriteBackedOff()) {
      return notif;
    }

    // 2. Sequentially queue write to settings/notifications_feed to avoid concurrent overwrite races
    let alreadyInRemote = false;
    const writeFeed = async () => {
      if (isFirestoreWriteBackedOff()) return;
      try {
        const feedSnap = await getDoc(FEED_DOC_PATH);
        const remoteItems: AppNotification[] =
          feedSnap.exists() && Array.isArray(feedSnap.data()?.items)
            ? (feedSnap.data().items as AppNotification[])
            : [];
        if (input.id && remoteItems.some((n) => n && n.id === id)) {
          alreadyInRemote = true;
          return;
        }
        const nextItems = [
          sanitizeForFirestore(notif),
          ...remoteItems.filter((n) => n && n.id !== id),
        ].slice(0, MAX_FEED_ITEMS);

        await setDoc(
          FEED_DOC_PATH,
          {
            items: nextItems,
            updatedAt: serverTimestamp(),
            updatedAtMs: now,
          },
          { merge: true }
        );
      } catch (err) {
        markFirestoreWriteError(err);
      }
    };

    feedWriteQueue = feedWriteQueue.then(writeFeed, writeFeed);
    await feedWriteQueue;

    // 3. Also attempt writing to /notifications collection if not already present remotely
    if (!alreadyInRemote && !isFirestoreWriteBackedOff()) {
      try {
        await setDoc(
          doc(db, 'notifications', id),
          sanitizeForFirestore({
            ...notif,
            createdAt: serverTimestamp(),
          })
        );
      } catch (err) {
        markFirestoreWriteError(err);
      }
    }

    return notif;
  },

  subscribeToAllNotifications(callback: (items: AppNotification[]) => void): Unsubscribe {
    notificationsListeners.add(callback);
    if (liveNotifications !== null) {
      callback(liveNotifications);
    }

    if (!sharedFeedUnsub) {
      sharedFeedUnsub = onSnapshot(
        FEED_DOC_PATH,
        (snap) => {
          if (snap.exists() && Array.isArray(snap.data()?.items)) {
            lastFeedItems = (snap.data().items as AppNotification[]).filter((i) => i && i.id);
          } else {
            lastFeedItems = [];
          }
          emitNotificationsState();
        },
        (err) => {
          console.warn('Notifications feed listener notice:', err);
        }
      );
    }

    if (!sharedCollectionUnsub) {
      try {
        const q = query(collection(db, 'notifications'), orderBy('createdAtMs', 'desc'), limit(40));
        sharedCollectionUnsub = onSnapshot(
          q,
          (snap) => {
            const items: AppNotification[] = [];
            snap.forEach((d) => {
              const data = d.data() as AppNotification;
              items.push({ ...data, id: d.id });
            });
            lastCollectionItems = items;
            emitNotificationsState();
          },
          () => {
            // Silently rely on notifications_feed if /notifications rules aren't deployed yet
          }
        );
      } catch {
        sharedCollectionUnsub = () => {};
      }
    }

    return () => {
      notificationsListeners.delete(callback);
    };
  },

  async notifyOrderPlaced(params: {
    orderNumber: string;
    total: number;
    customerId?: string;
    customerEmail?: string;
    customerPhone?: string;
    paymentMethod: string;
  }) {
    const cleanNum = params.orderNumber.startsWith('#') ? params.orderNumber : `#${params.orderNumber}`;
    return this.publishNotification({
      id: `ord-placed-${normalizeOrderNo(cleanNum)}`,
      type: 'order_placed',
      title: `Order ${cleanNum} Received`,
      message: `Thank you! Your order total of ৳${params.total.toLocaleString('en-BD')} (${params.paymentMethod.toUpperCase()}) has been placed.`,
      audience: 'customer',
      targetUid: params.customerId && params.customerId !== 'guest' ? params.customerId : undefined,
      targetEmail: params.customerEmail,
      targetPhone: params.customerPhone,
      targetOrderNumber: cleanNum,
      actionUrl: `/track-order?order=${encodeURIComponent(cleanNum)}`,
      important: true,
      createdBy: 'order-system',
    });
  },

  async notifyAdminNewOrder(params: {
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    total: number;
    itemCount: number;
    paymentMethod: string;
  }) {
    const cleanNum = params.orderNumber.startsWith('#') ? params.orderNumber : `#${params.orderNumber}`;
    const itemsLabel = `${params.itemCount} item${params.itemCount > 1 ? 's' : ''}`;
    return this.publishNotification({
      id: `admin-ord-${normalizeOrderNo(cleanNum)}`,
      type: 'admin_new_order',
      title: `New Order ${cleanNum} — ৳${params.total.toLocaleString('en-BD')}`,
      message: `${params.customerName || 'Customer'} (${params.customerPhone || 'N/A'}) ordered ${itemsLabel} via ${params.paymentMethod.toUpperCase()}.`,
      audience: 'authorized_devices',
      targetOrderNumber: cleanNum,
      actionUrl: '/admin?tab=pipeline',
      important: true,
      createdBy: 'order-system',
    });
  },

  async notifyAdminWorkflowAlert(params: {
    id?: string;
    title: string;
    message: string;
    targetOrderNumber?: string;
    actionUrl?: string;
    important?: boolean;
    createdBy?: string;
  }) {
    return this.publishNotification({
      id: params.id,
      type: 'admin_workflow_alert',
      title: params.title,
      message: params.message,
      audience: 'authorized_devices',
      targetOrderNumber: params.targetOrderNumber,
      actionUrl: params.actionUrl || '/admin?tab=pipeline',
      important: Boolean(params.important),
      createdBy: params.createdBy || 'workflow-system',
    });
  },

  async notifyOrderStatusChanged(params: {
    orderNumber: string;
    status: OrderStatus;
    note?: string;
    customerId?: string;
    customerEmail?: string;
    customerPhone?: string;
  }) {
    const cleanNum = params.orderNumber.startsWith('#') ? params.orderNumber : `#${params.orderNumber}`;
    const template = ORDER_STATUS_MESSAGES[params.status] || {
      title: `Order ${params.status}`,
      body: `Your order status changed to ${params.status}.`,
    };
    const customMsg = params.note && params.note.trim() && !params.note.includes('by Administrator')
      ? `${template.body} (${params.note.trim()})`
      : template.body;

    return this.publishNotification({
      id: `ord-st-${normalizeOrderNo(cleanNum)}-${params.status}`,
      type: 'order_status',
      title: `${template.title} — ${cleanNum}`,
      message: customMsg,
      audience: 'customer',
      targetUid: params.customerId && params.customerId !== 'guest' ? params.customerId : undefined,
      targetEmail: params.customerEmail,
      targetPhone: params.customerPhone,
      targetOrderNumber: cleanNum,
      actionUrl: `/track-order?order=${encodeURIComponent(cleanNum)}`,
      important: Boolean(template.important),
      createdBy: 'admin',
    });
  },

  async notifyPaymentStatusChanged(params: {
    orderNumber: string;
    paymentStatus: PaymentStatus;
    customerId?: string;
    customerEmail?: string;
    customerPhone?: string;
  }) {
    const cleanNum = params.orderNumber.startsWith('#') ? params.orderNumber : `#${params.orderNumber}`;
    const map: Record<PaymentStatus, { title: string; body: string; important?: boolean }> = {
      paid: {
        title: `Payment Verified — ${cleanNum}`,
        body: 'Your payment has been verified and confirmed. Thank you!',
        important: true,
      },
      failed: {
        title: `Payment Verification Issue — ${cleanNum}`,
        body: 'We could not verify your payment proof. Please contact support or update your transaction ID.',
        important: true,
      },
      refunded: {
        title: `Payment Refunded — ${cleanNum}`,
        body: 'Your payment refund has been processed.',
        important: true,
      },
      pending: {
        title: `Payment Pending — ${cleanNum}`,
        body: 'Your payment status is pending verification.',
      },
    };

    const tpl = map[params.paymentStatus];
    return this.publishNotification({
      id: `ord-pay-${normalizeOrderNo(cleanNum)}-${params.paymentStatus}`,
      type: 'payment_update',
      title: tpl.title,
      message: tpl.body,
      audience: 'customer',
      targetUid: params.customerId && params.customerId !== 'guest' ? params.customerId : undefined,
      targetEmail: params.customerEmail,
      targetPhone: params.customerPhone,
      targetOrderNumber: cleanNum,
      actionUrl: `/track-order?order=${encodeURIComponent(cleanNum)}`,
      important: Boolean(tpl.important),
      createdBy: 'admin',
    });
  },

  async notifyNewCouponOffer(params: {
    code: string;
    discountType: 'percentage' | 'fixed' | 'free_delivery';
    discountAmount: number;
    minOrderAmount?: number;
    targetCustomerUid?: string;
    targetCustomerEmail?: string;
    targetCustomerPhone?: string;
    targetCustomerName?: string;
  }) {
    const cleanCode = params.code.toUpperCase().trim();
    const isTargeted = Boolean(
      params.targetCustomerUid || params.targetCustomerEmail || params.targetCustomerPhone
    );

    const benefitText =
      params.discountType === 'free_delivery'
        ? 'FREE Delivery (৳0 Shipping)'
        : params.discountType === 'percentage'
        ? `${params.discountAmount}% OFF`
        : `৳${params.discountAmount} OFF`;

    const minText =
      params.minOrderAmount && params.minOrderAmount > 0
        ? ` on orders over ৳${params.minOrderAmount.toLocaleString('en-BD')}`
        : '';

    return this.publishNotification({
      type: isTargeted ? 'coupon' : 'offer',
      title: isTargeted
        ? `Special Gift For You: ${benefitText}!`
        : `New Offer: Use Code ${cleanCode} for ${benefitText}`,
      message: isTargeted
        ? `You've unlocked a personal ${benefitText} voucher (${cleanCode})${minText}. Apply at checkout before it expires!`
        : `Enjoy ${benefitText}${minText} with promo code ${cleanCode}. Shop our latest collection now!`,
      audience: isTargeted ? 'customer' : 'all',
      targetUid: params.targetCustomerUid,
      targetEmail: params.targetCustomerEmail,
      targetPhone: params.targetCustomerPhone,
      couponCode: cleanCode,
      actionUrl: '/shop',
      important: true,
      createdBy: 'admin',
    });
  },
};
