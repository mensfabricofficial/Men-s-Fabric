import React, { useState, useEffect } from 'react';
import { Users, Mail, Phone, Calendar, ShieldCheck, ShoppingBag } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CustomerProfile, Order } from '../types';

export const AdminCustomers: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [usersSnap, ordersSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'orders')),
        ]);

        const uList: CustomerProfile[] = [];
        usersSnap.forEach((d) => uList.push({ uid: d.id, ...d.data() } as CustomerProfile));

        const oList: Order[] = [];
        ordersSnap.forEach((d) => oList.push({ id: d.id, ...d.data() } as Order));

        setCustomers(uList);
        setOrders(oList);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
          Customer Directory
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Real registered customer accounts and order histories from Firestore.
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <Users className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">No customers registered yet</h4>
            <p className="text-xs text-neutral-500">Customer accounts will populate here as users sign up or place orders.</p>
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
              <tr>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Contact</th>
                <th className="p-3.5">Orders Placed</th>
                <th className="p-3.5">Total Spent</th>
                <th className="p-3.5">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {customers.map((c) => {
                const customerOrders = orders.filter((o) => o.customerId === c.uid);
                const spent = customerOrders.reduce((sum, o) => sum + (o.total || 0), 0);
                return (
                  <tr key={c.uid} className="hover:bg-neutral-50/50">
                    <td className="p-3.5 font-bold text-neutral-900">{c.name || 'Customer'}</td>
                    <td className="p-3.5">
                      <p className="text-neutral-700">{c.email}</p>
                      {c.phone && <p className="text-neutral-500 font-mono text-[11px]">{c.phone}</p>}
                    </td>
                    <td className="p-3.5">{customerOrders.length} orders</td>
                    <td className="p-3.5 font-bold text-neutral-900">৳{spent.toLocaleString('en-BD')}</td>
                    <td className="p-3.5 text-neutral-500">
                      {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString('en-BD') : 'Registered'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
};
