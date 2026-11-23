import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Search, PackageCheck, X, ShoppingCart } from 'lucide-react';
import { PurchaseEntry, PurchaseItem, Supplier, Product } from '../types';
import { posService } from '../services/posService';
import { productService } from '../services/productService';
import { useAuth } from '../context/AuthContext';
import { getLocalDateKey, getLocalMonthKey, normalizeEntryDateKey } from '../lib/accountingUtils';
import { AdminPageHeader } from './AdminLayout';

export const AdminPurchases: React.FC = () => {
  const { currentUser } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseEntry[]>(() => posService.getInstantPurchases());
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => posService.getInstantSuppliers());
  const [products, setProducts] = useState<Product[]>(() => productService.getInstantAllProducts());

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [supplierId, setSupplierId] = useState('');
  const [customSupplierName, setCustomSupplierName] = useState('');
  const [date, setDate] = useState(() => getLocalDateKey());
  const [paymentMethod, setPaymentMethod] = useState<PurchaseEntry['paymentMethod']>('cash');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [syncStock, setSyncStock] = useState(true);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([
    { productId: '', productName: '', sku: '', quantity: 10, unitCost: 0, totalCost: 0 },
  ]);

  useEffect(() => {
    const unsubPur = posService.subscribeToPurchases(setPurchases);
    const unsubSup = posService.subscribeToSuppliers(setSuppliers);
    const unsubProd = productService.subscribeToAllProductsAdmin(setProducts);
    return () => {
      unsubPur();
      unsubSup();
      unsubProd();
    };
  }, []);

  const totalPurchaseAmount = items.reduce((s, i) => s + (Number(i.totalCost) || 0), 0);

  const openNewModal = () => {
    setSupplierId(suppliers[0]?.id || '');
    setCustomSupplierName('');
    setDate(getLocalDateKey());
    setPaymentMethod('cash');
    setPaidAmount(0);
    setSyncStock(true);
    setNotes('');
    setItems([{ productId: '', productName: '', sku: '', quantity: 10, unitCost: 0, totalCost: 0 }]);
    setModalOpen(true);
  };

  const updateLine = (idx: number, patch: Partial<PurchaseItem>) => {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const merged = { ...row, ...patch };
        merged.totalCost = (Number(merged.quantity) || 0) * (Number(merged.unitCost) || 0);
        return merged;
      })
    );
  };

  const handleSelectCatalogProduct = (idx: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) {
      updateLine(idx, { productId: '', sku: '' });
      return;
    }
    updateLine(idx, {
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      unitCost: prod.costPrice || Math.round((prod.price || 0) * 0.6),
    });
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter((i) => i.productName.trim() && i.quantity > 0);
    if (validItems.length === 0) return;

    const matchedSup = suppliers.find((s) => s.id === supplierId);
    const resolvedSupplierName = matchedSup?.name || customSupplierName.trim() || 'Direct Supplier';

    setSaving(true);
    try {
      await posService.addPurchase({
        supplierId: matchedSup?.id || '',
        supplierName: resolvedSupplierName,
        date,
        items: validItems,
        paidAmount: paymentMethod === 'credit' ? 0 : paidAmount || totalPurchaseAmount,
        paymentMethod,
        syncStock,
        notes,
        createdBy: currentUser?.email || 'Admin',
      });
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const currentMonthPrefix = getLocalMonthKey();
  const monthlyPurchased = purchases
    .filter((p) => normalizeEntryDateKey(p.date).startsWith(currentMonthPrefix))
    .reduce((s, p) => s + (Number(p.totalAmount) || 0), 0);
  const totalPayableDue = purchases.reduce((s, p) => s + (Number(p.dueAmount) || 0), 0);
  const allTimePurchased = purchases.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0);

  const filtered = purchases.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.purchaseNumber || '').toLowerCase().includes(q) ||
      (p.supplierName || '').toLowerCase().includes(q) ||
      (p.items || []).some((i) => (i.productName || '').toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Stock Purchases"
        subtitle="Log supplier bills, track dues & auto-update catalog stock"
        actions={
          <button
            type="button"
            onClick={openNewModal}
            className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Purchase Entry</span>
          </button>
        }
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 tabular-nums">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">This Month Purchases</span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">
            ৳{monthlyPurchased.toLocaleString('en-BD')}
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Total Supplier Dues</span>
          <p className="text-2xl font-black font-mono text-amber-700 mt-1">
            ৳{totalPayableDue.toLocaleString('en-BD')}
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">All-Time Purchases</span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">
            ৳{allTimePurchased.toLocaleString('en-BD')}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by PO number, supplier name, or item..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500 space-y-2">
            <ShoppingCart className="w-9 h-9 text-neutral-300 mx-auto" />
            <p className="font-bold text-neutral-900 text-sm">No purchase entries recorded yet</p>
            <p className="text-neutral-400 max-w-sm mx-auto">
              Log stock purchases from your suppliers to automatically update inventory and track supplier dues.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">PO # / Date</th>
                  <th className="p-3.5">Supplier</th>
                  <th className="p-3.5">Purchased Items</th>
                  <th className="p-3.5 text-right">Total</th>
                  <th className="p-3.5 text-right">Paid</th>
                  <th className="p-3.5 text-right">Due</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium tabular-nums">
                {filtered.map((pur) => (
                  <tr key={pur.id} className="hover:bg-neutral-50/50">
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="font-mono font-bold text-neutral-900 block">{pur.purchaseNumber}</span>
                      <span className="text-[11px] font-mono text-neutral-400 block">{pur.date}</span>
                      {pur.createdBy && (
                        <span className="text-[10px] text-neutral-400">By: {pur.createdBy}</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span className="font-semibold text-neutral-900">{pur.supplierName}</span>
                      <span className="block text-[10px] uppercase text-neutral-400">{pur.paymentMethod}</span>
                    </td>
                    <td className="p-3.5">
                      <div className="space-y-0.5">
                        {pur.items.map((it, i) => (
                          <div key={i} className="text-neutral-700">
                            {it.productName}
                            {it.sku ? <span className="ml-1 font-mono text-[10px] text-neutral-400">({it.sku})</span> : null}
                            {' '}— <b>{it.quantity}</b> pcs @ ৳{it.unitCost}
                          </div>
                        ))}
                      </div>
                      {pur.stockSynced && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold mt-0.5">
                          <PackageCheck className="w-3 h-3" /> Stock Added
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-neutral-900">
                      ৳{pur.totalAmount.toLocaleString('en-BD')}
                    </td>
                    <td className="p-3.5 text-right font-mono text-emerald-700">
                      ৳{pur.paidAmount.toLocaleString('en-BD')}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-amber-700">
                      {pur.dueAmount > 0 ? `৳${pur.dueAmount.toLocaleString('en-BD')}` : '—'}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => posService.deletePurchase(pur.id)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 cursor-pointer"
                        title="Delete Purchase Entry"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Purchase Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-2xl w-full p-5 sm:p-6 space-y-4 my-6">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                Record Stock Purchase
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Supplier</label>
                  {suppliers.length > 0 ? (
                    <select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-semibold"
                    >
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      <option value="">Other / One-time Supplier</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={customSupplierName}
                      onChange={(e) => setCustomSupplierName(e.target.value)}
                      placeholder="Supplier / Mill Name"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                    />
                  )}
                </div>

                {suppliers.length > 0 && !supplierId && (
                  <div>
                    <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      required
                      value={customSupplierName}
                      onChange={(e) => setCustomSupplierName(e.target.value)}
                      placeholder="Supplier Name"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PurchaseEntry['paymentMethod'])}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-semibold"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="bkash">bKash</option>
                    <option value="nagad">Nagad</option>
                    <option value="credit">Full Credit (Due)</option>
                  </select>
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2 border-t border-b border-neutral-200 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-neutral-600">Purchased Items</span>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) => [
                        ...prev,
                        { productId: '', productName: '', sku: '', quantity: 10, unitCost: 0, totalCost: 0 },
                      ])
                    }
                    className="text-[11px] font-bold text-black hover:underline cursor-pointer"
                  >
                    + Add Item Row
                  </button>
                </div>

                {items.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 sm:col-span-5 space-y-1">
                      <select
                        value={row.productId || ''}
                        onChange={(e) => handleSelectCatalogProduct(idx, e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs"
                      >
                        <option value="">-- Link Catalog Product (Optional) --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        required
                        value={row.productName}
                        onChange={(e) => updateLine(idx, { productName: e.target.value })}
                        placeholder="Item / Fabric description"
                        className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <label className="text-[10px] text-neutral-400 block">Qty</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={row.quantity}
                        onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <label className="text-[10px] text-neutral-400 block">Unit Cost (৳)</label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={row.unitCost}
                        onChange={(e) => updateLine(idx, { unitCost: Number(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2 text-right font-mono font-bold pt-4">
                      ৳{row.totalCost.toLocaleString('en-BD')}
                    </div>
                    <div className="col-span-1 text-right pt-4">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                    Paid Amount Now (৳) — Total Bill: ৳{totalPurchaseAmount.toLocaleString('en-BD')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={totalPurchaseAmount}
                    disabled={paymentMethod === 'credit'}
                    value={paymentMethod === 'credit' ? 0 : paidAmount}
                    onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                    placeholder={String(totalPurchaseAmount)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
                  />
                  <span className="text-[10px] text-neutral-400">
                    Leave 0 with non-credit payment to mark full bill paid, or enter partial payment to record supplier due.
                  </span>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Notes</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Challan #, fabric lot, etc."
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-neutral-800">
                <input
                  type="checkbox"
                  checked={syncStock}
                  onChange={(e) => setSyncStock(e.target.checked)}
                  className="accent-black"
                />
                <span>Automatically add purchased quantity to linked Product Stock &amp; update Cost Price</span>
              </label>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 font-bold uppercase rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-black text-white font-bold uppercase rounded-lg hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Purchase Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
