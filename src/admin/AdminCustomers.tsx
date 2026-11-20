import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Mail,
  Phone,
  ShoppingBag,
  Search,
  DollarSign,
  MapPin,
  UserCheck,
  Truck,
  X,
  CheckCircle2,
  UserPlus,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import {
  Coupon,
  CustomerPaymentLog,
  CustomerProfile,
  Order,
  PaymentMethod,
} from '../types';
import { orderService } from '../services/orderService';
import { settingsService } from '../services/settingsService';
import { posService } from '../services/posService';
import { computeCustomerMetrics, getOrderPaidAndDue } from '../lib/accountingUtils';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../lib/dateFormat';
import { AdminPageHeader } from './AdminLayout';

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
  paidAmount: number;
  remainingDue: number;
  orders: Order[];
  paymentLogs: Array<CustomerPaymentLog & { orderNumber: string }>;
}

export const AdminCustomers: React.FC = () => {
  const { currentUser } = useAuth();
  const [firestoreUsers, setFirestoreUsers] = useState<Array<Partial<CustomerProfile>>>(() =>
    posService.getInstantRegisteredUsers()
  );
  const [crmCustomers, setCrmCustomers] = useState<CustomerProfile[]>(() =>
    posService.getInstantCrmCustomers()
  );
  const [allOrders, setAllOrders] = useState<Order[]>(() => orderService.getInstantOrders());
  const [coupons, setCoupons] = useState<Coupon[]>(() => settingsService.getInstantCoupons());
  const [searchTerm, setSearchTerm] = useState('');
  const [dueFilterOnly, setDueFilterOnly] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Add Customer Modal State
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDivision, setNewDivision] = useState('Dhaka');
  const [newDistrict, setNewDistrict] = useState('Dhaka');
  const [newAddress, setNewAddress] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Collect Due Payment Modal State
  const [collectOrder, setCollectOrder] = useState<Order | null>(null);
  const [collectAmount, setCollectAmount] = useState<number>(0);
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>('cash');
  const [collectTrxId, setCollectTrxId] = useState('');
  const [collectNote, setCollectNote] = useState('');
  const [collectingDue, setCollectingDue] = useState(false);

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

  useEffect(() => {
    const unsubOrders = orderService.subscribeToAllOrdersAdmin(setAllOrders);
    const unsubCoupons = settingsService.subscribeToCoupons(setCoupons);
    const unsubCrm = posService.subscribeToCrmCustomers(setCrmCustomers);
    const unsubUsers = posService.subscribeToRegisteredUsers(setFirestoreUsers);

    return () => {
      unsubOrders();
      unsubCoupons();
      unsubCrm();
      unsubUsers();
    };
  }, []);

  const customers = useMemo<AggregatedCustomer[]>(() => {

    const customerMap = new Map<string, AggregatedCustomer>();
    const normalizePhoneKey = (p?: string) => (p || '').replace(/[\s\-+()]/g, '').replace(/^88/, '');

    const upsertBase = (user: Partial<CustomerProfile>, keyHint: string, isReg: boolean) => {
      const uid = user.uid || keyHint;
      const email = user.email || '';
      const phone = user.phone || '';
      const name = user.name || 'Customer';
      const identifier = (normalizePhoneKey(phone) || email || uid).toLowerCase();
      if (!identifier) return;

      const existing = customerMap.get(identifier);
      if (existing) {
        existing.name = existing.name || name;
        existing.email = existing.email || email;
        existing.phone = existing.phone || phone;
        existing.address = existing.address || user.address;
        existing.city = existing.city || user.city || user.district;
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
          city: user.city || user.district,
          joinedDate: formatDateTime((user as any).createdAt, isReg ? 'Registered User' : 'CRM Customer'),
          isRegisteredUser: isReg,
          orderCount: 0,
          totalSpent: 0,
          paidAmount: 0,
          remainingDue: 0,
          orders: [],
          paymentLogs: [],
        });
      }
    };

    firestoreUsers.forEach((user) => upsertBase(user, user.uid || user.email || '', true));
    crmCustomers.forEach((user) => upsertBase(user, user.uid, true));

    allOrders.forEach((o) => {
      const email = o.customerEmail || o.shippingAddress?.email || '';
      const phone = o.customerPhone || o.shippingAddress?.phone || '';
      const phoneKey = normalizePhoneKey(phone);
      const uid = o.customerId && o.customerId !== 'guest' && o.customerId !== 'walk-in-pos' ? o.customerId : '';
      const name = o.customerName || o.shippingAddress?.fullName || 'Customer';

      let matchedKey = '';
      if (phoneKey && customerMap.has(phoneKey.toLowerCase())) {
        matchedKey = phoneKey.toLowerCase();
      } else if (email && customerMap.has(email.toLowerCase())) {
        matchedKey = email.toLowerCase();
      } else if (uid && customerMap.has(uid.toLowerCase())) {
        matchedKey = uid.toLowerCase();
      }

      const { paid, due } = getOrderPaidAndDue(o);
      const isValid = o.orderStatus !== 'cancelled' && o.orderStatus !== 'returned';

      const logs: Array<CustomerPaymentLog & { orderNumber: string }> = (o.paymentHistory || []).map((pl) => ({
        ...pl,
        orderNumber: o.orderNumber,
      }));
      if (logs.length === 0 && paid > 0 && isValid) {
        logs.push({
          id: `init-${o.id}`,
          amount: paid,
          method: o.paymentMethod,
          receivedBy: o.pipeline?.paymentVerifiedBy || 'System',
          note: 'Order Payment',
          date: '',
          timestamp: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
          orderNumber: o.orderNumber,
        });
      }

      if (matchedKey) {
        const rec = customerMap.get(matchedKey)!;
        rec.orders.push(o);
        if (isValid) {
          rec.orderCount += 1;
          rec.totalSpent += Number(o.total) || 0;
          rec.paidAmount += paid;
          rec.remainingDue += due;
        }
        rec.paymentLogs.push(...logs);
        if (!rec.address && o.shippingAddress?.address) {
          rec.address = o.shippingAddress.address;
        }
        if (!rec.city && (o.shippingAddress?.district || o.shippingAddress?.division)) {
          rec.city = `${o.shippingAddress?.district || ''}, ${o.shippingAddress?.division || ''}`;
        }
      } else {
        const newIdentifier = (phoneKey || email || uid || `buyer-${o.id}`).toLowerCase();
        customerMap.set(newIdentifier, {
          uid: uid || `guest-${o.id.slice(0, 6)}`,
          name,
          email,
          phone,
          address: o.shippingAddress?.address,
          city: `${o.shippingAddress?.district || ''}, ${o.shippingAddress?.division || ''}`,
          joinedDate: formatDateTime(o.createdAt, 'First Order'),
          isRegisteredUser: Boolean(uid),
          orderCount: isValid ? 1 : 0,
          totalSpent: isValid ? Number(o.total) || 0 : 0,
          paidAmount: isValid ? paid : 0,
          remainingDue: isValid ? due : 0,
          orders: [o],
          paymentLogs: logs,
        });
      }
    });

    return Array.from(customerMap.values()).sort(
      (a, b) => b.remainingDue - a.remainingDue || b.totalSpent - a.totalSpent
    );
  }, [firestoreUsers, crmCustomers, allOrders]);

  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customers.find((c) => c.uid === selectedCustomerId) || null : null),
    [customers, selectedCustomerId]
  );

  const setSelectedCustomer = (c: AggregatedCustomer | null) => {
    setSelectedCustomerId(c ? c.uid : null);
  };

  const customerMetrics = useMemo(
    () => computeCustomerMetrics({ orders: allOrders, customers: crmCustomers }),
    [allOrders, crmCustomers]
  );

  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFirstName.trim() || !newPhone.trim()) return;
    setSavingCustomer(true);
    try {
      const created = await posService.saveCrmCustomer({
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim(),
        division: newDivision.trim() || 'Dhaka',
        district: newDistrict.trim() || 'Dhaka',
        address: newAddress.trim(),
      });
      if (currentUser) {
        settingsService
          .logAdminAction(
            currentUser.uid,
            currentUser.email || '',
            'CREATE_CUSTOMER',
            created.name,
            `Added CRM customer ${created.name} (${created.phone})`,
            { entityType: 'customer', afterValue: created.uid }
          )
          .catch(() => {});
      }
      setShowAddCustomer(false);
      setNewFirstName('');
      setNewLastName('');
      setNewPhone('');
      setNewEmail('');
      setNewAddress('');
      showToast(`Customer ${created.name} (${created.uid}) added.`);
    } finally {
      setSavingCustomer(false);
    }
  };

  const openCollectDueModal = (ord: Order) => {
    const { due } = getOrderPaidAndDue(ord);
    setCollectOrder(ord);
    setCollectAmount(due);
    setCollectMethod('cash');
    setCollectTrxId('');
    setCollectNote('');
  };

  const handleCollectDueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectOrder || collectAmount <= 0) return;
    setCollectingDue(true);
    try {
      const receiver = currentUser?.displayName || currentUser?.email || 'Admin';
      const updated = await posService.recordCustomerDuePayment({
        orderId: collectOrder.id,
        amount: collectAmount,
        method: collectMethod,
        trxId: collectTrxId,
        receivedBy: receiver,
        note: collectNote || 'Customer due payment',
      });
      if (updated && currentUser) {
        settingsService
          .logAdminAction(
            currentUser.uid,
            currentUser.email || '',
            'COLLECT_CUSTOMER_DUE',
            updated.orderNumber,
            `Collected ৳${collectAmount} due payment via ${collectMethod.toUpperCase()}`,
            {
              entityType: 'order_payment',
              beforeValue: `Due ৳${getOrderPaidAndDue(collectOrder).due}`,
              afterValue: `Due ৳${updated.dueAmount ?? 0}`,
            }
          )
          .catch(() => {});
      }
      setCollectOrder(null);
      showToast(`Collected ৳${collectAmount.toLocaleString('en-BD')} payment!`);
    } finally {
      setCollectingDue(false);
    }
  };

  const getCustomerFreeDeliveryCoupon = (c: AggregatedCustomer): Coupon | undefined => {
    const usedOrderCodes = new Set(
      (c.orders || [])
        .filter((o) => o.orderStatus !== 'cancelled' && o.couponCode)
        .map((o) => o.couponCode!.trim().toUpperCase())
    );
    return coupons.find((cpn) => {
      if (cpn.discountType !== 'free_delivery') return false;
      const hasTarget = Boolean(
        (cpn.targetCustomerUid && !cpn.targetCustomerUid.startsWith('guest-')) ||
          cpn.targetCustomerEmail ||
          cpn.targetCustomerPhone
      );
      if (!hasTarget) return false;
      if (usedOrderCodes.has(cpn.code.trim().toUpperCase())) return false;
      return (
        settingsService.isCouponValidForUse(cpn, usedOrderCodes) &&
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

  // Filter customers by search term & optional due filter
  const filteredCustomers = customers.filter((c) => {
    if (dueFilterOnly && c.remainingDue <= 0) return false;
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.uid.toLowerCase().includes(q) ||
      (c.city && c.city.toLowerCase().includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q))
    );
  });

  const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
  const totalDueSum = customers.reduce((sum, c) => sum + c.remainingDue, 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Customer Directory & Dues"
        subtitle="Registered accounts, POS buyers, order history & due collection"
        actions={
          <button
            type="button"
            onClick={() => setShowAddCustomer(true)}
            className="px-4 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Customer</span>
          </button>
        }
      />

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 bg-white border border-neutral-200 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Total Customers</span>
          <p className="text-2xl font-black font-mono text-neutral-900 tabular-nums">{customers.length}</p>
          <p className="text-[10px] text-neutral-400">CRM + online buyers</p>
        </div>
        <div className="p-4 bg-white border border-neutral-200 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">New Today</span>
          <p className="text-2xl font-black font-mono text-neutral-900 tabular-nums">{customerMetrics.newToday}</p>
          <p className="text-[10px] text-neutral-400">This month: {customerMetrics.newThisMonth}</p>
        </div>
        <div className="p-4 bg-white border border-neutral-200 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Active / Returning</span>
          <p className="text-2xl font-black font-mono text-neutral-900 tabular-nums">
            {customerMetrics.activeCustomers} <span className="text-sm text-neutral-400">/ {customerMetrics.returningCustomers}</span>
          </p>
          <p className="text-[10px] text-neutral-400">1+ / 2+ orders</p>
        </div>
        <div className="p-4 bg-white border border-neutral-200 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Customer Revenue</span>
          <p className="text-xl font-black font-mono text-neutral-900 tabular-nums">
            ৳{totalRevenue.toLocaleString('en-BD')}
          </p>
          <p className="text-[10px] text-neutral-400">Gross customer spend</p>
        </div>
        <div className="p-4 bg-white border border-neutral-200 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Total Due Balance</span>
          <p className={`text-xl font-black font-mono tabular-nums ${totalDueSum > 0 ? 'text-red-600' : 'text-neutral-900'}`}>
            ৳{totalDueSum.toLocaleString('en-BD')}
          </p>
          <p className="text-[10px] text-neutral-400">
            Today: ৳{customerMetrics.todayDue.toLocaleString('en-BD')}
          </p>
        </div>
        <div className="p-4 bg-white border border-neutral-200 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">With Due</span>
          <p className="text-2xl font-black font-mono text-neutral-900 tabular-nums">
            {customers.filter((c) => c.remainingDue > 0).length}
          </p>
          <p className="text-[10px] text-neutral-400">Accounts to collect</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search customers by name, ID, phone (017...), email, or city..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black transition-all shadow-xs"
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
        <button
          type="button"
          onClick={() => setDueFilterOnly((v) => !v)}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl border transition-colors cursor-pointer shrink-0 ${
            dueFilterOnly
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-white text-neutral-700 border-neutral-200 hover:border-black'
          }`}
        >
          Customers With Due Only ({customers.filter((c) => c.remainingDue > 0).length})
        </button>
      </div>

      {/* Customer List Container */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <Users className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">
              {searchTerm || dueFilterOnly ? 'No matching customers found' : 'No customers registered yet'}
            </h4>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Add a customer manually or wait for users to sign up / place orders.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                  <tr>
                    <th className="p-3.5">Customer</th>
                    <th className="p-3.5">Contact Details</th>
                    <th className="p-3.5">Orders</th>
                    <th className="p-3.5">Total Spent</th>
                    <th className="p-3.5">Paid (৳)</th>
                    <th className="p-3.5">Remaining Due</th>
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
                              <p className="text-[10px] font-mono text-neutral-400">
                                {c.uid} · {c.joinedDate || 'Customer'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          {c.phone && (
                            <a href={`tel:${c.phone}`} className="font-mono text-neutral-900 font-semibold hover:underline block">
                              {c.phone}
                            </a>
                          )}
                          {c.email && (
                            <span className="text-neutral-500 text-[11px] block">{c.email}</span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono tabular-nums">
                          <span className="font-bold text-neutral-900">{c.orderCount}</span>
                        </td>
                        <td className="p-3.5 font-bold text-neutral-900 font-mono tabular-nums">
                          ৳{c.totalSpent.toLocaleString('en-BD')}
                        </td>
                        <td className="p-3.5 font-semibold text-emerald-700 font-mono tabular-nums">
                          ৳{c.paidAmount.toLocaleString('en-BD')}
                        </td>
                        <td className="p-3.5 font-mono tabular-nums">
                          {c.remainingDue > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 font-bold">
                              ৳{c.remainingDue.toLocaleString('en-BD')}
                            </span>
                          ) : (
                            <span className="text-neutral-400">৳0</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                            {activeFreeDelivery ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold uppercase">
                                <Truck className="w-3 h-3 text-emerald-600" />
                                <span>{activeFreeDelivery.code}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRevokeFreeDelivery(activeFreeDelivery, c.name)}
                                  className="ml-1 text-red-600 cursor-pointer"
                                >
                                  ✕
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openFreeDeliveryModal(c)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase bg-neutral-900 text-white rounded hover:bg-neutral-700 cursor-pointer"
                              >
                                <Truck className="w-3 h-3" />
                                <span>Free Del</span>
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedCustomer(c)}
                              className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border border-neutral-300 rounded hover:border-black cursor-pointer"
                            >
                              {c.remainingDue > 0 ? 'Details / Pay' : 'Details'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-neutral-100">
              {filteredCustomers.map((c, idx) => (
                <div key={`m-${c.uid}-${c.phone}-${idx}`} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-neutral-900 text-sm">{c.name}</h4>
                      <p className="text-[11px] font-mono text-neutral-500">{c.phone || c.email || c.uid}</p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <span className="text-xs font-extrabold text-neutral-900 block">
                        ৳{c.totalSpent.toLocaleString('en-BD')}
                      </span>
                      {c.remainingDue > 0 && (
                        <span className="text-[10px] font-bold text-red-600">
                          Due: ৳{c.remainingDue.toLocaleString('en-BD')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-500">
                    <span>{c.orderCount} orders · Paid ৳{c.paidAmount.toLocaleString('en-BD')}</span>
                    <button
                      onClick={() => setSelectedCustomer(c)}
                      className="px-3 py-1.5 bg-black text-white text-[11px] font-bold uppercase rounded-lg cursor-pointer"
                    >
                      Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add New Customer Modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-black" />
                <h3 className="text-sm font-extrabold uppercase tracking-tight">Add New Customer</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomer(false)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddCustomerSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Phone *</label>
                  <input
                    type="tel"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Division</label>
                  <input
                    type="text"
                    value={newDivision}
                    onChange={(e) => setNewDivision(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">District</label>
                  <input
                    type="text"
                    value={newDistrict}
                    onChange={(e) => setNewDistrict(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">Address</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowAddCustomer(false)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="px-5 py-2 bg-black text-white font-bold uppercase rounded-lg cursor-pointer"
                >
                  {savingCustomer ? 'Saving...' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Detail Drawer / Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-5 text-xs animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs uppercase">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-tight text-neutral-900">
                    {selectedCustomer.name}
                  </h3>
                  <span className="text-[10px] font-mono text-neutral-500">
                    {selectedCustomer.uid} · {selectedCustomer.isRegisteredUser ? 'CRM / Registered' : 'Buyer Profile'}
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

            {/* Financial Summary */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Total Billed</span>
                <span className="text-sm font-black font-mono tabular-nums">
                  ৳{selectedCustomer.totalSpent.toLocaleString('en-BD')}
                </span>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-emerald-700 block">Total Paid</span>
                <span className="text-sm font-black font-mono text-emerald-800 tabular-nums">
                  ৳{selectedCustomer.paidAmount.toLocaleString('en-BD')}
                </span>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-red-700 block">Remaining Due</span>
                <span className="text-sm font-black font-mono text-red-700 tabular-nums">
                  ৳{selectedCustomer.remainingDue.toLocaleString('en-BD')}
                </span>
              </div>
            </div>

            {/* Profile Info */}
            <div className="bg-neutral-50 rounded-xl p-3.5 space-y-1.5 border border-neutral-200">
              <div className="flex justify-between">
                <span className="text-neutral-500">Phone:</span>
                <span className="font-mono font-bold text-neutral-900">{selectedCustomer.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Email:</span>
                <span className="font-medium text-neutral-800">{selectedCustomer.email || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Location:</span>
                <span className="font-medium text-neutral-800">{selectedCustomer.address || selectedCustomer.city || 'N/A'}</span>
              </div>
            </div>

            {/* Order History with Due Payment Collection */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-2">
                Orders & Due Collection ({selectedCustomer.orders.length})
              </h4>
              {selectedCustomer.orders.length === 0 ? (
                <div className="p-5 text-center text-neutral-400 bg-neutral-50 rounded-xl border border-neutral-200">
                  No orders placed yet with this customer.
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {selectedCustomer.orders.map((ord) => {
                    const { paid, due } = getOrderPaidAndDue(ord);
                    return (
                      <div
                        key={ord.id}
                        className="p-3 bg-white border border-neutral-200 rounded-xl flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-neutral-900">{ord.orderNumber || ord.id.slice(0, 8)}</span>
                            <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-[9px] font-bold uppercase text-neutral-700">
                              {ord.orderStatus}
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-500 mt-0.5 tabular-nums">
                            {formatDateTime(ord.createdAt, 'Order')} · Paid ৳{paid.toLocaleString('en-BD')}
                            {due > 0 && <span className="text-red-600 font-bold"> · Due ৳{due.toLocaleString('en-BD')}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-bold text-neutral-900">
                            ৳{ord.total?.toLocaleString('en-BD')}
                          </span>
                          {due > 0 && (
                            <button
                              type="button"
                              onClick={() => openCollectDueModal(ord)}
                              className="px-2.5 py-1 bg-black text-white text-[10px] font-bold uppercase rounded cursor-pointer hover:bg-neutral-800"
                            >
                              Collect Due
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Payment History Ledger */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-2">
                Complete Payment History ({selectedCustomer.paymentLogs.length})
              </h4>
              {selectedCustomer.paymentLogs.length === 0 ? (
                <p className="text-[11px] text-neutral-400 p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-center">
                  No payment records logged yet.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {selectedCustomer.paymentLogs.map((pl, idx) => (
                    <div
                      key={`${pl.id}-${idx}`}
                      className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-neutral-900">
                          {pl.orderNumber} · <span className="uppercase">{pl.method}</span>
                          {pl.trxId && <span className="ml-1.5 font-mono text-[10px] text-neutral-500">({pl.trxId})</span>}
                        </p>
                        <p className="text-[10px] text-neutral-500">
                          {pl.note || 'Payment'} · By {pl.receivedBy} · {formatDateTime(pl.timestamp)}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-emerald-700 tabular-nums">
                        +৳{pl.amount.toLocaleString('en-BD')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Free Delivery Pass Bar */}
            <div className="p-3.5 rounded-xl border border-neutral-200 bg-white flex items-center justify-between gap-3">
              {(() => {
                const activePass = getCustomerFreeDeliveryCoupon(selectedCustomer);
                if (activePass) {
                  return (
                    <>
                      <div className="flex items-center gap-2 text-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <p className="font-bold text-xs">
                            Active 1x Free Delivery Pass: <span className="font-mono">{activePass.code}</span>
                          </p>
                          <p className="text-[10px] text-emerald-700">Single use</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevokeFreeDelivery(activePass, selectedCustomer.name)}
                        className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-[11px] font-bold uppercase cursor-pointer"
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
                      <p className="text-[10px] text-neutral-500">Grant 1 free delivery order</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedCustomer;
                        setSelectedCustomer(null);
                        openFreeDeliveryModal(target);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-black text-white rounded-lg text-[11px] font-bold uppercase cursor-pointer"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>Give Free Delivery</span>
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Collect Due Payment Modal */}
      {collectOrder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-black" />
                <h3 className="text-sm font-extrabold uppercase tracking-tight">
                  Collect Due Payment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCollectOrder(null)}
                className="text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-1">
              <p className="font-mono font-bold text-neutral-900">{collectOrder.orderNumber}</p>
              <p className="text-neutral-600">
                Remaining Due:{' '}
                <b className="font-mono text-red-600">
                  ৳{getOrderPaidAndDue(collectOrder).due.toLocaleString('en-BD')}
                </b>
              </p>
            </div>
            <form onSubmit={handleCollectDueSubmit} className="space-y-3">
              <div>
                <label className="block font-bold uppercase text-neutral-600 mb-1">Amount (৳) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={getOrderPaidAndDue(collectOrder).due}
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 font-mono bg-neutral-50 border border-neutral-300 rounded"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-neutral-600 mb-1">Payment Method</label>
                <select
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                >
                  <option value="cash">Cash</option>
                  <option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option>
                  <option value="rocket">Rocket</option>
                </select>
              </div>
              <input
                type="text"
                value={collectTrxId}
                onChange={(e) => setCollectTrxId(e.target.value)}
                placeholder="TrxID / Reference (optional)"
                className="w-full px-3 py-2 font-mono bg-neutral-50 border border-neutral-300 rounded"
              />
              <input
                type="text"
                value={collectNote}
                onChange={(e) => setCollectNote(e.target.value)}
                placeholder="Payment note (optional)"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCollectOrder(null)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collectingDue}
                  className="px-5 py-2 bg-black text-white font-bold uppercase rounded-lg cursor-pointer"
                >
                  {collectingDue ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
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
                    When checked, delivery fee becomes ৳0 automatically when this user checks out.
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

