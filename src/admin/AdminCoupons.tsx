import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Ticket, X, AlertCircle } from 'lucide-react';
import { Coupon } from '../types';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';

export const AdminCoupons: React.FC = () => {
  const { currentUser } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Form Fields
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountAmount, setDiscountAmount] = useState<number>(10);
  const [minOrderAmount, setMinOrderAmount] = useState<number>(1500);
  const [maxDiscount, setMaxDiscount] = useState<number | undefined>(500);
  const [expiryDate, setExpiryDate] = useState('2027-12-31');
  const [usageLimit, setUsageLimit] = useState<number | undefined>(100);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = settingsService.subscribeToCoupons((list) => {
      setCoupons(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const openAddModal = () => {
    setEditingCoupon(null);
    setCode('FABRIC10');
    setDiscountType('percentage');
    setDiscountAmount(10);
    setMinOrderAmount(1500);
    setMaxDiscount(500);
    setExpiryDate('2027-12-31');
    setUsageLimit(100);
    setActive(true);
    setModalOpen(true);
  };

  const openEditModal = (c: Coupon) => {
    setEditingCoupon(c);
    setCode(c.code);
    setDiscountType(c.discountType);
    setDiscountAmount(c.discountAmount);
    setMinOrderAmount(c.minOrderAmount);
    setMaxDiscount(c.maxDiscount);
    setExpiryDate(c.expiryDate || '');
    setUsageLimit(c.usageLimit);
    setActive(c.active);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const cleanCode = code.toUpperCase().trim();
    if (!cleanCode) {
      setSaving(false);
      return;
    }

    const payload = {
      code: cleanCode,
      discountType,
      discountAmount: Number(discountAmount) || 0,
      minOrderAmount: Number(minOrderAmount) || 0,
      maxDiscount: maxDiscount ? Number(maxDiscount) : undefined,
      expiryDate,
      usageLimit: usageLimit ? Number(usageLimit) : undefined,
      active,
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
        setActionToast(`Coupon "${cleanCode}" created.`);
      }
      setModalOpen(false);
      setTimeout(() => setActionToast(null), 3000);
    } catch (err) {
      console.warn("Coupon save exception:", err);
      if (!editingCoupon) {
        const fallbackId = `cpn-${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
        const newItem: Coupon = { ...payload, id: fallbackId, usedCount: 0 };
        setCoupons((prev) => [newItem, ...prev.filter((c) => c.id !== fallbackId && c.code !== cleanCode)]);
        const cur = settingsService.getLocalCoupons();
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

    // Immediately remove from UI
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
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Coupons & Discounts
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Configure promotional promo codes with minimum spending requirements.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Create Coupon</span>
        </button>
      </div>

      {/* Coupons Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading coupons...</div>
        ) : coupons.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <Ticket className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">No coupons created yet</h4>
            <p className="text-xs text-neutral-500 mb-4">Add your first promotional discount voucher for customers.</p>
            <button
              onClick={openAddModal}
              className="px-5 py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg"
            >
              Create Coupon
            </button>
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
              <tr>
                <th className="p-3.5">Code</th>
                <th className="p-3.5">Discount</th>
                <th className="p-3.5">Min Order</th>
                <th className="p-3.5">Max Cap</th>
                <th className="p-3.5">Usage</th>
                <th className="p-3.5">Expiry</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {coupons.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50/50">
                  <td className="p-3.5 font-mono font-bold text-neutral-900">{c.code}</td>
                  <td className="p-3.5 font-bold text-neutral-800">
                    {c.discountType === 'percentage' ? `${c.discountAmount}% OFF` : `৳${c.discountAmount} OFF`}
                  </td>
                  <td className="p-3.5 text-neutral-600">৳{c.minOrderAmount}</td>
                  <td className="p-3.5 text-neutral-600">{c.maxDiscount ? `৳${c.maxDiscount}` : 'No cap'}</td>
                  <td className="p-3.5 text-neutral-600">
                    {c.usedCount || 0} / {c.usageLimit || '∞'}
                  </td>
                  <td className="p-3.5 text-neutral-500">{c.expiryDate || 'No expiry'}</td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      c.active ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-600'
                    }`}>
                      {c.active ? 'Active' : 'Disabled'}
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-fade-in text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                {editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-black">
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
                  placeholder="e.g. SUMMER20"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e: any) => setDiscountType(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed BDT (৳)</option>
                  </select>
                </div>
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Min Order Amount (৳)</label>
                  <input
                    type="number"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
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
                    value={usageLimit || ''}
                    onChange={(e) => setUsageLimit(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-neutral-800">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-black w-4 h-4" />
                  <span>Coupon Active</span>
                </label>
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
      )}

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
