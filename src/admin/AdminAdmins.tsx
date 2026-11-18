import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Search,
  Trash2,
  Edit,
  Check,
  AlertCircle,
  UserCheck,
  UserX,
  Copy,
  Save,
  RotateCcw,
  Radio,
  History,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  AdminTabId,
  Order,
  OrderActionPermission,
  StaffAccount,
  StaffLoginLog,
} from '../types';
import { useAuth } from '../context/AuthContext';
import { settingsService } from '../services/settingsService';
import { orderService } from '../services/orderService';
import {
  staffService,
  ALL_ADMIN_TABS,
  ALL_ORDER_ACTIONS,
  MENU_PERMISSION_OPTIONS,
  ORDER_ACTION_OPTIONS,
} from '../services/staffService';
import { formatDatePart, formatTimePart, formatDateTime } from '../lib/dateFormat';

const formatDuration = (ms?: number): string => {
  if (!ms || ms < 0) return '0m';
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${totalSec}s`;
};

const QUICK_ROLE_TEMPLATES: {
  label: string;
  designation: string;
  menus: AdminTabId[];
  orders: OrderActionPermission[];
  fullAccess?: boolean;
}[] = [
  {
    label: 'Order Verifier',
    designation: 'Order Verification Officer',
    menus: ['dashboard', 'pipeline', 'orders', 'customers'],
    orders: ['order_approve', 'order_cancel', 'order_return'],
  },
  {
    label: 'Payment Verify',
    designation: 'Payment & Accounts Officer',
    menus: ['dashboard', 'pipeline', 'orders', 'pos', 'expenses'],
    orders: ['payment_verify', 'order_cancel'],
  },
  {
    label: 'Stock & Pack',
    designation: 'Inventory & Packaging Officer',
    menus: ['dashboard', 'pipeline', 'orders', 'products', 'purchases', 'suppliers', 'categories'],
    orders: ['packaging'],
  },
  {
    label: 'Delivery',
    designation: 'Delivery & Dispatch Coordinator',
    menus: ['dashboard', 'pipeline', 'orders', 'delivery'],
    orders: ['shipping', 'order_return'],
  },
  {
    label: 'Full Access Admin',
    designation: 'Store Manager (Full Access)',
    menus: ALL_ADMIN_TABS,
    orders: ALL_ORDER_ACTIONS,
    fullAccess: true,
  },
];

export const AdminAdmins: React.FC = () => {
  const { currentUser, staffProfile } = useAuth();
  const [staffList, setStaffList] = useState<StaffAccount[]>(() => staffService.getLocalStaff());
  const [loginLogs, setLoginLogs] = useState<StaffLoginLog[]>(() => staffService.getLocalLogs());
  const [orders, setOrders] = useState<Order[]>(() => orderService.getLocalOrders());
  const [loading, setLoading] = useState(true);

  // Left form state
  const [editingStaff, setEditingStaff] = useState<StaffAccount | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesignation, setFormDesignation] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPin, setFormPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [formPhone, setFormPhone] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formFullAccess, setFormFullAccess] = useState(false);
  const [formMenuPerms, setFormMenuPerms] = useState<AdminTabId[]>(['dashboard', 'orders']);
  const [formOrderPerms, setFormOrderPerms] = useState<OrderActionPermission[]>(['order_approve']);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [historyTab, setHistoryTab] = useState<'logins' | 'approvals'>('logins');

  useEffect(() => {
    setLoading(true);
    staffService
      .fetchAllStaff()
      .then(setStaffList)
      .finally(() => setLoading(false));

    orderService.getAllOrdersAdmin().then(setOrders).catch(() => {});

    const unsubStaff = staffService.subscribeToStaff(setStaffList);
    const unsubLogs = staffService.subscribeToLogs(setLoginLogs);
    const handleOrders = () => setOrders(orderService.getLocalOrders());
    window.addEventListener('mf_orders_updated', handleOrders);

    return () => {
      unsubStaff();
      unsubLogs();
      window.removeEventListener('mf_orders_updated', handleOrders);
    };
  }, []);

  const showToastMsg = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 3500);
  };

  const resetForm = () => {
    setEditingStaff(null);
    setFormName('');
    setFormDesignation('');
    setFormEmail('');
    setFormUsername('');
    setFormPin('');
    setFormPhone('');
    setFormActive(true);
    setFormFullAccess(false);
    setFormMenuPerms(['dashboard', 'orders']);
    setFormOrderPerms(['order_approve']);
    setErrorMsg('');
  };

  const loadForEdit = (staff: StaffAccount) => {
    setEditingStaff(staff);
    setFormName(staff.name);
    setFormDesignation(staff.designation || '');
    setFormEmail(staff.email);
    setFormUsername(staff.username);
    setFormPin(staff.passwordPin || '');
    setFormPhone(staff.phone || '');
    setFormActive(staff.active !== false);
    const full = Boolean(staff.fullAccess || staff.isSuperAdmin || staff.role === 'super_admin');
    setFormFullAccess(full);
    setFormMenuPerms(full ? ALL_ADMIN_TABS : staff.menuPermissions || []);
    setFormOrderPerms(full ? ALL_ORDER_ACTIONS : staff.orderPermissions || []);
    setErrorMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const applyTemplate = (tpl: (typeof QUICK_ROLE_TEMPLATES)[number]) => {
    setFormDesignation(tpl.designation);
    setFormMenuPerms(tpl.menus);
    setFormOrderPerms(tpl.orders);
    setFormFullAccess(Boolean(tpl.fullAccess));
  };

  const toggleMenuPerm = (tab: AdminTabId) => {
    setFormFullAccess(false);
    setFormMenuPerms((prev) =>
      prev.includes(tab) ? prev.filter((t) => t !== tab) : [...prev, tab]
    );
  };

  const toggleAllMenus = () => {
    if (formMenuPerms.length === ALL_ADMIN_TABS.length) {
      setFormMenuPerms([]);
      setFormFullAccess(false);
    } else {
      setFormMenuPerms(ALL_ADMIN_TABS);
      if (formOrderPerms.length === ALL_ORDER_ACTIONS.length) setFormFullAccess(true);
    }
  };

  const toggleOrderPerm = (act: OrderActionPermission) => {
    setFormFullAccess(false);
    setFormOrderPerms((prev) =>
      prev.includes(act) ? prev.filter((a) => a !== act) : [...prev, act]
    );
  };

  const toggleAllOrderActions = () => {
    if (formOrderPerms.length === ALL_ORDER_ACTIONS.length) {
      setFormOrderPerms([]);
      setFormFullAccess(false);
    } else {
      setFormOrderPerms(ALL_ORDER_ACTIONS);
      if (formMenuPerms.length === ALL_ADMIN_TABS.length) setFormFullAccess(true);
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanName = formName.trim();
    const cleanDesig = formDesignation.trim() || 'Staff Member';
    const cleanEmail = formEmail.trim().toLowerCase();
    const cleanUser = formUsername.trim().toLowerCase().replace(/\s+/g, '');
    const cleanPin = formPin.trim();

    if (!cleanName) {
      setErrorMsg('Please enter Full Name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid Email Address.');
      return;
    }
    if (!cleanUser) {
      setErrorMsg('Please enter a Username.');
      return;
    }
    if (!cleanPin || cleanPin.length < 4) {
      setErrorMsg('Please set a Password / PIN (at least 4 characters).');
      return;
    }
    if (formMenuPerms.length === 0) {
      setErrorMsg('Select at least one Menu Permission for this staff account.');
      return;
    }

    const duplicateUser = staffList.find(
      (s) =>
        s.id !== editingStaff?.id &&
        (s.username.toLowerCase() === cleanUser || s.email.toLowerCase() === cleanEmail)
    );
    if (duplicateUser) {
      setErrorMsg('Another staff account already uses this Username or Email.');
      return;
    }

    setSaving(true);
    try {
      const isFull =
        formFullAccess ||
        (formMenuPerms.length === ALL_ADMIN_TABS.length &&
          formOrderPerms.length === ALL_ORDER_ACTIONS.length);

      const payload: StaffAccount = {
        id: editingStaff?.id || `stf_${Date.now()}`,
        name: cleanName,
        designation: cleanDesig,
        email: cleanEmail,
        username: cleanUser,
        passwordPin: cleanPin,
        phone: formPhone.trim(),
        role: isFull ? 'super_admin' : 'custom_staff',
        isSuperAdmin: isFull,
        fullAccess: isFull,
        menuPermissions: formMenuPerms,
        orderPermissions: formOrderPerms,
        active: formActive,
        addedBy: currentUser?.email || staffProfile?.name || 'Super Admin',
        createdAt: editingStaff?.createdAt || new Date().toISOString(),
      };

      await staffService.saveStaff(payload);

      if (currentUser || staffProfile) {
        settingsService
          .logAdminAction(
            currentUser?.uid || staffProfile?.id || 'owner',
            currentUser?.email || staffProfile?.email || 'owner',
            editingStaff ? 'UPDATE_STAFF' : 'ADD_STAFF',
            cleanUser,
            `${editingStaff ? 'Updated' : 'Created'} staff ${cleanName} (${cleanDesig})`
          )
          .catch(() => {});
      }

      showToastMsg(
        editingStaff
          ? `Staff account "${cleanName}" updated.`
          : `Staff account "${cleanName}" created.`
      );
      resetForm();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save staff account.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (staff: StaffAccount) => {
    const nextState = staff.active === false;
    await staffService.saveStaff({ ...staff, active: nextState });
    showToastMsg(`${staff.name} is now ${nextState ? 'Active' : 'Suspended'}.`);
  };

  const handleDeleteStaff = async (staff: StaffAccount) => {
    await staffService.deleteStaff(staff.id);
    if (editingStaff?.id === staff.id) resetForm();
    showToastMsg(`Removed staff "${staff.name}".`);
  };

  const copyCredentials = (staff: StaffAccount) => {
    const text = `Selvee Admin / POS Staff Access\nName: ${staff.name} (${staff.designation})\nLogin URL: ${window.location.origin}/admin\nUsername: ${staff.username}\nEmail: ${staff.email}\nPIN / Password: ${staff.passwordPin || '(Set by Admin)'}`;
    navigator.clipboard.writeText(text);
    setCopiedKey(staff.id);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const filteredStaff = staffList.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.designation.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.username.toLowerCase().includes(q)
    );
  });

  const activeUsersCount = 1 + staffList.filter((s) => s.active !== false).length;

  // Build recent order approval / action logs across all orders
  const recentOrderActions = orders
    .flatMap((ord) =>
      (ord.pipeline?.handoffHistory || []).map((log, idx) => ({
        key: `${ord.id}_${idx}`,
        orderNumber: ord.orderNumber,
        customerName: ord.customerName,
        total: ord.total,
        handlerName: log.handlerName,
        handlerEmail: log.handlerEmail,
        action: log.action,
        note: log.note,
        stage: log.stage,
        timestamp: log.timestamp,
      }))
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 40);

  return (
    <div className="space-y-6">
      {/* Page Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-neutral-900">
            স্টাফ ম্যানেজমেন্ট &amp; রোল পারমিশন (Staff Roles)
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Create team logins with exact Menu &amp; Order Action permissions (Approve, Payment Verify, Packaging, Shipping, Return, Cancel).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-neutral-700 tabular-nums">
            {activeUsersCount} Active Users
          </span>
        </div>
      </div>

      {/* Main Split Grid matching reference layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Create / Edit Staff Account */}
        <div className="lg:col-span-5 bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-neutral-900" />
              <h2 className="text-sm font-extrabold text-neutral-900">
                {editingStaff ? 'স্টাফ একাউন্ট আপডেট করুন' : 'নতুন স্টাফ একাউন্ট তৈরি'}
              </h2>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded border border-neutral-200">
              Admin Control
            </span>
          </div>

          {/* Quick Preset Role Chips */}
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
              Quick Role Templates
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ROLE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="px-2 py-1 text-[11px] font-semibold bg-neutral-100 hover:bg-black hover:text-white text-neutral-700 rounded transition-colors cursor-pointer"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSaveStaff} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                পূর্ণনাম (Full Name) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Tanvir Hasan"
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-neutral-800 mb-1">
                  পদবি / Role (Designation) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formDesignation}
                  onChange={(e) => setFormDesignation(e.target.value)}
                  placeholder="e.g. Order Verifier, Manager"
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block font-bold text-neutral-800 mb-1">
                  ফোন নম্বর (Phone)
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-neutral-800 mb-1">
                ইমেইল এড্রেস (Email) <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="staff@selvee.com"
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-neutral-800 mb-1">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="tanvir"
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-neutral-800 mb-1">
                  পাসওয়ার্ড / PIN <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    required
                    value={formPin}
                    onChange={(e) => setFormPin(e.target.value)}
                    placeholder="••••"
                    className="w-full px-3 py-2 pr-8 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-800 cursor-pointer"
                  >
                    {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Menu Permissions Checklist */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-neutral-900">
                  মেনু পারমিশন সেট করুন (Menu Access) <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={toggleAllMenus}
                  className="text-[11px] font-bold text-neutral-800 hover:underline cursor-pointer"
                >
                  {formMenuPerms.length === ALL_ADMIN_TABS.length ? 'Unselect All' : 'Select All'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2.5 border border-neutral-200 rounded-lg max-h-44 overflow-y-auto bg-neutral-50/70">
                {MENU_PERMISSION_OPTIONS.map((opt) => {
                  const checked = formMenuPerms.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                        checked ? 'bg-white border border-neutral-300 font-semibold text-neutral-900' : 'text-neutral-600 hover:bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMenuPerm(opt.id)}
                        className="accent-black rounded shrink-0"
                      />
                      <span className="text-[11px] truncate">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Order Action Permissions Checklist */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-neutral-900">
                  অর্ডার অ্যাকশন বাটন পারমিশন (Order Buttons)
                </label>
                <button
                  type="button"
                  onClick={toggleAllOrderActions}
                  className="text-[11px] font-bold text-neutral-800 hover:underline cursor-pointer"
                >
                  {formOrderPerms.length === ALL_ORDER_ACTIONS.length ? 'Unselect All' : 'Select All'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-2.5 border border-neutral-200 rounded-lg bg-neutral-50/70">
                {ORDER_ACTION_OPTIONS.map((opt) => {
                  const checked = formOrderPerms.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                        checked ? 'bg-white border border-neutral-300 text-neutral-900' : 'text-neutral-600 hover:bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOrderPerm(opt.id)}
                        className="accent-black mt-0.5 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold block leading-tight">{opt.label}</span>
                        <span className="text-[10px] text-neutral-400 block truncate">{opt.desc}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {editingStaff && (
              <div className="flex items-center justify-between pt-1">
                <span className="font-bold text-neutral-700">Account Status</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={formActive}
                      onChange={() => setFormActive(true)}
                      className="accent-black"
                    />
                    <span>Active</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={!formActive}
                      onChange={() => setFormActive(false)}
                      className="accent-black"
                    />
                    <span>Suspended</span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 bg-black text-white font-bold rounded-lg hover:bg-neutral-800 disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {saving
                    ? 'Saving...'
                    : editingStaff
                    ? 'Update Staff Account'
                    : 'Save Staff Account'}
                </span>
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 border border-neutral-300 text-neutral-700 font-bold rounded-lg hover:bg-neutral-50 cursor-pointer inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: Staff Directory List */}
        <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-neutral-900">
                স্টাফ ডিরেক্টরি তালিকা (Staff Directory)
              </h2>
              <p className="text-[11px] text-neutral-500">
                সিস্টেমে নিবন্ধিত সকল কর্মকর্তা ও তাদের পারমিশন
              </p>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff name or role..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200 text-[10px]">
                <tr>
                  <th className="p-3.5">Staff Profile</th>
                  <th className="p-3.5">Credentials</th>
                  <th className="p-3.5">Permissions</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {/* Built-in Primary Super Admin row */}
                <tr className="bg-neutral-50/40">
                  <td className="p-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-neutral-900">Super Admin</p>
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-neutral-100 border border-neutral-200 text-neutral-700 rounded">
                          Primary Owner
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 font-mono text-[11px]">
                    <p className="text-neutral-900 font-semibold">mensfabricofficial@gmail.com</p>
                    <p className="text-neutral-400">System Super Owner</p>
                  </td>
                  <td className="p-3.5">
                    <span className="inline-block px-2.5 py-1 bg-neutral-900 text-white text-[10px] font-bold rounded">
                      Full Access
                    </span>
                  </td>
                  <td className="p-3.5 text-right text-[11px] text-neutral-400 font-semibold">
                    Protected
                  </td>
                </tr>

                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-neutral-500">
                      Loading staff accounts...
                    </td>
                  </tr>
                ) : filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-neutral-500">
                      No staff members added yet. Use the form on the left to add your team members.
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((staff) => {
                    const isFull = Boolean(staff.fullAccess || staff.isSuperAdmin);
                    return (
                      <tr key={staff.id} className="hover:bg-neutral-50/60">
                        <td className="p-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-neutral-200 text-neutral-800 flex items-center justify-center font-bold text-xs shrink-0 uppercase">
                              {staff.name.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-neutral-900 truncate">{staff.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-neutral-100 border border-neutral-200 text-neutral-700 rounded">
                                  {staff.designation}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(staff)}
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer inline-flex items-center gap-1 ${
                                    staff.active !== false
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-red-50 text-red-700 border border-red-200'
                                  }`}
                                >
                                  {staff.active !== false ? (
                                    <>
                                      <UserCheck className="w-2.5 h-2.5" /> Active
                                    </>
                                  ) : (
                                    <>
                                      <UserX className="w-2.5 h-2.5" /> Suspended
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5 font-mono text-[11px]">
                          <p className="text-neutral-900">{staff.email}</p>
                          <p className="text-neutral-500">User: {staff.username}</p>
                        </td>

                        <td className="p-3.5">
                          {isFull ? (
                            <span className="inline-block px-2.5 py-1 bg-neutral-900 text-white text-[10px] font-bold rounded">
                              Full Access
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <span className="text-[11px] font-semibold text-neutral-800 block tabular-nums">
                                {staff.menuPermissions?.length || 0} Menus · {staff.orderPermissions?.length || 0} Order Actions
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {(staff.orderPermissions || []).map((op) => (
                                  <span
                                    key={op}
                                    className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-neutral-100 border border-neutral-200 text-neutral-700 rounded"
                                  >
                                    {op.replace('_', ' ')}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => copyCredentials(staff)}
                              title="Copy login credentials"
                              className="p-1.5 border border-neutral-200 bg-white hover:border-black rounded-md text-neutral-700 cursor-pointer"
                            >
                              {copiedKey === staff.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => loadForEdit(staff)}
                              title="Edit Staff & Permissions"
                              className="p-1.5 border border-neutral-200 bg-white hover:border-black rounded-md text-neutral-700 cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStaff(staff)}
                              title="Remove Staff Account"
                              className="p-1.5 border border-red-200 bg-red-50 hover:bg-red-100 rounded-md text-red-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* BOTTOM CARD: Live Staff Login & Order Approval Activity History */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-red-600 shrink-0" />
            <div>
              <h2 className="text-sm font-extrabold text-neutral-900">
                লাইভ স্টাফ লগইন ও অর্ডার অ্যাক্টিভিটি হিস্ট্রি
              </h2>
              <p className="text-[11px] text-neutral-500">
                কে কখন লগইন দিয়েছে, কতক্ষণ ছিল এবং কার অ্যাকাউন্ট থেকে কোন অর্ডার অ্যাপ্রুভ হয়েছে তা মনিটর করুন
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-50 text-xs">
              <button
                type="button"
                onClick={() => setHistoryTab('logins')}
                className={`px-3 py-1.5 rounded-md font-bold cursor-pointer ${
                  historyTab === 'logins' ? 'bg-black text-white' : 'text-neutral-600 hover:text-black'
                }`}
              >
                Login Sessions ({loginLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('approvals')}
                className={`px-3 py-1.5 rounded-md font-bold cursor-pointer ${
                  historyTab === 'approvals' ? 'bg-black text-white' : 'text-neutral-600 hover:text-black'
                }`}
              >
                Order Approvals ({recentOrderActions.length})
              </button>
            </div>

            {historyTab === 'logins' && loginLogs.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await staffService.clearOldLogs();
                  showToastMsg('Old session logs cleared');
                }}
                className="px-3 py-1.5 border border-neutral-200 hover:border-black rounded-lg text-xs font-semibold text-neutral-700 cursor-pointer inline-flex items-center gap-1.5"
              >
                <History className="w-3.5 h-3.5" />
                <span>Clear Old Logs</span>
              </button>
            )}
          </div>
        </div>

        {historyTab === 'logins' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200 text-[10px]">
                <tr>
                  <th className="p-3.5">Live Status</th>
                  <th className="p-3.5">Staff Name</th>
                  <th className="p-3.5">Designation (পদবি)</th>
                  <th className="p-3.5">Device</th>
                  <th className="p-3.5">Login Time</th>
                  <th className="p-3.5">Logout Time</th>
                  <th className="p-3.5 text-right">Duration (কতক্ষণ ছিল)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 tabular-nums">
                {loginLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-neutral-400">
                      No staff login sessions recorded yet. Sessions appear automatically when staff or admin signs in.
                    </td>
                  </tr>
                ) : (
                  loginLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-50/50">
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            log.status === 'online'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              log.status === 'online' ? 'bg-emerald-600' : 'bg-neutral-400'
                            }`}
                          />
                          {log.status === 'online' ? 'Online' : 'Logged Out'}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <p className="font-bold text-neutral-900">{log.staffName}</p>
                        <p className="text-[10px] font-mono text-neutral-400">{log.email || log.username}</p>
                      </td>
                      <td className="p-3.5 font-semibold text-neutral-700">{log.designation}</td>
                      <td className="p-3.5 text-neutral-600">{log.device}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="block font-medium text-neutral-800">{formatDatePart(log.loginTime)}</span>
                        <span className="block text-[10px] font-mono text-neutral-400">{formatTimePart(log.loginTime)}</span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        {log.logoutTime ? (
                          <>
                            <span className="block font-medium text-neutral-800">{formatDatePart(log.logoutTime)}</span>
                            <span className="block text-[10px] font-mono text-neutral-400">{formatTimePart(log.logoutTime)}</span>
                          </>
                        ) : (
                          <span className="text-emerald-700 font-semibold">Active Session</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-neutral-900">
                        {formatDuration(log.durationMs)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200 text-[10px]">
                <tr>
                  <th className="p-3.5">Order #</th>
                  <th className="p-3.5">Handled By (Staff)</th>
                  <th className="p-3.5">Action / Decision</th>
                  <th className="p-3.5">Customer &amp; Total</th>
                  <th className="p-3.5 text-right">Date &amp; Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 tabular-nums">
                {recentOrderActions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-neutral-400">
                      No order approval actions recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentOrderActions.map((act) => (
                    <tr key={act.key} className="hover:bg-neutral-50/50">
                      <td className="p-3.5 font-mono font-bold text-neutral-900">{act.orderNumber}</td>
                      <td className="p-3.5">
                        <p className="font-bold text-neutral-900">{act.handlerName}</p>
                        {act.handlerEmail && (
                          <p className="text-[10px] font-mono text-neutral-400">{act.handlerEmail}</p>
                        )}
                      </td>
                      <td className="p-3.5">
                        <p className="font-semibold text-neutral-800">{act.action}</p>
                        {act.note && <p className="text-[11px] text-neutral-500">{act.note}</p>}
                      </td>
                      <td className="p-3.5">
                        <span className="text-neutral-700 font-medium">{act.customerName}</span>
                        <span className="block font-mono text-[11px] text-neutral-500">
                          ৳{(Number(act.total) || 0).toLocaleString('en-BD')}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono text-[11px] text-neutral-500 whitespace-nowrap">
                        {formatDateTime(act.timestamp)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Toast */}
      {actionToast && (
        <div className="fixed bottom-6 right-6 z-60 bg-black text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold border border-neutral-700 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{actionToast}</span>
        </div>
      )}
    </div>
  );
};
