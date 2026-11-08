import React, { useEffect, useState, useCallback } from 'react';
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
  ExternalLink,
  RefreshCw,
  TrendingUp,
  Truck,
  Eye,
  Calendar,
  Wallet,
  Coins,
  BarChart3,
  Sparkles
} from 'lucide-react';
import { collection, getDocs, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order, Product, CustomerProfile } from '../types';
import { AdminTab } from './AdminLayout';
import { orderService } from '../services/orderService';
import { productService } from '../services/productService';

interface AdminDashboardProps {
  onNavigateTab: (tab: AdminTab) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateTab }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerCount, setCustomerCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const loadAllDashboardData = useCallback(async () => {
    try {
      // 1. Fetch Orders from orderService (aggregates both Firestore + local catalog)
      let ordersList: Order[] = [];
      try {
        ordersList = await orderService.getAllOrdersAdmin();
        setOrders(ordersList);
      } catch (err) {
        console.warn('Dashboard orders fetch notice:', err);
      }

      // 2. Fetch Products from productService (aggregates both Firestore + local catalog)
      let prodList: Product[] = [];
      try {
        prodList = await productService.getAllProductsAdmin();
        setProducts(prodList);
      } catch (err) {
        console.warn('Dashboard products fetch notice:', err);
      }

      // 3. Count Customers from users collection + local registered store + buyers
      try {
        const uniqueCustomers = new Set<string>();
        
        // A. Local registered customers
        const rawLocal = localStorage.getItem('mf_registered_customers_v1');
        if (rawLocal) {
          const parsed = JSON.parse(rawLocal);
          if (Array.isArray(parsed)) {
            parsed.forEach((c: any) => {
              if (c.uid || c.email || c.phone) {
                uniqueCustomers.add((c.uid || c.email || c.phone).toLowerCase());
              }
            });
          }
        }

        // B. Firestore users
        try {
          const usersSnap = await getDocs(collection(db, 'users'));
          usersSnap.forEach((d) => {
            const data = d.data();
            const id = d.id || data.email || data.phone;
            if (id) uniqueCustomers.add(String(id).toLowerCase());
          });
        } catch {
          // ignore
        }

        // C. Buyers in orders
        ordersList.forEach((o) => {
          const id = o.customerId && o.customerId !== 'guest' ? o.customerId : (o.customerEmail || o.customerPhone);
          if (id) uniqueCustomers.add(String(id).toLowerCase());
        });

        setCustomerCount(uniqueCustomers.size);
      } catch (err) {
        console.warn('Customer counting notice:', err);
      }

      setLastRefreshed(new Date().toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAllDashboardData();

    // Event listeners for immediate local events (0ms latency updates)
    const handleOrderUpdate = () => {
      loadAllDashboardData();
    };
    const handleProductUpdate = () => {
      loadAllDashboardData();
    };

    window.addEventListener('mf_orders_updated', handleOrderUpdate);
    window.addEventListener('mf_products_updated', handleProductUpdate);

    // Live remote Firestore listeners with try/catch resilience
    let unsubOrders: (() => void) | null = null;
    let unsubProducts: (() => void) | null = null;

    try {
      const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(30));
      unsubOrders = onSnapshot(qOrders, (snap) => {
        if (!snap.empty) {
          const list: Order[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Order));
          // Merge with local orders
          const localOrders = orderService.getLocalOrders();
          const map = new Map<string, Order>();
          list.forEach((o) => map.set(o.id, o));
          localOrders.forEach((o) => {
            if (!map.has(o.id)) map.set(o.id, o);
          });
          const merged = Array.from(map.values());
          setOrders(merged);
        }
      }, (err) => console.warn('Live orders dashboard notice:', err));
    } catch {
      // ignore
    }

    try {
      const qProds = query(collection(db, 'products'), limit(50));
      unsubProducts = onSnapshot(qProds, (snap) => {
        if (!snap.empty) {
          const list: Product[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Product));
          setProducts(list);
        }
      }, (err) => console.warn('Live prods dashboard notice:', err));
    } catch {
      // ignore
    }

    return () => {
      window.removeEventListener('mf_orders_updated', handleOrderUpdate);
      window.removeEventListener('mf_products_updated', handleProductUpdate);
      if (unsubOrders) unsubOrders();
      if (unsubProducts) unsubProducts();
    };
  }, [loadAllDashboardData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadAllDashboardData();
  };

  // Helper to parse date from order createdAt
  const getOrderDate = (ord: Order): Date | null => {
    if (!ord.createdAt) return null;
    if (typeof (ord.createdAt as any).toDate === 'function') {
      return (ord.createdAt as any).toDate();
    }
    if (typeof (ord.createdAt as any).toMillis === 'function') {
      return new Date((ord.createdAt as any).toMillis());
    }
    if ((ord.createdAt as any).seconds) {
      return new Date((ord.createdAt as any).seconds * 1000);
    }
    const d = new Date(ord.createdAt as any);
    return isNaN(d.getTime()) ? null : d;
  };

  const now = new Date();
  const isToday = (d: Date | null) => {
    if (!d) return false;
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
  };
  const isThisMonth = (d: Date | null) => {
    if (!d) return false;
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth();
  };

  const validOrders = orders.filter((o) => o.orderStatus !== 'cancelled');

  // Product cost lookup map
  const productCostMap = new Map<string, number>();
  products.forEach((p) => {
    if (p.id && typeof p.costPrice === 'number') {
      productCostMap.set(p.id, p.costPrice);
    }
  });

  const getOrderCost = (ord: Order): number => {
    return (ord.items || []).reduce((sum, item) => {
      const unitCost = productCostMap.get(item.productId) ?? (item.unitPrice * 0.6);
      return sum + (unitCost * (item.quantity || 1));
    }, 0);
  };

  // 1. Today's Metrics
  const todayOrders = validOrders.filter((o) => isToday(getOrderDate(o)));
  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const todayCost = todayOrders.reduce((sum, o) => sum + getOrderCost(o), 0);
  const todayProfit = Math.max(0, todayRevenue - todayCost);
  const todayOrdersCount = todayOrders.length;

  // 2. This Month's Metrics
  const monthOrders = validOrders.filter((o) => isThisMonth(getOrderDate(o)));
  const monthRevenue = monthOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const monthCost = monthOrders.reduce((sum, o) => sum + getOrderCost(o), 0);
  const monthProfit = Math.max(0, monthRevenue - monthCost);
  const monthOrdersCount = monthOrders.length;

  // 3. All-Time Operational Metrics
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.orderStatus === 'pending').length;
  const processingOrders = orders.filter((o) => o.orderStatus === 'processing' || o.orderStatus === 'confirmed').length;
  const deliveredOrders = orders.filter((o) => o.orderStatus === 'delivered').length;
  const totalRevenue = validOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalCost = validOrders.reduce((sum, o) => sum + getOrderCost(o), 0);
  const totalProfit = Math.max(0, totalRevenue - totalCost);
  const totalProducts = products.length;
  const lowStockProducts = products.filter((p) => (p.totalStock || 0) < 5).length;

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
      
      {/* Title & Live Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
              Store Performance & Financials
            </h1>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Live synchronized" />
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Real-time store metrics, sales revenue, costs, and profit calculated directly from orders.
            {lastRefreshed && <span className="ml-2 font-mono text-[11px] text-neutral-400">Synced at {lastRefreshed}</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => onNavigateTab('products')}
            className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* PRIMARY SALES & FINANCIAL METRICS (Today Sales, Monthly Sales, COGS Cost, Net Profit) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Sales & Profit Overview</span>
          </span>
          <span className="text-[11px] text-neutral-400 font-mono">Currency: ৳ (BDT)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Today's Sales */}
          <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs hover:border-black transition-all">
            <div className="flex items-center justify-between text-neutral-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Today's Sales</span>
              <Calendar className="w-4 h-4 text-neutral-700" />
            </div>
            <p className="text-2xl font-black text-neutral-900 font-mono">
              ৳{todayRevenue.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-1 flex items-center justify-between">
              <span>{todayOrdersCount} orders placed today</span>
              <span className="font-semibold text-emerald-700">Profit: ৳{todayProfit.toLocaleString('en-BD')}</span>
            </p>
          </div>

          {/* This Month's Sales */}
          <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs hover:border-black transition-all">
            <div className="flex items-center justify-between text-neutral-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">This Month's Sales</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-neutral-900 font-mono">
              ৳{monthRevenue.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-1 flex items-center justify-between">
              <span>{monthOrdersCount} monthly orders</span>
              <span className="font-semibold text-emerald-700">Profit: ৳{monthProfit.toLocaleString('en-BD')}</span>
            </p>
          </div>

          {/* Product Cost (COGS) */}
          <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs hover:border-neutral-400 transition-all">
            <div className="flex items-center justify-between text-neutral-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Product Cost</span>
              <Coins className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-black text-neutral-900 font-mono">
              ৳{totalCost.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-1">
              Manufacturing & unit purchase cost (COGS)
            </p>
          </div>

          {/* Net Profit */}
          <div className="bg-emerald-50/60 p-5 rounded-xl border border-emerald-300 shadow-xs hover:border-emerald-600 transition-all">
            <div className="flex items-center justify-between text-emerald-800 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Estimated Net Profit</span>
              <Wallet className="w-4 h-4 text-emerald-700" />
            </div>
            <p className="text-2xl font-black text-emerald-950 font-mono">
              ৳{totalProfit.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-emerald-800 font-semibold mt-1">
              Gross Revenue minus Product Costs ({totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}% margin)
            </p>
          </div>

        </div>
      </div>

      {/* SECONDARY OPERATIONAL METRICS (Total Orders, Pending, Revenue, Inventory) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Orders */}
        <div 
          onClick={() => onNavigateTab('orders')}
          className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs hover:border-black cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Orders</span>
            <ShoppingBag className="w-4 h-4 text-neutral-700" />
          </div>
          <p className="text-2xl font-black text-neutral-900 font-mono">{totalOrders}</p>
          <p className="text-[11px] text-neutral-400 mt-1 flex items-center justify-between">
            <span>{deliveredOrders} Delivered</span>
            <span className="text-black font-semibold hover:underline">View →</span>
          </p>
        </div>

        {/* Pending Orders */}
        <div 
          onClick={() => onNavigateTab('orders')}
          className={`p-5 rounded-xl border shadow-xs hover:border-amber-500 cursor-pointer transition-all ${
            pendingOrders > 0 ? 'bg-amber-50/50 border-amber-300' : 'bg-white border-neutral-200'
          }`}
        >
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Pending Orders</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-amber-900 font-mono">{pendingOrders}</p>
          <p className="text-[11px] text-amber-700 font-medium mt-1">
            {pendingOrders > 0 ? 'Action required: Confirm orders' : 'All clear • No pending orders'}
          </p>
        </div>

        {/* Real Revenue */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-emerald-700 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">All-Time Revenue</span>
            <DollarSign className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-neutral-900 font-mono">
            ৳{totalRevenue.toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] text-neutral-400 mt-1">Net of cancelled orders</p>
        </div>

        {/* Total Products & Low Stock */}
        <div 
          onClick={() => onNavigateTab('products')}
          className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs hover:border-black cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Catalog Inventory</span>
            <Package className="w-4 h-4 text-neutral-700" />
          </div>
          <p className="text-2xl font-black text-neutral-900 font-mono">{totalProducts}</p>
          <p className="text-[11px] font-semibold mt-1">
            {lowStockProducts > 0 ? (
              <span className="text-red-600">⚠️ {lowStockProducts} Low Stock Items</span>
            ) : (
              <span className="text-emerald-700">✓ All Stock Healthy</span>
            )}
          </p>
        </div>

      </div>

      {/* Secondary Metrics: Customers & Deliveries */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div 
          onClick={() => onNavigateTab('customers')}
          className="p-4 bg-white border border-neutral-200 rounded-xl shadow-xs flex items-center justify-between hover:border-neutral-400 cursor-pointer"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Total Customers</span>
            <p className="text-xl font-black text-neutral-900 font-mono mt-0.5">{customerCount}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-700">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div 
          onClick={() => onNavigateTab('orders')}
          className="p-4 bg-white border border-neutral-200 rounded-xl shadow-xs flex items-center justify-between hover:border-neutral-400 cursor-pointer"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">In-Processing / Packaging</span>
            <p className="text-xl font-black text-neutral-900 font-mono mt-0.5">{processingOrders}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-700">
            <Truck className="w-4 h-4" />
          </div>
        </div>

        <div 
          onClick={() => onNavigateTab('delivery')}
          className="p-4 bg-white border border-neutral-200 rounded-xl shadow-xs flex items-center justify-between hover:border-neutral-400 cursor-pointer"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Delivery Status</span>
            <p className="text-sm font-extrabold text-neutral-900 mt-0.5">Steadfast / Pathao</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-700">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* First-time Setup Guidance Card (Shows only if database is fresh) */}
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
              <p className="text-[11px] text-neutral-400 mt-1">Dhaka & Nationwide rates</p>
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
        <div className="p-4 sm:p-5 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">Recent Customer Orders</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Live transactions awaiting processing or dispatch</p>
          </div>
          <button
            onClick={() => onNavigateTab('orders')}
            className="text-xs font-bold uppercase tracking-wider text-black hover:underline cursor-pointer"
          >
            View All ({orders.length}) →
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="p-10 text-center text-neutral-500 text-xs">
            <ShoppingBag className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
            <p className="font-semibold text-neutral-700">No orders placed yet.</p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Customer orders will populate here automatically as checkouts occur.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                  <tr>
                    <th className="p-3.5">Order #</th>
                    <th className="p-3.5">Customer</th>
                    <th className="p-3.5">Phone</th>
                    <th className="p-3.5">Destination</th>
                    <th className="p-3.5">Total</th>
                    <th className="p-3.5">Payment</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium">
                  {orders.slice(0, 6).map((ord) => (
                    <tr key={ord.id} className="hover:bg-neutral-50/50">
                      <td className="p-3.5 font-mono font-bold text-neutral-900">{ord.orderNumber}</td>
                      <td className="p-3.5 text-neutral-800">{ord.customerName}</td>
                      <td className="p-3.5 text-neutral-600 font-mono">{ord.customerPhone}</td>
                      <td className="p-3.5 text-neutral-600">{ord.shippingAddress?.district || ord.deliveryZone}</td>
                      <td className="p-3.5 font-bold text-neutral-900 font-mono">৳{ord.total.toLocaleString('en-BD')}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          ord.paymentMethod === 'bkash' ? 'bg-[#D12053]/10 text-[#D12053]' :
                          ord.paymentMethod === 'nagad' ? 'bg-[#F7941D]/10 text-[#D97706]' :
                          ord.paymentMethod === 'rocket' ? 'bg-[#8C3494]/10 text-[#8C3494]' :
                          'bg-neutral-100 text-neutral-600'
                        }`}>
                          {ord.paymentMethod?.toUpperCase() || 'COD'}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          ord.orderStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                          ord.orderStatus === 'cancelled' ? 'bg-red-100 text-red-800' :
                          ord.orderStatus === 'pending' ? 'bg-amber-100 text-amber-800' :
                          'bg-neutral-100 text-neutral-800'
                        }`}>
                          {ord.orderStatus}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => onNavigateTab('orders')}
                          className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border border-neutral-300 rounded hover:bg-neutral-100 transition-colors cursor-pointer"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Responsive Orders Card View */}
            <div className="md:hidden divide-y divide-neutral-100">
              {orders.slice(0, 5).map((ord) => (
                <div key={`mob-ord-${ord.id}`} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-neutral-900 text-xs">{ord.orderNumber}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          ord.orderStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                          ord.orderStatus === 'cancelled' ? 'bg-red-100 text-red-800' :
                          ord.orderStatus === 'pending' ? 'bg-amber-100 text-amber-800' :
                          'bg-neutral-100 text-neutral-800'
                        }`}>
                          {ord.orderStatus}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-neutral-800 mt-0.5">{ord.customerName}</p>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-neutral-900 font-mono">
                        ৳{ord.total.toLocaleString('en-BD')}
                      </span>
                      <span className="block text-[10px] uppercase font-bold text-neutral-500 mt-0.5">
                        {ord.paymentMethod?.toUpperCase() || 'COD'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-neutral-500 bg-neutral-50 p-2 rounded-lg">
                    <span>{ord.shippingAddress?.district || ord.deliveryZone}</span>
                    <span className="font-mono">{ord.customerPhone}</span>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => onNavigateTab('orders')}
                      className="px-3 py-1.5 bg-black text-white text-[11px] font-bold uppercase tracking-wider rounded-lg cursor-pointer"
                    >
                      Manage Order
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

    </div>
  );
};
