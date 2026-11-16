import React, { useState, useEffect } from 'react';
import { Search, Check, ShieldAlert, FileText } from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { orderService } from '../services/orderService';
import { useAuth } from '../context/AuthContext';
import { A4InvoiceModal } from '../components/common/A4InvoiceModal';
import { FloatingInput } from '../components/common/FloatingInput';

interface TrackOrderPageProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

const ORDER_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending', label: 'Placed' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'processing', label: 'Processing' },
  { status: 'packed', label: 'Packed' },
  { status: 'shipped', label: 'In Transit' },
  { status: 'delivered', label: 'Delivered' },
];

const formatDate = (ts: any): string => {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

export const TrackOrderPage: React.FC<TrackOrderPageProps> = ({ currentRoute }) => {
  const { currentUser } = useAuth();
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  const performTrack = async (num: string, fallbackId?: string) => {
    const targetNum = (num || '').trim();
    const targetId = (fallbackId || '').trim();
    if (!targetNum && !targetId) return;

    setLoading(true);
    setError('');
    try {
      let res = targetNum ? await orderService.trackOrder(targetNum) : null;
      if (!res && targetId) {
        res = await orderService.getOrderById(targetId);
      }
      if (res) {
        setOrder(res);
        setOrderNumber(res.orderNumber || targetNum);
      } else {
        setOrder(null);
        setError('No order found matching that Order Number. Please check and try again.');
      }
    } catch {
      setError('Unable to load order details right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const url = new URL(window.location.origin + currentRoute);
    const paramNum =
      url.searchParams.get('number') ||
      url.searchParams.get('order') ||
      url.searchParams.get('orderId') ||
      '';
    const paramId = url.searchParams.get('id') || '';
    const hashNum = url.hash ? url.hash.split('&')[0].trim() : '';
    const resolvedNum = (paramNum || hashNum).trim();

    if (resolvedNum || paramId) {
      if (resolvedNum) setOrderNumber(resolvedNum);
      performTrack(resolvedNum, paramId);
    }
  }, [currentRoute]);

  useEffect(() => {
    if (!currentUser) {
      setRecentOrders([]);
      return;
    }
    orderService
      .getCustomerOrders(currentUser.uid, currentUser.email || undefined)
      .then((list) => setRecentOrders(list.slice(0, 4)))
      .catch(() => setRecentOrders([]));
  }, [currentUser]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) {
      setError('Please enter your Order Number.');
      return;
    }
    performTrack(orderNumber);
  };

  const statusOrder: OrderStatus[] = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered'];
  const currentStepIndex = order ? statusOrder.indexOf(order.orderStatus) : -1;

  const getStatusLabel = (status: OrderStatus) => {
    const map: Record<string, string> = {
      pending: 'Order Placed',
      confirmed: 'Confirmed',
      processing: 'Processing',
      packed: 'Packed',
      shipped: 'In Transit',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
      returned: 'Returned',
    };
    return map[status] || status;
  };

  const getStatusDotColor = (status: OrderStatus) => {
    if (status === 'delivered') return 'bg-emerald-500';
    if (status === 'cancelled' || status === 'returned') return 'bg-red-500';
    if (status === 'pending') return 'bg-amber-500';
    return 'bg-neutral-900';
  };

  const paymentMethodLabel = order
    ? order.paymentMethod === 'cod'
      ? 'Cash on Delivery'
      : order.paymentMethod.toUpperCase()
    : '';

  return (
    <div className="min-h-[75vh] bg-[#f4f4f6] py-10 sm:py-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-7 sm:mb-9">
          <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-900 tracking-tight">
            Track Your Order
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1.5">
            Enter your order number to check live delivery progress.
          </p>
        </div>

        {/* Lookup Bar */}
        <div className="bg-white border border-neutral-200/80 rounded-lg p-4 sm:p-5 mb-6">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex-1">
                <FloatingInput
                  label="Order Number"
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. #102948"
                  className="font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="h-12 px-7 bg-neutral-900 text-white text-xs font-medium uppercase tracking-wider rounded-[6px] hover:bg-black transition-colors cursor-pointer flex items-center justify-center gap-2 shrink-0 disabled:opacity-60"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{loading ? 'Tracking...' : 'Track'}</span>
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-600 pt-1">
                {error}
              </p>
            )}
          </form>

          {recentOrders.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-neutral-100 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-neutral-400 mr-1">Recent orders:</span>
              {recentOrders.map((ro) => (
                <button
                  key={ro.id}
                  type="button"
                  onClick={() => {
                    setOrderNumber(ro.orderNumber);
                    performTrack(ro.orderNumber, ro.id);
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer border ${
                    order?.id === ro.id
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-400'
                  }`}
                >
                  {ro.orderNumber}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Order Status Card */}
        {order && (
          <div className="bg-white border border-neutral-200/80 rounded-lg divide-y divide-neutral-100 animate-fade-in">
            {/* Top Summary Row */}
            <div className="p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg sm:text-xl font-semibold text-neutral-900 font-mono">
                    {order.orderNumber}
                  </h2>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700">
                    <span className={`w-2 h-2 rounded-full ${getStatusDotColor(order.orderStatus)}`} />
                    {getStatusLabel(order.orderStatus)}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {formatDate(order.createdAt) ? `Placed ${formatDate(order.createdAt)} · ` : ''}
                  {order.customerName}, {order.shippingAddress.district}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsInvoiceOpen(true)}
                className="self-start sm:self-auto px-3.5 py-2 border border-neutral-200 hover:border-neutral-400 text-neutral-800 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-neutral-500" />
                <span>Invoice</span>
              </button>
            </div>

            {/* Minimal Progress Stepper */}
            <div className="p-5 sm:p-7">
              {order.orderStatus === 'cancelled' || order.orderStatus === 'returned' ? (
                <div className="p-3.5 bg-red-50/70 border border-red-100 rounded-md text-xs text-red-700 flex items-center gap-2.5">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    This order has been {order.orderStatus}. Please reach out to support for assistance.
                  </span>
                </div>
              ) : (
                <>
                  {/* Desktop Connected Stepper */}
                  <div className="hidden sm:block relative py-2">
                    <div className="absolute top-6 left-[8%] right-[8%] h-[1.5px] bg-neutral-200" />
                    <div
                      className="absolute top-6 left-[8%] h-[1.5px] bg-neutral-900 transition-all duration-300"
                      style={{
                        width:
                          currentStepIndex <= 0
                            ? '0%'
                            : `${(Math.min(currentStepIndex, ORDER_STEPS.length - 1) / (ORDER_STEPS.length - 1)) * 84}%`,
                      }}
                    />
                    <div className="relative grid grid-cols-6 gap-2">
                      {ORDER_STEPS.map((step, idx) => {
                        const isCompleted = idx < currentStepIndex;
                        const isCurrent = idx === currentStepIndex;
                        const isUpcoming = idx > currentStepIndex;

                        return (
                          <div key={step.status} className="flex flex-col items-center text-center">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                                isCompleted || isCurrent
                                  ? 'bg-neutral-900 text-white'
                                  : 'bg-white border border-neutral-300 text-neutral-400'
                              } ${isCurrent ? 'ring-4 ring-neutral-900/10' : ''}`}
                            >
                              {isCompleted ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                            </div>
                            <span
                              className={`mt-2.5 text-xs ${
                                isUpcoming
                                  ? 'text-neutral-400 font-normal'
                                  : isCurrent
                                  ? 'text-neutral-900 font-semibold'
                                  : 'text-neutral-700 font-medium'
                              }`}
                            >
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mobile Vertical Stepper */}
                  <div className="sm:hidden space-y-3">
                    {ORDER_STEPS.map((step, idx) => {
                      const isCompleted = idx < currentStepIndex;
                      const isCurrent = idx === currentStepIndex;
                      const isUpcoming = idx > currentStepIndex;

                      return (
                        <div key={step.status} className="flex items-center gap-3">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0 ${
                              isCompleted || isCurrent
                                ? 'bg-neutral-900 text-white'
                                : 'bg-white border border-neutral-300 text-neutral-400'
                            }`}
                          >
                            {isCompleted ? <Check className="w-3 h-3" /> : idx + 1}
                          </div>
                          <span
                            className={`text-xs ${
                              isUpcoming
                                ? 'text-neutral-400'
                                : isCurrent
                                ? 'text-neutral-900 font-semibold'
                                : 'text-neutral-700 font-medium'
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Delivery & Payment Meta */}
            <div className="p-5 sm:p-7 grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
              <div>
                <span className="text-neutral-400 block mb-1">Delivery Address</span>
                <p className="text-neutral-800 leading-relaxed">
                  {order.shippingAddress.address}, {order.shippingAddress.district}, {order.shippingAddress.division}
                </p>
              </div>
              <div>
                <span className="text-neutral-400 block mb-1">Payment</span>
                <p className="text-neutral-900 font-medium">
                  {paymentMethodLabel}
                </p>
                <p className="text-neutral-500 mt-0.5 capitalize">
                  Status: {order.paymentStatus}
                  {order.paymentDetails?.transactionId ? ` · ${order.paymentDetails.transactionId}` : ''}
                </p>
              </div>
              <div className="sm:text-right">
                <span className="text-neutral-400 block mb-1">Order Total</span>
                <p className="text-sm font-semibold text-neutral-900 tabular-nums">
                  ৳{order.total.toLocaleString('en-BD')}
                </p>
                {order.paymentMethod === 'cod' && (
                  <p className="text-neutral-500 mt-0.5 tabular-nums">
                    Due on delivery: ৳{(order.dueOnDelivery ?? Math.max(0, order.subtotal - order.discount)).toLocaleString('en-BD')}
                  </p>
                )}
              </div>
            </div>

            {/* Ordered Items */}
            <div className="p-5 sm:p-7">
              <h3 className="text-xs font-medium text-neutral-500 mb-3">
                Items ({order.items.length})
              </h3>
              <div className="divide-y divide-neutral-100">
                {order.items.map((item, i) => (
                  <div key={i} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.productImage || '/assets/aistudio/selvee1_8ff37f5b.jpg'}
                        alt={item.productName}
                        className="w-10 h-12 object-cover rounded bg-neutral-50 border border-neutral-200/70 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 truncate">{item.productName}</p>
                        <p className="text-neutral-500 mt-0.5">
                          {item.size} · {item.color} · Qty {item.quantity}
                        </p>
                      </div>
                    </div>
                    <span className="text-neutral-900 font-medium tabular-nums shrink-0">
                      ৳{item.totalPrice.toLocaleString('en-BD')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Log */}
            {order.timeline && order.timeline.length > 0 && (
              <div className="p-5 sm:p-7">
                <h3 className="text-xs font-medium text-neutral-500 mb-3">Updates</h3>
                <div className="space-y-2.5">
                  {order.timeline.map((entry, i) => (
                    <div key={i} className="flex items-start justify-between gap-4 text-xs">
                      <div className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 mt-1.5 shrink-0" />
                        <div>
                          <span className="font-medium text-neutral-900 capitalize">
                            {getStatusLabel(entry.status)}
                          </span>
                          {entry.note && (
                            <p className="text-neutral-500 mt-0.5">{entry.note}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-neutral-400 text-[11px] shrink-0 tabular-nums">
                        {formatDate(entry.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* A4 Invoice Modal */}
      {order && (
        <A4InvoiceModal
          order={order}
          isOpen={isInvoiceOpen}
          onClose={() => setIsInvoiceOpen(false)}
        />
      )}
    </div>
  );
};
