import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Eye, 
  Printer, 
  CheckCircle, 
  Clock, 
  Truck, 
  X, 
  AlertCircle,
  ShoppingBag,
  Send,
  Copy,
  Check,
  ExternalLink,
  Image as ImageIcon,
  CreditCard,
  Smartphone,
  ShieldCheck,
  Maximize2,
  XCircle,
  RefreshCw,
  Sparkles,
  FileText,
  Receipt,
  Package,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { Order, OrderPipelineStage, OrderStatus, PaymentStatus } from '../types';
import { orderService, getOrderWorkflowStatus } from '../services/orderService';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { printElementById } from '../lib/printHelper';
import { InvoiceSheet, getFormattedInvoiceNumber } from '../components/common/InvoiceSheet';
import { ThermalPosReceipt } from '../components/common/ThermalPosReceipt';
import { formatDatePart, formatTimePart, formatDateTime } from '../lib/dateFormat';
import {
  getOrderPaidAndDue,
  getOrderRecognizedSale,
  getOrderFreeDeliveryFee,
} from '../lib/accountingUtils';
import { AdminPageHeader } from './AdminLayout';

export const AdminOrders: React.FC = () => {
  const { currentUser, staffProfile, isSuperAdmin, hasOrderPermission } = useAuth();
  const [orders, setOrders] = useState<Order[]>(() => orderService.getInstantOrders());
  const [loading, setLoading] = useState(() => orderService.getInstantOrders().length === 0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Order Details & Invoicing Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus>('pending');
  const [statusNote, setStatusNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [invoiceFormat, setInvoiceFormat] = useState<'a4' | 'thermal'>('a4');
  const [paymentActionMenuOpen, setPaymentActionMenuOpen] = useState(false);
  const [workflowActionMenuOpen, setWorkflowActionMenuOpen] = useState(false);

  // Screenshot Zoom Modal
  const [zoomedProofUrl, setZoomedProofUrl] = useState<string | null>(null);

  // Toast state
  const [actionToast, setActionToast] = useState<string | null>(null);

  useEffect(() => {
    const unsub = orderService.subscribeToAllOrdersAdmin((list) => {
      setOrders(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const openOrderModal = (ord: Order) => {
    setSelectedOrder(ord);
    setNewStatus(ord.orderStatus);
    setStatusNote('');
    setPaymentActionMenuOpen(false);
    setWorkflowActionMenuOpen(false);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleUpdateStatus = async (overrideStatus?: OrderStatus) => {
    if (!selectedOrder) return;
    const targetStatus = overrideStatus || newStatus;
    setUpdating(true);
    try {
      await orderService.updateOrderStatus(selectedOrder.id, targetStatus, statusNote);
      setNewStatus(targetStatus);
      setSelectedOrder((prev) => (prev ? { ...prev, orderStatus: targetStatus } : prev));
      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrder.id ? { ...o, orderStatus: targetStatus } : o))
      );
      if (currentUser) {
        settingsService
          .logAdminAction(
            currentUser.uid,
            currentUser.email || '',
            'UPDATE_ORDER_STATUS',
            selectedOrder.orderNumber,
            `Status changed to ${targetStatus}`
          )
          .catch(() => {});
      }
      const refreshed = await orderService.getOrderById(selectedOrder.id);
      if (refreshed) setSelectedOrder(refreshed);
      setActionToast(`Order ${selectedOrder.orderNumber} status updated to ${targetStatus}`);
      setTimeout(() => setActionToast(null), 3500);
    } catch {
      setActionToast('Failed to update order status.');
      setTimeout(() => setActionToast(null), 4000);
    } finally {
      setUpdating(false);
    }
  };

  const canApprove = hasOrderPermission('order_approve');
  const canVerifyPayment = hasOrderPermission('payment_verify');
  const canPack = hasOrderPermission('packaging');
  const canShip = hasOrderPermission('shipping');
  const canReturn = hasOrderPermission('order_return');
  const canCancel = hasOrderPermission('order_cancel');

  const actorDisplayName =
    staffProfile?.name || currentUser?.displayName || currentUser?.email || 'Authorized Staff';

  const handleQuickPipelineAction = async (
    nextStage: OrderPipelineStage,
    extra?: { markPaid?: boolean; dispatchShipped?: boolean }
  ) => {
    if (!selectedOrder) return;
    setUpdating(true);
    try {
      const updated = await orderService.transferOrderStage({
        orderId: selectedOrder.id,
        nextStage,
        handlerName: actorDisplayName,
        handlerEmail: staffProfile?.email || currentUser?.email || undefined,
        note: statusNote.trim() || undefined,
        markPaymentStatus: extra?.markPaid ? 'paid' : undefined,
        overrideOrderStatus: extra?.dispatchShipped ? 'shipped' : undefined,
      });
      if (updated) {
        setSelectedOrder(updated);
        setNewStatus(updated.orderStatus);
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        settingsService
          .logAdminAction(
            currentUser?.uid || staffProfile?.id || 'staff',
            currentUser?.email || staffProfile?.email || '',
            'ORDER_WORKFLOW_ACTION',
            updated.orderNumber,
            `${updated.orderStatus} by ${actorDisplayName}`,
            {
              entityType: 'order',
              beforeValue: selectedOrder.orderStatus,
              afterValue: updated.orderStatus,
            }
          )
          .catch(() => {});
        setActionToast(`Order ${updated.orderNumber} updated by ${actorDisplayName}`);
        setTimeout(() => setActionToast(null), 3500);
      }
    } catch (err: any) {
      setActionToast(err?.message || 'Failed to update order stage.');
      setTimeout(() => setActionToast(null), 5000);
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdatePayment = async (payStatus: PaymentStatus) => {
    if (!selectedOrder || !canVerifyPayment) return;
    try {
      await orderService.updatePaymentStatus(selectedOrder.id, payStatus);
      setSelectedOrder((prev) => (prev ? { ...prev, paymentStatus: payStatus } : prev));
      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrder.id ? { ...o, paymentStatus: payStatus } : o))
      );
      if (currentUser || staffProfile) {
        settingsService
          .logAdminAction(
            currentUser?.uid || staffProfile?.id || 'staff',
            currentUser?.email || staffProfile?.email || '',
            'UPDATE_PAYMENT_STATUS',
            selectedOrder.orderNumber,
            `Payment status set to ${payStatus}`
          )
          .catch(() => {});
      }
      const refreshed = await orderService.getOrderById(selectedOrder.id);
      if (refreshed) setSelectedOrder(refreshed);
      setActionToast(`Payment status updated to ${payStatus.toUpperCase()}`);
      setTimeout(() => setActionToast(null), 3500);
    } catch {
      setActionToast('Failed to update payment status.');
      setTimeout(() => setActionToast(null), 4000);
    }
  };

  const handlePrintInvoice = () => {
    if (selectedOrder) {
      printElementById(
        'printable-invoice-container',
        getFormattedInvoiceNumber(selectedOrder.orderNumber, selectedOrder.id),
        invoiceFormat
      );
    } else {
      window.print();
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== 'all' && o.orderStatus !== statusFilter) return false;
    if (paymentFilter !== 'all') {
      if (paymentFilter === 'cod' && o.paymentMethod !== 'cod') return false;
      if (paymentFilter === 'online' && o.paymentMethod === 'cod') return false;
      if (paymentFilter === 'paid' && o.paymentStatus !== 'paid') return false;
      if (paymentFilter === 'pending' && o.paymentStatus !== 'pending') return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.toLowerCase().includes(q) ||
        o.shippingAddress?.district?.toLowerCase().includes(q) ||
        o.paymentDetails?.transactionId?.toLowerCase().includes(q) ||
        o.paymentDetails?.senderNumber?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getMethodBadge = (ord: Order) => {
    const method = ord.paymentMethod;
    switch (method) {
      case 'bkash':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#D12053]/10 text-[#D12053] border border-[#D12053]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D12053]" />
            bKash (Prepaid)
          </span>
        );
      case 'nagad':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#F7941D]/10 text-[#D97706] border border-[#F7941D]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F7941D]" />
            Nagad (Prepaid)
          </span>
        );
      case 'rocket':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#8C3494]/10 text-[#8C3494] border border-[#8C3494]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8C3494]" />
            Rocket (Prepaid)
          </span>
        );
      default:
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-800 border border-neutral-300">
              Cash On Delivery
            </span>
            {ord.advanceDeliveryPaid && (
              <span className="text-[10px] text-emerald-700 font-extrabold flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5" />
                Adv. Fee ৳{ord.advanceAmount} ({ord.advanceGateway?.toUpperCase() || 'MFS'})
              </span>
            )}
          </div>
        );
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3" />
            Paid / Verified
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
            <XCircle className="w-3 h-3" />
            Failed / Invalid
          </span>
        );
      case 'refunded':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
            <RefreshCw className="w-3 h-3" />
            Refunded
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3" />
            Pending Verification
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Invoices & Order Receipts"
        subtitle="Print A4 invoices & thermal receipts and inspect payment proofs"
      />

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order #, customer, phone, or TrxID..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black cursor-pointer font-semibold"
        >
          <option value="all">All Order Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="packed">Packed</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black cursor-pointer font-semibold"
        >
          <option value="all">All Payment Types</option>
          <option value="online">Online Prepayment (bKash/Nagad/Rocket)</option>
          <option value="cod">Cash on Delivery (COD)</option>
          <option value="paid">Paid Only</option>
          <option value="pending">Pending Payment Only</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <ShoppingBag className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">No orders found</h4>
            <p className="text-xs text-neutral-500">No transactions recorded matching the selected filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Order Number</th>
                  <th className="p-3.5">Date &amp; Time</th>
                  <th className="p-3.5">Customer & Phone</th>
                  <th className="p-3.5">Amount</th>
                  <th className="p-3.5">Payment Method</th>
                  <th className="p-3.5">TrxID / Proof</th>
                  <th className="p-3.5">Payment Status</th>
                  <th className="p-3.5">Order Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium">
                {filteredOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-neutral-50/50">
                    <td className="p-3.5">
                      <span className="font-mono font-bold text-neutral-900">{ord.orderNumber}</span>
                      <span className="block text-[10px] text-neutral-400 font-normal">{ord.deliveryZone}</span>
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="block text-neutral-800 font-semibold text-xs tabular-nums">
                        {formatDatePart(ord.createdAt, 'Recent')}
                      </span>
                      {formatTimePart(ord.createdAt) && (
                        <span className="block text-[10px] text-neutral-400 font-mono tabular-nums mt-0.5">
                          {formatTimePart(ord.createdAt)}
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <p className="font-semibold text-neutral-900">{ord.customerName}</p>
                      <p className="font-mono text-neutral-500 text-[11px]">{ord.customerPhone}</p>
                    </td>
                    <td className="p-3.5">
                      <p className="font-bold text-neutral-900">৳{ord.total.toLocaleString('en-BD')}</p>
                      {(() => {
                        const payInfo = getOrderPaidAndDue(ord);
                        return (
                          <div className="mt-0.5 space-y-0.5">
                            <span className="text-[10px] text-emerald-700 font-bold block font-mono">
                              Paid: ৳{payInfo.paid.toLocaleString('en-BD')}
                            </span>
                            {payInfo.due > 0 && (
                              <span className="text-[10px] text-red-600 font-bold block font-mono">
                                Due: ৳{payInfo.due.toLocaleString('en-BD')}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      {getMethodBadge(ord)}
                    </td>
                    <td className="p-3.5">
                      {ord.paymentDetails?.transactionId ? (
                        <div className="space-y-1">
                          <span className="font-mono font-bold text-neutral-800 bg-neutral-100 px-1.5 py-0.5 rounded text-[11px] block">
                            {ord.paymentDetails.transactionId}
                          </span>
                          {ord.paymentDetails.senderNumber && (
                            <span className="text-[10px] text-neutral-500 font-mono block">
                              From: {ord.paymentDetails.senderNumber}
                            </span>
                          )}
                          {ord.paymentDetails.proofUrl && (
                            <button
                              type="button"
                              onClick={() => setZoomedProofUrl(ord.paymentDetails?.proofUrl || null)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                            >
                              <ImageIcon className="w-3 h-3" />
                              View Proof
                            </button>
                          )}
                        </div>
                      ) : ord.paymentMethod === 'cod' ? (
                        <span className="text-[11px] text-neutral-400">Collect on Delivery</span>
                      ) : (
                        <span className="text-[11px] text-amber-600 font-medium">Pending submission</span>
                      )}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      {getPaymentStatusBadge(ord.paymentStatus)}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        ord.orderStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                        ord.orderStatus === 'cancelled' ? 'bg-red-100 text-red-800' :
                        ord.orderStatus === 'shipped' ? 'bg-blue-100 text-blue-800' :
                        'bg-neutral-100 text-neutral-800'
                      }`}>
                        {ord.orderStatus}
                      </span>
                      <span className="block text-[10px] text-neutral-500 mt-1">
                        {(() => {
                          const st = orderService.getOrderPipelineStage(ord);
                          if (st === 'order_verification') return 'Order Verify';
                          if (st === 'payment_verification') return 'Payment Verify';
                          if (st === 'inventory_packing') return 'Stock Verify';
                          if (st === 'delivery_dispatch') return 'Packing & Delivery';
                          if (st === 'cod_reconciliation') return 'COD Reconciliation';
                          if (st === 'completed') return ord.orderChannel === 'pos' ? 'POS Sale' : 'Completed';
                          if (st === 'returned') return 'Returned';
                          return 'Cancelled';
                        })()}
                      </span>
                      {ord.pipeline?.subStatus && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200 font-mono text-[9px] font-bold text-neutral-700">
                          {ord.pipeline.subStatus}
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => openOrderModal(ord)}
                        className="px-3 py-1 bg-black text-white text-[11px] font-semibold rounded hover:bg-neutral-800 cursor-pointer"
                      >
                        Inspect / Verify
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Details & Invoice Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-3xl w-full my-2 sm:my-6 max-h-[94vh] flex flex-col justify-between overflow-hidden animate-fade-in print:m-0 print:p-0 print:max-w-none print:shadow-none print:rounded-none">
            
            {/* Modal Header & Dual Format Switcher */}
            <div className="p-3 sm:p-5 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-neutral-50 print:hidden">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-neutral-800" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                  Invoice: {getFormattedInvoiceNumber(selectedOrder.orderNumber, selectedOrder.id)}
                </h3>
              </div>

              {/* Format Toggle Tabs & Print Actions */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Format Switcher */}
                <div className="flex bg-neutral-200 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setInvoiceFormat('a4')}
                    className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                      invoiceFormat === 'a4'
                        ? 'bg-white text-black shadow-xs font-bold'
                        : 'text-neutral-600 hover:text-black'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>A4 Standard</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceFormat('thermal')}
                    className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                      invoiceFormat === 'thermal'
                        ? 'bg-white text-black shadow-xs font-bold'
                        : 'text-neutral-600 hover:text-black'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Thermal POS (80mm)</span>
                  </button>
                </div>

                {/* Print Button */}
                <button
                  type="button"
                  onClick={handlePrintInvoice}
                  className="px-3.5 py-1.5 bg-black hover:bg-neutral-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print {invoiceFormat === 'thermal' ? 'POS Receipt' : 'A4 Invoice'}</span>
                </button>

                <button 
                  onClick={() => setSelectedOrder(null)} 
                  className="p-1.5 text-neutral-400 hover:text-black rounded-lg hover:bg-neutral-100 cursor-pointer ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Print Stylesheet injection for authentic printer output */}
            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-invoice-container, #printable-invoice-container * {
                  visibility: visible !important;
                }
                #printable-invoice-container {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: ${invoiceFormat === 'thermal' ? '80mm' : '100%'} !important;
                  margin: 0 !important;
                  padding: ${invoiceFormat === 'thermal' ? '4mm' : '12mm'} !important;
                  background: #ffffff !important;
                  color: #000000 !important;
                }
                @page {
                  size: ${invoiceFormat === 'thermal' ? '80mm auto' : 'A4 portrait'};
                  margin: 0;
                }
              }
            ` }} />

            {/* Modal Body */}
            <div className="p-3.5 sm:p-8 overflow-y-auto overflow-x-hidden space-y-6 flex-1 text-xs">
              
              {/* Printable Invoice Container */}
              <div id="printable-invoice-container">
                {invoiceFormat === 'thermal' ? (
                  <ThermalPosReceipt order={selectedOrder} />
                ) : (
                  <InvoiceSheet order={selectedOrder} />
                )}
              </div>

              {/* Admin-Only Payment Verification & Trx Controls (Hidden in Print) */}
              <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/70 space-y-4 print:hidden">
                <div className="flex items-center justify-between pb-2.5 border-b border-neutral-200">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <h4 className="font-bold uppercase tracking-wider text-neutral-900">
                      Admin Payment Verification &amp; Trx Details
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {getMethodBadge(selectedOrder)}
                    {getPaymentStatusBadge(selectedOrder.paymentStatus)}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {selectedOrder.paymentDetails?.transactionId && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-neutral-400 block">Transaction ID (TrxID)</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-sm text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200">
                            {selectedOrder.paymentDetails.transactionId}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(selectedOrder.paymentDetails?.transactionId || '', 'trx')}
                            className="p-1 hover:bg-neutral-200 rounded text-neutral-600 cursor-pointer"
                            title="Copy TrxID"
                          >
                            {copiedKey === 'trx' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedOrder.paymentDetails?.senderNumber && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-neutral-400 block">Sender Phone Number</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-neutral-900">
                            {selectedOrder.paymentDetails.senderNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(selectedOrder.paymentDetails?.senderNumber || '', 'sender')}
                            className="p-1 hover:bg-neutral-200 rounded text-neutral-600 cursor-pointer"
                            title="Copy Sender Number"
                          >
                            {copiedKey === 'sender' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {!selectedOrder.paymentDetails?.transactionId && !selectedOrder.paymentDetails?.senderNumber && (
                      <p className="text-[11px] text-neutral-500">
                        No MFS transaction details attached for this order.
                      </p>
                    )}
                  </div>

                  {/* Payment Screenshot Proof */}
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-1.5">
                      Payment Proof Screenshot
                    </span>
                    {selectedOrder.paymentDetails?.proofUrl ? (
                      <div className="relative group rounded-lg overflow-hidden border border-neutral-300 max-w-[200px] bg-neutral-100">
                        <img
                          src={selectedOrder.paymentDetails.proofUrl}
                          alt="Payment Proof"
                          className="w-full h-28 object-cover cursor-pointer group-hover:scale-105 transition-transform"
                          onClick={() => setZoomedProofUrl(selectedOrder.paymentDetails?.proofUrl || null)}
                        />
                        <div
                          onClick={() => setZoomedProofUrl(selectedOrder.paymentDetails?.proofUrl || null)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer text-white text-[11px] font-semibold gap-1"
                        >
                          <Maximize2 className="w-4 h-4" />
                          <span>Click to Zoom</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-white rounded-lg text-center text-neutral-400 border border-dashed border-neutral-300">
                        <ImageIcon className="w-5 h-5 mx-auto mb-1 text-neutral-300" />
                        <p className="text-[11px]">No proof screenshot attached</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Live Sequential Payment Verification Summary */}
                <div className="pt-3 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-neutral-600 font-semibold">
                    Payment Verification Stage:{' '}
                    <b className="text-neutral-900">
                      {selectedOrder.paymentMethod === 'cod' && selectedOrder.paymentStatus !== 'paid'
                        ? 'Awaiting Cash Collection (COD)'
                        : selectedOrder.pipeline?.paymentVerification?.statusLabel ||
                          selectedOrder.paymentStatus.toUpperCase()}
                    </b>
                  </span>
                  {getOrderFreeDeliveryFee(selectedOrder) > 0 && (
                    <span className="font-mono text-neutral-700">
                      Free Delivery Fee: <b className="text-red-700">-৳{getOrderFreeDeliveryFee(selectedOrder).toLocaleString('en-BD')}</b> · Net Sale:{' '}
                      <b className="text-emerald-700">৳{getOrderRecognizedSale(selectedOrder).toLocaleString('en-BD')}</b>
                    </span>
                  )}
                </div>
              </div>

              {/* Staff Approval Attribution Summary */}
              {(selectedOrder.pipeline?.verifiedBy ||
                selectedOrder.pipeline?.paymentVerifiedBy ||
                selectedOrder.pipeline?.inventoryHandledBy ||
                selectedOrder.pipeline?.deliveryHandledBy ||
                selectedOrder.pipeline?.returnedBy ||
                selectedOrder.pipeline?.cancelledBy) && (
                <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] print:hidden">
                  {selectedOrder.pipeline?.verifiedBy && (
                    <div>
                      <span className="text-neutral-400 block">Approved By</span>
                      <b className="text-neutral-900">{selectedOrder.pipeline.verifiedBy}</b>
                    </div>
                  )}
                  {selectedOrder.pipeline?.paymentVerifiedBy && (
                    <div>
                      <span className="text-neutral-400 block">Payment Verified By</span>
                      <b className="text-neutral-900">{selectedOrder.pipeline.paymentVerifiedBy}</b>
                    </div>
                  )}
                  {selectedOrder.pipeline?.inventoryHandledBy && (
                    <div>
                      <span className="text-neutral-400 block">Packed By</span>
                      <b className="text-neutral-900">{selectedOrder.pipeline.inventoryHandledBy}</b>
                    </div>
                  )}
                  {selectedOrder.pipeline?.deliveryHandledBy && (
                    <div>
                      <span className="text-neutral-400 block">Delivery Handled By</span>
                      <b className="text-neutral-900">{selectedOrder.pipeline.deliveryHandledBy}</b>
                    </div>
                  )}
                  {selectedOrder.pipeline?.returnedBy && (
                    <div>
                      <span className="text-neutral-400 block">Returned By</span>
                      <b className="text-amber-800">{selectedOrder.pipeline.returnedBy}</b>
                    </div>
                  )}
                  {selectedOrder.pipeline?.cancelledBy && (
                    <div>
                      <span className="text-neutral-400 block">Cancelled By</span>
                      <b className="text-red-700">{selectedOrder.pipeline.cancelledBy}</b>
                    </div>
                  )}
                </div>
              )}

              {/* Payment & Due Collection Log */}
              {selectedOrder.paymentHistory && selectedOrder.paymentHistory.length > 0 && (
                <div className="border border-neutral-200 rounded-xl p-4 bg-white space-y-2 print:hidden">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                    Recorded Payment &amp; Due Collection Log ({selectedOrder.paymentHistory.length})
                  </span>
                  <div className="space-y-1.5">
                    {selectedOrder.paymentHistory.map((pLog) => (
                      <div key={pLog.id} className="flex items-center justify-between text-[11px] py-1 border-b border-neutral-100 last:border-b-0">
                        <div>
                          <span className="font-mono font-bold text-emerald-700">
                            ৳{pLog.amount.toLocaleString('en-BD')}
                          </span>{' '}
                          <span className="uppercase font-semibold text-neutral-700">({pLog.method})</span>{' '}
                          · By <b>{pLog.receivedBy}</b>
                          {pLog.trxId && <span className="ml-1.5 font-mono text-neutral-500">Trx: {pLog.trxId}</span>}
                          {pLog.note && <span className="text-neutral-500"> — {pLog.note}</span>}
                        </div>
                        <span className="font-mono text-neutral-400 text-[10px]">
                          {formatDateTime(pLog.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Order Workflow Status & Return/Cancel Dropdown */}
              {(() => {
                const currentStage = orderService.getOrderPipelineStage(selectedOrder);
                const wfStatus = getOrderWorkflowStatus(selectedOrder);
                const isClosed = currentStage === 'returned' || currentStage === 'cancelled';
                const showReturn =
                  (currentStage === 'delivery_dispatch' ||
                    currentStage === 'cod_reconciliation' ||
                    currentStage === 'completed') &&
                  canReturn;
                const showCancel = !isClosed && currentStage !== 'completed' && canCancel;

                return (
                  <div className="pt-4 border-t border-neutral-200 space-y-3 print:hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold uppercase tracking-wider text-neutral-900">
                          Sequential Workflow Status
                        </h4>
                        <p className="text-[11px] text-neutral-600 mt-0.5">
                          Current Action: <b className="text-neutral-900">{wfStatus.currentActionLabel}</b>
                        </p>
                      </div>
                      <span className="text-[11px] text-neutral-500">
                        Actor: <b className="text-neutral-800">{actorDisplayName}</b>
                      </span>
                    </div>

                    {(showReturn || showCancel) && (
                      <div className="relative inline-block">
                        <button
                          type="button"
                          disabled={updating}
                          onClick={() => setWorkflowActionMenuOpen((v) => !v)}
                          className="px-4 py-2 bg-black text-white hover:bg-neutral-800 disabled:opacity-50 cursor-pointer text-[11px] font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-2"
                        >
                          <span>{updating ? 'Processing...' : 'Order Exceptions'}</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        {workflowActionMenuOpen && (
                          <div className="absolute left-0 mt-1.5 w-60 bg-white border border-neutral-200 rounded-xl shadow-xl z-30 py-1 text-xs">
                            {showReturn && (
                              <button
                                type="button"
                                onClick={() => {
                                  setWorkflowActionMenuOpen(false);
                                  handleQuickPipelineAction('returned');
                                }}
                                className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-neutral-50 text-amber-800 font-bold cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Return Order</span>
                              </button>
                            )}
                            {showCancel && (
                              <button
                                type="button"
                                onClick={() => {
                                  setWorkflowActionMenuOpen(false);
                                  handleQuickPipelineAction('cancelled');
                                }}
                                className="w-full px-3.5 py-2 text-left flex items-center gap-2 hover:bg-red-50 text-red-700 font-bold cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Cancel Order</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manual Status Override (Super Admin only, so regular staff only see their stage's buttons) */}
                    {isSuperAdmin && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-100">
                          <div>
                            <label className="block text-neutral-600 font-semibold mb-1">Fulfillment Status</label>
                            <select
                              value={newStatus}
                              onChange={(e: any) => setNewStatus(e.target.value)}
                              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-semibold cursor-pointer"
                            >
                              <option value="pending">Pending</option>
                              <option value="confirmed">Confirmed</option>
                              <option value="processing">Processing</option>
                              <option value="packed">Packed</option>
                              <option value="shipped">Shipped</option>
                              <option value="delivered">Delivered</option>
                              <option value="cancelled">Cancelled</option>
                              <option value="returned">Returned</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-neutral-600 font-semibold mb-1">Action / Status Note</label>
                            <input
                              type="text"
                              value={statusNote}
                              onChange={(e) => setStatusNote(e.target.value)}
                              placeholder="e.g. Courier Tracking: Steadfast #12345"
                              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus()}
                            disabled={updating}
                            className="px-5 py-2.5 bg-black text-white font-bold uppercase tracking-wider rounded hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
                          >
                            {updating ? 'Updating...' : 'Save Fulfillment Status'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

            </div>

          </div>
        </div>
      )}

      {/* Proof Zoom Modal / Lightbox */}
      {zoomedProofUrl && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fade-in">
          <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-2 px-2 text-white">
              <span className="font-bold text-xs uppercase tracking-wider">Payment Proof Screenshot</span>
              <div className="flex items-center gap-2">
                <a
                  href={zoomedProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in New Tab
                </a>
                <button
                  onClick={() => setZoomedProofUrl(null)}
                  className="p-1.5 bg-white/20 hover:bg-white/30 text-white rounded-full cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="bg-neutral-900 p-2 rounded-xl border border-neutral-800 overflow-auto max-h-[82vh] flex items-center justify-center">
              <img
                src={zoomedProofUrl}
                alt="Payment proof screenshot zoom"
                className="max-h-[80vh] max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {actionToast && (
        <div className="fixed bottom-6 right-6 z-60 bg-black text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold border border-neutral-700 animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{actionToast}</span>
        </div>
      )}

    </div>
  );
};
