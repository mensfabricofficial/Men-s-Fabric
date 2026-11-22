import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Printer,
  X,
  FileSpreadsheet,
  Calendar,
  Receipt,
  FileText,
} from 'lucide-react';
import { Order, Product } from '../types';
import { orderService } from '../services/orderService';
import { productService } from '../services/productService';
import {
  getLocalDateKey,
  getLocalMonthKey,
  addLocalDays,
  addLocalMonths,
  getMonthDateBounds,
  getOrderDateKey,
  getCompletedSaleDateKey,
  isCompletedSaleOrder,
  isDateKeyInRange,
  buildProductCostMap,
  getOrderCOGS,
  getOrderRecognizedSale,
} from '../lib/accountingUtils';
import { formatDatePart, formatTimePart } from '../lib/dateFormat';
import { InvoiceSheet, getFormattedInvoiceNumber } from '../components/common/InvoiceSheet';
import { ThermalPosReceipt } from '../components/common/ThermalPosReceipt';
import { printElementById } from '../lib/printHelper';
import { AdminPageHeader } from './AdminLayout';

type DatePreset = 'today' | 'yesterday' | 'this_month' | 'last_month' | 'all_time' | 'custom';

export const AdminSalesHistory: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>(() => orderService.getInstantOrders());
  const [products, setProducts] = useState<Product[]>(() => productService.getInstantAllProducts());

  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [customStart, setCustomStart] = useState(() => getMonthDateBounds(getLocalMonthKey()).startKey);
  const [customEnd, setCustomEnd] = useState(() => getLocalDateKey());

  const [channelFilter, setChannelFilter] = useState<'all' | 'online' | 'pos'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cod' | 'bkash' | 'nagad' | 'rocket'>('all');
  const [statusFilter, setStatusFilter] = useState<'delivered_only' | 'in_progress' | 'returned' | 'cancelled' | 'all'>('delivered_only');
  const [search, setSearch] = useState('');

  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);
  const [invoiceFormat, setInvoiceFormat] = useState<'thermal' | 'a4'>('a4');
  const [invoiceVariant, setInvoiceVariant] = useState<'customer' | 'final_sale'>('final_sale');
  const invoiceOrder = invoiceOrderId ? orders.find((o) => o.id === invoiceOrderId) || null : null;

  useEffect(() => {
    const unsubOrders = orderService.subscribeToAllOrdersAdmin(setOrders);
    const unsubProds = productService.subscribeToAllProductsAdmin(setProducts);
    return () => {
      unsubOrders();
      unsubProds();
    };
  }, []);

  const todayKey = getLocalDateKey();
  const monthKey = getLocalMonthKey();

  const { startDateKey, endDateKey } = useMemo(() => {
    if (preset === 'today') return { startDateKey: todayKey, endDateKey: todayKey };
    if (preset === 'yesterday') {
      const y = addLocalDays(todayKey, -1);
      return { startDateKey: y, endDateKey: y };
    }
    if (preset === 'this_month') {
      const b = getMonthDateBounds(monthKey);
      return { startDateKey: b.startKey, endDateKey: b.endKey };
    }
    if (preset === 'last_month') {
      const b = getMonthDateBounds(addLocalMonths(monthKey, -1));
      return { startDateKey: b.startKey, endDateKey: b.endKey };
    }
    if (preset === 'custom') {
      return { startDateKey: customStart || undefined, endDateKey: customEnd || undefined };
    }
    return { startDateKey: undefined, endDateKey: undefined };
  }, [preset, todayKey, monthKey, customStart, customEnd]);

  const costMap = useMemo(() => buildProductCostMap(products), [products]);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((ord) => {
      if (statusFilter === 'delivered_only' && !isCompletedSaleOrder(ord)) {
        return false;
      }
      if (
        statusFilter === 'in_progress' &&
        (isCompletedSaleOrder(ord) || ord.orderStatus === 'cancelled' || ord.orderStatus === 'returned')
      ) {
        return false;
      }
      if (statusFilter === 'returned' && ord.orderStatus !== 'returned') return false;
      if (statusFilter === 'cancelled' && ord.orderStatus !== 'cancelled') return false;

      if (startDateKey || endDateKey) {
        const refDateKey = isCompletedSaleOrder(ord)
          ? getCompletedSaleDateKey(ord)
          : getOrderDateKey(ord);
        if (!isDateKeyInRange(refDateKey, startDateKey, endDateKey)) return false;
      }

      if (channelFilter === 'pos' && ord.orderChannel !== 'pos') return false;
      if (channelFilter === 'online' && ord.orderChannel === 'pos') return false;

      if (paymentFilter !== 'all' && ord.paymentMethod !== paymentFilter) return false;

      if (q) {
        const hitItem = (ord.items || []).some((i) =>
          i.productName?.toLowerCase().includes(q)
        );
        return (
          ord.orderNumber?.toLowerCase().includes(q) ||
          ord.customerName?.toLowerCase().includes(q) ||
          ord.customerPhone?.toLowerCase().includes(q) ||
          hitItem
        );
      }

      return true;
    });
  }, [orders, startDateKey, endDateKey, channelFilter, paymentFilter, statusFilter, search]);

  const totals = useMemo(() => {
    let billed = 0;
    let pcs = 0;
    let cogs = 0;
    filteredSales.forEach((ord) => {
      const info = getOrderCOGS(ord, costMap);
      billed += getOrderRecognizedSale(ord);
      pcs += info.units;
      cogs += info.cogs;
    });
    return {
      count: filteredSales.length,
      billed,
      pcs,
      cogs,
      profit: billed - cogs,
    };
  }, [filteredSales, costMap]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sales History & Ledger"
        subtitle="Online & POS itemized sales, cost, gross profit & invoices"
      />

      {/* Period & Filter Controls */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3 text-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-neutral-100 rounded-lg">
            {([
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'all_time', label: 'All Time' },
              { id: 'custom', label: 'Custom' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPreset(tab.id)}
                className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                  preset === tab.id
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-neutral-400" />
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
              />
              <span className="text-neutral-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Invoice #, customer, phone, item..."
              className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
            />
          </div>

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as any)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-semibold cursor-pointer"
          >
            <option value="all">All Channels (Online + POS)</option>
            <option value="online">Online Store Only</option>
            <option value="pos">POS Counter Only</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as any)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-semibold cursor-pointer"
          >
            <option value="all">All Payment Methods</option>
            <option value="cod">Cash / COD</option>
            <option value="bkash">bKash</option>
            <option value="nagad">Nagad</option>
            <option value="rocket">Rocket</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-semibold cursor-pointer"
          >
            <option value="delivered_only">Completed Sales (Delivered Only)</option>
            <option value="in_progress">In Pipeline (Not Yet Delivered)</option>
            <option value="returned">Returned Sales Only</option>
            <option value="cancelled">Cancelled Only</option>
            <option value="all">All Orders (Include Pipeline &amp; Cancelled)</option>
          </select>
        </div>
      </div>

      {/* Totals KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 tabular-nums">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[10px] font-bold uppercase text-neutral-500">Filtered Invoices</span>
          <p className="text-xl font-black font-mono text-neutral-900 mt-1">{totals.count}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[10px] font-bold uppercase text-neutral-500">Total Pcs Sold</span>
          <p className="text-xl font-black font-mono text-neutral-900 mt-1">{totals.pcs} pcs</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[10px] font-bold uppercase text-neutral-500">Total Sale Billed</span>
          <p className="text-xl font-black font-mono text-neutral-900 mt-1">
            ৳{totals.billed.toLocaleString('en-BD')}
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[10px] font-bold uppercase text-neutral-500">Product Cost (COGS)</span>
          <p className="text-xl font-black font-mono text-amber-700 mt-1">
            ৳{totals.cogs.toLocaleString('en-BD')}
          </p>
        </div>
        <div className="col-span-2 lg:col-span-1 bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] font-bold uppercase text-emerald-800">Gross Sale Profit</span>
          <p className="text-xl font-black font-mono text-emerald-950 mt-1">
            ৳{totals.profit.toLocaleString('en-BD')}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {filteredSales.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            <FileSpreadsheet className="w-9 h-9 text-neutral-300 mx-auto mb-2" />
            <p className="font-bold text-neutral-900 text-sm">No Sales Found for This Filter</p>
            <p className="text-neutral-400 mt-0.5">Try expanding the date range or resetting channel/status filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Invoice &amp; Date</th>
                  <th className="p-3.5">Channel &amp; Customer</th>
                  <th className="p-3.5">Items &amp; Qty</th>
                  <th className="p-3.5 text-right">Sale Total</th>
                  <th className="p-3.5 text-right">Cost / Profit</th>
                  <th className="p-3.5">Payment &amp; Stage</th>
                  <th className="p-3.5 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium tabular-nums">
                {filteredSales.map((ord) => {
                  const costInfo = getOrderCOGS(ord, costMap);
                  const recognizedSale = getOrderRecognizedSale(ord);
                  const codFee = Math.max(
                    0,
                    Number(ord.pipeline?.codReconciliation?.codCharge ?? ord.codCharge ?? 0) || 0
                  );
                  const saleProfit = recognizedSale - costInfo.cogs;
                  return (
                    <tr key={ord.id} className="hover:bg-neutral-50/50">
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-neutral-900 block">
                          {ord.orderNumber}
                        </span>
                        <span className="text-[10px] text-neutral-400 block">
                          {ord.pipeline?.deliveredAt
                            ? `Delivered: ${formatDatePart(ord.pipeline.deliveredAt, 'Recent')} ${formatTimePart(ord.pipeline.deliveredAt)}`
                            : `${formatDatePart(ord.createdAt, 'Recent')} ${formatTimePart(ord.createdAt)}`}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <span className="text-[10px] font-mono uppercase font-bold text-neutral-500 block">
                          {ord.orderChannel === 'pos' ? 'POS Counter' : 'Online Web'}
                        </span>
                        <span className="font-semibold text-neutral-900 block">
                          {ord.customerName}
                        </span>
                        <span className="text-[11px] font-mono text-neutral-500">
                          {ord.customerPhone}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <p className="text-[11px] text-neutral-800 max-w-[240px] truncate">
                          {(ord.items || [])
                            .map((i) => `${i.productName} (${i.size}×${i.quantity})`)
                            .join(', ')}
                        </p>
                        <span className="text-[10px] font-mono text-neutral-500">
                          Total {costInfo.units} pcs
                        </span>
                      </td>

                      <td className="p-3.5 text-right whitespace-nowrap">
                        <span className="font-mono font-bold text-neutral-900 block">
                          ৳{recognizedSale.toLocaleString('en-BD')}
                        </span>
                        {codFee > 0 && (
                          <span className="text-[10px] text-red-700 font-mono block">
                            COD Fee −৳{codFee.toLocaleString('en-BD')}
                          </span>
                        )}
                        {(ord.discount > 0 || (ord.onlineDiscount || 0) > 0) && (
                          <span className="text-[10px] text-amber-700 font-mono block">
                            Disc −৳{((ord.discount || 0) + (ord.onlineDiscount || 0)).toLocaleString('en-BD')}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-right whitespace-nowrap">
                        <span className="font-mono text-[11px] text-neutral-500 block">
                          Cost: ৳{costInfo.cogs.toLocaleString('en-BD')}
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            saleProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          Profit: ৳{saleProfit.toLocaleString('en-BD')}
                        </span>
                      </td>

                      <td className="p-3.5 whitespace-nowrap">
                        <span className="uppercase font-semibold text-neutral-700 block">
                          {ord.paymentMethod} ·{' '}
                          <b className={ord.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-amber-700'}>
                            {ord.paymentStatus}
                          </b>
                        </span>
                        <span className="text-[10px] uppercase text-neutral-500 font-bold">
                          {ord.orderStatus}
                        </span>
                      </td>

                      <td className="p-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setInvoiceVariant('final_sale');
                            setInvoiceOrderId(ord.id);
                          }}
                          className="px-3 py-1.5 border border-neutral-300 bg-white text-neutral-800 text-[11px] font-bold rounded-lg hover:border-black cursor-pointer inline-flex items-center gap-1"
                        >
                          <Printer className="w-3.5 h-3.5" /> Invoice
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

      {/* Invoice / Thermal POS Viewer */}
      {invoiceOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 overflow-y-auto">
          <div className={`bg-white rounded-xl w-full p-5 space-y-4 ${invoiceFormat === 'thermal' ? 'max-w-md' : 'max-w-3xl'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-3">
              <span className="font-bold text-sm">
                {invoiceVariant === 'final_sale' ? 'Final Sale Invoice' : 'Customer Invoice'}{' '}
                {getFormattedInvoiceNumber(invoiceOrder.orderNumber, invoiceOrder.id)}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg border border-neutral-200 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setInvoiceVariant('customer')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      invoiceVariant === 'customer' ? 'bg-white text-black font-bold shadow-xs' : 'text-neutral-600'
                    }`}
                  >
                    Customer Invoice
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceVariant('final_sale')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      invoiceVariant === 'final_sale' ? 'bg-white text-black font-bold shadow-xs' : 'text-neutral-600'
                    }`}
                  >
                    Final Sale
                  </button>
                </div>
                <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg border border-neutral-200 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setInvoiceFormat('thermal')}
                    className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer ${
                      invoiceFormat === 'thermal' ? 'bg-white text-black font-bold shadow-xs' : 'text-neutral-600'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Thermal POS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceFormat('a4')}
                    className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer ${
                      invoiceFormat === 'a4' ? 'bg-white text-black font-bold shadow-xs' : 'text-neutral-600'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>A4</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => printElementById('sales-history-printable-invoice', invoiceOrder.orderNumber, invoiceFormat)}
                  className="px-3.5 py-1.5 bg-black text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" /> Print {invoiceFormat === 'thermal' ? '80mm POS' : 'A4'}
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceOrderId(null)}
                  className="p-1 text-neutral-500 hover:text-black cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div id="sales-history-printable-invoice" className="max-h-[75vh] overflow-y-auto">
              {invoiceFormat === 'thermal' ? (
                <ThermalPosReceipt order={invoiceOrder} variant={invoiceVariant} />
              ) : (
                <InvoiceSheet order={invoiceOrder} variant={invoiceVariant} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
