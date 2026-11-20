import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ShoppingBag,
  DollarSign,
  Package,
  AlertTriangle,
  Users,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Wallet,
  Coins,
  BarChart3,
  Receipt,
  Building2,
  ShoppingCart,
  Target,
  X,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  PlusCircle,
  Truck,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import {
  Order,
  Product,
  ExpenseEntry,
  PurchaseEntry,
  Supplier,
  PartnerDeskConfig,
  SalesTargetsConfig,
  SalesReturnEntry,
  CustomerProfile,
} from '../types';
import { AdminTab, AdminPageHeader } from './AdminLayout';
import { orderService } from '../services/orderService';
import { productService } from '../services/productService';
import { posService } from '../services/posService';
import { useAuth } from '../context/AuthContext';
import {
  getLocalDateKey,
  getLocalMonthKey,
  addLocalDays,
  addLocalMonths,
  getMonthDateBounds,
  computePeriodAccounting,
  computeDailySeries,
  computeStockAudit,
  computeCustomerMetrics,
  getOrderDateKey,
} from '../lib/accountingUtils';
import { formatDatePart, formatTimePart } from '../lib/dateFormat';
import { DailyPerformanceChart } from '../components/admin/FinancialCharts';

interface AdminDashboardProps {
  onNavigateTab: (tab: AdminTab) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateTab }) => {
  const { hasMenuPermission, isSuperAdmin } = useAuth();
  const [orders, setOrders] = useState<Order[]>(() => orderService.getInstantOrders());
  const [products, setProducts] = useState<Product[]>(() => productService.getInstantAllProducts());
  const [registeredUsers, setRegisteredUsers] = useState<Array<Partial<CustomerProfile>>>(() =>
    posService.getInstantRegisteredUsers()
  );
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(() => posService.getInstantExpenses());
  const [purchases, setPurchases] = useState<PurchaseEntry[]>(() => posService.getInstantPurchases());
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => posService.getInstantSuppliers());
  const [salesReturns, setSalesReturns] = useState<SalesReturnEntry[]>(() => posService.getInstantReturns());
  const [targets, setTargets] = useState<SalesTargetsConfig>(() => posService.getInstantTargets());
  const [partnerDesks, setPartnerDesks] = useState<PartnerDeskConfig[]>(() =>
    posService.getInstantPartnerDesks()
  );
  const [crmCustomers, setCrmCustomers] = useState<CustomerProfile[]>(() =>
    posService.getInstantCrmCustomers()
  );

  // Live local date & month ticker + independent per-section calendar filter state
  const [todayKey, setTodayKey] = useState<string>(() => getLocalDateKey());
  const [monthKey, setMonthKey] = useState<string>(() => getLocalMonthKey());
  const [sectionDates, setSectionDates] = useState<
    Record<string, { dayKey?: string; monthKey?: string }>
  >({});
  const [openCalendarId, setOpenCalendarId] = useState<string | null>(null);

  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetForm, setTargetForm] = useState<SalesTargetsConfig>(() => posService.getInstantTargets());
  const [savingTargets, setSavingTargets] = useState(false);

  const customerCount = useMemo(() => {
    const uniqueCustomers = new Set<string>();
    registeredUsers.forEach((u) => {
      const id = u.uid || u.email || u.phone;
      if (id) uniqueCustomers.add(String(id).toLowerCase());
    });
    crmCustomers.forEach((c) => {
      const id = c.uid || c.email || c.phone;
      if (id) uniqueCustomers.add(String(id).toLowerCase());
    });
    orders.forEach((o) => {
      const id =
        o.customerId && o.customerId !== 'guest'
          ? o.customerId
          : o.customerEmail || o.customerPhone;
      if (id) uniqueCustomers.add(String(id).toLowerCase());
    });
    return uniqueCustomers.size;
  }, [orders, registeredUsers, crmCustomers]);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextDay = getLocalDateKey();
      const nextMonth = getLocalMonthKey();
      setTodayKey((prev) => (prev !== nextDay ? nextDay : prev));
      setMonthKey((prev) => (prev !== nextMonth ? nextMonth : prev));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubOrders = orderService.subscribeToAllOrdersAdmin(setOrders);
    const unsubProducts = productService.subscribeToAllProductsAdmin(setProducts);
    const unsubUsers = posService.subscribeToRegisteredUsers(setRegisteredUsers);
    const unsubExp = posService.subscribeToExpenses(setExpenses);
    const unsubPur = posService.subscribeToPurchases(setPurchases);
    const unsubSup = posService.subscribeToSuppliers(setSuppliers);
    const unsubRet = posService.subscribeToReturns(setSalesReturns);
    const unsubTargets = posService.subscribeToTargets((nextTargets) => {
      setTargets(nextTargets);
      setTargetForm((prev) => (showTargetModal ? prev : nextTargets));
    });
    const unsubDesks = posService.subscribeToPartnerDesks(setPartnerDesks);
    const unsubCrm = posService.subscribeToCrmCustomers(setCrmCustomers);

    return () => {
      unsubOrders();
      unsubProducts();
      unsubUsers();
      unsubExp();
      unsubPur();
      unsubSup();
      unsubRet();
      unsubTargets();
      unsubDesks();
      unsubCrm();
    };
  }, [showTargetModal]);

  const openTargetModal = () => {
    setTargetForm({ ...targets });
    setShowTargetModal(true);
  };

  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTargets(true);
    try {
      const saved = await posService.saveTargets(targetForm);
      setTargets(saved);
      setShowTargetModal(false);
    } finally {
      setSavingTargets(false);
    }
  };

  const renderTargetCard = (opts: {
    title: string;
    current: number;
    target: number;
    prefix?: string;
    suffix?: string;
    subtitle?: string;
  }) => {
    const safeTarget = Math.max(0, Number(opts.target) || 0);
    const pctRaw = safeTarget > 0 ? (opts.current / safeTarget) * 100 : 0;
    const pctClamped = Math.max(0, Math.min(100, pctRaw));
    const achieved = safeTarget > 0 && opts.current >= safeTarget;
    const isNegative = opts.current < 0;
    const remaining = Math.max(0, safeTarget - opts.current);
    const surplus = Math.max(0, opts.current - safeTarget);
    const fmt = (n: number) =>
      `${n < 0 ? '-' : ''}${opts.prefix || ''}${Math.abs(Math.round(n)).toLocaleString('en-BD')}${opts.suffix || ''}`;

    return (
      <div className="bg-white p-3.5 rounded-xl border border-neutral-200 space-y-2 tabular-nums">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            {opts.title}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
              achieved
                ? 'bg-emerald-100 text-emerald-800'
                : isNegative
                  ? 'bg-red-100 text-red-700'
                  : 'bg-neutral-100 text-neutral-700'
            }`}
          >
            {Math.max(0, pctRaw).toFixed(0)}%
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-lg sm:text-xl font-black font-mono ${isNegative ? 'text-red-700' : 'text-neutral-900'}`}>
            {fmt(opts.current)}
          </p>
          <span className="text-[11px] font-mono text-neutral-400">
            / {fmt(safeTarget)}
          </span>
        </div>

        <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden border border-neutral-200/70">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              achieved ? 'bg-emerald-600' : isNegative ? 'bg-red-500' : 'bg-neutral-900'
            }`}
            style={{ width: `${pctClamped}%` }}
          />
        </div>

        <p className="text-[11px] text-neutral-500 truncate">
          {safeTarget <= 0 ? (
            'Target not set'
          ) : achieved ? (
            <span className="text-emerald-700 font-semibold">Achieved ✓ (+{fmt(surplus)})</span>
          ) : (
            <span>Rem: {fmt(remaining)}</span>
          )}
          {opts.subtitle ? ` · ${opts.subtitle}` : ''}
        </p>
      </div>
    );
  };

  const yesterdayKey = useMemo(() => addLocalDays(todayKey, -1), [todayKey]);
  const lastMonthKey = useMemo(() => addLocalMonths(monthKey, -1), [monthKey]);

  const getSecDay = useCallback(
    (id: string) => sectionDates[id]?.dayKey || todayKey,
    [sectionDates, todayKey]
  );
  const getSecMonth = useCallback(
    (id: string) => sectionDates[id]?.monthKey || monthKey,
    [sectionDates, monthKey]
  );

  const setSecDay = useCallback(
    (id: string, val: string) => {
      setSectionDates((prev) => {
        const cur = prev[id] || {};
        if (val === todayKey) {
          const { dayKey: _removed, ...rest } = cur;
          return { ...prev, [id]: rest };
        }
        return { ...prev, [id]: { ...cur, dayKey: val } };
      });
    },
    [todayKey]
  );

  const setSecMonth = useCallback(
    (id: string, val: string) => {
      setSectionDates((prev) => {
        const cur = prev[id] || {};
        if (val === monthKey) {
          const { monthKey: _removed, ...rest } = cur;
          return { ...prev, [id]: rest };
        }
        return { ...prev, [id]: { ...cur, monthKey: val } };
      });
    },
    [monthKey]
  );

  // Memoize unique active day keys and month keys across all sections so only changed sections recompute
  const dayStatsCache = useMemo(() => {
    const keys = new Set<string>([todayKey]);
    Object.values(sectionDates).forEach((entry) => {
      if (entry?.dayKey) keys.add(entry.dayKey);
    });
    const cache: Record<string, ReturnType<typeof computePeriodAccounting>> = {};
    keys.forEach((dk) => {
      cache[dk] = computePeriodAccounting({
        orders,
        products,
        expenses,
        purchases,
        salesReturns,
        startDateKey: dk,
        endDateKey: dk,
      });
    });
    return cache;
  }, [orders, products, expenses, purchases, salesReturns, todayKey, sectionDates]);

  const monthStatsCache = useMemo(() => {
    const keys = new Set<string>([monthKey]);
    Object.values(sectionDates).forEach((entry) => {
      if (entry?.monthKey) keys.add(entry.monthKey);
    });
    const cache: Record<string, ReturnType<typeof computePeriodAccounting>> = {};
    keys.forEach((mk) => {
      const bounds = getMonthDateBounds(mk);
      cache[mk] = computePeriodAccounting({
        orders,
        products,
        expenses,
        purchases,
        salesReturns,
        startDateKey: bounds.startKey,
        endDateKey: bounds.endKey,
      });
    });
    return cache;
  }, [orders, products, expenses, purchases, salesReturns, monthKey, sectionDates]);

  const getDayStats = (id: string) => dayStatsCache[getSecDay(id)] || dayStatsCache[todayKey];
  const getMonthStats = (id: string) => monthStatsCache[getSecMonth(id)] || monthStatsCache[monthKey];

  // Independent per-section keys & computed snapshots
  const secTodayKey = getSecDay('sec_today');
  const secTodayIsLive = secTodayKey === todayKey;
  const secTodayStats = getDayStats('sec_today');

  const secMonthlyKey = getSecMonth('sec_monthly');
  const secMonthlyIsLive = secMonthlyKey === monthKey;
  const secMonthlyBounds = useMemo(() => getMonthDateBounds(secMonthlyKey), [secMonthlyKey]);
  const secMonthlyStats = getMonthStats('sec_monthly');

  const secCustDayKey = getSecDay('sec_customers');
  const secCustMonthKey = getSecMonth('sec_customers');
  const customerMetrics = useMemo(
    () =>
      computeCustomerMetrics({
        orders,
        customers: crmCustomers,
        todayKey: secCustDayKey,
        monthKey: secCustMonthKey,
      }),
    [orders, crmCustomers, secCustDayKey, secCustMonthKey]
  );

  const secStockDayKey = getSecDay('sec_stock');
  const secStockMonthKey = getSecMonth('sec_stock');
  const secStockFiltered = secStockDayKey !== todayKey || secStockMonthKey !== monthKey;
  const secStockPeriodStats =
    secStockDayKey !== todayKey ? getDayStats('sec_stock') : getMonthStats('sec_stock');

  const secDailyTargetKey = getSecDay('sec_daily_targets');
  const secDailyTargetStats = getDayStats('sec_daily_targets');

  const secMonthlyTargetKey = getSecMonth('sec_monthly_targets');
  const secMonthlyTargetBounds = useMemo(
    () => getMonthDateBounds(secMonthlyTargetKey),
    [secMonthlyTargetKey]
  );
  const secMonthlyTargetStats = getMonthStats('sec_monthly_targets');

  const secStatsDayKey = getSecDay('sec_stats');
  const secStatsDayIsLive = secStatsDayKey === todayKey;
  const secStatsDay = getDayStats('sec_stats');
  const secStatsMonthKey = getSecMonth('sec_stats');
  const secStatsMonthBounds = useMemo(() => getMonthDateBounds(secStatsMonthKey), [secStatsMonthKey]);
  const secStatsMonth = getMonthStats('sec_stats');

  const secDailyBdKey = getSecDay('sec_daily_breakdown');
  const secDailyBdIsLive = secDailyBdKey === todayKey;
  const secDailyBdStats = getDayStats('sec_daily_breakdown');

  const secMonthlyBdKey = getSecMonth('sec_monthly_breakdown');
  const secMonthlyBdBounds = useMemo(() => getMonthDateBounds(secMonthlyBdKey), [secMonthlyBdKey]);
  const secMonthlyBdStats = getMonthStats('sec_monthly_breakdown');

  const secWorkflowDayKey = getSecDay('sec_workflow');
  const secWorkflowMonthKey = getSecMonth('sec_workflow');
  const secWorkflowBounds = useMemo(() => getMonthDateBounds(secWorkflowMonthKey), [secWorkflowMonthKey]);
  const secWorkflowMonthStats = getMonthStats('sec_workflow');
  const secWorkflowFiltered = secWorkflowDayKey !== todayKey || secWorkflowMonthKey !== monthKey;

  const secChartDayKey = getSecDay('sec_chart');
  const dailySeries = useMemo(
    () =>
      computeDailySeries({
        orders,
        products,
        expenses,
        salesReturns,
        days: 14,
        endDateKey: secChartDayKey,
      }),
    [orders, products, expenses, salesReturns, secChartDayKey]
  );

  const allTimeStats = useMemo(
    () =>
      computePeriodAccounting({
        orders,
        products,
        expenses,
        purchases,
        salesReturns,
      }),
    [orders, products, expenses, purchases, salesReturns]
  );

  const lowStockThresh = targets.lowStockThresholdDefault || 5;
  const stockAudit = useMemo(
    () => computeStockAudit({ products, purchases, orders, lowStockThreshold: lowStockThresh }),
    [products, purchases, orders, lowStockThresh]
  );

  const totalSupplierDue = suppliers.reduce((sum, s) => sum + (Number(s.dueAmount) || 0), 0);

  const totalOrders = orders.length;
  const pendingOrdersCount = orders.filter((o) => o.orderStatus === 'pending').length;
  const processingOrdersCount = orders.filter(
    (o) =>
      o.orderStatus === 'confirmed' ||
      o.orderStatus === 'processing' ||
      o.orderStatus === 'packed' ||
      o.orderStatus === 'shipped'
  ).length;
  const completedOrdersCount = orders.filter((o) => o.orderStatus === 'delivered').length;

  const secRecentDayKey = getSecDay('sec_recent_orders');
  const secRecentMonthKey = getSecMonth('sec_recent_orders');
  const secRecentDayLive = secRecentDayKey === todayKey;
  const secRecentMonthLive = secRecentMonthKey === monthKey;
  const secRecentBounds = useMemo(() => getMonthDateBounds(secRecentMonthKey), [secRecentMonthKey]);
  const sortedRecentOrders = useMemo(() => {
    const base = !secRecentDayLive
      ? orders.filter((o) => getOrderDateKey(o) === secRecentDayKey)
      : !secRecentMonthLive
        ? orders.filter((o) => {
            const dk = getOrderDateKey(o) || '';
            return dk >= secRecentBounds.startKey && dk <= secRecentBounds.endKey;
          })
        : orders;

    return [...base]
      .sort((a, b) => {
        const da = new Date(a.createdAt || 0).getTime() || 0;
        const dbTime = new Date(b.createdAt || 0).getTime() || 0;
        return dbTime - da;
      })
      .slice(0, 8);
  }, [orders, secRecentDayLive, secRecentMonthLive, secRecentDayKey, secRecentBounds]);

  // 4-Desk Order Workflow Counts (scoped independently if sec_workflow calendar is adjusted)
  const pipelineCounts = useMemo(() => {
    const scopedOrders = secWorkflowDayKey !== todayKey
      ? orders.filter((o) => getOrderDateKey(o) === secWorkflowDayKey)
      : secWorkflowMonthKey !== monthKey
        ? orders.filter((o) => {
            const dk = getOrderDateKey(o) || '';
            return dk >= secWorkflowBounds.startKey && dk <= secWorkflowBounds.endKey;
          })
        : orders;

    return {
      order_verification: scopedOrders.filter(
        (o) => orderService.getOrderPipelineStage(o) === 'order_verification'
      ).length,
      payment_verification: scopedOrders.filter(
        (o) => orderService.getOrderPipelineStage(o) === 'payment_verification'
      ).length,
      inventory_packing: scopedOrders.filter(
        (o) => orderService.getOrderPipelineStage(o) === 'inventory_packing'
      ).length,
      delivery_dispatch: scopedOrders.filter(
        (o) => orderService.getOrderPipelineStage(o) === 'delivery_dispatch'
      ).length,
    };
  }, [orders, secWorkflowDayKey, secWorkflowMonthKey, todayKey, monthKey, secWorkflowBounds]);

  const renderCalendarButton = (
    id: string,
    mode: 'day' | 'month' | 'both' = 'day',
    align: 'left' | 'right' = 'right'
  ) => {
    const curDay = getSecDay(id);
    const curMonth = getSecMonth(id);
    const curDayIsToday = curDay === todayKey;
    const curDayIsYesterday = curDay === yesterdayKey;
    const curMonthIsLive = curMonth === monthKey;
    const curMonthIsLast = curMonth === lastMonthKey;

    const isOpen = openCalendarId === id;
    const isFiltered =
      mode === 'day'
        ? !curDayIsToday
        : mode === 'month'
          ? !curMonthIsLive
          : !curDayIsToday || !curMonthIsLive;

    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          title="Check Previous Day / Previous Month"
          onClick={(e) => {
            e.stopPropagation();
            setOpenCalendarId(isOpen ? null : id);
          }}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
            isFiltered || isOpen
              ? 'bg-black text-white border-black'
              : 'bg-white text-neutral-600 border-neutral-200 hover:border-black hover:text-black'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          {isFiltered && (
            <span className="font-mono text-[10px]">
              {mode === 'month' || (mode === 'both' && curDayIsToday) ? curMonth : curDay}
            </span>
          )}
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setOpenCalendarId(null)}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              className={`absolute top-full mt-1.5 z-40 w-64 bg-white border border-neutral-200 rounded-xl shadow-xl p-3 space-y-2.5 text-xs ${
                align === 'right' ? 'right-0' : 'left-0'
              }`}
            >
              {(mode === 'day' || mode === 'both') && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                      Select Day
                    </span>
                    {!curDayIsToday && (
                      <button
                        type="button"
                        onClick={() => {
                          setSecDay(id, todayKey);
                          setOpenCalendarId(null);
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                      >
                        Reset Today
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSecDay(id, todayKey);
                        setOpenCalendarId(null);
                      }}
                      className={`py-1 rounded-md text-[11px] font-bold border cursor-pointer ${
                        curDayIsToday
                          ? 'bg-black text-white border-black'
                          : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-black'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSecDay(id, yesterdayKey);
                        setOpenCalendarId(null);
                      }}
                      className={`py-1 rounded-md text-[11px] font-bold border cursor-pointer ${
                        curDayIsYesterday
                          ? 'bg-black text-white border-black'
                          : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-black'
                      }`}
                    >
                      Yesterday
                    </button>
                  </div>
                  <div className="flex items-center border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50">
                    <button
                      type="button"
                      title="Previous Day"
                      onClick={() => setSecDay(id, addLocalDays(curDay, -1))}
                      className="p-1.5 hover:bg-neutral-200 text-neutral-700 cursor-pointer border-r border-neutral-200"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="date"
                      value={curDay}
                      max={todayKey}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSecDay(id, e.target.value);
                        }
                      }}
                      className="flex-1 px-2 py-1 text-[11px] font-mono text-neutral-900 bg-transparent focus:outline-none cursor-pointer"
                    />
                    <button
                      type="button"
                      title="Next Day"
                      disabled={curDay >= todayKey}
                      onClick={() => {
                        const next = addLocalDays(curDay, 1);
                        if (next <= todayKey) setSecDay(id, next);
                      }}
                      className="p-1.5 hover:bg-neutral-200 text-neutral-700 cursor-pointer border-l border-neutral-200 disabled:opacity-35 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {(mode === 'month' || mode === 'both') && (
                <div className={`space-y-1.5 ${mode === 'both' ? 'pt-2 border-t border-neutral-100' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                      Select Month
                    </span>
                    {!curMonthIsLive && (
                      <button
                        type="button"
                        onClick={() => {
                          setSecMonth(id, monthKey);
                          setOpenCalendarId(null);
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                      >
                        Reset Current
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSecMonth(id, monthKey);
                        setOpenCalendarId(null);
                      }}
                      className={`py-1 rounded-md text-[11px] font-bold border cursor-pointer ${
                        curMonthIsLive
                          ? 'bg-black text-white border-black'
                          : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-black'
                      }`}
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSecMonth(id, lastMonthKey);
                        setOpenCalendarId(null);
                      }}
                      className={`py-1 rounded-md text-[11px] font-bold border cursor-pointer ${
                        curMonthIsLast
                          ? 'bg-black text-white border-black'
                          : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-black'
                      }`}
                    >
                      Last Month
                    </button>
                  </div>
                  <div className="flex items-center border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50">
                    <button
                      type="button"
                      title="Previous Month"
                      onClick={() => setSecMonth(id, addLocalMonths(curMonth, -1))}
                      className="p-1.5 hover:bg-neutral-200 text-neutral-700 cursor-pointer border-r border-neutral-200"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="month"
                      value={curMonth}
                      max={monthKey}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSecMonth(id, e.target.value);
                        }
                      }}
                      className="flex-1 px-2 py-1 text-[11px] font-mono text-neutral-900 bg-transparent focus:outline-none cursor-pointer"
                    />
                    <button
                      type="button"
                      title="Next Month"
                      disabled={curMonth >= monthKey}
                      onClick={() => {
                        const next = addLocalMonths(curMonth, 1);
                        if (next <= monthKey) setSecMonth(id, next);
                      }}
                      className="p-1.5 hover:bg-neutral-200 text-neutral-700 cursor-pointer border-l border-neutral-200 disabled:opacity-35 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Dashboard & Store Overview"
        subtitle={`Real-time POS, Orders & P&L (${todayKey})`}
        actions={
          <>

            {(isSuperAdmin || hasMenuPermission('pnl') || hasMenuPermission('settings')) && (
              <button
                onClick={openTargetModal}
                className="px-3 py-2 bg-white border border-neutral-200 hover:border-black text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Target className="w-3.5 h-3.5" />
                <span>Edit Targets</span>
              </button>
            )}

            {hasMenuPermission('pnl') && (
              <button
                onClick={() => onNavigateTab('pnl')}
                className="px-3 py-2 bg-white border border-neutral-200 hover:border-black text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                Profit &amp; Loss
              </button>
            )}
          </>
        }
      />

      {/* Quick Action Buttons Strip */}
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {hasMenuPermission('pos') && (
            <button
              type="button"
              onClick={() => onNavigateTab('pos')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Receipt className="w-3.5 h-3.5 shrink-0" />
              <span>New Sale (POS)</span>
            </button>
          )}

          {hasMenuPermission('products') && (
            <button
              type="button"
              onClick={() => onNavigateTab('products')}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Add Product</span>
            </button>
          )}

          {hasMenuPermission('customers') && (
            <button
              type="button"
              onClick={() => onNavigateTab('customers')}
              className="px-4 py-2 bg-white border border-blue-400 text-blue-600 hover:bg-blue-50 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span>Add Customer</span>
            </button>
          )}

          {hasMenuPermission('purchases') && (
            <button
              type="button"
              onClick={() => onNavigateTab('purchases')}
              className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 hover:border-neutral-900 hover:text-neutral-950 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
              <span>New Purchase</span>
            </button>
          )}

          {hasMenuPermission('expenses') && (
            <button
              type="button"
              onClick={() => onNavigateTab('expenses')}
              className="px-4 py-2 bg-white border border-red-400 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Wallet className="w-3.5 h-3.5 shrink-0" />
              <span>Add Expense</span>
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

      {/* SECTION 1: TODAY OVERVIEW (4 CARDS) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>
              {secTodayIsLive
                ? `Today (${secTodayKey})`
                : secTodayKey === yesterdayKey
                  ? `Yesterday (${secTodayKey})`
                  : `Day (${secTodayKey})`}
            </span>
          </span>
          <div className="flex items-center gap-2">
            {renderCalendarButton('sec_today', 'day')}
            {hasMenuPermission('orders') && (
              <button
                type="button"
                onClick={() => onNavigateTab('orders')}
                className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
              >
                View Orders →
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          <div
            onClick={() => hasMenuPermission('orders') && onNavigateTab('orders')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                {secTodayIsLive ? 'Today Orders' : 'Day Orders'}
              </span>
              <ShoppingBag className="w-4 h-4 text-neutral-700" />
            </div>
            <p className="text-xl font-black text-neutral-900 font-mono">{secTodayStats.totalOrdersAll}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {secTodayStats.deliveredCount} delivered · {secTodayStats.pendingOrdersCount + secTodayStats.processingOrdersCount} active · {secTodayStats.cancelledCount} cancel
            </p>
          </div>

          <div
            onClick={() => hasMenuPermission('sales_history') && onNavigateTab('sales_history')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                {secTodayIsLive ? 'Today Sales' : 'Day Sales'}
              </span>
              <BarChart3 className="w-4 h-4 text-neutral-700" />
            </div>
            <p className="text-xl font-black text-neutral-900 font-mono">
              ৳{secTodayStats.totalBilledRevenue.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {secTodayStats.validOrderCount} delivered · {secTodayStats.unitsSold} pcs
            </p>
          </div>

          <div
            onClick={() => hasMenuPermission('pnl') && onNavigateTab('pnl')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-colors ${
              secTodayStats.netProfit >= 0
                ? 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-500'
                : 'bg-red-50/50 border-red-200 hover:border-red-500'
            }`}
          >
            <div
              className={`flex items-center justify-between mb-1 ${
                secTodayStats.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wider">
                {secTodayIsLive ? 'Today' : 'Day'} {secTodayStats.netProfit >= 0 ? 'Profit' : 'Loss'}
              </span>
              <Wallet className="w-4 h-4" />
            </div>
            <p
              className={`text-xl font-black font-mono ${
                secTodayStats.netProfit >= 0 ? 'text-emerald-950' : 'text-red-700'
              }`}
            >
              {secTodayStats.netProfit < 0 ? '-' : ''}৳{Math.abs(secTodayStats.netProfit).toLocaleString('en-BD')}
            </p>
            <p className={`text-[11px] mt-0.5 truncate ${secTodayStats.netProfit >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
              Gross ৳{secTodayStats.grossProfit.toLocaleString('en-BD')} − Exp ৳{secTodayStats.totalExpenses.toLocaleString('en-BD')}
            </p>
          </div>

          <div
            onClick={() => hasMenuPermission('expenses') && onNavigateTab('expenses')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                {secTodayIsLive ? 'Today Expense' : 'Day Expense'}
              </span>
              <Coins className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-xl font-black text-red-700 font-mono">
              ৳{secTodayStats.totalExpenses.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {secTodayStats.expenseCount} entries →
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2: MONTHLY OVERVIEW (4 CARDS) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>
              Monthly ({secMonthlyBounds.label})
              {!secMonthlyIsLive ? ' · Archive' : ''}
            </span>
          </span>
          <div className="flex items-center gap-2">
            {renderCalendarButton('sec_monthly', 'month')}
            {hasMenuPermission('pnl') && (
              <button
                type="button"
                onClick={() => onNavigateTab('pnl')}
                className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
              >
                Monthly P&amp;L →
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          <div
            onClick={() => hasMenuPermission('orders') && onNavigateTab('orders')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Monthly Orders</span>
              <ShoppingBag className="w-4 h-4 text-neutral-700" />
            </div>
            <p className="text-xl font-black text-neutral-900 font-mono">{secMonthlyStats.totalOrdersAll}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {secMonthlyStats.deliveredCount} delivered · {secMonthlyStats.pendingOrdersCount + secMonthlyStats.processingOrdersCount} active · {secMonthlyStats.cancelledCount} cancel
            </p>
          </div>

          <div
            onClick={() => hasMenuPermission('sales_history') && onNavigateTab('sales_history')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Monthly Sales</span>
              <TrendingUp className="w-4 h-4 text-neutral-800" />
            </div>
            <p className="text-xl font-black text-neutral-900 font-mono">
              ৳{secMonthlyStats.totalBilledRevenue.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {secMonthlyStats.validOrderCount} delivered · {secMonthlyStats.unitsSold} pcs
            </p>
          </div>

          <div
            onClick={() => hasMenuPermission('pnl') && onNavigateTab('pnl')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-colors ${
              secMonthlyStats.netProfit >= 0
                ? 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-500'
                : 'bg-red-50/50 border-red-200 hover:border-red-500'
            }`}
          >
            <div
              className={`flex items-center justify-between mb-1 ${
                secMonthlyStats.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Monthly {secMonthlyStats.netProfit >= 0 ? 'Profit' : 'Loss'}
              </span>
              <DollarSign className="w-4 h-4" />
            </div>
            <p
              className={`text-xl font-black font-mono ${
                secMonthlyStats.netProfit >= 0 ? 'text-emerald-950' : 'text-red-700'
              }`}
            >
              {secMonthlyStats.netProfit < 0 ? '-' : ''}৳{Math.abs(secMonthlyStats.netProfit).toLocaleString('en-BD')}
            </p>
            <p className={`text-[11px] mt-0.5 truncate ${secMonthlyStats.netProfit >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
              Gross ৳{secMonthlyStats.grossProfit.toLocaleString('en-BD')} − Exp ৳{secMonthlyStats.totalExpenses.toLocaleString('en-BD')}
            </p>
          </div>

          <div
            onClick={() => hasMenuPermission('expenses') && onNavigateTab('expenses')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Monthly Expense</span>
              <Coins className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-xl font-black text-red-700 font-mono">
              ৳{secMonthlyStats.totalExpenses.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {secMonthlyStats.expenseCount} entries →
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 3: CUSTOMERS (4 CARDS) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>Customers</span>
          </span>
          <div className="flex items-center gap-2">
            {renderCalendarButton('sec_customers', 'both')}
            {hasMenuPermission('customers') && (
              <button
                type="button"
                onClick={() => onNavigateTab('customers')}
                className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
              >
                Manage →
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          <div
            onClick={() => hasMenuPermission('customers') && onNavigateTab('customers')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Customers</span>
              <Users className="w-4 h-4 text-neutral-700" />
            </div>
            <p className="text-xl font-black text-neutral-900 font-mono">
              {Math.max(customerCount, customerMetrics.totalCustomers)}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              Active: {customerMetrics.activeCustomers} · Repeat: {customerMetrics.returningCustomers}
            </p>
          </div>

          <div
            onClick={() => hasMenuPermission('customers') && onNavigateTab('customers')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">New Customers</span>
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xl font-black text-neutral-900 font-mono">{customerMetrics.newThisMonth}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {secCustDayKey === todayKey ? 'Today' : secCustDayKey}: <b>{customerMetrics.newToday}</b> · {secCustMonthKey === monthKey ? 'Month' : secCustMonthKey}: <b>{customerMetrics.newThisMonth}</b>
            </p>
          </div>

          <div
            onClick={() => hasMenuPermission('customers') && onNavigateTab('customers')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Customer Due</span>
              <Wallet className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-xl font-black text-red-700 font-mono">
              ৳{customerMetrics.totalCustomerDue.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {customerMetrics.customersWithDue} accounts · {secCustDayKey === todayKey ? 'Today' : secCustDayKey} ৳{customerMetrics.todayDue.toLocaleString('en-BD')}
            </p>
          </div>

          <div
            onClick={() => hasMenuPermission('customers') && onNavigateTab('customers')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Customer Paid</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black text-emerald-700 font-mono">
              ৳{customerMetrics.totalPaidByCustomers.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {secCustMonthKey === monthKey ? 'Month Due' : `${secCustMonthKey} Due`}: ৳{customerMetrics.monthlyDue.toLocaleString('en-BD')}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 4: STOCK (4 CARDS) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" />
            <span>Stock &amp; Valuation</span>
          </span>
          <div className="flex items-center gap-2">
            {renderCalendarButton('sec_stock', 'both')}
            {(hasMenuPermission('stock') || hasMenuPermission('products')) && (
              <button
                type="button"
                onClick={() => onNavigateTab(hasMenuPermission('stock') ? 'stock' : 'products')}
                className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
              >
                Stock Control →
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          <div
            onClick={() => onNavigateTab(hasMenuPermission('stock') ? 'stock' : 'products')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Stock Qty</span>
              <Package className="w-4 h-4 text-neutral-700" />
            </div>
            <p className="text-xl font-black text-neutral-900 font-mono">
              {stockAudit.totalStockPcs.toLocaleString('en-BD')} pcs
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {secStockFiltered
                ? `Period Sold: ${secStockPeriodStats.unitsSold.toLocaleString('en-BD')} pcs`
                : `${stockAudit.totalProducts} items · Sold ${stockAudit.soldQty.toLocaleString('en-BD')} pcs`}
            </p>
          </div>

          <div
            onClick={() => onNavigateTab(hasMenuPermission('stock') ? 'stock' : 'products')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Stock Cost Value</span>
              <ShoppingCart className="w-4 h-4 text-neutral-700" />
            </div>
            <p className="text-xl font-black text-neutral-900 font-mono">
              ৳{stockAudit.stockCostValue.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {secStockFiltered
                ? `Period Purchased: ৳${secStockPeriodStats.purchasesTotal.toLocaleString('en-BD')}`
                : `Purchased: ৳${stockAudit.totalPurchasedAmount.toLocaleString('en-BD')}`}
            </p>
          </div>

          <div
            onClick={() => onNavigateTab(hasMenuPermission('stock') ? 'stock' : 'products')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Stock Selling Value</span>
              <DollarSign className="w-4 h-4 text-emerald-700" />
            </div>
            <p className="text-xl font-black text-emerald-700 font-mono">
              ৳{stockAudit.stockSellingValue.toLocaleString('en-BD')}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              Est. Profit: ৳{stockAudit.expectedStockProfit.toLocaleString('en-BD')}
            </p>
          </div>

          <div
            onClick={() => onNavigateTab(hasMenuPermission('stock') ? 'stock' : 'products')}
            className="bg-white p-3.5 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Low / Out Stock</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-xl font-black font-mono text-neutral-900">
              <span className="text-amber-700">{stockAudit.lowStockCount}</span>
              <span className="text-neutral-300 mx-1">/</span>
              <span className="text-red-700">{stockAudit.outOfStockCount}</span>
            </p>
            <p className="text-[11px] font-semibold mt-0.5 truncate text-neutral-600">
              {stockAudit.matchStatus === 'matched' ? (
                <span className="text-emerald-700">Audit Matched ✓</span>
              ) : (
                <span className="text-blue-700">Check Stock →</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 5: DAILY TARGETS (4 CARDS) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            <span>Daily Targets ({secDailyTargetKey})</span>
          </span>
          <div className="flex items-center gap-2">
            {renderCalendarButton('sec_daily_targets', 'day')}
            {(isSuperAdmin || hasMenuPermission('pnl') || hasMenuPermission('settings')) && (
              <button
                type="button"
                onClick={openTargetModal}
                className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
              >
                Edit Targets →
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          {renderTargetCard({
            title: 'Daily Order Target',
            current: secDailyTargetStats.totalOrdersAll,
            target: targets.dailyOrderTarget || 0,
            subtitle: `${secDailyTargetStats.deliveredCount} deliv`,
          })}
          {renderTargetCard({
            title: 'Daily Sales Target',
            current: secDailyTargetStats.totalBilledRevenue,
            target: targets.dailyAmountTarget,
            prefix: '৳',
          })}
          {renderTargetCard({
            title: 'Daily Profit Target',
            current: secDailyTargetStats.netProfit,
            target: targets.dailyProfitTarget || 0,
            prefix: '৳',
          })}
          {renderTargetCard({
            title: 'Daily Qty Target',
            current: secDailyTargetStats.unitsSold,
            target: targets.dailyPcsTarget,
            suffix: ' pcs',
          })}
        </div>
      </div>

      {/* SECTION 6: MONTHLY TARGETS (4 CARDS) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            <span>Monthly Targets ({secMonthlyTargetBounds.label})</span>
          </span>
          <div className="flex items-center gap-2">
            {renderCalendarButton('sec_monthly_targets', 'month')}
            {(isSuperAdmin || hasMenuPermission('pnl') || hasMenuPermission('settings')) && (
              <button
                type="button"
                onClick={openTargetModal}
                className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
              >
                Edit Targets →
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          {renderTargetCard({
            title: 'Monthly Order Target',
            current: secMonthlyTargetStats.totalOrdersAll,
            target: targets.monthlyOrderTarget || 0,
            subtitle: `${secMonthlyTargetStats.deliveredCount} deliv`,
          })}
          {renderTargetCard({
            title: 'Monthly Sales Target',
            current: secMonthlyTargetStats.totalBilledRevenue,
            target: targets.monthlyAmountTarget,
            prefix: '৳',
          })}
          {renderTargetCard({
            title: 'Monthly Profit Target',
            current: secMonthlyTargetStats.netProfit,
            target: targets.monthlyProfitTarget,
            prefix: '৳',
          })}
          {renderTargetCard({
            title: 'Monthly Qty Target',
            current: secMonthlyTargetStats.unitsSold,
            target: targets.monthlyPcsTarget,
            suffix: ' pcs',
          })}
        </div>
      </div>

      {/* SECTION 7: ORDER / CANCELLED / DELIVERED / RETURN BREAKDOWN */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Sales &amp; Order Statistics ({secStatsDayKey} &amp; {secStatsMonthBounds.label})</span>
          </span>
          <div className="flex items-center gap-2">
            {renderCalendarButton('sec_stats', 'both')}
            {hasMenuPermission('orders') && (
              <button
                type="button"
                onClick={() => onNavigateTab('orders')}
                className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
              >
                All Orders →
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          <div
            onClick={() => hasMenuPermission('orders') && onNavigateTab('orders')}
            className="bg-white p-4 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">Order</span>
              <ShoppingBag className="w-4 h-4 text-neutral-600" />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-neutral-500">Total Orders</span>
              <span className="font-mono font-bold text-right text-neutral-900">{totalOrders}</span>
              <span className="text-neutral-500">Monthly Orders</span>
              <span className="font-mono font-bold text-right text-neutral-900">{secStatsMonth.totalOrdersAll}</span>
              <span className="text-neutral-500">{secStatsDayIsLive ? 'Daily Orders' : 'Selected Day'}</span>
              <span className="font-mono font-bold text-right text-neutral-900">{secStatsDay.totalOrdersAll}</span>
              <span className="text-neutral-500">Pending</span>
              <span className="font-mono font-bold text-right text-amber-700">{pendingOrdersCount}</span>
              <span className="text-neutral-500">Processing</span>
              <span className="font-mono font-bold text-right text-blue-700">{processingOrdersCount}</span>
              <span className="text-neutral-500">Completed</span>
              <span className="font-mono font-bold text-right text-emerald-700">{completedOrdersCount}</span>
            </div>
          </div>

          <div
            onClick={() => hasMenuPermission('orders') && onNavigateTab('orders')}
            className="bg-white p-4 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-red-700">Cancelled</span>
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-neutral-500">{secStatsDayIsLive ? 'Daily Cancelled' : 'Day Cancelled'}</span>
              <span className="font-mono font-bold text-right text-red-700">{secStatsDay.cancelledCount}</span>
              <span className="text-neutral-500">Day Cancel Amt</span>
              <span className="font-mono font-semibold text-right text-neutral-700">
                ৳{secStatsDay.cancelledAmount.toLocaleString('en-BD')}
              </span>
              <span className="text-neutral-500">Monthly Cancelled</span>
              <span className="font-mono font-bold text-right text-red-700">{secStatsMonth.cancelledCount}</span>
              <span className="text-neutral-500">Month Cancel Amt</span>
              <span className="font-mono font-bold text-right text-red-700">
                ৳{secStatsMonth.cancelledAmount.toLocaleString('en-BD')}
              </span>
              <span className="text-neutral-500">All-Time Cancel Amt</span>
              <span className="font-mono font-semibold text-right text-neutral-700">
                ৳{allTimeStats.cancelledAmount.toLocaleString('en-BD')}
              </span>
            </div>
          </div>

          <div
            onClick={() => hasMenuPermission('sales_history') && onNavigateTab('sales_history')}
            className="bg-white p-4 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Delivered</span>
              <Truck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-neutral-500">{secStatsDayIsLive ? 'Daily Delivered' : 'Day Delivered'}</span>
              <span className="font-mono font-bold text-right text-emerald-700">{secStatsDay.deliveredCount}</span>
              <span className="text-neutral-500">Day Delivered Amt</span>
              <span className="font-mono font-bold text-right text-emerald-800">
                ৳{secStatsDay.deliveredAmount.toLocaleString('en-BD')}
              </span>
              <span className="text-neutral-500">Monthly Delivered</span>
              <span className="font-mono font-bold text-right text-emerald-700">{secStatsMonth.deliveredCount}</span>
              <span className="text-neutral-500">Month Deliv. Sales</span>
              <span className="font-mono font-bold text-right text-emerald-800">
                ৳{secStatsMonth.deliveredAmount.toLocaleString('en-BD')}
              </span>
              <span className="text-neutral-500">All-Time Delivered</span>
              <span className="font-mono font-semibold text-right text-neutral-700">
                ৳{allTimeStats.deliveredAmount.toLocaleString('en-BD')}
              </span>
            </div>
          </div>

          <div
            onClick={() => hasMenuPermission('returns') && onNavigateTab('returns')}
            className="bg-white p-4 rounded-xl border border-neutral-200 hover:border-black cursor-pointer transition-colors space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Return</span>
              <RotateCcw className="w-4 h-4 text-amber-600" />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-neutral-500">{secStatsDayIsLive ? 'Daily Returns' : 'Day Returns'}</span>
              <span className="font-mono font-bold text-right text-amber-700">
                {secStatsDay.returnedCount + secStatsDay.salesReturnsCount}
              </span>
              <span className="text-neutral-500">Monthly Returns</span>
              <span className="font-mono font-bold text-right text-amber-700">
                {secStatsMonth.returnedCount + secStatsMonth.salesReturnsCount}
              </span>
              <span className="text-neutral-500">Month Return Amt</span>
              <span className="font-mono font-bold text-right text-red-700">
                ৳{(secStatsMonth.returnedAmount + secStatsMonth.salesReturnsAmount).toLocaleString('en-BD')}
              </span>
              <span className="text-neutral-500">Returned Products</span>
              <span className="font-mono font-bold text-right text-neutral-900">
                {secStatsMonth.salesReturnsPcs} pcs
              </span>
              <span className="text-neutral-500">All-Time Return Amt</span>
              <span className="font-mono font-semibold text-right text-neutral-700">
                ৳{(allTimeStats.returnedAmount + allTimeStats.salesReturnsAmount).toLocaleString('en-BD')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 8: DAILY & MONTHLY FINANCIAL BREAKDOWN MATRICES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 tabular-nums">
        {/* Daily Sale & Profit Breakdown */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-3">
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-neutral-900">
                {secDailyBdIsLive ? 'Today Sale & Profit Breakdown' : `Day Sale & Profit (${secDailyBdKey})`}
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Delivered-completed sales split by channel, payment method &amp; net profit ({secDailyBdStats.validOrderCount} deliv.)
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {renderCalendarButton('sec_daily_breakdown', 'day')}
              {hasMenuPermission('sales_history') && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('sales_history')}
                  className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
                >
                  Sales History →
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Total Sales</span>
              <span className="font-mono font-black text-neutral-900 text-sm">
                ৳{secDailyBdStats.totalBilledRevenue.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Orders (Deliv / All)</span>
              <span className="font-mono font-black text-neutral-900 text-sm">
                {secDailyBdStats.validOrderCount} / {secDailyBdStats.totalOrdersAll}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200">
              <span className="text-[10px] font-bold uppercase text-emerald-700 block">Cash Sales</span>
              <span className="font-mono font-black text-emerald-900 text-sm">
                ৳{secDailyBdStats.cashSales.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-pink-50/60 border border-pink-200">
              <span className="text-[10px] font-bold uppercase text-pink-700 block">bKash Sales</span>
              <span className="font-mono font-black text-pink-900 text-sm">
                ৳{secDailyBdStats.bkashSales.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-orange-50/60 border border-orange-200">
              <span className="text-[10px] font-bold uppercase text-orange-700 block">Nagad Sales</span>
              <span className="font-mono font-black text-orange-900 text-sm">
                ৳{secDailyBdStats.nagadSales.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-purple-50/60 border border-purple-200">
              <span className="text-[10px] font-bold uppercase text-purple-700 block">Rocket Sales</span>
              <span className="font-mono font-black text-purple-900 text-sm">
                ৳{secDailyBdStats.rocketSales.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-red-50/50 border border-red-200">
              <span className="text-[10px] font-bold uppercase text-red-700 block">Due Sales</span>
              <span className="font-mono font-black text-red-800 text-sm">
                ৳{secDailyBdStats.dueSales.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Product / Other Disc.</span>
              <span className="font-mono font-bold text-neutral-900 text-sm">
                ৳{secDailyBdStats.otherDiscounts.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Coupon Discount</span>
              <span className="font-mono font-bold text-neutral-900 text-sm">
                ৳{secDailyBdStats.couponDiscounts.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Delivery Charge</span>
              <span className="font-mono font-bold text-neutral-900 text-sm">
                ৳{secDailyBdStats.deliveryCollected.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-sky-50/70 border border-sky-200">
              <span className="text-[10px] font-bold uppercase text-sky-800 block">Net Merch. Sales</span>
              <span className="font-mono font-black text-sky-950 text-sm">
                ৳{secDailyBdStats.netMerchandiseSales.toLocaleString('en-BD')}
              </span>
            </div>
            <div
              className={`p-2.5 rounded-lg border ${
                secDailyBdStats.netProfit >= 0
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              <span className="text-[10px] font-bold uppercase opacity-75 block">
                {secDailyBdIsLive ? 'Today Net Profit' : 'Day Net Profit'}
              </span>
              <span className="font-mono font-black text-sm">
                {secDailyBdStats.netProfit < 0 ? '-' : ''}৳{Math.abs(secDailyBdStats.netProfit).toLocaleString('en-BD')}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
            <span>
              COGS: <b className="font-mono text-neutral-800">৳{secDailyBdStats.cogs.toLocaleString('en-BD')}</b> · Gross:{' '}
              <b className="font-mono text-neutral-800">৳{secDailyBdStats.grossProfit.toLocaleString('en-BD')}</b> · Exp:{' '}
              <b className="font-mono text-red-700">৳{secDailyBdStats.totalExpenses.toLocaleString('en-BD')}</b>
            </span>
            <span className="font-mono font-semibold text-neutral-700">
              Net Margin: {secDailyBdStats.netMarginPct.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Monthly Sale & Profit Breakdown */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-3">
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-neutral-900">
                Monthly Sales &amp; Profit ({secMonthlyBdBounds.label})
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Delivered sales, returns, discounts, expenses &amp; monthly net profit ({secMonthlyBdStats.validOrderCount} deliv.)
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {renderCalendarButton('sec_monthly_breakdown', 'month')}
              {hasMenuPermission('pnl') && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('pnl')}
                  className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
                >
                  Full P&amp;L →
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Monthly Sales</span>
              <span className="font-mono font-black text-neutral-900 text-sm">
                ৳{secMonthlyBdStats.totalBilledRevenue.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Monthly Orders</span>
              <span className="font-mono font-black text-neutral-900 text-sm">{secMonthlyBdStats.totalOrdersAll}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200">
              <span className="text-[10px] font-bold uppercase text-emerald-700 block">Delivered Sales</span>
              <span className="font-mono font-black text-emerald-900 text-sm">
                ৳{secMonthlyBdStats.deliveredAmount.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-red-50/50 border border-red-200">
              <span className="text-[10px] font-bold uppercase text-red-700 block">Cancelled Sales</span>
              <span className="font-mono font-black text-red-800 text-sm">
                ৳{secMonthlyBdStats.cancelledAmount.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200">
              <span className="text-[10px] font-bold uppercase text-amber-800 block">Returned Sales</span>
              <span className="font-mono font-black text-amber-900 text-sm">
                ৳{(secMonthlyBdStats.returnedAmount + secMonthlyBdStats.salesReturnsAmount).toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Monthly Discounts</span>
              <span className="font-mono font-bold text-neutral-900 text-sm">
                ৳{secMonthlyBdStats.otherDiscounts.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Coupon Discounts</span>
              <span className="font-mono font-bold text-neutral-900 text-sm">
                ৳{secMonthlyBdStats.couponDiscounts.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Delivery Income</span>
              <span className="font-mono font-bold text-neutral-900 text-sm">
                ৳{secMonthlyBdStats.deliveryCollected.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-sky-50/70 border border-sky-200">
              <span className="text-[10px] font-bold uppercase text-sky-800 block">Monthly Net Sales</span>
              <span className="font-mono font-black text-sky-950 text-sm">
                ৳{secMonthlyBdStats.netMerchandiseSales.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <span className="text-[10px] font-bold uppercase text-neutral-500 block">Product COGS</span>
              <span className="font-mono font-bold text-neutral-900 text-sm">
                ৳{secMonthlyBdStats.cogs.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-red-50/50 border border-red-200">
              <span className="text-[10px] font-bold uppercase text-red-700 block">Monthly Expenses</span>
              <span className="font-mono font-bold text-red-700 text-sm">
                ৳{secMonthlyBdStats.totalExpenses.toLocaleString('en-BD')}
              </span>
            </div>
            <div
              className={`p-2.5 rounded-lg border ${
                secMonthlyBdStats.netProfit >= 0
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              <span className="text-[10px] font-bold uppercase opacity-75 block">Monthly Net Profit</span>
              <span className="font-mono font-black text-sm">
                {secMonthlyBdStats.netProfit < 0 ? '-' : ''}৳{Math.abs(secMonthlyBdStats.netProfit).toLocaleString('en-BD')}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
            <span>
              Online: <b className="font-mono text-neutral-800">{secMonthlyBdStats.onlineOrderCount}</b> · POS Counter:{' '}
              <b className="font-mono text-neutral-800">{secMonthlyBdStats.posOrderCount}</b> · Due:{' '}
              <b className="font-mono text-red-700">৳{secMonthlyBdStats.dueSales.toLocaleString('en-BD')}</b>
            </span>
            <span className="font-mono font-semibold text-neutral-700">
              Net Margin: {secMonthlyBdStats.netMarginPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 9: 4-PERSON ORDER WORKFLOW & PURCHASES/ACCOUNTS STRIP */}
      <div className="bg-white p-5 rounded-xl border border-neutral-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-neutral-900">
              4-Person Order Verification &amp; Fulfillment Pipeline
            </h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {secWorkflowFiltered
                ? `Filtered queue (${secWorkflowDayKey !== todayKey ? secWorkflowDayKey : secWorkflowBounds.label})`
                : 'Order Verify → Payment Verify → Stock & Packing → Delivery Dispatch'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {renderCalendarButton('sec_workflow', 'both')}
            {(hasMenuPermission('pipeline') ||
              hasMenuPermission('desk_order_verify') ||
              hasMenuPermission('desk_payment_verify') ||
              hasMenuPermission('desk_stock_packing') ||
              hasMenuPermission('desk_delivery_dispatch')) && (
              <button
                type="button"
                onClick={() =>
                  onNavigateTab(
                    hasMenuPermission('pipeline')
                      ? 'pipeline'
                      : hasMenuPermission('desk_order_verify')
                      ? 'desk_order_verify'
                      : hasMenuPermission('desk_payment_verify')
                      ? 'desk_payment_verify'
                      : hasMenuPermission('desk_stock_packing')
                      ? 'desk_stock_packing'
                      : 'desk_delivery_dispatch'
                  )
                }
                className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
              >
                Open Workflow →
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
          {partnerDesks.map((desk, idx) => {
            const count = pipelineCounts[desk.stage] || 0;
            const targetTab: AdminTab =
              desk.stage === 'order_verification'
                ? 'desk_order_verify'
                : desk.stage === 'payment_verification'
                ? 'desk_payment_verify'
                : desk.stage === 'inventory_packing'
                ? 'desk_stock_packing'
                : 'desk_delivery_dispatch';
            const canOpenDesk = hasMenuPermission(targetTab) || hasMenuPermission('pipeline');
            return (
              <div
                key={desk.stage}
                onClick={() => canOpenDesk && onNavigateTab(hasMenuPermission(targetTab) ? targetTab : 'pipeline')}
                className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 hover:border-black cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Step {idx + 1} · {desk.roleTitle}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-bold ${
                      count > 0 ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-600'
                    }`}
                  >
                    {count}
                  </span>
                </div>
                <p className="text-xs font-bold text-neutral-900 truncate">{desk.partnerName}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {count > 0 ? `${count} orders waiting` : 'Queue clear'}
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 tabular-nums">
          <div
            onClick={() => hasMenuPermission('purchases') && onNavigateTab('purchases')}
            className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center justify-between hover:border-black cursor-pointer transition-colors"
          >
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                {secWorkflowBounds.label} Purchases
              </span>
              <p className="text-base font-black text-neutral-900 font-mono mt-0.5">
                ৳{secWorkflowMonthStats.purchasesTotal.toLocaleString('en-BD')}
              </p>
            </div>
            <ShoppingCart className="w-4 h-4 text-neutral-500" />
          </div>

          <div
            onClick={() => hasMenuPermission('suppliers') && onNavigateTab('suppliers')}
            className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center justify-between hover:border-black cursor-pointer transition-colors"
          >
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Supplier Dues ({suppliers.length})
              </span>
              <p className="text-base font-black text-amber-700 font-mono mt-0.5">
                ৳{totalSupplierDue.toLocaleString('en-BD')}
              </p>
            </div>
            <Building2 className="w-4 h-4 text-amber-600" />
          </div>

          <div
            onClick={() => hasMenuPermission('pnl') && onNavigateTab('pnl')}
            className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center justify-between hover:border-black cursor-pointer transition-colors"
          >
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                All-Time Net Profit
              </span>
              <p className={`text-base font-black font-mono mt-0.5 ${allTimeStats.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {allTimeStats.netProfit < 0 ? '-' : ''}৳{Math.abs(allTimeStats.netProfit).toLocaleString('en-BD')}
              </p>
            </div>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* LIVE 14-DAY PERFORMANCE GRAPH */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>14-Day Trend Ending {secChartDayKey}</span>
          </span>
          <div className="flex items-center gap-2">
            {renderCalendarButton('sec_chart', 'day')}
            {hasMenuPermission('sales_history') && (
              <button
                type="button"
                onClick={() => onNavigateTab('sales_history')}
                className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
              >
                Sales Report →
              </button>
            )}
          </div>
        </div>
        <DailyPerformanceChart
          data={dailySeries}
          dailyAmountTarget={targets.dailyAmountTarget || 0}
          dailyPcsTarget={targets.dailyPcsTarget || 0}
        />
      </div>

      {/* RECENT CUSTOMER ORDERS TABLE */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-neutral-900">
              Recent Customer &amp; POS Orders
            </h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {!secRecentDayLive
                ? `Orders placed on ${secRecentDayKey}`
                : !secRecentMonthLive
                  ? `Orders placed in ${secRecentBounds.label}`
                  : 'Latest 8 orders placed across website checkout & POS counter'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {renderCalendarButton('sec_recent_orders', 'both')}
            {hasMenuPermission('orders') && (
              <button
                type="button"
                onClick={() => onNavigateTab('orders')}
                className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
              >
                View All Invoices →
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <th className="py-2.5 px-4">Order</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4">Items</th>
                <th className="py-2.5 px-4">Payment</th>
                <th className="py-2.5 px-4">Total</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Date &amp; Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {sortedRecentOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-400">
                    No orders recorded yet.
                  </td>
                </tr>
              ) : (
                sortedRecentOrders.map((ord) => {
                  const totalQty = (ord.items || []).reduce((s, i) => s + (Number(i.quantity) || 1), 0);
                  return (
                    <tr
                      key={ord.id}
                      onClick={() => hasMenuPermission('orders') && onNavigateTab('orders')}
                      className="hover:bg-neutral-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-neutral-900">
                        {ord.orderNumber}
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-neutral-100 text-[9px] font-sans uppercase text-neutral-600">
                          {ord.orderChannel === 'pos' ? 'POS' : 'WEB'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-neutral-900 truncate max-w-[160px]">{ord.customerName}</p>
                        <p className="text-[11px] font-mono text-neutral-500">{ord.customerPhone}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-neutral-700">{totalQty} pcs</td>
                      <td className="py-3 px-4 uppercase font-mono text-[11px] text-neutral-700">
                        {ord.paymentMethod} ·{' '}
                        <span className={ord.paymentStatus === 'paid' ? 'text-emerald-700 font-bold' : 'text-amber-700'}>
                          {ord.paymentStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-neutral-900">
                        ৳{(Number(ord.total) || 0).toLocaleString('en-BD')}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ord.orderStatus === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ord.orderStatus === 'cancelled' || ord.orderStatus === 'returned'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-neutral-100 text-neutral-800'
                          }`}
                        >
                          {ord.orderStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[11px] text-neutral-500">
                        {formatDatePart(ord.createdAt, 'Recent')} {formatTimePart(ord.createdAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>



      {/* Edit Daily & Monthly Targets Modal */}
      {showTargetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 overflow-y-auto">
          <form
            onSubmit={handleSaveTargets}
            className="bg-white border border-neutral-200 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold uppercase tracking-tight text-neutral-900">
                  Daily &amp; Monthly Business Targets
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Configure Order, Sales (৳), Net Profit (৳) &amp; Quantity (pcs) goals for Daily &amp; Monthly tracking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTargetModal(false)}
                className="p-1.5 text-neutral-500 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              <div className="space-y-3 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                <h4 className="font-bold uppercase tracking-wider text-neutral-800">Daily Targets</h4>
                <div>
                  <label className="block font-semibold text-neutral-600 mb-1">Daily Order Target (orders)</label>
                  <input
                    type="number"
                    min="0"
                    value={targetForm.dailyOrderTarget || 0}
                    onChange={(e) =>
                      setTargetForm({ ...targetForm, dailyOrderTarget: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-mono focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-600 mb-1">Daily Sales Target (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={targetForm.dailyAmountTarget || 0}
                    onChange={(e) =>
                      setTargetForm({ ...targetForm, dailyAmountTarget: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-mono focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-600 mb-1">Daily Profit Target (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={targetForm.dailyProfitTarget || 0}
                    onChange={(e) =>
                      setTargetForm({ ...targetForm, dailyProfitTarget: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-mono focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-600 mb-1">Daily Qty Target (pcs)</label>
                  <input
                    type="number"
                    min="0"
                    value={targetForm.dailyPcsTarget || 0}
                    onChange={(e) =>
                      setTargetForm({ ...targetForm, dailyPcsTarget: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-mono focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="space-y-3 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                <h4 className="font-bold uppercase tracking-wider text-neutral-800">Monthly Targets</h4>
                <div>
                  <label className="block font-semibold text-neutral-600 mb-1">Monthly Order Target (orders)</label>
                  <input
                    type="number"
                    min="0"
                    value={targetForm.monthlyOrderTarget || 0}
                    onChange={(e) =>
                      setTargetForm({ ...targetForm, monthlyOrderTarget: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-mono focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-600 mb-1">Monthly Sales Target (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={targetForm.monthlyAmountTarget || 0}
                    onChange={(e) =>
                      setTargetForm({ ...targetForm, monthlyAmountTarget: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-mono focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-600 mb-1">Monthly Profit Target (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={targetForm.monthlyProfitTarget || 0}
                    onChange={(e) =>
                      setTargetForm({ ...targetForm, monthlyProfitTarget: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-mono focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-600 mb-1">Monthly Qty Target (pcs)</label>
                  <input
                    type="number"
                    min="0"
                    value={targetForm.monthlyPcsTarget || 0}
                    onChange={(e) =>
                      setTargetForm({ ...targetForm, monthlyPcsTarget: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg font-mono focus:outline-none focus:border-black"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowTargetModal(false)}
                className="px-4 py-2 border border-neutral-300 text-neutral-700 text-xs font-bold uppercase tracking-wider rounded-lg hover:border-black cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingTargets}
                className="px-5 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer disabled:opacity-60"
              >
                {savingTargets ? 'Saving...' : 'Save All Targets'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
