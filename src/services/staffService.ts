import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  AdminTabId,
  OrderActionPermission,
  StaffAccount,
  StaffLoginLog,
} from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';
import { adminDeviceService } from './adminDeviceService';

const LOCAL_STAFF_KEY = 'mf_staff_directory_v1';
const LOCAL_LOGS_KEY = 'mf_staff_activity_logs_v1';
const ACTIVE_LOG_ID_KEY = 'mf_active_staff_log_id_v1';

const ADMINS_DOC = doc(db, 'settings', 'adminsList');
const LOGS_DOC = doc(db, 'settings', 'staff_activity_logs');

export const ALL_ADMIN_TABS: AdminTabId[] = [
  'dashboard',
  'pos',
  'desk_order_verify',
  'desk_payment_verify',
  'desk_stock_packing',
  'desk_delivery_dispatch',
  'pipeline',
  'sales_history',
  'returns',
  'products',
  'stock',
  'categories',
  'purchases',
  'suppliers',
  'expenses',
  'pnl',
  'customers',
  'coupons',
  'delivery',
  'reviews',
  'banners',
  'notifications',
  'admins',
  'audit',
  'settings',
];

export const ALL_ORDER_ACTIONS: OrderActionPermission[] = [
  'order_approve',
  'payment_verify',
  'packaging',
  'shipping',
  'order_return',
  'order_cancel',
];

export const MENU_PERMISSION_OPTIONS: { id: AdminTabId; label: string }[] = [
  { id: 'dashboard', label: 'ড্যাশবোর্ড (Dashboard)' },
  { id: 'pos', label: 'পয়েন্ট অব সেল (Point of Sale)' },
  { id: 'pipeline', label: 'অর্ডারস (Orders)' },
  { id: 'sales_history', label: 'বিক্রয় হিস্টোরি (Sales History)' },
  { id: 'returns', label: 'রিটার্ন (Returns)' },
  { id: 'products', label: 'প্রোডাক্ট ক্যাটালগ (Products)' },
  { id: 'stock', label: 'স্টক ও ইনভেন্টরি (Stock)' },
  { id: 'categories', label: 'ক্যাটাগরি (Categories)' },
  { id: 'purchases', label: 'পণ্য ক্রয় (Purchases)' },
  { id: 'suppliers', label: 'সাপ্লায়ার (Suppliers)' },
  { id: 'expenses', label: 'খরচ এন্ট্রি (Expenses)' },
  { id: 'pnl', label: 'লাভ-লস হিসাব (Profit & Loss)' },
  { id: 'customers', label: 'কাস্টমার লেজার (Customers)' },
  { id: 'coupons', label: 'কুপন (Coupons)' },
  { id: 'delivery', label: 'ডেলিভারি জোন (Delivery Zones)' },
  { id: 'reviews', label: 'রিভিউ (Reviews)' },
  { id: 'banners', label: 'ব্যানার (Banners)' },
  { id: 'notifications', label: 'নোটিফিকেশন (Notifications)' },
  { id: 'admins', label: 'স্টাফ ম্যানেজমেন্ট (Staff & Roles)' },
  { id: 'audit', label: 'অডিট লগ (Audit Logs)' },
  { id: 'settings', label: 'স্টোর সেটিংস (Store Settings)' },
];

export const ORDER_ACTION_OPTIONS: {
  id: OrderActionPermission;
  label: string;
  desc: string;
}[] = [
  {
    id: 'order_approve',
    label: '1. Order Verify — Customer & Initial Payment',
    desc: 'Sequential customer field verify, correction & initial payment amount/method check',
  },
  {
    id: 'payment_verify',
    label: '2. Payment Verify — Payment & Finance',
    desc: 'Verify transactions/TrxID, COD awaiting status & post-delivery COD reconciliation',
  },
  {
    id: 'packaging',
    label: '3. Stock Verify — Stock Verification & Update',
    desc: 'Verify SKU stock and deduct inventory once (idempotent)',
  },
  {
    id: 'shipping',
    label: '4. Delivery — Packing & Delivery',
    desc: '11-step sequential check, pack, courier, tracking & delivered progression',
  },
  { id: 'order_return', label: 'Order Return', desc: 'Mark order as returned' },
  { id: 'order_cancel', label: 'Order Cancel', desc: 'Cancel active orders' },
];

export const ROLE_PRESETS: Record<
  StaffAccount['role'],
  {
    designation: string;
    menus: AdminTabId[];
    orders: OrderActionPermission[];
  }
> = {
  super_admin: {
    designation: 'Super Administrator',
    menus: ALL_ADMIN_TABS,
    orders: ALL_ORDER_ACTIONS,
  },
  store_manager: {
    designation: 'Order & Store Manager',
    menus: [
      'dashboard',
      'pos',
      'pipeline',
      'sales_history',
      'returns',
      'products',
      'stock',
      'customers',
      'delivery',
    ],
    orders: ['order_approve', 'payment_verify', 'packaging', 'shipping', 'order_return', 'order_cancel'],
  },
  inventory_editor: {
    designation: 'Stock Verification & Update',
    menus: ['dashboard', 'pipeline', 'products', 'stock', 'purchases', 'suppliers', 'categories'],
    orders: ['packaging'],
  },
  support_staff: {
    designation: 'Customer & Initial Payment Verification',
    menus: ['dashboard', 'pipeline'],
    orders: ['order_approve', 'order_cancel'],
  },
  custom_staff: {
    designation: 'Staff Member',
    menus: ['dashboard'],
    orders: [],
  },
};

const normalizeStaffRecord = (raw: any): StaffAccount => {
  const role: StaffAccount['role'] = raw?.role || 'custom_staff';
  const preset = ROLE_PRESETS[role] || ROLE_PRESETS.custom_staff;
  const fullAccess = Boolean(raw?.fullAccess || raw?.isSuperAdmin || role === 'super_admin');

  const rawMenus = fullAccess
    ? ALL_ADMIN_TABS
    : Array.isArray(raw?.menuPermissions)
    ? raw.menuPermissions
    : preset.menus;

  const menuPermissions: AdminTabId[] = Array.from(
    new Set(
      rawMenus.map((m: string) => (m === 'orders' ? 'pipeline' : m))
    )
  ).filter((m): m is AdminTabId => ALL_ADMIN_TABS.includes(m as AdminTabId));

  const orderPermissions: OrderActionPermission[] = fullAccess
    ? ALL_ORDER_ACTIONS
    : Array.isArray(raw?.orderPermissions)
    ? raw.orderPermissions
    : preset.orders;

  const email = (raw?.email || '').trim().toLowerCase();
  const fallbackUsername = email ? email.split('@')[0] : `staff_${Date.now().toString().slice(-4)}`;

  return {
    id: raw?.id || `adm_${Date.now()}`,
    name: raw?.name || 'Staff Member',
    designation: raw?.designation || preset.designation,
    email,
    username: (raw?.username || fallbackUsername).trim().toLowerCase(),
    passwordPin: raw?.passwordPin || '',
    phone: raw?.phone || '',
    role,
    isSuperAdmin: fullAccess,
    fullAccess,
    menuPermissions,
    orderPermissions,
    active: raw?.active !== false,
    addedBy: raw?.addedBy || 'Store Owner',
    createdAt: raw?.createdAt || new Date().toISOString(),
    updatedAt: raw?.updatedAt,
    notes: raw?.notes || '',
  };
};

// Shared singleton live state (never emits stale localStorage before Firestore onSnapshot)
let liveStaff: StaffAccount[] | null = null;
let liveStaffLogs: StaffLoginLog[] | null = null;
const staffListeners = new Set<(list: StaffAccount[]) => void>();
const logsListeners = new Set<(logs: StaffLoginLog[]) => void>();
let sharedStaffUnsub: Unsubscribe | null = null;
let sharedLogsUnsub: Unsubscribe | null = null;

const readLocalStaff = (): StaffAccount[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STAFF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalizeStaffRecord);
    }
  } catch {
    // ignore
  }
  return [];
};

const persistLocalStaff = (list: StaffAccount[]) => {
  try {
    localStorage.setItem(LOCAL_STAFF_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
};

const emitStaff = (list: StaffAccount[]) => {
  liveStaff = list;
  persistLocalStaff(list);
  staffListeners.forEach((cb) => cb(list));
};

const readLocalLogs = (): StaffLoginLog[] => {
  try {
    const raw = localStorage.getItem(LOCAL_LOGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
};

const persistLocalLogs = (list: StaffLoginLog[]) => {
  try {
    localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
};

const emitLogs = (list: StaffLoginLog[]) => {
  liveStaffLogs = list;
  persistLocalLogs(list);
  logsListeners.forEach((cb) => cb(list));
};

export const staffService = {
  getInstantStaff(): StaffAccount[] {
    return liveStaff ?? [];
  },

  getLocalStaff(): StaffAccount[] {
    return liveStaff ?? readLocalStaff();
  },

  async fetchAllStaff(): Promise<StaffAccount[]> {
    try {
      const snap = await getDoc(ADMINS_DOC);
      if (snap.exists()) {
        const map = snap.data()?.admins || {};
        const list = Object.values(map).map(normalizeStaffRecord);
        emitStaff(list);
        return list;
      }
    } catch {
      // fallback to live memory or local
    }
    return liveStaff ?? readLocalStaff();
  },

  subscribeToStaff(cb: (list: StaffAccount[]) => void): Unsubscribe {
    staffListeners.add(cb);
    if (liveStaff !== null) {
      cb(liveStaff);
    }

    if (!sharedStaffUnsub) {
      sharedStaffUnsub = onSnapshot(
        ADMINS_DOC,
        (snap) => {
          if (snap.exists()) {
            const map = snap.data()?.admins || {};
            const list = Object.values(map).map(normalizeStaffRecord);
            emitStaff(list);
          } else {
            emitStaff([]);
          }
        },
        () => {}
      );
    }

    return () => {
      staffListeners.delete(cb);
    };
  },

  async saveStaff(account: StaffAccount): Promise<StaffAccount> {
    const normalized = normalizeStaffRecord({
      ...account,
      updatedAt: new Date().toISOString(),
    });

    const current = liveStaff ?? readLocalStaff();
    const exists = current.some((s) => s.id === normalized.id);
    const next = exists
      ? current.map((s) => (s.id === normalized.id ? normalized : s))
      : [normalized, ...current];
    emitStaff(next);

    try {
      await setDoc(
        ADMINS_DOC,
        {
          admins: {
            [normalized.id]: sanitizeForFirestore(normalized),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setDoc(
        doc(db, 'admins', normalized.id),
        sanitizeForFirestore({
          email: normalized.email,
          username: normalized.username,
          name: normalized.name,
          designation: normalized.designation,
          role: normalized.role,
          active: normalized.active,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      ).catch(() => {});
    } catch (err) {
      console.warn('Staff Firestore sync notice:', err);
    }

    return normalized;
  },

  async deleteStaff(staffId: string): Promise<void> {
    const next = (liveStaff ?? readLocalStaff()).filter((s) => s.id !== staffId);
    emitStaff(next);

    try {
      await updateDoc(ADMINS_DOC, {
        [`admins.${staffId}`]: deleteField(),
      });
    } catch {
      // ignore if offline
    }
  },

  async findStaffByIdentifier(identifier: string): Promise<StaffAccount | null> {
    const clean = identifier.trim().toLowerCase();
    if (!clean) return null;

    const list = await this.fetchAllStaff();
    const found = list.find(
      (s) =>
        s.active !== false &&
        (s.username.toLowerCase() === clean || s.email.toLowerCase() === clean)
    );
    return found || null;
  },

  async verifyStaffCredentials(identifier: string, secret: string): Promise<StaffAccount | null> {
    const cleanId = identifier.trim().toLowerCase();
    const cleanSecret = secret.trim();
    if (!cleanId || !cleanSecret) return null;

    const list = await this.fetchAllStaff();
    const match = list.find(
      (s) =>
        s.active !== false &&
        s.passwordPin &&
        s.passwordPin === cleanSecret &&
        (s.username.toLowerCase() === cleanId || s.email.toLowerCase() === cleanId)
    );
    return match || null;
  },

  hasMenuAccess(staff: StaffAccount | null, isSuperAdmin: boolean, tab: AdminTabId): boolean {
    if (isSuperAdmin) return true;
    if (!staff || staff.active === false) return false;
    if (staff.fullAccess || staff.isSuperAdmin) return true;
    const menus = Array.isArray(staff.menuPermissions) ? staff.menuPermissions : [];
    if (menus.includes(tab)) return true;

    // Legacy support: staff created before the 4-desk split with 'pipeline' + order action
    if (menus.includes('pipeline')) {
      const actions = Array.isArray(staff.orderPermissions) ? staff.orderPermissions : [];
      if (tab === 'desk_order_verify' && actions.includes('order_approve')) return true;
      if (tab === 'desk_payment_verify' && actions.includes('payment_verify')) return true;
      if (tab === 'desk_stock_packing' && actions.includes('packaging')) return true;
      if (tab === 'desk_delivery_dispatch' && actions.includes('shipping')) return true;
    }
    return false;
  },

  hasOrderActionAccess(
    staff: StaffAccount | null,
    isSuperAdmin: boolean,
    action: OrderActionPermission
  ): boolean {
    if (isSuperAdmin) return true;
    if (!staff || staff.active === false) return false;
    if (staff.fullAccess || staff.isSuperAdmin) return true;
    return Array.isArray(staff.orderPermissions) && staff.orderPermissions.includes(action);
  },

  // ======================== LIVE LOGIN & ACTIVITY HISTORY ========================
  getInstantLogs(): StaffLoginLog[] {
    return liveStaffLogs ?? [];
  },

  getLocalLogs(): StaffLoginLog[] {
    return liveStaffLogs ?? readLocalLogs();
  },

  subscribeToLogs(cb: (logs: StaffLoginLog[]) => void): Unsubscribe {
    logsListeners.add(cb);
    if (liveStaffLogs !== null) {
      cb(liveStaffLogs);
    }

    if (!sharedLogsUnsub) {
      sharedLogsUnsub = onSnapshot(
        LOGS_DOC,
        (snap) => {
          if (snap.exists() && Array.isArray(snap.data()?.logs)) {
            const remote = snap.data().logs as StaffLoginLog[];
            emitLogs(remote);
          } else {
            emitLogs([]);
          }
        },
        () => {}
      );
    }

    return () => {
      logsListeners.delete(cb);
    };
  },

  async recordStaffLogin(params: {
    staffId: string;
    staffName: string;
    designation: string;
    email: string;
    username: string;
  }): Promise<string> {
    const nowIso = new Date().toISOString();
    const deviceInfo = adminDeviceService.getDeviceInfo();
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const entry: StaffLoginLog = {
      id: logId,
      staffId: params.staffId,
      staffName: params.staffName,
      designation: params.designation,
      email: params.email,
      username: params.username,
      device: deviceInfo.deviceName,
      status: 'online',
      loginTime: nowIso,
      lastActiveTime: nowIso,
      durationMs: 0,
    };

    try {
      sessionStorage.setItem(ACTIVE_LOG_ID_KEY, logId);
    } catch {
      // ignore
    }

    // Read latest remote logs so we don't clobber other staff's entries
    let baseLogs = liveStaffLogs ?? readLocalLogs();
    try {
      const snap = await getDoc(LOGS_DOC);
      if (snap.exists() && Array.isArray(snap.data()?.logs)) {
        baseLogs = snap.data().logs as StaffLoginLog[];
      }
    } catch {
      // use local
    }

    const next = [entry, ...baseLogs].slice(0, 80);
    emitLogs(next);

    try {
      await setDoc(
        LOGS_DOC,
        sanitizeForFirestore({ logs: next, updatedAt: serverTimestamp() }),
        { merge: true }
      );
    } catch {
      // offline
    }

    return logId;
  },

  async touchCurrentSession(): Promise<void> {
    let logId = '';
    try {
      logId = sessionStorage.getItem(ACTIVE_LOG_ID_KEY) || '';
    } catch {
      return;
    }
    if (!logId) return;

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const logs = liveStaffLogs ?? readLocalLogs();
    const target = logs.find((l) => l.id === logId);
    if (!target || target.status !== 'online') return;

    const durationMs = Math.max(0, nowMs - new Date(target.loginTime).getTime());
    const next = logs.map((l) =>
      l.id === logId ? { ...l, lastActiveTime: nowIso, durationMs } : l
    );
    emitLogs(next);

    try {
      await setDoc(
        LOGS_DOC,
        sanitizeForFirestore({ logs: next, updatedAt: serverTimestamp() }),
        { merge: true }
      );
    } catch {
      // ignore
    }
  },

  async recordStaffLogout(): Promise<void> {
    let logId = '';
    try {
      logId = sessionStorage.getItem(ACTIVE_LOG_ID_KEY) || '';
      sessionStorage.removeItem(ACTIVE_LOG_ID_KEY);
    } catch {
      return;
    }
    if (!logId) return;

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    let baseLogs = liveStaffLogs ?? readLocalLogs();
    try {
      const snap = await getDoc(LOGS_DOC);
      if (snap.exists() && Array.isArray(snap.data()?.logs)) {
        baseLogs = snap.data().logs as StaffLoginLog[];
      }
    } catch {
      // use local
    }

    const next = baseLogs.map((l) => {
      if (l.id !== logId) return l;
      const durationMs = Math.max(0, nowMs - new Date(l.loginTime).getTime());
      return {
        ...l,
        status: 'logged_out' as const,
        logoutTime: nowIso,
        lastActiveTime: nowIso,
        durationMs,
      };
    });
    emitLogs(next);

    try {
      await setDoc(
        LOGS_DOC,
        sanitizeForFirestore({ logs: next, updatedAt: serverTimestamp() }),
        { merge: true }
      );
    } catch {
      // ignore
    }
  },

  async clearOldLogs(): Promise<void> {
    const activeOnly = (liveStaffLogs ?? readLocalLogs()).filter((l) => l.status === 'online').slice(0, 10);
    emitLogs(activeOnly);
    try {
      await setDoc(
        LOGS_DOC,
        sanitizeForFirestore({ logs: activeOnly, updatedAt: serverTimestamp() }),
        { merge: true }
      );
    } catch {
      // ignore
    }
  },
};
