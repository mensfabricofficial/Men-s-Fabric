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
  Send
} from 'lucide-react';
import { Order, OrderStatus, PaymentStatus } from '../types';
import { orderService } from '../services/orderService';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';

export const AdminOrders: React.FC = () => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Order Details Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus>('pending');
  const [statusNote, setStatusNote] = useState('');
  const [updating, setUpdating] = useState(false);

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
      // Refresh modal
      const refreshed = await orderService.getOrderById(selectedOrder.id);
      setSelectedOrder(refreshed);
      await loadOrders();
    } catch {
      alert('Failed to update order status.');
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdatePayment = async (payStatus: PaymentStatus) => {
    if (!selectedOrder) return;
    try {
      await orderService.updatePaymentStatus(selectedOrder.id, payStatus);
      const refreshed = await orderService.getOrderById(selectedOrder.id);
      setSelectedOrder(refreshed);
      await loadOrders();
    } catch {
      alert('Failed to update payment status.');
    }
  };

  const handlePrintInvoice = () => {
    window.print();
  };

  const filteredOrders = orders.filter((o) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.toLowerCase().includes(q) ||
        o.shippingAddress?.district?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Order Fulfillment & Management
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Process incoming Cash on Delivery orders, dispatch packages, and update customers.
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
            placeholder="Search by order #, customer name, or phone number..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black cursor-pointer font-semibold"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="packed">Packed</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
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
                  <th className="p-3.5">Customer</th>
                  <th className="p-3.5">Contact</th>
                  <th className="p-3.5">Zone</th>
                  <th className="p-3.5">Items</th>
                  <th className="p-3.5">Amount</th>
                  <th className="p-3.5">Order Status</th>
                  <th className="p-3.5">Payment</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium">
                {filteredOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-neutral-50/50">
                    <td className="p-3.5 font-mono font-bold text-neutral-900">{ord.orderNumber}</td>
                    <td className="p-3.5 text-neutral-500">
                      {ord.createdAt?.toDate ? ord.createdAt.toDate().toLocaleDateString('en-BD') : 'Recent'}
                    </td>
                    <td className="p-3.5 font-semibold text-neutral-900">{ord.customerName}</td>
                    <td className="p-3.5 font-mono text-neutral-600">{ord.customerPhone}</td>
                    <td className="p-3.5 text-neutral-600">{ord.deliveryZone}</td>
                    <td className="p-3.5">{ord.items.length} items</td>
                    <td className="p-3.5 font-bold text-neutral-900">৳{ord.total.toLocaleString('en-BD')}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        ord.orderStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                        ord.orderStatus === 'cancelled' ? 'bg-red-100 text-red-800' :
                        ord.orderStatus === 'shipped' ? 'bg-blue-100 text-blue-800' :
                        'bg-neutral-100 text-neutral-800'
                      }`}>
                        {ord.orderStatus}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        ord.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'
                      }`}>
                        {ord.paymentStatus}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => openOrderModal(ord)}
                        className="px-3 py-1 bg-black text-white text-[11px] font-semibold rounded hover:bg-neutral-800 cursor-pointer"
                      >
                        View & Update
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 max-h-[90vh] flex flex-col justify-between overflow-hidden animate-fade-in print:m-0 print:max-w-none print:shadow-none">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 print:hidden">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                  Order Details — {selectedOrder.orderNumber}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintInvoice}
                  className="px-3 py-1.5 border border-neutral-300 rounded text-xs font-semibold flex items-center gap-1.5 hover:bg-white cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Invoice</span>
                </button>
                <button onClick={() => setSelectedOrder(null)} className="p-1 text-neutral-400 hover:text-black cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body / Invoice Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              
              {/* Printable Header */}
              <div className="flex justify-between items-start border-b border-neutral-200 pb-4">
                <div>
                  <img src="/logo.jpg" alt="MEN'S FABRIC" className="h-8 object-contain mb-2 bg-black p-1 rounded" />
                  <p className="font-bold text-neutral-900">MEN'S FABRIC (Clothing Brand)</p>
                  <p className="text-neutral-500">Dhaka, Bangladesh • Cash on Delivery Invoice</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-extrabold text-black font-mono">{selectedOrder.orderNumber}</p>
                  <p className="text-neutral-500">
                    Date: {selectedOrder.createdAt?.toDate ? selectedOrder.createdAt.toDate().toLocaleDateString('en-BD') : 'N/A'}
                  </p>
                  <p className="font-bold uppercase text-[10px] mt-1 text-neutral-800">
                    Status: {selectedOrder.orderStatus}
                  </p>
                </div>
              </div>

              {/* Customer & Shipping info */}
              <div className="grid grid-cols-2 gap-4 bg-neutral-50 p-4 rounded-lg">
                <div>
                  <span className="font-bold uppercase tracking-wider text-neutral-400 text-[10px] block mb-1">
                    Customer Information
                  </span>
                  <p className="font-bold text-neutral-900">{selectedOrder.customerName}</p>
                  <p className="font-mono">{selectedOrder.customerPhone}</p>
                  {selectedOrder.customerEmail && <p>{selectedOrder.customerEmail}</p>}
                </div>
                <div>
                  <span className="font-bold uppercase tracking-wider text-neutral-400 text-[10px] block mb-1">
                    Shipping Destination
                  </span>
                  <p>{selectedOrder.shippingAddress.address}</p>
                  <p>{selectedOrder.shippingAddress.district}, {selectedOrder.shippingAddress.division}</p>
                  <p className="font-semibold text-neutral-700 mt-1">Zone: {selectedOrder.deliveryZone}</p>
                </div>
              </div>

              {/* Ordered Items Table */}
              <div>
                <table className="w-full text-left border-collapse border border-neutral-200">
                  <thead className="bg-neutral-100 font-bold uppercase text-neutral-700 text-[10px]">
                    <tr>
                      <th className="p-2 border">Item</th>
                      <th className="p-2 border">Size / Color</th>
                      <th className="p-2 border text-center">Qty</th>
                      <th className="p-2 border text-right">Unit Price</th>
                      <th className="p-2 border text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {selectedOrder.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 border font-medium text-neutral-900">{item.productName}</td>
                        <td className="p-2 border text-neutral-600">{item.size} / {item.color}</td>
                        <td className="p-2 border text-center font-bold">{item.quantity}</td>
                        <td className="p-2 border text-right">৳{item.unitPrice.toLocaleString('en-BD')}</td>
                        <td className="p-2 border text-right font-bold">৳{item.totalPrice.toLocaleString('en-BD')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total Calculation */}
              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 text-right">
                  <div className="flex justify-between text-neutral-600">
                    <span>Subtotal:</span>
                    <span>৳{selectedOrder.subtotal.toLocaleString('en-BD')}</span>
                  </div>
                  {selectedOrder.discount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Discount ({selectedOrder.couponCode}):</span>
                      <span>-৳{selectedOrder.discount.toLocaleString('en-BD')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-neutral-600">
                    <span>Delivery Fee:</span>
                    <span>৳{selectedOrder.deliveryCharge.toLocaleString('en-BD')}</span>
                  </div>
                  <div className="flex justify-between text-sm font-extrabold text-neutral-900 pt-1 border-t border-neutral-200">
                    <span>Total Amount (COD):</span>
                    <span>৳{selectedOrder.total.toLocaleString('en-BD')}</span>
                  </div>
                </div>
              </div>

              {/* Admin Actions Panel (Hidden in print) */}
              <div className="pt-4 border-t border-neutral-200 space-y-4 print:hidden">
                <h4 className="font-bold uppercase tracking-wider text-neutral-900">
                  Update Order & Payment Status
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-neutral-600 font-semibold mb-1">Fulfillment Status</label>
                    <select
                      value={newStatus}
                      onChange={(e: any) => setNewStatus(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-semibold"
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
                    <label className="block text-neutral-600 font-semibold mb-1">Payment Status</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdatePayment('paid')}
                        className={`flex-1 py-2 rounded font-bold border transition-colors ${
                          selectedOrder.paymentStatus === 'paid' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-neutral-300'
                        }`}
                      >
                        Paid
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdatePayment('pending')}
                        className={`flex-1 py-2 rounded font-bold border transition-colors ${
                          selectedOrder.paymentStatus === 'pending' ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-white border-neutral-300'
                        }`}
                      >
                        Unpaid (COD)
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-neutral-600 font-semibold mb-1">Status Update Note (Visible in tracking timeline)</label>
                  <input
                    type="text"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="e.g. Package dispatched via Pathao / Steadfast Courier tracking #12345"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleUpdateStatus}
                  disabled={updating}
                  className="px-5 py-2.5 bg-black text-white font-bold uppercase tracking-wider rounded hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
                >
                  {updating ? 'Updating...' : 'Save Status Update'}
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
