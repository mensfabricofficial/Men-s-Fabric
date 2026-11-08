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
  Bell
} from 'lucide-react';
import { SiteSettings, PaymentSettings, MfsGatewayConfig } from '../types';
import { settingsService, defaultSettings, defaultPaymentSettings } from '../services/settingsService';
import { adminDeviceService, AdminDevice } from '../services/adminDeviceService';
import { sizeGuideService, SizeGuideCategory, DEFAULT_SIZE_GUIDES } from '../services/sizeGuideService';
import { firebaseConfig, ADMIN_CONFIG } from '../lib/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const AdminSettings: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'sizeguide' | 'apikeys' | 'devices'>('general');
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Delivery charges state
  const [dhakaFee, setDhakaFee] = useState<number>(70);
  const [outsideFee, setOutsideFee] = useState<number>(130);

  // Authorized Devices state
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [masterCodeInput, setMasterCodeInput] = useState(
    () => localStorage.getItem('mf_admin_master_code') || 'MF-DEV-2026'
  );
  const [codeSaved, setCodeSaved] = useState(false);

  // Dynamic Size Guides state
  const [sizeGuides, setSizeGuides] = useState<SizeGuideCategory[]>(DEFAULT_SIZE_GUIDES);
  const [activeSizeCatIdx, setActiveSizeCatIdx] = useState<number>(0);
  const [sizeSaving, setSizeSaving] = useState(false);
  const [sizeSuccess, setSizeSuccess] = useState(false);

  // Cloud API & Firebase Credentials state
  const [apiCredentials, setApiCredentials] = useState(() => {
    try {
      const saved = localStorage.getItem('mf_custom_api_config');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return {
      apiKey: firebaseConfig.apiKey || '',
      authDomain: firebaseConfig.authDomain || '',
      projectId: firebaseConfig.projectId || '',
      storageBucket: firebaseConfig.storageBucket || '',
      messagingSenderId: firebaseConfig.messagingSenderId || '',
      appId: firebaseConfig.appId || '',
      primaryAdminEmail: ADMIN_CONFIG.ADMIN_EMAIL,
      primaryAdminUid: ADMIN_CONFIG.PRIMARY_ADMIN_UID,
    };
  });
  const [apiSaving, setApiSaving] = useState(false);
  const [apiSuccess, setApiSuccess] = useState(false);

  const loadDevices = async () => {
    const list = await adminDeviceService.getAllAuthorizedDevices();
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
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
          Store & System Configuration
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Manage payment gateways, custom size charts, Google Cloud & Firebase API keys, and device security.
        </p>
      </div>

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
                    placeholder="🔥 Welcome to MEN'S FABRIC — Free Shipping on Orders Over ৳2500!"
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
      {activeTab === 'devices' && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6 text-xs shadow-xs animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-200">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                  Authorized Admin Devices Security
                </h2>
              </div>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Strict device-level access control. Only approved devices can access the Admin Console.
              </p>
            </div>
            <span className="px-3 py-1 bg-neutral-100 text-neutral-700 font-mono text-[11px] font-bold rounded-full w-fit">
              {devices.length} {devices.length === 1 ? 'Device Authorized' : 'Devices Authorized'}
            </span>
          </div>

          {/* Master Access Key Configuration */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-neutral-700" />
              <span className="font-bold text-neutral-900 uppercase text-[11px]">Master Device Authorization Key</span>
            </div>
            <p className="text-[11px] text-neutral-500">
              When logging in from a new smartphone or computer, the user must provide this master key to authorize the hardware.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 max-w-md">
              <input
                type="text"
                value={masterCodeInput}
                onChange={(e) => setMasterCodeInput(e.target.value)}
                placeholder="e.g. MF-DEV-2026"
                className="flex-1 px-3.5 py-2 bg-white border border-neutral-300 rounded-lg text-xs font-mono font-bold"
              />
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('mf_admin_master_code', masterCodeInput.trim().toUpperCase());
                  setCodeSaved(true);
                  setTimeout(() => setCodeSaved(false), 2500);
                }}
                className="px-4 py-2 bg-black text-white font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                {codeSaved ? 'Saved!' : 'Update Key'}
              </button>
            </div>
            {codeSaved && (
              <p className="text-[11px] text-emerald-700 font-semibold">Master Device Authorization Key updated successfully.</p>
            )}
          </div>

          {/* Current Device Identifier */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950">
            <div className="flex items-center gap-2.5">
              <Laptop className="w-4 h-4 text-emerald-700" />
              <div>
                <p className="font-bold">Current Device: <span className="font-mono text-[11px]">{adminDeviceService.getCurrentDeviceId()}</span></p>
                <p className="text-[11px] text-emerald-800">{adminDeviceService.getDeviceInfo().deviceName} • Status: Verified Active</p>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">
              This Device
            </span>
          </div>

          {/* Registered Devices List */}
          <div className="space-y-3">
            <h3 className="font-bold text-neutral-900 uppercase text-[11px]">All Approved Hardware Devices</h3>
            {devices.length === 0 ? (
              <div className="p-6 text-center text-neutral-400 bg-neutral-50 rounded-xl">
                No devices registered yet. The current primary device is active.
              </div>
            ) : (
              <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
                {devices.map((dev) => {
                  const isCurrent = dev.deviceId === adminDeviceService.getCurrentDeviceId();
                  return (
                    <div key={dev.deviceId} className="p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {dev.deviceName?.includes('Mobile') ? (
                            <Smartphone className="w-4 h-4 text-neutral-600" />
                          ) : (
                            <Laptop className="w-4 h-4 text-neutral-600" />
                          )}
                          <span className="font-bold text-neutral-900 text-xs">{dev.deviceName || 'Admin Device'}</span>
                          {isCurrent && (
                            <span className="text-[9px] bg-black text-white px-1.5 py-0.5 rounded font-bold uppercase">Active Now</span>
                          )}
                        </div>
                        <p className="font-mono text-[11px] text-neutral-500">ID: {dev.deviceId}</p>
                        <p className="text-[10px] text-neutral-400">Authorized by: {dev.authorizedBy || 'System Administrator'}</p>
                      </div>

                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={async () => {
                            await adminDeviceService.revokeDevice(dev.deviceId);
                            await loadDevices();
                          }}
                          className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer w-fit"
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

        </div>
      )}

    </div>
  );
};
