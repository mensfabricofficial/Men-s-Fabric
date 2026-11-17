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
  requestMobileAlerts: () => Promise<NotificationPermission | 'unsupported'>;
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
  const { currentUser, customerProfile, profileLoaded } = useAuth();
  const [allNotifications, setAllNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => getReadNotificationIds());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [isMuted, setIsMuted] = useState<boolean>(() => isNotificationsMuted());
  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);
  const [storedDeviceId, setStoredDeviceId] = useState<string | null>(() =>
    adminDeviceService.getStoredDeviceId()
  );
  const [isApprovedAdminDevice, setIsApprovedAdminDevice] = useState<boolean>(false);

  const knownIdsRef = useRef<Set<string> | null>(null);
  const seenAdminOrderIdsRef = useRef<Set<string> | null>(null);
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
      seenAdminOrderIdsRef.current = null;
      return;
    }

    const unsub = adminDeviceService.subscribeToDeviceStatus(storedDeviceId, (status) => {
      const approved = status === 'approved';
      setIsApprovedAdminDevice(approved);
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

  // Subscribe to notifications feed
  useEffect(() => {
    const unsub = notificationService.subscribeToAllNotifications((items) => {
      setAllNotifications(items);
    });
    return () => unsub();
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
      const snapshots = getStoredOrderSnapshots();
      let changed = false;

      ordersList.forEach((ord) => {
        if (!ord?.orderNumber) return;
        const prev = snapshots[ord.orderNumber];
        if (prev) {
          if (prev.orderStatus !== ord.orderStatus) {
            notificationService
              .notifyOrderStatusChanged({
                orderNumber: ord.orderNumber,
                status: ord.orderStatus,
                customerId: ord.customerId,
                customerEmail: ord.customerEmail || ord.shippingAddress?.email,
                customerPhone: ord.customerPhone || ord.shippingAddress?.phone,
              })
              .catch(() => {});
          }
          if (prev.paymentStatus !== ord.paymentStatus && ord.paymentStatus !== 'pending') {
            notificationService
              .notifyPaymentStatusChanged({
                orderNumber: ord.orderNumber,
                paymentStatus: ord.paymentStatus,
                customerId: ord.customerId,
                customerEmail: ord.customerEmail || ord.shippingAddress?.email,
                customerPhone: ord.customerPhone || ord.shippingAddress?.phone,
              })
              .catch(() => {});
          }
        }
        if (
          !prev ||
          prev.orderStatus !== ord.orderStatus ||
          prev.paymentStatus !== ord.paymentStatus
        ) {
          snapshots[ord.orderNumber] = {
            orderStatus: ord.orderStatus,
            paymentStatus: ord.paymentStatus,
          };
          changed = true;
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

  // Filter notifications strictly by customer identity + verified customer device + approved admin device status
  const currentCustomerDeviceId = getCustomerDeviceId();
  const isWaitingProfile = Boolean(currentUser && !profileLoaded && !isApprovedAdminDevice);

  let customerVerificationBlockReason: 'unverified_email' | 'other_device' | null = null;
  if (currentUser && !isApprovedAdminDevice && profileLoaded) {
    if (!currentUser.emailVerified) {
      customerVerificationBlockReason = 'unverified_email';
    } else if (
      customerProfile?.verifiedDeviceId &&
      customerProfile.verifiedDeviceId !== currentCustomerDeviceId
    ) {
      customerVerificationBlockReason = 'other_device';
    }
  }

  const isCustomerDeviceBlocked = isWaitingProfile || Boolean(customerVerificationBlockReason);

  const localOrders = orderService.getLocalOrders();
  const customerIdentity = {
    uid: currentUser?.uid,
    email: currentUser?.email || undefined,
    phone: customerProfile?.phone || undefined,
    orderNumbers: localOrders.map((o) => o.orderNumber).filter(Boolean),
    isApprovedAdminDevice,
    emailVerified: isWaitingProfile ? false : Boolean(currentUser?.emailVerified),
    verifiedDeviceId: customerProfile?.verifiedDeviceId,
    currentDeviceId: currentCustomerDeviceId,
  };

  const customerNotifications = allNotifications.filter((n) =>
    isNotificationForCustomer(n, customerIdentity)
  );

  // Detect brand-new incoming notifications -> trigger mobile OS push + subtle in-app toast
  useEffect(() => {
    if (isWaitingProfile) return;

    if (customerNotifications.length === 0) {
      if (knownIdsRef.current === null) knownIdsRef.current = new Set();
      return;
    }

    if (knownIdsRef.current === null) {
      knownIdsRef.current = new Set(customerNotifications.map((n) => n.id));
      // Also push any very recent (< 3 min old) unread notification not pushed yet
      const newest = customerNotifications[0];
      if (newest && !readIds.has(newest.id) && Date.now() - (newest.createdAtMs || 0) < 3 * 60 * 1000) {
        triggerNativeMobileNotification(newest);
      }
      return;
    }

    const newlyArrived = customerNotifications.filter((n) => !knownIdsRef.current!.has(n.id));
    if (newlyArrived.length > 0) {
      newlyArrived.forEach((n) => knownIdsRef.current!.add(n.id));
      const topNotif = newlyArrived[0];
      if (topNotif && !readIds.has(topNotif.id)) {
        showInAppToast(topNotif);
        triggerNativeMobileNotification(topNotif);
        if (topNotif.type === 'admin_new_order' && isApprovedAdminDevice && !isMuted) {
          playOrderAlertChime();
        }
      }
    }
  }, [customerNotifications, readIds, showInAppToast, isApprovedAdminDevice, isMuted, isWaitingProfile]);

  const unreadCount = customerNotifications.filter((n) => !readIds.has(n.id)).length;

  const requestMobileAlerts = async () => {
    const res = await requestMobileNotificationPermission();
    setPermission(res);
    setIsMuted(isNotificationsMuted());
    if (res === 'granted') {
      const sample = await notificationService.publishNotification({
        id: `welcome-alerts-${Date.now().toString(36)}`,
        type: 'announcement',
        title: isApprovedAdminDevice ? 'Admin Order & Mobile Alerts Enabled' : 'Mobile Alerts Enabled',
        message: isApprovedAdminDevice
          ? 'This authorized device will now receive instant mobile notifications for every new customer order.'
          : 'You will now receive instant updates on orders, delivery status, and exclusive Selvee offers.',
        audience: isApprovedAdminDevice ? 'authorized_devices' : 'customer',
        targetUid: currentUser?.uid || undefined,
        targetEmail: currentUser?.email || undefined,
        targetPhone: customerProfile?.phone || undefined,
        targetOrderNumber: localOrders[0]?.orderNumber || undefined,
        actionUrl: isApprovedAdminDevice ? '/admin?tab=orders' : '/shop',
        important: false,
        createdBy: 'system',
      });
      await triggerNativeMobileNotification(sample);
    }
    return res;
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
        requestMobileAlerts,
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
