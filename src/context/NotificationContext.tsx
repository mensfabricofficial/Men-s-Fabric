import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  sendTestMobileAlert: () => Promise<boolean>;
  sendTestAdminOrderAlert: () => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const STATUS_SNAPSHOT_KEY = 'selvee_order_status_snapshot_v1';

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
    // Ignore autoplay restriction errors
  }
};

export const NotificationProvider: React.FC<{
  children: React.ReactNode;
  onNavigate?: (route: string) => void;
}> = ({ children, onNavigate }) => {
  const { currentUser, customerProfile, profileLoaded, isAdmin, enableCurrentDeviceForVerifiedUser } = useAuth();
  const [allNotifications, setAllNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => getReadNotificationIds());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [isMuted, setIsMuted] = useState<boolean>(() => isNotificationsMuted());
  const [storedDeviceId, setStoredDeviceId] = useState<string | null>(() =>
    adminDeviceService.getStoredDeviceId()
  );
  const [isApprovedAdminDevice, setIsApprovedAdminDevice] = useState<boolean>(false);
  const [deviceStatusResolved, setDeviceStatusResolved] = useState<boolean>(() =>
    !adminDeviceService.getStoredDeviceId()
  );

  const knownIdsRef = useRef<Set<string> | null>(null);
  const seenAdminOrderIdsRef = useRef<Set<string> | null>(null);
  const pushedIdsRef = useRef<Set<string>>(new Set());
  const pushedSigsRef = useRef<Set<string>>(new Set());
  const orderSnapshotsRef = useRef<Record<string, { orderStatus: OrderStatus; paymentStatus: PaymentStatus }>>(
    getStoredOrderSnapshots()
  );
  const allNotificationsRef = useRef<AppNotification[]>([]);
  const appStartedAtRef = useRef<number>(Date.now());

  // Passively keep browser notification permission state in sync
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const syncPermission = () => {
      setPermission(getBrowserNotificationPermission());
    };
    syncPermission();
    window.addEventListener('focus', syncPermission);
    document.addEventListener('visibilitychange', syncPermission);
    return () => {
      window.removeEventListener('focus', syncPermission);
      document.removeEventListener('visibilitychange', syncPermission);
    };
  }, []);

  // Reset knownIds tracking when auth account or admin role changes so logging in never replays stale notifications
  useEffect(() => {
    knownIdsRef.current = null;
    appStartedAtRef.current = Date.now();
  }, [currentUser?.uid, isAdmin]);

  // Track stored admin device ID across tabs
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
      if (emitCount >= 2) {
        setFeedSynced(true);
      }
    });
    return () => {
      window.clearTimeout(timer);
      unsub();
    };
  }, []);

  // Admin Panel ONLY (requires logged-in Admin + approved device): real-time listener on incoming orders
  useEffect(() => {
    if (!currentUser || !isAdmin || !isApprovedAdminDevice) {
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
  }, [currentUser?.uid, isAdmin, isApprovedAdminDevice]);

  // Customer Panel ONLY (logged-in non-admin customer): listen for customer order status/payment updates
  useEffect(() => {
    if (!currentUser?.uid || isAdmin) {
      return;
    }

    const processOrdersSnapshot = (ordersList: Order[]) => {
      const snapshots = orderSnapshotsRef.current;
      let changed = false;

      ordersList.forEach((ord) => {
        if (!ord?.orderNumber) return;
        const prev = snapshots[ord.orderNumber];
        const nextOrderStatus = ord.orderStatus;
        const nextPaymentStatus = ord.paymentStatus;

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

    try {
      const q = query(collection(db, 'orders'), where('customerId', '==', currentUser.uid));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list: Order[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }));
          processOrdersSnapshot(list);
        },
        () => {}
      );
      return () => unsub();
    } catch {
      return undefined;
    }
  }, [currentUser?.uid, isAdmin]);

  // Role & device verification filtering
  const currentCustomerDeviceId = getCustomerDeviceId();
  const isWaitingProfile = Boolean(currentUser && !isAdmin && !profileLoaded);

  const allowedDevicesSet = new Set<string>([
    ...(customerProfile?.verifiedDeviceIds || []),
    ...(customerProfile?.verifiedDeviceId ? [customerProfile.verifiedDeviceId] : []),
  ]);

  const isSocialAccount = Boolean(
    currentUser?.providerData?.some(
      (p) => p.providerId === 'google.com' || p.providerId === 'facebook.com'
    )
  );
  const isVerifiedAccount = Boolean(currentUser?.emailVerified || isSocialAccount);

  let customerVerificationBlockReason: 'unverified_email' | 'other_device' | null = null;
  if (currentUser && !isAdmin && profileLoaded) {
    if (!isVerifiedAccount) {
      customerVerificationBlockReason = 'unverified_email';
    } else if (allowedDevicesSet.size > 0 && !allowedDevicesSet.has(currentCustomerDeviceId)) {
      customerVerificationBlockReason = 'other_device';
    }
  }

  const isCustomerDeviceBlocked = !currentUser || isWaitingProfile || Boolean(customerVerificationBlockReason);
  const allNotificationsActive =
    Boolean(currentUser) &&
    !isMuted &&
    permission === 'granted' &&
    (isAdmin ? isApprovedAdminDevice : !isCustomerDeviceBlocked);

  const liveOrders = orderService.getInstantOrders();
  const customerIdentity = {
    uid: currentUser?.uid,
    email: currentUser?.email || undefined,
    phone: customerProfile?.phone || undefined,
    orderNumbers: liveOrders.map((o) => o.orderNumber).filter(Boolean),
    isAdmin,
    isApprovedAdminDevice,
    emailVerified: isWaitingProfile ? false : isVerifiedAccount,
    verifiedDeviceId: customerProfile?.verifiedDeviceId,
    verifiedDeviceIds: customerProfile?.verifiedDeviceIds,
    currentDeviceId: currentCustomerDeviceId,
  };

  const scopedNotifications = allNotifications.filter((n) =>
    isNotificationForCustomer(n, customerIdentity)
  );

  // On mobile & desktop: trigger native browser permission prompt on the first tap/click after login (no in-site banner)
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser || permission !== 'default') return;
    if (isAdmin && !isApprovedAdminDevice) return;
    if (!isAdmin && (!profileLoaded || !isVerifiedAccount)) return;

    const sessionKey = `selvee_perm_prompted_${currentUser.uid}`;
    try {
      if (sessionStorage.getItem(sessionKey) === '1') return;
    } catch {
      // ignore
    }

    const handleFirstTap = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      // Let explicit enable buttons handle their own request without double-invoking
      if (target?.closest('[data-notif-trigger="true"]')) return;
      try {
        if (sessionStorage.getItem(sessionKey) === '1') return;
        sessionStorage.setItem(sessionKey, '1');
      } catch {
        // ignore
      }
      document.removeEventListener('click', handleFirstTap, true);

      requestMobileNotificationPermission().then((res) => {
        setPermission(res);
        if (res === 'granted') {
          setNotificationsMuted(false);
          setIsMuted(false);
          if (!isAdmin && isVerifiedAccount) {
            enableCurrentDeviceForVerifiedUser().catch(() => {});
          }
        }
      });
    };

    document.addEventListener('click', handleFirstTap, { capture: true });
    return () => {
      document.removeEventListener('click', handleFirstTap, { capture: true });
    };
  }, [
    currentUser?.uid,
    permission,
    isAdmin,
    isApprovedAdminDevice,
    profileLoaded,
    isVerifiedAccount,
    enableCurrentDeviceForVerifiedUser,
  ]);

  // Trigger ONLY native Browser Notifications when logged in & browser permission granted
  useEffect(() => {
    if (!currentUser || isWaitingProfile || !deviceStatusResolved || !feedSynced) return;
    if (permission !== 'granted' || isMuted) {
      if (knownIdsRef.current === null) {
        knownIdsRef.current = new Set(scopedNotifications.map((n) => n.id));
      } else {
        scopedNotifications.forEach((n) => knownIdsRef.current!.add(n.id));
      }
      return;
    }

    const canDeliverForRole = (notif: AppNotification): boolean => {
      if (isAdmin) {
        return Boolean(isApprovedAdminDevice && notif.type === 'admin_new_order' && notif.audience === 'authorized_devices');
      }
      return Boolean(!isCustomerDeviceBlocked && notif.audience !== 'authorized_devices');
    };

    if (knownIdsRef.current === null) {
      knownIdsRef.current = new Set(scopedNotifications.map((n) => n.id));
      const justCreated = scopedNotifications.filter(
        (n) => (n.createdAtMs || 0) >= appStartedAtRef.current - 3000 && canDeliverForRole(n)
      );
      if (justCreated.length === 0) return;
      const topLive = justCreated[0];
      const sig = `${topLive.type}|${topLive.title}|${topLive.targetOrderNumber || ''}|${topLive.message}`;
      if (
        !readIds.has(topLive.id) &&
        !pushedIdsRef.current.has(topLive.id) &&
        !pushedSigsRef.current.has(sig)
      ) {
        pushedIdsRef.current.add(topLive.id);
        pushedSigsRef.current.add(sig);
        triggerNativeMobileNotification(topLive);
        if (topLive.type === 'admin_new_order' && isAdmin && isApprovedAdminDevice) {
          playOrderAlertChime();
        }
      }
      return;
    }

    const newlyArrived = scopedNotifications.filter((n) => !knownIdsRef.current!.has(n.id));
    if (newlyArrived.length > 0) {
      newlyArrived.forEach((n) => knownIdsRef.current!.add(n.id));
      const topNotif = newlyArrived.find((n) => canDeliverForRole(n));
      if (!topNotif) return;
      const isLiveAlert = (topNotif.createdAtMs || 0) >= appStartedAtRef.current - 5 * 60 * 1000;
      const sig = `${topNotif.type}|${topNotif.title}|${topNotif.targetOrderNumber || ''}|${topNotif.message}`;

      if (
        isLiveAlert &&
        !readIds.has(topNotif.id) &&
        !pushedIdsRef.current.has(topNotif.id) &&
        !pushedSigsRef.current.has(sig)
      ) {
        pushedIdsRef.current.add(topNotif.id);
        pushedSigsRef.current.add(sig);
        triggerNativeMobileNotification(topNotif);
        if (topNotif.type === 'admin_new_order' && isAdmin && isApprovedAdminDevice) {
          playOrderAlertChime();
        }
      }
    }
  }, [
    currentUser,
    isAdmin,
    isApprovedAdminDevice,
    isCustomerDeviceBlocked,
    scopedNotifications,
    readIds,
    permission,
    isMuted,
    isWaitingProfile,
    deviceStatusResolved,
    feedSynced,
  ]);

  const unreadCount = scopedNotifications.filter((n) => !readIds.has(n.id)).length;

  const enableAllNotificationsOneClick = async (): Promise<{
    granted: boolean;
    inAppActive: boolean;
  }> => {
    const currentPerm = getBrowserNotificationPermission();
    const permPromise =
      currentPerm === 'default'
        ? requestMobileNotificationPermission()
        : Promise.resolve(currentPerm);

    const res = await permPromise;
    setPermission(res);

    if (res === 'granted') {
      setNotificationsMuted(false);
      setIsMuted(false);
    }

    if (currentUser && !isAdmin && isVerifiedAccount) {
      enableCurrentDeviceForVerifiedUser().catch(() => {});
    }

    return { granted: res === 'granted', inAppActive: res === 'granted' };
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
      scopedNotifications.forEach((n) => next.add(n.id));
      saveReadNotificationIds(next);
      return next;
    });
  };

  const sendTestMobileAlert = async () => {
    if (!currentUser || isAdmin) return false;
    let perm = permission;
    if (perm === 'default') {
      perm = await requestMobileNotificationPermission();
      setPermission(perm);
    }
    if (perm !== 'granted') return false;
    const testNotif: AppNotification = {
      id: `test-alert-${Date.now()}`,
      type: 'offer',
      title: 'Selvee Browser Notification Test',
      message: 'Live order status & special offer browser notifications are active on this device.',
      audience: 'customer',
      actionUrl: '/shop',
      important: true,
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
    };
    return triggerNativeMobileNotification(testNotif);
  };

  const sendTestAdminOrderAlert = async () => {
    if (!currentUser || !isAdmin || !isApprovedAdminDevice) return false;
    let perm = permission;
    if (perm === 'default') {
      perm = await requestMobileNotificationPermission();
      setPermission(perm);
    }
    if (perm !== 'granted') return false;
    const testNotif: AppNotification = {
      id: `test-admin-ord-${Date.now()}`,
      type: 'admin_new_order',
      title: 'Test Order Alert #999999 — ৳2,450',
      message: 'Instant new-order browser notifications are active on this approved admin device.',
      audience: 'authorized_devices',
      actionUrl: '/admin?tab=orders',
      important: true,
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
    };
    if (!isMuted) playOrderAlertChime();
    return triggerNativeMobileNotification(testNotif);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications: scopedNotifications,
        readIds,
        unreadCount,
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

