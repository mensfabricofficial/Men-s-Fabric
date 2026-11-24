import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Search,
  PackageCheck,
  X,
  ShoppingCart,
  CheckCircle2,
  Clock,
  ArrowRightCircle,
  XCircle,
  ChevronDown,
  Edit3,
} from 'lucide-react';
import { PurchaseEntry, Supplier, Product } from '../types';
import { posService } from '../services/posService';
import { productService } from '../services/productService';
import { useAuth } from '../context/AuthContext';
import { getLocalDateKey, getLocalMonthKey, normalizeEntryDateKey } from '../lib/accountingUtils';
import { AdminPageHeader } from './AdminLayout';

type StageFilter = 'all' | 'pending_purchase' | 'pending_stock' | 'approved' | 'rejected';

const getEffectiveStatus = (pur: PurchaseEntry): 'pending_purchase' | 'pending_stock' | 'approved' | 'rejected' => {
  if (pur.status) return pur.status;
  return pur.stockSynced ? 'approved' : 'pending_purchase';
};

export const AdminPurchases: React.FC = () => {
  const { currentUser, staffProfile } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseEntry[]>(() => {
    const inst = posService.getInstantPurchases();
    return inst.length > 0 ? inst : posService.getLocalPurchases();
  });
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    const inst = posService.getInstantSuppliers();
    return inst.length > 0 ? inst : posService.getLocalSuppliers();
  });
  const [products, setProducts] = useState<Product[]>(() => {
    const inst = productService.getInstantAllProducts();
    return inst.length > 0 ? inst : productService.getLocalProducts();
  });

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [reviewingPurchase, setReviewingPurchase] = useState<PurchaseEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Modal Form state matching the clean 3-row New Purchase Entry layout
  const [purchaseNumber, setPurchaseNumber] = useState('PUR-2001');
  const [supplierId, setSupplierId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [date, setDate] = useState(() => getLocalDateKey());
  const [formError, setFormError] = useState('');

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

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 3500);
  };

  const totalAmount = Math.max(0, (Number(quantity) || 0) * (Number(unitCost) || 0));
  const clampedPaid = Math.min(totalAmount, Math.max(0, Number(paidAmount) || 0));
  const dueAmount = Math.max(0, totalAmount - clampedPaid);

  const openNewModal = () => {
    setReviewingPurchase(null);
    setFormError('');
    const nextSeq = 2001 + purchases.length;
    setPurchaseNumber(`PUR-${nextSeq}`);
    const defaultSup = suppliers[0];
    setSupplierId(defaultSup?.id || '');
    const defaultProd = products[0];
    if (defaultProd) {
      setSelectedProductId(defaultProd.id);
      setQuantity(1);
      setUnitCost(defaultProd.costPrice || Math.round((defaultProd.price || 0) * 0.6) || 0);
      if (defaultProd.supplierId && suppliers.some((s) => s.id === defaultProd.supplierId)) {
        setSupplierId(defaultProd.supplierId);
      }
    } else {
      setSelectedProductId('');
      setQuantity(1);
      setUnitCost(0);
    }
    setPaidAmount(0);
    setDate(getLocalDateKey());
    setModalOpen(true);
  };

  const openReviewModal = (pur: PurchaseEntry) => {
    const firstItem = pur.items?.[0];
    setReviewingPurchase(pur);
    setFormError('');
    setPurchaseNumber(pur.purchaseNumber || `PUR-${2001}`);
    setSupplierId(
      pur.supplierId ||
        suppliers.find((s) => s.name.toLowerCase() === (pur.supplierName || '').toLowerCase())?.id ||
        suppliers[0]?.id ||
        ''
    );
    setSelectedProductId(firstItem?.productId || '');
    setQuantity(Math.max(1, Number(firstItem?.quantity) || 1));
    setUnitCost(Math.max(0, Number(firstItem?.unitCost) || 0));
    setPaidAmount(Math.max(0, Number(pur.paidAmount) || 0));
    setDate(pur.date || getLocalDateKey());
    setModalOpen(true);
  };

  const handleSelectProduct = (prodId: string) => {
    setSelectedProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return;
    setUnitCost(prod.costPrice || Math.round((prod.price || 0) * 0.6) || 0);
    if (prod.supplierId && suppliers.some((s) => s.id === prod.supplierId)) {
      setSupplierId(prod.supplierId);
    }
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const matchedSup = suppliers.find((s) => s.id === supplierId);
    if (!matchedSup && suppliers.length > 0) {
      setFormError('Please select a Supplier.');
      return;
    }

    const matchedProd = products.find((p) => p.id === selectedProductId);
    const fallbackItem = reviewingPurchase?.items?.[0];
    if (!matchedProd && !fallbackItem?.productName) {
      setFormError('Please select a Product.');
      return;
    }

    if ((Number(quantity) || 0) <= 0) {
      setFormError('Quantity must be greater than 0.');
      return;
    }

    const actor = staffProfile?.name || currentUser?.email || 'Admin';
    const resolvedSupId = matchedSup?.id || reviewingPurchase?.supplierId || '';
    const resolvedSupName = matchedSup?.name || reviewingPurchase?.supplierName || 'Direct Supplier';

    setSaving(true);
    try {
      if (reviewingPurchase) {
        await posService.approvePurchaseToStock(reviewingPurchase.id, actor, {
          quantity: Number(quantity) || 1,
          unitCost: Number(unitCost) || 0,
          paidAmount: Number(paidAmount) || 0,
          supplierId: resolvedSupId,
          supplierName: resolvedSupName,
        });
        showToast(
          `Purchase ${reviewingPurchase.purchaseNumber} approved & sent to Stock Control for final approval.`
        );
      } else {
        await posService.addPurchase({
          purchaseNumber: purchaseNumber.trim() || undefined,
          supplierId: resolvedSupId,
          supplierName: resolvedSupName,
          date,
          items: [
            {
              productId: matchedProd?.id || '',
              productName: matchedProd?.name || fallbackItem?.productName || 'Product',
              sku: matchedProd?.sku || fallbackItem?.sku || '',
              quantity: Number(quantity) || 1,
              unitCost: Number(unitCost) || 0,
              totalCost: totalAmount,
            },
          ],
          paidAmount: clampedPaid,
          paymentMethod: dueAmount === totalAmount ? 'credit' : 'cash',
          syncStock: false,
          status: 'pending_stock',
          origin: 'manual_purchase',
          notes: `Submitted to Stock Queue (${Number(quantity) || 1} pcs)`,
          createdBy: actor,
        });
        showToast(
          `Purchase ${purchaseNumber.trim()} saved & sent to Stock Control for final approval.`
        );
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleQuickApproveToStock = async (pur: PurchaseEntry) => {
    const actor = staffProfile?.name || currentUser?.email || 'Admin';
    setProcessingId(pur.id);
    try {
      await posService.approvePurchaseToStock(pur.id, actor);
      showToast(`Purchase ${pur.purchaseNumber} approved & sent to Stock Control.`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (pur: PurchaseEntry) => {
    const actor = staffProfile?.name || currentUser?.email || 'Admin';
    setProcessingId(pur.id);
    try {
      await posService.rejectPurchaseEntry(pur.id, actor);
      showToast(`Purchase ${pur.purchaseNumber} rejected.`);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingPurchaseCount = purchases.filter((p) => getEffectiveStatus(p) === 'pending_purchase').length;
  const pendingStockCount = purchases.filter((p) => getEffectiveStatus(p) === 'pending_stock').length;
  const approvedCount = purchases.filter((p) => getEffectiveStatus(p) === 'approved').length;
  const rejectedCount = purchases.filter((p) => getEffectiveStatus(p) === 'rejected').length;

  const currentMonthPrefix = getLocalMonthKey();
  const monthlyApprovedPurchases = purchases
    .filter(
      (p) =>
        getEffectiveStatus(p) !== 'rejected' &&
        normalizeEntryDateKey(p.date).startsWith(currentMonthPrefix)
    )
    .reduce((s, p) => s + (Number(p.totalAmount) || 0), 0);
  const totalPayableDue = purchases
    .filter((p) => getEffectiveStatus(p) !== 'rejected')
    .reduce((s, p) => s + (Number(p.dueAmount) || 0), 0);

  const filtered = purchases.filter((p) => {
    const st = getEffectiveStatus(p);
    if (stageFilter !== 'all' && st !== stageFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.purchaseNumber || '').toLowerCase().includes(q) ||
      (p.supplierName || '').toLowerCase().includes(q) ||
      (p.items || []).some(
        (i) =>
          (i.productName || '').toLowerCase().includes(q) ||
          (i.sku || '').toLowerCase().includes(q)
      )
    );
  });

  const getProductStatusTag = (p: Product): string => {
    if (p.approvalStatus === 'pending_purchase') return 'Pending Purchase';
    if (p.approvalStatus === 'pending_stock') return 'Pending Stock';
    if (p.approvalStatus === 'rejected') return 'Rejected';
    return 'Approved';
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Purchases & Stock Intake"
        subtitle="Verify incoming products from catalog or log supplier purchases before forwarding to Stock Control"
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 tabular-nums">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Pending Purchase
          </span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">
            {pendingPurchaseCount}
          </p>
          <span className="text-[11px] text-neutral-400">Awaiting purchase approval</span>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
            Sent to Stock Queue
          </span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">
            {pendingStockCount}
          </p>
          <span className="text-[11px] text-neutral-400">Waiting Stock final approval</span>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Total Supplier Dues
          </span>
          <p className="text-2xl font-black font-mono text-amber-700 mt-1">
            ৳{totalPayableDue.toLocaleString('en-BD')}
          </p>
          <span className="text-[11px] text-neutral-400">Active payable balance</span>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            This Month Purchases
          </span>
          <p className="text-2xl font-black font-mono text-emerald-700 mt-1">
            ৳{monthlyApprovedPurchases.toLocaleString('en-BD')}
          </p>
          <span className="text-[11px] text-neutral-400">Excluding rejected bills</span>
        </div>
      </div>

      {/* Stage Filter Tabs + Search */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-neutral-100 rounded-lg self-start shrink-0">
          {(
            [
              { id: 'all', label: `All (${purchases.length})` },
              { id: 'pending_purchase', label: `Pending Purchase (${pendingPurchaseCount})` },
              { id: 'pending_stock', label: `Sent to Stock (${pendingStockCount})` },
              { id: 'approved', label: `Stock Approved (${approvedCount})` },
              { id: 'rejected', label: `Rejected (${rejectedCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStageFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                stageFilter === tab.id
                  ? 'bg-white text-black shadow-xs'
                  : 'text-neutral-600 hover:text-black'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice #, supplier name, product, or SKU..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500 space-y-2">
            <ShoppingCart className="w-9 h-9 text-neutral-300 mx-auto" />
            <p className="font-bold text-neutral-900 text-sm">
              {search.trim() || stageFilter !== 'all'
                ? 'No purchase entries match this filter'
                : 'No purchase entries recorded yet'}
            </p>
            <p className="text-neutral-400 max-w-sm mx-auto">
              Products added in Products automatically appear here as Pending Purchase, or click New Purchase Entry to log a supplier bill.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Invoice # / Date</th>
                  <th className="p-3.5">Supplier</th>
                  <th className="p-3.5">Product &amp; Qty</th>
                  <th className="p-3.5 text-right">Total</th>
                  <th className="p-3.5 text-right">Paid</th>
                  <th className="p-3.5 text-right">Due</th>
                  <th className="p-3.5">Stage Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium tabular-nums">
                {filtered.map((pur) => {
                  const st = getEffectiveStatus(pur);
                  const isBusy = processingId === pur.id;
                  return (
                    <tr key={pur.id} className="hover:bg-neutral-50/50">
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-neutral-900 block">
                          {pur.purchaseNumber}
                        </span>
                        <span className="text-[11px] font-mono text-neutral-400 block">
                          {pur.date}
                        </span>
                        <span
                          className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            pur.origin === 'product_add'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                          }`}
                        >
                          {pur.origin === 'product_add' ? 'From Products' : 'Manual Purchase'}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <span className="font-semibold text-neutral-900">
                          {pur.supplierName}
                        </span>
                        {pur.createdBy && (
                          <span className="block text-[10px] text-neutral-400 mt-0.5">
                            By: {pur.createdBy}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5">
                        <div className="space-y-0.5">
                          {(pur.items || []).map((it, i) => (
                            <div key={i} className="text-neutral-800">
                              <span className="font-semibold">{it.productName}</span>
                              {it.sku ? (
                                <span className="ml-1 font-mono text-[10px] text-neutral-400">
                                  ({it.sku})
                                </span>
                              ) : null}
                              <span className="block text-[11px] font-mono text-neutral-500">
                                {it.quantity} pcs @ ৳{Number(it.unitCost || 0).toLocaleString('en-BD')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="p-3.5 text-right font-mono font-bold text-neutral-900">
                        ৳{(Number(pur.totalAmount) || 0).toLocaleString('en-BD')}
                      </td>

                      <td className="p-3.5 text-right font-mono text-emerald-700">
                        ৳{(Number(pur.paidAmount) || 0).toLocaleString('en-BD')}
                      </td>

                      <td className="p-3.5 text-right font-mono font-bold text-amber-700">
                        {(Number(pur.dueAmount) || 0) > 0
                          ? `৳${Number(pur.dueAmount).toLocaleString('en-BD')}`
                          : '—'}
                      </td>

                      <td className="p-3.5 whitespace-nowrap">
                        {st === 'pending_purchase' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold uppercase">
                            <Clock className="w-3 h-3" /> Pending Purchase
                          </span>
                        ) : st === 'pending_stock' ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-bold uppercase">
                              <ArrowRightCircle className="w-3 h-3" /> In Stock Queue
                            </span>
                            {pur.purchaseApprovedBy && (
                              <span className="block text-[10px] text-neutral-400 mt-0.5">
                                Approved by {pur.purchaseApprovedBy}
                              </span>
                            )}
                          </div>
                        ) : st === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold uppercase">
                            <XCircle className="w-3 h-3" /> Rejected
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold uppercase">
                              <PackageCheck className="w-3 h-3" /> Stock Approved
                            </span>
                            {pur.stockApprovedBy && (
                              <span className="block text-[10px] text-neutral-400 mt-0.5">
                                Final by {pur.stockApprovedBy}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {st === 'pending_purchase' && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => openReviewModal(pur)}
                                className="px-2.5 py-1.5 border border-neutral-300 bg-white hover:border-black text-neutral-800 text-[11px] font-semibold rounded-lg cursor-pointer inline-flex items-center gap-1"
                                title="Review invoice cost, payment & approve"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Review</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickApproveToStock(pur)}
                                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold rounded-lg cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                                title="Approve Purchase & Forward to Stock Control"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Approve → Stock</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleReject(pur)}
                                className="px-2 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-[11px] font-semibold rounded-lg cursor-pointer"
                                title="Reject Purchase"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => posService.deletePurchase(pur.id)}
                            className="p-1.5 text-neutral-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                            title="Delete Purchase Entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Purchase Entry / Review & Approve Modal (100% English matching reference structure) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-neutral-200 max-w-3xl w-full shadow-2xl overflow-hidden my-6">
            <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-200">
              <div>
                <h3 className="text-base font-bold text-neutral-950">
                  {reviewingPurchase
                    ? `Review & Approve Purchase — ${reviewingPurchase.purchaseNumber}`
                    : 'New Purchase Entry'}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {reviewingPurchase
                    ? 'Verify quantity, unit cost & paid amount before sending to Stock Control for final approval.'
                    : 'Enter supplier bill details. Approved purchases go to Stock Control for final stock release.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-black rounded-lg hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form id="purchaseEntryForm" onSubmit={handleSubmitModal} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg font-medium">
                  {formError}
                </div>
              )}

              {/* Row 1: Purchase Invoice No * | Supplier * */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Purchase Invoice No <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    readOnly={Boolean(reviewingPurchase)}
                    value={purchaseNumber}
                    onChange={(e) => setPurchaseNumber(e.target.value)}
                    placeholder="PUR-2002"
                    className={`w-full h-[42px] px-3.5 border rounded-lg font-mono text-neutral-900 focus:outline-none focus:border-black ${
                      reviewingPurchase
                        ? 'bg-neutral-100 border-neutral-200 text-neutral-600'
                        : 'bg-white border-neutral-300'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Supplier <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required={suppliers.length > 0}
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      className="w-full h-[42px] appearance-none px-3.5 pr-9 bg-white border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-black cursor-pointer truncate"
                    >
                      <option value="">
                        {suppliers.length === 0 ? 'Direct Supplier' : 'Select Supplier...'}
                      </option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Row 2: Select Product * | Quantity * | Unit Cost (৳) * */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-6">
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Select Product <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required
                      disabled={Boolean(reviewingPurchase && selectedProductId)}
                      value={selectedProductId}
                      onChange={(e) => handleSelectProduct(e.target.value)}
                      className="w-full h-[42px] appearance-none px-3.5 pr-9 bg-white border border-neutral-300 rounded-lg text-neutral-900 disabled:bg-neutral-100 focus:outline-none focus:border-black cursor-pointer truncate"
                    >
                      <option value="">Select Product...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku || 'NO-SKU'}) [{getProductStatusTag(p)}]
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-[42px] px-3.5 bg-neutral-50 border border-neutral-300 rounded-lg font-mono text-neutral-900 focus:bg-white focus:outline-none focus:border-black"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Unit Cost (৳) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={unitCost}
                    onChange={(e) => setUnitCost(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-[42px] px-3.5 bg-neutral-50 border border-neutral-300 rounded-lg font-mono text-neutral-900 focus:bg-white focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              {/* Row 3: Total Amount (৳) | Paid Amount (৳) * | Due Amount (৳) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 tabular-nums">
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Total Amount (৳)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={totalAmount.toFixed(2)}
                    className="w-full h-[42px] px-3.5 bg-neutral-100 border border-neutral-200 rounded-lg font-mono text-neutral-700 focus:outline-none cursor-default"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Paid Amount (৳) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={totalAmount}
                    step="any"
                    required
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-[42px] px-3.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900 focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Due Amount (৳)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={dueAmount.toFixed(2)}
                    className="w-full h-[42px] px-3.5 bg-neutral-100 border border-neutral-200 rounded-lg font-mono text-neutral-700 focus:outline-none cursor-default"
                  />
                </div>
              </div>
            </form>

            {/* Footer matching Cancel + Emerald Primary CTA */}
            <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50/70 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 bg-neutral-500 hover:bg-neutral-600 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="purchaseEntryForm"
                disabled={saving}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer transition-colors inline-flex items-center gap-1.5 shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {saving
                    ? 'Sending...'
                    : reviewingPurchase
                    ? 'Approve & Send to Stock'
                    : 'Approve Purchase & Send to Stock'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {actionToast && (
        <div className="fixed bottom-6 right-6 z-60 bg-black text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold border border-neutral-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionToast}</span>
        </div>
      )}
    </div>
  );
};
