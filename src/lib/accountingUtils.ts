import {
  CustomerProfile,
  ExpenseCategory,
  ExpenseEntry,
  Order,
  Product,
  PurchaseEntry,
  SalesReturnEntry,
  SalesTargetsConfig,
  TargetArchiveRecord,
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
  { title: 'Product Photography & Studio Shoot', category: 'marketing_ads', paymentMethod: 'cash' },
  { title: 'Website, Domain & Cloud Maintenance', category: 'utilities', paymentMethod: 'bkash' },
  { title: 'Shop Maintenance & Lighting', category: 'maintenance', paymentMethod: 'cash' },
];

const DEFAULT_ZONE_CHARGES: Array<{ id: string; name: string; charge: number }> = [
  { id: 'dhaka', name: 'Inside Dhaka City', charge: 70 },
  { id: 'outside-dhaka', name: 'Outside Dhaka (Nationwide)', charge: 130 },
];

function readConfiguredDeliveryZones(): Array<{ id?: string; name?: string; charge?: number }> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('selvee_delivery_zones_v3');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
  }
  return DEFAULT_ZONE_CHARGES;
}

/**
 * Resolves the courier delivery charge absorbed by the seller when a customer
 * receives Free Delivery (deliveryCharge === 0 on a delivered/courier order).
 * Returns 0 when the customer paid delivery (deliveryCharge > 0) or for POS
 * in-store pickup orders where no courier delivery is required.
 */
export function getOrderFreeDeliveryFee(ord?: Order | null): number {
  if (!ord) return 0;
  const customerShipping = Math.max(
    0,
    Number(ord.deliveryCharge ?? ord.pipeline?.financialSnapshot?.shippingCharge ?? 0) || 0
  );
  if (customerShipping > 0) return 0;

  if (ord.orderChannel === 'pos' && !ord.deliveryRequired) return 0;

  const isFreeDeliveryOrder =
    Boolean(ord.freeDeliveryApplied) ||
    ord.orderChannel !== 'pos' ||
    Boolean(ord.deliveryRequired);

  if (!isFreeDeliveryOrder) return 0;

  const recFee = ord.pipeline?.codReconciliation?.freeDeliveryFee;
  if (typeof recFee === 'number' && !isNaN(recFee)) {
    return Math.max(0, recFee);
  }
  if (typeof ord.freeDeliveryCost === 'number' && !isNaN(ord.freeDeliveryCost)) {
    return Math.max(0, ord.freeDeliveryCost);
  }
  const snapFee = ord.pipeline?.financialSnapshot?.freeDeliveryCharge;
  if (typeof snapFee === 'number' && !isNaN(snapFee)) {
    return Math.max(0, snapFee);
  }

  const zones = readConfiguredDeliveryZones();
  const zoneStr = (ord.deliveryZone || '').trim().toLowerCase();
  const districtStr = (ord.shippingAddress?.district || '').trim().toLowerCase();

  if (zoneStr && !zoneStr.includes('walk-in') && !zoneStr.includes('in-store')) {
    const exactMatch = zones.find((z) => (z.name || '').trim().toLowerCase() === zoneStr);
    if (exactMatch && typeof exactMatch.charge === 'number') {
      return Math.max(0, exactMatch.charge);
    }
    if (zoneStr.includes('outside')) {
      const outZone = zones.find(
        (z) => z.id === 'outside-dhaka' || (z.name || '').toLowerCase().includes('outside')
      );
      return Math.max(0, Number(outZone?.charge ?? 130) || 130);
    }
    if (zoneStr.includes('inside') || zoneStr.includes('dhaka')) {
      const inZone = zones.find(
        (z) => z.id === 'dhaka' || (z.name || '').toLowerCase().includes('inside')
      );
      return Math.max(0, Number(inZone?.charge ?? 70) || 70);
    }
  }

  if (districtStr && districtStr !== 'dhaka') {
    const outZone = zones.find(
      (z) => z.id === 'outside-dhaka' || (z.name || '').toLowerCase().includes('outside')
    );
    return Math.max(0, Number(outZone?.charge ?? 130) || 130);
  }

  const inZone = zones.find(
    (z) => z.id === 'dhaka' || (z.name || '').toLowerCase().includes('inside')
  );
  return Math.max(0, Number(inZone?.charge ?? 70) || 70);
}

export function getOrderRecognizedSale(ord: Order): number {
  if (!ord) return 0;
  const total = Number(ord.total) || 0;
  const rec = ord.pipeline?.codReconciliation;
  const codCharge = Math.max(0, Number(rec?.codCharge ?? ord.codCharge ?? 0) || 0);
  const deliv = Math.max(0, Number(ord.deliveryCharge) || 0);
  const freeDelivFee = getOrderFreeDeliveryFee(ord);

  if (rec?.resolved && typeof rec.collectedCash === 'number') {
    const expectedCash = Math.max(0, Number(rec.expectedCash ?? 0));
    const preCollectionPaid = Math.max(0, total - expectedCash);
    return Math.max(0, preCollectionPaid + rec.collectedCash - deliv - freeDelivFee - codCharge);
  }
  if (typeof ord.netSaleAmount === 'number' && !isNaN(ord.netSaleAmount)) {
    return Math.max(0, ord.netSaleAmount);
  }
  if (rec?.resolved && typeof rec.finalSaleAmount === 'number' && !isNaN(rec.finalSaleAmount)) {
    return Math.max(0, rec.finalSaleAmount);
  }
  return Math.max(0, total - freeDelivFee - codCharge);
}

export function getOrderPaidAndDue(ord: Order): { total: number; paid: number; due: number } {
  const total = getOrderRecognizedSale(ord);
  if (ord.orderStatus === 'cancelled' || ord.orderStatus === 'returned') {
    const refundedPaid = ord.paymentStatus === 'refunded' ? 0 : Math.max(0, Number(ord.paidAmount) || 0);
    return { total, paid: refundedPaid, due: 0 };
  }
  if (typeof ord.paidAmount === 'number' && typeof ord.dueAmount === 'number') {
    const paid = Math.max(0, Math.min(total, ord.paidAmount));
    const due = Math.max(0, ord.dueAmount);
    return { total, paid, due };
  }
  if (ord.paymentStatus === 'paid' || ord.orderStatus === 'delivered') {
    return { total, paid: total, due: 0 };
  }
  const advance = Math.max(0, Number(ord.advanceAmount ?? ord.paymentDetails?.advanceAmount) || 0);
  const due =
    typeof ord.dueOnDelivery === 'number'
      ? Math.max(0, ord.dueOnDelivery)
      : Math.max(0, total - advance);
  return { total, paid: Math.min(total, advance), due };
}

export function getOrderCustomerPaidAndDue(ord: Order): { total: number; paid: number; due: number } {
  const total = Math.max(0, Number(ord.total) || 0);
  if (ord.orderStatus === 'cancelled' || ord.orderStatus === 'returned') {
    const adv = Math.max(0, Number(ord.advanceAmount ?? ord.paymentDetails?.advanceAmount) || 0);
    const refundedPaid = ord.paymentStatus === 'refunded' ? 0 : Math.min(total, adv);
    return { total, paid: refundedPaid, due: 0 };
  }
  if (ord.paymentStatus === 'paid' || ord.orderStatus === 'delivered') {
    return { total, paid: total, due: 0 };
  }
  const advance = Math.max(0, Number(ord.advanceAmount ?? ord.paymentDetails?.advanceAmount) || 0);
  const due =
    typeof ord.dueOnDelivery === 'number'
      ? Math.max(0, ord.dueOnDelivery)
      : typeof ord.dueAmount === 'number'
      ? Math.max(0, ord.dueAmount)
      : Math.max(0, total - advance);
  return { total, paid: Math.min(total, advance), due };
}

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

export function parseDateValue(val: any): Date | null {
  if (!val) return null;
  if (typeof val?.toDate === 'function') {
    const dt = val.toDate();
    return dt instanceof Date && !isNaN(dt.getTime()) ? dt : null;
  }
  if (typeof val?.toMillis === 'function') {
    const dt = new Date(val.toMillis());
    return isNaN(dt.getTime()) ? null : dt;
  }
  if (typeof val?.seconds === 'number') {
    const dt = new Date(val.seconds * 1000);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export function getTimestampDateKey(val: any): string | null {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    return val.trim();
  }
  const dt = parseDateValue(val);
  return dt ? getLocalDateKey(dt) : null;
}

export function parseOrderDate(ord: Order): Date | null {
  return parseDateValue(ord?.createdAt);
}

export function getOrderDateKey(ord: Order): string | null {
  const dt = parseOrderDate(ord);
  return dt ? getLocalDateKey(dt) : null;
}

export function isCompletedSaleOrder(ord: Order): boolean {
  if (!ord) return false;
  if (ord.orderStatus === 'cancelled' || ord.orderStatus === 'returned') return false;
  return ord.orderStatus === 'delivered';
}

export function getCompletedSaleDateKey(ord: Order): string | null {
  return (
    getTimestampDateKey(ord?.pipeline?.deliveredAt) ||
    getTimestampDateKey(ord?.updatedAt) ||
    getOrderDateKey(ord)
  );
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
  deliveredCount: number;
  deliveredAmount: number;
  pendingOrdersCount: number;
  processingOrdersCount: number;
  completedOrdersCount: number;
  orderStatusCounts: Record<
    'pending' | 'processing' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'returned',
    number
  >;
  salesReturnsCount: number;
  salesReturnsAmount: number;
  salesReturnsPcs: number;
  salesReturnsRestockedPcs: number;
  // Revenue breakdown
  grossMerchandiseValue: number; // subtotal before discounts
  totalDiscounts: number; // manual + coupon + online prepayment discounts
  couponDiscounts: number;
  otherDiscounts: number;
  netMerchandiseSales: number; // subtotal - discounts - partial return adjustments - cod charges
  deliveryCollected: number; // shipping charges collected
  codChargesTotal: number; // courier COD fees deducted during COD reconciliation
  totalBilledRevenue: number; // netMerchandiseSales + deliveryCollected (actual recognized net sale)
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
  collectedPaidRevenue: number;
  outstandingDueRevenue: number;
  cashSales: number;
  codPendingSales: number;
  bkashSales: number;
  nagadSales: number;
  rocketSales: number;
  dueSales: number;
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
  salesReturns?: SalesReturnEntry[];
  startDateKey?: string;
  endDateKey?: string;
}): PeriodAccountingSummary {
  const { orders, products, expenses, purchases, salesReturns = [], startDateKey, endDateKey } = params;
  const costMap = buildProductCostMap(products);

  const periodCreatedOrders = orders.filter((o) =>
    isDateKeyInRange(getOrderDateKey(o), startDateKey, endDateKey)
  );
  const periodDeliveredSales = orders.filter(
    (o) =>
      isCompletedSaleOrder(o) &&
      isDateKeyInRange(getCompletedSaleDateKey(o), startDateKey, endDateKey)
  );
  const periodCancelledOrders = orders.filter(
    (o) =>
      o.orderStatus === 'cancelled' &&
      isDateKeyInRange(
        getTimestampDateKey(o.pipeline?.cancelledAt) || getOrderDateKey(o),
        startDateKey,
        endDateKey
      )
  );
  const periodReturnedOrders = orders.filter(
    (o) =>
      o.orderStatus === 'returned' &&
      isDateKeyInRange(
        getTimestampDateKey(o.pipeline?.returnedAt) || getOrderDateKey(o),
        startDateKey,
        endDateKey
      )
  );

  const periodExpenses = expenses.filter((e) =>
    isDateKeyInRange(normalizeEntryDateKey(e.date), startDateKey, endDateKey)
  );
  const periodPurchases = purchases.filter((p) =>
    isDateKeyInRange(normalizeEntryDateKey(p.date), startDateKey, endDateKey)
  );
  const periodReturns = salesReturns.filter((r) =>
    isDateKeyInRange(normalizeEntryDateKey(r.date), startDateKey, endDateKey)
  );

  let validOrderCount = 0;
  let onlineOrderCount = 0;
  let posOrderCount = 0;
  let unitsSold = 0;
  let cancelledCount = 0;
  let cancelledAmount = 0;
  let returnedCount = 0;
  let returnedAmount = 0;
  let deliveredCount = 0;
  let deliveredAmount = 0;
  let pendingOrdersCount = 0;
  let processingOrdersCount = 0;
  let completedOrdersCount = 0;
  const orderStatusCounts: PeriodAccountingSummary['orderStatusCounts'] = {
    pending: 0,
    processing: 0,
    packed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    returned: 0,
  };

  let grossMerchandiseValue = 0;
  let totalDiscounts = 0;
  let couponDiscounts = 0;
  let otherDiscounts = 0;
  let netMerchandiseSales = 0;
  let deliveryCollected = 0;
  let codChargesTotal = 0;
  let totalBilledRevenue = 0;
  let cogs = 0;
  let missingCostItemsCount = 0;
  let missingCostSalesAmount = 0;

  let paidRevenue = 0;
  let pendingCollectionRevenue = 0;
  let cashSales = 0;
  let codPendingSales = 0;
  let bkashSales = 0;
  let nagadSales = 0;
  let rocketSales = 0;
  let dueSales = 0;
  const paymentBreakdown: Record<'cod' | 'bkash' | 'nagad' | 'rocket', number> = {
    cod: 0,
    bkash: 0,
    nagad: 0,
    rocket: 0,
  };

  // Track order pipeline counts placed during the period (without recognizing un-delivered orders as sales)
  periodCreatedOrders.forEach((ord) => {
    if (ord.orderStatus === 'pending') {
      pendingOrdersCount += 1;
      orderStatusCounts.pending += 1;
    } else if (ord.orderStatus === 'confirmed' || ord.orderStatus === 'processing') {
      processingOrdersCount += 1;
      orderStatusCounts.processing += 1;
    } else if (ord.orderStatus === 'packed') {
      processingOrdersCount += 1;
      orderStatusCounts.packed += 1;
    } else if (ord.orderStatus === 'shipped') {
      processingOrdersCount += 1;
      orderStatusCounts.shipped += 1;
    }
  });

  periodCancelledOrders.forEach((ord) => {
    cancelledCount += 1;
    cancelledAmount += Number(ord.total) || 0;
    orderStatusCounts.cancelled += 1;
  });

  periodReturnedOrders.forEach((ord) => {
    returnedCount += 1;
    returnedAmount += Number(ord.total) || 0;
    orderStatusCounts.returned += 1;
  });

  // Sales, Revenue, COGS & Profit are ONLY completed when delivery is completed (orderStatus === 'delivered')
  periodDeliveredSales.forEach((ord) => {
    const recognizedSale = getOrderRecognizedSale(ord);
    const orderCodCharge = Math.max(
      0,
      Number(ord.pipeline?.codReconciliation?.codCharge ?? ord.codCharge ?? 0) || 0
    );
    const orderTotal = recognizedSale;
    deliveredCount += 1;
    completedOrdersCount += 1;
    deliveredAmount += orderTotal;
    orderStatusCounts.delivered += 1;

    validOrderCount += 1;
    if (ord.orderChannel === 'pos') posOrderCount += 1;
    else onlineOrderCount += 1;

    const subtotal = Number(ord.subtotal) || 0;
    const disc = (Number(ord.discount) || 0) + (Number(ord.onlineDiscount) || 0);
    if (ord.couponCode && Number(ord.discount) > 0) {
      couponDiscounts += Number(ord.discount) || 0;
      otherDiscounts += Number(ord.onlineDiscount) || 0;
    } else {
      otherDiscounts += disc;
    }
    const deliv = Number(ord.deliveryCharge) || 0;
    const freeDelivFee = getOrderFreeDeliveryFee(ord);
    const isCodReconciledOrder = Boolean(
      ord.pipeline?.codReconciliation?.resolved ||
        (typeof ord.netSaleAmount === 'number' && !isNaN(ord.netSaleAmount))
    );
    const netMerch = Math.max(0, subtotal - disc - freeDelivFee - orderCodCharge);
    const orderNetMerch = isCodReconciledOrder
      ? recognizedSale
      : recognizedSale > 0
      ? Math.max(0, recognizedSale - deliv)
      : netMerch;

    grossMerchandiseValue += subtotal;
    totalDiscounts += disc;
    codChargesTotal += orderCodCharge;
    netMerchandiseSales += orderNetMerch;
    deliveryCollected += deliv;
    totalBilledRevenue += orderNetMerch + deliv;

    const costInfo = getOrderCOGS(ord, costMap);
    cogs += costInfo.cogs;
    missingCostItemsCount += costInfo.missingCostCount;
    missingCostSalesAmount += costInfo.missingCostValue;
    unitsSold += costInfo.units;

    const { paid, due } = getOrderPaidAndDue(ord);
    paidRevenue += paid;
    pendingCollectionRevenue += due;
    if (due > 0) {
      dueSales += due;
    }

    const rawMethod = ord.paymentMethod || 'cod';
    if (rawMethod === 'cash') {
      paymentBreakdown.cod += orderTotal;
      cashSales += paid > 0 ? paid : orderTotal;
    } else if (rawMethod === 'due') {
      paymentBreakdown.cod += orderTotal;
      if (paid > 0) cashSales += paid;
    } else if (rawMethod === 'cod') {
      paymentBreakdown.cod += orderTotal;
      if (ord.paymentStatus === 'paid' || ord.orderStatus === 'delivered') {
        cashSales += orderTotal;
      } else {
        codPendingSales += due;
        if (paid > 0) {
          const advGw = ord.advanceGateway || ord.paymentDetails?.advanceGateway;
          if (advGw === 'bkash') bkashSales += paid;
          else if (advGw === 'nagad') nagadSales += paid;
          else if (advGw === 'rocket') rocketSales += paid;
          else cashSales += paid;
        }
      }
    } else if (rawMethod === 'bkash') {
      paymentBreakdown.bkash += orderTotal;
      bkashSales += paid > 0 || ord.paymentStatus === 'paid' ? (paid || orderTotal) : orderTotal;
    } else if (rawMethod === 'nagad') {
      paymentBreakdown.nagad += orderTotal;
      nagadSales += paid > 0 || ord.paymentStatus === 'paid' ? (paid || orderTotal) : orderTotal;
    } else if (rawMethod === 'rocket') {
      paymentBreakdown.rocket += orderTotal;
      rocketSales += paid > 0 || ord.paymentStatus === 'paid' ? (paid || orderTotal) : orderTotal;
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

  // Apply partial Sales Return entries (avoid double counting orders whose status is already 'returned')
  const fullReturnedOrderIds = new Set(
    orders.filter((o) => o.orderStatus === 'returned').map((o) => o.id)
  );

  let salesReturnsCount = 0;
  let salesReturnsAmount = 0;
  let salesReturnsPcs = 0;
  let salesReturnsRestockedPcs = 0;

  periodReturns.forEach((ret) => {
    const amt = Math.max(0, Number(ret.totalRefundAmount) || 0);
    const pcs = Math.max(0, Number(ret.totalReturnedPcs) || 0);
    const costRev = Math.max(0, Number(ret.totalCostReversed) || 0);
    salesReturnsCount += 1;
    salesReturnsAmount += amt;
    salesReturnsPcs += pcs;
    if (ret.restocked) salesReturnsRestockedPcs += pcs;

    // Only deduct from revenue/COGS if linked order wasn't already fully excluded as 'returned'
    if (!fullReturnedOrderIds.has(ret.orderId)) {
      netMerchandiseSales = Math.max(0, netMerchandiseSales - amt);
      totalBilledRevenue = Math.max(0, totalBilledRevenue - amt);
      unitsSold = Math.max(0, unitsSold - pcs);
      cogs = Math.max(0, cogs - costRev);
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
    totalOrdersAll: periodCreatedOrders.length,
    validOrderCount,
    onlineOrderCount,
    posOrderCount,
    unitsSold,
    cancelledCount,
    cancelledAmount,
    returnedCount,
    returnedAmount,
    deliveredCount,
    deliveredAmount,
    pendingOrdersCount,
    processingOrdersCount,
    completedOrdersCount,
    orderStatusCounts,
    salesReturnsCount,
    salesReturnsAmount,
    salesReturnsPcs,
    salesReturnsRestockedPcs,
    grossMerchandiseValue,
    totalDiscounts,
    couponDiscounts,
    otherDiscounts,
    netMerchandiseSales,
    deliveryCollected,
    codChargesTotal,
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
    collectedPaidRevenue: paidRevenue,
    outstandingDueRevenue: pendingCollectionRevenue,
    cashSales,
    codPendingSales,
    bkashSales,
    nagadSales,
    rocketSales,
    dueSales,
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
  salesReturns?: SalesReturnEntry[];
  days?: number;
  endDateKey?: string;
}): DailySeriesPoint[] {
  const { orders, products, expenses, salesReturns = [], days = 14, endDateKey = getLocalDateKey() } = params;
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

  const fullReturnedOrderIds = new Set(
    orders.filter((o) => o.orderStatus === 'returned').map((o) => o.id)
  );

  orders.forEach((ord) => {
    if (!isCompletedSaleOrder(ord)) return;
    const dk = getCompletedSaleDateKey(ord);
    if (!dk) return;
    const b = buckets.get(dk);
    if (!b) return;
    const costInfo = getOrderCOGS(ord, costMap);
    b.sales += getOrderRecognizedSale(ord);
    b.pcs += costInfo.units;
    b.cogs += costInfo.cogs;
    b.orderCount += 1;
  });

  salesReturns.forEach((ret) => {
    if (fullReturnedOrderIds.has(ret.orderId)) return;
    const dk = normalizeEntryDateKey(ret.date);
    const b = buckets.get(dk);
    if (!b) return;
    b.sales = Math.max(0, b.sales - (Number(ret.totalRefundAmount) || 0));
    b.pcs = Math.max(0, b.pcs - (Number(ret.totalReturnedPcs) || 0));
    b.cogs = Math.max(0, b.cogs - (Number(ret.totalCostReversed) || 0));
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
  salesReturns?: SalesReturnEntry[];
  months?: number;
  endMonthKey?: string;
}): MonthlySeriesPoint[] {
  const {
    orders,
    products,
    expenses,
    purchases,
    salesReturns = [],
    months = 6,
    endMonthKey = getLocalMonthKey(),
  } = params;
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

  const fullReturnedOrderIds = new Set(
    orders.filter((o) => o.orderStatus === 'returned').map((o) => o.id)
  );

  orders.forEach((ord) => {
    if (!isCompletedSaleOrder(ord)) return;
    const dk = getCompletedSaleDateKey(ord);
    if (!dk) return;
    const mk = dk.slice(0, 7);
    const b = buckets.get(mk);
    if (!b) return;
    const costInfo = getOrderCOGS(ord, costMap);
    b.sales += getOrderRecognizedSale(ord);
    b.pcs += costInfo.units;
    b.cogs += costInfo.cogs;
    b.orderCount += 1;
  });

  salesReturns.forEach((ret) => {
    if (fullReturnedOrderIds.has(ret.orderId)) return;
    const mk = normalizeEntryDateKey(ret.date).slice(0, 7);
    const b = buckets.get(mk);
    if (!b) return;
    b.sales = Math.max(0, b.sales - (Number(ret.totalRefundAmount) || 0));
    b.pcs = Math.max(0, b.pcs - (Number(ret.totalReturnedPcs) || 0));
    b.cogs = Math.max(0, b.cogs - (Number(ret.totalCostReversed) || 0));
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
  soldQty: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockProducts: Product[];
  outOfStockProducts: Product[];
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
  lowStockThreshold?: number;
}): StockAuditSummary {
  const { products, purchases, orders, lowStockThreshold = 5 } = params;
  const costMap = buildProductCostMap(products);

  let activeProducts = 0;
  let totalStockPcs = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let stockCostValue = 0;
  let stockSellingValue = 0;
  const lowStockProducts: Product[] = [];
  const outOfStockProducts: Product[] = [];
  const productsMissingCost: Product[] = [];

  products.forEach((p) => {
    if (p.active !== false) activeProducts += 1;
    const stock = Math.max(0, Number(p.totalStock) || 0);
    const threshold = typeof p.minStock === 'number' && p.minStock > 0 ? p.minStock : lowStockThreshold;
    totalStockPcs += stock;
    if (stock <= 0) {
      outOfStockCount += 1;
      outOfStockProducts.push(p);
    } else if (stock <= threshold) {
      lowStockCount += 1;
      lowStockProducts.push(p);
    }

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
    const hasStockDeducted =
      ord.pipeline?.stockDeducted === true ||
      ord.orderStatus === 'packed' ||
      ord.orderStatus === 'shipped' ||
      ord.orderStatus === 'delivered';
    if (!hasStockDeducted) return;
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
    soldQty: totalSoldPcs,
    lowStockCount,
    outOfStockCount,
    lowStockProducts,
    outOfStockProducts,
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

export interface CustomerMetricsSummary {
  totalCustomers: number;
  newToday: number;
  newThisMonth: number;
  activeCustomers: number;
  returningCustomers: number;
  customersWithDue: number;
  totalCustomerDue: number;
  todayDue: number;
  monthlyDue: number;
  totalPaidByCustomers: number;
}

export function computeCustomerMetrics(params: {
  orders: Order[];
  customers?: CustomerProfile[];
  todayKey?: string;
  monthKey?: string;
}): CustomerMetricsSummary {
  const {
    orders,
    customers = [],
    todayKey = getLocalDateKey(),
    monthKey = getLocalMonthKey(),
  } = params;

  const customerMap = new Map<
    string,
    {
      firstSeenDate: string;
      validOrders: number;
      totalDue: number;
      totalPaid: number;
    }
  >();

  customers.forEach((c) => {
    const key = (c.phone || '').replace(/[\s\-+()]/g, '').replace(/^88/, '') || c.uid || c.email;
    if (!key) return;
    const dk = normalizeEntryDateKey(typeof c.createdAt === 'string' ? c.createdAt : '');
    customerMap.set(key, {
      firstSeenDate: dk || '',
      validOrders: 0,
      totalDue: 0,
      totalPaid: 0,
    });
  });

  let todayDue = 0;
  let monthlyDue = 0;

  orders.forEach((ord) => {
    const phoneKey = (ord.customerPhone || ord.shippingAddress?.phone || '')
      .replace(/[\s\-+()]/g, '')
      .replace(/^88/, '');
    const key = phoneKey || ord.customerId || ord.customerEmail || ord.customerName;
    if (!key) return;

    const ordDate = getOrderDateKey(ord) || '';
    const existing = customerMap.get(key) || {
      firstSeenDate: ordDate,
      validOrders: 0,
      totalDue: 0,
      totalPaid: 0,
    };

    if (ordDate && (!existing.firstSeenDate || ordDate < existing.firstSeenDate)) {
      existing.firstSeenDate = ordDate;
    }

    if (ord.orderStatus !== 'cancelled' && ord.orderStatus !== 'returned') {
      existing.validOrders += 1;
    }

    const { paid, due } = getOrderPaidAndDue(ord);
    existing.totalPaid += paid;
    existing.totalDue += due;

    if (ordDate === todayKey) todayDue += due;
    if (ordDate && ordDate.slice(0, 7) === monthKey) monthlyDue += due;

    customerMap.set(key, existing);
  });

  let newToday = 0;
  let newThisMonth = 0;
  let activeCustomers = 0;
  let returningCustomers = 0;
  let customersWithDue = 0;
  let totalCustomerDue = 0;
  let totalPaidByCustomers = 0;

  customerMap.forEach((entry) => {
    if (entry.firstSeenDate === todayKey) newToday += 1;
    if (entry.firstSeenDate && entry.firstSeenDate.slice(0, 7) === monthKey) newThisMonth += 1;
    if (entry.validOrders >= 1) activeCustomers += 1;
    if (entry.validOrders >= 2) returningCustomers += 1;
    if (entry.totalDue > 0) customersWithDue += 1;
    totalCustomerDue += entry.totalDue;
    totalPaidByCustomers += entry.totalPaid;
  });

  return {
    totalCustomers: customerMap.size,
    newToday,
    newThisMonth,
    activeCustomers,
    returningCustomers,
    customersWithDue,
    totalCustomerDue,
    todayDue,
    monthlyDue,
    totalPaidByCustomers,
  };
}

/**
 * Generates persistent Daily (30d) and Monthly (12m) Target Achievement Archive records.
 * Completed days & months are automatically saved with locked historical targets once closed.
 */
export function buildTargetArchivesSnapshot(params: {
  orders: Order[];
  products: Product[];
  expenses: ExpenseEntry[];
  purchases: PurchaseEntry[];
  salesReturns?: SalesReturnEntry[];
  targets: SalesTargetsConfig;
  existingArchives?: TargetArchiveRecord[];
  todayKey?: string;
  monthKey?: string;
}): TargetArchiveRecord[] {
  const {
    orders,
    products,
    expenses,
    purchases,
    salesReturns = [],
    targets,
    existingArchives = [],
    todayKey = getLocalDateKey(),
    monthKey = getLocalMonthKey(),
  } = params;

  const existingMap = new Map<string, TargetArchiveRecord>();
  existingArchives.forEach((rec) => existingMap.set(rec.id, rec));

  const records: TargetArchiveRecord[] = [];
  const nowIso = new Date().toISOString();

  // 1. Daily Records (last 21 days including today)
  for (let i = 0; i < 21; i++) {
    const dk = addLocalDays(todayKey, -i);
    const id = `daily_${dk}`;
    const prev = existingMap.get(id);
    const isToday = dk === todayKey;

    const stats = computePeriodAccounting({
      orders,
      products,
      expenses,
      purchases,
      salesReturns,
      startDateKey: dk,
      endDateKey: dk,
    });

    const targetAmount = !isToday && prev?.targetAmount !== undefined ? prev.targetAmount : targets.dailyAmountTarget;
    const targetPcs = !isToday && prev?.targetPcs !== undefined ? prev.targetPcs : targets.dailyPcsTarget;
    const targetProfit =
      !isToday && prev?.targetProfit !== undefined
        ? prev.targetProfit
        : targets.dailyProfitTarget || 0;

    const amountPct = targetAmount > 0 ? Math.min(999, (stats.totalBilledRevenue / targetAmount) * 100) : 0;
    const pcsPct = targetPcs > 0 ? Math.min(999, (stats.unitsSold / targetPcs) * 100) : 0;
    const profitPct = targetProfit > 0 ? Math.max(-999, Math.min(999, (stats.netProfit / targetProfit) * 100)) : 0;

    let status: TargetArchiveRecord['status'] = 'in_progress';
    if (!isToday) {
      status = amountPct >= 100 && (targetPcs <= 0 || pcsPct >= 100) ? 'achieved' : stats.totalBilledRevenue >= targetAmount ? 'achieved' : 'missed';
    } else if (amountPct >= 100) {
      status = 'achieved';
    }

    const [y, m, d] = dk.split('-').map(Number);
    const label = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    // Only keep days with activity or within last 7 days or today
    if (i <= 7 || stats.validOrderCount > 0 || stats.totalExpenses > 0 || prev) {
      records.push({
        id,
        periodType: 'daily',
        periodKey: dk,
        label,
        targetAmount,
        achievedAmount: stats.totalBilledRevenue,
        targetPcs,
        achievedPcs: stats.unitsSold,
        targetProfit,
        achievedProfit: stats.netProfit,
        amountPct,
        pcsPct,
        profitPct,
        orderCount: stats.validOrderCount,
        status,
        closedAt: !isToday && prev?.closedAt ? prev.closedAt : isToday ? 'Live' : nowIso,
      });
    }
  }

  // 2. Monthly Records (last 12 months including current month)
  for (let i = 0; i < 12; i++) {
    const mk = addLocalMonths(monthKey, -i);
    const id = `monthly_${mk}`;
    const prev = existingMap.get(id);
    const isCurrentMonth = mk === monthKey;
    const bounds = getMonthDateBounds(mk);

    const stats = computePeriodAccounting({
      orders,
      products,
      expenses,
      purchases,
      salesReturns,
      startDateKey: bounds.startKey,
      endDateKey: bounds.endKey,
    });

    const targetAmount =
      !isCurrentMonth && prev?.targetAmount !== undefined ? prev.targetAmount : targets.monthlyAmountTarget;
    const targetPcs =
      !isCurrentMonth && prev?.targetPcs !== undefined ? prev.targetPcs : targets.monthlyPcsTarget;
    const targetProfit =
      !isCurrentMonth && prev?.targetProfit !== undefined ? prev.targetProfit : targets.monthlyProfitTarget;

    const amountPct = targetAmount > 0 ? Math.min(999, (stats.totalBilledRevenue / targetAmount) * 100) : 0;
    const pcsPct = targetPcs > 0 ? Math.min(999, (stats.unitsSold / targetPcs) * 100) : 0;
    const profitPct = targetProfit > 0 ? Math.max(-999, Math.min(999, (stats.netProfit / targetProfit) * 100)) : 0;

    let status: TargetArchiveRecord['status'] = 'in_progress';
    if (!isCurrentMonth) {
      status = stats.totalBilledRevenue >= targetAmount ? 'achieved' : 'missed';
    } else if (stats.totalBilledRevenue >= targetAmount) {
      status = 'achieved';
    }

    if (i <= 2 || stats.validOrderCount > 0 || stats.totalExpenses > 0 || prev) {
      records.push({
        id,
        periodType: 'monthly',
        periodKey: mk,
        label: bounds.label,
        targetAmount,
        achievedAmount: stats.totalBilledRevenue,
        targetPcs,
        achievedPcs: stats.unitsSold,
        targetProfit,
        achievedProfit: stats.netProfit,
        amountPct,
        pcsPct,
        profitPct,
        orderCount: stats.validOrderCount,
        status,
        closedAt: !isCurrentMonth && prev?.closedAt ? prev.closedAt : isCurrentMonth ? 'Live' : nowIso,
      });
    }
  }

  return records;
}
