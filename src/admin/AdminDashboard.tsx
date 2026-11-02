import React, { useEffect, useState } from 'react';
import { 
  ShoppingBag, 
  Clock, 
  DollarSign, 
  Package, 
  AlertTriangle, 
  Users, 
  ArrowRight, 
  PlusCircle, 
  FolderPlus,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order, Product } from '../types';
import { AdminTab } from './AdminLayout';

interface AdminDashboardProps {
  onNavigateTab: (tab: AdminTab) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateTab }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerCount, setCustomerCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Orders
        const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
        const ordersSnap = await getDocs(ordersQuery);
        const orderList: Order[] = [];
        ordersSnap.forEach((d) => orderList.push({ id: d.id, ...d.data() } as Order));
        setOrders(orderList);

        // Products
        const prodSnap = await getDocs(collection(db, 'products'));
        const prodList: Product[] = [];
        prodSnap.forEach((d) => prodList.push({ id: d.id, ...d.data() } as Product));
        setProducts(prodList);

        // Users
        const userSnap = await getDocs(collection(db, 'users'));
        setCustomerCount(userSnap.size);
      } catch (err) {
        console.warn('Dashboard fetch notice:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Derived real metrics
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.orderStatus === 'pending').length;
  const totalRevenue = orders
    .filter((o) => o.orderStatus !== 'cancelled')
    .reduce((sum, o) => sum + (o.total || 0), 0);
  const totalProducts = products.length;
  const lowStockProducts = products.filter((p) => p.totalStock < 5).length;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-neutral-200 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-neutral-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Store Performance & Overview
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Real-time store metrics directly from Firestore database.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateTab('products')}
            className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Orders */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Orders</span>
            <ShoppingBag className="w-4 h-4 text-neutral-700" />
          </div>
          <p className="text-2xl font-black text-neutral-900">{totalOrders}</p>
          <p className="text-[11px] text-neutral-400 mt-1">Real placed orders</p>
        </div>

        {/* Pending Orders */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Pending Orders</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-neutral-900">{pendingOrders}</p>
          <p className="text-[11px] text-neutral-400 mt-1">Requires confirmation</p>
        </div>

        {/* Real Revenue */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-emerald-700 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Gross Revenue</span>
            <DollarSign className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-neutral-900">
            ৳{totalRevenue.toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] text-neutral-400 mt-1">Excluding cancelled</p>
        </div>

        {/* Total Products & Low Stock */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Products in Catalog</span>
            <Package className="w-4 h-4 text-neutral-700" />
          </div>
          <p className="text-2xl font-black text-neutral-900">{totalProducts}</p>
          <p className="text-[11px] text-amber-700 font-semibold mt-1">
            {lowStockProducts > 0 ? `⚠️ ${lowStockProducts} Low Stock Items` : 'All Stock Healthy'}
          </p>
        </div>

      </div>

      {/* First-time Setup Guidance Card (Shows if database is fresh) */}
      {(totalProducts === 0 || totalOrders === 0) && (
        <div className="bg-black text-white p-6 sm:p-8 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider">First-Time Store Setup Checklist</h3>
          </div>
          <p className="text-xs text-neutral-300 max-w-2xl leading-relaxed">
            Your store is connected to your production Firebase database with NO demo data. Follow these 4 essential steps to launch MEN'S FABRIC:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            <button
              onClick={() => onNavigateTab('categories')}
              className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl text-left hover:border-neutral-600 transition-colors cursor-pointer group"
            >
              <span className="text-[10px] font-bold text-neutral-500 block mb-1">STEP 1</span>
              <p className="text-xs font-bold text-white group-hover:text-emerald-400 flex items-center justify-between">
                <span>Create Categories</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">Panjabi, Shirts, Casuals, Pants</p>
            </button>

            <button
              onClick={() => onNavigateTab('products')}
              className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl text-left hover:border-neutral-600 transition-colors cursor-pointer group"
            >
              <span className="text-[10px] font-bold text-neutral-500 block mb-1">STEP 2</span>
              <p className="text-xs font-bold text-white group-hover:text-emerald-400 flex items-center justify-between">
                <span>Add First Product</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">Sizes, colors, prices, inventory</p>
            </button>

            <button
              onClick={() => onNavigateTab('delivery')}
              className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl text-left hover:border-neutral-600 transition-colors cursor-pointer group"
            >
              <span className="text-[10px] font-bold text-neutral-500 block mb-1">STEP 3</span>
              <p className="text-xs font-bold text-white group-hover:text-emerald-400 flex items-center justify-between">
                <span>Verify Delivery Zones</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">Dhaka (৳70) & Nationwide (৳130)</p>
            </button>

            <button
              onClick={() => onNavigateTab('banners')}
              className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl text-left hover:border-neutral-600 transition-colors cursor-pointer group"
            >
              <span className="text-[10px] font-bold text-neutral-500 block mb-1">STEP 4</span>
              <p className="text-xs font-bold text-white group-hover:text-emerald-400 flex items-center justify-between">
                <span>Add Hero Banner</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">Homepage hero display</p>
            </button>
          </div>
        </div>
      )}

      {/* Recent Orders Section */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">Recent Orders</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Customer transactions awaiting dispatch</p>
          </div>
          <button
            onClick={() => onNavigateTab('orders')}
            className="text-xs font-bold uppercase tracking-wider text-black hover:underline cursor-pointer"
          >
            View All Orders →
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-xs">
            <ShoppingBag className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
            <p className="font-semibold text-neutral-700">No orders placed yet.</p>
            <p className="text-[11px] text-neutral-400 mt-0.5">Customer orders will appear here automatically as soon as checkouts occur.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Order #</th>
                  <th className="p-3.5">Customer</th>
                  <th className="p-3.5">Phone</th>
                  <th className="p-3.5">Destination</th>
                  <th className="p-3.5">Total</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium">
                {orders.slice(0, 5).map((ord) => (
                  <tr key={ord.id} className="hover:bg-neutral-50/50">
                    <td className="p-3.5 font-mono font-bold text-neutral-900">{ord.orderNumber}</td>
                    <td className="p-3.5 text-neutral-800">{ord.customerName}</td>
                    <td className="p-3.5 text-neutral-600 font-mono">{ord.customerPhone}</td>
                    <td className="p-3.5 text-neutral-600">{ord.shippingAddress?.district || ord.deliveryZone}</td>
                    <td className="p-3.5 font-bold text-neutral-900">৳{ord.total.toLocaleString('en-BD')}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        ord.orderStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                        ord.orderStatus === 'cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-neutral-100 text-neutral-800'
                      }`}>
                        {ord.orderStatus}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => onNavigateTab('orders')}
                        className="text-black font-semibold hover:underline"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
