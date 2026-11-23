import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Save, 
  CheckCircle, 
  AlertCircle, 
  CreditCard, 
  Smartphone, 
  Percent, 
  HelpCircle,
  Truck,
  ShieldCheck,
  Trash2,
  Key,
  Laptop,
  Ruler,
  KeyRound,
  Plus,
  RefreshCw,
  Megaphone,
  Bell,
  BellRing,
  Eye,
  EyeOff,
  Check,
  X,
  Clock,
  Globe
} from 'lucide-react';
import { SiteSettings, PaymentSettings, MfsGatewayConfig } from '../types';
import { settingsService, defaultSettings, defaultPaymentSettings } from '../services/settingsService';
import { adminDeviceService, AdminDevice, DEFAULT_ADMIN_ACCESS_KEY } from '../services/adminDeviceService';
import { sizeGuideService, SizeGuideCategory, DEFAULT_SIZE_GUIDES } from '../services/sizeGuideService';
import { firebaseConfig, ADMIN_CONFIG } from '../lib/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AdminPageHeader } from './AdminLayout';

export const AdminSettings: React.FC = () => {
  const { currentUser } = useAuth();
  const { permission: notifPermission, requestMobileAlerts, sendTestAdminOrderAlert } = useNotifications();
  const [activeTab, setActiveTab] = useState<'general' | 'sizeguide' | 'apikeys' | 'devices'>('general');
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Delivery charges state
  const [dhakaFee, setDhakaFee] = useState<number>(70);
  const [outsideFee, setOutsideFee] = useState<number>(130);

  // Authorized Devices & Access Key state
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [accessKeyInput, setAccessKeyInput] = useState(DEFAULT_ADMIN_ACCESS_KEY);
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [deviceActionId, setDeviceActionId] = useState<string | null>(null);

  // Dynamic Size Guides state
  const [sizeGuides, setSizeGuides] = useState<SizeGuideCategory[]>(DEFAULT_SIZE_GUIDES);
  const [activeSizeCatIdx, setActiveSizeCatIdx] = useState<number>(0);
  const [sizeSaving, setSizeSaving] = useState(false);
  const [sizeSuccess, setSizeSuccess] = useState(false);

  // Cloud API & Firebase Credentials state
  const [apiCredentials, setApiCredentials] = useState(() => {
    const defaults = {
      apiKey: firebaseConfig.apiKey || '',
      authDomain: firebaseConfig.authDomain || '',
      projectId: firebaseConfig.projectId || '',
      storageBucket: firebaseConfig.storageBucket || '',
      messagingSenderId: firebaseConfig.messagingSenderId || '',
      appId: firebaseConfig.appId || '',
      primaryAdminEmail: ADMIN_CONFIG.ADMIN_EMAIL,
      primaryAdminUid: ADMIN_CONFIG.PRIMARY_ADMIN_UID,
    };
    try {
      const saved = localStorage.getItem('mf_custom_api_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { ...defaults, ...parsed };
        }
      }
    } catch {
      // fallback
    }
    return defaults;
  });
  const [apiSaving, setApiSaving] = useState(false);
  const [apiSuccess, setApiSuccess] = useState(false);

  const loadDevices = async () => {
    const list = await adminDeviceService.getAllDevices();
    setDevices(list);
  };

  const loadSizeGuides = async () => {
    const guides = await sizeGuideService.getSizeGuides();
    setSizeGuides(guides);
  };

  const loadApiConfig = async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'apiConfig'));
      if (snap.exists()) {
        const data = snap.data();
        setApiCredentials((prev: any) => ({ ...prev, ...data }));
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    if (sessionStorage.getItem('selvee_open_devices_tab') === '1') {
      sessionStorage.removeItem('selvee_open_devices_tab');
      setActiveTab('devices');
    }

    const unsubRegistry = adminDeviceService.subscribeToRegistry((list, remoteKey) => {
      setDevices(list);
      setAccessKeyInput((prev) => (prev === DEFAULT_ADMIN_ACCESS_KEY || !prev ? remoteKey : prev));
    });

    adminDeviceService.getAccessKey().then((k) => setAccessKeyInput(k)).catch(() => {});

    Promise.all([
      settingsService.getSettings().then((s) => setSettings(s)),
      settingsService.getDeliveryZones().then((zones) => {
        const dh = zones.find((z) => z.id === 'dhaka');
        const out = zones.find((z) => z.id === 'outside-dhaka');
        if (dh) setDhakaFee(dh.charge);
        if (out) setOutsideFee(out.charge);
      }),
      loadDevices(),
      loadSizeGuides(),
      loadApiConfig(),
    ]).finally(() => setLoading(false));

    return () => unsubRegistry();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setErrorMessage('');
    try {
      await settingsService.updateSettings(settings);
      await Promise.all([
        settingsService.saveDeliveryZone(
          { name: 'Inside Dhaka City', charge: Number(dhakaFee) || 0, estimatedDays: '1 - 2 Days', active: true },
          'dhaka'
        ),
        settingsService.saveDeliveryZone(
          { name: 'Outside Dhaka (Nationwide)', charge: Number(outsideFee) || 0, estimatedDays: '2 - 4 Days', active: true },
          'outside-dhaka'
        ),
      ]);
      if (currentUser) {
        try {
          await settingsService.logAdminAction(
            currentUser.uid,
            currentUser.email || '',
            'UPDATE_SETTINGS',
            'general',
            'Updated announcement, store settings & delivery fees'
          );
        } catch {
          // non-blocking
        }
      }
      setSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to update store settings.');
    } finally {
      setSaving(false);
    }
  };

  const updatePaymentSettings = (updater: (prev: PaymentSettings) => PaymentSettings) => {
    setSettings((prev) => {
      const current = prev.paymentSettings || defaultPaymentSettings;
      return {
        ...prev,
        paymentSettings: updater(current),
      };
    });
  };

  const updateGateway = (gateway: 'bkash' | 'nagad' | 'rocket', updater: (prev: MfsGatewayConfig) => MfsGatewayConfig) => {
    updatePaymentSettings((prev) => ({
      ...prev,
      [gateway]: updater(prev[gateway]),
    }));
  };

  // Size Guide Handlers
  const handleSaveSizeGuides = async () => {
    setSizeSaving(true);
    try {
      await sizeGuideService.saveSizeGuides(sizeGuides);
      setSizeSuccess(true);
      setTimeout(() => setSizeSuccess(false), 3500);
    } finally {
      setSizeSaving(false);
    }
  };

  const handleResetSizeGuides = async () => {
    const defaults = await sizeGuideService.resetToDefaults();
    setSizeGuides(defaults);
    setSizeSuccess(true);
    setTimeout(() => setSizeSuccess(false), 3500);
  };

  const handleAddMeasurementRow = () => {
    const currentCat = sizeGuides[activeSizeCatIdx];
    if (!currentCat) return;
    const newRow: any = { size: 'New' };
    currentCat.columns.forEach((col) => {
      if (col.key !== 'size') newRow[col.key] = '0"';
    });
    const updated = [...sizeGuides];
    updated[activeSizeCatIdx] = {
      ...currentCat,
      rows: [...currentCat.rows, newRow],
    };
    setSizeGuides(updated);
  };

  const handleDeleteMeasurementRow = (rowIdx: number) => {
    const currentCat = sizeGuides[activeSizeCatIdx];
    if (!currentCat) return;
    const updated = [...sizeGuides];
    updated[activeSizeCatIdx] = {
      ...currentCat,
      rows: currentCat.rows.filter((_, idx) => idx !== rowIdx),
    };
    setSizeGuides(updated);
  };

  const handleUpdateRowCell = (rowIdx: number, key: string, val: string) => {
    const currentCat = sizeGuides[activeSizeCatIdx];
    if (!currentCat) return;
    const updatedRows = [...currentCat.rows];
    updatedRows[rowIdx] = { ...updatedRows[rowIdx], [key]: val };
    const updated = [...sizeGuides];
    updated[activeSizeCatIdx] = {
      ...currentCat,
      rows: updatedRows,
    };
    setSizeGuides(updated);
  };

  // API Credentials Handlers
  const handleSaveApiCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiSaving(true);
    try {
      localStorage.setItem('mf_custom_api_config', JSON.stringify(apiCredentials));
      await setDoc(doc(db, 'settings', 'apiConfig'), {
        ...apiCredentials,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.email || 'admin',
      }, { merge: true });
      setApiSuccess(true);
      setTimeout(() => setApiSuccess(false), 4000);
    } finally {
      setApiSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-xs text-neutral-500">Loading store settings...</div>;
  }

  const pSettings = settings.paymentSettings || defaultPaymentSettings;
  const currentSizeCategory = sizeGuides[activeSizeCatIdx] || sizeGuides[0];

  return (
    <div className="max-w-5xl space-y-6">
      
      <AdminPageHeader
        title="Store & System Configuration"
        subtitle="Manage payment gateways, size charts, API keys & device security."
      />

      {/* Tabs Navigation */}
      <div className="flex border-b border-neutral-200 gap-2 overflow-x-auto text-xs font-bold uppercase tracking-wider">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'general'
              ? 'border-black text-black'
              : 'border-transparent text-neutral-400 hover:text-neutral-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Payment & Store Details</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sizeguide')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'sizeguide'
              ? 'border-black text-black'
              : 'border-transparent text-neutral-400 hover:text-neutral-800'
          }`}
        >
          <Ruler className="w-4 h-4" />
          <span>Size Guide & Measurements</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('apikeys')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'apikeys'
              ? 'border-black text-black'
              : 'border-transparent text-neutral-400 hover:text-neutral-800'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>API & Cloud Credentials</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('devices')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'devices'
              ? 'border-black text-black'
              : 'border-transparent text-neutral-400 hover:text-neutral-800'
          }`}
        >
          <Laptop className="w-4 h-4" />
          <span>Device Access Security</span>
          {devices.filter((d) => d.status === 'pending').length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded-full bg-amber-500 text-white">
              {devices.filter((d) => d.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: General & Payment Gateways */}
      {activeTab === 'general' && (
        <>
          {success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-fade-in shadow-xs">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
              <span className="font-semibold">All settings & payment gateways updated successfully! Changes are live across customer checkout.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-8 text-xs shadow-xs">
            
            {/* SECTION 0: Top Header Announcement & Welcome Bar */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-neutral-800" />
                  <h3 className="font-extrabold uppercase tracking-wider text-neutral-900 text-sm">
                    Top Announcement & Welcome Message
                  </h3>
                </div>
                <label className="flex items-center gap-2 font-bold cursor-pointer text-neutral-800">
                  <input
                    type="checkbox"
                    checked={settings.announcementActive !== false}
                    onChange={(e) => setSettings({ ...settings, announcementActive: e.target.checked })}
                    className="accent-black w-4 h-4 cursor-pointer"
                  />
                  <span>Show Top Bar</span>
                </label>
              </div>

              <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200 space-y-4">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">
                    Announcement Banner Text (Welcome Bar) *
                  </label>
                  <input
                    type="text"
                    value={settings.announcementText || ''}
                    onChange={(e) => setSettings({ ...settings, announcementText: e.target.value })}
                    placeholder="Welcome to Selvee — Save 5% on online payment!"
                    className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-lg font-medium text-neutral-900 focus:outline-none focus:border-black"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Displayed at the very top of every page for customer greetings, offers, or notice updates.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-200">
                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">
                      Inside Dhaka Delivery Charge (৳)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={dhakaFee}
                      onChange={(e) => setDhakaFee(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded font-bold font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">
                      Outside Dhaka Nationwide Charge (৳)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={outsideFee}
                      onChange={(e) => setOutsideFee(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded font-bold font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 1: Online Prepayment & Discount Settings */}
            <div className="space-y-4 pt-4 border-t border-neutral-200">
              <div className="flex items-center gap-2 pb-2 border-b border-neutral-200">
                <Percent className="w-4 h-4 text-emerald-600" />
                <h3 className="font-extrabold uppercase tracking-wider text-neutral-900 text-sm">
                  1. Online Prepayment Discount & COD
                </h3>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <label className="font-bold text-neutral-900 text-xs flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pSettings.onlineDiscountActive}
                        onChange={(e) => updatePaymentSettings((prev) => ({ ...prev, onlineDiscountActive: e.target.checked }))}
                        className="accent-black w-4 h-4 rounded cursor-pointer"
                      />
                      <span>Enable Online Prepayment Discount (bKash / Nagad / Rocket)</span>
                    </label>
                    <p className="text-[11px] text-neutral-600 mt-1">
                      Offers customers an automatic discount when they choose to pay via bKash, Nagad, or Rocket.
                    </p>
                  </div>
                </div>

                {pSettings.onlineDiscountActive && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-emerald-200/60">
                    <div>
                      <label className="block font-bold text-neutral-700 uppercase mb-1">Discount Type</label>
                      <select
                        value={pSettings.onlineDiscountType}
                        onChange={(e: any) => updatePaymentSettings((prev) => ({ ...prev, onlineDiscountType: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded font-semibold cursor-pointer"
                      >
                        <option value="percentage">Percentage Discount (%)</option>
                        <option value="fixed">Fixed Amount (৳)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-neutral-700 uppercase mb-1">
                        Discount Value {pSettings.onlineDiscountType === 'percentage' ? '(%)' : '(৳)'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step={pSettings.onlineDiscountType === 'percentage' ? '0.5' : '1'}
                        value={pSettings.onlineDiscountValue}
                        onChange={(e) => updatePaymentSettings((prev) => ({ ...prev, onlineDiscountValue: Number(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-neutral-900 block">Cash on Delivery (COD)</span>
                  <span className="text-[11px] text-neutral-500">Customers pay advance delivery fee, and settle garments cash on delivery.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pSettings.codEnabled}
                    onChange={(e) => updatePaymentSettings((prev) => ({ ...prev, codEnabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                </label>
              </div>
            </div>

            {/* SECTION 2: bKash Gateway */}
            <div className="space-y-4 pt-4 border-t border-neutral-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#E2136E] text-white flex items-center justify-center font-bold text-xs">
                    bK
                  </div>
                  <h3 className="font-extrabold uppercase tracking-wider text-neutral-900 text-sm">
                    2. bKash Payment Gateway
                  </h3>
                </div>
                <label className="flex items-center gap-2 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pSettings.bkash.enabled}
                    onChange={(e) => updateGateway('bkash', (prev) => ({ ...prev, enabled: e.target.checked }))}
                    className="accent-[#E2136E] w-4 h-4 cursor-pointer"
                  />
                  <span>Gateway Active</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">bKash Account Number *</label>
                  <input
                    type="text"
                    value={pSettings.bkash.number}
                    onChange={(e) => updateGateway('bkash', (prev) => ({ ...prev, number: e.target.value }))}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Account Type</label>
                  <select
                    value={pSettings.bkash.accountType}
                    onChange={(e: any) => updateGateway('bkash', (prev) => ({ ...prev, accountType: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded font-semibold cursor-pointer"
                  >
                    <option value="Personal (Send Money)">Personal (Send Money)</option>
                    <option value="Merchant (Payment)">Merchant (Payment)</option>
                    <option value="Agent (Cash In)">Agent (Cash In)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 3: Nagad Gateway */}
            <div className="space-y-4 pt-4 border-t border-neutral-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#F7941D] text-white flex items-center justify-center font-bold text-xs">
                    N
                  </div>
                  <h3 className="font-extrabold uppercase tracking-wider text-neutral-900 text-sm">
                    3. Nagad Payment Gateway
                  </h3>
                </div>
                <label className="flex items-center gap-2 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pSettings.nagad.enabled}
                    onChange={(e) => updateGateway('nagad', (prev) => ({ ...prev, enabled: e.target.checked }))}
                    className="accent-[#F7941D] w-4 h-4 cursor-pointer"
                  />
                  <span>Gateway Active</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Nagad Account Number *</label>
                  <input
                    type="text"
                    value={pSettings.nagad.number}
                    onChange={(e) => updateGateway('nagad', (prev) => ({ ...prev, number: e.target.value }))}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Account Type</label>
                  <select
                    value={pSettings.nagad.accountType}
                    onChange={(e: any) => updateGateway('nagad', (prev) => ({ ...prev, accountType: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded font-semibold cursor-pointer"
                  >
                    <option value="Personal (Send Money)">Personal (Send Money)</option>
                    <option value="Merchant (Payment)">Merchant (Payment)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 4: Rocket Gateway */}
            <div className="space-y-4 pt-4 border-t border-neutral-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#8C3494] text-white flex items-center justify-center font-bold text-xs">
                    R
                  </div>
                  <h3 className="font-extrabold uppercase tracking-wider text-neutral-900 text-sm">
                    4. Rocket Payment Gateway
                  </h3>
                </div>
                <label className="flex items-center gap-2 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pSettings.rocket.enabled}
                    onChange={(e) => updateGateway('rocket', (prev) => ({ ...prev, enabled: e.target.checked }))}
                    className="accent-[#8C3494] w-4 h-4 cursor-pointer"
                  />
                  <span>Gateway Active</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Rocket Account Number *</label>
                  <input
                    type="text"
                    value={pSettings.rocket.number}
                    onChange={(e) => updateGateway('rocket', (prev) => ({ ...prev, number: e.target.value }))}
                    placeholder="01XXXXXXXXXX (12 digits with check digit)"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Account Type</label>
                  <select
                    value={pSettings.rocket.accountType}
                    onChange={(e: any) => updateGateway('rocket', (prev) => ({ ...prev, accountType: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded font-semibold cursor-pointer"
                  >
                    <option value="Personal (Send Money)">Personal (Send Money)</option>
                    <option value="Merchant (Payment)">Merchant (Payment)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 5: Brand & Support Info */}
            <div className="space-y-4 pt-4 border-t border-neutral-200">
              <h3 className="font-extrabold uppercase tracking-wider text-neutral-900 text-sm">
                5. Brand Profile & Customer Support
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Brand Name</label>
                  <input
                    type="text"
                    value={settings.storeName}
                    onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Support Hotline</label>
                  <input
                    type="tel"
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Official Email</label>
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Showroom / Warehouse Address</label>
                  <input
                    type="text"
                    value={settings.address}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 6: Footer WhatsApp & Social Media Links */}
            <div className="space-y-4 pt-4 border-t border-neutral-200">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-neutral-800" />
                <h3 className="font-extrabold uppercase tracking-wider text-neutral-900 text-sm">
                  6. Footer WhatsApp & Social Links
                </h3>
              </div>
              <p className="text-[11px] text-neutral-500 -mt-2">
                Update the WhatsApp number and social media links displayed in the storefront footer. Leave a link blank to hide its icon.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">WhatsApp Number</label>
                  <input
                    type="text"
                    value={settings.whatsapp || ''}
                    onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                    placeholder="+8801700000000"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Facebook URL</label>
                  <input
                    type="text"
                    value={settings.facebookUrl || ''}
                    onChange={(e) => setSettings({ ...settings, facebookUrl: e.target.value })}
                    placeholder="https://facebook.com/yourpage"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Instagram URL</label>
                  <input
                    type="text"
                    value={settings.instagramUrl || ''}
                    onChange={(e) => setSettings({ ...settings, instagramUrl: e.target.value })}
                    placeholder="https://instagram.com/yourhandle"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">TikTok URL</label>
                  <input
                    type="text"
                    value={settings.tiktokUrl || ''}
                    onChange={(e) => setSettings({ ...settings, tiktokUrl: e.target.value })}
                    placeholder="https://tiktok.com/@yourhandle"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">X (Twitter) URL</label>
                  <input
                    type="text"
                    value={settings.xUrl || ''}
                    onChange={(e) => setSettings({ ...settings, xUrl: e.target.value })}
                    placeholder="https://x.com/yourhandle"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">YouTube URL (Optional)</label>
                  <input
                    type="text"
                    value={settings.youtubeUrl || ''}
                    onChange={(e) => setSettings({ ...settings, youtubeUrl: e.target.value })}
                    placeholder="https://youtube.com/@yourchannel"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-neutral-200 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 bg-black text-white font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-2 shadow-md disabled:bg-neutral-400 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving Changes...' : 'Save Store & Payment Settings'}</span>
              </button>
            </div>

          </form>
        </>
      )}

      {/* TAB 2: Dynamic Size Guide & Measurements Editor */}
      {activeTab === 'sizeguide' && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6 text-xs shadow-xs animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
            <div>
              <div className="flex items-center gap-2">
                <Ruler className="w-5 h-5 text-neutral-800" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-900">
                  Size Guide & Measurements Manager
                </h2>
              </div>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Edit measurements and size charts for Panjabi, Shirts, T-Shirts, and Trousers. Updates reflect live on Product Details and the Size Guide page.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetSizeGuides}
                className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
              <button
                type="button"
                disabled={sizeSaving}
                onClick={handleSaveSizeGuides}
                className="px-4 py-2 bg-black text-white font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{sizeSaving ? 'Saving...' : 'Save Size Charts'}</span>
              </button>
            </div>
          </div>

          {sizeSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold">Size Guide charts updated and synchronized live across customer pages!</span>
            </div>
          )}

          {/* Category Selector Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 border-b border-neutral-100">
            {sizeGuides.map((cat, idx) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveSizeCatIdx(idx)}
                className={`px-4 py-2 rounded-lg font-bold uppercase text-[11px] tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                  activeSizeCatIdx === idx
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Current Category Table */}
          {currentSizeCategory && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-neutral-900 text-xs uppercase tracking-wider">
                    {currentSizeCategory.name} Measurements Table ({currentSizeCategory.unit})
                  </h3>
                  <p className="text-[11px] text-neutral-500">{currentSizeCategory.tip}</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddMeasurementRow}
                  className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold uppercase text-[10px] tracking-wider rounded flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Size Row</span>
                </button>
              </div>

              <div className="border border-neutral-200 rounded-xl overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-neutral-100 font-bold uppercase text-neutral-700 border-b border-neutral-200">
                    <tr>
                      {currentSizeCategory.columns.map((col) => (
                        <th key={col.key} className="p-3 border-r border-neutral-200 last:border-r-0">
                          {col.label}
                        </th>
                      ))}
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {currentSizeCategory.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-neutral-50/50">
                        {currentSizeCategory.columns.map((col) => (
                          <td key={col.key} className="p-2 border-r border-neutral-200 last:border-r-0">
                            <input
                              type="text"
                              value={row[col.key] || ''}
                              onChange={(e) => handleUpdateRowCell(rIdx, col.key, e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-neutral-300 rounded text-xs font-semibold focus:outline-none focus:border-black"
                            />
                          </td>
                        ))}
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteMeasurementRow(rIdx)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                            title="Delete Row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* TAB 3: API & Cloud Credentials */}
      {activeTab === 'apikeys' && (
        <form onSubmit={handleSaveApiCredentials} className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6 text-xs shadow-xs animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-200">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-neutral-800" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-900">
                  API & Cloud Backend Credentials
                </h2>
              </div>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Control and update your Firebase, Google Cloud, and Primary Store Owner credentials dynamically.
              </p>
            </div>
            <span className="px-3 py-1 bg-neutral-100 text-neutral-700 font-mono text-[11px] font-bold rounded-full w-fit">
              Firebase Project: {apiCredentials.projectId}
            </span>
          </div>

          {apiSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold">API Credentials updated and stored in Firestore & local config!</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-bold text-neutral-700 uppercase mb-1">Firebase Web API Key *</label>
              <input
                type="text"
                required
                value={apiCredentials.apiKey}
                onChange={(e) => setApiCredentials({ ...apiCredentials, apiKey: e.target.value })}
                className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Firebase Project ID *</label>
              <input
                type="text"
                required
                value={apiCredentials.projectId}
                onChange={(e) => setApiCredentials({ ...apiCredentials, projectId: e.target.value })}
                className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Auth Domain</label>
              <input
                type="text"
                value={apiCredentials.authDomain}
                onChange={(e) => setApiCredentials({ ...apiCredentials, authDomain: e.target.value })}
                className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Storage Bucket</label>
              <input
                type="text"
                value={apiCredentials.storageBucket}
                onChange={(e) => setApiCredentials({ ...apiCredentials, storageBucket: e.target.value })}
                className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Messaging Sender ID</label>
              <input
                type="text"
                value={apiCredentials.messagingSenderId}
                onChange={(e) => setApiCredentials({ ...apiCredentials, messagingSenderId: e.target.value })}
                className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-bold text-neutral-700 uppercase mb-1">Firebase Web App ID</label>
              <input
                type="text"
                value={apiCredentials.appId}
                onChange={(e) => setApiCredentials({ ...apiCredentials, appId: e.target.value })}
                className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono"
              />
            </div>
          </div>

          {/* Primary Owner Configuration Box */}
          <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
            <h3 className="font-bold uppercase text-[11px] text-neutral-900 tracking-wider">
              Primary Store Owner Account
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-neutral-500 uppercase font-bold block">Primary Email</span>
                <p className="font-bold text-neutral-900 font-mono">{ADMIN_CONFIG.ADMIN_EMAIL}</p>
              </div>
              <div>
                <span className="text-[10px] text-neutral-500 uppercase font-bold block">Primary UID</span>
                <p className="font-bold text-neutral-900 font-mono text-[11px]">{ADMIN_CONFIG.PRIMARY_ADMIN_UID}</p>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={apiSaving}
              className="px-6 py-2.5 bg-black text-white font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{apiSaving ? 'Saving Credentials...' : 'Save API & Cloud Credentials'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: Authorized Admin Devices Security */}
      {activeTab === 'devices' && (() => {
        const pendingDevices = devices.filter((d) => d.status === 'pending');
        const approvedDevices = devices.filter((d) => d.status === 'approved');
        const rejectedDevices = devices.filter((d) => d.status === 'rejected');
        const currentDeviceId = adminDeviceService.getCurrentDeviceId();

        return (
          <div className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6 text-xs shadow-xs animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-200">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                    Admin Access Key & Device Security
                  </h2>
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Strictly protects the Admin Panel only. New computers or phones must enter the Access Key and receive your approval here before accessing Admin Console.
                </p>
              </div>
              <span className="px-3 py-1 bg-neutral-100 text-neutral-700 font-mono text-[11px] font-bold rounded-full w-fit">
                {approvedDevices.length} Approved • {pendingDevices.length} Pending
              </span>
            </div>

            {/* Admin Access Key Configuration (Synced to Firestore) */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-neutral-700" />
                <span className="font-bold text-neutral-900 uppercase text-[11px]">Admin Panel Access Key</span>
              </div>
              <p className="text-[11px] text-neutral-500">
                Required right after Admin Email & Password sign-in on every session. Synced across all your devices.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 max-w-md">
                <div className="relative flex-1">
                  <input
                    type={showAccessKey ? 'text' : 'password'}
                    value={accessKeyInput}
                    onChange={(e) => {
                      setAccessKeyInput(e.target.value);
                      setKeyError('');
                    }}
                    placeholder="Enter new Admin Access Key"
                    className="w-full px-3.5 py-2 pr-9 bg-white border border-neutral-300 rounded-lg text-xs font-mono font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccessKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    {showAccessKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={keySaving}
                  onClick={async () => {
                    setKeyError('');
                    setKeySaving(true);
                    try {
                      await adminDeviceService.updateAccessKey(accessKeyInput, currentUser?.email || 'Admin');
                      setKeySaved(true);
                      setTimeout(() => setKeySaved(false), 3000);
                    } catch (err: any) {
                      setKeyError(err.message || 'Failed to update access key.');
                    } finally {
                      setKeySaving(false);
                    }
                  }}
                  className="px-4 py-2 bg-black text-white font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {keySaving ? 'Saving...' : keySaved ? 'Updated!' : 'Update Key'}
                </button>
              </div>
              {keyError && <p className="text-[11px] text-red-600 font-semibold">{keyError}</p>}
              {keySaved && (
                <p className="text-[11px] text-emerald-700 font-semibold">
                  Admin Access Key updated across all devices.
                </p>
              )}
            </div>

            {/* Current Device Identifier & Order Alert Binding */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3 text-xs text-emerald-950">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {adminDeviceService.getDeviceInfo().deviceType === 'Mobile' ? (
                    <Smartphone className="w-4 h-4 text-emerald-700" />
                  ) : (
                    <Laptop className="w-4 h-4 text-emerald-700" />
                  )}
                  <div>
                    <p className="font-bold">
                      Current Device: <span className="font-mono text-[11px]">{currentDeviceId}</span>
                    </p>
                    <p className="text-[11px] text-emerald-800">
                      {adminDeviceService.getDeviceInfo().deviceName} • Status: Verified Approved
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded shrink-0">
                  This Device
                </span>
              </div>

              <div className="pt-2.5 border-t border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start gap-2 text-[11px] text-emerald-900">
                  <BellRing className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>
                    <b>Exclusive Order Alerts:</b> Only approved devices listed here receive instant alerts whenever a customer places a new order.
                    {notifPermission === 'granted' && ' Browser/mobile push alerts are active on this device.'}
                    {notifPermission === 'denied' && ' Browser alerts are currently blocked in site settings.'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {notifPermission === 'unsupported' ? (
                    <span className="text-[11px] text-amber-800 font-medium">
                      Unavailable in this browser view
                    </span>
                  ) : notifPermission !== 'granted' && notifPermission !== 'denied' ? (
                    <button
                      type="button"
                      data-notif-trigger="true"
                      onClick={() => requestMobileAlerts()}
                      className="px-3 py-1.5 bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg font-bold text-[11px] uppercase tracking-wider cursor-pointer"
                    >
                      Enable Order Alerts
                    </button>
                  ) : notifPermission === 'granted' ? (
                    <button
                      type="button"
                      data-notif-trigger="true"
                      onClick={() => sendTestAdminOrderAlert()}
                      className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 rounded-lg font-bold text-[11px] uppercase tracking-wider cursor-pointer"
                    >
                      Test Order Alert
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Pending Approval Requests */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-neutral-900 uppercase text-[11px] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Pending Device Approval Requests ({pendingDevices.length})</span>
                </h3>
              </div>
              {pendingDevices.length === 0 ? (
                <div className="p-4 text-center text-neutral-400 bg-neutral-50 border border-neutral-200 rounded-xl text-[11px]">
                  No pending device requests. When you log in from your phone or another device, it will appear here for your approval.
                </div>
              ) : (
                <div className="divide-y divide-amber-200 border border-amber-300 bg-amber-50/40 rounded-xl overflow-hidden">
                  {pendingDevices.map((dev) => (
                    <div key={dev.deviceId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {dev.deviceType === 'Mobile' ? (
                            <Smartphone className="w-4 h-4 text-amber-700" />
                          ) : (
                            <Laptop className="w-4 h-4 text-amber-700" />
                          )}
                          <span className="font-bold text-neutral-900 text-xs">{dev.deviceName}</span>
                          <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold uppercase">
                            Awaiting Approval
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-neutral-600">ID: {dev.deviceId}</p>
                        <p className="text-[10px] text-neutral-500">
                          Account: {dev.requestedEmail || 'Admin'} • Requested:{' '}
                          {dev.registeredAt ? new Date(dev.registeredAt).toLocaleString() : 'Just now'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={deviceActionId === dev.deviceId}
                          onClick={async () => {
                            setDeviceActionId(dev.deviceId);
                            try {
                              await adminDeviceService.approveDevice(dev.deviceId, currentUser?.email || 'Admin');
                            } finally {
                              setDeviceActionId(null);
                            }
                          }}
                          className="px-3.5 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          disabled={deviceActionId === dev.deviceId}
                          onClick={async () => {
                            setDeviceActionId(dev.deviceId);
                            try {
                              await adminDeviceService.revokeDevice(dev.deviceId);
                            } finally {
                              setDeviceActionId(null);
                            }
                          }}
                          className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg font-bold text-[11px] uppercase tracking-wider flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Approved Devices List */}
            <div className="space-y-3">
              <h3 className="font-bold text-neutral-900 uppercase text-[11px]">
                Approved Hardware Devices ({approvedDevices.length})
              </h3>
              {approvedDevices.length === 0 ? (
                <div className="p-6 text-center text-neutral-400 bg-neutral-50 rounded-xl">
                  No approved devices registered yet.
                </div>
              ) : (
                <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
                  {approvedDevices.map((dev) => {
                    const isCurrent = dev.deviceId === currentDeviceId;
                    return (
                      <div key={dev.deviceId} className="p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {dev.deviceType === 'Mobile' || dev.deviceName?.includes('Mobile') ? (
                              <Smartphone className="w-4 h-4 text-neutral-600" />
                            ) : (
                              <Laptop className="w-4 h-4 text-neutral-600" />
                            )}
                            <span className="font-bold text-neutral-900 text-xs">{dev.deviceName || 'Admin Device'}</span>
                            {isCurrent && (
                              <span className="text-[9px] bg-black text-white px-1.5 py-0.5 rounded font-bold uppercase">
                                This Device
                              </span>
                            )}
                            {dev.isPrimary && (
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold uppercase">
                                Primary Computer
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[11px] text-neutral-500">ID: {dev.deviceId}</p>
                          <p className="text-[10px] text-neutral-400">
                            Approved by: {dev.authorizedBy || 'Administrator'}
                          </p>
                        </div>

                        {!isCurrent && (
                          <button
                            type="button"
                            disabled={deviceActionId === dev.deviceId}
                            onClick={async () => {
                              setDeviceActionId(dev.deviceId);
                              try {
                                await adminDeviceService.revokeDevice(dev.deviceId);
                              } finally {
                                setDeviceActionId(null);
                              }
                            }}
                            className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer w-fit disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Revoke Access</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rejected / Revoked Devices (if any) */}
            {rejectedDevices.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-neutral-100">
                <h3 className="font-bold text-neutral-500 uppercase text-[11px]">
                  Blocked / Revoked Devices ({rejectedDevices.length})
                </h3>
                <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
                  {rejectedDevices.map((dev) => (
                    <div key={dev.deviceId} className="p-3.5 bg-neutral-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-bold text-neutral-700">{dev.deviceName}</p>
                        <p className="font-mono text-[11px] text-neutral-500">ID: {dev.deviceId}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adminDeviceService.approveDevice(dev.deviceId, currentUser?.email || 'Admin')}
                          className="px-3 py-1 bg-white border border-neutral-300 text-neutral-800 hover:bg-neutral-100 rounded font-bold text-[11px] uppercase cursor-pointer"
                        >
                          Allow Again
                        </button>
                        <button
                          type="button"
                          onClick={() => adminDeviceService.removeDeviceRecord(dev.deviceId)}
                          className="p-1.5 text-neutral-400 hover:text-red-600 cursor-pointer"
                          title="Remove from list"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        );
      })()}

    </div>
  );
};
