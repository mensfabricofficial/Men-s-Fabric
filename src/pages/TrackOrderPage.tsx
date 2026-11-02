import React, { useState, useEffect } from 'react';
import { Search, Package, CheckCircle2, Clock, Truck, ShieldAlert, ArrowRight } from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { orderService } from '../services/orderService';

interface TrackOrderPageProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

const ORDER_STEPS: { status: OrderStatus; label: string; desc: string }[] = [
  { status: 'pending', label: 'Order Placed', desc: 'Received and awaiting store confirmation' },
  { status: 'confirmed', label: 'Confirmed', desc: 'Verified and queued for packaging' },
  { status: 'processing', label: 'Processing', desc: 'Fabric inspection and tailoring check' },
  { status: 'packed', label: 'Packed', desc: 'Sealed with tamper-proof packaging' },
  { status: 'shipped', label: 'In Transit', desc: 'Handed over to courier partner' },
  { status: 'delivered', label: 'Delivered', desc: 'Successfully delivered to customer' },
];

export const TrackOrderPage: React.FC<TrackOrderPageProps> = ({ currentRoute, onNavigate }) => {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const url = new URL(window.location.origin + currentRoute);
    const num = url.searchParams.get('number');
    const ph = url.searchParams.get('phone');
    if (num && ph) {
      setOrderNumber(num);
      setPhone(ph);
      performTrack(num, ph);
    }
  }, [currentRoute]);

  const performTrack = async (num: string, ph: string) => {
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const res = await orderService.trackOrder(num, ph);
      if (res) {
        setOrder(res);
      } else {
        setOrder(null);
        setError('No order found matching the provided order number and phone number.');
      }
    } catch {
      setError('Unable to track order at this moment. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !phone.trim()) {
      setError('Please provide both Order Number and Mobile Number.');
      return;
    }
    performTrack(orderNumber, phone);
  };

  const getStepStatus = (stepStatus: OrderStatus) => {
    if (!order) return 'upcoming';
    const statusOrder: OrderStatus[] = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered'];
    const currentIndex = statusOrder.indexOf(order.orderStatus);
    const stepIndex = statusOrder.indexOf(stepStatus);

    if (order.orderStatus === 'cancelled') return 'cancelled';
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      
      {/* Page Title */}
      <div className="text-center max-w-xl mx-auto mb-10">
        <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Live Delivery Status</span>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight mt-1">
          Track Your Order
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-2">
          Enter your Order Number (e.g. MF-102948) and the mobile phone number used during checkout.
        </p>
      </div>

      {/* Lookup Form */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 shadow-xs mb-10 max-w-2xl mx-auto">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                Order Number
              </label>
              <input
                type="text"
                required
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                placeholder="e.g. MF-102948"
                className="w-full px-3.5 py-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full px-3.5 py-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-mono"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded border border-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-md"
          >
            <Search className="w-4 h-4" />
            <span>{loading ? 'Searching...' : 'Track Parcel'}</span>
          </button>
        </form>
      </div>

      {/* Order Status Display */}
      {order && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-8 animate-fade-in">
          
          {/* Header Info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-200 gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Order ID</span>
              <h3 className="text-xl font-extrabold text-neutral-900 font-mono">{order.orderNumber}</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Recipient: <b className="text-neutral-800">{order.customerName}</b> ({order.shippingAddress.district})
              </p>
            </div>
            <div className="sm:text-right">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Current Status</span>
              <div className="mt-0.5">
                <span className={`inline-block px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                  order.orderStatus === 'delivered'
                    ? 'bg-emerald-100 text-emerald-800'
                    : order.orderStatus === 'cancelled'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-black text-white'
                }`}>
                  {order.orderStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Stepper Timeline */}
          {order.orderStatus === 'cancelled' ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>This order has been cancelled. For inquiries or re-ordering, please reach out to our customer care.</span>
            </div>
          ) : (
            <div className="py-4">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {ORDER_STEPS.map((step, idx) => {
                  const state = getStepStatus(step.status);
                  return (
                    <div key={step.status} className="flex flex-col items-center text-center space-y-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                        state === 'completed'
                          ? 'bg-black text-white'
                          : state === 'current'
                          ? 'bg-black text-white ring-4 ring-neutral-300'
                          : 'bg-neutral-200 text-neutral-500'
                      }`}>
                        {state === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                      </div>
                      <p className={`text-xs font-bold uppercase tracking-wider ${
                        state === 'upcoming' ? 'text-neutral-400' : 'text-neutral-900'
                      }`}>
                        {step.label}
                      </p>
                      <p className="text-[10px] text-neutral-500 hidden md:block">
                        {step.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detailed Timeline notes */}
          {order.timeline && order.timeline.length > 0 && (
            <div className="border-t border-neutral-200 pt-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">Activity Log</h4>
              <div className="space-y-2.5">
                {order.timeline.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs">
                    <div className="w-2 h-2 rounded-full bg-black mt-1.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-neutral-900 uppercase text-[11px] mr-2">
                        {entry.status}
                      </span>
                      <span className="text-neutral-500 text-[11px]">
                        {new Date(entry.timestamp).toLocaleString('en-BD')}
                      </span>
                      {entry.note && (
                        <p className="text-neutral-600 mt-0.5">{entry.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items Summary in tracked order */}
          <div className="border-t border-neutral-200 pt-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">
              Order Contents ({order.items.length} items)
            </h4>
            <div className="divide-y divide-neutral-200">
              {order.items.map((item, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <img
                      src={item.productImage || '/logo.jpg'}
                      alt={item.productName}
                      className="w-10 h-12 object-cover rounded bg-white border border-neutral-200"
                    />
                    <div>
                      <p className="font-semibold text-neutral-900">{item.productName}</p>
                      <p className="text-[11px] text-neutral-500">Size: {item.size} • Color: {item.color}</p>
                    </div>
                  </div>
                  <span className="text-neutral-700 font-medium">Qty: {item.quantity}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
