import {
  ExpenseCategory,
  ExpenseEntry,
  Order,
  Product,
  PurchaseEntry,
} from '../types';

export const EXPENSE_CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; bnLabel: string; group: 'fixed' | 'variable' | 'financial' }
> = {
  rent: { label: 'Shop / Warehouse Rent', bnLabel: 'দোকান ও গুদাম ভাড়া', group: 'fixed' },
  salary: { label: 'Staff Salary & Allowance', bnLabel: 'স্টাফ বেতন ও বোনাস', group: 'fixed' },
  packaging_courier: { label: 'Packaging, Courier & COD Fee', bnLabel: 'প্যাকেজিং, কুরিয়ার ও COD চার্জ', group: 'variable' },
  marketing_ads: { label: 'Marketing & Facebook Ads', bnLabel: 'ফেসবুক বুস্ট ও মার্কেটিং', group: 'variable' },
  utilities: { label: 'Electricity, Internet & Utilities', bnLabel: 'বিদ্যুৎ, ইন্টারনেট ও ইউটিলিটি', group: 'fixed' },
  fabric_tailoring: { label: 'Tailoring, Ironing & Finishing', bnLabel: 'টেইলারিং, আয়রন ও ফিনিশিং', group: 'variable' },
  transport: { label: 'Transport & Conveyance', bnLabel: 'যাতায়াত ও মালামাল পরিবহন', group: 'variable' },
  maintenance: { label: 'Shop Repair & Maintenance', bnLabel: 'মেরামত ও রক্ষণাবেক্ষণ', group: 'fixed' },
  tax_fees: { label: 'MFS Cashout, Bank & VAT/Tax Fees', bnLabel: 'বিকাশ/নগদ ক্যাশআউট, ব্যাংক ও ভ্যাট চার্জ', group: 'financial' },
  other: { label: 'Miscellaneous & Petty Expense', bnLabel: 'অন্যান্য খুচরা খরচ', group: 'variable' },
};

export const EXPENSE_QUICK_PRESETS: Array<{
  title: string;
  category: ExpenseCategory;
  paymentMethod: ExpenseEntry['paymentMethod'];
  defaultNotes?: string;
}> = [
  { title: 'Facebook Boost & Ad Spend', category: 'marketing_ads', paymentMethod: 'bkash' },
  { title: 'Steadfast / Pathao Delivery & COD Charge', category: 'packaging_courier', paymentMethod: 'cash' },
  { title: 'bKash / Nagad Cashout Charge', category: 'tax_fees', paymentMethod: 'bkash' },
  { title: 'Packaging Poly, Carton & Tape', category: 'packaging_courier', paymentMethod: 'cash' },
  { title: 'Product Transport / CNG / Van ভাড়া', category: 'transport', paymentMethod: 'cash' },
  { title: 'Tailoring / Alteration & Steam Iron', category: 'fabric_tailoring', paymentMethod: 'cash' },
  { title: 'Electricity & Wi-Fi Bill', category: 'utilities', paymentMethod: 'bkash' },
  { title: 'Showroom / Warehouse Monthly Rent', category: 'rent', paymentMethod: 'bank' },
  { title: 'Staff Salary / Daily Lunch', category: 'salary', paymentMethod: 'cash' },
  { title: 'Shop Maintenance & Lighting', category: 'maintenance', paymentMethod: 'cash' },
];

export function getLocalDateKey(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getLocalMonthKey(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

export function addLocalDays(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateKey(dt);
}

export function addLocalMonths(monthKey: string, deltaMonths: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1 + deltaMonths, 1);
  return getLocalMonthKey(dt);
}

export function getMonthDateBounds(monthKey: string): {
  startKey: string;
  endKey: string;
  label: string;
} {
  const [y, m] = monthKey.split('-').map(Number);
  const year = y || new Date().getFullYear();
  const monthIdx = (m || 1) - 1;
  const firstDay = new Date(year, monthIdx, 1);
  const lastDay = new Date(year, monthIdx + 1, 0);
  const label = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return {
    startKey: getLocalDateKey(firstDay),
    endKey: getLocalDateKey(lastDay),
    label,
  };
}

export function parseOrderDate(ord: Order): Date | null {
  if (!ord?.createdAt) return null;
  if (typeof (ord.createdAt as any).toDate === 'function') {
    return (ord.createdAt as any).toDate();
  }
  if (typeof (ord.createdAt as any).toMillis === 'function') {
    return new Date((ord.createdAt as any).toMillis());
  }
  if (typeof (ord.createdAt as any).seconds === 'number') {
    return new Date((ord.createdAt as any).seconds * 1000);
  }
  const d = new Date(ord.createdAt as any);
  return isNaN(d.getTime()) ? null : d;
}

export function getOrderDateKey(ord: Order): string | null {
  const dt = parseOrderDate(ord);
  return dt ? getLocalDateKey(dt) : null;
}

export function normalizeEntryDateKey(dateStr?: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return dateStr.trim();
  }
  const dt = new Date(dateStr);
  return isNaN(dt.getTime()) ? dateStr.slice(0, 10) : getLocalDateKey(dt);
}

export function isDateKeyInRange(dateKey: string | null, startKey?: string, endKey?: string): boolean {
  if (!dateKey) return false;
  if (startKey && dateKey < startKey) return false;
  if (endKey && dateKey > endKey) return false;
  return true;
}

export function buildProductCostMap(products: Product[]): Map<string, number> {
  const map = new Map<string, number>();
  products.forEach((p) => {
    if (p.id && typeof p.costPrice === 'number' && p.costPrice > 0) {
      map.set(p.id, p.costPrice);
    }
  });
  return map;
}

export function getOrderCOGS(
  ord: Order,
  productCostMap: Map<string, number>
): { cogs: number; missingCostCount: number; missingCostValue: number; units: number } {
  let cogs = 0;
  let missingCostCount = 0;
  let missingCostValue = 0;
  let units = 0;

  (ord.items || []).forEach((item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    units += qty;
    const explicitCost = typeof item.unitCost === 'number' && item.unitCost > 0 ? item.unitCost : 0;
    const catalogCost = productCostMap.get(item.productId) || 0;
    const resolvedUnitCost = explicitCost || catalogCost;

    if (resolvedUnitCost > 0) {
      cogs += resolvedUnitCost * qty;
    } else {
      missingCostCount += qty;
      missingCostValue += (Number(item.unitPrice) || 0) * qty;
    }
  });

  return { cogs, missingCostCount, missingCostValue, units };
}

export interface PeriodAccountingSummary {
  startKey?: string;
  endKey?: string;
  // Orders
  totalOrdersAll: number;
  validOrderCount: number;
  onlineOrderCount: number;
  posOrderCount: number;
  unitsSold: number;
  cancelledCount: number;
  cancelledAmount: number;
  returnedCount: number;
  returnedAmount: number;
  // Revenue breakdown
  grossMerchandiseValue: number; // subtotal before discounts
  totalDiscounts: number; // coupon + online prepayment discounts
  netMerchandiseSales: number; // subtotal - discounts
  deliveryCollected: number; // shipping charges collected
  totalBilledRevenue: number; // netMerchandiseSales + deliveryCollected (actual order total)
  // Profitability
  cogs: number;
  missingCostItemsCount: number;
  missingCostSalesAmount: number;
  grossProfit: number; // totalBilledRevenue - cogs
  merchandiseGrossProfit: number; // netMerchandiseSales - cogs
  grossMarginPct: number;
  totalExpenses: number;
  expenseCount: number;
  expenseByCategory: Record<ExpenseCategory, number>;
  netProfit: number; // grossProfit - totalExpenses
  netMarginPct: number;
  // Cash & Payments
  paidRevenue: number;
  pendingCollectionRevenue: number;
  paymentBreakdown: Record<'cod' | 'bkash' | 'nagad' | 'rocket', number>;
  // Purchases in period
  purchasesTotal: number;
  purchasesPaid: number;
  purchasesDue: number;
  purchasesCount: number;
}

export function computePeriodAccounting(params: {
  orders: Order[];
  products: Product[];
  expenses: ExpenseEntry[];
  purchases: PurchaseEntry[];
  startDateKey?: string;
  endDateKey?: string;
}): PeriodAccountingSummary {
  const { orders, products, expenses, purchases, startDateKey, endDateKey } = params;
  const costMap = buildProductCostMap(products);

  const periodOrders = orders.filter((o) =>
    isDateKeyInRange(getOrderDateKey(o), startDateKey, endDateKey)
  );
  const periodExpenses = expenses.filter((e) =>
    isDateKeyInRange(normalizeEntryDateKey(e.date), startDateKey, endDateKey)
  );
  const periodPurchases = purchases.filter((p) =>
    isDateKeyInRange(normalizeEntryDateKey(p.date), startDateKey, endDateKey)
  );

  let validOrderCount = 0;
  let onlineOrderCount = 0;
  let posOrderCount = 0;
  let unitsSold = 0;
  let cancelledCount = 0;
  let cancelledAmount = 0;
  let returnedCount = 0;
  let returnedAmount = 0;

  let grossMerchandiseValue = 0;
  let totalDiscounts = 0;
  let netMerchandiseSales = 0;
  let deliveryCollected = 0;
  let totalBilledRevenue = 0;
  let cogs = 0;
  let missingCostItemsCount = 0;
  let missingCostSalesAmount = 0;

  let paidRevenue = 0;
  let pendingCollectionRevenue = 0;
  const paymentBreakdown: Record<'cod' | 'bkash' | 'nagad' | 'rocket', number> = {
    cod: 0,
    bkash: 0,
    nagad: 0,
    rocket: 0,
  };

  periodOrders.forEach((ord) => {
    const orderTotal = Number(ord.total) || 0;
    if (ord.orderStatus === 'cancelled') {
      cancelledCount += 1;
      cancelledAmount += orderTotal;
      return;
    }
    if (ord.orderStatus === 'returned') {
      returnedCount += 1;
      returnedAmount += orderTotal;
      return;
    }

    validOrderCount += 1;
    if (ord.orderChannel === 'pos') posOrderCount += 1;
    else onlineOrderCount += 1;

    const subtotal = Number(ord.subtotal) || 0;
    const disc = (Number(ord.discount) || 0) + (Number(ord.onlineDiscount) || 0);
    const deliv = Number(ord.deliveryCharge) || 0;
    const netMerch = Math.max(0, subtotal - disc);

    grossMerchandiseValue += subtotal;
    totalDiscounts += disc;
    netMerchandiseSales += netMerch;
    deliveryCollected += deliv;
    totalBilledRevenue += orderTotal > 0 ? orderTotal : netMerch + deliv;

    const costInfo = getOrderCOGS(ord, costMap);
    cogs += costInfo.cogs;
    missingCostItemsCount += costInfo.missingCostCount;
    missingCostSalesAmount += costInfo.missingCostValue;
    unitsSold += costInfo.units;

    const method = (ord.paymentMethod || 'cod') as 'cod' | 'bkash' | 'nagad' | 'rocket';
    if (paymentBreakdown[method] !== undefined) {
      paymentBreakdown[method] += orderTotal;
    }

    if (ord.paymentStatus === 'paid' || ord.orderStatus === 'delivered') {
      paidRevenue += orderTotal;
    } else {
      const adv = Number(ord.advanceAmount) || 0;
      paidRevenue += adv;
      pendingCollectionRevenue += Math.max(0, orderTotal - adv);
    }
  });

  const expenseByCategory: Record<ExpenseCategory, number> = {
    rent: 0,
    salary: 0,
    packaging_courier: 0,
    marketing_ads: 0,
    utilities: 0,
    fabric_tailoring: 0,
    transport: 0,
    maintenance: 0,
    tax_fees: 0,
    other: 0,
  };

  let totalExpenses = 0;
  periodExpenses.forEach((exp) => {
    const amt = Math.max(0, Number(exp.amount) || 0);
    totalExpenses += amt;
    if (expenseByCategory[exp.category] !== undefined) {
      expenseByCategory[exp.category] += amt;
    } else {
      expenseByCategory.other += amt;
    }
  });

  const grossProfit = totalBilledRevenue - cogs;
  const merchandiseGrossProfit = netMerchandiseSales - cogs;
  const netProfit = grossProfit - totalExpenses;
  const grossMarginPct = totalBilledRevenue > 0 ? (grossProfit / totalBilledRevenue) * 100 : 0;
  const netMarginPct = totalBilledRevenue > 0 ? (netProfit / totalBilledRevenue) * 100 : 0;

  let purchasesTotal = 0;
  let purchasesPaid = 0;
  let purchasesDue = 0;
  periodPurchases.forEach((pur) => {
    purchasesTotal += Number(pur.totalAmount) || 0;
    purchasesPaid += Number(pur.paidAmount) || 0;
    purchasesDue += Number(pur.dueAmount) || 0;
  });

  return {
    startKey: startDateKey,
    endKey: endDateKey,
    totalOrdersAll: periodOrders.length,
    validOrderCount,
    onlineOrderCount,
    posOrderCount,
    unitsSold,
    cancelledCount,
    cancelledAmount,
    returnedCount,
    returnedAmount,
    grossMerchandiseValue,
    totalDiscounts,
    netMerchandiseSales,
    deliveryCollected,
    totalBilledRevenue,
    cogs,
    missingCostItemsCount,
    missingCostSalesAmount,
    grossProfit,
    merchandiseGrossProfit,
    grossMarginPct,
    totalExpenses,
    expenseCount: periodExpenses.length,
    expenseByCategory,
    netProfit,
    netMarginPct,
    paidRevenue,
    pendingCollectionRevenue,
    paymentBreakdown,
    purchasesTotal,
    purchasesPaid,
    purchasesDue,
    purchasesCount: periodPurchases.length,
  };
}

export interface DailySeriesPoint {
  dateKey: string;
  shortLabel: string;
  fullLabel: string;
  sales: number;
  pcs: number;
  cogs: number;
  expenses: number;
  netProfit: number;
  orderCount: number;
}

export function computeDailySeries(params: {
  orders: Order[];
  products: Product[];
  expenses: ExpenseEntry[];
  days?: number;
  endDateKey?: string;
}): DailySeriesPoint[] {
  const { orders, products, expenses, days = 14, endDateKey = getLocalDateKey() } = params;
  const costMap = buildProductCostMap(products);
  const buckets = new Map<string, DailySeriesPoint>();

  for (let i = days - 1; i >= 0; i--) {
    const dk = addLocalDays(endDateKey, -i);
    const [y, m, d] = dk.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    buckets.set(dk, {
      dateKey: dk,
      shortLabel: dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
      fullLabel: dt.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' }),
      sales: 0,
      pcs: 0,
      cogs: 0,
      expenses: 0,
      netProfit: 0,
      orderCount: 0,
    });
  }

  orders.forEach((ord) => {
    if (ord.orderStatus === 'cancelled' || ord.orderStatus === 'returned') return;
    const dk = getOrderDateKey(ord);
    if (!dk) return;
    const b = buckets.get(dk);
    if (!b) return;
    const costInfo = getOrderCOGS(ord, costMap);
    b.sales += Number(ord.total) || 0;
    b.pcs += costInfo.units;
    b.cogs += costInfo.cogs;
    b.orderCount += 1;
  });

  expenses.forEach((exp) => {
    const dk = normalizeEntryDateKey(exp.date);
    const b = buckets.get(dk);
    if (!b) return;
    b.expenses += Math.max(0, Number(exp.amount) || 0);
  });

  return Array.from(buckets.values()).map((b) => ({
    ...b,
    netProfit: b.sales - b.cogs - b.expenses,
  }));
}

export interface MonthlySeriesPoint {
  monthKey: string;
  shortLabel: string;
  fullLabel: string;
  sales: number;
  pcs: number;
  cogs: number;
  expenses: number;
  totalCostAndExp: number;
  netProfit: number;
  purchases: number;
  orderCount: number;
}

export function computeMonthlySeries(params: {
  orders: Order[];
  products: Product[];
  expenses: ExpenseEntry[];
  purchases: PurchaseEntry[];
  months?: number;
  endMonthKey?: string;
}): MonthlySeriesPoint[] {
  const { orders, products, expenses, purchases, months = 6, endMonthKey = getLocalMonthKey() } = params;
  const costMap = buildProductCostMap(products);
  const buckets = new Map<string, MonthlySeriesPoint>();

  for (let i = months - 1; i >= 0; i--) {
    const mk = addLocalMonths(endMonthKey, -i);
    const [y, m] = mk.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, 1);
    buckets.set(mk, {
      monthKey: mk,
      shortLabel: dt.toLocaleDateString('en-US', { month: 'short' }),
      fullLabel: dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      sales: 0,
      pcs: 0,
      cogs: 0,
      expenses: 0,
      totalCostAndExp: 0,
      netProfit: 0,
      purchases: 0,
      orderCount: 0,
    });
  }

  orders.forEach((ord) => {
    if (ord.orderStatus === 'cancelled' || ord.orderStatus === 'returned') return;
    const dk = getOrderDateKey(ord);
    if (!dk) return;
    const mk = dk.slice(0, 7);
    const b = buckets.get(mk);
    if (!b) return;
    const costInfo = getOrderCOGS(ord, costMap);
    b.sales += Number(ord.total) || 0;
    b.pcs += costInfo.units;
    b.cogs += costInfo.cogs;
    b.orderCount += 1;
  });

  expenses.forEach((exp) => {
    const mk = normalizeEntryDateKey(exp.date).slice(0, 7);
    const b = buckets.get(mk);
    if (!b) return;
    b.expenses += Math.max(0, Number(exp.amount) || 0);
  });

  purchases.forEach((pur) => {
    const mk = normalizeEntryDateKey(pur.date).slice(0, 7);
    const b = buckets.get(mk);
    if (!b) return;
    b.purchases += Math.max(0, Number(pur.totalAmount) || 0);
  });

  return Array.from(buckets.values()).map((b) => ({
    ...b,
    totalCostAndExp: b.cogs + b.expenses,
    netProfit: b.sales - b.cogs - b.expenses,
  }));
}

export interface StockAuditSummary {
  totalProducts: number;
  activeProducts: number;
  totalStockPcs: number;
  lowStockCount: number;
  outOfStockCount: number;
  stockCostValue: number;
  stockSellingValue: number;
  expectedStockProfit: number;
  productsMissingCost: Product[];
  // Purchase-to-stock reconciliation
  totalPurchasedAmount: number;
  totalPurchasedPcs: number;
  stockSyncedPurchasedAmount: number;
  stockSyncedPurchasedPcs: number;
  totalSoldCOGS: number;
  totalSoldPcs: number;
  expectedStockValueFromPurchases: number;
  expectedStockPcsFromPurchases: number;
  valueVariance: number;
  pcsVariance: number;
  matchStatus: 'matched' | 'opening_or_manual_stock' | 'shortage_variance' | 'missing_cost_prices';
}

export function computeStockAudit(params: {
  products: Product[];
  purchases: PurchaseEntry[];
  orders: Order[];
}): StockAuditSummary {
  const { products, purchases, orders } = params;
  const costMap = buildProductCostMap(products);

  let activeProducts = 0;
  let totalStockPcs = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let stockCostValue = 0;
  let stockSellingValue = 0;
  const productsMissingCost: Product[] = [];

  products.forEach((p) => {
    if (p.active !== false) activeProducts += 1;
    const stock = Math.max(0, Number(p.totalStock) || 0);
    totalStockPcs += stock;
    if (stock <= 0) outOfStockCount += 1;
    else if (stock < 5) lowStockCount += 1;

    const unitCost = typeof p.costPrice === 'number' && p.costPrice > 0 ? p.costPrice : 0;
    const unitSell = p.salePrice && p.salePrice > 0 ? p.salePrice : Number(p.price) || 0;

    stockSellingValue += stock * unitSell;
    if (unitCost > 0) {
      stockCostValue += stock * unitCost;
    } else {
      productsMissingCost.push(p);
    }
  });

  let totalPurchasedAmount = 0;
  let totalPurchasedPcs = 0;
  let stockSyncedPurchasedAmount = 0;
  let stockSyncedPurchasedPcs = 0;

  purchases.forEach((pur) => {
    const amt = Number(pur.totalAmount) || 0;
    const pcs = (pur.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    totalPurchasedAmount += amt;
    totalPurchasedPcs += pcs;
    if (pur.stockSynced) {
      stockSyncedPurchasedAmount += amt;
      stockSyncedPurchasedPcs += pcs;
    }
  });

  let totalSoldCOGS = 0;
  let totalSoldPcs = 0;
  orders.forEach((ord) => {
    if (ord.orderStatus === 'cancelled' || ord.orderStatus === 'returned') return;
    const info = getOrderCOGS(ord, costMap);
    totalSoldCOGS += info.cogs;
    totalSoldPcs += info.units;
  });

  const expectedStockValueFromPurchases = Math.max(0, totalPurchasedAmount - totalSoldCOGS);
  const expectedStockPcsFromPurchases = Math.max(0, totalPurchasedPcs - totalSoldPcs);
  const valueVariance = stockCostValue - (totalPurchasedAmount - totalSoldCOGS);
  const pcsVariance = totalStockPcs - (totalPurchasedPcs - totalSoldPcs);

  let matchStatus: StockAuditSummary['matchStatus'] = 'matched';
  if (productsMissingCost.length > 0) {
    matchStatus = 'missing_cost_prices';
  } else if (Math.abs(valueVariance) <= 100 && pcsVariance === 0) {
    matchStatus = 'matched';
  } else if (pcsVariance > 0 || valueVariance > 100) {
    matchStatus = 'opening_or_manual_stock';
  } else {
    matchStatus = 'shortage_variance';
  }

  return {
    totalProducts: products.length,
    activeProducts,
    totalStockPcs,
    lowStockCount,
    outOfStockCount,
    stockCostValue,
    stockSellingValue,
    expectedStockProfit: stockSellingValue - stockCostValue,
    productsMissingCost,
    totalPurchasedAmount,
    totalPurchasedPcs,
    stockSyncedPurchasedAmount,
    stockSyncedPurchasedPcs,
    totalSoldCOGS,
    totalSoldPcs,
    expectedStockValueFromPurchases,
    expectedStockPcsFromPurchases,
    valueVariance,
    pcsVariance,
    matchStatus,
  };
}
