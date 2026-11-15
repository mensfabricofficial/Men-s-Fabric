import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Mail, 
  Phone, 
  ShoppingBag, 
  Search, 
  DollarSign, 
  MapPin, 
  UserCheck, 
  RefreshCw,
  Truck,
  X,
  CheckCircle2
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Coupon, CustomerProfile, Order } from '../types';
import { orderService } from '../services/orderService';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../lib/dateFormat';

interface AggregatedCustomer {
  uid: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  joinedDate?: string;
  isRegisteredUser: boolean;
  orderCount: number;
  totalSpent: number;
  orders: Order[];
}

export const AdminCustomers: React.FC = () => {
  const { currentUser } = useAuth();
  const [customers, setCustomers] = useState<AggregatedCustomer[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<AggregatedCustomer | null>(null);

  // One-Time Free Delivery Modal State
  const [giftCustomer, setGiftCustomer] = useState<AggregatedCustomer | null>(null);
  const [giftCode, setGiftCode] = useState('');
  const [giftMinOrder, setGiftMinOrder] = useState(0);
  const [giftExpiry, setGiftExpiry] = useState('2028-12-31');
  const [giftAutoApply, setGiftAutoApply] = useState(true);
  const [grantingGift, setGrantingGift] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const fetchCustomerDirectory = async () => {
    setLoading(true);
    try {
      // 1. Load registered customers from local storage
      const localRegisteredMap = new Map<string, Partial<CustomerProfile>>();
      try {
        const rawLocal = localStorage.getItem('mf_registered_customers_v1');
        if (rawLocal) {
          const parsed = JSON.parse(rawLocal);
          if (Array.isArray(parsed)) {
            parsed.forEach((c: any) => {
              if (c.uid || c.email || c.phone) {
                const key = c.uid || c.email?.toLowerCase() || c.phone;
                localRegisteredMap.set(key, c);
              }
            });
          }
        }
      } catch {
        // ignore
      }

      // 2. Load users collection from Firestore (with try/catch fallback)
      const firestoreUsersMap = new Map<string, Partial<CustomerProfile>>();
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        usersSnap.forEach((d) => {
          const data = d.data() as CustomerProfile;
          const key = d.id || data.email?.toLowerCase() || data.phone || '';
          if (key) {
            firestoreUsersMap.set(key, { ...data, uid: d.id });
          }
        });
      } catch (err) {
        console.warn('Firestore users collection fetch notice:', err);
      }

      // 3. Load all orders from orderService (both Firestore + local orders catalog)
      let allOrders: Order[] = [];
      try {
        allOrders = await orderService.getAllOrdersAdmin();
      } catch (err) {
        console.warn('Order service load notice:', err);
      }

      // 4. Combine all sources into unified customer records
      const customerMap = new Map<string, AggregatedCustomer>();

      // A. Populate from Firestore users
      firestoreUsersMap.forEach((user, key) => {
        const uid = user.uid || key;
        const email = user.email || '';
        const phone = user.phone || '';
        const name = user.name || 'Customer';
        const identifier = (email || phone || uid).toLowerCase();

        customerMap.set(identifier, {
          uid,
          name,
          email,
          phone,
          address: user.address,
          city: user.city,
          joinedDate: formatDateTime((user as any).createdAt, 'Registered User'),
          isRegisteredUser: true,
          orderCount: 0,
          totalSpent: 0,
          orders: [],
        });
      });

      // B. Populate from Local registered users
      localRegisteredMap.forEach((user, key) => {
        const uid = user.uid || key;
        const email = user.email || '';
        const phone = user.phone || '';
        const name = user.name || 'Customer';
        const identifier = (email || phone || uid).toLowerCase();

        const existing = customerMap.get(identifier);
        if (existing) {
          existing.name = existing.name || name;
          existing.email = existing.email || email;
          existing.phone = existing.phone || phone;
          existing.address = existing.address || user.address;
          existing.city = existing.city || user.city;
          if ((!existing.joinedDate || existing.joinedDate === 'Registered User') && (user as any).createdAt) {
            existing.joinedDate = formatDateTime((user as any).createdAt, existing.joinedDate);
          }
        } else {
          customerMap.set(identifier, {
            uid,
            name,
            email,
            phone,
            address: user.address,
            city: user.city,
            joinedDate: formatDateTime((user as any).createdAt, 'Registered User'),
            isRegisteredUser: true,
            orderCount: 0,
            totalSpent: 0,
            orders: [],
          });
        }
      });

      // C. Extract customers from all placed orders
      allOrders.forEach((o) => {
        const email = o.customerEmail || o.shippingAddress?.email || '';
        const phone = o.customerPhone || o.shippingAddress?.phone || '';
        const uid = o.customerId && o.customerId !== 'guest' ? o.customerId : '';
        const name = o.customerName || o.shippingAddress?.fullName || 'Customer';
        
        // Find match in map
        let matchedKey = '';
        if (email && customerMap.has(email.toLowerCase())) {
          matchedKey = email.toLowerCase();
        } else if (phone && customerMap.has(phone)) {
          matchedKey = phone;
        } else if (uid && customerMap.has(uid.toLowerCase())) {
          matchedKey = uid.toLowerCase();
        }

        if (matchedKey) {
          const rec = customerMap.get(matchedKey)!;
          rec.orders.push(o);
          rec.orderCount += 1;
          rec.totalSpent += (o.total || 0);
          if (!rec.address && o.shippingAddress?.address) {
            rec.address = o.shippingAddress.address;
          }
          if (!rec.city && (o.shippingAddress?.district || o.shippingAddress?.division)) {
            rec.city = `${o.shippingAddress?.district || ''}, ${o.shippingAddress?.division || ''}`;
          }
        } else {
          // Create new record for buyer
          const newIdentifier = (email || phone || uid || `buyer-${o.id}`).toLowerCase();
          customerMap.set(newIdentifier, {
            uid: uid || `guest-${Date.now()}`,
            name,
            email,
            phone,
            address: o.shippingAddress?.address,
            city: `${o.shippingAddress?.district || ''}, ${o.shippingAddress?.division || ''}`,
            joinedDate: formatDateTime(o.createdAt, 'First Order'),
            isRegisteredUser: Boolean(uid && uid !== 'guest'),
            orderCount: 1,
            totalSpent: o.total || 0,
            orders: [o],
          });
        }
      });

      // Sort customers by highest spenders / most orders
      const list = Array.from(customerMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);
      setCustomers(list);
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerDirectory();
    const unsub = settingsService.subscribeToCoupons((list) => setCoupons(list));
    return () => unsub();
  }, []);

  const getCustomerFreeDeliveryCoupon = (c: AggregatedCustomer): Coupon | undefined => {
    return coupons.find((cpn) => {
      if (cpn.discountType !== 'free_delivery') return false;
      const hasTarget = Boolean(
        (cpn.targetCustomerUid && !cpn.targetCustomerUid.startsWith('guest-')) ||
        cpn.targetCustomerEmail ||
        cpn.targetCustomerPhone
      );
      if (!hasTarget) return false;
      return (
        settingsService.isCouponValidForUse(cpn) &&
        settingsService.doesCouponMatchCustomer(cpn, {
          uid: c.uid,
          email: c.email,
          phone: c.phone,
        })
      );
    });
  };

  const openFreeDeliveryModal = (customer: AggregatedCustomer) => {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    setGiftCustomer(customer);
    setGiftCode(`FREEDEL-${rand}`);
    setGiftMinOrder(0);
    setGiftExpiry('2028-12-31');
    setGiftAutoApply(true);
  };

  const handleGrantFreeDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!giftCustomer) return;
    const cleanCode = giftCode.trim().toUpperCase();
    if (!cleanCode) return;

    setGrantingGift(true);
    try {
      await settingsService.createCoupon({
        code: cleanCode,
        discountType: 'free_delivery',
        discountAmount: 0,
        minOrderAmount: Number(giftMinOrder) || 0,
        expiryDate: giftExpiry,
        usageLimit: 1,
        active: true,
        targetCustomerUid:
          giftCustomer.uid && !giftCustomer.uid.startsWith('guest-') ? giftCustomer.uid : undefined,
        targetCustomerEmail: giftCustomer.email || undefined,
        targetCustomerPhone: giftCustomer.phone || undefined,
        targetCustomerName: giftCustomer.name || 'Customer',
        autoApply: giftAutoApply,
      });

      if (currentUser) {
        await settingsService.logAdminAction(
          currentUser.uid,
          currentUser.email || 'admin',
          'GRANT_FREE_DELIVERY',
          giftCustomer.name,
          `Granted 1-time Free Delivery (${cleanCode}) to ${giftCustomer.email || giftCustomer.phone}`
        );
      }

      showToast(`1x Free Delivery (${cleanCode}) granted to ${giftCustomer.name}!`);
      setGiftCustomer(null);
    } catch (err) {
      console.error('Failed to grant free delivery:', err);
      showToast('Failed to assign Free Delivery pass.');
    } finally {
      setGrantingGift(false);
    }
  };

  const handleRevokeFreeDelivery = async (coupon: Coupon, customerName: string) => {
    await settingsService.deleteCoupon(coupon.id);
    showToast(`Revoked Free Delivery (${coupon.code}) from ${customerName}.`);
  };

  // Filter customers by search term
  const filteredCustomers = customers.filter((c) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.city && c.city.toLowerCase().includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q))
    );
  });

  const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
  const totalOrdersCount = customers.reduce((sum, c) => sum + c.orderCount, 0);

  return (
    <div className="space-y-6">
      
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Customer Directory
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Real registered customer accounts, profiles, and order histories.
          </p>
        </div>

        <button
          onClick={fetchCustomerDirectory}
          disabled={loading}
          className="px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-2 cursor-pointer w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 sm:p-5 bg-white border border-neutral-200 rounded-xl shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Total Customers</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-700">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-neutral-900">{customers.length}</p>
          <p className="text-[11px] text-neutral-400">Registered users & verified buyers</p>
        </div>

        <div className="p-4 sm:p-5 bg-white border border-neutral-200 rounded-xl shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Orders Placed</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-700">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-neutral-900">{totalOrdersCount}</p>
          <p className="text-[11px] text-neutral-400">Total customer orders recorded</p>
        </div>

        <div className="p-4 sm:p-5 bg-white border border-neutral-200 rounded-xl shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Customer Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-700">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-neutral-900">৳{totalRevenue.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-neutral-400">Gross spend from customer base</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search customers by name, phone (017...), email, or city..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all shadow-xs"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-black font-semibold cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Customer List Container */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-neutral-500 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-neutral-400" />
            <p>Loading registered accounts and buyer profiles...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <Users className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">
              {searchTerm ? 'No matching customers found' : 'No customers registered yet'}
            </h4>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              {searchTerm
                ? 'Try searching with a different mobile number or name.'
                : 'Customer accounts will automatically populate here as users sign up or place orders.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View (Hidden on mobile) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                  <tr>
                    <th className="p-3.5">Customer Name</th>
                    <th className="p-3.5">Contact Details</th>
                    <th className="p-3.5">Type</th>
                    <th className="p-3.5">Orders</th>
                    <th className="p-3.5">Total Spent</th>
                    <th className="p-3.5">Location</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium">
                  {filteredCustomers.map((c, idx) => {
                    const activeFreeDelivery = getCustomerFreeDeliveryCoupon(c);
                    return (
                      <tr key={`${c.uid}-${c.phone}-${idx}`} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="p-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                              {c.name ? c.name.charAt(0) : 'C'}
                            </div>
                            <div>
                              <p className="font-bold text-neutral-900">{c.name}</p>
                              <p className="text-[11px] text-neutral-400">{c.joinedDate || 'Customer'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          {c.phone && (
                            <a
                              href={`tel:${c.phone}`}
                              className="font-mono text-neutral-900 font-semibold hover:underline block"
                            >
                              {c.phone}
                            </a>
                          )}
                          {c.email && (
                            <a
                              href={`mailto:${c.email}`}
                              className="text-neutral-500 text-[11px] hover:underline block"
                            >
                              {c.email}
                            </a>
                          )}
                        </td>
                        <td className="p-3.5">
                          {c.isRegisteredUser ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-white uppercase tracking-wider">
                              <UserCheck className="w-3 h-3" />
                              <span>Registered</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600 uppercase tracking-wider">
                              <span>Guest Buyer</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-neutral-900">{c.orderCount}</span>
                          <span className="text-neutral-500 ml-1">orders</span>
                        </td>
                        <td className="p-3.5 font-bold text-neutral-900 font-mono">
                          ৳{c.totalSpent.toLocaleString('en-BD')}
                        </td>
                        <td className="p-3.5 text-neutral-600 max-w-xs truncate">
                          {c.city || c.address || '—'}
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                            {activeFreeDelivery ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                                <Truck className="w-3 h-3 text-emerald-600" />
                                <span>{activeFreeDelivery.code}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRevokeFreeDelivery(activeFreeDelivery, c.name)}
                                  title="Revoke 1-time Free Delivery"
                                  className="ml-1 text-red-600 hover:text-red-800 cursor-pointer"
                                >
                                  ✕
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openFreeDeliveryModal(c)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider bg-black text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                              >
                                <Truck className="w-3 h-3" />
                                <span>Free Delivery</span>
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedCustomer(c)}
                              className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border border-neutral-300 rounded hover:bg-neutral-100 transition-colors cursor-pointer"
                            >
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (100% Mobile Responsive) */}
            <div className="md:hidden divide-y divide-neutral-100">
              {filteredCustomers.map((c, idx) => {
                const activeFreeDelivery = getCustomerFreeDeliveryCoupon(c);
                return (
                  <div key={`m-${c.uid}-${c.phone}-${idx}`} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                          {c.name ? c.name.charAt(0) : 'C'}
                        </div>
                        <div>
                          <h4 className="font-bold text-neutral-900 text-sm leading-tight">{c.name}</h4>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 inline-block ${
                            c.isRegisteredUser ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {c.isRegisteredUser ? 'Registered User' : 'Buyer'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-extrabold text-neutral-900 font-mono block">
                          ৳{c.totalSpent.toLocaleString('en-BD')}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-medium">
                          {c.orderCount} {c.orderCount === 1 ? 'order' : 'orders'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-neutral-50 rounded-lg p-2.5 text-xs space-y-1">
                      {c.phone && (
                        <div className="flex items-center gap-2 text-neutral-700">
                          <Phone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <a href={`tel:${c.phone}`} className="font-mono font-semibold text-neutral-900 hover:underline">
                            {c.phone}
                          </a>
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-2 text-neutral-700">
                          <Mail className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="text-neutral-600 truncate">{c.email}</span>
                        </div>
                      )}
                      {(c.address || c.city) && (
                        <div className="flex items-center gap-2 text-neutral-700">
                          <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="text-neutral-600 truncate">{c.address || c.city}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                      <span className="text-[10px] text-neutral-400 font-medium">
                        Joined: {c.joinedDate || 'Recently'}
                      </span>
                      <div className="flex items-center gap-2">
                        {activeFreeDelivery ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold uppercase">
                            <Truck className="w-3 h-3 text-emerald-600" />
                            <span>{activeFreeDelivery.code}</span>
                            <button
                              type="button"
                              onClick={() => handleRevokeFreeDelivery(activeFreeDelivery, c.name)}
                              className="ml-1 text-red-600 font-bold cursor-pointer"
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openFreeDeliveryModal(c)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-700 text-white text-[11px] font-bold uppercase tracking-wider rounded-lg cursor-pointer"
                          >
                            <Truck className="w-3 h-3" />
                            <span>Free Delivery</span>
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedCustomer(c)}
                          className="px-3 py-1.5 bg-black text-white text-[11px] font-bold uppercase tracking-wider rounded-lg cursor-pointer"
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Customer Detail Drawer / Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 text-xs animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs uppercase">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-tight text-neutral-900">
                    {selectedCustomer.name}
                  </h3>
                  <span className="text-[10px] text-neutral-400">
                    {selectedCustomer.isRegisteredUser ? 'Registered Customer Account' : 'Guest Buyer Profile'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-1 text-neutral-400 hover:text-black rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Profile Information */}
            <div className="bg-neutral-50 rounded-xl p-4 space-y-2 border border-neutral-200">
              <div className="flex justify-between">
                <span className="text-neutral-500 font-medium">Customer ID:</span>
                <span className="font-mono font-bold text-neutral-800 text-[11px] truncate max-w-[200px]">
                  {selectedCustomer.uid}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 font-medium">Phone:</span>
                <span className="font-mono font-bold text-neutral-900">{selectedCustomer.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 font-medium">Email:</span>
                <span className="font-medium text-neutral-800">{selectedCustomer.email || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 font-medium">Location:</span>
                <span className="font-medium text-neutral-800">{selectedCustomer.city || selectedCustomer.address || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 font-medium">Account Created:</span>
                <span className="font-mono font-medium text-neutral-800 tabular-nums">
                  {selectedCustomer.joinedDate || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-neutral-200">
                <span className="text-neutral-700 font-bold">Total Lifetime Spend:</span>
                <span className="font-mono font-extrabold text-neutral-900">৳{selectedCustomer.totalSpent.toLocaleString('en-BD')}</span>
              </div>
            </div>

            {/* Order History */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3 flex items-center justify-between">
                <span>Orders History ({selectedCustomer.orders.length})</span>
              </h4>
              {selectedCustomer.orders.length === 0 ? (
                <div className="p-6 text-center text-neutral-400 bg-neutral-50 rounded-xl border border-neutral-200">
                  <ShoppingBag className="w-6 h-6 mx-auto mb-1 text-neutral-300" />
                  <p>No orders placed yet with this account.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {selectedCustomer.orders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-3 bg-white border border-neutral-200 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-neutral-900">{ord.orderNumber || ord.id.slice(0, 8)}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                            ord.orderStatus === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ord.orderStatus === 'shipped'
                              ? 'bg-blue-100 text-blue-800'
                              : ord.orderStatus === 'cancelled'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {ord.orderStatus}
                          </span>
                        </div>
                        <p className="text-[10px] text-neutral-400 mt-0.5 tabular-nums">
                          {formatDateTime(ord.createdAt, 'Order')} • {ord.items?.length || 0} items
                        </p>
                      </div>
                      <span className="font-mono font-bold text-neutral-900">
                        ৳{ord.total?.toLocaleString('en-BD')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* One-Time Free Delivery Action Bar in Detail Modal */}
            <div className="p-3.5 rounded-xl border border-neutral-200 bg-white flex items-center justify-between gap-3">
              {(() => {
                const activePass = getCustomerFreeDeliveryCoupon(selectedCustomer);
                if (activePass) {
                  return (
                    <>
                      <div className="flex items-center gap-2 text-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <p className="font-bold text-xs">Active 1x Free Delivery Pass: <span className="font-mono">{activePass.code}</span></p>
                          <p className="text-[10px] text-emerald-700">
                            {activePass.autoApply !== false ? 'Auto-applies on next checkout' : 'Requires coupon code'} • Single use
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevokeFreeDelivery(activePass, selectedCustomer.name)}
                        className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-[11px] font-bold uppercase cursor-pointer hover:bg-red-100"
                      >
                        Revoke
                      </button>
                    </>
                  );
                }
                return (
                  <>
                    <div>
                      <p className="font-bold text-neutral-900">One-Time Free Delivery</p>
                      <p className="text-[10px] text-neutral-500">Grant this user 1 free delivery order</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedCustomer;
                        setSelectedCustomer(null);
                        openFreeDeliveryModal(target);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-black text-white rounded-lg text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:bg-neutral-800"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>Give Free Delivery</span>
                    </button>
                  </>
                );
              })()}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="px-5 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grant One-Time Free Delivery Modal */}
      {giftCustomer && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs animate-fade-in">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-black" />
                <h3 className="text-sm font-extrabold uppercase tracking-tight text-neutral-900">
                  Grant 1x Free Delivery
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGiftCustomer(null)}
                className="text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1">
              <p className="font-bold text-neutral-900 text-sm">{giftCustomer.name}</p>
              {giftCustomer.email && <p className="text-neutral-600">{giftCustomer.email}</p>}
              {giftCustomer.phone && <p className="font-mono text-neutral-700">{giftCustomer.phone}</p>}
            </div>

            <form onSubmit={handleGrantFreeDelivery} className="space-y-4">
              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">One-Time Voucher Code *</label>
                <input
                  type="text"
                  required
                  value={giftCode}
                  onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono uppercase"
                />
                <p className="text-[10px] text-neutral-400 mt-1">
                  Locked exclusively to this customer with usage limit = 1.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Min Order (৳)</label>
                  <input
                    type="number"
                    min={0}
                    value={giftMinOrder}
                    onChange={(e) => setGiftMinOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={giftExpiry}
                    onChange={(e) => setGiftExpiry(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={giftAutoApply}
                  onChange={(e) => setGiftAutoApply(e.target.checked)}
                  className="accent-black w-4 h-4 mt-0.5"
                />
                <div>
                  <span className="font-bold text-emerald-950 block">Auto-apply at Checkout (Recommended)</span>
                  <span className="text-[10px] text-emerald-800">
                    When checked, delivery fee becomes ৳0 automatically when this user checks out—once used, it expires immediately.
                  </span>
                </div>
              </label>

              <div className="pt-2 flex justify-end gap-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setGiftCustomer(null)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={grantingGift}
                  className="px-5 py-2 bg-black text-white font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer"
                >
                  {grantingGift ? 'Granting...' : 'Activate 1x Free Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-70 bg-neutral-950 text-white text-xs font-medium py-3 px-4 rounded-xl shadow-2xl flex items-center gap-2 border border-neutral-800 animate-slide-up">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

    </div>
  );
};
