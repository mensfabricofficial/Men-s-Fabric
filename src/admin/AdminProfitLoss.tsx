import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Package,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
  X,
  ArrowUpRight,
  Wallet,
  ShoppingCart,
  BarChart3,
  Check,
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Order,
  Product,
  ExpenseEntry,
  PurchaseEntry,
  SalesTargetsConfig,
  ExpenseCategory,
} from '../types';
import { orderService } from '../services/orderService';
import { productService } from '../services/productService';
import { posService } from '../services/posService';
import {
  EXPENSE_CATEGORY_META,
  getLocalDateKey,
  getLocalMonthKey,
  addLocalDays,
  addLocalMonths,
  getMonthDateBounds,
  computePeriodAccounting,
  computeDailySeries,
  computeMonthlySeries,
  computeStockAudit,
} from '../lib/accountingUtils';
import {
  TargetProgressRow,
  DailyPerformanceChart,
  MonthlyPerformanceChart,
} from '../components/admin/FinancialCharts';
import { AdminTab } from './AdminLayout';

interface AdminProfitLossProps {
  onNavigateTab?: (tab: AdminTab) => void;
}

type PeriodPreset = 'today' | 'yesterday' | 'this_month' | 'last_month' | 'all_time' | 'custom';

export const AdminProfitLoss: React.FC<AdminProfitLossProps> = ({ onNavigateTab }) => {
  const [orders, setOrders] = useState<Order[]>(() => orderService.getLocalOrders());
  const [products, setProducts] = useState<Product[]>(() => productService.getLocalProducts());
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(() => posService.getLocalExpenses());
  const [purchases, setPurchases] = useState<PurchaseEntry[]>(() => posService.getLocalPurchases());
  const [targets, setTargets] = useState<SalesTargetsConfig>(() => posService.getLocalTargets());

  // Live local date ticker so Today/Monthly auto-rolls over cleanly at midnight
  const [todayKey, setTodayKey] = useState<string>(() => getLocalDateKey());
  const [monthKey, setMonthKey] = useState<string>(() => getLocalMonthKey());

  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState<string>(() => getMonthDateBounds(getLocalMonthKey()).startKey);
  const [customEnd, setCustomEnd] = useState<string>(() => getLocalDateKey());

  const [refreshing, setRefreshing] = useState(false);
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [targetDraft, setTargetDraft] = useState<SalesTargetsConfig>(() => posService.getLocalTargets());
  const [savingTargets, setSavingTargets] = useState(false);

  // Inline costPrice editor state for missing-cost products
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [savingCostId, setSavingCostId] = useState<string | null>(null);
  const [savedCostIds, setSavedCostIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      const nextDay = getLocalDateKey();
      const nextMonth = getLocalMonthKey();
      setTodayKey((prev) => (prev !== nextDay ? nextDay : prev));
      setMonthKey((prev) => (prev !== nextMonth ? nextMonth : prev));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const syncAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [ordersRes, prodsRes] = await Promise.allSettled([
        orderService.getAllOrdersAdmin(),
        productService.getAllProductsAdmin(),
      ]);
      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value);
      if (prodsRes.status === 'fulfilled') setProducts(prodsRes.value);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    syncAll();

    const handleLocalOrder = () => setOrders(orderService.getLocalOrders());
    const handleLocalProd = () => setProducts(productService.getLocalProducts());
    window.addEventListener('mf_orders_updated', handleLocalOrder);
    window.addEventListener('selvee_products_updated', handleLocalProd);
    window.addEventListener('mf_products_updated', handleLocalProd);

    let unsubOrders: (() => void) | null = null;
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
        () => {}
      );
    } catch {
      // fallback
    }

    const unsubProds = productService.subscribeToAllProductsAdmin(setProducts);
    const unsubExp = posService.subscribeToExpenses(setExpenses);
    const unsubPur = posService.subscribeToPurchases(setPurchases);
    const unsubTargets = posService.subscribeToTargets((cfg) => {
      setTargets(cfg);
      setTargetDraft((prev) => (targetModalOpen ? prev : cfg));
    });

    return () => {
      window.removeEventListener('mf_orders_updated', handleLocalOrder);
      window.removeEventListener('selvee_products_updated', handleLocalProd);
      window.removeEventListener('mf_products_updated', handleLocalProd);
      if (unsubOrders) unsubOrders();
      unsubProds();
      unsubExp();
      unsubPur();
      unsubTargets();
    };
  }, [syncAll, targetModalOpen]);

  // Period bounds computation
  const { startDateKey, endDateKey, periodTitle } = useMemo(() => {
    if (period === 'today') {
      return { startDateKey: todayKey, endDateKey: todayKey, periodTitle: `Today (${todayKey})` };
    }
    if (period === 'yesterday') {
      const y = addLocalDays(todayKey, -1);
      return { startDateKey: y, endDateKey: y, periodTitle: `Yesterday (${y})` };
    }
    if (period === 'this_month') {
      const bounds = getMonthDateBounds(monthKey);
      return { startDateKey: bounds.startKey, endDateKey: bounds.endKey, periodTitle: bounds.label };
    }
    if (period === 'last_month') {
      const lastM = addLocalMonths(monthKey, -1);
      const bounds = getMonthDateBounds(lastM);
      return { startDateKey: bounds.startKey, endDateKey: bounds.endKey, periodTitle: bounds.label };
    }
    if (period === 'custom') {
      return {
        startDateKey: customStart || undefined,
        endDateKey: customEnd || undefined,
        periodTitle: `${customStart || 'Start'} → ${customEnd || 'End'}`,
      };
    }
    return { startDateKey: undefined, endDateKey: undefined, periodTitle: 'All-Time Ledger' };
  }, [period, todayKey, monthKey, customStart, customEnd]);

  // Always compute Today & This Month live for target progress bars
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

  const monthBounds = useMemo(() => getMonthDateBounds(monthKey), [monthKey]);
  const thisMonthStats = useMemo(
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

  const selectedStats = useMemo(
    () =>
      computePeriodAccounting({
        orders,
        products,
        expenses,
        purchases,
        startDateKey,
        endDateKey,
      }),
    [orders, products, expenses, purchases, startDateKey, endDateKey]
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

  const monthlySeries = useMemo(
    () =>
      computeMonthlySeries({
        orders,
        products,
        expenses,
        purchases,
        months: 6,
        endMonthKey: monthKey,
      }),
    [orders, products, expenses, purchases, monthKey]
  );

  const stockAudit = useMemo(
    () =>
      computeStockAudit({
        products,
        purchases,
        orders,
      }),
    [products, purchases, orders]
  );

  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTargets(true);
    try {
      const saved = await posService.saveTargets(targetDraft);
      setTargets(saved);
      setTargetModalOpen(false);
    } finally {
      setSavingTargets(false);
    }
  };

  const handleSaveProductCost = async (prod: Product) => {
    const raw = costDrafts[prod.id];
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return;
    setSavingCostId(prod.id);
    try {
      await productService.updateProduct(prod.id, { costPrice: num });
      setSavedCostIds((prev) => ({ ...prev, [prod.id]: true }));
      setProducts((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, costPrice: num } : p))
      );
    } finally {
      setSavingCostId(null);
    }
  };

  const expenseCategoryEntries = (Object.keys(EXPENSE_CATEGORY_META) as ExpenseCategory[])
    .map((key) => ({
      key,
      meta: EXPENSE_CATEGORY_META[key],
      amount: selectedStats.expenseByCategory[key] || 0,
    }))
    .filter((row) => row.amount > 0);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Profit &amp; Loss, Sales Targets &amp; Stock Audit
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Live P&amp;L accounting (auto-resets daily at local midnight &amp; monthly on the 1st) · Today: <span className="font-mono">{todayKey}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={syncAll}
            disabled={refreshing}
            className="px-3 py-2 bg-white border border-neutral-200 hover:border-black text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Syncing...' : 'Sync Ledger'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTargetDraft(targets);
              setTargetModalOpen(true);
            }}
            className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Target className="w-3.5 h-3.5" />
            <span>Set Daily &amp; Monthly Targets</span>
          </button>
        </div>
      </div>

      {/* Period Filter Bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-neutral-100 rounded-lg">
          {([
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'all_time', label: 'All Time' },
            { id: 'custom', label: 'Custom Range' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriod(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                period === tab.id
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {period === 'custom' ? (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
            />
            <span className="text-neutral-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
            />
          </div>
        ) : (
          <span className="text-xs font-semibold text-neutral-600 px-2">
            Showing: <span className="font-mono text-neutral-900">{periodTitle}</span>
          </span>
        )}
      </div>

      {/* Top Financial KPIs for Selected Period */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 tabular-nums">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Total Sales (Billed)</span>
          <p className="text-xl sm:text-2xl font-black font-mono text-neutral-900 mt-1">
            ৳{selectedStats.totalBilledRevenue.toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">
            {selectedStats.validOrderCount} orders · {selectedStats.unitsSold} pcs
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Product Cost (COGS)</span>
          <p className="text-xl sm:text-2xl font-black font-mono text-neutral-900 mt-1">
            ৳{selectedStats.cogs.toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">
            {selectedStats.missingCostItemsCount > 0 ? (
              <span className="text-amber-700 font-semibold">
                {selectedStats.missingCostItemsCount} pcs missing cost
              </span>
            ) : (
              '100% cost-tracked'
            )}
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Gross Profit</span>
          <p
            className={`text-xl sm:text-2xl font-black font-mono mt-1 ${
              selectedStats.grossProfit >= 0 ? 'text-neutral-900' : 'text-red-700'
            }`}
          >
            {selectedStats.grossProfit < 0 ? '-' : ''}৳{Math.abs(selectedStats.grossProfit).toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">
            Margin: {selectedStats.grossMarginPct.toFixed(1)}%
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Operating Expenses</span>
          <p className="text-xl sm:text-2xl font-black font-mono text-red-700 mt-1">
            ৳{selectedStats.totalExpenses.toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] text-neutral-500 mt-1">
            {selectedStats.expenseCount} expense entries
          </p>
        </div>

        <div
          className={`col-span-2 lg:col-span-1 rounded-xl p-4 border ${
            selectedStats.netProfit >= 0
              ? 'bg-emerald-50/70 border-emerald-200'
              : 'bg-red-50/70 border-red-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-bold uppercase tracking-wider ${
                selectedStats.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'
              }`}
            >
              {selectedStats.netProfit >= 0 ? 'Net Profit (লাভ)' : 'Net Loss (লস)'}
            </span>
            {selectedStats.netProfit >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-700" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-700" />
            )}
          </div>
          <p
            className={`text-xl sm:text-2xl font-black font-mono mt-1 ${
              selectedStats.netProfit >= 0 ? 'text-emerald-950' : 'text-red-800'
            }`}
          >
            {selectedStats.netProfit < 0 ? '-' : ''}৳{Math.abs(selectedStats.netProfit).toLocaleString('en-BD')}
          </p>
          <p
            className={`text-[11px] font-semibold mt-1 ${
              selectedStats.netProfit >= 0 ? 'text-emerald-800' : 'text-red-700'
            }`}
          >
            Net Margin: {selectedStats.netMarginPct.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* DAILY & MONTHLY TARGETS + PROGRESS BARS */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
              Daily &amp; Monthly Targets — Live Achievement Progress
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Tracks Amount (৳), Pieces Sold (Pcs), and Net Profit targets automatically
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setTargetDraft(targets);
              setTargetModalOpen(true);
            }}
            className="text-xs font-bold text-neutral-900 hover:underline inline-flex items-center gap-1 cursor-pointer w-fit"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Edit Targets
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Today&apos;s Targets ({todayKey})
            </h4>
            <TargetProgressRow
              label="Today Sale Amount Target"
              subLabel={`${todayStats.validOrderCount} orders`}
              currentValue={todayStats.totalBilledRevenue}
              targetValue={targets.dailyAmountTarget}
              unitPrefix="৳"
              accentColor="neutral"
            />
            <TargetProgressRow
              label="Today Pieces Sold Target"
              subLabel="Units dispatched/sold"
              currentValue={todayStats.unitsSold}
              targetValue={targets.dailyPcsTarget}
              unitSuffix=" pcs"
              accentColor="blue"
            />
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Monthly Targets ({monthBounds.label})
            </h4>
            <TargetProgressRow
              label="Monthly Sale Amount Target"
              subLabel={`${thisMonthStats.validOrderCount} orders`}
              currentValue={thisMonthStats.totalBilledRevenue}
              targetValue={targets.monthlyAmountTarget}
              unitPrefix="৳"
              accentColor="neutral"
            />
            <TargetProgressRow
              label="Monthly Pieces Sold Target"
              subLabel="Cumulative monthly qty"
              currentValue={thisMonthStats.unitsSold}
              targetValue={targets.monthlyPcsTarget}
              unitSuffix=" pcs"
              accentColor="blue"
            />
            <TargetProgressRow
              label="Monthly Net Profit Target"
              subLabel="After COGS & all expenses"
              currentValue={thisMonthStats.netProfit}
              targetValue={targets.monthlyProfitTarget}
              unitPrefix="৳"
              accentColor="emerald"
            />
          </div>
        </div>
      </div>

      {/* PERFORMANCE GRAPHS (DAILY & MONTHLY) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DailyPerformanceChart
          data={dailySeries}
          dailyAmountTarget={targets.dailyAmountTarget}
          dailyPcsTarget={targets.dailyPcsTarget}
        />
        <MonthlyPerformanceChart
          data={monthlySeries}
          monthlyAmountTarget={targets.monthlyAmountTarget}
          monthlyProfitTarget={targets.monthlyProfitTarget}
        />
      </div>

      {/* DETAILED PROFIT & LOSS STATEMENT + OPERATIONAL CASH FLOW */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* P&L Statement */}
        <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl p-5 space-y-4 tabular-nums">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                Profit &amp; Loss Statement ({periodTitle})
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Detailed revenue, discount, product cost, expense &amp; bottom-line net calculation
              </p>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('expenses')}
                className="text-xs font-bold text-neutral-900 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                Add Expense <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-neutral-100">
              <span className="text-neutral-600">Gross Product Value (Subtotal)</span>
              <span className="font-mono font-semibold text-neutral-900">
                ৳{selectedStats.grossMerchandiseValue.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-neutral-100">
              <span className="text-neutral-600">Less: Coupons &amp; Online Discounts</span>
              <span className="font-mono font-semibold text-amber-700">
                −৳{selectedStats.totalDiscounts.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-neutral-100">
              <span className="font-semibold text-neutral-800">Net Merchandise Sales</span>
              <span className="font-mono font-bold text-neutral-900">
                ৳{selectedStats.netMerchandiseSales.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-neutral-100">
              <span className="text-neutral-600">Plus: Delivery Fees Collected</span>
              <span className="font-mono font-semibold text-neutral-900">
                +৳{selectedStats.deliveryCollected.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="flex justify-between py-2 bg-neutral-50 px-3 rounded-lg font-bold text-neutral-900">
              <span>Total Billed Revenue</span>
              <span className="font-mono">৳{selectedStats.totalBilledRevenue.toLocaleString('en-BD')}</span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-neutral-100 pt-2">
              <span className="text-neutral-600">
                Less: Cost of Goods Sold ({selectedStats.unitsSold} pcs)
              </span>
              <span className="font-mono font-semibold text-red-700">
                −৳{selectedStats.cogs.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="flex justify-between py-2 bg-neutral-100/80 px-3 rounded-lg font-bold text-neutral-900">
              <span>Gross Profit ({selectedStats.grossMarginPct.toFixed(1)}%)</span>
              <span className="font-mono">
                {selectedStats.grossProfit < 0 ? '-' : ''}৳{Math.abs(selectedStats.grossProfit).toLocaleString('en-BD')}
              </span>
            </div>

            <div className="pt-2 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Operating Expenses by Category
              </p>
              {expenseCategoryEntries.length === 0 ? (
                <p className="text-xs text-neutral-400 italic py-1">No operating expenses recorded in this period.</p>
              ) : (
                expenseCategoryEntries.map((row) => (
                  <div key={row.key} className="flex justify-between py-1 border-b border-neutral-100/80 pl-2">
                    <span className="text-neutral-600">
                      {row.meta.label} <span className="text-neutral-400">({row.meta.bnLabel})</span>
                    </span>
                    <span className="font-mono font-semibold text-red-700">
                      −৳{row.amount.toLocaleString('en-BD')}
                    </span>
                  </div>
                ))
              )}
              <div className="flex justify-between py-1.5 font-semibold text-red-800 border-t border-neutral-200">
                <span>Total Operating Expenses</span>
                <span className="font-mono">−৳{selectedStats.totalExpenses.toLocaleString('en-BD')}</span>
              </div>
            </div>

            <div
              className={`flex justify-between items-center py-3 px-4 rounded-xl border text-sm font-black ${
                selectedStats.netProfit >= 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <span>{selectedStats.netProfit >= 0 ? 'NET PROFIT (নিট লাভ)' : 'NET LOSS (নিট লস)'}</span>
              <span className="font-mono text-base">
                {selectedStats.netProfit < 0 ? '-' : ''}৳{Math.abs(selectedStats.netProfit).toLocaleString('en-BD')}
              </span>
            </div>
          </div>
        </div>

        {/* Channel, Payment & Return Breakdown */}
        <div className="lg:col-span-5 space-y-6 tabular-nums">
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-100 pb-2.5">
              Payment Collections &amp; Order Channels
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200/70">
                <span className="text-[10px] font-bold uppercase text-neutral-500 block">Online Orders</span>
                <p className="text-lg font-black font-mono text-neutral-900 mt-0.5">
                  {selectedStats.onlineOrderCount}
                </p>
              </div>
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200/70">
                <span className="text-[10px] font-bold uppercase text-neutral-500 block">POS Counter Orders</span>
                <p className="text-lg font-black font-mono text-neutral-900 mt-0.5">
                  {selectedStats.posOrderCount}
                </p>
              </div>
              <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200/70">
                <span className="text-[10px] font-bold uppercase text-emerald-700 block">Collected / Paid</span>
                <p className="text-lg font-black font-mono text-emerald-900 mt-0.5">
                  ৳{selectedStats.paidRevenue.toLocaleString('en-BD')}
                </p>
              </div>
              <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200/70">
                <span className="text-[10px] font-bold uppercase text-amber-800 block">COD Due Pending</span>
                <p className="text-lg font-black font-mono text-amber-900 mt-0.5">
                  ৳{selectedStats.pendingCollectionRevenue.toLocaleString('en-BD')}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs pt-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">By Payment Gateway</p>
              {(['cod', 'bkash', 'nagad', 'rocket'] as const).map((method) => (
                <div key={method} className="flex justify-between py-1 border-b border-neutral-100">
                  <span className="uppercase font-semibold text-neutral-700">{method}</span>
                  <span className="font-mono font-bold text-neutral-900">
                    ৳{selectedStats.paymentBreakdown[method].toLocaleString('en-BD')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3 text-xs">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-100 pb-2.5">
              Purchases &amp; Returns Impact ({periodTitle})
            </h3>
            <div className="flex justify-between py-1 border-b border-neutral-100">
              <span className="text-neutral-600">Period Stock Purchases ({selectedStats.purchasesCount} bills)</span>
              <span className="font-mono font-bold text-neutral-900">
                ৳{selectedStats.purchasesTotal.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-neutral-100">
              <span className="text-neutral-600">Paid to Suppliers / Remaining Due</span>
              <span className="font-mono">
                <b className="text-emerald-700">৳{selectedStats.purchasesPaid.toLocaleString('en-BD')}</b>
                {' · '}
                <b className="text-amber-700">Due ৳{selectedStats.purchasesDue.toLocaleString('en-BD')}</b>
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-neutral-100">
              <span className="text-neutral-600">Returned Orders ({selectedStats.returnedCount})</span>
              <span className="font-mono font-semibold text-amber-700">
                ৳{selectedStats.returnedAmount.toLocaleString('en-BD')} (excluded from sales)
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-neutral-600">Cancelled Orders ({selectedStats.cancelledCount})</span>
              <span className="font-mono font-semibold text-red-700">
                ৳{selectedStats.cancelledAmount.toLocaleString('en-BD')} (excluded from sales)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* STOCK VALUATION & PURCHASE RECONCILIATION AUDIT */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-5 tabular-nums">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
              <Package className="w-4 h-4" />
              <span>Stock Valuation &amp; Purchase Amount Match Audit</span>
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Complete inventory count, cost vs retail stock value, and verification between Total Purchases and Current Stock
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stockAudit.matchStatus === 'matched' ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Purchase &amp; Stock Matched
              </span>
            ) : stockAudit.matchStatus === 'missing_cost_prices' ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> {stockAudit.productsMissingCost.length} Products Need Cost Price
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg">
                <BarChart3 className="w-4 h-4 text-blue-600" /> Opening / Direct Stock Difference Detected
              </span>
            )}
          </div>
        </div>

        {/* 5 Stock KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Catalog Products</span>
            <p className="text-xl font-black font-mono text-neutral-900 mt-1">{stockAudit.totalProducts}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {stockAudit.activeProducts} active · {stockAudit.outOfStockCount} out
            </p>
          </div>

          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Current Stock Qty</span>
            <p className="text-xl font-black font-mono text-neutral-900 mt-1">
              {stockAudit.totalStockPcs.toLocaleString('en-BD')} pcs
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {stockAudit.lowStockCount} low stock (&lt;5)
            </p>
          </div>

          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Stock Cost Value</span>
            <p className="text-xl font-black font-mono text-neutral-900 mt-1">
              ৳{stockAudit.stockCostValue.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">Actual buying capital</p>
          </div>

          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Stock Selling Value</span>
            <p className="text-xl font-black font-mono text-neutral-900 mt-1">
              ৳{stockAudit.stockSellingValue.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">At retail / sale price</p>
          </div>

          <div className="col-span-2 md:col-span-1 p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Potential Profit</span>
            <p className="text-xl font-black font-mono text-emerald-950 mt-1">
              ৳{stockAudit.expectedStockProfit.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-emerald-800 mt-0.5">Selling − Cost Value</p>
          </div>
        </div>

        {/* Reconciliation Comparison Table */}
        <div className="overflow-x-auto border border-neutral-200 rounded-xl">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
              <tr>
                <th className="p-3.5">Reconciliation Metric</th>
                <th className="p-3.5 text-right">Pieces (Qty)</th>
                <th className="p-3.5 text-right">Amount (৳ Cost Value)</th>
                <th className="p-3.5">Accounting Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              <tr>
                <td className="p-3.5 font-semibold text-neutral-900 flex items-center gap-2">
                  <ShoppingCart className="w-3.5 h-3.5 text-neutral-500" /> Total Recorded Purchases (All-Time)
                </td>
                <td className="p-3.5 text-right font-mono">{stockAudit.totalPurchasedPcs.toLocaleString('en-BD')} pcs</td>
                <td className="p-3.5 text-right font-mono font-bold text-neutral-900">
                  ৳{stockAudit.totalPurchasedAmount.toLocaleString('en-BD')}
                </td>
                <td className="p-3.5 text-neutral-500">
                  {stockAudit.stockSyncedPurchasedPcs} pcs (৳{stockAudit.stockSyncedPurchasedAmount.toLocaleString('en-BD')}) synced via Purchases tab
                </td>
              </tr>
              <tr>
                <td className="p-3.5 font-semibold text-neutral-900 flex items-center gap-2">
                  <Wallet className="w-3.5 h-3.5 text-neutral-500" /> Less: Sold Inventory Cost (COGS All-Time)
                </td>
                <td className="p-3.5 text-right font-mono text-amber-700">
                  −{stockAudit.totalSoldPcs.toLocaleString('en-BD')} pcs
                </td>
                <td className="p-3.5 text-right font-mono font-bold text-amber-700">
                  −৳{stockAudit.totalSoldCOGS.toLocaleString('en-BD')}
                </td>
                <td className="p-3.5 text-neutral-500">Excludes cancelled &amp; returned orders</td>
              </tr>
              <tr className="bg-neutral-50/70">
                <td className="p-3.5 font-bold text-neutral-800">Expected Remaining Stock (Purchases − Sold)</td>
                <td className="p-3.5 text-right font-mono font-bold">
                  {stockAudit.expectedStockPcsFromPurchases.toLocaleString('en-BD')} pcs
                </td>
                <td className="p-3.5 text-right font-mono font-bold">
                  ৳{stockAudit.expectedStockValueFromPurchases.toLocaleString('en-BD')}
                </td>
                <td className="p-3.5 text-neutral-500">Theoretical balance strictly from Purchase Bills</td>
              </tr>
              <tr className="bg-neutral-50/70">
                <td className="p-3.5 font-bold text-neutral-900">Actual Live Catalog Stock (Products Inventory)</td>
                <td className="p-3.5 text-right font-mono font-black text-neutral-900">
                  {stockAudit.totalStockPcs.toLocaleString('en-BD')} pcs
                </td>
                <td className="p-3.5 text-right font-mono font-black text-neutral-900">
                  ৳{stockAudit.stockCostValue.toLocaleString('en-BD')}
                </td>
                <td className="p-3.5 text-neutral-500">Live sum of product stock × buying cost price</td>
              </tr>
              <tr>
                <td className="p-3.5 font-black text-neutral-900">Variance (Actual Stock − Expected From Purchases)</td>
                <td
                  className={`p-3.5 text-right font-mono font-black ${
                    stockAudit.pcsVariance === 0
                      ? 'text-emerald-700'
                      : stockAudit.pcsVariance > 0
                        ? 'text-blue-700'
                        : 'text-red-700'
                  }`}
                >
                  {stockAudit.pcsVariance > 0 ? '+' : ''}
                  {stockAudit.pcsVariance.toLocaleString('en-BD')} pcs
                </td>
                <td
                  className={`p-3.5 text-right font-mono font-black ${
                    Math.abs(stockAudit.valueVariance) <= 100
                      ? 'text-emerald-700'
                      : stockAudit.valueVariance > 0
                        ? 'text-blue-700'
                        : 'text-red-700'
                  }`}
                >
                  {stockAudit.valueVariance > 0 ? '+' : stockAudit.valueVariance < 0 ? '-' : ''}৳
                  {Math.abs(Math.round(stockAudit.valueVariance)).toLocaleString('en-BD')}
                </td>
                <td className="p-3.5 text-neutral-600">
                  {Math.abs(stockAudit.valueVariance) <= 100 && stockAudit.pcsVariance === 0
                    ? 'Purchases and remaining inventory balance match exactly.'
                    : stockAudit.pcsVariance >= 0
                      ? 'Positive variance indicates initial/opening stock added directly in Products Catalog without a Purchase Bill.'
                      : 'Negative variance: check if product stock was deducted manually or purchase entry is missing.'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Inline Quick-Fix for Products Missing Cost Price */}
        {stockAudit.productsMissingCost.length > 0 && (
          <div className="border border-amber-200 bg-amber-50/40 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>{stockAudit.productsMissingCost.length} Catalog Products Have No Buying Cost Price Set</span>
                </h4>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Enter each product&apos;s actual cost price (৳) below so Stock Cost Value and Profit &amp; Loss are 100% exact.
                </p>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('products')}
                  className="text-xs font-bold text-amber-900 hover:underline cursor-pointer shrink-0"
                >
                  Open Products Catalog →
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {stockAudit.productsMissingCost.slice(0, 8).map((prod) => {
                const sellPrice = prod.salePrice && prod.salePrice > 0 ? prod.salePrice : prod.price;
                const isSaved = savedCostIds[prod.id];
                return (
                  <div
                    key={prod.id}
                    className="bg-white border border-amber-200/80 rounded-lg p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-neutral-900 truncate">{prod.name}</p>
                      <p className="text-[11px] text-neutral-500 font-mono">
                        Stock: {prod.totalStock || 0} pcs · Sell: ৳{sellPrice.toLocaleString('en-BD')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        placeholder="Cost ৳"
                        value={costDrafts[prod.id] ?? ''}
                        onChange={(e) =>
                          setCostDrafts((prev) => ({ ...prev, [prod.id]: e.target.value }))
                        }
                        className="w-24 px-2 py-1.5 text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-md focus:outline-none focus:border-black"
                      />
                      <button
                        type="button"
                        disabled={savingCostId === prod.id || !(Number(costDrafts[prod.id]) > 0)}
                        onClick={() => handleSaveProductCost(prod)}
                        className="px-2.5 py-1.5 bg-black text-white text-[11px] font-bold rounded-md hover:bg-neutral-800 disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
                      >
                        {isSaved ? <Check className="w-3.5 h-3.5" /> : null}
                        <span>{savingCostId === prod.id ? '...' : 'Save'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* TARGETS SETTINGS MODAL */}
      {targetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                <Target className="w-4 h-4" />
                <span>Configure Daily &amp; Monthly Targets</span>
              </h3>
              <button
                type="button"
                onClick={() => setTargetModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTargets} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                    Daily Sale Target (৳)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={targetDraft.dailyAmountTarget}
                    onChange={(e) =>
                      setTargetDraft((prev) => ({
                        ...prev,
                        dailyAmountTarget: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                    Daily Pieces Target (Pcs)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={targetDraft.dailyPcsTarget}
                    onChange={(e) =>
                      setTargetDraft((prev) => ({
                        ...prev,
                        dailyPcsTarget: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                    Monthly Sale Target (৳)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={targetDraft.monthlyAmountTarget}
                    onChange={(e) =>
                      setTargetDraft((prev) => ({
                        ...prev,
                        monthlyAmountTarget: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                    Monthly Pieces Target (Pcs)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={targetDraft.monthlyPcsTarget}
                    onChange={(e) =>
                      setTargetDraft((prev) => ({
                        ...prev,
                        monthlyPcsTarget: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                  Monthly Net Profit Target (৳)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={targetDraft.monthlyProfitTarget}
                  onChange={(e) =>
                    setTargetDraft((prev) => ({
                      ...prev,
                      monthlyProfitTarget: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono font-bold"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setTargetModalOpen(false)}
                  className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 font-bold uppercase rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTargets}
                  className="flex-1 py-2.5 bg-black text-white font-bold uppercase rounded-lg hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
                >
                  {savingTargets ? 'Saving...' : 'Save Targets'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
