import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppNotification, Order, OrderStatus, PaymentStatus } from '../types';
import { useAuth } from './AuthContext';
import {
  notificationService,
  isNotificationForCustomer,
  getReadNotificationIds,
  saveReadNotificationIds,
  getBrowserNotificationPermission,
  requestMobileNotificationPermission,
  triggerNativeMobileNotification,
  isNotificationsMuted,
  setNotificationsMuted,
  getCustomerDeviceId,
} from '../services/notificationService';
import { orderService } from '../services/orderService';
import { adminDeviceService } from '../services/adminDeviceService';

interface NotificationContextType {
  notifications: AppNotification[];
  readIds: Set<string>;
  unreadCount: number;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  permission: NotificationPermission | 'unsupported';
  isMuted: boolean;
  isApprovedAdminDevice: boolean;
  isCustomerDeviceBlocked: boolean;
  customerVerificationBlockReason: 'unverified_email' | 'other_device' | null;
  allNotificationsActive: boolean;
  requestMobileAlerts: () => Promise<NotificationPermission | 'unsupported'>;
  enableAllNotificationsOneClick: () => Promise<{ granted: boolean; inAppActive: boolean }>;
  toggleMute: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  activeToast: AppNotification | null;
  dismissToast: () => void;
  sendTestMobileAlert: () => Promise<boolean>;
  sendTestAdminOrderAlert: () => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const STATUS_SNAPSHOT_KEY = 'selvee_order_status_snapshot_v1';
const INAPP_ALERTS_KEY = 'selvee_inapp_alerts_v1';

const getStoredOrderSnapshots = (): Record<string, { orderStatus: OrderStatus; paymentStatus: PaymentStatus }> => {
  try {
    const raw = localStorage.getItem(STATUS_SNAPSHOT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
};

const saveStoredOrderSnapshots = (map: Record<string, { orderStatus: OrderStatus; paymentStatus: PaymentStatus }>) => {
  try {
    localStorage.setItem(STATUS_SNAPSHOT_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
};

const playOrderAlertChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [880, 1174.66];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.3);
    });

    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1000);
  } catch {
    // Ignore autoplay restriction errors before first user interaction
  }
};

export const NotificationProvider: React.FC<{
  children: React.ReactNode;
  onNavigate?: (route: string) => void;
}> = ({ children, onNavigate }) => {
  const { currentUser, customerProfile, profileLoaded, enableCurrentDeviceForVerifiedUser } = useAuth();
  const [allNotifications, setAllNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => getReadNotificationIds());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [isMuted, setIsMuted] = useState<boolean>(() => isNotificationsMuted());
  const [inAppAlertsActive, setInAppAlertsActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem(INAPP_ALERTS_KEY) === '1' || getBrowserNotificationPermission() === 'granted';
    } catch {
      return false;
    }
  });
  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);
  const [storedDeviceId, setStoredDeviceId] = useState<string | null>(() =>
    adminDeviceService.getStoredDeviceId()
  );
  const [isApprovedAdminDevice, setIsApprovedAdminDevice] = useState<boolean>(false);
  const [deviceStatusResolved, setDeviceStatusResolved] = useState<boolean>(() =>
    !adminDeviceService.getStoredDeviceId()
  );

  const knownIdsRef = useRef<Set<string> | null>(null);
  const seenAdminOrderIdsRef = useRef<Set<string> | null>(null);
  const toastedIdsRef = useRef<Set<string>>(new Set());
  const toastedSigsRef = useRef<Set<string>>(new Set());
  const orderSnapshotsRef = useRef<Record<string, { orderStatus: OrderStatus; paymentStatus: PaymentStatus }>>(
    getStoredOrderSnapshots()
  );
  const allNotificationsRef = useRef<AppNotification[]>([]);
  const appStartedAtRef = useRef<number>(Date.now());
  const toastTimerRef = useRef<number | null>(null);

  const showInAppToast = useCallback((notif: AppNotification) => {
    setActiveToast(notif);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setActiveToast(null);
    }, 6500);
  }, []);

  const autoTriedRef = useRef<boolean>(false);
  const gestureTriedRef = useRef<boolean>(false);

  // Direct browser notification permission prompt on website entry (Desktop immediate + Mobile first-tap)
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const current = getBrowserNotificationPermission();
    setPermission(current);

    if (current === 'granted') {
      setNotificationsMuted(false);
      setIsMuted(false);
      setInAppAlertsActive(true);
      try {
        localStorage.setItem(INAPP_ALERTS_KEY, '1');
      } catch {
        // ignore
      }
      if (currentUser?.emailVerified) {
        enableCurrentDeviceForVerifiedUser().catch(() => {});
      }
      return;
    }

    if (current !== 'default') return;

    const activateAfterGrant = (res: NotificationPermission | 'unsupported') => {
      setPermission(res);
      if (res === 'granted') {
        setNotificationsMuted(false);
        setIsMuted(false);
        setInAppAlertsActive(true);
        try {
          localStorage.setItem(INAPP_ALERTS_KEY, '1');
        } catch {
          // ignore
        }
        if (currentUser?.emailVerified) {
          enableCurrentDeviceForVerifiedUser().catch(() => {});
        }
      }
    };

    const isMobileViewport =
      window.innerWidth < 768 ||
      window.matchMedia?.('(pointer: coarse)').matches ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    // 1. On desktop, trigger native browser prompt immediately on load (mobile browsers ignore non-gesture calls)
    if (!isMobileViewport && !autoTriedRef.current) {
      autoTriedRef.current = true;
      requestMobileNotificationPermission()
        .then((res) => activateAfterGrant(res))
        .catch(() => {});
    }

    // 2. On Mobile / Mobile View (or if desktop prompt stayed 'default'), trigger synchronously on very first tap/click
    const onFirstUserGesture = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-notif-trigger="true"]')) {
        return;
      }
      if (gestureTriedRef.current || getBrowserNotificationPermission() !== 'default') {
        cleanupGestureListeners();
        return;
      }
      gestureTriedRef.current = true;
      cleanupGestureListeners();

      requestMobileNotificationPermission()
        .then((res) => activateAfterGrant(res))
        .catch(() => {});
    };

    const cleanupGestureListeners = () => {
      window.removeEventListener('click', onFirstUserGesture, true);
    };

    window.addEventListener('click', onFirstUserGesture, true);
    return () => {
      cleanupGestureListeners();
    };
  }, [currentUser?.emailVerified, enableCurrentDeviceForVerifiedUser]);

  // Track stored admin device ID across tabs / when /admin creates an ID
  useEffect(() => {
    const refreshDeviceId = () => {
      setStoredDeviceId(adminDeviceService.getStoredDeviceId());
    };
    window.addEventListener('selvee_admin_device_id_changed', refreshDeviceId);
    window.addEventListener('storage', refreshDeviceId);
    return () => {
      window.removeEventListener('selvee_admin_device_id_changed', refreshDeviceId);
      window.removeEventListener('storage', refreshDeviceId);
    };
  }, []);

  // Subscribe strictly to current hardware device approval status
  useEffect(() => {
    if (!storedDeviceId) {
      setIsApprovedAdminDevice(false);
      setDeviceStatusResolved(true);
      seenAdminOrderIdsRef.current = null;
      return;
    }

    setDeviceStatusResolved(false);
    const unsub = adminDeviceService.subscribeToDeviceStatus(storedDeviceId, (status) => {
      const approved = status === 'approved';
      setIsApprovedAdminDevice(approved);
      setDeviceStatusResolved(true);
      if (!approved) {
        seenAdminOrderIdsRef.current = null;
        setActiveToast((prev) => (prev?.audience === 'authorized_devices' ? null : prev));
      }
    });

    return () => unsub();
  }, [storedDeviceId]);

  // Listen for Service Worker notification clicks to route inside SPA
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK' && event.data?.url) {
        if (onNavigate) {
          onNavigate(event.data.url);
        } else {
          window.dispatchEvent(new CustomEvent('selvee_navigate', { detail: event.data.url }));
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [onNavigate]);

  const [feedSynced, setFeedSynced] = useState<boolean>(false);

  // Subscribe to notifications feed
  useEffect(() => {
    let emitCount = 0;
    const timer = window.setTimeout(() => setFeedSynced(true), 1200);
    const unsub = notificationService.subscribeToAllNotifications((items) => {
      allNotificationsRef.current = items;
      setAllNotifications(items);
      emitCount += 1;
      // Second emission is the remote Firestore snapshot (first is synchronous localStorage cache)
      if (emitCount >= 2) {
        setFeedSynced(true);
      }
    });
    return () => {
      window.clearTimeout(timer);
      unsub();
    };
  }, []);

  // Authorized Admin Devices ONLY: real-time listener on incoming Firestore orders
  useEffect(() => {
    if (!isApprovedAdminDevice) {
      seenAdminOrderIdsRef.current = null;
      return;
    }

    const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(10));
    const unsub = onSnapshot(
      qOrders,
      (snap) => {
        if (seenAdminOrderIdsRef.current === null) {
          const initialIds = new Set<string>();
          snap.forEach((d) => initialIds.add(d.id));
          seenAdminOrderIdsRef.current = initialIds;
          return;
        }

        snap.forEach((d) => {
          if (!seenAdminOrderIdsRef.current!.has(d.id)) {
            seenAdminOrderIdsRef.current!.add(d.id);
            const ord = d.data() as Order;
            if (!ord?.orderNumber) return;

            const createdMs = ord.createdAt?.toMillis
              ? ord.createdAt.toMillis()
              : ord.createdAt?.seconds
              ? ord.createdAt.seconds * 1000
              : Date.now();
            // Only notify for genuinely recent incoming orders (< 15 min)
            if (Date.now() - createdMs > 15 * 60 * 1000) return;

            const itemCount = Array.isArray(ord.items)
              ? ord.items.reduce((sum, item) => sum + (item.quantity || 1), 0)
              : 1;

            notificationService
              .notifyAdminNewOrder({
                orderNumber: ord.orderNumber,
                customerName: ord.customerName || ord.shippingAddress?.fullName || 'Customer',
                customerPhone: ord.customerPhone || ord.shippingAddress?.phone || '',
                total: ord.total || 0,
                itemCount,
                paymentMethod: ord.paymentMethod || 'cod',
              })
              .catch(() => {});
          }
        });
      },
      (err) => {
        console.warn('Authorized device order listener notice:', err);
      }
    );

    return () => unsub();
  }, [isApprovedAdminDevice]);

  // Real-time Firestore listener on customer's placed orders so status updates ALWAYS alert mobile
  useEffect(() => {
    const localOrders = orderService.getLocalOrders();
    const orderNumbersToWatch = Array.from(
      new Set(localOrders.map((o) => o.orderNumber).filter(Boolean))
    ).slice(0, 10);

    const processOrdersSnapshot = (ordersList: Order[]) => {
      const snapshots = orderSnapshotsRef.current;
      let changed = false;

      ordersList.forEach((ord) => {
        if (!ord?.orderNumber) return;
        const prev = snapshots[ord.orderNumber];
        const nextOrderStatus = ord.orderStatus;
        const nextPaymentStatus = ord.paymentStatus;

        // Update snapshot synchronously BEFORE dispatching notifications so concurrent listeners never double-fire
        if (!prev || prev.orderStatus !== nextOrderStatus || prev.paymentStatus !== nextPaymentStatus) {
          snapshots[ord.orderNumber] = {
            orderStatus: nextOrderStatus,
            paymentStatus: nextPaymentStatus,
          };
          changed = true;
        }

        if (prev) {
          if (prev.orderStatus !== nextOrderStatus) {
            const cleanNo = ord.orderNumber.trim().toUpperCase().replace(/^#/, '').replace(/^MF-/, '');
            const expectedId = `ord-st-${cleanNo}-${nextOrderStatus}`;
            window.setTimeout(() => {
              if (!allNotificationsRef.current.some((n) => n.id === expectedId)) {
                notificationService
                  .notifyOrderStatusChanged({
                    orderNumber: ord.orderNumber,
                    status: nextOrderStatus,
                    customerId: ord.customerId,
                    customerEmail: ord.customerEmail || ord.shippingAddress?.email,
                    customerPhone: ord.customerPhone || ord.shippingAddress?.phone,
                  })
                  .catch(() => {});
              }
            }, 900);
          }
          if (prev.paymentStatus !== nextPaymentStatus && nextPaymentStatus !== 'pending') {
            const cleanNo = ord.orderNumber.trim().toUpperCase().replace(/^#/, '').replace(/^MF-/, '');
            const expectedId = `ord-pay-${cleanNo}-${nextPaymentStatus}`;
            window.setTimeout(() => {
              if (!allNotificationsRef.current.some((n) => n.id === expectedId)) {
                notificationService
                  .notifyPaymentStatusChanged({
                    orderNumber: ord.orderNumber,
                    paymentStatus: nextPaymentStatus,
                    customerId: ord.customerId,
                    customerEmail: ord.customerEmail || ord.shippingAddress?.email,
                    customerPhone: ord.customerPhone || ord.shippingAddress?.phone,
                  })
                  .catch(() => {});
              }
            }, 900);
          }
        }
      });

      if (changed) {
        saveStoredOrderSnapshots(snapshots);
      }
    };

    const unsubs: (() => void)[] = [];

    if (currentUser?.uid) {
      try {
        const q = query(collection(db, 'orders'), where('customerId', '==', currentUser.uid));
        unsubs.push(
          onSnapshot(
            q,
            (snap) => {
              const list: Order[] = [];
              snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }));
              processOrdersSnapshot(list);
            },
            () => {}
          )
        );
      } catch {
        // ignore
      }
    }

    if (orderNumbersToWatch.length > 0) {
      try {
        const qLocal = query(
          collection(db, 'orders'),
          where('orderNumber', 'in', orderNumbersToWatch)
        );
        unsubs.push(
          onSnapshot(
            qLocal,
            (snap) => {
              const list: Order[] = [];
              snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }));
              processOrdersSnapshot(list);
            },
            () => {}
          )
        );
      } catch {
        // ignore
      }
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [currentUser?.uid]);

  // Filter notifications strictly by customer identity + verified customer devices + approved admin device status
  const currentCustomerDeviceId = getCustomerDeviceId();
  const isWaitingProfile = Boolean(currentUser && !profileLoaded && !isApprovedAdminDevice);

  const allowedDevicesSet = new Set<string>([
    ...(customerProfile?.verifiedDeviceIds || []),
    ...(customerProfile?.verifiedDeviceId ? [customerProfile.verifiedDeviceId] : []),
  ]);

  let customerVerificationBlockReason: 'unverified_email' | 'other_device' | null = null;
  if (currentUser && !isApprovedAdminDevice && profileLoaded) {
    if (!currentUser.emailVerified) {
      customerVerificationBlockReason = 'unverified_email';
    } else if (allowedDevicesSet.size > 0 && !allowedDevicesSet.has(currentCustomerDeviceId)) {
      customerVerificationBlockReason = 'other_device';
    }
  }

  const isCustomerDeviceBlocked = isWaitingProfile || Boolean(customerVerificationBlockReason);
  const allNotificationsActive =
    !isCustomerDeviceBlocked && !isMuted && (permission === 'granted' || inAppAlertsActive);

  const localOrders = orderService.getLocalOrders();
  const customerIdentity = {
    uid: currentUser?.uid,
    email: currentUser?.email || undefined,
    phone: customerProfile?.phone || undefined,
    orderNumbers: localOrders.map((o) => o.orderNumber).filter(Boolean),
    isApprovedAdminDevice,
    emailVerified: isWaitingProfile ? false : Boolean(currentUser?.emailVerified),
    verifiedDeviceId: customerProfile?.verifiedDeviceId,
    verifiedDeviceIds: customerProfile?.verifiedDeviceIds,
    currentDeviceId: currentCustomerDeviceId,
  };

  const customerNotifications = allNotifications.filter((n) =>
    isNotificationForCustomer(n, customerIdentity)
  );

  // Detect brand-new incoming notifications -> trigger mobile OS push + subtle in-app toast (strictly ONCE)
  useEffect(() => {
    if (isWaitingProfile || !deviceStatusResolved || !feedSynced) return;

    if (knownIdsRef.current === null) {
      knownIdsRef.current = new Set(customerNotifications.map((n) => n.id));
      // Only alert items that were genuinely created right after this page opened
      const justCreated = customerNotifications.filter(
        (n) => (n.createdAtMs || 0) >= appStartedAtRef.current - 3000
      );
      if (justCreated.length === 0) return;
      const topLive = justCreated[0];
      const sig = `${topLive.type}|${topLive.title}|${topLive.targetOrderNumber || ''}|${topLive.message}`;
      if (
        !readIds.has(topLive.id) &&
        !toastedIdsRef.current.has(topLive.id) &&
        !toastedSigsRef.current.has(sig)
      ) {
        toastedIdsRef.current.add(topLive.id);
        toastedSigsRef.current.add(sig);
        showInAppToast(topLive);
        triggerNativeMobileNotification(topLive);
        if (!isMuted && topLive.type === 'admin_new_order' && isApprovedAdminDevice) {
          playOrderAlertChime();
        }
      }
      return;
    }

    const newlyArrived = customerNotifications.filter((n) => !knownIdsRef.current!.has(n.id));
    if (newlyArrived.length > 0) {
      newlyArrived.forEach((n) => knownIdsRef.current!.add(n.id));
      const topNotif = newlyArrived[0];
      const isLiveAlert = (topNotif?.createdAtMs || 0) >= appStartedAtRef.current - 5000;
      const sig = topNotif
        ? `${topNotif.type}|${topNotif.title}|${topNotif.targetOrderNumber || ''}|${topNotif.message}`
        : '';

      if (
        topNotif &&
        isLiveAlert &&
        !readIds.has(topNotif.id) &&
        !toastedIdsRef.current.has(topNotif.id) &&
        !toastedSigsRef.current.has(sig)
      ) {
        toastedIdsRef.current.add(topNotif.id);
        toastedSigsRef.current.add(sig);
        showInAppToast(topNotif);
        triggerNativeMobileNotification(topNotif);
        if (!isMuted && topNotif.type === 'admin_new_order' && isApprovedAdminDevice) {
          playOrderAlertChime();
        }
      }
    }
  }, [
    customerNotifications,
    readIds,
    showInAppToast,
    isApprovedAdminDevice,
    isMuted,
    isWaitingProfile,
    deviceStatusResolved,
    feedSynced,
  ]);

  const unreadCount = customerNotifications.filter((n) => !readIds.has(n.id)).length;

  const enableAllNotificationsOneClick = async (): Promise<{
    granted: boolean;
    inAppActive: boolean;
  }> => {
    // 1. Trigger native browser permission SYNCHRONOUSLY while click gesture is active (no prior await!)
    const currentPerm = getBrowserNotificationPermission();
    const permPromise =
      currentPerm === 'default'
        ? requestMobileNotificationPermission()
        : Promise.resolve(currentPerm);

    // 2. Unmute and enable locally immediately
    setNotificationsMuted(false);
    setIsMuted(false);
    setInAppAlertsActive(true);
    try {
      localStorage.setItem(INAPP_ALERTS_KEY, '1');
    } catch {
      // ignore
    }

    const res = await permPromise;
    setPermission(res);

    // 3. Bind verified customer device in background (never blocks browser prompt)
    if (currentUser?.emailVerified) {
      enableCurrentDeviceForVerifiedUser().catch(() => {});
    }

    return { granted: res === 'granted', inAppActive: true };
  };

  const requestMobileAlerts = async () => {
    const result = await enableAllNotificationsOneClick();
    return result.granted ? 'granted' : getBrowserNotificationPermission();
  };

  const toggleMute = () => {
    const next = !isMuted;
    setNotificationsMuted(next);
    setIsMuted(next);
  };

  const markAsRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReadNotificationIds(next);
      return next;
    });
  };

  const markAllAsRead = () => {
    setReadIds((prev) => {
      const next = new Set(prev);
      customerNotifications.forEach((n) => next.add(n.id));
      saveReadNotificationIds(next);
      return next;
    });
  };

  const sendTestMobileAlert = async () => {
    let perm = permission;
    if (perm === 'default') {
      perm = await requestMobileNotificationPermission();
      setPermission(perm);
    }
    if (perm !== 'granted') return false;
    const testNotif: AppNotification = {
      id: `test-alert-${Date.now()}`,
      type: 'offer',
      title: 'Selvee Mobile Notification Test',
      message: 'Live order status & special offer notifications are active on this device.',
      audience: 'customer',
      actionUrl: '/shop',
      important: true,
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
    };
    return triggerNativeMobileNotification(testNotif);
  };

  const sendTestAdminOrderAlert = async () => {
    if (!isApprovedAdminDevice) return false;
    let perm = permission;
    if (perm === 'default') {
      perm = await requestMobileNotificationPermission();
      setPermission(perm);
    }
    const testNotif: AppNotification = {
      id: `test-admin-ord-${Date.now()}`,
      type: 'admin_new_order',
      title: 'Test Order Alert #999999 — ৳2,450',
      message: 'Instant new-order push alerts are verified and active on this authorized device.',
      audience: 'authorized_devices',
      actionUrl: '/admin?tab=orders',
      important: true,
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
    };
    showInAppToast(testNotif);
    if (!isMuted) playOrderAlertChime();
    if (perm === 'granted') {
      return triggerNativeMobileNotification(testNotif);
    }
    return true;
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications: customerNotifications,
        readIds,
        unreadCount,
        isDrawerOpen,
        setIsDrawerOpen,
        permission,
        isMuted,
        isApprovedAdminDevice,
        isCustomerDeviceBlocked,
        customerVerificationBlockReason,
        allNotificationsActive,
        requestMobileAlerts,
        enableAllNotificationsOneClick,
        toggleMute,
        markAsRead,
        markAllAsRead,
        activeToast,
        dismissToast: () => setActiveToast(null),
        sendTestMobileAlert,
        sendTestAdminOrderAlert,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
};
