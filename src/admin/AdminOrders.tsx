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
  Receipt
} from 'lucide-react';
import { Order, OrderStatus, PaymentStatus, PaymentMethod } from '../types';
import { orderService } from '../services/orderService';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { printElementById } from '../lib/printHelper';
import { BrandLogo } from '../components/common/BrandLogo';

export const AdminOrders: React.FC = () => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Screenshot Zoom Modal
  const [zoomedProofUrl, setZoomedProofUrl] = useState<string | null>(null);

  // Toast state
  const [actionToast, setActionToast] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await orderService.getAllOrdersAdmin(statusFilter);
      setOrders(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  const openOrderModal = (ord: Order) => {
    setSelectedOrder(ord);
    setNewStatus(ord.orderStatus);
    setStatusNote('');
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleUpdateStatus = async () => {
    if (!selectedOrder) return;
    setUpdating(true);
    try {
      await orderService.updateOrderStatus(selectedOrder.id, newStatus, statusNote);
      if (currentUser) {
        await settingsService.logAdminAction(
          currentUser.uid,
          currentUser.email || '',
          'UPDATE_ORDER_STATUS',
          selectedOrder.orderNumber,
          `Status changed to ${newStatus}`
        );
      }
      const refreshed = await orderService.getOrderById(selectedOrder.id);
      setSelectedOrder(refreshed);
      await loadOrders();
      setActionToast(`Order #${selectedOrder.orderNumber} status updated to ${newStatus}`);
      setTimeout(() => setActionToast(null), 3500);
    } catch {
      setActionToast('Failed to update order status.');
      setTimeout(() => setActionToast(null), 4000);
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdatePayment = async (payStatus: PaymentStatus) => {
    if (!selectedOrder) return;
    try {
      await orderService.updatePaymentStatus(selectedOrder.id, payStatus);
      if (currentUser) {
        await settingsService.logAdminAction(
          currentUser.uid,
          currentUser.email || '',
          'UPDATE_PAYMENT_STATUS',
          selectedOrder.orderNumber,
          `Payment status set to ${payStatus}`
        );
      }
      const refreshed = await orderService.getOrderById(selectedOrder.id);
      setSelectedOrder(refreshed);
      await loadOrders();
      setActionToast(`Payment status updated to ${payStatus.toUpperCase()}`);
      setTimeout(() => setActionToast(null), 3500);
    } catch {
      setActionToast('Failed to update payment status.');
      setTimeout(() => setActionToast(null), 4000);
    }
  };

  const handlePrintInvoice = () => {
    if (selectedOrder) {
      printElementById('printable-invoice-container', `Invoice-${selectedOrder.orderNumber}`);
    } else {
      window.print();
    }
  };

  const filteredOrders = orders.filter((o) => {
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
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Order Fulfillment & Payment Verification
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Verify bKash, Nagad, Rocket transactions, inspect payment proofs, manage COD, and fulfill orders.
          </p>
        </div>
      </div>

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
                  <th className="p-3.5">Date</th>
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
                    <td className="p-3.5 text-neutral-500 whitespace-nowrap">
                      {ord.createdAt?.toDate ? ord.createdAt.toDate().toLocaleDateString('en-BD') : 'Recent'}
                    </td>
                    <td className="p-3.5">
                      <p className="font-semibold text-neutral-900">{ord.customerName}</p>
                      <p className="font-mono text-neutral-500 text-[11px]">{ord.customerPhone}</p>
                    </td>
                    <td className="p-3.5">
                      <p className="font-bold text-neutral-900">৳{ord.total.toLocaleString('en-BD')}</p>
                      {ord.advanceDeliveryPaid ? (
                        <div className="mt-0.5 space-y-0.5">
                          <span className="text-[10px] text-emerald-700 font-bold block">
                            Adv. Paid: ৳{ord.advanceAmount}
                          </span>
                          <span className="text-[10px] text-red-600 font-bold block">
                            Courier Due: ৳{ord.dueOnDelivery ?? (ord.total - (ord.advanceAmount || ord.deliveryCharge))}
                          </span>
                        </div>
                      ) : ord.onlineDiscount && ord.onlineDiscount > 0 ? (
                        <span className="text-[10px] text-emerald-600 font-semibold block">
                          -৳{ord.onlineDiscount} online disc.
                        </span>
                      ) : null}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-6 max-h-[92vh] flex flex-col justify-between overflow-hidden animate-fade-in print:m-0 print:p-0 print:max-w-none print:shadow-none print:rounded-none">
            
            {/* Modal Header & Dual Format Switcher */}
            <div className="p-4 sm:p-5 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50 print:hidden">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-neutral-800" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                  Invoice & Order: {selectedOrder.orderNumber}
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

            {/* Modal Body / Invoice Content */}
            <div id="printable-invoice-container" className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              
              {invoiceFormat === 'thermal' ? (
                /* ================= THERMAL POS RECEIPT LAYOUT (80mm) ================= */
                <div className="max-w-[340px] mx-auto bg-white p-5 border border-dashed border-neutral-300 font-mono text-[11px] text-neutral-900 space-y-3 leading-tight print:border-none print:p-0 print:max-w-none">
                  {/* Store Header */}
                  <div className="text-center pb-2 border-b border-dashed border-neutral-400 space-y-1">
                    <p className="font-extrabold text-sm tracking-wider uppercase">MEN'S FABRIC</p>
                    <p className="text-[10px] text-neutral-600 font-sans italic">Clothing Brand • Premium Menswear</p>
                    <p className="text-[10px] text-neutral-600">Dhaka, Bangladesh</p>
                    <p className="text-[10px] text-neutral-600">Hotline: 01700-000000</p>
                  </div>

                  {/* Order & Customer Metadata */}
                  <div className="space-y-1 pb-2 border-b border-dashed border-neutral-400 text-[10px]">
                    <div className="flex justify-between">
                      <span className="font-bold">INVOICE:</span>
                      <span className="font-bold">{selectedOrder.orderNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>DATE:</span>
                      <span>{selectedOrder.createdAt?.toDate ? selectedOrder.createdAt.toDate().toLocaleString('en-BD') : new Date().toLocaleDateString('en-BD')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>CUSTOMER:</span>
                      <span className="font-bold truncate max-w-[170px]">{selectedOrder.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PHONE:</span>
                      <span className="font-bold">{selectedOrder.customerPhone}</span>
                    </div>
                    <div>
                      <span>DESTINATION:</span>
                      <p className="text-neutral-700 pl-1">{selectedOrder.shippingAddress.address}, {selectedOrder.shippingAddress.district}</p>
                    </div>
                  </div>

                  {/* Itemized Table */}
                  <div className="pb-2 border-b border-dashed border-neutral-400">
                    <div className="flex justify-between font-bold border-b border-neutral-300 pb-1 mb-1 text-[10px]">
                      <span>ITEM / VARIANT</span>
                      <span>QTY x PRICE = TOTAL</span>
                    </div>
                    <div className="space-y-2">
                      {selectedOrder.items.map((item, idx) => (
                        <div key={idx} className="space-y-0.5">
                          <p className="font-bold">{item.productName}</p>
                          <div className="flex justify-between text-[10px] text-neutral-700">
                            <span>{item.size} / {item.color}</span>
                            <span>{item.quantity} x ৳{item.unitPrice} = <b>৳{item.totalPrice}</b></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary Totals */}
                  <div className="space-y-1 pb-2 border-b border-dashed border-neutral-400 text-[11px]">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>৳{selectedOrder.subtotal.toLocaleString('en-BD')}</span>
                    </div>
                    {selectedOrder.discount > 0 && (
                      <div className="flex justify-between text-emerald-800">
                        <span>Coupon ({selectedOrder.couponCode}):</span>
                        <span>-৳{selectedOrder.discount.toLocaleString('en-BD')}</span>
                      </div>
                    )}
                    {selectedOrder.onlineDiscount && selectedOrder.onlineDiscount > 0 ? (
                      <div className="flex justify-between text-emerald-800 font-bold">
                        <span>Online Prepayment Discount:</span>
                        <span>-৳{selectedOrder.onlineDiscount.toLocaleString('en-BD')}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between">
                      <span>Delivery Fee ({selectedOrder.deliveryZone}):</span>
                      <span>৳{selectedOrder.deliveryCharge.toLocaleString('en-BD')}</span>
                    </div>
                    {selectedOrder.advanceDeliveryPaid && (
                      <div className="flex justify-between text-emerald-800 font-bold">
                        <span>Adv. Delivery Paid ({selectedOrder.advanceGateway?.toUpperCase() || 'MFS'}):</span>
                        <span>-৳{(selectedOrder.advanceAmount || selectedOrder.deliveryCharge).toLocaleString('en-BD')}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-extrabold pt-1 border-t border-neutral-300">
                      <span>ORDER TOTAL:</span>
                      <span>৳{selectedOrder.total.toLocaleString('en-BD')}</span>
                    </div>
                    {selectedOrder.advanceDeliveryPaid && (
                      <div className="flex justify-between text-xs font-black text-red-700 pt-0.5">
                        <span>DUE ON ARRIVAL:</span>
                        <span>৳{(selectedOrder.dueOnDelivery ?? (selectedOrder.total - (selectedOrder.advanceAmount || selectedOrder.deliveryCharge))).toLocaleString('en-BD')}</span>
                      </div>
                    )}
                  </div>

                  {/* Payment Details */}
                  <div className="space-y-1 pb-2 border-b border-dashed border-neutral-400 text-[10px]">
                    <div className="flex justify-between">
                      <span className="font-bold">PAYMENT METHOD:</span>
                      <span className="font-extrabold uppercase">{selectedOrder.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold">PAYMENT STATUS:</span>
                      <span className="font-extrabold uppercase">{selectedOrder.paymentStatus}</span>
                    </div>
                    {selectedOrder.paymentDetails?.transactionId && (
                      <div className="flex justify-between">
                        <span>TrxID:</span>
                        <span className="font-bold">{selectedOrder.paymentDetails.transactionId}</span>
                      </div>
                    )}
                    {selectedOrder.paymentDetails?.senderNumber && (
                      <div className="flex justify-between">
                        <span>Sender No:</span>
                        <span className="font-bold">{selectedOrder.paymentDetails.senderNumber}</span>
                      </div>
                    )}
                  </div>

                  {/* Simulated Barcode & Footer */}
                  <div className="text-center pt-2 space-y-1.5">
                    <div className="tracking-[4px] font-bold text-xs">
                      ||| | |||| | ||| || ||||| | |||
                    </div>
                    <p className="text-[9px] font-mono tracking-widest">{selectedOrder.orderNumber}</p>
                    <p className="text-[10px] font-bold uppercase pt-1">Thank You For Choosing MEN'S FABRIC!</p>
                    <p className="text-[9px] text-neutral-500">7-Day exchange with original invoice & parcel tag.</p>
                  </div>
                </div>
              ) : (
                /* ================= STANDARD A4 DETAILED INVOICE LAYOUT ================= */
                <div className="space-y-6">
                  {/* Printable Header */}
                  <div className="flex justify-between items-start border-b border-neutral-200 pb-4">
                    <div>
                      <BrandLogo variant="dark" className="h-9 mb-1" />
                      <p className="font-bold text-neutral-900 text-sm">MEN'S FABRIC (Clothing Brand)</p>
                      <p className="text-neutral-500 text-[11px]">Dhaka, Bangladesh • Official Customer Tax Invoice</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-extrabold text-black font-mono">{selectedOrder.orderNumber}</p>
                      <p className="text-neutral-500">
                        Date: {selectedOrder.createdAt?.toDate ? selectedOrder.createdAt.toDate().toLocaleDateString('en-BD') : 'N/A'}
                      </p>
                      <div className="mt-1 flex items-center justify-end gap-1.5">
                        {getMethodBadge(selectedOrder)}
                        {getPaymentStatusBadge(selectedOrder.paymentStatus)}
                      </div>
                    </div>
                  </div>

                  {/* Dedicated Payment Verification Box (bKash/Nagad/Rocket/COD) */}
                  <div className="border border-neutral-200 rounded-xl p-4 bg-gradient-to-br from-neutral-50 to-white shadow-2xs">
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-200">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <h4 className="font-bold uppercase tracking-wider text-neutral-900">
                          Payment Verification & Trx Details
                        </h4>
                      </div>
                      {getMethodBadge(selectedOrder)}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-neutral-400 block">Payment Method</span>
                          <p className="font-bold text-neutral-900 uppercase">
                            {selectedOrder.paymentMethod === 'cod' ? 'Cash on Delivery (COD)' : `${selectedOrder.paymentMethod.toUpperCase()} (Online Prepayment)`}
                          </p>
                        </div>

                        {selectedOrder.paymentDetails?.transactionId && (
                          <div>
                            <span className="text-[10px] uppercase font-bold text-neutral-400 block">Transaction ID (TrxID)</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-extrabold text-sm text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded">
                                {selectedOrder.paymentDetails.transactionId}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(selectedOrder.paymentDetails?.transactionId || '', 'trx')}
                                className="p-1 hover:bg-neutral-200 rounded text-neutral-600 cursor-pointer print:hidden"
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
                                className="p-1 hover:bg-neutral-200 rounded text-neutral-600 cursor-pointer print:hidden"
                                title="Copy Sender Number"
                              >
                                {copiedKey === 'sender' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        )}

                        {selectedOrder.onlineDiscount && selectedOrder.onlineDiscount > 0 ? (
                          <div>
                            <span className="text-[10px] uppercase font-bold text-emerald-600 block">Online Prepayment Discount</span>
                            <p className="font-bold text-emerald-700">৳{selectedOrder.onlineDiscount} deducted</p>
                          </div>
                        ) : null}
                      </div>

                      {/* Payment Screenshot Proof */}
                      <div>
                        <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-1.5">
                          Payment Proof Screenshot
                        </span>
                        {selectedOrder.paymentDetails?.proofUrl ? (
                          <div className="relative group rounded-lg overflow-hidden border border-neutral-300 max-w-[220px] bg-neutral-100">
                            <img
                              src={selectedOrder.paymentDetails.proofUrl}
                              alt="Payment Proof"
                              className="w-full h-32 object-cover cursor-pointer group-hover:scale-105 transition-transform"
                              onClick={() => setZoomedProofUrl(selectedOrder.paymentDetails?.proofUrl || null)}
                            />
                            <div 
                              onClick={() => setZoomedProofUrl(selectedOrder.paymentDetails?.proofUrl || null)}
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer text-white text-[11px] font-semibold gap-1 print:hidden"
                            >
                              <Maximize2 className="w-4 h-4" />
                              <span>Click to Zoom</span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-neutral-100 rounded-lg text-center text-neutral-500 border border-dashed border-neutral-300">
                            <ImageIcon className="w-6 h-6 mx-auto mb-1 text-neutral-400" />
                            <p className="text-[11px]">No proof screenshot attached</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Payment Status Actions in Admin */}
                    <div className="mt-4 pt-3 border-t border-neutral-200 print:hidden">
                      <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1.5">
                        Update Payment Status:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdatePayment('paid')}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            selectedOrder.paymentStatus === 'paid'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-white border border-neutral-300 text-neutral-700 hover:border-emerald-600 hover:text-emerald-700'
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Mark as Paid / Verified
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdatePayment('pending')}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            selectedOrder.paymentStatus === 'pending'
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-white border border-neutral-300 text-neutral-700 hover:border-amber-600 hover:text-amber-700'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          Mark as Pending
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdatePayment('failed')}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            selectedOrder.paymentStatus === 'failed'
                              ? 'bg-red-600 text-white shadow-xs'
                              : 'bg-white border border-neutral-300 text-neutral-700 hover:border-red-600 hover:text-red-700'
                          }`}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Mark as Failed / Invalid Trx
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdatePayment('refunded')}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            selectedOrder.paymentStatus === 'refunded'
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-white border border-neutral-300 text-neutral-700 hover:border-purple-600 hover:text-purple-700'
                          }`}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Mark as Refunded
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* Customer & Shipping info */}
                  <div className="grid grid-cols-2 gap-4 bg-neutral-50 p-4 rounded-lg">
                    <div>
                      <span className="font-bold uppercase tracking-wider text-neutral-400 text-[10px] block mb-1">
                        Customer Information
                      </span>
                      <p className="font-bold text-neutral-900 text-sm">{selectedOrder.customerName}</p>
                      <p className="font-mono">{selectedOrder.customerPhone}</p>
                      {selectedOrder.customerEmail && <p>{selectedOrder.customerEmail}</p>}
                    </div>
                    <div>
                      <span className="font-bold uppercase tracking-wider text-neutral-400 text-[10px] block mb-1">
                        Shipping Destination
                      </span>
                      <p className="font-medium text-neutral-900">{selectedOrder.shippingAddress.address}</p>
                      <p>{selectedOrder.shippingAddress.district}, {selectedOrder.shippingAddress.division}</p>
                      <p className="font-semibold text-neutral-700 mt-1">Zone: {selectedOrder.deliveryZone}</p>
                      {selectedOrder.shippingAddress.notes && (
                        <p className="text-neutral-500 mt-1 italic font-normal">Note: {selectedOrder.shippingAddress.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Ordered Items Table */}
                  <div>
                    <table className="w-full text-left border-collapse border border-neutral-200">
                      <thead className="bg-neutral-100 font-bold uppercase text-neutral-700 text-[10px]">
                        <tr>
                          <th className="p-2.5 border">Item & SKU</th>
                          <th className="p-2.5 border">Size / Color</th>
                          <th className="p-2.5 border text-center">Qty</th>
                          <th className="p-2.5 border text-right">Unit Price</th>
                          <th className="p-2.5 border text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200">
                        {selectedOrder.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="p-2.5 border font-medium text-neutral-900">
                              <div>{item.productName}</div>
                              {item.sku && <span className="font-mono text-[10px] text-neutral-400">SKU: {item.sku}</span>}
                            </td>
                            <td className="p-2.5 border text-neutral-600">{item.size} / {item.color}</td>
                            <td className="p-2.5 border text-center font-bold">{item.quantity}</td>
                            <td className="p-2.5 border text-right">৳{item.unitPrice.toLocaleString('en-BD')}</td>
                            <td className="p-2.5 border text-right font-bold">৳{item.totalPrice.toLocaleString('en-BD')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Total Calculation */}
                  <div className="flex justify-end">
                    <div className="w-80 space-y-1.5 text-right">
                      <div className="flex justify-between text-neutral-600">
                        <span>Subtotal:</span>
                        <span>৳{selectedOrder.subtotal.toLocaleString('en-BD')}</span>
                      </div>
                      {selectedOrder.discount > 0 && (
                        <div className="flex justify-between text-emerald-700 font-semibold">
                          <span>Coupon Discount ({selectedOrder.couponCode}):</span>
                          <span>-৳{selectedOrder.discount.toLocaleString('en-BD')}</span>
                        </div>
                      )}
                      {selectedOrder.onlineDiscount && selectedOrder.onlineDiscount > 0 ? (
                        <div className="flex justify-between text-emerald-700 font-semibold">
                          <span>Online Prepayment Discount:</span>
                          <span>-৳{selectedOrder.onlineDiscount.toLocaleString('en-BD')}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between text-neutral-600">
                        <span>Delivery Fee ({selectedOrder.deliveryZone}):</span>
                        <span>৳{selectedOrder.deliveryCharge.toLocaleString('en-BD')}</span>
                      </div>
                      {selectedOrder.advanceDeliveryPaid && (
                        <div className="flex justify-between text-emerald-700 font-bold">
                          <span>Adv. Delivery Fee Paid ({selectedOrder.advanceGateway?.toUpperCase() || 'MFS'}):</span>
                          <span>-৳{(selectedOrder.advanceAmount || selectedOrder.deliveryCharge).toLocaleString('en-BD')}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-extrabold text-neutral-900 pt-1 border-t border-neutral-200">
                        <span>Total Invoice Value:</span>
                        <span>৳{selectedOrder.total.toLocaleString('en-BD')}</span>
                      </div>
                      {selectedOrder.advanceDeliveryPaid && (
                        <div className="flex justify-between text-sm font-black text-red-700 pt-1.5 border-t border-dashed border-red-300 bg-red-50 p-2 rounded-lg">
                          <span>Collectable Due on Delivery:</span>
                          <span>৳{(selectedOrder.dueOnDelivery ?? (selectedOrder.total - (selectedOrder.advanceAmount || selectedOrder.deliveryCharge))).toLocaleString('en-BD')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Terms & Signature footer for A4 */}
                  <div className="pt-4 border-t border-neutral-200 grid grid-cols-2 text-[10px] text-neutral-500">
                    <div>
                      <p className="font-bold text-neutral-700 mb-0.5">TERMS & EXCHANGE POLICY</p>
                      <p>Exchange requests accepted within 7 days with original invoice & tag intact.</p>
                      <p>Support: +880 1700-000000 • mensfabricofficial@gmail.com</p>
                    </div>
                    <div className="text-right flex flex-col justify-end">
                      <div className="border-b border-neutral-300 w-36 ml-auto mb-1"></div>
                      <p className="font-bold uppercase tracking-wider text-neutral-700">Authorized Signature</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Actions Panel (Hidden in print) */}
              <div className="pt-4 border-t border-neutral-200 space-y-4 print:hidden">
                <h4 className="font-bold uppercase tracking-wider text-neutral-900">
                  Update Order Fulfillment Status
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <label className="block text-neutral-600 font-semibold mb-1">Status Update Note (Timeline)</label>
                    <input
                      type="text"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      placeholder="e.g. Courier Tracking: Steadfast #12345"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleUpdateStatus}
                  disabled={updating}
                  className="px-5 py-2.5 bg-black text-white font-bold uppercase tracking-wider rounded hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
                >
                  {updating ? 'Updating...' : 'Save Fulfillment Status'}
                </button>
              </div>

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
