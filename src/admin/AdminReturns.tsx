import React, { useState, useEffect, useMemo } from 'react';
import {
  RotateCcw,
  Plus,
  Search,
  Trash2,
  X,
  CheckCircle2,
  PackageCheck,
  AlertCircle,
} from 'lucide-react';
import { Order, Product, SalesReturnEntry, SalesReturnItem } from '../types';
import { orderService } from '../services/orderService';
import { productService } from '../services/productService';
import { posService } from '../services/posService';
import { settingsService } from '../services/settingsService';
import { getLocalDateKey } from '../lib/accountingUtils';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../lib/dateFormat';
import { AdminPageHeader } from './AdminLayout';

export const AdminReturns: React.FC = () => {
  const { currentUser, staffProfile, isSuperAdmin } = useAuth();
  const [returnsList, setReturnsList] = useState<SalesReturnEntry[]>(() => posService.getInstantReturns());
  const [orders, setOrders] = useState<Order[]>(() => orderService.getInstantOrders());
  const [products, setProducts] = useState<Product[]>(() => productService.getInstantAllProducts());
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [orderQuery, setOrderQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [returnType, setReturnType] = useState<'full' | 'partial'>('partial');
  const [itemQtys, setItemQtys] = useState<Record<number, number>>({});
  const [restock, setRestock] = useState(true);
  const [refundMethod, setRefundMethod] = useState<SalesReturnEntry['refundMethod']>('cash');
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState(() => getLocalDateKey());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubOrders = orderService.subscribeToAllOrdersAdmin(setOrders);
    const unsubReturns = posService.subscribeToReturns(setReturnsList);
    const unsubProds = productService.subscribeToAllProductsAdmin(setProducts);
    return () => {
      unsubOrders();
      unsubReturns();
      unsubProds();
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const eligibleOrders = useMemo(() => {
    return orders.filter((o) => o.orderStatus !== 'cancelled').slice(0, 120);
  }, [orders]);

  const filteredModalOrders = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    if (!q) return eligibleOrders;
    return eligibleOrders.filter(
      (o) =>
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.toLowerCase().includes(q)
    );
  }, [eligibleOrders, orderQuery]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  const productCostMap = useMemo(() => {
    const m = new Map<string, number>();
    products.forEach((p) => {
      if (p.id && typeof p.costPrice === 'number' && p.costPrice > 0) {
        m.set(p.id, p.costPrice);
      }
    });
    return m;
  }, [products]);

  const openModal = () => {
    setOrderQuery('');
    const firstEligible = eligibleOrders[0] || null;
    setSelectedOrderId(firstEligible?.id || '');
    setReturnType('partial');
    setRestock(true);
    setRefundMethod('cash');
    setReason('');
    setReturnDate(getLocalDateKey());
    if (firstEligible) {
      const initQtys: Record<number, number> = {};
      (firstEligible.items || []).forEach((it, idx) => {
        initQtys[idx] = 0;
      });
      setItemQtys(initQtys);
    }
    setModalOpen(true);
  };

  const handleSelectOrder = (ordId: string) => {
    setSelectedOrderId(ordId);
    const ord = orders.find((o) => o.id === ordId);
    if (ord) {
      const next: Record<number, number> = {};
      (ord.items || []).forEach((it, idx) => {
        next[idx] = returnType === 'full' ? Number(it.quantity) || 1 : 0;
      });
      setItemQtys(next);
    }
  };

  const handleReturnTypeChange = (nextType: 'full' | 'partial') => {
    setReturnType(nextType);
    if (!selectedOrder) return;
    const next: Record<number, number> = {};
    (selectedOrder.items || []).forEach((it, idx) => {
      next[idx] = nextType === 'full' ? Number(it.quantity) || 1 : idx === 0 ? 1 : 0;
    });
    setItemQtys(next);
  };

  const draftReturnItems: SalesReturnItem[] = useMemo(() => {
    if (!selectedOrder) return [];
    const list: SalesReturnItem[] = [];
    (selectedOrder.items || []).forEach((it, idx) => {
      const maxQty = Number(it.quantity) || 1;
      const qty =
        returnType === 'full'
          ? maxQty
          : Math.min(maxQty, Math.max(0, Number(itemQtys[idx]) || 0));
      if (qty > 0) {
        const unitPrice = Number(it.unitPrice) || 0;
        const unitCost =
          typeof it.unitCost === 'number' && it.unitCost > 0
            ? it.unitCost
            : productCostMap.get(it.productId) || 0;
        list.push({
          productId: it.productId,
          productName: it.productName,
          size: it.size,
          color: it.color,
          quantity: qty,
          unitPrice,
          unitCost,
          totalRefund: qty * unitPrice,
        });
      }
    });
    return list;
  }, [selectedOrder, returnType, itemQtys, productCostMap]);

  const draftRefundTotal = draftReturnItems.reduce((s, it) => s + it.totalRefund, 0);
  const draftPcsTotal = draftReturnItems.reduce((s, it) => s + it.quantity, 0);

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || draftReturnItems.length === 0) return;

    setSubmitting(true);
    try {
      const actor =
        staffProfile?.name || currentUser?.displayName || currentUser?.email || 'Admin';
      const totalOrderPcs = (selectedOrder.items || []).reduce(
        (s, i) => s + (Number(i.quantity) || 1),
        0
      );
      const isFullOrderReturned =
        returnType === 'full' || draftPcsTotal >= totalOrderPcs;

      const entry = await posService.addSalesReturn({
        orderId: selectedOrder.id,
        orderNumber: selectedOrder.orderNumber,
        customerName: selectedOrder.customerName,
        customerPhone: selectedOrder.customerPhone,
        returnType: isFullOrderReturned ? 'full' : 'partial',
        items: draftReturnItems,
        restock,
        refundMethod,
        reason: reason.trim() || 'Customer Return / Size Exchange',
        date: returnDate,
        processedBy: actor,
        markOrderAsReturned: isFullOrderReturned,
      });

      settingsService
        .logAdminAction(
          currentUser?.uid || staffProfile?.id || 'staff',
          currentUser?.email || staffProfile?.email || 'staff',
          'SALES_RETURN_PROCESSED',
          entry.returnNumber,
          `Order ${entry.orderNumber}: ${entry.totalReturnedPcs} pcs refunded ৳${entry.totalRefundAmount}${entry.restocked ? ' (Restocked)' : ''}`
        )
        .catch(() => {});

      setModalOpen(false);
      showToast(
        `Return ${entry.returnNumber} recorded${entry.restocked ? ' & stock restored' : ''}.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (ret: SalesReturnEntry) => {
    if (!window.confirm(`Remove sales return record ${ret.returnNumber}?`)) return;
    await posService.deleteSalesReturn(ret.id);
    showToast(`Deleted return record ${ret.returnNumber}`);
  };

  const filteredReturns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return returnsList;
    return returnsList.filter(
      (r) =>
        r.returnNumber.toLowerCase().includes(q) ||
        r.orderNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.customerPhone.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
    );
  }, [returnsList, search]);

  const totalRefundValue = returnsList.reduce((s, r) => s + (Number(r.totalRefundAmount) || 0), 0);
  const totalReturnedUnits = returnsList.reduce((s, r) => s + (Number(r.totalReturnedPcs) || 0), 0);
  const totalRestockedUnits = returnsList
    .filter((r) => r.restocked)
    .reduce((s, r) => s + (Number(r.totalReturnedPcs) || 0), 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sales Return & Restock"
        subtitle="Process Online & POS returns, adjust P&L & restore stock"
        actions={
          <button
            type="button"
            onClick={openModal}
            className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Process Sales Return</span>
          </button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Return Entries
          </span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">{returnsList.length}</p>
          <p className="text-[11px] text-neutral-500 mt-0.5">All recorded return slips</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Total Refund Value
          </span>
          <p className="text-2xl font-black font-mono text-amber-700 mt-1">
            ৳{totalRefundValue.toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] text-neutral-500 mt-0.5">Deducted from Net Sales</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Returned Qty
          </span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">
            {totalReturnedUnits.toLocaleString('en-BD')} pcs
          </p>
          <p className="text-[11px] text-neutral-500 mt-0.5">Full &amp; partial items</p>
        </div>

        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Restocked to Catalog
          </span>
          <p className="text-2xl font-black font-mono text-emerald-900 mt-1">
            {totalRestockedUnits.toLocaleString('en-BD')} pcs
          </p>
          <p className="text-[11px] text-emerald-700 mt-0.5">Added back to live stock</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search return #, order #, customer name, phone, or reason..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>
      </div>

      {/* Returns Ledger Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {filteredReturns.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            <RotateCcw className="w-9 h-9 text-neutral-300 mx-auto mb-2" />
            <p className="font-bold text-neutral-900 text-sm">No Sales Returns Recorded</p>
            <p className="text-neutral-400 mt-0.5">
              Click &quot;Process Sales Return&quot; to log a customer item return and adjust stock &amp; P&amp;L.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Return # &amp; Date</th>
                  <th className="p-3.5">Order &amp; Customer</th>
                  <th className="p-3.5">Returned Items</th>
                  <th className="p-3.5">Refund &amp; COGS Reversed</th>
                  <th className="p-3.5">Restock Status</th>
                  <th className="p-3.5">Processed By</th>
                  {isSuperAdmin && <th className="p-3.5 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium tabular-nums">
                {filteredReturns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-neutral-50/50">
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="font-mono font-bold text-neutral-900 block">
                        {ret.returnNumber}
                      </span>
                      <span className="text-[11px] font-mono text-neutral-500">{ret.date}</span>
                    </td>

                    <td className="p-3.5">
                      <span className="font-mono font-bold text-neutral-900 block">
                        {ret.orderNumber} ({ret.returnType.toUpperCase()})
                      </span>
                      <span className="text-neutral-700">{ret.customerName}</span>
                      <span className="text-[11px] font-mono text-neutral-400 block">
                        {ret.customerPhone}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <div className="space-y-0.5 max-w-[240px]">
                        {ret.items.map((it, idx) => (
                          <p key={idx} className="text-[11px] text-neutral-800 truncate">
                            {it.productName} ({it.size}/{it.color}) × <b>{it.quantity}</b>
                          </p>
                        ))}
                        <p className="text-[10px] text-neutral-500 italic">{ret.reason}</p>
                      </div>
                    </td>

                    <td className="p-3.5 whitespace-nowrap">
                      <span className="font-mono font-black text-amber-700 block">
                        −৳{ret.totalRefundAmount.toLocaleString('en-BD')}
                      </span>
                      <span className="text-[10px] text-neutral-500 uppercase">
                        {ret.refundMethod.replace('_', ' ')} · COGS ৳
                        {ret.totalCostReversed.toLocaleString('en-BD')}
                      </span>
                    </td>

                    <td className="p-3.5 whitespace-nowrap">
                      {ret.restocked ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                          <PackageCheck className="w-3.5 h-3.5" />
                          Restocked (+{ret.totalReturnedPcs} pcs)
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-neutral-500">
                          Damaged / Not Restocked
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 whitespace-nowrap text-neutral-600">
                      <span className="block font-semibold text-neutral-900">{ret.processedBy}</span>
                      <span className="text-[10px] font-mono text-neutral-400">
                        {formatDateTime(ret.createdAt)}
                      </span>
                    </td>

                    {isSuperAdmin && (
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleDelete(ret)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                          title="Delete Entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Process Sales Return Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-2xl w-full my-4 max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  <span>Process Sales Return</span>
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Select an order and specify which items &amp; quantities are returned.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitReturn} className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* Order Picker */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase text-neutral-600 block">
                  1. Find &amp; Select Order *
                </label>
                <input
                  type="text"
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                  placeholder="Filter orders by # / customer name / phone..."
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                />
                <select
                  value={selectedOrderId}
                  onChange={(e) => handleSelectOrder(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg font-semibold cursor-pointer"
                >
                  <option value="">-- Select an Order --</option>
                  {filteredModalOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} · {o.customerName} ({o.customerPhone}) · ৳
                      {(Number(o.total) || 0).toLocaleString('en-BD')} [{o.orderStatus}]
                    </option>
                  ))}
                </select>
              </div>

              {selectedOrder && (
                <>
                  {/* Full vs Partial */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                        Return Mode
                      </label>
                      <div className="flex bg-neutral-100 p-1 rounded-lg">
                        <button
                          type="button"
                          onClick={() => handleReturnTypeChange('partial')}
                          className={`flex-1 py-1.5 rounded font-bold cursor-pointer ${
                            returnType === 'partial'
                              ? 'bg-white text-black shadow-xs'
                              : 'text-neutral-500'
                          }`}
                        >
                          Partial Return
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReturnTypeChange('full')}
                          className={`flex-1 py-1.5 rounded font-bold cursor-pointer ${
                            returnType === 'full'
                              ? 'bg-white text-black shadow-xs'
                              : 'text-neutral-500'
                          }`}
                        >
                          Full Order Return
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                        Return Date *
                      </label>
                      <input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        required
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  {/* Line Items Quantity Selector */}
                  <div className="border border-neutral-200 rounded-xl overflow-hidden">
                    <div className="px-3.5 py-2 bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[10px] text-neutral-600">
                      Select Returned Item Quantities
                    </div>
                    <div className="divide-y divide-neutral-100">
                      {(selectedOrder.items || []).map((it, idx) => {
                        const maxQty = Number(it.quantity) || 1;
                        const val =
                          returnType === 'full'
                            ? maxQty
                            : Math.min(maxQty, Math.max(0, Number(itemQtys[idx]) || 0));
                        return (
                          <div key={idx} className="p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-neutral-900 truncate">{it.productName}</p>
                              <p className="text-[11px] text-neutral-500">
                                {it.size} / {it.color} · Sold: {maxQty} × ৳{it.unitPrice}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-neutral-400">Return Qty:</span>
                              <input
                                type="number"
                                min={0}
                                max={maxQty}
                                disabled={returnType === 'full'}
                                value={val}
                                onChange={(e) =>
                                  setItemQtys((prev) => ({
                                    ...prev,
                                    [idx]: Math.min(
                                      maxQty,
                                      Math.max(0, Number(e.target.value) || 0)
                                    ),
                                  }))
                                }
                                className="w-16 px-2 py-1 border border-neutral-300 rounded font-mono font-bold text-center"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Refund Method & Restock */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                        Refund Channel
                      </label>
                      <select
                        value={refundMethod}
                        onChange={(e) => setRefundMethod(e.target.value as any)}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-semibold"
                      >
                        <option value="cash">Cash Refund</option>
                        <option value="bkash">bKash Refund</option>
                        <option value="nagad">Nagad Refund</option>
                        <option value="bank">Bank Transfer</option>
                        <option value="store_credit">Exchange / Store Credit</option>
                        <option value="none">No Cash Paid (COD Unpaid Return)</option>
                      </select>
                    </div>

                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 p-2.5 w-full bg-neutral-50 border border-neutral-200 rounded-lg cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={restock}
                          onChange={(e) => setRestock(e.target.checked)}
                          className="accent-black w-4 h-4"
                        />
                        <span className="font-semibold text-neutral-800">
                          Restock returned pcs into inventory
                        </span>
                      </label>
                    </div>
                  </div>

                  {selectedOrder.pipeline?.stockDeducted === false && restock && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>
                        Note: This order has not passed Stage-3 Stock Cut yet (stockDeducted=false). If doing a full return, inventory won&apos;t be double-added.
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                      Return Reason / Note *
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                      placeholder="e.g. Customer refused at doorstep / Size didn't fit"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                    />
                  </div>

                  {/* Summary Strip */}
                  <div className="p-3.5 bg-neutral-900 text-white rounded-xl flex items-center justify-between tabular-nums">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400 block">
                        Total Items Returning
                      </span>
                      <span className="text-sm font-black font-mono">{draftPcsTotal} pcs</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400 block">
                        Net Refund Adjustment
                      </span>
                      <span className="text-base font-black font-mono text-amber-400">
                        ৳{draftRefundTotal.toLocaleString('en-BD')}
                      </span>
                    </div>
                  </div>
                </>
              )}

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
                  disabled={submitting || !selectedOrder || draftReturnItems.length === 0}
                  className="flex-1 py-2.5 bg-black text-white font-bold uppercase rounded-lg hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
                >
                  {submitting ? 'Processing...' : 'Confirm Sales Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-60 bg-black text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-neutral-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
};
