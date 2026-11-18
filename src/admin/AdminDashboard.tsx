import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ShoppingBag,
  DollarSign,
  Package,
  AlertTriangle,
  Users,
  ArrowRight,
  PlusCircle,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  Truck,
  Calendar,
  Wallet,
  Coins,
  BarChart3,
  Receipt,
  Building2,
  ShoppingCart,
  Target,
} from 'lucide-react';
import { collection, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Order,
  Product,
  ExpenseEntry,
  PurchaseEntry,
  Supplier,
  PartnerDeskConfig,
  SalesTargetsConfig,
} from '../types';
import { AdminTab } from './AdminLayout';
import { orderService } from '../services/orderService';
import { productService } from '../services/productService';
import { posService } from '../services/posService';
import { formatDatePart, formatTimePart, formatDateTime } from '../lib/dateFormat';
import { useAuth } from '../context/AuthContext';
import {
  getLocalDateKey,
  getLocalMonthKey,
  getMonthDateBounds,
  computePeriodAccounting,
  computeDailySeries,
  computeStockAudit,
} from '../lib/accountingUtils';
import { TargetProgressRow, DailyPerformanceChart } from '../components/admin/FinancialCharts';

interface AdminDashboardProps {
  onNavigateTab: (tab: AdminTab) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateTab }) => {
  const { hasMenuPermission } = useAuth();
  const [orders, setOrders] = useState<Order[]>(() => orderService.getLocalOrders());
  const [products, setProducts] = useState<Product[]>(() => productService.getLocalProducts());
  const [customerCount, setCustomerCount] = useState<number>(() => {
    try {
      const unique = new Set<string>();
      const rawLocal = localStorage.getItem('mf_registered_customers_v1');
      if (rawLocal) {
        const parsed = JSON.parse(rawLocal);
        if (Array.isArray(parsed)) {
          parsed.forEach((c: any) => {
            const id = c?.uid || c?.email || c?.phone;
            if (id) unique.add(String(id).toLowerCase());
          });
        }
      }
      orderService.getLocalOrders().forEach((o) => {
        const id = o.customerId && o.customerId !== 'guest' ? o.customerId : (o.customerEmail || o.customerPhone);
        if (id) unique.add(String(id).toLowerCase());
      });
      return unique.size;
    } catch {
      return 0;
    }
  });
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(() => posService.getLocalExpenses());
  const [purchases, setPurchases] = useState<PurchaseEntry[]>(() => posService.getLocalPurchases());
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => posService.getLocalSuppliers());
  const [partnerDesks, setPartnerDesks] = useState<PartnerDeskConfig[]>(() =>
    posService.getLocalPartnerDesks()
  );
  const [targets, setTargets] = useState<SalesTargetsConfig>(() => posService.getLocalTargets());

  // Live local date & month ticker for automatic midnight / monthly rollover
  const [todayKey, setTodayKey] = useState<string>(() => getLocalDateKey());
  const [monthKey, setMonthKey] = useState<string>(() => getLocalMonthKey());

  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  useEffect(() => {
    const interval = setInterval(() => {
      const nextDay = getLocalDateKey();
      const nextMonth = getLocalMonthKey();
      setTodayKey((prev) => (prev !== nextDay ? nextDay : prev));
      setMonthKey((prev) => (prev !== nextMonth ? nextMonth : prev));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const withTimeout = <T,>(promise: Promise<T>, ms = 5000): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), ms)),
    ]);

  const loadAllDashboardData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [ordersRes, prodsRes, usersRes] = await Promise.allSettled([
        withTimeout(orderService.getAllOrdersAdmin(), 6000),
        withTimeout(productService.getAllProductsAdmin(), 6000),
        withTimeout(getDocs(collection(db, 'users')), 6000),
      ]);

      const ordersList: Order[] =
        ordersRes.status === 'fulfilled' ? ordersRes.value : orderService.getLocalOrders();
      setOrders(ordersList);

      const prodList: Product[] =
        prodsRes.status === 'fulfilled' ? prodsRes.value : productService.getLocalProducts();
      setProducts(prodList);

      // Count Customers from users collection + local registered store + buyers
      try {
        const uniqueCustomers = new Set<string>();

        const rawLocal = localStorage.getItem('mf_registered_customers_v1');
        if (rawLocal) {
          const parsed = JSON.parse(rawLocal);
          if (Array.isArray(parsed)) {
            parsed.forEach((c: any) => {
              const id = c?.uid || c?.email || c?.phone;
              if (id) uniqueCustomers.add(String(id).toLowerCase());
            });
          }
        }

        if (usersRes.status === 'fulfilled') {
          usersRes.value.forEach((d) => {
            const data = d.data();
            const id = d.id || data.email || data.phone;
            if (id) uniqueCustomers.add(String(id).toLowerCase());
          });
        }

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
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAllDashboardData();

    const handleOrderUpdate = () => {
      setOrders(orderService.getLocalOrders());
    };
    const handleProductUpdate = () => {
      setProducts(productService.getLocalProducts());
    };

    window.addEventListener('mf_orders_updated', handleOrderUpdate);
    window.addEventListener('selvee_products_updated', handleProductUpdate);
    window.addEventListener('mf_products_updated', handleProductUpdate);

    // Live full remote Firestore listeners (no 50-order truncation so monthly & all-time accounting stay exact)
    let unsubOrders: (() => void) | null = null;
    const unsubProducts = productService.subscribeToAllProductsAdmin((prods) => {
      setProducts(prods);
    });

    try {
      const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      unsubOrders = onSnapshot(
        qOrders,
        (snap) => {
          const map = new Map<string, Order>();
          orderService.getLocalOrders().forEach((o) => map.set(o.id, o));
          snap.forEach((d) => map.set(d.id, { id: d.id, ...d.data() } as Order));
          setOrders(Array.from(map.values()));
        },
        (err) => console.warn('Live orders dashboard notice:', err)
      );
    } catch {
      // ignore
    }

    const unsubExp = posService.subscribeToExpenses(setExpenses);
    const unsubPur = posService.subscribeToPurchases(setPurchases);
    const unsubSup = posService.subscribeToSuppliers(setSuppliers);
    const unsubDesks = posService.subscribeToPartnerDesks(setPartnerDesks);
    const unsubTargets = posService.subscribeToTargets(setTargets);

    return () => {
      window.removeEventListener('mf_orders_updated', handleOrderUpdate);
      window.removeEventListener('selvee_products_updated', handleProductUpdate);
      window.removeEventListener('mf_products_updated', handleProductUpdate);
      if (unsubOrders) unsubOrders();
      unsubProducts();
      unsubExp();
      unsubPur();
      unsubSup();
      unsubDesks();
      unsubTargets();
    };
  }, [loadAllDashboardData]);

  const handleManualRefresh = () => {
    loadAllDashboardData();
  };

  // Accurate local-calendar accounting stats (Today, This Month, All-Time, Daily Trend, Stock Audit)
  const monthBounds = useMemo(() => getMonthDateBounds(monthKey), [monthKey]);

  const todayStats = useMemo(
    () =>
      computePeriodAccounting({
        orders,
        products,
        expenses,
        purchases,
        startDateKey: todayKey,
        endDateKey: todayKey,
      }),
    [orders, products, expenses, purchases, todayKey]
  );

  const monthStats = useMemo(
    () =>
      computePeriodAccounting({
        orders,
        products,
        expenses,
        purchases,
        startDateKey: monthBounds.startKey,
        endDateKey: monthBounds.endKey,
      }),
    [orders, products, expenses, purchases, monthBounds]
  );

  const allTimeStats = useMemo(
    () =>
      computePeriodAccounting({
        orders,
        products,
        expenses,
        purchases,
      }),
    [orders, products, expenses, purchases]
  );

  const dailySeries = useMemo(
    () =>
      computeDailySeries({
        orders,
        products,
        expenses,
        days: 14,
        endDateKey: todayKey,
      }),
    [orders, products, expenses, todayKey]
  );

  const stockAudit = useMemo(
    () => computeStockAudit({ products, purchases, orders }),
    [products, purchases, orders]
  );

  const totalSupplierDue = suppliers.reduce((sum, s) => sum + (Number(s.dueAmount) || 0), 0);
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.orderStatus === 'pending').length;
  const deliveredOrders = orders.filter((o) => o.orderStatus === 'delivered').length;
  const totalProducts = products.length;

  // 4-Desk Order Workflow Counts
  const pipelineCounts = {
    order_verification: orders.filter(
      (o) => orderService.getOrderPipelineStage(o) === 'order_verification'
    ).length,
    payment_verification: orders.filter(
      (o) => orderService.getOrderPipelineStage(o) === 'payment_verification'
    ).length,
    inventory_packing: orders.filter(
      (o) => orderService.getOrderPipelineStage(o) === 'inventory_packing'
    ).length,
    delivery_dispatch: orders.filter(
      (o) => orderService.getOrderPipelineStage(o) === 'delivery_dispatch'
    ).length,
  };

  return (
    <div className="space-y-6">
      {/* Title & Live POS Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            POS Financial Overview &amp; Store Control
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Live Today ({todayKey}) &amp; Monthly ({monthBounds.label}) sales, exact net profit, targets &amp; stock match · Auto-resets at local midnight &amp; 1st of month.
            {lastRefreshed && <span className="ml-2 font-mono text-[11px] text-neutral-400">Synced {lastRefreshed}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="px-3 py-2 bg-white border border-neutral-200 hover:border-black text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>

          {hasMenuPermission('expenses') && (
            <button
              onClick={() => onNavigateTab('expenses')}
              className="px-3 py-2 bg-white border border-neutral-200 hover:border-black text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Expense</span>
            </button>
          )}

          {hasMenuPermission('purchases') && (
            <button
              onClick={() => onNavigateTab('purchases')}
              className="px-3 py-2 bg-white border border-neutral-200 hover:border-black text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Add Purchase</span>
            </button>
          )}

          {hasMenuPermission('pos') && (
            <button
              onClick={() => onNavigateTab('pos')}
              className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Open POS Terminal</span>
            </button>
          )}
        </div>
      </div>

      {/* Warning Banner if Products are missing costPrice */}
      {stockAudit.productsMissingCost.length > 0 && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <b>{stockAudit.productsMissingCost.length}</b> products do not have a buying Cost Price (৳) set. Add cost prices so P&amp;L and Stock Value are 100% accurate.
            </span>
          </div>
          {hasMenuPermission('pnl') && (
            <button
              type="button"
              onClick={() => onNavigateTab('pnl')}
              className="px-3 py-1.5 bg-amber-600 text-white font-bold uppercase tracking-wider rounded-lg hover:bg-amber-700 cursor-pointer w-fit text-[11px]"
            >
              Set Cost Prices &amp; Audit →
            </button>
          )}
        </div>
      )}

      {/* PRIMARY POS SALES & PROFIT METRICS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Today &amp; Monthly Sales / Net Profit (Real COGS &amp; Expenses)</span>
          </span>
          {hasMenuPermission('pnl') && (
            <button
              type="button"
              onClick={() => onNavigateTab('pnl')}
              className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
            >
              Full Profit &amp; Loss Statement →
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
          {/* Today's Sale */}
          <div className="bg-white p-5 rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between text-neutral-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Today&apos;s Sale</span>
              <Calendar className="w-4 h-4 text-neutral-700" />
            </div>
            <p className="text-2xl font-black text-neutral-900 font-mono">
              ৳{todayStats.totalBilledRevenue.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-1">
              {todayStats.validOrderCount} orders · {todayStats.unitsSold} pcs
            </p>
          </div>

          {/* Today's Net Profit */}
          <div
            className={`p-5 rounded-xl border ${
              todayStats.netProfit >= 0
                ? 'bg-emerald-50/50 border-emerald-200'
                : 'bg-red-50/50 border-red-200'
            }`}
          >
            <div
              className={`flex items-center justify-between mb-2 ${
                todayStats.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Today&apos;s {todayStats.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
              </span>
              <Wallet className="w-4 h-4" />
            </div>
            <p
              className={`text-2xl font-black font-mono ${
                todayStats.netProfit >= 0 ? 'text-emerald-950' : 'text-red-700'
              }`}
            >
              {todayStats.netProfit < 0 ? '-' : ''}৳{Math.abs(todayStats.netProfit).toLocaleString('en-BD')}
            </p>
            <p className={`text-[11px] mt-1 ${todayStats.netProfit >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
              Gross ৳{todayStats.grossProfit.toLocaleString('en-BD')} − Exp ৳{todayStats.totalExpenses.toLocaleString('en-BD')}
            </p>
          </div>

          {/* Monthly Sale */}
          <div className="bg-white p-5 rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between text-neutral-500 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Monthly Sale</span>
              <TrendingUp className="w-4 h-4 text-neutral-800" />
            </div>
            <p className="text-2xl font-black text-neutral-900 font-mono">
              ৳{monthStats.totalBilledRevenue.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-1">
              {monthStats.validOrderCount} orders · {monthStats.unitsSold} pcs ({monthBounds.label})
            </p>
          </div>

          {/* Monthly Net Profit */}
          <div
            className={`p-5 rounded-xl border ${
              monthStats.netProfit >= 0
                ? 'bg-emerald-50/50 border-emerald-200'
                : 'bg-red-50/50 border-red-200'
            }`}
          >
            <div
              className={`flex items-center justify-between mb-2 ${
                monthStats.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Monthly {monthStats.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
              </span>
              <DollarSign className="w-4 h-4" />
            </div>
            <p
              className={`text-2xl font-black font-mono ${
                monthStats.netProfit >= 0 ? 'text-emerald-950' : 'text-red-700'
              }`}
            >
              {monthStats.netProfit < 0 ? '-' : ''}৳{Math.abs(monthStats.netProfit).toLocaleString('en-BD')}
            </p>
            <p className={`text-[11px] mt-1 ${monthStats.netProfit >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
              Gross ৳{monthStats.grossProfit.toLocaleString('en-BD')} − Exp ৳{monthStats.totalExpenses.toLocaleString('en-BD')}
            </p>
          </div>
        </div>
      </div>

      {/* DAILY & MONTHLY TARGETS PROGRESS CARD */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
              <Target className="w-4 h-4" />
              <span>Daily &amp; Monthly Targets Progress</span>
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Real-time achievement tracking for Sales Amount (৳), Pieces Sold (Pcs), and Monthly Net Profit
            </p>
          </div>
          {hasMenuPermission('pnl') && (
            <button
              type="button"
              onClick={() => onNavigateTab('pnl')}
              className="px-3.5 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer inline-flex items-center gap-1.5 w-fit"
            >
              <span>Configure Targets &amp; P&amp;L</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <TargetProgressRow
            label="Today Amount"
            currentValue={todayStats.totalBilledRevenue}
            targetValue={targets.dailyAmountTarget}
            unitPrefix="৳"
            accentColor="neutral"
          />
          <TargetProgressRow
            label="Today Pieces"
            currentValue={todayStats.unitsSold}
            targetValue={targets.dailyPcsTarget}
            unitSuffix=" pcs"
            accentColor="blue"
          />
          <TargetProgressRow
            label="Monthly Amount"
            currentValue={monthStats.totalBilledRevenue}
            targetValue={targets.monthlyAmountTarget}
            unitPrefix="৳"
            accentColor="neutral"
          />
          <TargetProgressRow
            label="Monthly Profit"
            currentValue={monthStats.netProfit}
            targetValue={targets.monthlyProfitTarget}
            unitPrefix="৳"
            accentColor="emerald"
          />
        </div>
      </div>

      {/* PURCHASES, EXPENSES, SUPPLIER DUE & STOCK VALUATION */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div
          onClick={() => onNavigateTab('purchases')}
          className="bg-white p-4 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Monthly Purchases</span>
            <ShoppingCart className="w-4 h-4 text-neutral-700" />
          </div>
          <p className="text-xl font-black text-neutral-900 font-mono">
            ৳{monthStats.purchasesTotal.toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">
            All-time: ৳{stockAudit.totalPurchasedAmount.toLocaleString('en-BD')} →
          </p>
        </div>

        <div
          onClick={() => onNavigateTab('expenses')}
          className="bg-white p-4 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Monthly Expenses</span>
            <Coins className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-xl font-black text-red-700 font-mono">
            ৳{monthStats.totalExpenses.toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">
            Today: ৳{todayStats.totalExpenses.toLocaleString('en-BD')} · Log entry →
          </p>
        </div>

        <div
          onClick={() => onNavigateTab('suppliers')}
          className="bg-white p-4 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Supplier Dues</span>
            <Building2 className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-black text-amber-700 font-mono">
            ৳{totalSupplierDue.toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">{suppliers.length} suppliers registered →</p>
        </div>

        <div
          onClick={() => (hasMenuPermission('pnl') ? onNavigateTab('pnl') : onNavigateTab('products'))}
          className="bg-white p-4 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-neutral-500 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Live Stock Value</span>
            <Package className="w-4 h-4 text-neutral-700" />
          </div>
          <p className="text-xl font-black text-neutral-900 font-mono">
            ৳{stockAudit.stockCostValue.toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] font-semibold mt-1 text-neutral-600">
            {stockAudit.totalProducts} products · {stockAudit.totalStockPcs.toLocaleString('en-BD')} pcs ·{' '}
            {stockAudit.matchStatus === 'matched' ? (
              <span className="text-emerald-700">Matched ✓</span>
            ) : (
              <span className="text-blue-700">Audit Stock →</span>
            )}
          </p>
        </div>
      </div>

      {/* LIVE 14-DAY PERFORMANCE GRAPH */}
      <DailyPerformanceChart
        data={dailySeries}
        dailyAmountTarget={targets.dailyAmountTarget}
        dailyPcsTarget={targets.dailyPcsTarget}
      />

      {/* STAFF DESK ORDER WORKFLOW SNAPSHOT */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
              Order Workflow &amp; Staff Desk Queue
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Live breakdown of active orders across each desk · All-time Net Profit:{' '}
              <b className={`font-mono ${allTimeStats.netProfit >= 0 ? 'text-neutral-900' : 'text-red-700'}`}>
                {allTimeStats.netProfit < 0 ? '-' : ''}৳{Math.abs(allTimeStats.netProfit).toLocaleString('en-BD')}
              </b>
            </p>
          </div>
          {hasMenuPermission('pipeline') && (
            <button
              onClick={() => onNavigateTab('pipeline')}
              className="px-3.5 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer inline-flex items-center gap-1.5 w-fit"
            >
              <span>Open Workflow Board</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          {([
            {
              stage: 'order_verification',
              step: '01',
              title: 'Order Verification',
              count: pipelineCounts.order_verification,
            },
            {
              stage: 'payment_verification',
              step: '02',
              title: 'Payment Verification',
              count: pipelineCounts.payment_verification,
            },
            {
              stage: 'inventory_packing',
              step: '03',
              title: 'Packaging & Stock',
              count: pipelineCounts.inventory_packing,
            },
            {
              stage: 'delivery_dispatch',
              step: '04',
              title: 'Delivery Dispatch',
              count: pipelineCounts.delivery_dispatch,
            },
          ] as const).map((item) => {
            const desk = partnerDesks.find((d) => d.stage === item.stage);
            return (
              <button
                key={item.stage}
                type="button"
                onClick={() => hasMenuPermission('pipeline') && onNavigateTab('pipeline')}
                className="text-left p-3.5 rounded-lg border border-neutral-200 hover:border-black transition-colors cursor-pointer bg-neutral-50/50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Stage {item.step}
                  </span>
                  <span className="text-lg font-black font-mono text-neutral-900">{item.count}</span>
                </div>
                <p className="text-xs font-bold text-neutral-900 mt-1">{item.title}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
                  Desk: <b>{desk?.partnerName || item.title}</b>
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Operational Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 tabular-nums">
        <div
          onClick={() => onNavigateTab('customers')}
          className="p-4 bg-white border border-neutral-200 rounded-xl flex items-center justify-between hover:border-black cursor-pointer"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Total Customers</span>
            <p className="text-xl font-black text-neutral-900 font-mono mt-0.5">{customerCount}</p>
          </div>
          <Users className="w-5 h-5 text-neutral-400" />
        </div>

        <div
          onClick={() => onNavigateTab('orders')}
          className="p-4 bg-white border border-neutral-200 rounded-xl flex items-center justify-between hover:border-black cursor-pointer"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Pending / Active Orders
            </span>
            <p className="text-xl font-black text-neutral-900 font-mono mt-0.5">
              {pendingOrders} pending · {deliveredOrders} delivered
            </p>
          </div>
          <ShoppingBag className="w-5 h-5 text-neutral-400" />
        </div>

        <div
          onClick={() => onNavigateTab('delivery')}
          className="p-4 bg-white border border-neutral-200 rounded-xl flex items-center justify-between hover:border-black cursor-pointer"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Delivery Network</span>
            <p className="text-sm font-extrabold text-neutral-900 mt-0.5">Steadfast / Pathao / COD</p>
          </div>
          <Truck className="w-5 h-5 text-neutral-400" />
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
            Your store is connected to your production Firebase database with NO demo data. Follow these 4 essential steps to launch Selvee:
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
              <p className="text-[11px] text-neutral-400 mt-1">Dhaka &amp; Nationwide rates</p>
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
                    <th className="p-3.5">Date &amp; Time</th>
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
                      <td className="p-3.5 font-mono font-bold text-neutral-900">{ord.orderNumber || ord.id}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="block text-neutral-800 font-semibold text-xs tabular-nums">
                          {formatDatePart(ord.createdAt, 'Recent')}
                        </span>
                        {formatTimePart(ord.createdAt) && (
                          <span className="block text-[10px] text-neutral-400 font-mono tabular-nums">
                            {formatTimePart(ord.createdAt)}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-neutral-800">{ord.customerName || 'Customer'}</td>
                      <td className="p-3.5 text-neutral-600 font-mono">{ord.customerPhone || 'N/A'}</td>
                      <td className="p-3.5 text-neutral-600">{ord.shippingAddress?.district || ord.deliveryZone || 'N/A'}</td>
                      <td className="p-3.5 font-bold text-neutral-900 font-mono">৳{(Number(ord.total) || 0).toLocaleString('en-BD')}</td>
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
                          {ord.orderStatus || 'pending'}
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
                        <span className="font-mono font-bold text-neutral-900 text-xs">{ord.orderNumber || ord.id}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          ord.orderStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                          ord.orderStatus === 'cancelled' ? 'bg-red-100 text-red-800' :
                          ord.orderStatus === 'pending' ? 'bg-amber-100 text-amber-800' :
                          'bg-neutral-100 text-neutral-800'
                        }`}>
                          {ord.orderStatus || 'pending'}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-neutral-800 mt-0.5">{ord.customerName || 'Customer'}</p>
                      <p className="text-[10px] text-neutral-400 font-mono tabular-nums mt-0.5">
                        {formatDateTime(ord.createdAt, 'Recent')}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-neutral-900 font-mono">
                        ৳{(Number(ord.total) || 0).toLocaleString('en-BD')}
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
