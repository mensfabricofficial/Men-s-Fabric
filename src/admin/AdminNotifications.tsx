import React, { useState, useEffect } from 'react';
import {
  Bell,
  Send,
  Tag,
  Megaphone,
  Package,
  Ticket,
  Users,
  UserCheck,
  CheckCircle,
  Search,
  Sparkles,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppNotification, CustomerProfile, NotificationType } from '../types';
import { notificationService } from '../services/notificationService';
import { orderService } from '../services/orderService';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../lib/dateFormat';
import { AdminPageHeader } from './AdminLayout';

interface TargetCustomer {
  key: string;
  uid: string;
  name: string;
  email: string;
  phone: string;
}

export const AdminNotifications: React.FC = () => {
  const { currentUser } = useAuth();
  const [history, setHistory] = useState<AppNotification[]>([]);
  const [customers, setCustomers] = useState<TargetCustomer[]>([]);

  // Composer State
  const [notifType, setNotifType] = useState<NotificationType>('offer');
  const [audience, setAudience] = useState<'all' | 'customer'>('all');
  const [selectedCustomerKey, setSelectedCustomerKey] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [manualPhoneOrOrder, setManualPhoneOrOrder] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [actionUrl, setActionUrl] = useState('/shop');
  const [important, setImportant] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsub = notificationService.subscribeToAllNotifications((list) => {
      setHistory(list);
    });

    const loadCustomers = async () => {
      const map = new Map<string, TargetCustomer>();
      const add = (uid: string, name: string, email: string, phone: string) => {
        const key = (email || phone || uid || '').trim().toLowerCase();
        if (!key) return;
        const prev = map.get(key);
        if (prev) {
          if (!prev.name && name) prev.name = name;
          if (!prev.email && email) prev.email = email;
          if (!prev.phone && phone) prev.phone = phone;
        } else {
          map.set(key, { key, uid: uid || '', name: name || 'Customer', email: email || '', phone: phone || '' });
        }
      };

      try {
        const snap = await getDocs(collection(db, 'users'));
        snap.forEach((d) => {
          const c = d.data() as CustomerProfile;
          add(d.id, c.name, c.email, c.phone || '');
        });
      } catch {
        // ignore
      }

      try {
        const orders = await orderService.getAllOrdersAdmin();
        orders.forEach((o) => {
          add(
            o.customerId && o.customerId !== 'guest' ? o.customerId : '',
            o.customerName,
            o.customerEmail || o.shippingAddress?.email || '',
            o.customerPhone || o.shippingAddress?.phone || ''
          );
        });
      } catch {
        // ignore
      }

      setCustomers(Array.from(map.values()));
    };

    loadCustomers();
    return () => unsub();
  }, []);

  const applyTemplate = (tpl: 'flash' | 'new_drop' | 'free_delivery') => {
    if (tpl === 'flash') {
      setNotifType('offer');
      setAudience('all');
      setTitle('Flash Offer Live Now — Limited Time');
      setMessage('Save up to 20% on selected Panjabis, shirts & new arrivals today. Order now before stock runs out!');
      setActionUrl('/shop');
      setImportant(true);
    } else if (tpl === 'new_drop') {
      setNotifType('announcement');
      setAudience('all');
      setTitle('New Collection Just Dropped');
      setMessage('Explore our newest breathable pure cotton garments tailored for distinction.');
      setActionUrl('/shop?filter=new');
      setImportant(false);
    } else {
      setNotifType('coupon');
      setAudience('all');
      setTitle('Free Delivery Weekend');
      setMessage('Enjoy FREE nationwide delivery on your Selvee order today. Shop our latest arrivals now!');
      setActionUrl('/shop');
      setImportant(true);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSending(true);

    try {
      const picked = customers.find((c) => c.key === selectedCustomerKey);
      const rawManual = manualPhoneOrOrder.trim();
      const isOrderNum = rawManual.startsWith('#') || rawManual.toUpperCase().startsWith('MF-');

      await notificationService.publishNotification({
        type: notifType,
        title: title.trim(),
        message: message.trim(),
        audience,
        targetUid: audience === 'customer' && picked?.uid && !picked.uid.startsWith('guest-') ? picked.uid : undefined,
        targetEmail: audience === 'customer' ? picked?.email : undefined,
        targetPhone: audience === 'customer' ? picked?.phone || (!isOrderNum ? rawManual : undefined) : undefined,
        targetOrderNumber: audience === 'customer' && isOrderNum ? rawManual : undefined,
        couponCode: couponCode.trim() ? couponCode.trim().toUpperCase() : undefined,
        actionUrl: actionUrl.trim() || '/shop',
        important,
        createdBy: currentUser?.email || 'admin',
      });

      if (currentUser) {
        await settingsService.logAdminAction(
          currentUser.uid,
          currentUser.email || '',
          'SEND_NOTIFICATION',
          audience === 'all' ? 'All Customers' : picked?.name || rawManual || 'Customer',
          title.trim()
        );
      }

      setTitle('');
      setMessage('');
      setCouponCode('');
      setManualPhoneOrOrder('');
      setToast('Notification sent to customer mobile & app notification feed.');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSending(false);
    }
  };

  const q = customerSearch.trim().toLowerCase();
  const filteredCustomers = q
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      )
    : customers;

  return (
    <div className="space-y-6 max-w-6xl">
      <AdminPageHeader
        title="Browser Notifications"
        subtitle="Send real-time offers, promo codes & alerts to customers."
        actions={
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-900 shrink-0">
            <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
            <span>Order &amp; Coupon auto-notify live</span>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Broadcast Composer */}
        <form
          onSubmit={handleSend}
          className="lg:col-span-5 bg-white border border-neutral-200 rounded-xl p-5 sm:p-6 space-y-4 text-xs shadow-xs h-fit"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
              <Send className="w-4 h-4" />
              <span>Send New Alert</span>
            </h2>
          </div>

          {/* Quick Presets */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
              Quick Offer Templates
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyTemplate('flash')}
                className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 rounded text-[11px] font-semibold text-neutral-800 cursor-pointer flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" /> Flash Sale
              </button>
              <button
                type="button"
                onClick={() => applyTemplate('new_drop')}
                className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 rounded text-[11px] font-semibold text-neutral-800 cursor-pointer"
              >
                New Arrivals
              </button>
              <button
                type="button"
                onClick={() => applyTemplate('free_delivery')}
                className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 rounded text-[11px] font-semibold text-neutral-800 cursor-pointer"
              >
                Free Delivery
              </button>
            </div>
          </div>

          {/* Type & Audience */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Category</label>
              <select
                value={notifType}
                onChange={(e) => setNotifType(e.target.value as NotificationType)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-semibold"
              >
                <option value="offer">New Offer / Sale</option>
                <option value="announcement">Important Notice</option>
                <option value="coupon">Promo / Gift Code</option>
                <option value="order_status">Order Notice</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Audience</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as 'all' | 'customer')}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-semibold"
              >
                <option value="all">All Customers</option>
                <option value="customer">Specific Customer</option>
              </select>
            </div>
          </div>

          {audience === 'customer' && (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customer by name, phone, or email..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-neutral-300 rounded text-xs"
                />
              </div>
              <select
                value={selectedCustomerKey}
                onChange={(e) => setSelectedCustomerKey(e.target.value)}
                className="w-full px-2.5 py-2 bg-white border border-neutral-300 rounded text-xs"
              >
                <option value="">-- Pick from customer list --</option>
                {filteredCustomers.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name} {c.phone ? `— ${c.phone}` : ''} {c.email ? `(${c.email})` : ''}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={manualPhoneOrOrder}
                onChange={(e) => setManualPhoneOrOrder(e.target.value)}
                placeholder="Or enter Phone (017...) or Order # (#102948)"
                className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded text-xs font-mono"
              />
            </div>
          )}

          <div>
            <label className="block font-bold text-neutral-700 uppercase mb-1">Notification Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Eid Special 15% OFF on All Panjabis!"
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-semibold"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-700 uppercase mb-1">Message Body *</label>
            <textarea
              required
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write clear details customers will see in their mobile notification bar..."
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Promo Code (Optional)</label>
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="e.g. EID15"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono uppercase"
              />
            </div>
            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Tap Opens Page</label>
              <select
                value={actionUrl}
                onChange={(e) => setActionUrl(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
              >
                <option value="/shop">Shop Catalog (/shop)</option>
                <option value="/shop?filter=new">New Arrivals</option>
                <option value="/shop?filter=best">Best Sellers</option>
                <option value="/track-order">Track Order</option>
                <option value="/account">Customer Account</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer font-semibold text-neutral-800 pt-1">
            <input
              type="checkbox"
              checked={important}
              onChange={(e) => setImportant(e.target.checked)}
              className="accent-black w-4 h-4"
            />
            <span>High-Priority Alert (Persistent mobile notification)</span>
          </label>

          <button
            type="submit"
            disabled={sending}
            className="w-full py-2.5 bg-black text-white font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{sending ? 'Sending Notification...' : 'Publish Notification Now'}</span>
          </button>
        </form>

        {/* Right: Notification Feed Log */}
        <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs flex flex-col">
          <div className="px-5 py-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
              <Bell className="w-4 h-4" />
              <span>Dispatched Notifications ({history.length})</span>
            </h2>
          </div>

          <div className="divide-y divide-neutral-100 max-h-[600px] overflow-y-auto">
            {history.length === 0 ? (
              <div className="p-12 text-center text-neutral-500 text-xs">
                No notifications dispatched yet. Updates from orders, coupons, or custom offers will appear here.
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="p-4 hover:bg-neutral-50/70 transition-colors text-xs flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center shrink-0 mt-0.5">
                    {item.type === 'offer' ? (
                      <Tag className="w-4 h-4 text-neutral-800" />
                    ) : item.type === 'coupon' ? (
                      <Ticket className="w-4 h-4 text-emerald-700" />
                    ) : item.type === 'announcement' ? (
                      <Megaphone className="w-4 h-4 text-neutral-800" />
                    ) : (
                      <Package className="w-4 h-4 text-neutral-800" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-neutral-900 truncate">{item.title}</p>
                      <span className="text-[10px] text-neutral-400 shrink-0 tabular-nums">
                        {formatDateTime(item.createdAtMs || item.createdAt, 'Recent')}
                      </span>
                    </div>
                    <p className="text-neutral-600 mt-0.5 leading-relaxed">{item.message}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                          item.audience === 'authorized_devices'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-neutral-100 text-neutral-700'
                        }`}
                      >
                        {item.audience === 'authorized_devices' ? (
                          <>
                            <ShieldCheck className="w-3 h-3" /> Authorized Devices Only
                          </>
                        ) : item.audience === 'all' ? (
                          <>
                            <Users className="w-3 h-3" /> All Customers
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3 h-3" />{' '}
                            {item.targetOrderNumber || item.targetPhone || item.targetEmail || 'Customer'}
                          </>
                        )}
                      </span>
                      {item.couponCode && (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[10px] font-bold">
                          Code: {item.couponCode}
                        </span>
                      )}
                      {item.actionUrl && (
                        <span className="text-[10px] text-neutral-400 font-mono">{item.actionUrl}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-60 bg-black text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold border border-neutral-800 animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
};
