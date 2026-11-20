import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Ticket, X, Truck, UserCheck, Search } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Coupon, CustomerProfile } from '../types';
import { settingsService } from '../services/settingsService';
import { orderService } from '../services/orderService';
import { posService } from '../services/posService';
import { notificationService } from '../services/notificationService';
import { useAuth } from '../context/AuthContext';
import { AdminPageHeader } from './AdminLayout';

interface SelectableCustomer {
  key: string;
  uid: string;
  name: string;
  email: string;
  phone: string;
}

export const AdminCoupons: React.FC = () => {
  const { currentUser } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>(() => settingsService.getInstantCoupons());
  const [customers, setCustomers] = useState<SelectableCustomer[]>([]);
  const [loading, setLoading] = useState(() => settingsService.getInstantCoupons().length === 0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Form Fields
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed' | 'free_delivery'>('percentage');
  const [discountAmount, setDiscountAmount] = useState<number>(10);
  const [minOrderAmount, setMinOrderAmount] = useState<number>(0);
  const [maxDiscount, setMaxDiscount] = useState<number | undefined>(500);
  const [expiryDate, setExpiryDate] = useState('2028-12-31');
  const [usageLimit, setUsageLimit] = useState<number | undefined>(100);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [autoApply, setAutoApply] = useState<boolean>(true);
  const [active, setActive] = useState(true);
  const [notifyCustomers, setNotifyCustomers] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSelectableCustomers = async () => {
    const map = new Map<string, SelectableCustomer>();

    const addCandidate = (uid: string, name: string, email: string, phone: string) => {
      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanPhone = (phone || '').trim();
      const key = (cleanEmail || cleanPhone || uid || '').toLowerCase();
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        if (!existing.name && name) existing.name = name;
        if (!existing.email && email) existing.email = email;
        if (!existing.phone && cleanPhone) existing.phone = cleanPhone;
      } else {
        map.set(key, {
          key,
          uid: uid || '',
          name: name || 'Customer',
          email: email || '',
          phone: cleanPhone,
        });
      }
    };

    posService.getInstantRegisteredUsers().forEach((c) => {
      addCandidate(c.uid || '', c.name || 'Customer', c.email || '', c.phone || '');
    });
    posService.getInstantCrmCustomers().forEach((c) => {
      addCandidate(c.uid || '', c.name || 'Customer', c.email || '', c.phone || '');
    });

    try {
      const snap = await getDocs(collection(db, 'users'));
      snap.forEach((d) => {
        const data = d.data() as CustomerProfile;
        addCandidate(d.id, data.name || 'Customer', data.email || '', data.phone || '');
      });
    } catch {
      // ignore
    }

    try {
      const orders = await orderService.getAllOrdersAdmin();
      orders.forEach((o) => {
        addCandidate(
          o.customerId && o.customerId !== 'guest' ? o.customerId : '',
          o.customerName || o.shippingAddress?.fullName || 'Customer',
          o.customerEmail || o.shippingAddress?.email || '',
          o.customerPhone || o.shippingAddress?.phone || ''
        );
      });
    } catch {
      // ignore
    }

    setCustomers(Array.from(map.values()));
  };

  useEffect(() => {
    const unsub = settingsService.subscribeToCoupons((list) => {
      setCoupons(list);
      setLoading(false);
    });
    loadSelectableCustomers();
    return () => unsub();
  }, []);

  const openAddModal = () => {
    loadSelectableCustomers();
    setEditingCoupon(null);
    setCode('FABRIC10');
    setDiscountType('percentage');
    setDiscountAmount(10);
    setMinOrderAmount(1500);
    setMaxDiscount(500);
    setExpiryDate('2028-12-31');
    setUsageLimit(100);
    setSelectedCustomerKey('');
    setCustomerSearch('');
    setAutoApply(true);
    setActive(true);
    setNotifyCustomers(true);
    setModalOpen(true);
  };

  const openQuickFreeDeliveryModal = () => {
    loadSelectableCustomers();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    setEditingCoupon(null);
    setCode(`FREEDEL-${rand}`);
    setDiscountType('free_delivery');
    setDiscountAmount(0);
    setMinOrderAmount(0);
    setMaxDiscount(undefined);
    setExpiryDate('2028-12-31');
    setUsageLimit(1);
    setSelectedCustomerKey('');
    setCustomerSearch('');
    setAutoApply(true);
    setActive(true);
    setNotifyCustomers(true);
    setModalOpen(true);
  };

  const openEditModal = (c: Coupon) => {
    loadSelectableCustomers();
    setEditingCoupon(c);
    setCode(c.code);
    setDiscountType(c.discountType);
    setDiscountAmount(c.discountAmount);
    setMinOrderAmount(c.minOrderAmount);
    setMaxDiscount(c.maxDiscount);
    setExpiryDate(c.expiryDate || '');
    setUsageLimit(c.usageLimit);
    const matchCust = customers.find(
      (u) =>
        (c.targetCustomerUid && u.uid === c.targetCustomerUid) ||
        (c.targetCustomerEmail && u.email.toLowerCase() === c.targetCustomerEmail.toLowerCase()) ||
        (c.targetCustomerPhone && u.phone === c.targetCustomerPhone)
    );
    setSelectedCustomerKey(matchCust?.key || '');
    setCustomerSearch('');
    setAutoApply(c.autoApply !== false);
    setActive(c.active);
    setNotifyCustomers(false);
    setModalOpen(true);
  };

  const handleCustomerSelect = (key: string) => {
    setSelectedCustomerKey(key);
    if (key) {
      setUsageLimit(1);
    }
  };

  const handleDiscountTypeChange = (type: 'percentage' | 'fixed' | 'free_delivery') => {
    setDiscountType(type);
    if (type === 'free_delivery') {
      setDiscountAmount(0);
      setMaxDiscount(undefined);
      if (minOrderAmount === 1500) setMinOrderAmount(0);
      if (!editingCoupon) {
        setUsageLimit(1);
        if (code === 'FABRIC10') {
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          setCode(`FREEDEL-${rand}`);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const cleanCode = code.toUpperCase().trim();
    if (!cleanCode) {
      setSaving(false);
      return;
    }

    const pickedCustomer = customers.find((u) => u.key === selectedCustomerKey);

    const payload: Omit<Coupon, 'id' | 'usedCount'> = {
      code: cleanCode,
      discountType,
      discountAmount: discountType === 'free_delivery' ? 0 : (Number(discountAmount) || 0),
      minOrderAmount: Number(minOrderAmount) || 0,
      maxDiscount: discountType === 'free_delivery' ? undefined : (maxDiscount ? Number(maxDiscount) : undefined),
      expiryDate,
      usageLimit: usageLimit ? Number(usageLimit) : undefined,
      active,
      ...(pickedCustomer
        ? {
            targetCustomerUid: pickedCustomer.uid && !pickedCustomer.uid.startsWith('guest-') ? pickedCustomer.uid : undefined,
            targetCustomerEmail: pickedCustomer.email || undefined,
            targetCustomerPhone: pickedCustomer.phone || undefined,
            targetCustomerName: pickedCustomer.name || undefined,
            autoApply: discountType === 'free_delivery' ? autoApply : undefined,
          }
        : editingCoupon
        ? {
            targetCustomerUid: undefined,
            targetCustomerEmail: undefined,
            targetCustomerPhone: undefined,
            targetCustomerName: undefined,
            autoApply: undefined,
          }
        : {}),
    };

    try {
      if (editingCoupon) {
        const updatedItem: Coupon = { ...editingCoupon, ...payload };
        setCoupons((prev) => prev.map((c) => (c.id === editingCoupon.id ? updatedItem : c)));
        await settingsService.updateCoupon(editingCoupon.id, payload);
        setActionToast(`Coupon "${cleanCode}" updated.`);
      } else {
        const newId = await settingsService.createCoupon(payload);
        const newItem: Coupon = { ...payload, id: newId, usedCount: 0 };
        setCoupons((prev) => [newItem, ...prev.filter((c) => c.id !== newId && c.code !== cleanCode)]);
        if (currentUser) {
          await settingsService.logAdminAction(
            currentUser.uid,
            currentUser.email || 'admin',
            'CREATE_COUPON',
            cleanCode,
            pickedCustomer ? `Targeted to ${pickedCustomer.name}` : `Type: ${discountType}`
          );
        }
        if (active && notifyCustomers) {
          notificationService
            .notifyNewCouponOffer({
              code: cleanCode,
              discountType,
              discountAmount: discountType === 'free_delivery' ? 0 : Number(discountAmount) || 0,
              minOrderAmount: Number(minOrderAmount) || 0,
              targetCustomerUid: pickedCustomer?.uid && !pickedCustomer.uid.startsWith('guest-') ? pickedCustomer.uid : undefined,
              targetCustomerEmail: pickedCustomer?.email,
              targetCustomerPhone: pickedCustomer?.phone,
              targetCustomerName: pickedCustomer?.name,
            })
            .catch(() => {});
        }
        setActionToast(`Coupon "${cleanCode}" created${active && notifyCustomers ? ' & customer notified' : ''}.`);
      }
      setModalOpen(false);
      setTimeout(() => setActionToast(null), 3000);
    } catch (err) {
      console.warn("Coupon save exception:", err);
      if (!editingCoupon) {
        const fallbackId = `cpn-${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
        const newItem: Coupon = { ...payload, id: fallbackId, usedCount: 0 };
        setCoupons((prev) => [newItem, ...prev.filter((c) => c.id !== fallbackId && c.code !== cleanCode)]);
        const cur = settingsService.getInstantCoupons();
        settingsService.saveLocalCoupons([newItem, ...cur.filter((c) => c.id !== fallbackId && c.code !== cleanCode)]);
      }
      setModalOpen(false);
      setActionToast(`Coupon "${cleanCode}" saved.`);
      setTimeout(() => setActionToast(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (c: Coupon) => {
    setDeletingCoupon(c);
  };

  const confirmDeleteCoupon = async () => {
    if (!deletingCoupon) return;
    const targetId = deletingCoupon.id;
    const targetCode = deletingCoupon.code;

    setCoupons((prev) => prev.filter((c) => c.id !== targetId));
    setDeletingCoupon(null);

    try {
      await settingsService.deleteCoupon(targetId);
      setActionToast(`Coupon "${targetCode}" deleted.`);
      setTimeout(() => setActionToast(null), 3000);
    } catch {
      setActionToast(`Coupon "${targetCode}" removed.`);
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Coupons & Discounts"
        subtitle="Promo codes & one-time free delivery passes"
        actions={
          <>
            <button
              onClick={openQuickFreeDeliveryModal}
              className="px-3.5 py-2 bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-emerald-800 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>1x Free Delivery Pass</span>
            </button>

            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Coupon</span>
            </button>
          </>
        }
      />

      {/* Coupons Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading coupons...</div>
        ) : coupons.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <Ticket className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">No coupons created yet</h4>
            <p className="text-xs text-neutral-500 mb-4">Add your first promotional discount voucher or customer Free Delivery pass.</p>
            <button
              onClick={openAddModal}
              className="px-5 py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg cursor-pointer"
            >
              Create Coupon
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Code</th>
                  <th className="p-3.5">Benefit</th>
                  <th className="p-3.5">Assigned User</th>
                  <th className="p-3.5">Min Order</th>
                  <th className="p-3.5">Usage</th>
                  <th className="p-3.5">Expiry</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium">
                {coupons.map((c) => {
                  const hasCustomer = Boolean(c.targetCustomerName || c.targetCustomerEmail || c.targetCustomerPhone);
                  return (
                    <tr key={c.id} className="hover:bg-neutral-50/50">
                      <td className="p-3.5 font-mono font-bold text-neutral-900">{c.code}</td>
                      <td className="p-3.5 font-bold text-neutral-800">
                        {c.discountType === 'free_delivery' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                            <Truck className="w-3 h-3" />
                            <span>FREE DELIVERY</span>
                          </span>
                        ) : c.discountType === 'percentage' ? (
                          `${c.discountAmount}% OFF`
                        ) : (
                          `৳${c.discountAmount} OFF`
                        )}
                      </td>
                      <td className="p-3.5">
                        {hasCustomer ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 font-bold text-neutral-900">
                              <UserCheck className="w-3 h-3 text-emerald-600" />
                              <span>{c.targetCustomerName || 'Selected User'}</span>
                            </span>
                            <span className="text-[10px] text-neutral-500">
                              {c.targetCustomerEmail || c.targetCustomerPhone}
                            </span>
                          </div>
                        ) : (
                          <span className="text-neutral-400">All Customers</span>
                        )}
                      </td>
                      <td className="p-3.5 text-neutral-600">৳{c.minOrderAmount || 0}</td>
                      <td className="p-3.5 text-neutral-600">
                        {c.usedCount || 0} / {c.usageLimit || '∞'}
                      </td>
                      <td className="p-3.5 text-neutral-500">{c.expiryDate || 'No expiry'}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          c.active && (!c.usageLimit || (c.usedCount || 0) < c.usageLimit)
                            ? 'bg-black text-white'
                            : 'bg-neutral-200 text-neutral-600'
                        }`}>
                          {c.usageLimit && (c.usedCount || 0) >= c.usageLimit
                            ? 'Used'
                            : c.active
                            ? 'Active'
                            : 'Disabled'}
                        </span>
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(c)}
                          className="p-1.5 text-neutral-600 hover:text-black rounded hover:bg-neutral-100 cursor-pointer"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="p-1.5 text-red-600 hover:text-red-800 rounded hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (() => {
        const q = customerSearch.trim().toLowerCase();
        const qDigits = customerSearch.replace(/[^0-9]/g, '');
        const matchingCustomers = q
          ? customers.filter((u) => {
              const nameMatch = u.name.toLowerCase().includes(q);
              const emailMatch = u.email.toLowerCase().includes(q);
              const phoneRawMatch = u.phone.toLowerCase().includes(q);
              const uDigits = u.phone.replace(/[^0-9]/g, '');
              const digitsMatch = qDigits.length >= 2 && uDigits.includes(qDigits);
              return nameMatch || emailMatch || phoneRawMatch || digitsMatch;
            })
          : customers;
        const pickedCustomerObj = customers.find((u) => u.key === selectedCustomerKey);

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-fade-in text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                {editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-black cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">Coupon Code *</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. FREEDEL-9A2B or SUMMER20"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono uppercase"
                />
              </div>

              <div className={discountType === 'free_delivery' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Benefit Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => handleDiscountTypeChange(e.target.value as any)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed BDT (৳)</option>
                    <option value="free_delivery">Free Delivery (৳0 Shipping)</option>
                  </select>
                </div>
                {discountType !== 'free_delivery' && (
                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">Discount Amount</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                    />
                  </div>
                )}
              </div>

              {/* Assign Specific Customer + Side-by-Side Search System */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-neutral-700 uppercase">
                    Assign Customer (Optional)
                  </label>
                  {q && (
                    <span className="text-[10px] font-semibold text-neutral-500">
                      {matchingCustomers.length} {matchingCustomers.length === 1 ? 'match' : 'matches'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  {/* Search input beside customer dropdown */}
                  <div className="relative sm:col-span-5">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search name or phone..."
                      className="w-full pl-8 pr-7 py-2 bg-neutral-50 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black"
                    />
                    {customerSearch && (
                      <button
                        type="button"
                        onClick={() => setCustomerSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black cursor-pointer"
                        title="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Customer selector dropdown */}
                  <select
                    value={selectedCustomerKey}
                    onChange={(e) => handleCustomerSelect(e.target.value)}
                    className="sm:col-span-7 w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded text-xs"
                  >
                    <option value="">
                      {q
                        ? matchingCustomers.length > 0
                          ? `Select customer (${matchingCustomers.length} found)`
                          : 'No matching customer found'
                        : 'All Customers (Public Coupon Code)'}
                    </option>
                    {pickedCustomerObj && !matchingCustomers.some((u) => u.key === pickedCustomerObj.key) && (
                      <option key={pickedCustomerObj.key} value={pickedCustomerObj.key}>
                        {pickedCustomerObj.name} {pickedCustomerObj.phone ? `— ${pickedCustomerObj.phone}` : ''}
                      </option>
                    )}
                    {matchingCustomers.map((u) => (
                      <option key={u.key} value={u.key}>
                        {u.name} {u.phone ? `— ${u.phone}` : ''} {u.email ? `(${u.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick-pick results when searching */}
                {q && matchingCustomers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {matchingCustomers.slice(0, 5).map((u) => {
                      const isPicked = selectedCustomerKey === u.key;
                      return (
                        <button
                          key={u.key}
                          type="button"
                          onClick={() => handleCustomerSelect(u.key)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                            isPicked
                              ? 'bg-black text-white border-black'
                              : 'bg-neutral-50 text-neutral-800 border-neutral-300 hover:border-black'
                          }`}
                        >
                          {u.name} {u.phone ? `• ${u.phone}` : ''}
                        </button>
                      );
                    })}
                  </div>
                )}

                <p className="text-[10px] text-neutral-400">
                  Search by phone number or name to assign this voucher to a specific user (1-time use).
                </p>
              </div>

              {discountType === 'free_delivery' && selectedCustomerKey && (
                <label className="flex items-start gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoApply}
                    onChange={(e) => setAutoApply(e.target.checked)}
                    className="accent-black w-4 h-4 mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-emerald-950 block">Auto-apply at Checkout</span>
                    <span className="text-[10px] text-emerald-800">
                      Customer gets free delivery automatically on their next order (1-time use).
                    </span>
                  </div>
                </label>
              )}

              <div className={discountType === 'free_delivery' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Min Order Amount (৳)</label>
                  <input
                    type="number"
                    min={0}
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                {discountType !== 'free_delivery' && (
                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">Max Discount Cap (৳)</label>
                    <input
                      type="number"
                      value={maxDiscount || ''}
                      onChange={(e) => setMaxDiscount(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Total Usage Limit</label>
                  <input
                    type="number"
                    min={1}
                    value={usageLimit || ''}
                    onChange={(e) => setUsageLimit(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="1 for one-time"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
              </div>

              <div className="pt-2 space-y-2.5">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-neutral-800">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-black w-4 h-4" />
                  <span>Coupon Active</span>
                </label>

                {active && (
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-neutral-700">
                    <input
                      type="checkbox"
                      checked={notifyCustomers}
                      onChange={(e) => setNotifyCustomers(e.target.checked)}
                      className="accent-black w-4 h-4"
                    />
                    <span>
                      Send Mobile &amp; App Notification {selectedCustomerKey ? 'to Selected Customer' : 'to All Customers'}
                    </span>
                  </label>
                )}
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-neutral-300 rounded text-neutral-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-black text-white font-bold uppercase tracking-wider rounded hover:bg-neutral-800 cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {/* Delete Coupon Confirmation Modal */}
      {deletingCoupon && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold uppercase tracking-tight text-neutral-900">
                Delete Coupon?
              </h3>
              <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete promo code <b className="font-mono text-neutral-900">"{deletingCoupon.code}"</b>?
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCoupon(null)}
                className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteCoupon}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer shadow-sm"
              >
                Delete Coupon
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Toast */}
      {actionToast && (
        <div className="fixed bottom-6 right-6 z-70 bg-neutral-950 text-white text-xs font-medium py-3 px-4 rounded-xl shadow-2xl flex items-center gap-2 border border-neutral-800 animate-slide-up">
          <span>{actionToast}</span>
        </div>
      )}

    </div>
  );
};
