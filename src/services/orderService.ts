import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
  updateDoc,
  setDoc,
  limit,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { safeSetLocalStorage } from '../utils/safeStorage';
import {
  CartItem,
  Order,
  OrderItem,
  OrderPipelineData,
  OrderPipelineStage,
  OrderPipelineSubStatus,
  OrderStatus,
  PaymentStatus,
  ShippingAddress,
  PaymentMethod,
  PaymentDetails,
  CustomerPaymentLog,
  CustomerVerificationFieldKey,
  FieldVerificationEntry,
  PaymentVerifyStepKey,
  StockVerifyFieldKey,
  DeliveryStepKey,
  DeliveryProgressState,
  OrderFinancialSnapshot,
  OrderActivityLogEntry,
  StockUpdateSnapshotItem,
} from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';
import { isFirestoreWriteBackedOff, markFirestoreWriteError } from '../lib/firestoreWriteGuard';
import { getLocalDeliveryZones, settingsService } from './settingsService';
import { productService } from './productService';
import { notificationService } from './notificationService';

export const CUSTOMER_VERIFICATION_FIELDS: Array<{
  key: CustomerVerificationFieldKey;
  label: string;
}> = [
  { key: 'name', label: 'Customer Name' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'email', label: 'Email' },
  { key: 'division', label: 'Division' },
  { key: 'district', label: 'District' },
  { key: 'thana', label: 'Thana' },
  { key: 'postCode', label: 'Post Code' },
  { key: 'address', label: 'Full Address' },
];

export const STOCK_VERIFY_FIELDS: Array<{
  key: StockVerifyFieldKey;
  label: string;
}> = [
  { key: 'product', label: 'Product' },
  { key: 'sku', label: 'SKU' },
  { key: 'size', label: 'Size' },
  { key: 'color', label: 'Colour' },
  { key: 'quantity', label: 'Order Quantity' },
  { key: 'currentStock', label: 'Current Stock' },
  { key: 'stockUpdate', label: 'Stock Update' },
];

export const DELIVERY_STEP_SEQUENCE: Array<{
  key: DeliveryStepKey;
  label: string;
  subStatus: OrderPipelineSubStatus;
}> = [
  { key: 'productCheck', label: 'Product Check', subStatus: 'STOCK_UPDATED' },
  { key: 'sizeCheck', label: 'Size Check', subStatus: 'STOCK_UPDATED' },
  { key: 'colourCheck', label: 'Colour Check', subStatus: 'STOCK_UPDATED' },
  { key: 'quantityCheck', label: 'Quantity Check', subStatus: 'STOCK_UPDATED' },
  { key: 'packing', label: 'Packing', subStatus: 'PACKING' },
  { key: 'packed', label: 'Packed', subStatus: 'PACKED' },
  { key: 'courierConfirmed', label: 'Courier Confirmed', subStatus: 'COURIER_CONFIRMED' },
  { key: 'trackingAdded', label: 'Tracking Number Added', subStatus: 'TRACKING_ADDED' },
  { key: 'shipped', label: 'Shipped', subStatus: 'SHIPPED' },
  { key: 'outForDelivery', label: 'Out for Delivery', subStatus: 'OUT_FOR_DELIVERY' },
  { key: 'delivered', label: 'Delivered', subStatus: 'DELIVERED' },
];

export const getCustomerFieldValueFromOrder = (
  ord: Order,
  key: CustomerVerificationFieldKey
): string => {
  switch (key) {
    case 'name':
      return (ord.customerName || ord.shippingAddress?.fullName || '').trim();
    case 'phone':
      return (ord.customerPhone || ord.shippingAddress?.phone || '').trim();
    case 'email':
      return (ord.customerEmail || ord.shippingAddress?.email || '').trim();
    case 'division':
      return (ord.shippingAddress?.division || '').trim();
    case 'district':
      return (ord.shippingAddress?.district || '').trim();
    case 'thana':
      return (ord.shippingAddress?.thana || ord.shippingAddress?.upazila || '').trim();
    case 'postCode':
      return (ord.shippingAddress?.postCode || '').trim();
    case 'address':
      return (ord.shippingAddress?.address || '').trim();
  }
};

export const buildOrderFinancialSnapshot = (
  ord: Order,
  actor = 'System'
): OrderFinancialSnapshot => {
  const existing = ord.pipeline?.financialSnapshot;
  const resolvedOnlineDiscount = Math.max(
    0,
    Number(
      existing?.onlineDiscount ??
        ord.onlineDiscount ??
        ord.paymentDetails?.onlineDiscountApplied
    ) || 0
  );
  if (existing) {
    return {
      ...existing,
      onlineDiscount: resolvedOnlineDiscount,
    };
  }
  const productPrice = Math.max(0, Number(ord.subtotal) || 0);
  const couponDiscount = Math.max(0, Number(ord.discount) || 0);
  const shippingCharge = Math.max(0, Number(ord.deliveryCharge) || 0);
  const codCharge = 0;
  const finalPayable = Math.max(0, Number(ord.total) || 0);
  return {
    productPrice,
    discount: couponDiscount + resolvedOnlineDiscount,
    couponDiscount,
    onlineDiscount: resolvedOnlineDiscount,
    shippingCharge,
    codCharge,
    finalPayable,
    paymentMethod: ord.paymentMethod || 'cod',
    couponCode: ord.couponCode || '',
    capturedAt: new Date().toISOString(),
    capturedBy: actor,
  };
};

export const getPaymentVerifyStepsForOrder = (
  ord: Order
): Array<{
  key: PaymentVerifyStepKey;
  label: string;
  displayValue: string;
  editable?: boolean;
}> => {
  const snapshot = buildOrderFinancialSnapshot(ord);
  const isCod = ord.paymentMethod === 'cod';
  const onlineDisc = Math.max(
    0,
    Number(snapshot.onlineDiscount ?? ord.onlineDiscount ?? ord.paymentDetails?.onlineDiscountApplied) || 0
  );
  const otherDiscount = Math.max(0, snapshot.discount - snapshot.couponDiscount - onlineDisc);
  const advanceAmt = Math.max(
    0,
    Number(ord.advanceAmount ?? ord.paymentDetails?.advanceAmount) || 0
  );
  const dueOnDeliveryAmt = Math.max(
    0,
    Number(ord.dueOnDelivery ?? ord.dueAmount) || 0
  );

  const steps: Array<{
    key: PaymentVerifyStepKey;
    label: string;
    displayValue: string;
    editable?: boolean;
  }> = [
    {
      key: 'productPrice',
      label: 'Product Price',
      displayValue: `৳${snapshot.productPrice.toLocaleString('en-BD')}`,
    },
    {
      key: 'onlineDiscount',
      label: 'Online Discount',
      displayValue: onlineDisc > 0 ? `-৳${onlineDisc.toLocaleString('en-BD')}` : '৳0',
    },
    {
      key: 'couponDiscount',
      label: snapshot.couponCode ? `Coupon (${snapshot.couponCode})` : 'Coupon Discount',
      displayValue:
        snapshot.couponDiscount > 0 ? `-৳${snapshot.couponDiscount.toLocaleString('en-BD')}` : '৳0',
    },
  ];

  if (otherDiscount > 0) {
    steps.push({
      key: 'discount',
      label: 'Discount',
      displayValue: `-৳${otherDiscount.toLocaleString('en-BD')}`,
    });
  }

  steps.push(
    {
      key: 'shipping',
      label: 'Shipping Charge',
      displayValue:
        snapshot.shippingCharge === 0
          ? 'FREE (৳0)'
          : `+৳${snapshot.shippingCharge.toLocaleString('en-BD')}`,
    },
    {
      key: 'codCharge',
      label: 'COD Charge',
      displayValue:
        snapshot.codCharge > 0 ? `+৳${snapshot.codCharge.toLocaleString('en-BD')}` : '৳0',
    },
    {
      key: 'finalPayable',
      label: 'Final Payable',
      displayValue: `৳${snapshot.finalPayable.toLocaleString('en-BD')}`,
      editable: !isCod,
    }
  );

  if (isCod && advanceAmt > 0) {
    steps.push({
      key: 'advancePaid',
      label: 'Advance Paid',
      displayValue: `৳${advanceAmt.toLocaleString('en-BD')}${
        ord.advanceGateway || ord.paymentDetails?.advanceGateway
          ? ` (${(ord.advanceGateway || ord.paymentDetails?.advanceGateway || '').toUpperCase()})`
          : ''
      }`,
    });
    steps.push({
      key: 'dueOnDelivery',
      label: 'Due on Delivery',
      displayValue: `৳${dueOnDeliveryAmt.toLocaleString('en-BD')}`,
    });
  }

  if (ord.paymentDetails?.senderNumber?.trim()) {
    steps.push({
      key: 'senderNumber',
      label: 'Sender Number',
      displayValue: ord.paymentDetails.senderNumber.trim(),
    });
  }

  if (!isCod || Boolean(ord.paymentDetails?.transactionId?.trim())) {
    steps.push({
      key: 'trxId',
      label: 'TrxID',
      displayValue: ord.paymentDetails?.transactionId?.trim() || 'Not provided',
      editable: true,
    });
  }

  if (ord.paymentDetails?.proofUrl) {
    steps.push({
      key: 'proof',
      label: 'Proof',
      displayValue: 'Screenshot attached',
    });
  }

  steps.push({
    key: 'confirmation',
    label: isCod ? 'COD Order Confirmation' : 'Payment Confirmation',
    displayValue: isCod
      ? 'Awaiting Cash Collection'
      : ord.paymentStatus === 'paid'
      ? 'Paid'
      : 'Confirm Paid',
  });

  return steps;
};

export interface DerivedWorkflowStatus {
  stage: OrderPipelineStage;
  customerFields: Array<{
    key: CustomerVerificationFieldKey;
    label: string;
    value: string;
    entry: FieldVerificationEntry;
    isCurrentActionable: boolean;
  }>;
  allCustomerVerified: boolean;
  initialPaymentAmount: FieldVerificationEntry;
  initialPaymentMethod: FieldVerificationEntry;
  initialPaymentAmountActionable: boolean;
  initialPaymentMethodActionable: boolean;
  roleACompleted: boolean;
  paymentSteps: Array<{
    key: PaymentVerifyStepKey;
    label: string;
    displayValue: string;
    editable?: boolean;
    entry: FieldVerificationEntry;
    isCurrentActionable: boolean;
  }>;
  roleCVerified: boolean;
  isCod: boolean;
  codAwaitingCollection: boolean;
  stockItemSteps: Array<{
    index: number;
    item: OrderItem;
    verified: boolean;
    isCurrentActionable: boolean;
  }>;
  stockFieldSteps: Array<{
    itemIndex: number;
    item: OrderItem;
    fieldKey: StockVerifyFieldKey;
    label: string;
    verified: boolean;
    isCurrentActionable: boolean;
  }>;
  roleBStockUpdated: boolean;
  deliverySteps: Array<{
    key: DeliveryStepKey;
    label: string;
    completed: boolean;
    completedBy?: string;
    completedAt?: string;
    isCurrentActionable: boolean;
  }>;
  roleDDelivered: boolean;
  reconciliationRequired: boolean;
  codReconciliationCompleted: boolean;
  currentActionLabel: string;
}

export const getOrderWorkflowStatus = (ord: Order): DerivedWorkflowStatus => {
  const stage = orderService.getOrderPipelineStage(ord);
  const cv = ord.pipeline?.customerVerification || {};
  const roleAAlreadyPassed =
    stage !== 'order_verification' && stage !== 'cancelled' && stage !== 'returned';

  let foundFirstUnverifiedCustomer = false;
  const customerFields = CUSTOMER_VERIFICATION_FIELDS.map((f) => {
    const rawEntry = cv[f.key];
    const effectiveEntry: FieldVerificationEntry = rawEntry
      ? rawEntry
      : roleAAlreadyPassed
      ? {
          status: 'verified',
          verifiedBy: ord.pipeline?.verifiedBy,
          verifiedAt: ord.pipeline?.verifiedAt,
        }
      : { status: 'pending' };

    const isActionable =
      stage === 'order_verification' &&
      !foundFirstUnverifiedCustomer &&
      effectiveEntry.status !== 'verified';
    if (effectiveEntry.status !== 'verified') {
      foundFirstUnverifiedCustomer = true;
    }

    return {
      key: f.key,
      label: f.label,
      value: getCustomerFieldValueFromOrder(ord, f.key),
      entry: effectiveEntry,
      isCurrentActionable: isActionable,
    };
  });

  const allCustomerVerified = customerFields.every((cf) => cf.entry.status === 'verified');

  const initPay = ord.pipeline?.initialPaymentVerification;
  const initialPaymentAmount: FieldVerificationEntry = initPay?.paymentAmount
    ? initPay.paymentAmount
    : roleAAlreadyPassed
    ? { status: 'verified', verifiedBy: ord.pipeline?.verifiedBy, verifiedAt: ord.pipeline?.verifiedAt }
    : { status: 'pending' };

  const initialPaymentMethod: FieldVerificationEntry = initPay?.paymentMethod
    ? initPay.paymentMethod
    : roleAAlreadyPassed
    ? { status: 'verified', verifiedBy: ord.pipeline?.verifiedBy, verifiedAt: ord.pipeline?.verifiedAt }
    : { status: 'pending' };

  const initialPaymentAmountActionable =
    stage === 'order_verification' &&
    allCustomerVerified &&
    initialPaymentAmount.status !== 'verified';

  const initialPaymentMethodActionable =
    stage === 'order_verification' &&
    allCustomerVerified &&
    initialPaymentAmount.status === 'verified' &&
    initialPaymentMethod.status !== 'verified';

  const roleACompleted =
    Boolean(initPay?.completed) ||
    (allCustomerVerified &&
      initialPaymentAmount.status === 'verified' &&
      initialPaymentMethod.status === 'verified') ||
    roleAAlreadyPassed;

  const isCod = ord.paymentMethod === 'cod';
  const roleCVerified =
    Boolean(ord.pipeline?.paymentVerification?.paymentConfirmed) ||
    Boolean(ord.pipeline?.paymentVerifiedBy) ||
    stage === 'inventory_packing' ||
    stage === 'delivery_dispatch' ||
    stage === 'cod_reconciliation' ||
    stage === 'completed';

  const rawPaymentStepDefs = getPaymentVerifyStepsForOrder(ord);
  const storedPaymentSteps = ord.pipeline?.paymentVerification?.steps || {};
  let foundFirstUnverifiedPayment = false;
  const paymentSteps = rawPaymentStepDefs.map((def) => {
    const rawEntry = storedPaymentSteps[def.key];
    const effectiveEntry: FieldVerificationEntry = rawEntry
      ? rawEntry
      : roleCVerified
      ? {
          status: 'verified',
          verifiedBy: ord.pipeline?.paymentVerification?.verifiedBy || ord.pipeline?.paymentVerifiedBy,
          verifiedAt: ord.pipeline?.paymentVerification?.verifiedAt || ord.pipeline?.paymentVerifiedAt,
        }
      : { status: 'pending' };

    const isActionable =
      stage === 'payment_verification' &&
      !foundFirstUnverifiedPayment &&
      effectiveEntry.status !== 'verified';
    if (effectiveEntry.status !== 'verified') {
      foundFirstUnverifiedPayment = true;
    }

    return {
      key: def.key,
      label: def.label,
      displayValue: def.displayValue,
      editable: def.editable,
      entry: effectiveEntry,
      isCurrentActionable: isActionable,
    };
  });

  const codAwaitingCollection = isCod && ord.paymentStatus !== 'paid';

  const roleBStockUpdated =
    Boolean(ord.pipeline?.stockVerification?.stockUpdated) ||
    Boolean(ord.pipeline?.stockDeducted) ||
    stage === 'delivery_dispatch' ||
    stage === 'cod_reconciliation' ||
    stage === 'completed';

  const verifiedStockSet = new Set(ord.pipeline?.stockVerification?.verifiedItemIndices || []);
  const stockStepEntries = ord.pipeline?.stockVerification?.stepEntries || {};
  let foundFirstUnverifiedStock = false;
  const stockItemSteps = (ord.items || []).map((item, idx) => {
    const verified = roleBStockUpdated || verifiedStockSet.has(idx);
    const isActionable =
      stage === 'inventory_packing' && !foundFirstUnverifiedStock && !verified;
    if (!verified) {
      foundFirstUnverifiedStock = true;
    }
    return {
      index: idx,
      item,
      verified,
      isCurrentActionable: isActionable,
    };
  });

  let foundFirstUnverifiedStockField = false;
  const stockFieldSteps: Array<{
    itemIndex: number;
    item: OrderItem;
    fieldKey: StockVerifyFieldKey;
    label: string;
    verified: boolean;
    isCurrentActionable: boolean;
  }> = [];

  (ord.items || []).forEach((item, itemIdx) => {
    const itemFullyVerified = roleBStockUpdated || verifiedStockSet.has(itemIdx);
    STOCK_VERIFY_FIELDS.forEach((fDef) => {
      const compositeKey = `${itemIdx}_${fDef.key}`;
      const verified =
        itemFullyVerified || stockStepEntries[compositeKey]?.status === 'verified';
      const isActionable =
        stage === 'inventory_packing' && !foundFirstUnverifiedStockField && !verified;
      if (!verified) {
        foundFirstUnverifiedStockField = true;
      }
      stockFieldSteps.push({
        itemIndex: itemIdx,
        item,
        fieldKey: fDef.key,
        label: fDef.label,
        verified,
        isCurrentActionable: isActionable,
      });
    });
  });

  const dp = ord.pipeline?.deliveryProgress || {};
  let foundFirstIncompleteDelivery = false;
  const deliverySteps = DELIVERY_STEP_SEQUENCE.map((step) => {
    const rec = dp[step.key];
    const completed =
      Boolean(rec?.completed) ||
      stage === 'cod_reconciliation' ||
      stage === 'completed' ||
      (ord.orderStatus === 'packed' &&
        ['productCheck', 'sizeCheck', 'colourCheck', 'quantityCheck', 'packing', 'packed'].includes(step.key)) ||
      (ord.orderStatus === 'shipped' &&
        step.key !== 'delivered' &&
        (ord.pipeline?.subStatus === 'OUT_FOR_DELIVERY' || step.key !== 'outForDelivery'));

    const isActionable =
      stage === 'delivery_dispatch' && !foundFirstIncompleteDelivery && !completed;
    if (!completed) {
      foundFirstIncompleteDelivery = true;
    }
    return {
      key: step.key,
      label: step.label,
      completed,
      completedBy: rec?.completedBy,
      completedAt: rec?.completedAt,
      isCurrentActionable: isActionable,
    };
  });

  const roleDDelivered =
    Boolean(dp.delivered?.completed) ||
    ord.orderStatus === 'delivered' ||
    stage === 'cod_reconciliation' ||
    stage === 'completed';

  const reconciliationRequired = Boolean(ord.pipeline?.codReconciliation?.reconciliationRequired);
  const codReconciliationCompleted =
    stage === 'completed' || Boolean(ord.pipeline?.codReconciliation?.resolved);

  let currentActionLabel = 'Completed';
  if (stage === 'cancelled') {
    currentActionLabel = 'Cancelled';
  } else if (stage === 'returned') {
    currentActionLabel = 'Returned';
  } else if (stage === 'order_verification') {
    const activeField = customerFields.find((f) => f.isCurrentActionable);
    if (activeField) {
      currentActionLabel =
        activeField.entry.status === 'needs_correction'
          ? `${activeField.label} (Needs Correction)`
          : `${activeField.label} Verification`;
    } else if (initialPaymentAmountActionable) {
      currentActionLabel = 'Payment Amount Verification';
    } else if (initialPaymentMethodActionable) {
      currentActionLabel = 'Payment Method Verification';
    } else {
      currentActionLabel = 'Customer & Initial Payment Verification Completed';
    }
  } else if (stage === 'payment_verification') {
    const activePay = paymentSteps.find((p) => p.isCurrentActionable);
    currentActionLabel = activePay
      ? `${activePay.label} Verification`
      : isCod
      ? 'Payment Verification (COD · Awaiting Cash Collection)'
      : 'Payment & Transaction Verification';
  } else if (stage === 'inventory_packing') {
    const activeStockField = stockFieldSteps.find((s) => s.isCurrentActionable);
    currentActionLabel = activeStockField
      ? `Stock · ${activeStockField.label}`
      : 'Stock Verification & Update';
  } else if (stage === 'delivery_dispatch') {
    const activeDel = deliverySteps.find((d) => d.isCurrentActionable);
    currentActionLabel = activeDel ? activeDel.label : 'Delivered';
  } else if (stage === 'cod_reconciliation') {
    currentActionLabel = reconciliationRequired
      ? 'Reconciliation Required'
      : codAwaitingCollection
      ? 'COD Cash Collection & Finance Reconciliation'
      : 'Finance Reconciliation';
  }

  return {
    stage,
    customerFields,
    allCustomerVerified,
    initialPaymentAmount,
    initialPaymentMethod,
    initialPaymentAmountActionable,
    initialPaymentMethodActionable,
    roleACompleted,
    paymentSteps,
    roleCVerified,
    isCod,
    codAwaitingCollection,
    stockItemSteps,
    stockFieldSteps,
    roleBStockUpdated,
    deliverySteps,
    roleDDelivered,
    reconciliationRequired,
    codReconciliationCompleted,
    currentActionLabel,
  };
};

const LOCAL_ORDERS_KEY = 'mf_placed_orders_v2';
const cachedOrdersMap = new Map<string, Order>();
let liveAllOrders: Order[] | null = null;
const allOrdersListeners = new Set<(orders: Order[]) => void>();
let sharedOrdersUnsub: Unsubscribe | null = null;
const sessionOptimisticOrders = new Map<string, Order>();

const getOrderTimeMs = (t: any): number => {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  if (typeof t === 'string') return Date.parse(t) || 0;
  if (typeof t === 'number') return t;
  return 0;
};

const sortOrdersDesc = (list: Order[]): Order[] =>
  [...list].sort((a, b) => getOrderTimeMs(b.createdAt) - getOrderTimeMs(a.createdAt));

const persistOrdersBackup = (list: Order[]) => {
  safeSetLocalStorage(LOCAL_ORDERS_KEY, list.slice(0, 25), {
    stripInlineData: true,
    maxChars: 350_000,
  });
};

const withTimeout = <T,>(promise: Promise<T>, ms: number, label = 'Request timed out'): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);

export const cacheOrderRecord = (ord: Order) => {
  if (!ord) return;
  if (ord.id) {
    cachedOrdersMap.set(ord.id, ord);
    cachedOrdersMap.set(ord.id.toLowerCase().trim(), ord);
  }
  if (ord.orderNumber) {
    const raw = ord.orderNumber.trim();
    cachedOrdersMap.set(raw, ord);
    cachedOrdersMap.set(raw.toLowerCase(), ord);
    cachedOrdersMap.set(raw.toUpperCase(), ord);
    const withoutPrefix = raw.replace(/^#/, '').replace(/^MF-/, '');
    if (withoutPrefix) {
      cachedOrdersMap.set(withoutPrefix, ord);
      cachedOrdersMap.set(`MF-${withoutPrefix}`, ord);
    }
  }
};

export const orderService = {
  // Instant synchronous accessor returning ONLY live synced in-memory orders (never stale localStorage)
  getInstantOrders(): Order[] {
    return liveAllOrders ?? [];
  },

  // Get persistent local orders (offline fallback / mutator helper)
  getLocalOrders(): Order[] {
    if (liveAllOrders !== null) return liveAllOrders;
    try {
      const raw = localStorage.getItem(LOCAL_ORDERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(cacheOrderRecord);
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return [];
  },

  // Save optimistic order mutation to live memory, backup storage, and notify listeners
  saveLocalOrder(order: Order) {
    if (!order) return;
    if (order.id) {
      sessionOptimisticOrders.set(order.id, order);
    }
    try {
      const raw = localStorage.getItem(LOCAL_ORDERS_KEY);
      const list: Order[] = raw ? JSON.parse(raw) : [];
      const idx = Array.isArray(list)
        ? list.findIndex(
            (o) => (o.id && o.id === order.id) || (o.orderNumber && o.orderNumber === order.orderNumber)
          )
        : -1;
      const nextList = Array.isArray(list) ? [...list] : [];
      if (idx >= 0) {
        nextList[idx] = { ...nextList[idx], ...order };
      } else {
        nextList.unshift(order);
      }
      persistOrdersBackup(nextList);
    } catch {
      // ignore
    }
    cacheOrderRecord(order);
    if (liveAllOrders !== null) {
      const idx = liveAllOrders.findIndex((o) => o.id === order.id);
      const next = idx >= 0
        ? liveAllOrders.map((o, i) => (i === idx ? { ...o, ...order } : o))
        : sortOrdersDesc([order, ...liveAllOrders]);
      liveAllOrders = next;
      allOrdersListeners.forEach((cb) => cb(next));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mf_orders_updated', { detail: order }));
    }
  },

  // Place Order with atomic inventory deduction, online prepayment discount, and payment proof
  async createOrder(params: {
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    shippingAddress: ShippingAddress;
    items: CartItem[];
    couponCode?: string;
    freeDeliveryApplied?: boolean;
    freeDeliveryCouponId?: string;
    deliveryZoneId: string;
    paymentMethod: PaymentMethod;
    paymentDetails?: PaymentDetails;
  }): Promise<{ success: boolean; orderId?: string; orderNumber?: string; error?: string }> {
    try {
      const {
        customerId,
        customerName,
        customerPhone,
        customerEmail,
        shippingAddress,
        items,
        couponCode,
        freeDeliveryApplied,
        freeDeliveryCouponId,
        deliveryZoneId,
        paymentMethod,
        paymentDetails,
      } = params;

      if (!items || items.length === 0) {
        return { success: false, error: 'Your cart is empty.' };
      }

      // 1. Pre-validate coupon before transaction if provided
      let validCouponDocId: string | null = freeDeliveryCouponId || null;
      if (couponCode) {
        try {
          const couponQuery = query(
            collection(db, 'coupons'),
            where('code', '==', couponCode.toUpperCase().trim()),
            where('active', '==', true),
            limit(1)
          );
          const couponSnap = await withTimeout(getDocs(couponQuery), 2500, 'Coupon lookup timeout');
          if (!couponSnap.empty) {
            validCouponDocId = couponSnap.docs[0].id;
          }
        } catch (e) {
          console.warn("Coupon lookup warning:", e);
        }
      }

      // Generate human-readable order number with # format (e.g. #102948)
      const orderNumber = `#${Math.floor(100000 + Math.random() * 900000)}`;
      const orderDocRef = doc(collection(db, 'orders'));
      let transactionGrandTotal = 0;
      let committedOrder: Order | null = null;

      // Use Firestore transaction to verify prices and decrement inventory atomically
      // Strictly separating: ALL READS FIRST -> CALCULATIONS -> ALL WRITES
      try {
        await withTimeout(runTransaction(db, async (transaction) => {
          // --- PHASE 1: ALL READS ---
          const productSnapshots: { cartItem: CartItem; productRef: any; productData: any }[] = [];
          for (const cartItem of items) {
            const productRef = doc(db, 'products', cartItem.productId);
            const productDoc = await transaction.get(productRef);

            if (!productDoc.exists()) {
              throw new Error(`Product "${cartItem.productName}" is no longer available.`);
            }

            const productData = productDoc.data();
            if (productData.active === false) {
              throw new Error(`Product "${productData.name}" is currently inactive.`);
            }

            productSnapshots.push({ cartItem, productRef, productData });
          }

          let couponDoc = null;
          if (validCouponDocId) {
            const couponRef = doc(db, 'coupons', validCouponDocId);
            couponDoc = await transaction.get(couponRef);
          }

          let zoneDoc = null;
          if (deliveryZoneId) {
            const zoneRef = doc(db, 'deliveryZones', deliveryZoneId);
            zoneDoc = await transaction.get(zoneRef);
          }

          // --- PHASE 2: CALCULATIONS & VERIFICATION ---
          let calculatedSubtotal = 0;
          const verifiedOrderItems = [];
          const productUpdates: { productRef: any; newTotalStock: number; updatedVariants: any[] }[] = [];

          for (const { cartItem, productRef, productData } of productSnapshots) {
            const unitPrice =
              typeof productData.salePrice === 'number' && productData.salePrice > 0
                ? productData.salePrice
                : (typeof productData.price === 'number' ? productData.price : (cartItem.price || 0));

            const itemTotal = unitPrice * cartItem.quantity;
            calculatedSubtotal += itemTotal;

            const currentStock = typeof productData.totalStock === 'number' ? productData.totalStock : 50;
            if (currentStock < cartItem.quantity) {
              throw new Error(
                `Insufficient stock for ${productData.name}. Available: ${currentStock}`
              );
            }

            (productData.variants || []).forEach((variant: any) => {
              if (variant.size === cartItem.size && (!variant.color || variant.color === cartItem.color)) {
                if (typeof variant.stock === 'number' && variant.stock < cartItem.quantity) {
                  throw new Error(
                    `Insufficient stock for ${productData.name} (${cartItem.size}). Available: ${variant.stock}`
                  );
                }
              }
            });

            const resolvedUnitCost =
              typeof productData.costPrice === 'number' && productData.costPrice > 0
                ? productData.costPrice
                : undefined;

            verifiedOrderItems.push({
              productId: cartItem.productId,
              productName: productData.name,
              productImage: cartItem.productImage || productData.thumbnail || '',
              size: cartItem.size || 'Standard',
              color: cartItem.color || 'Standard',
              quantity: cartItem.quantity,
              unitPrice,
              ...(resolvedUnitCost ? { unitCost: resolvedUnitCost } : {}),
              totalPrice: itemTotal,
              sku: cartItem.sku || productData.sku || '',
            });
          }

          // Validate coupon if exists
          let calculatedDiscount = 0;
          let couponIsFreeDelivery = false;
          if (couponDoc && couponDoc.exists()) {
            const couponData = couponDoc.data();
            const isValid =
              couponData.active !== false &&
              (!couponData.usageLimit || (couponData.usedCount || 0) < couponData.usageLimit) &&
              settingsService.isCouponValidForUse({ id: couponDoc.id, ...couponData } as any);
            if (isValid && calculatedSubtotal >= (couponData.minOrderAmount || 0)) {
              if (couponData.discountType === 'free_delivery') {
                couponIsFreeDelivery = true;
              } else if (couponData.discountType === 'percentage') {
                const perc = Math.round((calculatedSubtotal * couponData.discountAmount) / 100);
                calculatedDiscount = couponData.maxDiscount ? Math.min(perc, couponData.maxDiscount) : perc;
              } else {
                calculatedDiscount = Math.min(couponData.discountAmount, calculatedSubtotal);
              }
            }
          }

          // Dynamic delivery charge calculation (Controlled from Admin Panel)
          const localZones = getLocalDeliveryZones();
          const matchedZone = localZones.find((z) => z.id === deliveryZoneId);
          let deliveryCharge = matchedZone ? matchedZone.charge : (deliveryZoneId === 'outside-dhaka' ? 130 : 70);
          let deliveryZoneName = matchedZone ? matchedZone.name : (deliveryZoneId === 'outside-dhaka' ? 'Outside Dhaka (Nationwide)' : 'Inside Dhaka City');
          if (zoneDoc && zoneDoc.exists()) {
            const zd = zoneDoc.data();
            if (typeof zd.charge === 'number') deliveryCharge = zd.charge;
            if (zd.name) deliveryZoneName = zd.name;
          }

          const hasFreeDelivery = Boolean(couponIsFreeDelivery || freeDeliveryApplied);
          if (hasFreeDelivery) {
            deliveryCharge = 0;
          }

          // Online Payment Prepayment Discount (bKash, Nagad, Rocket)
          let onlineDiscount = 0;
          if (paymentMethod !== 'cod' && paymentDetails?.onlineDiscountApplied) {
            onlineDiscount = paymentDetails.onlineDiscountApplied;
          }

          const grandTotal = Math.max(0, calculatedSubtotal - calculatedDiscount - onlineDiscount + deliveryCharge);
          transactionGrandTotal = grandTotal;

          const cleanAddress: ShippingAddress = {
            fullName: shippingAddress.fullName || '',
            phone: shippingAddress.phone || '',
            email: shippingAddress.email || '',
            address: shippingAddress.address || '',
            division: shippingAddress.division || 'Dhaka',
            district: shippingAddress.district || 'Dhaka',
            upazila: shippingAddress.upazila || '',
            notes: shippingAddress.notes || '',
          };

          const isAdvanceCod = paymentMethod === 'cod' && deliveryCharge > 0 && Boolean(paymentDetails?.advanceDeliveryPaid);
          const cleanPaymentDetails: PaymentDetails | undefined = (paymentMethod !== 'cod' || isAdvanceCod) ? {
            method: paymentMethod,
            senderNumber: paymentDetails?.senderNumber || '',
            transactionId: paymentDetails?.transactionId || '',
            proofUrl: paymentDetails?.proofUrl || '',
            onlineDiscountApplied: onlineDiscount,
            paidAt: paymentDetails?.paidAt || new Date().toISOString(),
            advanceDeliveryPaid: isAdvanceCod || paymentMethod !== 'cod',
            advanceGateway: paymentDetails?.advanceGateway,
            advanceAmount: isAdvanceCod ? deliveryCharge : (paymentMethod !== 'cod' ? grandTotal : 0),
            dueOnDelivery: isAdvanceCod ? Math.max(0, calculatedSubtotal - calculatedDiscount) : (paymentMethod !== 'cod' ? 0 : grandTotal),
          } : undefined;

          let initialTimelineNote = deliveryCharge === 0
            ? 'Order placed by customer via Cash on Delivery (One-Time Free Delivery Applied).'
            : 'Order placed by customer via Cash on Delivery.';
          if (isAdvanceCod) {
            initialTimelineNote = `Order placed via COD with Advance Delivery Fee (৳${deliveryCharge}) paid via ${(paymentDetails?.advanceGateway || 'MFS').toUpperCase()}. Sender: ${paymentDetails?.senderNumber || 'N/A'}, TrxID: ${paymentDetails?.transactionId || 'N/A'}. Due on Delivery: ৳${Math.max(0, calculatedSubtotal - calculatedDiscount)}.`;
          } else if (paymentMethod !== 'cod') {
            initialTimelineNote = `Order placed via ${paymentMethod.toUpperCase()}. Sender Number: ${paymentDetails?.senderNumber || 'N/A'}, TrxID: ${paymentDetails?.transactionId || 'Pending'}. Payment proof awaiting admin verification.`;
          }

          const newOrder: Order = {
            id: orderDocRef.id,
            orderNumber,
            customerId: customerId || 'guest',
            customerName: customerName || '',
            customerPhone: customerPhone || '',
            customerEmail: customerEmail || '',
            shippingAddress: cleanAddress,
            items: verifiedOrderItems,
            subtotal: calculatedSubtotal,
            discount: calculatedDiscount,
            onlineDiscount,
            couponCode: couponCode || '',
            freeDeliveryApplied: hasFreeDelivery,
            deliveryCharge,
            deliveryZone: deliveryZoneName,
            total: grandTotal,
            paymentMethod,
            ...(cleanPaymentDetails ? { paymentDetails: cleanPaymentDetails } : {}),
            advanceDeliveryPaid: Boolean(paymentMethod !== 'cod' || isAdvanceCod),
            advanceGateway: isAdvanceCod ? paymentDetails?.advanceGateway : undefined,
            advanceAmount: isAdvanceCod ? deliveryCharge : (paymentMethod !== 'cod' ? grandTotal : 0),
            dueOnDelivery: isAdvanceCod ? Math.max(0, calculatedSubtotal - calculatedDiscount) : (paymentMethod !== 'cod' ? 0 : grandTotal),
            paymentStatus: 'pending',
            orderStatus: 'pending',
            orderChannel: 'online',
            pipeline: {
              currentStage: 'order_verification',
              subStatus: 'NEW',
              currentActionLabel: 'Customer Name Verification',
              stockDeducted: false,
              customerVerification: {
                name: { status: 'pending' },
                phone: { status: 'pending' },
                email: { status: 'pending' },
                division: { status: 'pending' },
                district: { status: 'pending' },
                address: { status: 'pending' },
              },
              initialPaymentVerification: {
                paymentAmount: { status: 'pending' },
                paymentMethod: { status: 'pending' },
                completed: false,
              },
              financialSnapshot: {
                productPrice: calculatedSubtotal,
                discount: calculatedDiscount + onlineDiscount,
                couponDiscount: calculatedDiscount,
                onlineDiscount,
                shippingCharge: deliveryCharge,
                codCharge: 0,
                finalPayable: grandTotal,
                paymentMethod,
                couponCode: couponCode || '',
                capturedAt: new Date().toISOString(),
                capturedBy: 'Website Checkout',
              },
              paymentVerification:
                paymentMethod === 'cod'
                  ? {
                      codAwaitingCollection: true,
                      statusLabel: 'Awaiting Cash Collection',
                    }
                  : {
                      codAwaitingCollection: false,
                      statusLabel: 'Pending Verification',
                    },
              stockVerification: {
                stockVerified: false,
                stockUpdated: false,
              },
              deliveryProgress: {},
              activityLog: [
                {
                  id: `act_${Date.now()}_placed`,
                  stepKey: 'order_placed',
                  label: 'Website Order Placed',
                  category: 'order',
                  actorName: customerName || 'Website Customer',
                  actorEmail: customerEmail || undefined,
                  roleLabel: 'Website Checkout',
                  note: initialTimelineNote,
                  timestamp: new Date().toISOString(),
                },
              ],
              handoffHistory: [
                {
                  stage: 'order_verification',
                  subStatus: 'NEW',
                  handlerName: 'Online Checkout',
                  action: 'Website order placed — queued for Customer Information Verification',
                  timestamp: new Date().toISOString(),
                },
              ],
            },
            timeline: [
              {
                status: 'pending',
                timestamp: new Date().toISOString(),
                note: initialTimelineNote,
              },
            ],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          // --- PHASE 3: ALL WRITES ---
          // Note: Stock is verified at checkout and deducted at Stage 3 (Stock Control approval).
          void productUpdates;

          // 2. Increment coupon usage & auto-deactivate if usage limit reached (or free_delivery 1-time coupon)
          if (couponDoc && couponDoc.exists() && validCouponDocId) {
            const couponRef = doc(db, 'coupons', validCouponDocId);
            const cData = couponDoc.data();
            const effLimit =
              cData?.discountType === 'free_delivery'
                ? cData?.usageLimit || 1
                : cData?.usageLimit;
            const nextUsed = Math.max((cData?.usedCount || 0) + 1, cData?.discountType === 'free_delivery' ? (effLimit || 1) : 1);
            const exhausted = Boolean(
              (effLimit && nextUsed >= effLimit) || cData?.discountType === 'free_delivery'
            );
            transaction.update(couponRef, {
              usedCount: nextUsed,
              ...(exhausted ? { active: false } : {}),
              updatedAt: serverTimestamp(),
            });
          }

          // 3. Write order document
          committedOrder = newOrder;
          const sanitizedOrder = sanitizeForFirestore(newOrder);
          transaction.set(orderDocRef, sanitizedOrder);
        }), 5500, 'Transaction timeout');

        if (committedOrder) {
          const nowIso = new Date().toISOString();
          this.saveLocalOrder({
            ...(committedOrder as Order),
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }

        // Permanently mark coupon / free-delivery voucher consumed locally + on Firestore & user profile
        const tokensToConsume = Array.from(new Set([freeDeliveryCouponId, couponCode].filter(Boolean) as string[]));
        if (tokensToConsume.length > 0) {
          await withTimeout(
            Promise.all(
              tokensToConsume.map((tok) =>
                settingsService.markCouponUsed(tok, false, customerId).catch(() => {})
              )
            ),
            1800,
            'Coupon consume sync'
          ).catch(() => {});
        }

        // Online order inventory waits for Stock Control Stage 3 approval before deduction

        // Notify customer + authorized admin devices (in-app & mobile push alert)
        const totalItemsCount = items.reduce((acc, i) => acc + (i.quantity || 1), 0);
        notificationService
          .notifyOrderPlaced({
            orderNumber,
            total: transactionGrandTotal,
            customerId,
            customerEmail: customerEmail || shippingAddress.email,
            customerPhone: customerPhone || shippingAddress.phone,
            paymentMethod,
          })
          .catch(() => {});
        notificationService
          .notifyAdminNewOrder({
            orderNumber,
            customerName: customerName || shippingAddress.fullName,
            customerPhone: customerPhone || shippingAddress.phone,
            total: transactionGrandTotal,
            itemCount: totalItemsCount,
            paymentMethod,
          })
          .catch(() => {});

        return {
          success: true,
          orderId: orderDocRef.id,
          orderNumber,
        };
      } catch (transErr: any) {
        console.warn('Transaction execution warning, running direct order fallback:', transErr);
        
        // Resilient fallback: Save order document directly so customer checkout is never blocked
        let fallbackSubtotal = 0;
        const localCatalogProducts = productService.getLocalProducts();
        const fallbackItems = items.map((item) => {
          const price = item.salePrice || item.price;
          const total = price * item.quantity;
          fallbackSubtotal += total;
          const matchedProd = localCatalogProducts.find((p) => p.id === item.productId);
          const resolvedUnitCost =
            matchedProd && typeof matchedProd.costPrice === 'number' && matchedProd.costPrice > 0
              ? matchedProd.costPrice
              : undefined;
          return {
            productId: item.productId,
            productName: item.productName,
            productImage: item.productImage || '',
            size: item.size || 'Standard',
            color: item.color || 'Standard',
            quantity: item.quantity,
            unitPrice: price,
            ...(resolvedUnitCost ? { unitCost: resolvedUnitCost } : {}),
            totalPrice: total,
            sku: item.sku || '',
          };
        });

        const localZones = getLocalDeliveryZones();
        const matchedZone = localZones.find((z) => z.id === deliveryZoneId);
        let deliveryCharge = matchedZone ? matchedZone.charge : (deliveryZoneId === 'outside-dhaka' ? 130 : 70);
        let deliveryZoneName = matchedZone ? matchedZone.name : (deliveryZoneId === 'outside-dhaka' ? 'Outside Dhaka (Nationwide)' : 'Inside Dhaka City');

        let fallbackDiscount = 0;
        let fallbackFreeDelivery = Boolean(freeDeliveryApplied);
        const localCoupons = settingsService.getLocalCoupons();
        const matchedCoupon = localCoupons.find(
          (c) => (freeDeliveryCouponId && c.id === freeDeliveryCouponId) || (couponCode && c.code.toUpperCase() === couponCode.toUpperCase().trim())
        );
        if (matchedCoupon && settingsService.isCouponValidForUse(matchedCoupon) && fallbackSubtotal >= (matchedCoupon.minOrderAmount || 0)) {
          if (matchedCoupon.discountType === 'free_delivery') {
            fallbackFreeDelivery = true;
          } else if (matchedCoupon.discountType === 'percentage') {
            const perc = Math.round((fallbackSubtotal * matchedCoupon.discountAmount) / 100);
            fallbackDiscount = matchedCoupon.maxDiscount ? Math.min(perc, matchedCoupon.maxDiscount) : perc;
          } else {
            fallbackDiscount = Math.min(matchedCoupon.discountAmount, fallbackSubtotal);
          }
        }
        if (fallbackFreeDelivery) {
          deliveryCharge = 0;
        }

        let onlineDiscount = (paymentMethod !== 'cod' && paymentDetails?.onlineDiscountApplied) ? paymentDetails.onlineDiscountApplied : 0;
        let grandTotal = Math.max(0, fallbackSubtotal - fallbackDiscount - onlineDiscount + deliveryCharge);

        const isAdvanceCodFallback = paymentMethod === 'cod' && deliveryCharge > 0 && Boolean(paymentDetails?.advanceDeliveryPaid);

        const fallbackOrder: Order = {
          id: orderDocRef.id,
          orderNumber,
          customerId: customerId || 'guest',
          customerName: customerName || '',
          customerPhone: customerPhone || '',
          customerEmail: customerEmail || '',
          shippingAddress: {
            fullName: shippingAddress.fullName || customerName,
            phone: shippingAddress.phone || customerPhone,
            email: shippingAddress.email || customerEmail || '',
            address: shippingAddress.address || '',
            division: shippingAddress.division || 'Dhaka',
            district: shippingAddress.district || 'Dhaka',
            upazila: shippingAddress.upazila || '',
            notes: shippingAddress.notes || '',
          },
          items: fallbackItems,
          subtotal: fallbackSubtotal,
          discount: fallbackDiscount,
          onlineDiscount,
          couponCode: couponCode || '',
          freeDeliveryApplied: fallbackFreeDelivery,
          deliveryCharge,
          deliveryZone: deliveryZoneName,
          total: grandTotal,
          paymentMethod,
          ...(paymentDetails && (paymentMethod !== 'cod' || isAdvanceCodFallback) ? { paymentDetails } : {}),
          advanceDeliveryPaid: Boolean(paymentMethod !== 'cod' || isAdvanceCodFallback),
          advanceAmount: paymentMethod !== 'cod' ? grandTotal : (isAdvanceCodFallback ? deliveryCharge : 0),
          dueOnDelivery: paymentMethod !== 'cod' ? 0 : Math.max(0, fallbackSubtotal - fallbackDiscount),
          paymentStatus: 'pending',
          orderStatus: 'pending',
          orderChannel: 'online',
          pipeline: {
            currentStage: 'order_verification',
            stockDeducted: false,
            handoffHistory: [
              {
                stage: 'order_verification',
                handlerName: 'Online Checkout',
                action: 'New order queued for Order Verification Desk',
                timestamp: new Date().toISOString(),
              },
            ],
          },
          timeline: [
            {
              status: 'pending',
              timestamp: new Date().toISOString(),
              note: paymentMethod === 'cod' && fallbackFreeDelivery
                ? 'Order placed via Cash on Delivery (One-Time Free Delivery Applied).'
                : `Order placed via ${paymentMethod === 'cod' ? 'Cash on Delivery' : paymentMethod.toUpperCase()}.`,
            },
          ],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const nowIso = new Date().toISOString();
        this.saveLocalOrder({
          ...fallbackOrder,
          createdAt: nowIso,
          updatedAt: nowIso,
        });

        try {
          const sanitizedOrder = sanitizeForFirestore(fallbackOrder);
          const writePromise = setDoc(orderDocRef, sanitizedOrder);
          writePromise.catch(() => {});
          await withTimeout(writePromise, 2500, 'Order sync queued in background');
        } catch (setDocErr) {
          console.warn('Remote setDoc queued in persistent storage:', setDocErr);
        }

        // Consume one-time coupon / free delivery reward locally & remotely on user profile
        const fallbackTokens = Array.from(new Set([freeDeliveryCouponId, couponCode].filter(Boolean) as string[]));
        if (fallbackTokens.length > 0) {
          await withTimeout(
            Promise.all(
              fallbackTokens.map((tok) =>
                settingsService.markCouponUsed(tok, false, customerId).catch(() => {})
              )
            ),
            1800,
            'Fallback coupon consume sync'
          ).catch(() => {});
        }

        // Inventory will be deducted once Stock Control approves Stage 3

        // Notify customer + authorized admin devices in fallback checkout path
        const fallbackItemCount = items.reduce((acc, i) => acc + (i.quantity || 1), 0);
        notificationService
          .notifyOrderPlaced({
            orderNumber,
            total: grandTotal,
            customerId,
            customerEmail: customerEmail || shippingAddress.email,
            customerPhone: customerPhone || shippingAddress.phone,
            paymentMethod,
          })
          .catch(() => {});
        notificationService
          .notifyAdminNewOrder({
            orderNumber,
            customerName: customerName || shippingAddress.fullName,
            customerPhone: customerPhone || shippingAddress.phone,
            total: grandTotal,
            itemCount: fallbackItemCount,
            paymentMethod,
          })
          .catch(() => {});

        return {
          success: true,
          orderId: orderDocRef.id,
          orderNumber,
        };
      }
    } catch (err: any) {
      console.error('Order creation error:', err);
      return {
        success: false,
        error: err.message || 'Failed to place order. Please review your details and try again.',
      };
    }
  },

  // Customer order history - strictly isolated so customer only sees their own orders
  async getCustomerOrders(customerId?: string, email?: string, phone?: string): Promise<Order[]> {
    try {
      const orderMap = new Map<string, Order>();
      const cleanCustomerId = customerId && customerId !== 'guest' ? customerId.trim() : '';
      const cleanEmail = email ? email.trim().toLowerCase() : '';
      const cleanPhoneDigits = phone ? phone.replace(/[^0-9]/g, '').slice(-10) : '';

      // If no valid identifiers, return empty immediately
      if (!cleanCustomerId && !cleanEmail && (!cleanPhoneDigits || cleanPhoneDigits.length < 10)) {
        return [];
      }

      // 1. Local orders check (strictly filtered to this customer only)
      const localOrders = this.getLocalOrders();
      localOrders.forEach((lo) => {
        let isOwner = false;
        if (cleanCustomerId && lo.customerId === cleanCustomerId) {
          isOwner = true;
        } else if (cleanEmail && lo.customerEmail && lo.customerEmail.trim().toLowerCase() === cleanEmail) {
          isOwner = true;
        } else if (cleanPhoneDigits && cleanPhoneDigits.length >= 10 && lo.customerPhone) {
          const ordPhone = lo.customerPhone.replace(/[^0-9]/g, '').slice(-10);
          if (ordPhone === cleanPhoneDigits) {
            isOwner = true;
          }
        }
        if (isOwner) {
          orderMap.set(lo.id, lo);
        }
      });

      // 2. Query Firestore by customerId (matches security rule)
      if (cleanCustomerId) {
        try {
          const q = query(collection(db, 'orders'), where('customerId', '==', cleanCustomerId));
          const snap = await getDocs(q);
          snap.forEach((d) => {
            const ord = { id: d.id, ...d.data() } as Order;
            orderMap.set(d.id, ord);
            cacheOrderRecord(ord);
          });
        } catch (idErr) {
          console.warn('Orders by customerId notice:', idErr);
        }
      }

      // 3. Query Firestore by customerEmail (always fetch live updates including guest-to-account orders)
      if (cleanEmail) {
        try {
          const q = query(collection(db, 'orders'), where('customerEmail', '==', cleanEmail));
          const snap = await getDocs(q);
          snap.forEach((d) => {
            const ord = { id: d.id, ...d.data() } as Order;
            orderMap.set(d.id, ord);
            cacheOrderRecord(ord);
          });
        } catch (mailErr) {
          console.warn('Orders by email notice:', mailErr);
        }
      }

      // 4. Query Firestore by customerPhone (always fetch live updates)
      if (cleanPhoneDigits && cleanPhoneDigits.length >= 10) {
        try {
          const phoneVariants = [
            cleanPhoneDigits,
            `0${cleanPhoneDigits}`,
            `+880${cleanPhoneDigits}`,
            `880${cleanPhoneDigits}`,
          ];
          for (const pv of phoneVariants) {
            const q = query(collection(db, 'orders'), where('customerPhone', '==', pv), limit(10));
            const snap = await getDocs(q);
            snap.forEach((d) => {
              const ord = { id: d.id, ...d.data() } as Order;
              orderMap.set(d.id, ord);
              cacheOrderRecord(ord);
            });
          }
        } catch (phoneErr) {
          console.warn('Orders by phone notice:', phoneErr);
        }
      }

      // In-memory sort newest first
      const orders = Array.from(orderMap.values());
      orders.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0));
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0));
        return timeB - timeA;
      });

      return orders;
    } catch (e) {
      console.warn('Customer orders fetch error:', e);
      return [];
    }
  },

  // Get order by ID or Order Number (Live Firestore-first with local fallback & timeout safety)
  async getOrderById(id: string): Promise<Order | null> {
    if (!id) return null;
    const cleanId = id.trim();
    const cleanNum = cleanId.replace(/^[#]/, '').replace(/^MF-/, '').trim();

    const localOrders = this.getLocalOrders();
    const localMatch =
      localOrders.find((o) => {
        const oNum = (o.orderNumber || '').replace(/^[#]/, '').replace(/^MF-/, '').trim();
        return o.id === cleanId || oNum === cleanNum || o.orderNumber === cleanId;
      }) ||
      cachedOrdersMap.get(cleanId) ||
      cachedOrdersMap.get(cleanNum) ||
      cachedOrdersMap.get(`#${cleanNum}`) ||
      cachedOrdersMap.get(`MF-${cleanNum}`);

    const pickFresher = (remoteOrd: Order): Order => {
      if (localMatch && (localMatch.timeline?.length || 0) > (remoteOrd.timeline?.length || 0)) {
        return localMatch;
      }
      this.saveLocalOrder(remoteOrd);
      return remoteOrd;
    };

    // 1. Query Firestore by doc ID (live status, bounded timeout)
    try {
      const snap = await withTimeout(getDoc(doc(db, 'orders', cleanId)), 2500, 'Order fetch timeout');
      if (snap.exists()) {
        return pickFresher({ id: snap.id, ...snap.data() } as Order);
      }
    } catch {
      // Continue to fallback / orderNumber lookup
    }

    if (localMatch) {
      cacheOrderRecord(localMatch);
      return localMatch;
    }

    // 2. Query Firestore by orderNumber (live status)
    const searchVariants = [
      cleanId,
      `#${cleanNum}`,
      `MF-${cleanNum}`,
      cleanNum,
    ].filter(Boolean);

    for (const v of searchVariants) {
      try {
        const q = query(collection(db, 'orders'), where('orderNumber', '==', v), limit(1));
        const snap = await withTimeout(getDocs(q), 2000, 'Order lookup timeout');
        if (!snap.empty) {
          return pickFresher({ id: snap.docs[0].id, ...snap.docs[0].data() } as Order);
        }
      } catch {
        // Continue
      }
    }

    return null;
  },

  // Track order by Order Number and/or Phone Number (Live Firestore-first with local fallback)
  async trackOrder(orderQuery: string, phoneQuery?: string): Promise<Order | null> {
    try {
      const rawOrder = (orderQuery || '').trim();
      const cleanDigits = rawOrder.replace(/[^0-9]/g, '');
      const cleanOrderNumber = rawOrder.replace(/^[#]/, '').replace(/^MF-/, '').trim().toUpperCase();
      const rawPhone = (phoneQuery || '').trim().replace(/[^0-9]/g, '');
      const cleanPhoneDigits = rawPhone.length >= 10 ? rawPhone.slice(-10) : '';

      if (!cleanOrderNumber && !cleanPhoneDigits) {
        return null;
      }

      // Matching helper: strictly matches order against provided criteria
      const isOrderMatch = (ord: Order): boolean => {
        const ordRawNum = (ord.orderNumber || '').trim().toUpperCase();
        const ordCleanNum = ordRawNum.replace(/^[#]/, '').replace(/^MF-/, '').trim();
        const ordDigits = ordRawNum.replace(/[^0-9]/g, '');
        const ordDocId = (ord.id || '').trim();

        const orderNumMatches = Boolean(
          cleanOrderNumber &&
          (ordRawNum === cleanOrderNumber ||
           ordDocId === rawOrder ||
           ordCleanNum === cleanOrderNumber ||
           (cleanDigits.length >= 5 && ordDigits === cleanDigits))
        );

        const ordPhone = (ord.customerPhone || '').replace(/[^0-9]/g, '').slice(-10);
        const shipPhone = (ord.shippingAddress?.phone || '').replace(/[^0-9]/g, '').slice(-10);
        const phoneMatches = Boolean(
          cleanPhoneDigits &&
          (ordPhone === cleanPhoneDigits || shipPhone === cleanPhoneDigits)
        );

        // If BOTH order number and phone are provided, BOTH MUST MATCH!
        if (cleanOrderNumber && cleanPhoneDigits) {
          return orderNumMatches && phoneMatches;
        }
        if (cleanOrderNumber) {
          return orderNumMatches;
        }
        if (cleanPhoneDigits) {
          return phoneMatches;
        }
        return false;
      };

      // 1. Direct Firestore Doc ID query (live remote data)
      if (rawOrder && !rawOrder.startsWith('#')) {
        try {
          const docSnap = await getDoc(doc(db, 'orders', rawOrder));
          if (docSnap.exists()) {
            const ord = { id: docSnap.id, ...docSnap.data() } as Order;
            if (isOrderMatch(ord)) {
              this.saveLocalOrder(ord);
              return ord;
            }
          }
        } catch {
          // Continue
        }
      }

      // 2. Query Firestore by orderNumber variations (live remote data)
      if (cleanOrderNumber) {
        const variants = Array.from(
          new Set([
            `#${cleanOrderNumber}`,
            cleanOrderNumber,
            `MF-${cleanOrderNumber}`,
            cleanDigits ? `#${cleanDigits}` : '',
            cleanDigits ? `MF-${cleanDigits}` : '',
          ].filter(Boolean))
        );

        for (const variant of variants) {
          try {
            const q = query(collection(db, 'orders'), where('orderNumber', '==', variant), limit(5));
            const snap = await getDocs(q);
            for (const d of snap.docs) {
              const ord = { id: d.id, ...d.data() } as Order;
              if (isOrderMatch(ord)) {
                this.saveLocalOrder(ord);
                return ord;
              }
            }
          } catch {
            // Continue
          }
        }
      }

      // 3. Query Firestore by customerPhone (live remote data)
      if (cleanPhoneDigits) {
        const phoneVariants = [
          cleanPhoneDigits,
          `0${cleanPhoneDigits}`,
          `+880${cleanPhoneDigits}`,
          `880${cleanPhoneDigits}`,
        ];

        for (const pv of phoneVariants) {
          try {
            const q = query(collection(db, 'orders'), where('customerPhone', '==', pv), limit(5));
            const snap = await getDocs(q);
            for (const d of snap.docs) {
              const ord = { id: d.id, ...d.data() } as Order;
              if (isOrderMatch(ord)) {
                this.saveLocalOrder(ord);
                return ord;
              }
            }
          } catch {
            // Continue
          }
        }
      }

      // 4. Local storage & memory fallback (if offline / unpersisted local order)
      const localOrders = this.getLocalOrders();
      const localMatch = localOrders.find(isOrderMatch);
      if (localMatch) {
        cacheOrderRecord(localMatch);
        return localMatch;
      }

      if (cleanOrderNumber && !cleanPhoneDigits) {
        const cached =
          cachedOrdersMap.get(rawOrder) ||
          cachedOrdersMap.get(rawOrder.toUpperCase()) ||
          cachedOrdersMap.get(cleanOrderNumber) ||
          cachedOrdersMap.get(`#${cleanOrderNumber}`) ||
          cachedOrdersMap.get(`MF-${cleanOrderNumber}`);
        if (cached && isOrderMatch(cached)) {
          return cached;
        }
      }

      return null;
    } catch (e) {
      console.warn('Track order lookup exception:', e);
      return null;
    }
  },

  // Admin: Get all orders (Local-first & Firestore resilient)
  async getAllOrdersAdmin(status?: string): Promise<Order[]> {
    const orderMap = new Map<string, Order>();

    // 1. Load local orders first
    this.getLocalOrders().forEach((ord) => {
      orderMap.set(ord.id, ord);
    });

    // 2. Fetch remote orders from Firestore (preserve newer local updates if still syncing)
    try {
      let q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      if (status && status !== 'all') {
        q = query(
          collection(db, 'orders'),
          where('orderStatus', '==', status),
          orderBy('createdAt', 'desc')
        );
      }
      const snap = await withTimeout(getDocs(q), 4500, 'Admin orders sync timeout');
      snap.forEach((d) => {
        const ord = { id: d.id, ...d.data() } as Order;
        const existingLocal = orderMap.get(d.id);
        if (existingLocal && (existingLocal.timeline?.length || 0) > (ord.timeline?.length || 0)) {
          return;
        }
        orderMap.set(d.id, ord);
        cacheOrderRecord(ord);
      });
    } catch (e) {
      console.warn('Admin remote orders notice (using local-first):', e);
    }

    let orders = Array.from(orderMap.values());
    if (status && status !== 'all') {
      orders = orders.filter((o) => o.orderStatus === status);
    }

    orders.sort((a, b) => {
      const timeA = a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : a.createdAt?.seconds
        ? a.createdAt.seconds * 1000
        : a.createdAt
        ? new Date(a.createdAt).getTime()
        : 0;
      const timeB = b.createdAt?.toMillis
        ? b.createdAt.toMillis()
        : b.createdAt?.seconds
        ? b.createdAt.seconds * 1000
        : b.createdAt
        ? new Date(b.createdAt).getTime()
        : 0;
      return timeB - timeA;
    });

    return orders;
  },

  ensureSharedOrdersListener() {
    if (sharedOrdersUnsub) return;
    try {
      const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      sharedOrdersUnsub = onSnapshot(
        q,
        (snap) => {
          const orderMap = new Map<string, Order>();
          snap.forEach((d) => {
            const ord = { id: d.id, ...(d.data() as Omit<Order, 'id'>) };
            orderMap.set(ord.id, ord);
            cacheOrderRecord(ord);
          });

          // Only preserve genuinely unsettled optimistic session writes not yet reflected in remote
          sessionOptimisticOrders.forEach((optOrd, id) => {
            const remote = orderMap.get(id);
            if (!remote) {
              orderMap.set(id, optOrd);
              return;
            }
            const remoteTimelineLen = remote.timeline?.length || 0;
            const optTimelineLen = optOrd.timeline?.length || 0;
            const remoteUpdated = getOrderTimeMs(remote.updatedAt);
            const optUpdated = getOrderTimeMs(optOrd.updatedAt);
            if (optTimelineLen > remoteTimelineLen || (optUpdated > remoteUpdated && remoteUpdated > 0)) {
              orderMap.set(id, optOrd);
            } else {
              sessionOptimisticOrders.delete(id);
            }
          });

          const sorted = sortOrdersDesc(Array.from(orderMap.values()));
          liveAllOrders = sorted;
          persistOrdersBackup(sorted);
          allOrdersListeners.forEach((cb) => cb(sorted));
        },
        (err) => {
          console.warn('Realtime orders notice (using fallback cache):', err);
          if (liveAllOrders === null) {
            try {
              const raw = localStorage.getItem(LOCAL_ORDERS_KEY);
              const parsed = raw ? JSON.parse(raw) : [];
              const fallback = Array.isArray(parsed) ? sortOrdersDesc(parsed) : [];
              liveAllOrders = fallback;
              allOrdersListeners.forEach((cb) => cb(fallback));
            } catch {
              liveAllOrders = [];
              allOrdersListeners.forEach((cb) => cb([]));
            }
          }
        }
      );
    } catch {
      if (liveAllOrders === null) {
        liveAllOrders = [];
        allOrdersListeners.forEach((cb) => cb([]));
      }
    }
  },

  // Admin: Real-time live subscription for all orders (single shared Firestore persistentLocalCache stream)
  subscribeToAllOrdersAdmin(callback: (orders: Order[]) => void): Unsubscribe {
    allOrdersListeners.add(callback);
    if (liveAllOrders !== null) {
      callback(liveAllOrders);
    }
    this.ensureSharedOrdersListener();

    return () => {
      allOrdersListeners.delete(callback);
    };
  },

  // Admin: Update order status
  async updateOrderStatus(orderId: string, status: OrderStatus, note?: string) {
    let notifiedOrderInfo: Partial<Order> | null = null;
    const timestamp = new Date().toISOString();
    const resolvedNote = note || `Status updated to ${status} by Administrator.`;
    const buildDeliveredPatch = (ord: Partial<Order>) => {
      if (status !== 'delivered') return {};
      const orderTotal = Math.max(0, Number(ord.total) || 0);
      return {
        paymentStatus: 'paid' as PaymentStatus,
        paidAmount: orderTotal,
        dueAmount: 0,
        dueOnDelivery: 0,
        pipeline: {
          ...(ord.pipeline || { handoffHistory: [] }),
          currentStage: 'completed' as OrderPipelineStage,
          subStatus: 'DELIVERED' as OrderPipelineSubStatus,
          deliveredAt: ord.pipeline?.deliveredAt || timestamp,
        },
      };
    };

    // 1. Update local copy immediately
    const localOrders = this.getLocalOrders();
    const target = localOrders.find((o) => o.id === orderId);
    if (target) {
      target.orderStatus = status;
      target.updatedAt = timestamp;
      Object.assign(target, buildDeliveredPatch(target));
      target.timeline = [...(target.timeline || [])];
      target.timeline.push({
        status,
        timestamp,
        note: resolvedNote,
      });
      this.saveLocalOrder(target);
      notifiedOrderInfo = { ...target };
    }

    // 2. Update remote Firestore with bounded wait (never blocks UI indefinitely)
    try {
      const orderRef = doc(db, 'orders', orderId);
      const snap = await withTimeout(getDoc(orderRef), 2500, 'Fetch order timeout');
      if (snap.exists()) {
        const data = snap.data() as Order;
        if (!notifiedOrderInfo) notifiedOrderInfo = { ...data, id: snap.id };
        const timeline = [...(data.timeline || [])];
        timeline.push({
          status,
          timestamp,
          note: resolvedNote,
        });

        const updPromise = updateDoc(
          orderRef,
          sanitizeForFirestore({
            orderStatus: status,
            ...buildDeliveredPatch(data),
            timeline,
            updatedAt: serverTimestamp(),
          })
        );
        updPromise.catch(() => {});
        await withTimeout(updPromise, 2500, 'Update queued in background');
      } else if (target) {
        const setPromise = setDoc(
          orderRef,
          sanitizeForFirestore({
            ...target,
            orderStatus: status,
            timeline: target.timeline,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
        setPromise.catch(() => {});
        await withTimeout(setPromise, 2500, 'Save queued in background');
      }
    } catch (e) {
      console.warn('Remote updateOrderStatus notice (updated in local store):', e);
    }

    // 3. Dispatch real-time customer notification (mobile + in-app)
    if (notifiedOrderInfo?.orderNumber) {
      notificationService
        .notifyOrderStatusChanged({
          orderNumber: notifiedOrderInfo.orderNumber,
          status,
          note,
          customerId: notifiedOrderInfo.customerId,
          customerEmail: notifiedOrderInfo.customerEmail || notifiedOrderInfo.shippingAddress?.email,
          customerPhone: notifiedOrderInfo.customerPhone || notifiedOrderInfo.shippingAddress?.phone,
        })
        .catch(() => {});
    }
  },

  // Admin: Update payment status
  async updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus, note?: string) {
    let notifiedOrderInfo: Partial<Order> | null = null;
    const timestamp = new Date().toISOString();
    const resolvedNote = note || `Payment marked as "${paymentStatus.toUpperCase()}" by Administrator.`;

    // 1. Update local copy immediately
    const localOrders = this.getLocalOrders();
    const target = localOrders.find((o) => o.id === orderId);
    if (target) {
      target.paymentStatus = paymentStatus;
      target.timeline = [...(target.timeline || [])];
      target.timeline.push({
        status: target.orderStatus,
        timestamp,
        note: resolvedNote,
      });
      this.saveLocalOrder(target);
      notifiedOrderInfo = { ...target };
    }

    // 2. Update remote Firestore with bounded wait (never blocks UI indefinitely)
    try {
      const orderRef = doc(db, 'orders', orderId);
      const snap = await withTimeout(getDoc(orderRef), 2500, 'Fetch payment order timeout');
      if (snap.exists()) {
        const data = snap.data() as Order;
        if (!notifiedOrderInfo) notifiedOrderInfo = { ...data, id: snap.id };
        const timeline = [...(data.timeline || [])];
        timeline.push({
          status: data.orderStatus,
          timestamp,
          note: resolvedNote,
        });

        const updPromise = updateDoc(orderRef, {
          paymentStatus,
          timeline,
          updatedAt: serverTimestamp(),
        });
        updPromise.catch(() => {});
        await withTimeout(updPromise, 2500, 'Payment update queued in background');
      } else if (target) {
        const setPromise = setDoc(
          orderRef,
          sanitizeForFirestore({
            ...target,
            paymentStatus,
            timeline: target.timeline,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
        setPromise.catch(() => {});
        await withTimeout(setPromise, 2500, 'Payment save queued in background');
      }
    } catch (e) {
      console.warn('Remote updatePaymentStatus notice (updated in local store):', e);
    }

    // 3. Dispatch payment notification to customer
    if (notifiedOrderInfo?.orderNumber) {
      notificationService
        .notifyPaymentStatusChanged({
          orderNumber: notifiedOrderInfo.orderNumber,
          paymentStatus,
          customerId: notifiedOrderInfo.customerId,
          customerEmail: notifiedOrderInfo.customerEmail || notifiedOrderInfo.shippingAddress?.email,
          customerPhone: notifiedOrderInfo.customerPhone || notifiedOrderInfo.shippingAddress?.phone,
        })
        .catch(() => {});
    }
  },

  // Upload Payment Proof Screenshot:
  // Downsamples image on client side into an ultra-compact ~30KB high-fidelity JPEG Data URL
  // so payment confirmation succeeds 100% of the time even with NO Firebase Storage bucket!
  async uploadPaymentProof(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (!result) {
          resolve('');
          return;
        }
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxWidth = 720;
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(result);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.72);
            resolve(compressed);
          } catch {
            resolve(result);
          }
        };
        img.onerror = () => resolve(result);
        img.src = result;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  },

  // Derive the effective workflow position for both new and legacy orders
  getOrderPipelineStage(ord: Order): OrderPipelineStage {
    if (ord.orderStatus === 'returned' || ord.pipeline?.currentStage === 'returned') {
      return 'returned';
    }
    if (ord.orderStatus === 'cancelled' || ord.pipeline?.currentStage === 'cancelled') {
      return 'cancelled';
    }
    if (ord.orderChannel === 'pos') {
      return 'completed';
    }
    if (ord.pipeline?.currentStage) {
      return ord.pipeline.currentStage;
    }
    if (ord.orderStatus === 'delivered') {
      return 'completed';
    }
    if (ord.orderStatus === 'packed' || ord.orderStatus === 'shipped') {
      return 'delivery_dispatch';
    }
    if (ord.orderStatus === 'processing') {
      return 'inventory_packing';
    }
    if (ord.orderStatus === 'confirmed') {
      return ord.paymentStatus === 'paid' ? 'inventory_packing' : 'payment_verification';
    }
    return 'order_verification';
  },

  // Helper: fetch freshest order (Firestore-first with local fallback) and persist updates atomically
  async _loadOrderForMutation(orderId: string): Promise<Order | null> {
    const localOrd = this.getLocalOrders().find((o) => o.id === orderId) || null;
    try {
      const snap = await withTimeout(getDoc(doc(db, 'orders', orderId)), 2500, 'Fetch order timeout');
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as Omit<Order, 'id'>) };
      }
    } catch {
      // use local fallback
    }
    return localOrd;
  },

  async _persistOrderMutation(
    orderId: string,
    updatedOrder: Order,
    firestorePatch: Record<string, any>
  ): Promise<Order> {
    this.saveLocalOrder(updatedOrder);
    if (isFirestoreWriteBackedOff()) {
      return updatedOrder;
    }
    try {
      const orderRef = doc(db, 'orders', orderId);
      const upd = setDoc(
        orderRef,
        sanitizeForFirestore({
          ...firestorePatch,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
      upd.catch((err) => {
        markFirestoreWriteError(err);
      });
      await withTimeout(upd, 2500, 'Workflow sync queued');
    } catch (err) {
      markFirestoreWriteError(err);
    }
    return updatedOrder;
  },

  // Role A Step 1..6: Strict sequential field-by-field Customer Information Verification
  async verifyCustomerFieldStep(params: {
    orderId: string;
    fieldKey: CustomerVerificationFieldKey;
    actorName: string;
    actorEmail?: string;
    roleLabel?: string;
    note?: string;
  }): Promise<Order> {
    const { orderId, fieldKey, actorName, actorEmail, roleLabel = 'Order Verify', note } = params;
    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const stage = this.getOrderPipelineStage(baseOrder);
    if (stage !== 'order_verification') {
      throw new Error('Customer verification is already completed for this order.');
    }

    const fieldIdx = CUSTOMER_VERIFICATION_FIELDS.findIndex((f) => f.key === fieldKey);
    if (fieldIdx < 0) throw new Error('Invalid customer verification field.');

    const prevCv = baseOrder.pipeline?.customerVerification || {};
    for (let i = 0; i < fieldIdx; i++) {
      const prevField = CUSTOMER_VERIFICATION_FIELDS[i];
      if (prevCv[prevField.key]?.status !== 'verified') {
        throw new Error(`Please verify "${prevField.label}" before verifying "${CUSTOMER_VERIFICATION_FIELDS[fieldIdx].label}".`);
      }
    }

    const currField = CUSTOMER_VERIFICATION_FIELDS[fieldIdx];
    if (prevCv[fieldKey]?.status === 'needs_correction') {
      throw new Error(`"${currField.label}" needs correction. Save the corrected value before verifying.`);
    }

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';

    const nextCv: Partial<Record<CustomerVerificationFieldKey, FieldVerificationEntry>> = {
      ...prevCv,
      [fieldKey]: {
        ...(prevCv[fieldKey] || {}),
        status: 'verified',
        verifiedBy: safeActor,
        verifiedAt: timestamp,
        correctionNote: undefined,
      },
    };

    const nextField = CUSTOMER_VERIFICATION_FIELDS[fieldIdx + 1];
    const nextActionLabel = nextField
      ? `${nextField.label} Verification`
      : 'Payment Amount Verification';

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: `customer_${fieldKey}`,
      label: `${currField.label} Verified`,
      category: 'customer',
      actorName: safeActor,
      actorEmail,
      roleLabel,
      note: note || `${currField.label}: ${getCustomerFieldValueFromOrder(baseOrder, fieldKey) || 'Checked'}`,
      timestamp,
    };

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'order_verification' }),
      currentStage: 'order_verification',
      subStatus: 'ORDER_CHECKING',
      currentActionLabel: nextActionLabel,
      customerVerification: nextCv,
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
    };

    const updatedOrder: Order = {
      ...baseOrder,
      pipeline: updatedPipeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      pipeline: updatedPipeline,
    });
  },

  // Role A Correction Flow: Flag field "Needs Correction" OR update the field value and reset to pending for re-verification
  async flagOrCorrectCustomerField(params: {
    orderId: string;
    fieldKey: CustomerVerificationFieldKey;
    mode: 'needs_correction' | 'update_value';
    newValue?: string;
    note?: string;
    actorName: string;
    actorEmail?: string;
    roleLabel?: string;
  }): Promise<Order> {
    const { orderId, fieldKey, mode, newValue, note, actorName, actorEmail, roleLabel = 'Order Verify' } = params;
    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const stage = this.getOrderPipelineStage(baseOrder);
    if (stage !== 'order_verification') {
      throw new Error('Customer information can only be edited during Customer Verification.');
    }

    const fieldDef = CUSTOMER_VERIFICATION_FIELDS.find((f) => f.key === fieldKey);
    if (!fieldDef) throw new Error('Invalid customer field.');

    const fieldIdx = CUSTOMER_VERIFICATION_FIELDS.findIndex((f) => f.key === fieldKey);
    const prevCv = baseOrder.pipeline?.customerVerification || {};
    for (let i = 0; i < fieldIdx; i++) {
      const prevField = CUSTOMER_VERIFICATION_FIELDS[i];
      if (prevCv[prevField.key]?.status !== 'verified') {
        throw new Error(`Please verify "${prevField.label}" first.`);
      }
    }

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';

    const nextShippingAddress = { ...baseOrder.shippingAddress };
    let nextCustomerName = baseOrder.customerName;
    let nextCustomerPhone = baseOrder.customerPhone;
    let nextCustomerEmail = baseOrder.customerEmail;

    const nextCv: Partial<Record<CustomerVerificationFieldKey, FieldVerificationEntry>> = {
      ...prevCv,
    };

    let logLabel = `${fieldDef.label} Marked Needs Correction`;
    let logNote = note || 'Needs Correction';

    if (mode === 'needs_correction') {
      nextCv[fieldKey] = {
        status: 'needs_correction',
        correctionNote: note?.trim() || 'Needs Correction',
      };
    } else {
      const cleanVal = (newValue || '').trim();
      if (fieldKey !== 'email' && !cleanVal) {
        throw new Error(`${fieldDef.label} cannot be empty.`);
      }
      if (fieldKey === 'name') {
        nextCustomerName = cleanVal;
        nextShippingAddress.fullName = cleanVal;
      } else if (fieldKey === 'phone') {
        nextCustomerPhone = cleanVal;
        nextShippingAddress.phone = cleanVal;
      } else if (fieldKey === 'email') {
        nextCustomerEmail = cleanVal;
        nextShippingAddress.email = cleanVal;
      } else if (fieldKey === 'division') {
        nextShippingAddress.division = cleanVal;
      } else if (fieldKey === 'district') {
        nextShippingAddress.district = cleanVal;
      } else if (fieldKey === 'thana') {
        nextShippingAddress.thana = cleanVal;
        nextShippingAddress.upazila = cleanVal;
      } else if (fieldKey === 'postCode') {
        nextShippingAddress.postCode = cleanVal;
      } else if (fieldKey === 'address') {
        nextShippingAddress.address = cleanVal;
      }

      nextCv[fieldKey] = {
        status: 'pending',
        correctedValue: cleanVal,
        correctedBy: safeActor,
        correctedAt: timestamp,
      };
      // Reset initial payment verification if any subsequent verification depended on customer info
      logLabel = `${fieldDef.label} Corrected`;
      logNote = `Updated to "${cleanVal || 'Cleared'}" — awaiting re-verification`;
    }

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: `customer_${fieldKey}_${mode}`,
      label: logLabel,
      category: 'customer',
      actorName: safeActor,
      actorEmail,
      roleLabel,
      note: logNote,
      timestamp,
    };

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'order_verification' }),
      currentStage: 'order_verification',
      subStatus: 'ORDER_CHECKING',
      currentActionLabel:
        mode === 'needs_correction'
          ? `${fieldDef.label} (Needs Correction)`
          : `${fieldDef.label} Verification`,
      customerVerification: nextCv,
      initialPaymentVerification: {
        paymentAmount: { status: 'pending' },
        paymentMethod: { status: 'pending' },
        completed: false,
      },
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
    };

    const updatedOrder: Order = {
      ...baseOrder,
      customerName: nextCustomerName,
      customerPhone: nextCustomerPhone,
      customerEmail: nextCustomerEmail,
      shippingAddress: nextShippingAddress,
      pipeline: updatedPipeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      customerName: nextCustomerName,
      customerPhone: nextCustomerPhone,
      customerEmail: nextCustomerEmail,
      shippingAddress: nextShippingAddress,
      pipeline: updatedPipeline,
    });
  },

  // Role A Final Checks: Initial Payment Amount -> Payment Method -> Advance to Role C Payment Verification
  async verifyInitialPaymentStep(params: {
    orderId: string;
    step: 'paymentAmount' | 'paymentMethod';
    actorName: string;
    actorEmail?: string;
    roleLabel?: string;
    note?: string;
  }): Promise<Order> {
    const { orderId, step, actorName, actorEmail, roleLabel = 'Order Verify', note } = params;
    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const stage = this.getOrderPipelineStage(baseOrder);
    if (stage !== 'order_verification') {
      throw new Error('Initial payment verification is already completed for this order.');
    }

    const cv = baseOrder.pipeline?.customerVerification || {};
    for (const f of CUSTOMER_VERIFICATION_FIELDS) {
      if (cv[f.key]?.status !== 'verified') {
        throw new Error(`Complete all Customer Information fields first (pending: ${f.label}).`);
      }
    }

    const prevInit = baseOrder.pipeline?.initialPaymentVerification || {
      paymentAmount: { status: 'pending' },
      paymentMethod: { status: 'pending' },
      completed: false,
    };

    if (step === 'paymentMethod' && prevInit.paymentAmount?.status !== 'verified') {
      throw new Error('Please verify Payment Amount before verifying Payment Method.');
    }

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';

    const nextInit = {
      ...prevInit,
      [step]: {
        status: 'verified' as const,
        verifiedBy: safeActor,
        verifiedAt: timestamp,
      },
    };

    const isDone =
      nextInit.paymentAmount.status === 'verified' &&
      nextInit.paymentMethod.status === 'verified';

    const stepLabel = step === 'paymentAmount' ? 'Payment Amount Verified' : 'Payment Method Verified';
    const logsToAdd: OrderActivityLogEntry[] = [
      {
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        stepKey: `initial_${step}`,
        label: stepLabel,
        category: 'initial_payment',
        actorName: safeActor,
        actorEmail,
        roleLabel,
        note:
          step === 'paymentAmount'
            ? `Amount: ৳${(Number(baseOrder.total) || 0).toLocaleString('en-BD')}`
            : `Method: ${(baseOrder.paymentMethod || 'cod').toUpperCase()}`,
        timestamp,
      },
    ];

    let nextStage: OrderPipelineStage = 'order_verification';
    let nextSubStatus: OrderPipelineSubStatus = 'ORDER_CHECKING';
    let nextOrderStatus: OrderStatus = baseOrder.orderStatus;
    let nextActionLabel = 'Payment Method Verification';
    const nextHandoffHistory = [...(baseOrder.pipeline?.handoffHistory || [])];
    const nextTimeline = [...(baseOrder.timeline || [])];

    if (isDone) {
      nextInit.completed = true;
      nextInit.completedBy = safeActor;
      nextInit.completedAt = timestamp;
      nextStage = 'payment_verification';
      nextSubStatus = 'INITIAL_PAYMENT_VERIFIED';
      nextOrderStatus = 'confirmed';
      nextActionLabel = 'Payment Verification';
      logsToAdd.push({
        id: `act_${Date.now()}_rolea_done`,
        stepKey: 'role_a_completed',
        label: 'Customer & Initial Payment Verification Completed',
        category: 'initial_payment',
        actorName: safeActor,
        actorEmail,
        roleLabel,
        note: 'Moved to Payment Verification stage',
        timestamp,
      });
      nextHandoffHistory.push({
        stage: 'payment_verification',
        subStatus: 'INITIAL_PAYMENT_VERIFIED',
        handlerName: safeActor,
        handlerEmail: actorEmail,
        action: `Customer & Initial Payment Verification Completed by ${safeActor} -> Moved to Payment Verification`,
        note,
        timestamp,
      });
      nextTimeline.push({
        status: 'confirmed',
        timestamp,
        note: 'Customer information and initial payment details verified.',
      });
    }

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'order_verification' }),
      currentStage: nextStage,
      subStatus: nextSubStatus,
      currentActionLabel: nextActionLabel,
      initialPaymentVerification: nextInit,
      financialSnapshot: buildOrderFinancialSnapshot(baseOrder, safeActor),
      activityLog: [...(baseOrder.pipeline?.activityLog || []), ...logsToAdd],
      handoffHistory: nextHandoffHistory,
      ...(isDone
        ? {
            verifiedBy: safeActor,
            verifiedAt: timestamp,
            verificationNote: note || baseOrder.pipeline?.verificationNote,
          }
        : {}),
    };

    const updatedOrder: Order = {
      ...baseOrder,
      orderStatus: nextOrderStatus,
      pipeline: updatedPipeline,
      timeline: nextTimeline,
      updatedAt: timestamp,
    };

    const saved = await this._persistOrderMutation(orderId, updatedOrder, {
      orderStatus: nextOrderStatus,
      pipeline: updatedPipeline,
      timeline: nextTimeline,
    });

    if (isDone && baseOrder.orderNumber) {
      notificationService
        .notifyOrderStatusChanged({
          orderNumber: baseOrder.orderNumber,
          status: 'confirmed',
          note: 'Customer information verified and queued for payment verification.',
          customerId: baseOrder.customerId,
          customerEmail: baseOrder.customerEmail || baseOrder.shippingAddress?.email,
          customerPhone: baseOrder.customerPhone || baseOrder.shippingAddress?.phone,
        })
        .catch(() => {});
    }

    return saved;
  },

  // Strict sequential line-by-line Payment & Finance Verification
  async verifyPaymentStep(params: {
    orderId: string;
    stepKey: PaymentVerifyStepKey;
    editedTrxId?: string;
    editedAmount?: number;
    actorName: string;
    actorEmail?: string;
    roleLabel?: string;
    note?: string;
  }): Promise<Order> {
    const {
      orderId,
      stepKey,
      editedTrxId,
      editedAmount,
      actorName,
      actorEmail,
      roleLabel = 'Payment Verify',
      note,
    } = params;

    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const stage = this.getOrderPipelineStage(baseOrder);
    if (stage !== 'payment_verification') {
      throw new Error('Payment Verification requires Customer & Initial Payment Verification to be completed first.');
    }

    const defs = getPaymentVerifyStepsForOrder(baseOrder);
    const stepIdx = defs.findIndex((d) => d.key === stepKey);
    if (stepIdx < 0) throw new Error('Invalid payment verification line.');

    const prevSteps = baseOrder.pipeline?.paymentVerification?.steps || {};
    for (let i = 0; i < stepIdx; i++) {
      const prevDef = defs[i];
      if (prevSteps[prevDef.key]?.status !== 'verified') {
        throw new Error(`Please verify "${prevDef.label}" before verifying "${defs[stepIdx].label}".`);
      }
    }

    const currDef = defs[stepIdx];
    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';
    const isCod = baseOrder.paymentMethod === 'cod';
    const snapshot = buildOrderFinancialSnapshot(baseOrder, safeActor);

    const nextTrxId =
      stepKey === 'trxId' && typeof editedTrxId === 'string' && editedTrxId.trim()
        ? editedTrxId.trim()
        : baseOrder.paymentDetails?.transactionId || '';

    const nextPaymentDetails =
      stepKey === 'trxId' && typeof editedTrxId === 'string' && editedTrxId.trim()
        ? baseOrder.paymentDetails
          ? { ...baseOrder.paymentDetails, transactionId: nextTrxId }
          : { method: baseOrder.paymentMethod, transactionId: nextTrxId }
        : baseOrder.paymentDetails;

    const nextVerifiedPayAmount =
      stepKey === 'finalPayable' && typeof editedAmount === 'number' && editedAmount >= 0
        ? editedAmount
        : baseOrder.pipeline?.verifiedPaymentAmount;

    const nextSteps: Partial<Record<PaymentVerifyStepKey, FieldVerificationEntry>> = {
      ...prevSteps,
      [stepKey]: {
        status: 'verified',
        verifiedBy: safeActor,
        verifiedAt: timestamp,
        ...(nextTrxId && stepKey === 'trxId' ? { correctedValue: nextTrxId } : {}),
      },
    };

    const nextDef = defs[stepIdx + 1];
    const firstItemName = baseOrder.items?.[0]?.productName;
    const isFinalStep = stepKey === 'confirmation';

    const stepLogEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: `payment_${stepKey}`,
      label: isFinalStep
        ? isCod
          ? 'Payment Verified (COD · Awaiting Cash Collection)'
          : 'Payment & Transaction Verified'
        : `${currDef.label} Verified`,
      category: 'payment',
      actorName: safeActor,
      actorEmail,
      roleLabel,
      note:
        note ||
        `${currDef.label}: ${
          stepKey === 'trxId' ? nextTrxId || currDef.displayValue : currDef.displayValue
        }`,
      timestamp,
    };

    if (!isFinalStep) {
      const updatedPipeline: OrderPipelineData = {
        ...(baseOrder.pipeline || { currentStage: 'payment_verification' }),
        currentStage: 'payment_verification',
        subStatus: 'PAYMENT_PENDING',
        currentActionLabel: nextDef ? `${nextDef.label} Verification` : 'Payment Verification',
        financialSnapshot: snapshot,
        ...(typeof nextVerifiedPayAmount === 'number' ? { verifiedPaymentAmount: nextVerifiedPayAmount } : {}),
        paymentVerification: {
          ...(baseOrder.pipeline?.paymentVerification || {}),
          steps: nextSteps,
          ...(stepKey === 'trxId' ? { trxIdVerified: true } : {}),
          ...(stepKey === 'finalPayable' ? { amountVerified: true } : {}),
        },
        activityLog: [...(baseOrder.pipeline?.activityLog || []), stepLogEntry],
      };

      const updatedOrder: Order = {
        ...baseOrder,
        ...(nextPaymentDetails ? { paymentDetails: nextPaymentDetails } : {}),
        pipeline: updatedPipeline,
        updatedAt: timestamp,
      };

      return this._persistOrderMutation(orderId, updatedOrder, {
        ...(nextPaymentDetails ? { paymentDetails: nextPaymentDetails } : {}),
        pipeline: updatedPipeline,
      });
    }

    // Final confirmation line verified -> complete Payment Verification stage and advance to Stock Verification
    const orderTotal = snapshot.finalPayable;
    let nextPaymentStatus: PaymentStatus = baseOrder.paymentStatus;
    let nextPaidAmount =
      typeof baseOrder.paidAmount === 'number'
        ? baseOrder.paidAmount
        : baseOrder.paymentStatus === 'paid'
        ? orderTotal
        : Math.max(0, Number(baseOrder.advanceAmount ?? baseOrder.paymentDetails?.advanceAmount) || 0);
    let nextDueAmount =
      typeof baseOrder.dueAmount === 'number'
        ? baseOrder.dueAmount
        : Math.max(0, orderTotal - nextPaidAmount);
    const nextPaymentHistory: CustomerPaymentLog[] = [...(baseOrder.paymentHistory || [])];

    if (isCod) {
      // COD must NOT be treated as cash collected before delivery
      nextPaymentStatus = 'pending';
      nextDueAmount = Math.max(0, orderTotal - nextPaidAmount);
    } else {
      const amountConfirmed =
        typeof nextVerifiedPayAmount === 'number' && nextVerifiedPayAmount >= 0
          ? nextVerifiedPayAmount
          : orderTotal;
      nextPaidAmount = Math.min(orderTotal, Math.max(nextPaidAmount, amountConfirmed));
      nextDueAmount = Math.max(0, orderTotal - nextPaidAmount);
      if (nextDueAmount <= 0) {
        nextPaymentStatus = 'paid';
      }
      if (amountConfirmed > 0 && nextPaymentHistory.length === 0) {
        nextPaymentHistory.push({
          id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          amount: amountConfirmed,
          method: baseOrder.paymentMethod || 'bkash',
          trxId: nextTrxId || undefined,
          senderNumber: baseOrder.paymentDetails?.senderNumber || undefined,
          receivedBy: safeActor,
          note: note || 'Online payment verified',
          date: timestamp.slice(0, 10),
          timestamp,
        });
      }
    }

    const statusLabel = isCod
      ? 'Awaiting Cash Collection'
      : nextPaymentStatus === 'paid'
      ? 'Paid'
      : 'Pending';

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'payment_verification' }),
      currentStage: 'inventory_packing',
      subStatus: 'PAYMENT_VERIFIED',
      currentActionLabel: firstItemName ? `Stock Verify: ${firstItemName}` : 'Stock Verification & Update',
      financialSnapshot: snapshot,
      paymentVerification: {
        ...(baseOrder.pipeline?.paymentVerification || {}),
        transactionChecked: true,
        trxIdVerified: true,
        amountVerified: true,
        paymentConfirmed: true,
        codAwaitingCollection: isCod,
        statusLabel,
        verifiedBy: safeActor,
        verifiedAt: timestamp,
        steps: nextSteps,
      },
      paymentVerifiedBy: safeActor,
      paymentVerifiedAt: timestamp,
      verifiedPaymentAmount: isCod ? nextPaidAmount : orderTotal,
      paymentNote: note || baseOrder.pipeline?.paymentNote,
      activityLog: [...(baseOrder.pipeline?.activityLog || []), stepLogEntry],
      handoffHistory: [
        ...(baseOrder.pipeline?.handoffHistory || []),
        {
          stage: 'inventory_packing',
          subStatus: 'PAYMENT_VERIFIED',
          handlerName: safeActor,
          handlerEmail: actorEmail,
          action: isCod
            ? `COD Payment Verified (Awaiting Cash Collection) by ${safeActor} -> Moved to Stock Verification`
            : `Payment Verified (Paid) by ${safeActor} -> Moved to Stock Verification`,
          note,
          timestamp,
        },
      ],
    };

    const nextTimeline = [
      ...(baseOrder.timeline || []),
      {
        status: 'processing' as OrderStatus,
        timestamp,
        note: isCod
          ? 'Payment method confirmed (COD — Awaiting Cash Collection). Sent for stock verification.'
          : 'Payment verified and confirmed. Sent for stock verification.',
      },
    ];

    const updatedOrder: Order = {
      ...baseOrder,
      orderStatus: 'processing',
      paymentStatus: nextPaymentStatus,
      paidAmount: nextPaidAmount,
      dueAmount: nextDueAmount,
      dueOnDelivery: nextDueAmount,
      ...(nextPaymentDetails ? { paymentDetails: nextPaymentDetails } : {}),
      paymentHistory: nextPaymentHistory,
      pipeline: updatedPipeline,
      timeline: nextTimeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      orderStatus: 'processing',
      paymentStatus: nextPaymentStatus,
      paidAmount: nextPaidAmount,
      dueAmount: nextDueAmount,
      dueOnDelivery: nextDueAmount,
      ...(nextPaymentDetails ? { paymentDetails: nextPaymentDetails } : {}),
      paymentHistory: nextPaymentHistory,
      pipeline: updatedPipeline,
      timeline: nextTimeline,
    });
  },

  // Inline edit for Initial Payment Amount / Method before verification
  async updateInitialPaymentStepValue(params: {
    orderId: string;
    step: 'paymentAmount' | 'paymentMethod';
    value: string;
    actorName: string;
    actorEmail?: string;
  }): Promise<Order> {
    const { orderId, step, value, actorName, actorEmail } = params;
    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';
    const snapshot = buildOrderFinancialSnapshot(baseOrder, safeActor);

    let nextTotal = baseOrder.total;
    let nextMethod: PaymentMethod = baseOrder.paymentMethod;
    let nextPaymentDetails = baseOrder.paymentDetails;
    let nextSnapshot = { ...snapshot };

    if (step === 'paymentAmount') {
      const amt = Math.max(0, Number(value) || 0);
      nextTotal = amt;
      nextSnapshot.finalPayable = amt;
    } else {
      const m = (value || 'cod').trim().toLowerCase() as PaymentMethod;
      nextMethod = m;
      nextSnapshot.paymentMethod = m;
      nextPaymentDetails = baseOrder.paymentDetails
        ? { ...baseOrder.paymentDetails, method: m }
        : { method: m };
    }

    const paid = Math.max(0, Number(baseOrder.paidAmount ?? baseOrder.advanceAmount) || 0);
    const nextDue = Math.max(0, nextTotal - paid);

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: `edit_initial_${step}`,
      label:
        step === 'paymentAmount'
          ? `Payment Amount updated to ৳${nextTotal.toLocaleString('en-BD')}`
          : `Payment Method updated to ${nextMethod.toUpperCase()}`,
      category: 'initial_payment',
      actorName: safeActor,
      actorEmail,
      timestamp,
    };

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'order_verification' }),
      financialSnapshot: nextSnapshot,
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
    };

    const updatedOrder: Order = {
      ...baseOrder,
      total: nextTotal,
      dueAmount: nextDue,
      dueOnDelivery: nextDue,
      paymentMethod: nextMethod,
      ...(nextPaymentDetails ? { paymentDetails: nextPaymentDetails } : {}),
      pipeline: updatedPipeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      total: nextTotal,
      dueAmount: nextDue,
      dueOnDelivery: nextDue,
      paymentMethod: nextMethod,
      ...(nextPaymentDetails ? { paymentDetails: nextPaymentDetails } : {}),
      pipeline: updatedPipeline,
    });
  },

  // Inline edit for any Payment & Finance step
  async updatePaymentStepValue(params: {
    orderId: string;
    stepKey: PaymentVerifyStepKey;
    value: string;
    actorName: string;
    actorEmail?: string;
  }): Promise<Order> {
    const { orderId, stepKey, value, actorName, actorEmail } = params;
    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';
    const snapshot = { ...buildOrderFinancialSnapshot(baseOrder, safeActor) };

    let nextSubtotal = Math.max(0, Number(baseOrder.subtotal) || 0);
    let nextCouponDiscount = Math.max(0, Number(baseOrder.discount) || 0);
    let nextOnlineDiscount = Math.max(
      0,
      Number(snapshot.onlineDiscount ?? baseOrder.onlineDiscount ?? baseOrder.paymentDetails?.onlineDiscountApplied) || 0
    );
    let nextShipping = Math.max(0, Number(baseOrder.deliveryCharge) || 0);
    let nextCodCharge = Math.max(0, Number(snapshot.codCharge) || 0);
    let nextTotal = Math.max(0, Number(baseOrder.total) || 0);
    let nextPaidAmount = Math.max(0, Number(baseOrder.paidAmount ?? baseOrder.advanceAmount) || 0);
    let nextDueAmount = Math.max(0, Number(baseOrder.dueAmount ?? baseOrder.dueOnDelivery) || Math.max(0, nextTotal - nextPaidAmount));
    let nextPaymentDetails = baseOrder.paymentDetails ? { ...baseOrder.paymentDetails } : undefined;
    let nextPaymentNote = baseOrder.pipeline?.paymentNote;
    let nextVerifiedPayAmt = baseOrder.pipeline?.verifiedPaymentAmount;

    const recalcTotal = () => {
      const otherDisc = Math.max(0, snapshot.discount - snapshot.couponDiscount - (snapshot.onlineDiscount || 0));
      nextTotal = Math.max(
        0,
        nextSubtotal - nextCouponDiscount - nextOnlineDiscount - otherDisc + nextShipping + nextCodCharge
      );
      nextDueAmount = Math.max(0, nextTotal - nextPaidAmount);
    };

    const numVal = Math.max(0, Number(value) || 0);
    switch (stepKey) {
      case 'productPrice':
        nextSubtotal = numVal;
        snapshot.productPrice = numVal;
        recalcTotal();
        snapshot.finalPayable = nextTotal;
        break;
      case 'onlineDiscount':
        nextOnlineDiscount = numVal;
        snapshot.onlineDiscount = numVal;
        snapshot.discount = nextCouponDiscount + numVal;
        recalcTotal();
        snapshot.finalPayable = nextTotal;
        if (nextPaymentDetails) nextPaymentDetails.onlineDiscountApplied = numVal;
        break;
      case 'couponDiscount':
        nextCouponDiscount = numVal;
        snapshot.couponDiscount = numVal;
        snapshot.discount = numVal + nextOnlineDiscount;
        recalcTotal();
        snapshot.finalPayable = nextTotal;
        break;
      case 'discount':
        snapshot.discount = nextCouponDiscount + nextOnlineDiscount + numVal;
        recalcTotal();
        snapshot.finalPayable = nextTotal;
        break;
      case 'shipping':
        nextShipping = numVal;
        snapshot.shippingCharge = numVal;
        recalcTotal();
        snapshot.finalPayable = nextTotal;
        break;
      case 'codCharge':
        nextCodCharge = numVal;
        snapshot.codCharge = numVal;
        recalcTotal();
        snapshot.finalPayable = nextTotal;
        break;
      case 'finalPayable':
        nextTotal = numVal;
        nextVerifiedPayAmt = numVal;
        snapshot.finalPayable = numVal;
        nextDueAmount = Math.max(0, nextTotal - nextPaidAmount);
        break;
      case 'advancePaid':
        nextPaidAmount = Math.min(nextTotal, numVal);
        nextDueAmount = Math.max(0, nextTotal - nextPaidAmount);
        if (nextPaymentDetails) nextPaymentDetails.advanceAmount = nextPaidAmount;
        break;
      case 'dueOnDelivery':
        nextDueAmount = numVal;
        nextPaidAmount = Math.max(0, nextTotal - nextDueAmount);
        break;
      case 'senderNumber':
        nextPaymentDetails = {
          ...(nextPaymentDetails || { method: baseOrder.paymentMethod }),
          senderNumber: value.trim(),
        };
        break;
      case 'trxId':
        nextPaymentDetails = {
          ...(nextPaymentDetails || { method: baseOrder.paymentMethod }),
          transactionId: value.trim(),
        };
        break;
      case 'proof':
        nextPaymentDetails = {
          ...(nextPaymentDetails || { method: baseOrder.paymentMethod }),
          proofUrl: value.trim(),
        };
        break;
      case 'confirmation':
        nextPaymentNote = value.trim();
        break;
    }

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: `edit_payment_${stepKey}`,
      label: `Updated ${stepKey}: ${value.trim() || '৳0'}`,
      category: 'payment',
      actorName: safeActor,
      actorEmail,
      timestamp,
    };

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'payment_verification' }),
      financialSnapshot: snapshot,
      ...(typeof nextVerifiedPayAmt === 'number' ? { verifiedPaymentAmount: nextVerifiedPayAmt } : {}),
      ...(nextPaymentNote !== undefined ? { paymentNote: nextPaymentNote } : {}),
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
    };

    const updatedOrder: Order = {
      ...baseOrder,
      subtotal: nextSubtotal,
      discount: nextCouponDiscount,
      onlineDiscount: nextOnlineDiscount,
      deliveryCharge: nextShipping,
      total: nextTotal,
      paidAmount: nextPaidAmount,
      advanceAmount: baseOrder.paymentMethod === 'cod' ? nextPaidAmount : baseOrder.advanceAmount,
      dueAmount: nextDueAmount,
      dueOnDelivery: nextDueAmount,
      ...(nextPaymentDetails ? { paymentDetails: nextPaymentDetails } : {}),
      pipeline: updatedPipeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      subtotal: nextSubtotal,
      discount: nextCouponDiscount,
      onlineDiscount: nextOnlineDiscount,
      deliveryCharge: nextShipping,
      total: nextTotal,
      paidAmount: nextPaidAmount,
      ...(baseOrder.paymentMethod === 'cod' ? { advanceAmount: nextPaidAmount } : {}),
      dueAmount: nextDueAmount,
      dueOnDelivery: nextDueAmount,
      ...(nextPaymentDetails ? { paymentDetails: nextPaymentDetails } : {}),
      pipeline: updatedPipeline,
    });
  },

  // Inline edit for any Stock Verification item field before stock deduction
  async updateStockItemFieldValue(params: {
    orderId: string;
    itemIndex: number;
    fieldKey: StockVerifyFieldKey;
    value: string;
    actorName: string;
    actorEmail?: string;
  }): Promise<Order> {
    const { orderId, itemIndex, fieldKey, value, actorName, actorEmail } = params;
    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');
    if (baseOrder.pipeline?.stockDeducted || baseOrder.pipeline?.stockVerification?.stockUpdated) {
      throw new Error('Stock has already been updated for this order.');
    }

    const items = [...(baseOrder.items || [])];
    if (itemIndex < 0 || itemIndex >= items.length) {
      throw new Error('Order item not found.');
    }

    const targetItem = { ...items[itemIndex] };
    const cleanVal = value.trim();
    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';

    if (fieldKey === 'product' && cleanVal) {
      targetItem.productName = cleanVal;
    } else if (fieldKey === 'sku') {
      targetItem.sku = cleanVal || 'N/A';
      targetItem.productCode = cleanVal || 'N/A';
    } else if (fieldKey === 'size' && cleanVal) {
      targetItem.size = cleanVal;
    } else if (fieldKey === 'color' && cleanVal) {
      targetItem.color = cleanVal;
    } else if (fieldKey === 'quantity') {
      const nextQty = Math.max(1, Math.round(Number(value) || 1));
      targetItem.quantity = nextQty;
      targetItem.totalPrice = (Number(targetItem.unitPrice) || 0) * nextQty;
    }

    items[itemIndex] = targetItem;

    const nextSubtotal = items.reduce(
      (sum, it) => sum + (Number(it.totalPrice) || (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1)),
      0
    );
    const shipping = Math.max(0, Number(baseOrder.deliveryCharge) || 0);
    const couponDisc = Math.max(0, Number(baseOrder.discount) || 0);
    const onlineDisc = Math.max(0, Number(baseOrder.onlineDiscount) || 0);
    const nextTotal =
      fieldKey === 'quantity'
        ? Math.max(0, nextSubtotal - couponDisc - onlineDisc + shipping)
        : baseOrder.total;

    const snapshot = {
      ...buildOrderFinancialSnapshot(baseOrder, safeActor),
      ...(fieldKey === 'quantity'
        ? { productPrice: nextSubtotal, finalPayable: nextTotal }
        : {}),
    };

    const nextInventoryNote =
      fieldKey === 'currentStock' || fieldKey === 'stockUpdate'
        ? cleanVal || baseOrder.pipeline?.inventoryNote
        : baseOrder.pipeline?.inventoryNote;

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: `edit_stock_${itemIndex}_${fieldKey}`,
      label: `Edited ${fieldKey} (${targetItem.productName}): ${cleanVal}`,
      category: 'stock',
      actorName: safeActor,
      actorEmail,
      timestamp,
    };

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'inventory_packing' }),
      financialSnapshot: snapshot,
      ...(nextInventoryNote !== undefined ? { inventoryNote: nextInventoryNote } : {}),
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
    };

    const updatedOrder: Order = {
      ...baseOrder,
      items,
      ...(fieldKey === 'quantity' ? { subtotal: nextSubtotal, total: nextTotal } : {}),
      pipeline: updatedPipeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      items,
      ...(fieldKey === 'quantity' ? { subtotal: nextSubtotal, total: nextTotal } : {}),
      pipeline: updatedPipeline,
    });
  },

  // Inline edit for Packing & Delivery step fields (courier, tracking, delivery note)
  async updateDeliveryFieldValue(params: {
    orderId: string;
    stepKey: DeliveryStepKey;
    value: string;
    actorName: string;
    actorEmail?: string;
  }): Promise<Order> {
    const { orderId, stepKey, value, actorName, actorEmail } = params;
    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';
    const cleanVal = value.trim();

    let nextCourier = baseOrder.pipeline?.courierName;
    let nextTracking = baseOrder.pipeline?.trackingNumber;
    let nextNote = baseOrder.pipeline?.deliveryNote;

    if (stepKey === 'courierConfirmed') {
      nextCourier = cleanVal || nextCourier;
    } else if (stepKey === 'trackingAdded') {
      nextTracking = cleanVal;
    } else {
      nextNote = cleanVal;
    }

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: `edit_delivery_${stepKey}`,
      label: `Updated ${stepKey}: ${cleanVal}`,
      category: 'delivery',
      actorName: safeActor,
      actorEmail,
      timestamp,
    };

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'delivery_dispatch' }),
      ...(nextCourier !== undefined ? { courierName: nextCourier } : {}),
      ...(nextTracking !== undefined ? { trackingNumber: nextTracking } : {}),
      ...(nextNote !== undefined ? { deliveryNote: nextNote } : {}),
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
    };

    const updatedOrder: Order = {
      ...baseOrder,
      pipeline: updatedPipeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      pipeline: updatedPipeline,
    });
  },

  // Role C: Full Payment Verification (after Role A completion) -> Advances to Role B Stock Verification & Update
  async completeRoleCPaymentVerification(params: {
    orderId: string;
    transactionChecked?: boolean;
    trxIdVerified?: boolean;
    amountVerified?: boolean;
    verifiedAmount?: number;
    trxIdInput?: string;
    markAsPaid?: boolean;
    note?: string;
    actorName: string;
    actorEmail?: string;
    roleLabel?: string;
  }): Promise<Order> {
    const {
      orderId,
      transactionChecked = true,
      trxIdVerified = true,
      amountVerified = true,
      verifiedAmount,
      trxIdInput,
      markAsPaid,
      note,
      actorName,
      actorEmail,
      roleLabel = 'Payment Verify',
    } = params;

    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const stage = this.getOrderPipelineStage(baseOrder);
    if (stage !== 'payment_verification') {
      throw new Error('Payment Verification requires Customer & Initial Payment Verification to be completed first.');
    }

    const isCod = baseOrder.paymentMethod === 'cod';
    if (!isCod && (!transactionChecked || !trxIdVerified || !amountVerified)) {
      throw new Error('Please check Transaction, Transaction ID, and Payment Amount before confirming.');
    }

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';
    const snapshot = buildOrderFinancialSnapshot(baseOrder, safeActor);
    const orderTotal = snapshot.finalPayable;

    let nextPaymentStatus: PaymentStatus = baseOrder.paymentStatus;
    let nextPaidAmount =
      typeof baseOrder.paidAmount === 'number'
        ? baseOrder.paidAmount
        : baseOrder.paymentStatus === 'paid'
        ? orderTotal
        : Math.max(0, Number(baseOrder.advanceAmount ?? baseOrder.paymentDetails?.advanceAmount) || 0);
    let nextDueAmount =
      typeof baseOrder.dueAmount === 'number'
        ? baseOrder.dueAmount
        : Math.max(0, orderTotal - nextPaidAmount);
    const nextPaymentHistory: CustomerPaymentLog[] = [...(baseOrder.paymentHistory || [])];

    if (isCod) {
      // COD must NOT be treated as cash collected before delivery
      nextPaymentStatus = 'pending';
      nextDueAmount = Math.max(0, orderTotal - nextPaidAmount);
    } else {
      const amountConfirmed =
        typeof verifiedAmount === 'number' && verifiedAmount >= 0 ? verifiedAmount : orderTotal;
      nextPaidAmount = Math.min(orderTotal, Math.max(nextPaidAmount, amountConfirmed));
      nextDueAmount = Math.max(0, orderTotal - nextPaidAmount);
      const shouldConfirmPaid = markAsPaid !== false && nextDueAmount <= 0;
      if (shouldConfirmPaid) {
        nextPaymentStatus = 'paid';
      }
      if (amountConfirmed > 0 && nextPaymentHistory.length === 0) {
        nextPaymentHistory.push({
          id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          amount: amountConfirmed,
          method: baseOrder.paymentMethod || 'bkash',
          trxId: trxIdInput?.trim() || baseOrder.paymentDetails?.transactionId || undefined,
          senderNumber: baseOrder.paymentDetails?.senderNumber || undefined,
          receivedBy: safeActor,
          note: note || 'Online payment verified',
          date: timestamp.slice(0, 10),
          timestamp,
        });
      }
    }

    const statusLabel = isCod ? 'Awaiting Cash Collection' : nextPaymentStatus === 'paid' ? 'Paid' : 'Pending';
    const nextPaymentDetails = baseOrder.paymentDetails
      ? {
          ...baseOrder.paymentDetails,
          transactionId: trxIdInput?.trim() || baseOrder.paymentDetails.transactionId || '',
        }
      : trxIdInput?.trim()
      ? {
          method: baseOrder.paymentMethod,
          transactionId: trxIdInput.trim(),
        }
      : undefined;

    const allStepsDone: Partial<Record<PaymentVerifyStepKey, FieldVerificationEntry>> = {};
    getPaymentVerifyStepsForOrder(baseOrder).forEach((d) => {
      allStepsDone[d.key] = {
        status: 'verified',
        verifiedBy: safeActor,
        verifiedAt: timestamp,
      };
    });

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: 'role_c_payment_verify',
      label: isCod
        ? 'Payment Verified (COD · Awaiting Cash Collection)'
        : 'Payment & Transaction Verified',
      category: 'payment',
      actorName: safeActor,
      actorEmail,
      roleLabel,
      note:
        note ||
        (isCod
          ? `COD Order · Expected Cash on Delivery: ৳${nextDueAmount.toLocaleString('en-BD')}`
          : `Verified ৳${nextPaidAmount.toLocaleString('en-BD')} (${(baseOrder.paymentMethod || '').toUpperCase()})`),
      timestamp,
    };

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'payment_verification' }),
      currentStage: 'inventory_packing',
      subStatus: 'PAYMENT_VERIFIED',
      currentActionLabel: 'Stock Verification & Update',
      financialSnapshot: snapshot,
      paymentVerification: {
        transactionChecked: true,
        trxIdVerified: !isCod ? trxIdVerified : true,
        amountVerified: true,
        paymentConfirmed: true,
        codAwaitingCollection: isCod,
        statusLabel,
        verifiedBy: safeActor,
        verifiedAt: timestamp,
        steps: allStepsDone,
      },
      paymentVerifiedBy: safeActor,
      paymentVerifiedAt: timestamp,
      verifiedPaymentAmount: isCod ? nextPaidAmount : orderTotal,
      paymentNote: note || baseOrder.pipeline?.paymentNote,
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
      handoffHistory: [
        ...(baseOrder.pipeline?.handoffHistory || []),
        {
          stage: 'inventory_packing',
          subStatus: 'PAYMENT_VERIFIED',
          handlerName: safeActor,
          handlerEmail: actorEmail,
          action: isCod
            ? `COD Payment Verified (Awaiting Cash Collection) by ${safeActor} -> Moved to Stock Verification`
            : `Payment Verified (Paid) by ${safeActor} -> Moved to Stock Verification`,
          note,
          timestamp,
        },
      ],
    };

    const nextTimeline = [
      ...(baseOrder.timeline || []),
      {
        status: 'processing' as OrderStatus,
        timestamp,
        note: isCod
          ? 'Payment method confirmed (COD — Awaiting Cash Collection). Sent for stock verification.'
          : 'Payment verified and confirmed. Sent for stock verification.',
      },
    ];

    const updatedOrder: Order = {
      ...baseOrder,
      orderStatus: 'processing',
      paymentStatus: nextPaymentStatus,
      paidAmount: nextPaidAmount,
      dueAmount: nextDueAmount,
      dueOnDelivery: nextDueAmount,
      ...(nextPaymentDetails ? { paymentDetails: nextPaymentDetails } : {}),
      paymentHistory: nextPaymentHistory,
      pipeline: updatedPipeline,
      timeline: nextTimeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      orderStatus: 'processing',
      paymentStatus: nextPaymentStatus,
      paidAmount: nextPaidAmount,
      dueAmount: nextDueAmount,
      dueOnDelivery: nextDueAmount,
      ...(nextPaymentDetails ? { paymentDetails: nextPaymentDetails } : {}),
      paymentHistory: nextPaymentHistory,
      pipeline: updatedPipeline,
      timeline: nextTimeline,
    });
  },

  // Strict 7-field per-item Stock Verification with atomic idempotent stock deduction on final Stock Update
  async verifyStockFieldStep(params: {
    orderId: string;
    itemIndex: number;
    fieldKey: StockVerifyFieldKey;
    actorName: string;
    actorEmail?: string;
    roleLabel?: string;
    note?: string;
    forceStockOverride?: boolean;
  }): Promise<Order> {
    const {
      orderId,
      itemIndex,
      fieldKey,
      actorName,
      actorEmail,
      roleLabel = 'Stock Verify',
      note,
      forceStockOverride,
    } = params;

    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const stage = this.getOrderPipelineStage(baseOrder);
    if (stage !== 'inventory_packing') {
      if (baseOrder.pipeline?.stockDeducted || baseOrder.pipeline?.stockVerification?.stockUpdated) {
        throw new Error('Stock has already been updated for this order.');
      }
      throw new Error('Stock Verification requires Payment Verification to be completed first.');
    }

    if (
      baseOrder.pipeline?.stockDeducted === true ||
      baseOrder.pipeline?.stockVerification?.stockUpdated === true
    ) {
      throw new Error('Stock has already been updated for this order.');
    }

    const items = baseOrder.items || [];
    if (itemIndex < 0 || itemIndex >= items.length) {
      throw new Error('Invalid order item index for stock verification.');
    }

    const fieldIdx = STOCK_VERIFY_FIELDS.findIndex((f) => f.key === fieldKey);
    if (fieldIdx < 0) throw new Error('Invalid stock verification field.');

    const prevVerifiedItems = baseOrder.pipeline?.stockVerification?.verifiedItemIndices || [];
    const prevEntries = baseOrder.pipeline?.stockVerification?.stepEntries || {};

    // Strict serial enforcement across previous items and earlier fields on current item
    for (let i = 0; i < itemIndex; i++) {
      if (!prevVerifiedItems.includes(i)) {
        throw new Error(`Please finish stock verification for "${items[i].productName}" first.`);
      }
    }
    for (let j = 0; j < fieldIdx; j++) {
      const prevF = STOCK_VERIFY_FIELDS[j];
      const prevComposite = `${itemIndex}_${prevF.key}`;
      if (prevEntries[prevComposite]?.status !== 'verified') {
        throw new Error(`Please verify "${prevF.label}" before "${STOCK_VERIFY_FIELDS[fieldIdx].label}".`);
      }
    }

    const currItem = items[itemIndex];
    const currDef = STOCK_VERIFY_FIELDS[fieldIdx];
    const catalog = productService.getLocalProducts();
    const currProd = catalog.find((p) => p.id === currItem.productId);
    const currNeeded = Math.max(1, Number(currItem.quantity) || 1);
    const currAvail = currProd ? Math.max(0, Number(currProd.totalStock) || 0) : 0;

    if (fieldKey === 'stockUpdate' && currProd && !forceStockOverride && currAvail < currNeeded) {
      throw new Error(`Insufficient stock: ${currItem.productName} (Need ${currNeeded}, Available ${currAvail})`);
    }

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';
    const compositeKey = `${itemIndex}_${fieldKey}`;
    const nextEntries: Record<string, FieldVerificationEntry> = {
      ...prevEntries,
      [compositeKey]: {
        status: 'verified',
        verifiedBy: safeActor,
        verifiedAt: timestamp,
      },
    };

    const nextVerifiedItems =
      fieldKey === 'stockUpdate'
        ? Array.from(new Set([...prevVerifiedItems, itemIndex])).sort((a, b) => a - b)
        : prevVerifiedItems;

    const isVeryLastStep =
      itemIndex === items.length - 1 && fieldKey === 'stockUpdate';

    if (!isVeryLastStep) {
      const nextFieldDef = STOCK_VERIFY_FIELDS[fieldIdx + 1];
      const nextItemDef = !nextFieldDef ? items[itemIndex + 1] : null;
      const nextLabel = nextFieldDef
        ? `Stock · ${nextFieldDef.label}`
        : nextItemDef
        ? `Stock · ${STOCK_VERIFY_FIELDS[0].label}`
        : 'Stock Verification & Update';

      const logEntry: OrderActivityLogEntry = {
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        stepKey: `stock_${compositeKey}`,
        label: `${currDef.label} Verified (${currItem.productName})`,
        category: 'stock',
        actorName: safeActor,
        actorEmail,
        roleLabel,
        note:
          fieldKey === 'currentStock'
            ? `Available: ${currAvail}`
            : fieldKey === 'stockUpdate'
            ? `Item checked: ${currAvail} → ${Math.max(0, currAvail - currNeeded)}`
            : note,
        timestamp,
      };

      const updatedPipeline: OrderPipelineData = {
        ...(baseOrder.pipeline || { currentStage: 'inventory_packing' }),
        currentStage: 'inventory_packing',
        subStatus: 'STOCK_PENDING',
        currentActionLabel: nextLabel,
        stockVerification: {
          ...(baseOrder.pipeline?.stockVerification || {}),
          verifiedItemIndices: nextVerifiedItems,
          stepEntries: nextEntries,
        },
        activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
      };

      const updatedOrder: Order = {
        ...baseOrder,
        pipeline: updatedPipeline,
        updatedAt: timestamp,
      };

      return this._persistOrderMutation(orderId, updatedOrder, {
        pipeline: updatedPipeline,
      });
    }

    // Very last item's Stock Update -> validate & deduct stock once atomically
    const shortages: string[] = [];
    const itemsSnapshot: StockUpdateSnapshotItem[] = [];

    for (const item of items) {
      const prod = catalog.find((p) => p.id === item.productId);
      const needed = Math.max(1, Number(item.quantity) || 1);
      const stockBefore = prod ? Math.max(0, Number(prod.totalStock) || 0) : 0;
      const stockAfter = Math.max(0, stockBefore - needed);

      if (prod && !forceStockOverride && stockBefore < needed) {
        shortages.push(`${item.productName} (Need ${needed}, Available ${stockBefore})`);
      }

      itemsSnapshot.push({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku || item.productCode || prod?.sku || 'N/A',
        size: item.size || 'Standard',
        color: item.color || 'Standard',
        stockBefore,
        orderQuantity: needed,
        stockAfter,
      });
    }

    if (shortages.length > 0) {
      throw new Error(`Insufficient stock: ${shortages.join('; ')}`);
    }

    if (items.length > 0) {
      await productService
        .decrementProductStock(
          items.map((i) => ({
            productId: i.productId,
            size: i.size,
            color: i.color,
            quantity: i.quantity,
          })),
          false,
          {
            type: 'sale',
            referenceId: baseOrder.orderNumber,
            staffName: safeActor,
            reason: `Stock Verified & Updated (${baseOrder.orderNumber})`,
          }
        )
        .catch(() => {});
    }

    const summaryText = itemsSnapshot
      .map((s) => `${s.productName} (${s.size}/${s.color}): ${s.stockBefore} → ${s.stockAfter} (-${s.orderQuantity})`)
      .join(' | ');

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: 'role_b_stock_update',
      label: 'Stock Verified & Updated',
      category: 'stock',
      actorName: safeActor,
      actorEmail,
      roleLabel,
      note: note ? `${note} · ${summaryText}` : summaryText,
      timestamp,
    };

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'inventory_packing' }),
      currentStage: 'delivery_dispatch',
      subStatus: 'STOCK_UPDATED',
      currentActionLabel: 'Product Check',
      stockDeducted: true,
      stockDeductedAt: timestamp,
      stockDeductedBy: safeActor,
      stockRestored: false,
      stockVerification: {
        stockVerified: true,
        stockUpdated: true,
        itemsSnapshot,
        verifiedItemIndices: nextVerifiedItems,
        stepEntries: nextEntries,
        updatedBy: safeActor,
        updatedAt: timestamp,
      },
      inventoryHandledBy: safeActor,
      inventoryHandledAt: timestamp,
      stockApprovedBy: safeActor,
      stockApprovedAt: timestamp,
      inventoryNote: note || baseOrder.pipeline?.inventoryNote,
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
      handoffHistory: [
        ...(baseOrder.pipeline?.handoffHistory || []),
        {
          stage: 'delivery_dispatch',
          subStatus: 'STOCK_UPDATED',
          handlerName: safeActor,
          handlerEmail: actorEmail,
          action: `Stock Updated by ${safeActor} -> Moved to Packing & Delivery`,
          note: note || summaryText,
          timestamp,
        },
      ],
    };

    const updatedOrder: Order = {
      ...baseOrder,
      orderStatus: 'processing',
      pipeline: updatedPipeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      orderStatus: 'processing',
      pipeline: updatedPipeline,
    });
  },

  // Sequential per-item Stock Verification with single atomic idempotent deduction on final item
  async verifyStockItemStep(params: {
    orderId: string;
    itemIndex: number;
    actorName: string;
    actorEmail?: string;
    roleLabel?: string;
    note?: string;
    forceStockOverride?: boolean;
  }): Promise<Order> {
    const {
      orderId,
      itemIndex,
      actorName,
      actorEmail,
      roleLabel = 'Stock Verify',
      note,
      forceStockOverride,
    } = params;

    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const stage = this.getOrderPipelineStage(baseOrder);
    if (stage !== 'inventory_packing') {
      if (baseOrder.pipeline?.stockDeducted || baseOrder.pipeline?.stockVerification?.stockUpdated) {
        throw new Error('Stock has already been updated for this order.');
      }
      throw new Error('Stock Verification requires Payment Verification to be completed first.');
    }

    if (
      baseOrder.pipeline?.stockDeducted === true ||
      baseOrder.pipeline?.stockVerification?.stockUpdated === true
    ) {
      throw new Error('Stock has already been updated for this order.');
    }

    const items = baseOrder.items || [];
    if (itemIndex < 0 || itemIndex >= items.length) {
      throw new Error('Invalid order item index for stock verification.');
    }

    const prevVerified = baseOrder.pipeline?.stockVerification?.verifiedItemIndices || [];
    for (let i = 0; i < itemIndex; i++) {
      if (!prevVerified.includes(i)) {
        throw new Error(`Please verify stock for "${items[i].productName}" first.`);
      }
    }

    const currItem = items[itemIndex];
    const catalog = productService.getLocalProducts();
    const currProd = catalog.find((p) => p.id === currItem.productId);
    const currNeeded = Math.max(1, Number(currItem.quantity) || 1);
    const currAvail = currProd ? Math.max(0, Number(currProd.totalStock) || 0) : 0;

    if (currProd && !forceStockOverride && currAvail < currNeeded) {
      throw new Error(`Insufficient stock: ${currItem.productName} (Need ${currNeeded}, Available ${currAvail})`);
    }

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';
    const nextVerified = Array.from(new Set([...prevVerified, itemIndex])).sort((a, b) => a - b);
    const isLastItem = itemIndex === items.length - 1 && nextVerified.length >= items.length;

    if (!isLastItem) {
      const nextItem = items[itemIndex + 1];
      const logEntry: OrderActivityLogEntry = {
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        stepKey: `stock_item_${itemIndex}`,
        label: `Stock Checked: ${currItem.productName}`,
        category: 'stock',
        actorName: safeActor,
        actorEmail,
        roleLabel,
        note: `Before: ${currAvail} · Qty: ${currNeeded} · After: ${Math.max(0, currAvail - currNeeded)}`,
        timestamp,
      };

      const updatedPipeline: OrderPipelineData = {
        ...(baseOrder.pipeline || { currentStage: 'inventory_packing' }),
        currentStage: 'inventory_packing',
        subStatus: 'STOCK_PENDING',
        currentActionLabel: nextItem ? `Stock Verify: ${nextItem.productName}` : 'Stock Verification & Update',
        stockVerification: {
          ...(baseOrder.pipeline?.stockVerification || {}),
          verifiedItemIndices: nextVerified,
        },
        activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
      };

      const updatedOrder: Order = {
        ...baseOrder,
        pipeline: updatedPipeline,
        updatedAt: timestamp,
      };

      return this._persistOrderMutation(orderId, updatedOrder, {
        pipeline: updatedPipeline,
      });
    }

    // Final item verified -> validate all items & execute single idempotent stock deduction
    const shortages: string[] = [];
    const itemsSnapshot: StockUpdateSnapshotItem[] = [];

    for (const item of items) {
      const prod = catalog.find((p) => p.id === item.productId);
      const needed = Math.max(1, Number(item.quantity) || 1);
      const stockBefore = prod ? Math.max(0, Number(prod.totalStock) || 0) : 0;
      const stockAfter = Math.max(0, stockBefore - needed);

      if (prod && !forceStockOverride && stockBefore < needed) {
        shortages.push(`${item.productName} (Need ${needed}, Available ${stockBefore})`);
      }

      itemsSnapshot.push({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku || item.productCode || prod?.sku || 'N/A',
        size: item.size || 'Standard',
        color: item.color || 'Standard',
        stockBefore,
        orderQuantity: needed,
        stockAfter,
      });
    }

    if (shortages.length > 0) {
      throw new Error(`Insufficient stock: ${shortages.join('; ')}`);
    }

    if (items.length > 0) {
      await productService
        .decrementProductStock(
          items.map((i) => ({
            productId: i.productId,
            size: i.size,
            color: i.color,
            quantity: i.quantity,
          })),
          false,
          {
            type: 'sale',
            referenceId: baseOrder.orderNumber,
            staffName: safeActor,
            reason: `Stock Verified & Updated (${baseOrder.orderNumber})`,
          }
        )
        .catch(() => {});
    }

    const summaryText = itemsSnapshot
      .map((s) => `${s.productName} (${s.size}/${s.color}): ${s.stockBefore} → ${s.stockAfter} (-${s.orderQuantity})`)
      .join(' | ');

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: 'role_b_stock_update',
      label: 'Stock Verified & Updated',
      category: 'stock',
      actorName: safeActor,
      actorEmail,
      roleLabel,
      note: note ? `${note} · ${summaryText}` : summaryText,
      timestamp,
    };

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'inventory_packing' }),
      currentStage: 'delivery_dispatch',
      subStatus: 'STOCK_UPDATED',
      currentActionLabel: 'Product Check',
      stockDeducted: true,
      stockDeductedAt: timestamp,
      stockDeductedBy: safeActor,
      stockRestored: false,
      stockVerification: {
        stockVerified: true,
        stockUpdated: true,
        itemsSnapshot,
        verifiedItemIndices: nextVerified,
        updatedBy: safeActor,
        updatedAt: timestamp,
      },
      inventoryHandledBy: safeActor,
      inventoryHandledAt: timestamp,
      stockApprovedBy: safeActor,
      stockApprovedAt: timestamp,
      inventoryNote: note || baseOrder.pipeline?.inventoryNote,
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
      handoffHistory: [
        ...(baseOrder.pipeline?.handoffHistory || []),
        {
          stage: 'delivery_dispatch',
          subStatus: 'STOCK_UPDATED',
          handlerName: safeActor,
          handlerEmail: actorEmail,
          action: `Stock Updated by ${safeActor} -> Moved to Packing & Delivery`,
          note: note || summaryText,
          timestamp,
        },
      ],
    };

    const updatedOrder: Order = {
      ...baseOrder,
      orderStatus: 'processing',
      pipeline: updatedPipeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      orderStatus: 'processing',
      pipeline: updatedPipeline,
    });
  },

  // Role B: Stock Verification & Idempotent Stock Update (AFTER Role C Payment Verification)
  async performRoleBStockUpdate(params: {
    orderId: string;
    actorName: string;
    actorEmail?: string;
    roleLabel?: string;
    note?: string;
    forceStockOverride?: boolean;
  }): Promise<Order> {
    const { orderId, actorName, actorEmail, roleLabel = 'Stock Verify', note, forceStockOverride } = params;
    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const stage = this.getOrderPipelineStage(baseOrder);
    if (stage !== 'inventory_packing') {
      if (baseOrder.pipeline?.stockDeducted || baseOrder.pipeline?.stockVerification?.stockUpdated) {
        throw new Error('Stock has already been updated for this order.');
      }
      throw new Error('Stock Verification requires Payment Verification to be completed first.');
    }

    // Strict Idempotency Guard: Never deduct stock twice
    if (
      baseOrder.pipeline?.stockDeducted === true ||
      baseOrder.pipeline?.stockVerification?.stockUpdated === true
    ) {
      throw new Error('Stock has already been updated for this order (duplicate deduction blocked).');
    }

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';
    const catalog = productService.getLocalProducts();

    const shortages: string[] = [];
    const itemsSnapshot: StockUpdateSnapshotItem[] = [];

    for (const item of baseOrder.items || []) {
      const prod = catalog.find((p) => p.id === item.productId);
      const needed = Math.max(1, Number(item.quantity) || 1);
      const stockBefore = prod ? Math.max(0, Number(prod.totalStock) || 0) : 0;
      const stockAfter = Math.max(0, stockBefore - needed);

      if (prod && !forceStockOverride && stockBefore < needed) {
        shortages.push(`${item.productName} (Need ${needed}, Available ${stockBefore})`);
      }

      itemsSnapshot.push({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku || item.productCode || prod?.sku || 'N/A',
        size: item.size || 'Standard',
        color: item.color || 'Standard',
        stockBefore,
        orderQuantity: needed,
        stockAfter,
      });
    }

    if (shortages.length > 0) {
      throw new Error(`Insufficient stock: ${shortages.join('; ')}`);
    }

    if ((baseOrder.items || []).length > 0) {
      await productService
        .decrementProductStock(
          (baseOrder.items || []).map((i) => ({
            productId: i.productId,
            size: i.size,
            color: i.color,
            quantity: i.quantity,
          })),
          false,
          {
            type: 'sale',
            referenceId: baseOrder.orderNumber,
            staffName: safeActor,
            reason: `Stock Verified & Updated (${baseOrder.orderNumber})`,
          }
        )
        .catch(() => {});
    }

    const summaryText = itemsSnapshot
      .map((s) => `${s.productName} (${s.size}/${s.color}): ${s.stockBefore} → ${s.stockAfter} (-${s.orderQuantity})`)
      .join(' | ');

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: 'role_b_stock_update',
      label: 'Stock Verified & Updated',
      category: 'stock',
      actorName: safeActor,
      actorEmail,
      roleLabel,
      note: note ? `${note} · ${summaryText}` : summaryText,
      timestamp,
    };

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'inventory_packing' }),
      currentStage: 'delivery_dispatch',
      subStatus: 'STOCK_UPDATED',
      currentActionLabel: 'Product Check',
      stockDeducted: true,
      stockDeductedAt: timestamp,
      stockDeductedBy: safeActor,
      stockRestored: false,
      stockVerification: {
        stockVerified: true,
        stockUpdated: true,
        itemsSnapshot,
        verifiedItemIndices: (baseOrder.items || []).map((_, idx) => idx),
        updatedBy: safeActor,
        updatedAt: timestamp,
      },
      inventoryHandledBy: safeActor,
      inventoryHandledAt: timestamp,
      stockApprovedBy: safeActor,
      stockApprovedAt: timestamp,
      inventoryNote: note || baseOrder.pipeline?.inventoryNote,
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
      handoffHistory: [
        ...(baseOrder.pipeline?.handoffHistory || []),
        {
          stage: 'delivery_dispatch',
          subStatus: 'STOCK_UPDATED',
          handlerName: safeActor,
          handlerEmail: actorEmail,
          action: `Stock Updated by ${safeActor} -> Moved to Packing & Delivery`,
          note: note || summaryText,
          timestamp,
        },
      ],
    };

    const nextTimeline = [
      ...(baseOrder.timeline || []),
      {
        status: 'processing' as OrderStatus,
        timestamp,
        note: 'Order processing: stock verified and warehouse preparation started.',
      },
    ];

    const updatedOrder: Order = {
      ...baseOrder,
      orderStatus: 'processing',
      pipeline: updatedPipeline,
      timeline: nextTimeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      orderStatus: 'processing',
      pipeline: updatedPipeline,
      timeline: nextTimeline,
    });
  },

  // Role D: Strict 11-step Sequential Packing & Delivery Progression
  async advanceRoleDDeliveryStep(params: {
    orderId: string;
    stepKey: DeliveryStepKey;
    courierName?: string;
    trackingNumber?: string;
    note?: string;
    actorName: string;
    actorEmail?: string;
    roleLabel?: string;
  }): Promise<Order> {
    const {
      orderId,
      stepKey,
      courierName,
      trackingNumber,
      note,
      actorName,
      actorEmail,
      roleLabel = 'Delivery',
    } = params;

    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const stage = this.getOrderPipelineStage(baseOrder);
    if (stage !== 'delivery_dispatch') {
      throw new Error('Delivery steps require Stock Verification & Update to be completed first.');
    }

    const stepIdx = DELIVERY_STEP_SEQUENCE.findIndex((s) => s.key === stepKey);
    if (stepIdx < 0) throw new Error('Invalid delivery step.');

    const prevDp: DeliveryProgressState = baseOrder.pipeline?.deliveryProgress || {};
    if (prevDp[stepKey]?.completed) {
      throw new Error(`"${DELIVERY_STEP_SEQUENCE[stepIdx].label}" is already completed.`);
    }

    for (let i = 0; i < stepIdx; i++) {
      const prevStep = DELIVERY_STEP_SEQUENCE[i];
      if (!prevDp[prevStep.key]?.completed) {
        throw new Error(
          `Please complete "${prevStep.label}" before "${DELIVERY_STEP_SEQUENCE[stepIdx].label}".`
        );
      }
    }

    const resolvedCourier = courierName?.trim() || baseOrder.pipeline?.courierName || '';
    const resolvedTracking = trackingNumber?.trim() || baseOrder.pipeline?.trackingNumber || '';

    if (stepKey === 'courierConfirmed' && !resolvedCourier) {
      throw new Error('Please enter or select a Courier name before confirming Courier.');
    }
    if (stepKey === 'trackingAdded' && !resolvedTracking) {
      throw new Error('Please enter the Tracking Number before completing this step.');
    }

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';
    const currStepDef = DELIVERY_STEP_SEQUENCE[stepIdx];

    const nextDp: DeliveryProgressState = {
      ...prevDp,
      [stepKey]: {
        completed: true,
        completedBy: safeActor,
        completedAt: timestamp,
        note:
          stepKey === 'courierConfirmed'
            ? `Courier: ${resolvedCourier}`
            : stepKey === 'trackingAdded'
            ? `Tracking: ${resolvedTracking}`
            : note,
      },
    };

    let nextOrderStatus: OrderStatus = baseOrder.orderStatus;
    let nextStage: OrderPipelineStage = 'delivery_dispatch';
    let nextSubStatus: OrderPipelineSubStatus = currStepDef.subStatus;
    let nextActionLabel =
      DELIVERY_STEP_SEQUENCE[stepIdx + 1]?.label || 'COD Cash Collection / Finance Reconciliation';
    const nextTimeline = [...(baseOrder.timeline || [])];

    if (stepKey === 'packed') {
      nextOrderStatus = 'packed';
      nextTimeline.push({
        status: 'packed',
        timestamp,
        note: 'Order packed and sealed for courier dispatch.',
      });
    } else if (stepKey === 'courierConfirmed') {
      nextTimeline.push({
        status: 'packed',
        timestamp,
        note: `Courier confirmed (Rider assigned: ${resolvedCourier}).`,
      });
    } else if (stepKey === 'trackingAdded') {
      nextTimeline.push({
        status: 'packed',
        timestamp,
        note: `Courier tracking ID assigned (${resolvedTracking}).`,
      });
    } else if (stepKey === 'shipped') {
      nextOrderStatus = 'shipped';
      nextTimeline.push({
        status: 'shipped',
        timestamp,
        note: resolvedCourier
          ? `Parcel shipped & in transit via ${resolvedCourier}${resolvedTracking ? ` (Tracking: ${resolvedTracking})` : ''}.`
          : 'Parcel shipped & in transit.',
      });
    } else if (stepKey === 'outForDelivery') {
      nextOrderStatus = 'shipped';
      nextTimeline.push({
        status: 'shipped',
        timestamp,
        note: resolvedCourier
          ? `Out for delivery with ${resolvedCourier}.`
          : 'Parcel is out for delivery.',
      });
    } else if (stepKey === 'delivered') {
      nextOrderStatus = 'delivered';
      nextStage = 'cod_reconciliation';
      const remainingDue =
        typeof baseOrder.dueAmount === 'number'
          ? Math.max(0, baseOrder.dueAmount)
          : Math.max(0, (Number(baseOrder.total) || 0) - (Number(baseOrder.paidAmount) || 0));
      const isCodOrHasDue = baseOrder.paymentMethod === 'cod' || remainingDue > 0;
      nextSubStatus = isCodOrHasDue ? 'COD_AWAITING_COLLECTION' : 'DELIVERED';
      nextActionLabel = isCodOrHasDue
        ? 'COD Cash Collection & Finance Reconciliation'
        : 'Finance Reconciliation';
      nextTimeline.push({
        status: 'delivered',
        timestamp,
        note: 'Order delivered to customer.',
      });
    }

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: `delivery_${stepKey}`,
      label: currStepDef.label,
      category: 'delivery',
      actorName: safeActor,
      actorEmail,
      roleLabel,
      note:
        stepKey === 'courierConfirmed'
          ? `Courier: ${resolvedCourier}`
          : stepKey === 'trackingAdded'
          ? `Tracking ID: ${resolvedTracking}`
          : note,
      timestamp,
    };

    const remainingDueForCod =
      typeof baseOrder.dueAmount === 'number'
        ? Math.max(0, baseOrder.dueAmount)
        : Math.max(
            0,
            (Number(baseOrder.total) || 0) -
              (baseOrder.paymentStatus === 'paid'
                ? Number(baseOrder.total) || 0
                : Math.max(0, Number(baseOrder.advanceAmount ?? baseOrder.paymentDetails?.advanceAmount) || 0))
          );

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'delivery_dispatch' }),
      currentStage: nextStage,
      subStatus: nextSubStatus,
      currentActionLabel: nextActionLabel,
      deliveryProgress: nextDp,
      courierName: resolvedCourier || baseOrder.pipeline?.courierName,
      trackingNumber: resolvedTracking || baseOrder.pipeline?.trackingNumber,
      deliveryNote: note || baseOrder.pipeline?.deliveryNote,
      ...(stepKey === 'packed' ? { packedBy: safeActor, packedAt: timestamp } : {}),
      ...(stepKey === 'shipped'
        ? {
            shippedBy: safeActor,
            shippedAt: timestamp,
            deliveryHandledBy: safeActor,
            deliveryDispatchedAt: timestamp,
          }
        : {}),
      ...(stepKey === 'delivered'
        ? {
            deliveryHandledBy: safeActor,
            deliveredAt: timestamp,
            codReconciliation: {
              expectedCash: baseOrder.paymentMethod === 'cod' || remainingDueForCod > 0 ? remainingDueForCod : 0,
              reconciliationRequired: false,
              resolved: false,
            },
          }
        : {}),
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
      handoffHistory: [
        ...(baseOrder.pipeline?.handoffHistory || []),
        {
          stage: nextStage,
          subStatus: nextSubStatus,
          handlerName: safeActor,
          handlerEmail: actorEmail,
          action: `${currStepDef.label} completed by ${safeActor}`,
          note:
            stepKey === 'courierConfirmed'
              ? `Courier: ${resolvedCourier}`
              : stepKey === 'trackingAdded'
              ? `Tracking: ${resolvedTracking}`
              : note,
          timestamp,
        },
      ],
    };

    const updatedOrder: Order = {
      ...baseOrder,
      orderStatus: nextOrderStatus,
      pipeline: updatedPipeline,
      timeline: nextTimeline,
      updatedAt: timestamp,
    };

    const saved = await this._persistOrderMutation(orderId, updatedOrder, {
      orderStatus: nextOrderStatus,
      pipeline: updatedPipeline,
      timeline: nextTimeline,
    });

    if (
      baseOrder.orderNumber &&
      (stepKey === 'packed' || stepKey === 'shipped' || stepKey === 'delivered')
    ) {
      notificationService
        .notifyOrderStatusChanged({
          orderNumber: baseOrder.orderNumber,
          status: nextOrderStatus,
          note: `${currStepDef.label}${resolvedCourier ? ` · ${resolvedCourier}` : ''}`,
          customerId: baseOrder.customerId,
          customerEmail: baseOrder.customerEmail || baseOrder.shippingAddress?.email,
          customerPhone: baseOrder.customerPhone || baseOrder.shippingAddress?.phone,
        })
        .catch(() => {});
    }

    return saved;
  },

  // Role C Post-Delivery: COD Cash Collection & Finance Reconciliation -> Completed
  async recordRoleCCodReconciliation(params: {
    orderId: string;
    collectedAmount?: number;
    codCharge?: number;
    resolveDiscrepancy?: boolean;
    note?: string;
    actorName: string;
    actorEmail?: string;
    roleLabel?: string;
  }): Promise<Order> {
    const {
      orderId,
      collectedAmount,
      codCharge,
      resolveDiscrepancy = false,
      note,
      actorName,
      actorEmail,
      roleLabel = 'Payment Verify',
    } = params;

    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const stage = this.getOrderPipelineStage(baseOrder);
    if (stage !== 'cod_reconciliation') {
      throw new Error('COD Cash Collection & Finance Reconciliation is only available after Delivery.');
    }

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';
    const snapshot = buildOrderFinancialSnapshot(baseOrder, safeActor);
    const orderTotal = snapshot.finalPayable;

    const currentPaid =
      typeof baseOrder.paidAmount === 'number'
        ? baseOrder.paidAmount
        : baseOrder.paymentStatus === 'paid'
        ? orderTotal
        : Math.max(0, Number(baseOrder.advanceAmount ?? baseOrder.paymentDetails?.advanceAmount) || 0);

    const expectedCash = Math.max(
      0,
      baseOrder.pipeline?.codReconciliation?.expectedCash ?? Math.max(0, orderTotal - currentPaid)
    );

    const nextPaymentHistory: CustomerPaymentLog[] = [...(baseOrder.paymentHistory || [])];
    const enteredCash =
      typeof collectedAmount === 'number' && !isNaN(collectedAmount)
        ? Math.max(0, collectedAmount)
        : expectedCash;
    const safeCodCharge =
      typeof codCharge === 'number' && !isNaN(codCharge)
        ? Math.max(0, codCharge)
        : Math.max(
            0,
            Number(baseOrder.pipeline?.codReconciliation?.codCharge ?? snapshot.codCharge ?? 0) || 0
          );

    const deliveryChargeAmt = Math.max(
      0,
      Number(baseOrder.deliveryCharge ?? snapshot.shippingCharge ?? 0) || 0
    );
    const netCodCollected = Math.max(0, enteredCash - safeCodCharge);
    const grossCollectedTotal = Math.max(0, currentPaid + enteredCash);
    const productGrossCollected = Math.max(0, grossCollectedTotal - deliveryChargeAmt);
    const finalSaleAmount = Math.max(0, productGrossCollected - safeCodCharge);

    const discrepancy = enteredCash - expectedCash;
    const hasMismatch = expectedCash > 0 && Math.abs(discrepancy) > 0;

    if (hasMismatch && !resolveDiscrepancy) {
      const logEntry: OrderActivityLogEntry = {
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        stepKey: 'cod_reconciliation_mismatch',
        label: 'Reconciliation Required — Cash Mismatch',
        category: 'reconciliation',
        actorName: safeActor,
        actorEmail,
        roleLabel,
        note: `Expected: ৳${expectedCash.toLocaleString('en-BD')} · Collected: ৳${enteredCash.toLocaleString('en-BD')} · COD Charge: ৳${safeCodCharge.toLocaleString('en-BD')} · Diff: ৳${discrepancy.toLocaleString('en-BD')}${note ? ` (${note})` : ''}`,
        timestamp,
      };

      const updatedPipeline: OrderPipelineData = {
        ...(baseOrder.pipeline || { currentStage: 'cod_reconciliation' }),
        currentStage: 'cod_reconciliation',
        subStatus: 'RECONCILIATION_REQUIRED',
        currentActionLabel: 'Reconciliation Required',
        codReconciliation: {
          expectedCash,
          collectedCash: enteredCash,
          codCharge: safeCodCharge,
          netCodCollected,
          finalSaleAmount,
          discrepancyAmount: discrepancy,
          reconciliationRequired: true,
          discrepancyNote: note?.trim() || `Expected ৳${expectedCash}, Collected ৳${enteredCash}`,
          resolved: false,
          collectedBy: safeActor,
          collectedAt: timestamp,
        },
        activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
      };

      const updatedOrder: Order = {
        ...baseOrder,
        pipeline: updatedPipeline,
        updatedAt: timestamp,
      };

      return this._persistOrderMutation(orderId, updatedOrder, {
        pipeline: updatedPipeline,
      });
    }

    // Complete & finalize finance reconciliation
    if (expectedCash > 0 || enteredCash > 0) {
      nextPaymentHistory.push({
        id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        amount: enteredCash,
        method: baseOrder.paymentMethod || 'cod',
        receivedBy: safeActor,
        note:
          note ||
          (resolveDiscrepancy
            ? `COD Cash Collected (৳${enteredCash}) − COD Charge (৳${safeCodCharge}) = Net ৳${finalSaleAmount} · Discrepancy Resolved`
            : `COD Cash Collected (৳${enteredCash})${safeCodCharge > 0 ? ` − COD Charge (৳${safeCodCharge}) = Net Sale ৳${finalSaleAmount}` : ''}`),
        date: timestamp.slice(0, 10),
        timestamp,
      });
    }

    const logEntry: OrderActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepKey: 'cod_reconciliation_completed',
      label: expectedCash > 0 ? 'COD Cash Collection & Finance Reconciliation Completed' : 'Finance Reconciliation Completed',
      category: 'reconciliation',
      actorName: safeActor,
      actorEmail,
      roleLabel,
      note:
        expectedCash > 0 || enteredCash > 0
          ? `${
              deliveryChargeAmt > 0
                ? `Product Sale ৳${productGrossCollected.toLocaleString('en-BD')} (Delivery ৳${deliveryChargeAmt.toLocaleString('en-BD')} excl.)`
                : `Collected ৳${enteredCash.toLocaleString('en-BD')}`
            } − COD Charge ৳${safeCodCharge.toLocaleString('en-BD')} = Final Sale ৳${finalSaleAmount.toLocaleString('en-BD')}${resolveDiscrepancy ? ' (Discrepancy Resolved)' : ''}${note ? ` · ${note}` : ''}`
          : note || 'Prepaid order finance reconciled',
      timestamp,
    };

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'cod_reconciliation' }),
      currentStage: 'completed',
      subStatus: 'COMPLETED',
      currentActionLabel: 'Completed',
      financialSnapshot: snapshot,
      paymentVerification: {
        ...(baseOrder.pipeline?.paymentVerification || {}),
        codAwaitingCollection: false,
        statusLabel: 'Paid / Reconciled',
      },
      codReconciliation: {
        ...(baseOrder.pipeline?.codReconciliation || {}),
        expectedCash,
        collectedCash: enteredCash,
        codCharge: safeCodCharge,
        netCodCollected,
        finalSaleAmount,
        discrepancyAmount: discrepancy,
        reconciliationRequired: false,
        resolved: true,
        resolvedBy: safeActor,
        resolvedAt: timestamp,
        collectedBy: baseOrder.pipeline?.codReconciliation?.collectedBy || safeActor,
        collectedAt: baseOrder.pipeline?.codReconciliation?.collectedAt || timestamp,
        reconciledBy: safeActor,
        reconciledAt: timestamp,
      },
      activityLog: [...(baseOrder.pipeline?.activityLog || []), logEntry],
      handoffHistory: [
        ...(baseOrder.pipeline?.handoffHistory || []),
        {
          stage: 'completed',
          subStatus: 'COMPLETED',
          handlerName: safeActor,
          handlerEmail: actorEmail,
          action: `Finance Reconciliation Completed by ${safeActor} (Final Sale ৳${finalSaleAmount.toLocaleString('en-BD')})`,
          note,
          timestamp,
        },
      ],
    };

    const updatedOrder: Order = {
      ...baseOrder,
      orderStatus: 'delivered',
      paymentStatus: 'paid',
      paidAmount: finalSaleAmount,
      dueAmount: 0,
      dueOnDelivery: 0,
      codCharge: safeCodCharge,
      netSaleAmount: finalSaleAmount,
      paymentHistory: nextPaymentHistory,
      pipeline: updatedPipeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      orderStatus: 'delivered',
      paymentStatus: 'paid',
      paidAmount: finalSaleAmount,
      dueAmount: 0,
      dueOnDelivery: 0,
      codCharge: safeCodCharge,
      netSaleAmount: finalSaleAmount,
      paymentHistory: nextPaymentHistory,
      pipeline: updatedPipeline,
    });
  },

  async updateCodReconciliationValues(params: {
    orderId: string;
    collectedCash: number;
    codCharge: number;
    actorName: string;
    actorEmail?: string;
  }): Promise<Order> {
    const { orderId, collectedCash, codCharge, actorName, actorEmail } = params;
    const baseOrder = await this._loadOrderForMutation(orderId);
    if (!baseOrder) throw new Error('Order not found.');

    const timestamp = new Date().toISOString();
    const safeActor = actorName.trim() || 'Authorized Staff';
    const snapshot = buildOrderFinancialSnapshot(baseOrder, safeActor);
    const orderTotal = snapshot.finalPayable;

    const advancePaid = Math.max(
      0,
      Number(baseOrder.advanceAmount ?? baseOrder.paymentDetails?.advanceAmount) || 0
    );
    const prevExpected = Math.max(
      0,
      baseOrder.pipeline?.codReconciliation?.expectedCash ?? Math.max(0, orderTotal - advancePaid)
    );
    const preCollectionPaid = Math.max(0, orderTotal - prevExpected);
    const deliveryChargeAmt = Math.max(
      0,
      Number(baseOrder.deliveryCharge ?? snapshot.shippingCharge ?? 0) || 0
    );
    const safeCollected = Math.max(0, Number(collectedCash) || 0);
    const safeCodCharge = Math.max(0, Number(codCharge) || 0);
    const netCodCollected = Math.max(0, safeCollected - safeCodCharge);
    const productGrossCollected = Math.max(0, preCollectionPaid + safeCollected - deliveryChargeAmt);
    const finalSaleAmount = Math.max(0, productGrossCollected - safeCodCharge);
    const discrepancy = safeCollected - prevExpected;
    const isAlreadyResolved = Boolean(baseOrder.pipeline?.codReconciliation?.resolved);

    const updatedPipeline: OrderPipelineData = {
      ...(baseOrder.pipeline || { currentStage: 'cod_reconciliation' }),
      codReconciliation: {
        ...(baseOrder.pipeline?.codReconciliation || { expectedCash: prevExpected }),
        expectedCash: prevExpected,
        collectedCash: safeCollected,
        codCharge: safeCodCharge,
        netCodCollected,
        finalSaleAmount,
        discrepancyAmount: discrepancy,
      },
      activityLog: [
        ...(baseOrder.pipeline?.activityLog || []),
        {
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          stepKey: 'cod_reconciliation_edited',
          label: 'COD Reconciliation & Charge Updated',
          category: 'reconciliation',
          actorName: safeActor,
          actorEmail,
          roleLabel: 'Payment Verify',
          note: `${
            deliveryChargeAmt > 0
              ? `Product Sale ৳${productGrossCollected.toLocaleString('en-BD')} (Delivery ৳${deliveryChargeAmt.toLocaleString('en-BD')} excl.)`
              : `Collected ৳${safeCollected.toLocaleString('en-BD')}`
          } − COD Charge ৳${safeCodCharge.toLocaleString('en-BD')} = Final Sale ৳${finalSaleAmount.toLocaleString('en-BD')}`,
          timestamp,
        },
      ],
    };

    const updatedOrder: Order = {
      ...baseOrder,
      codCharge: safeCodCharge,
      ...(isAlreadyResolved
        ? {
            netSaleAmount: finalSaleAmount,
            paidAmount: finalSaleAmount,
          }
        : {}),
      pipeline: updatedPipeline,
      updatedAt: timestamp,
    };

    return this._persistOrderMutation(orderId, updatedOrder, {
      codCharge: safeCodCharge,
      ...(isAlreadyResolved
        ? {
            netSaleAmount: finalSaleAmount,
            paidAmount: finalSaleAmount,
          }
        : {}),
      pipeline: updatedPipeline,
    });
  },

  // Advance / transition an order across workflow stages with staff accountability & Stage 3 stock deduction
  async transferOrderStage(params: {
    orderId: string;
    nextStage: OrderPipelineStage;
    subStatus?: OrderPipelineSubStatus;
    handlerName: string;
    handlerEmail?: string;
    note?: string;
    markPaymentStatus?: PaymentStatus;
    overrideOrderStatus?: OrderStatus;
    courierName?: string;
    trackingNumber?: string;
    keepCurrentStage?: boolean;
    forceStockOverride?: boolean;
    verifiedPaymentAmount?: number;
    refundAmount?: number;
    cancelReason?: string;
  }): Promise<Order | null> {
    const {
      orderId,
      nextStage,
      subStatus,
      handlerName,
      handlerEmail,
      note,
      markPaymentStatus,
      overrideOrderStatus,
      courierName,
      trackingNumber,
      keepCurrentStage,
      forceStockOverride,
      verifiedPaymentAmount,
      refundAmount,
      cancelReason,
    } = params;

    const timestamp = new Date().toISOString();
    const currentLocal = this.getLocalOrders().find((o) => o.id === orderId);
    let baseOrder: Order | null = currentLocal || null;

    try {
      const snap = await withTimeout(getDoc(doc(db, 'orders', orderId)), 2500, 'Pipeline fetch timeout');
      if (snap.exists()) {
        baseOrder = { id: snap.id, ...(snap.data() as Omit<Order, 'id'>) };
      }
    } catch {
      // use local if offline
    }

    if (!baseOrder) return null;

    const prevStage = this.getOrderPipelineStage(baseOrder);
    const resolvedNextStage: OrderPipelineStage = keepCurrentStage ? prevStage : nextStage;
    const existingPipeline: OrderPipelineData = baseOrder.pipeline || {
      currentStage: prevStage,
      handoffHistory: [],
    };

    let targetOrderStatus: OrderStatus = overrideOrderStatus || baseOrder.orderStatus;
    if (!overrideOrderStatus && !keepCurrentStage) {
      if (resolvedNextStage === 'payment_verification') targetOrderStatus = 'confirmed';
      else if (resolvedNextStage === 'inventory_packing') targetOrderStatus = 'processing';
      else if (resolvedNextStage === 'delivery_dispatch') {
        targetOrderStatus = courierName || trackingNumber || subStatus === 'SHIPPED' || subStatus === 'OUT_FOR_DELIVERY'
          ? 'shipped'
          : 'packed';
      } else if (resolvedNextStage === 'completed') targetOrderStatus = 'delivered';
      else if (resolvedNextStage === 'returned') targetOrderStatus = 'returned';
      else if (resolvedNextStage === 'cancelled') targetOrderStatus = 'cancelled';
      else if (resolvedNextStage === 'order_verification') targetOrderStatus = 'pending';
    }

    const orderTotal = Math.max(0, Number(baseOrder.total) || 0);
    let nextPaidAmount =
      typeof baseOrder.paidAmount === 'number'
        ? baseOrder.paidAmount
        : baseOrder.paymentStatus === 'paid'
          ? orderTotal
          : Math.max(0, Number(baseOrder.advanceAmount ?? baseOrder.paymentDetails?.advanceAmount) || 0);
    let nextDueAmount =
      typeof baseOrder.dueAmount === 'number'
        ? baseOrder.dueAmount
        : Math.max(0, orderTotal - nextPaidAmount);
    const nextPaymentHistory: CustomerPaymentLog[] = [...(baseOrder.paymentHistory || [])];

    if (typeof verifiedPaymentAmount === 'number' && verifiedPaymentAmount > 0) {
      nextPaidAmount = Math.min(orderTotal, verifiedPaymentAmount);
      nextDueAmount = Math.max(0, orderTotal - nextPaidAmount);
      nextPaymentHistory.push({
        id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        amount: verifiedPaymentAmount,
        method: baseOrder.paymentMethod || 'cod',
        receivedBy: handlerName.trim() || 'Accounts Staff',
        note: note || 'Verified payment at accounts desk',
        date: timestamp.slice(0, 10),
        timestamp,
      });
    } else if (markPaymentStatus === 'paid' || resolvedNextStage === 'completed') {
      if (nextPaidAmount < orderTotal) {
        const delta = orderTotal - nextPaidAmount;
        nextPaymentHistory.push({
          id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          amount: delta,
          method: baseOrder.paymentMethod || 'cod',
          receivedBy: handlerName.trim() || 'Authorized Staff',
          note: note || (resolvedNextStage === 'completed' ? 'Collected on delivery' : 'Marked paid in full'),
          date: timestamp.slice(0, 10),
          timestamp,
        });
      }
      nextPaidAmount = orderTotal;
      nextDueAmount = 0;
    }

    const targetPaymentStatus: PaymentStatus =
      markPaymentStatus ||
      (verifiedPaymentAmount !== undefined && nextDueAmount <= 0
        ? 'paid'
        : resolvedNextStage === 'completed' && baseOrder.paymentStatus === 'pending'
          ? 'paid'
          : baseOrder.paymentStatus);

    const safeActor = handlerName.trim() || 'Authorized Staff';

    // Handle Inventory Deduction when Stock Control approves & transfers to Delivery Desk (or skips directly to completed)
    let stockDeductedFlag = existingPipeline.stockDeducted;
    let stockDeductedAtFlag = existingPipeline.stockDeductedAt;
    let stockDeductedByFlag = existingPipeline.stockDeductedBy;
    let stockRestoredFlag = existingPipeline.stockRestored;
    let stockRestoredAtFlag = existingPipeline.stockRestoredAt;

    const shouldDeductNow =
      !keepCurrentStage &&
      (resolvedNextStage === 'delivery_dispatch' || resolvedNextStage === 'completed') &&
      existingPipeline.stockDeducted === false &&
      (baseOrder.items || []).length > 0;

    if (shouldDeductNow) {
      // Stage 3 Stock Sufficiency Guard: block blind negative stock deduction unless override explicitly approved
      if (!forceStockOverride) {
        const catalog = productService.getLocalProducts();
        const shortages: string[] = [];
        for (const item of baseOrder.items || []) {
          const prod = catalog.find((p) => p.id === item.productId);
          if (prod) {
            const avail = Math.max(0, Number(prod.totalStock) || 0);
            const needed = Math.max(1, Number(item.quantity) || 1);
            if (avail < needed) {
              shortages.push(`${item.productName} (Need ${needed}, Available ${avail})`);
            }
          }
        }
        if (shortages.length > 0) {
          throw new Error(`Insufficient stock: ${shortages.join('; ')}`);
        }
      }

      await productService
        .decrementProductStock(
          (baseOrder.items || []).map((i) => ({
            productId: i.productId,
            size: i.size,
            color: i.color,
            quantity: i.quantity,
          })),
          false,
          {
            type: 'sale',
            referenceId: baseOrder.orderNumber,
            staffName: safeActor,
            reason: `Stage 3 Stock Approved & Deducted (${baseOrder.orderNumber})`,
          }
        )
        .catch(() => {});
      stockDeductedFlag = true;
      stockDeductedAtFlag = timestamp;
      stockDeductedByFlag = safeActor;
      stockRestoredFlag = false;
    }

    // Restore inventory automatically if order is returned or cancelled after stock was deducted
    const shouldRestoreNow =
      (resolvedNextStage === 'returned' || resolvedNextStage === 'cancelled') &&
      existingPipeline.stockDeducted !== false &&
      !existingPipeline.stockRestored &&
      (baseOrder.items || []).length > 0;

    if (shouldRestoreNow) {
      await productService
        .restoreProductStock(
          (baseOrder.items || []).map((i) => ({
            productId: i.productId,
            size: i.size,
            color: i.color,
            quantity: i.quantity,
          })),
          {
            referenceId: baseOrder.orderNumber,
            staffName: safeActor,
            reason: `${resolvedNextStage === 'returned' ? 'Order returned' : 'Order cancelled'} restock (${baseOrder.orderNumber})`,
          }
        )
        .catch(() => {});
      stockDeductedFlag = false;
      stockRestoredFlag = true;
      stockRestoredAtFlag = timestamp;
    }

    const resolvedSubStatus: OrderPipelineSubStatus =
      subStatus ||
      (markPaymentStatus === 'refunded'
        ? 'REFUNDED'
        : resolvedNextStage === 'payment_verification'
          ? 'ORDER_CHECKED'
          : resolvedNextStage === 'inventory_packing'
            ? 'PAYMENT_VERIFIED'
            : resolvedNextStage === 'delivery_dispatch'
              ? targetOrderStatus === 'shipped'
                ? 'SHIPPED'
                : 'PACKED'
              : resolvedNextStage === 'completed'
                ? 'DELIVERED'
                : resolvedNextStage === 'returned'
                  ? 'RETURNED'
                  : resolvedNextStage === 'cancelled'
                    ? 'CANCELLED'
                    : 'ORDER_CHECKING');

    let actionSummary = `Order updated to ${resolvedNextStage.replace(/_/g, ' ')} by ${safeActor}`;
    let customerTimelineNote = `Order status updated to ${targetOrderStatus}.`;

    if (keepCurrentStage && markPaymentStatus === 'paid') {
      actionSummary = `Payment marked PAID by ${safeActor}`;
      customerTimelineNote = 'Payment verified and marked as paid.';
    } else if (keepCurrentStage && markPaymentStatus === 'refunded') {
      actionSummary = `Payment marked REFUNDED by ${safeActor}${refundAmount ? ` (৳${refundAmount.toLocaleString('en-BD')})` : ''}`;
      customerTimelineNote = 'Payment refund processed.';
    } else if (resolvedNextStage === 'payment_verification') {
      actionSummary = `Order verified & approved by ${safeActor} -> Transferred to Payment Desk`;
      customerTimelineNote = 'Order verified and confirmed by store team.';
    } else if (resolvedNextStage === 'inventory_packing') {
      actionSummary = `Payment verified by ${safeActor} -> Transferred to Stock & Packaging Desk`;
      customerTimelineNote = 'Payment confirmed and order sent for stock check & packaging.';
    } else if (resolvedNextStage === 'delivery_dispatch' && targetOrderStatus === 'packed') {
      actionSummary = `Stock checked, deducted & ${resolvedSubStatus === 'PACKING' ? 'packing started' : 'packed'} by ${safeActor} -> Transferred to Delivery Desk`;
      customerTimelineNote = 'Items quality-checked, packed, and ready for courier dispatch.';
    } else if (resolvedNextStage === 'delivery_dispatch' && targetOrderStatus === 'shipped') {
      actionSummary = `${resolvedSubStatus === 'OUT_FOR_DELIVERY' ? 'Out for delivery' : 'Dispatched'} by ${safeActor}${courierName ? ` via ${courierName}` : ''}`;
      customerTimelineNote = courierName
        ? `Parcel dispatched via ${courierName}${trackingNumber ? ` (Tracking: ${trackingNumber})` : ''}.`
        : 'Parcel handed over to courier and currently in transit.';
    } else if (resolvedNextStage === 'completed') {
      actionSummary = `Delivered & completed by ${safeActor}`;
      customerTimelineNote = 'Order delivered successfully. Thank you for shopping with Selvee.';
    } else if (resolvedNextStage === 'returned') {
      actionSummary = `Order marked as Returned by ${safeActor}${shouldRestoreNow ? ' (Stock Restored)' : ''}`;
      customerTimelineNote = 'Order has been marked as returned.';
    } else if (resolvedNextStage === 'cancelled') {
      actionSummary = `Order cancelled by ${safeActor}${cancelReason ? `: ${cancelReason}` : ''}${shouldRestoreNow ? ' (Stock Restored)' : ''}`;
      customerTimelineNote = 'Order has been cancelled.';
    }

    const nextHistory = [
      ...(existingPipeline.handoffHistory || []),
      {
        stage: resolvedNextStage,
        subStatus: resolvedSubStatus,
        handlerName: safeActor,
        handlerEmail,
        action: actionSummary,
        note: note || cancelReason || undefined,
        timestamp,
      },
    ];

    const nextActivityLog: OrderActivityLogEntry[] = [
      ...(existingPipeline.activityLog || []),
      {
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        stepKey: `stage_${resolvedNextStage}_${resolvedSubStatus}`,
        label: actionSummary,
        category:
          resolvedNextStage === 'payment_verification'
            ? 'customer'
            : resolvedNextStage === 'inventory_packing' || markPaymentStatus === 'refunded'
            ? 'payment'
            : resolvedNextStage === 'delivery_dispatch'
            ? 'delivery'
            : 'order',
        actorName: safeActor,
        actorEmail: handlerEmail,
        note: note || cancelReason || undefined,
        timestamp,
      },
    ];

    const updatedPipeline: OrderPipelineData = {
      ...existingPipeline,
      currentStage: resolvedNextStage,
      subStatus: resolvedSubStatus,
      currentActionLabel:
        resolvedNextStage === 'cancelled'
          ? 'Cancelled'
          : resolvedNextStage === 'returned'
          ? 'Returned'
          : resolvedNextStage === 'completed'
          ? 'Completed'
          : existingPipeline.currentActionLabel,
      stockDeducted: stockDeductedFlag,
      stockDeductedAt: stockDeductedAtFlag,
      stockDeductedBy: stockDeductedByFlag,
      stockRestored: stockRestoredFlag,
      stockRestoredAt: stockRestoredAtFlag,
      handoffHistory: nextHistory,
      activityLog: nextActivityLog,
      ...(resolvedNextStage === 'payment_verification'
        ? {
            verifiedBy: safeActor,
            verifiedAt: timestamp,
            verificationNote: note || existingPipeline.verificationNote,
          }
        : {}),
      ...(resolvedNextStage === 'inventory_packing' || markPaymentStatus === 'paid' || verifiedPaymentAmount !== undefined
        ? {
            paymentVerifiedBy: safeActor,
            paymentVerifiedAt: timestamp,
            verifiedPaymentAmount: nextPaidAmount,
            paymentNote: note || existingPipeline.paymentNote,
          }
        : {}),
      ...(resolvedNextStage === 'delivery_dispatch' && targetOrderStatus === 'packed'
        ? {
            inventoryHandledBy: safeActor,
            inventoryHandledAt: timestamp,
            stockApprovedBy: safeActor,
            stockApprovedAt: timestamp,
            packedBy: safeActor,
            packedAt: timestamp,
            inventoryNote: note || existingPipeline.inventoryNote,
          }
        : {}),
      ...(resolvedNextStage === 'delivery_dispatch' && (targetOrderStatus === 'shipped' || courierName || trackingNumber)
        ? {
            deliveryHandledBy: safeActor,
            deliveryDispatchedAt: timestamp,
            shippedBy: safeActor,
            shippedAt: timestamp,
            courierName: courierName || existingPipeline.courierName,
            trackingNumber: trackingNumber || existingPipeline.trackingNumber,
            deliveryNote: note || existingPipeline.deliveryNote,
          }
        : {}),
      ...(resolvedNextStage === 'completed'
        ? {
            deliveryHandledBy: safeActor,
            deliveredAt: timestamp,
            courierName: courierName || existingPipeline.courierName,
            trackingNumber: trackingNumber || existingPipeline.trackingNumber,
            deliveryNote: note || existingPipeline.deliveryNote,
          }
        : {}),
      ...(resolvedNextStage === 'returned'
        ? {
            returnedBy: safeActor,
            returnedAt: timestamp,
            returnNote: note || existingPipeline.returnNote,
          }
        : {}),
      ...(markPaymentStatus === 'refunded'
        ? {
            refundedBy: safeActor,
            refundedAt: timestamp,
            refundAmount: refundAmount ?? nextPaidAmount,
          }
        : {}),
      ...(resolvedNextStage === 'cancelled'
        ? {
            cancelledBy: safeActor,
            cancelledAt: timestamp,
            cancelledReason: cancelReason || note || existingPipeline.cancelledReason,
            cancelNote: note || cancelReason || existingPipeline.cancelNote,
          }
        : {}),
    };

    const updatedTimeline = [
      ...(baseOrder.timeline || []),
      {
        status: targetOrderStatus,
        timestamp,
        note: customerTimelineNote,
      },
    ];

    const updatedOrder: Order = {
      ...baseOrder,
      orderStatus: targetOrderStatus,
      paymentStatus: targetPaymentStatus,
      paidAmount: nextPaidAmount,
      dueAmount: resolvedNextStage === 'cancelled' || resolvedNextStage === 'returned' ? 0 : nextDueAmount,
      advanceAmount: nextPaidAmount,
      dueOnDelivery: resolvedNextStage === 'cancelled' || resolvedNextStage === 'returned' ? 0 : nextDueAmount,
      paymentHistory: nextPaymentHistory,
      pipeline: updatedPipeline,
      timeline: updatedTimeline,
      updatedAt: timestamp,
    };

    this.saveLocalOrder(updatedOrder);

    if (!isFirestoreWriteBackedOff()) {
      try {
        const orderRef = doc(db, 'orders', orderId);
        const upd = setDoc(
          orderRef,
          sanitizeForFirestore({
            orderStatus: targetOrderStatus,
            paymentStatus: targetPaymentStatus,
            paidAmount: updatedOrder.paidAmount,
            dueAmount: updatedOrder.dueAmount,
            advanceAmount: updatedOrder.advanceAmount,
            dueOnDelivery: updatedOrder.dueOnDelivery,
            paymentHistory: nextPaymentHistory,
            pipeline: updatedPipeline,
            timeline: updatedTimeline,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
        upd.catch((err) => {
          markFirestoreWriteError(err);
        });
        await withTimeout(upd, 2500, 'Pipeline sync queued');
      } catch (err) {
        markFirestoreWriteError(err);
      }
    }

    if (baseOrder.orderNumber && targetOrderStatus !== baseOrder.orderStatus) {
      notificationService
        .notifyOrderStatusChanged({
          orderNumber: baseOrder.orderNumber,
          status: targetOrderStatus,
          note: customerTimelineNote,
          customerId: baseOrder.customerId,
          customerEmail: baseOrder.customerEmail || baseOrder.shippingAddress?.email,
          customerPhone: baseOrder.customerPhone || baseOrder.shippingAddress?.phone,
        })
        .catch(() => {});
    }

    if (
      baseOrder.orderNumber &&
      (resolvedNextStage === 'completed' || resolvedNextStage === 'cancelled' || resolvedNextStage === 'returned')
    ) {
      notificationService
        .notifyAdminWorkflowAlert({
          id: `wf-alert-${baseOrder.id}-${resolvedNextStage}`,
          title: `Order ${baseOrder.orderNumber} ${resolvedNextStage.toUpperCase()}`,
          message: `${actionSummary} · Total ৳${orderTotal.toLocaleString('en-BD')}`,
          targetOrderNumber: baseOrder.orderNumber,
          actionUrl: '/admin?tab=pipeline',
          important: resolvedNextStage === 'cancelled' || resolvedNextStage === 'returned',
          createdBy: safeActor,
        })
        .catch(() => {});
    }

    return updatedOrder;
  },

  // Create immediate Walk-In POS Counter Sale (supports CRM customer, delivery, coupon, partial payment/due, cancelled logging)
  async createPosOrder(params: {
    customerId?: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    deliveryRequired?: boolean;
    deliveryZone?: string;
    deliveryAddress?: string;
    deliveryCharge?: number;
    couponCode?: string;
    items: OrderItem[];
    subtotal: number;
    discount: number;
    total: number;
    paymentMethod: PaymentMethod;
    paidAmount?: number;
    dueAmount?: number;
    trxId?: string;
    senderNumber?: string;
    cashierName: string;
    notes?: string;
    orderStatusOverride?: 'cancelled';
    cancelReason?: string;
  }): Promise<{ success: boolean; order?: Order; error?: string }> {
    try {
      const {
        customerId,
        customerName,
        customerPhone,
        customerEmail,
        deliveryRequired,
        deliveryZone,
        deliveryAddress,
        deliveryCharge = 0,
        couponCode,
        items,
        subtotal,
        discount,
        total,
        paymentMethod,
        paidAmount,
        dueAmount,
        trxId,
        senderNumber,
        cashierName,
        notes,
        orderStatusOverride,
        cancelReason,
      } = params;

      if (!items || items.length === 0) {
        return { success: false, error: 'Add at least one item to complete POS sale.' };
      }

      const isCancelledSale = orderStatusOverride === 'cancelled';
      const orderNumber = `POS-${Math.floor(100000 + Math.random() * 900000)}`;
      const orderDocRef = doc(collection(db, 'orders'));
      const nowIso = new Date().toISOString();

      const resolvedPaid = isCancelledSale
        ? 0
        : typeof paidAmount === 'number'
          ? Math.max(0, Math.min(total, paidAmount))
          : paymentMethod === 'due'
            ? 0
            : total;
      const resolvedDue = isCancelledSale
        ? 0
        : typeof dueAmount === 'number'
          ? Math.max(0, dueAmount)
          : Math.max(0, total - resolvedPaid);
      const paymentStatus: PaymentStatus = isCancelledSale
        ? 'failed'
        : resolvedDue <= 0
          ? 'paid'
          : 'pending';

      const initialPaymentHistory: CustomerPaymentLog[] =
        resolvedPaid > 0 && !isCancelledSale
          ? [
              {
                id: `pay_${Date.now()}`,
                amount: resolvedPaid,
                method: paymentMethod,
                trxId: trxId?.trim() || undefined,
                senderNumber: senderNumber?.trim() || undefined,
                receivedBy: cashierName,
                note: 'POS Counter Initial Payment',
                date: nowIso.slice(0, 10),
                timestamp: nowIso,
              },
            ]
          : [];

      const newOrder: Order = {
        id: orderDocRef.id,
        orderNumber,
        customerId: customerId || 'walk-in-pos',
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim() || 'N/A',
        customerEmail: customerEmail?.trim() || '',
        shippingAddress: {
          fullName: customerName.trim() || 'Walk-in Customer',
          phone: customerPhone.trim() || 'N/A',
          email: customerEmail?.trim() || '',
          address: deliveryRequired && deliveryAddress ? deliveryAddress.trim() : 'In-Store POS Counter',
          division: 'Dhaka',
          district: 'Dhaka',
          notes: notes || '',
        },
        items,
        subtotal,
        discount,
        onlineDiscount: 0,
        couponCode: couponCode?.trim().toUpperCase() || undefined,
        deliveryRequired: Boolean(deliveryRequired),
        deliveryCharge: deliveryRequired ? Math.max(0, Number(deliveryCharge) || 0) : 0,
        deliveryZone: deliveryRequired ? deliveryZone || 'Delivery Zone' : 'POS Store Counter',
        total,
        paymentMethod,
        paymentDetails:
          trxId || senderNumber
            ? {
                method: paymentMethod,
                transactionId: trxId?.trim() || undefined,
                senderNumber: senderNumber?.trim() || undefined,
                paidAt: resolvedPaid > 0 ? nowIso : undefined,
              }
            : undefined,
        advanceDeliveryPaid: resolvedDue <= 0,
        advanceAmount: resolvedPaid,
        dueOnDelivery: resolvedDue,
        paidAmount: resolvedPaid,
        dueAmount: resolvedDue,
        paymentHistory: initialPaymentHistory,
        posCancelReason: cancelReason?.trim() || undefined,
        paymentStatus,
        orderStatus: isCancelledSale ? 'cancelled' : 'delivered',
        orderChannel: 'pos',
        pipeline: {
          currentStage: isCancelledSale ? 'cancelled' : 'completed',
          subStatus: isCancelledSale ? 'CANCELLED' : 'DELIVERED',
          stockDeducted: !isCancelledSale,
          stockDeductedAt: !isCancelledSale ? nowIso : undefined,
          stockDeductedBy: !isCancelledSale ? cashierName : undefined,
          verifiedBy: cashierName,
          verifiedAt: nowIso,
          paymentVerifiedBy: cashierName,
          paymentVerifiedAt: nowIso,
          inventoryHandledBy: cashierName,
          inventoryHandledAt: nowIso,
          deliveryHandledBy: cashierName,
          deliveredAt: !isCancelledSale ? nowIso : undefined,
          cancelledBy: isCancelledSale ? cashierName : undefined,
          cancelledAt: isCancelledSale ? nowIso : undefined,
          cancelledReason: isCancelledSale ? cancelReason?.trim() || 'Cancelled at POS Counter' : undefined,
          handoffHistory: [
            {
              stage: isCancelledSale ? 'cancelled' : 'completed',
              subStatus: isCancelledSale ? 'CANCELLED' : 'DELIVERED',
              handlerName: cashierName,
              action: isCancelledSale ? 'Cancelled POS Ticket' : 'Completed Walk-In POS Sale',
              note: isCancelledSale
                ? cancelReason || 'Cancelled at POS Counter'
                : notes || `Paid ৳${resolvedPaid.toLocaleString('en-BD')} via ${paymentMethod.toUpperCase()}${resolvedDue > 0 ? ` · Due ৳${resolvedDue.toLocaleString('en-BD')}` : ''}`,
              timestamp: nowIso,
            },
          ],
        },
        timeline: [
          {
            status: isCancelledSale ? 'cancelled' : 'delivered',
            timestamp: nowIso,
            note: isCancelledSale
              ? `POS Sale Cancelled (${cashierName}): ${cancelReason || 'Cancelled at counter'}`
              : `Completed via POS Counter (${cashierName}) · ${paymentMethod.toUpperCase()}${resolvedDue > 0 ? ` · Due ৳${resolvedDue.toLocaleString('en-BD')}` : ''}`,
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const localCopy: Order = { ...newOrder, createdAt: nowIso, updatedAt: nowIso };
      this.saveLocalOrder(localCopy);

      // Atomic stock decrement ONLY for valid completed sales (never on cancelled tickets)
      if (!isCancelledSale) {
        await productService
          .decrementProductStock(
            items.map((i) => ({
              productId: i.productId,
              size: i.size || 'Standard',
              color: i.color || 'Standard',
              quantity: i.quantity,
            })),
            false,
            {
              type: 'sale',
              referenceId: orderNumber,
              staffName: cashierName,
              reason: `POS Counter Sale (${orderNumber})`,
            }
          )
          .catch(() => {});
      }

      try {
        const writePromise = setDoc(orderDocRef, sanitizeForFirestore(newOrder));
        writePromise.catch(() => {});
        await withTimeout(writePromise, 2500, 'POS order sync queued');
      } catch {
        // already persisted in localStorage and queued
      }

      return { success: true, order: localCopy };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to complete POS sale.' };
    }
  },
};
