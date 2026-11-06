import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Mail, 
  Phone, 
  ShoppingBag, 
  Search, 
  Calendar, 
  DollarSign, 
  MapPin, 
  ShieldCheck, 
  UserCheck, 
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CustomerProfile, Order } from '../types';
import { orderService } from '../services/orderService';

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
  const [customers, setCustomers] = useState<AggregatedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<AggregatedCustomer | null>(null);

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
          joinedDate: (user as any).createdAt?.toDate ? (user as any).createdAt.toDate().toLocaleDateString('en-BD') : 'Registered User',
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
        } else {
          customerMap.set(identifier, {
            uid,
            name,
            email,
            phone,
            address: user.address,
            city: user.city,
            joinedDate: (user as any).createdAt?.toDate ? (user as any).createdAt.toDate().toLocaleDateString('en-BD') : 'Registered User',
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
            joinedDate: o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('en-BD') : 'First Order',
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
  }, []);

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
                  {filteredCustomers.map((c, idx) => (
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
                        <button
                          onClick={() => setSelectedCustomer(c)}
                          className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border border-neutral-300 rounded hover:bg-neutral-100 transition-colors cursor-pointer"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (100% Mobile Responsive) */}
            <div className="md:hidden divide-y divide-neutral-100">
              {filteredCustomers.map((c, idx) => (
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

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-neutral-400 font-medium">
                      Joined: {c.joinedDate || 'Recently'}
                    </span>
                    <button
                      onClick={() => setSelectedCustomer(c)}
                      className="px-3 py-1.5 bg-black text-white text-[11px] font-bold uppercase tracking-wider rounded-lg cursor-pointer"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
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
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          {ord.createdAt?.toDate ? ord.createdAt.toDate().toLocaleDateString('en-BD') : 'Order'} • {ord.items?.length || 0} items
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

    </div>
  );
};
