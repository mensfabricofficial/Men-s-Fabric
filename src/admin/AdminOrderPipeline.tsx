import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle2,
  CreditCard,
  Package,
  Truck,
  Users,
  X,
  Phone,
  MapPin,
  Printer,
  Maximize2,
  ShieldCheck,
  XCircle,
  RefreshCw,
  RotateCcw,
  Lock,
  ClipboardCheck,
  AlertTriangle,
  Boxes,
  Wallet,
} from 'lucide-react';
import { Order, OrderPipelineStage, OrderPipelineSubStatus, PartnerDeskConfig, Product, StaffAccount } from '../types';
import { orderService } from '../services/orderService';
import { posService, DEFAULT_PARTNER_DESKS } from '../services/posService';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { staffService } from '../services/staffService';
import { useAuth } from '../context/AuthContext';
import { formatDatePart, formatTimePart, formatDateTime } from '../lib/dateFormat';
import { getOrderPaidAndDue } from '../lib/accountingUtils';
import { InvoiceSheet, getFormattedInvoiceNumber } from '../components/common/InvoiceSheet';
import { printElementById } from '../lib/printHelper';
import { AdminPageHeader, AdminTab } from './AdminLayout';

export type WorkflowDeskStage =
  | 'order_verification'
  | 'payment_verification'
  | 'inventory_packing'
  | 'delivery_dispatch';

interface AdminOrderPipelineProps {
  deskStage?: WorkflowDeskStage;
  onNavigateTab?: (tab: AdminTab) => void;
}

type StageTabFilter =
  | 'all'
  | 'order_verification'
  | 'payment_verification'
  | 'inventory_packing'
  | 'delivery_dispatch'
  | 'completed'
  | 'returned'
  | 'cancelled';

type DeskSubFilter =
  | 'queue'
  | 'handed_off'
  | 'cancelled'
  | 'paid'
  | 'due'
  | 'refunded'
  | 'low_stock'
  | 'ready'
  | 'shipped'
  | 'completed'
  | 'returned'
  | 'all';

const STAGE_META: Record<
  WorkflowDeskStage,
  { stepNum: number; shortTitle: string; fullTitle: string; pageTitle: string; pageSubtitle: string; tabId: AdminTab }
> = {
  order_verification: {
    stepNum: 1,
    shortTitle: 'Order Verify',
    fullTitle: 'Order Verification',
    pageTitle: 'Order Verify',
    pageSubtitle: 'Review new orders, confirm phone & address, pass to Payment',
    tabId: 'desk_order_verify',
  },
  payment_verification: {
    stepNum: 2,
    shortTitle: 'Payment Verify',
    fullTitle: 'Payment Verification',
    pageTitle: 'Payment Verify',
    pageSubtitle: 'Verify TrxID & proof, mark paid or due, pass to Stock',
    tabId: 'desk_payment_verify',
  },
  inventory_packing: {
    stepNum: 3,
    shortTitle: 'Stock & Packing',
    fullTitle: 'Stock & Packing Audit',
    pageTitle: 'Stock & Packing',
    pageSubtitle: 'Audit SKU stock & coupons, deduct inventory, pass to Delivery',
    tabId: 'desk_stock_packing',
  },
  delivery_dispatch: {
    stepNum: 4,
    shortTitle: 'Delivery',
    fullTitle: 'Delivery & Shipping',
    pageTitle: 'Delivery',
    pageSubtitle: 'Assign courier & tracking ID, ship & complete delivery',
    tabId: 'desk_delivery_dispatch',
  },
};

const ORDERED_DESK_STAGES: WorkflowDeskStage[] = [
  'order_verification',
  'payment_verification',
  'inventory_packing',
  'delivery_dispatch',
];

export const AdminOrderPipeline: React.FC<AdminOrderPipelineProps> = ({ deskStage, onNavigateTab }) => {
  const { currentUser, staffProfile, isSuperAdmin, hasOrderPermission, hasMenuPermission } = useAuth();
  const [orders, setOrders] = useState<Order[]>(() => orderService.getInstantOrders());
  const [products, setProducts] = useState<Product[]>(() => productService.getInstantAllProducts());
  const [desks, setDesks] = useState<PartnerDeskConfig[]>(() => posService.getInstantPartnerDesks());
  const [staffList, setStaffList] = useState<StaffAccount[]>(() => staffService.getInstantStaff());
  const [stageFilter, setStageFilter] = useState<StageTabFilter>('all');
  const [deskSubFilter, setDeskSubFilter] = useState<DeskSubFilter>('queue');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(() => orderService.getInstantOrders().length === 0);

  // Selected order modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [handlerName, setHandlerName] = useState('');
  const [handoffNote, setHandoffNote] = useState('');
  const [courierName, setCourierName] = useState('Steadfast');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [verifiedPayInput, setVerifiedPayInput] = useState<string>('');
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');
  const [stageErrorMsg, setStageErrorMsg] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [zoomProofUrl, setZoomProofUrl] = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Desk Assignment Modal
  const [deskModalOpen, setDeskModalOpen] = useState(false);
  const [draftDesks, setDraftDesks] = useState<PartnerDeskConfig[]>(DEFAULT_PARTNER_DESKS);
  const [savingDesks, setSavingDesks] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubOrders = orderService.subscribeToAllOrdersAdmin((list) => {
      setOrders(list);
      setLoading(false);
    });
    const unsubDesks = posService.subscribeToPartnerDesks(setDesks);
    const unsubProds = productService.subscribeToAllProductsAdmin(setProducts);
    const unsubStaff = staffService.subscribeToStaff(setStaffList);

    return () => {
      unsubOrders();
      unsubDesks();
      unsubProds();
      unsubStaff();
    };
  }, []);

  useEffect(() => {
    setDeskSubFilter('queue');
    setSelectedOrder(null);
    setStageErrorMsg(null);
  }, [deskStage]);

  const currentEmail = (staffProfile?.email || currentUser?.email || '').trim().toLowerCase();
  const loggedInDesk = desks.find(
    (d) => d.partnerEmail && d.partnerEmail.trim().toLowerCase() === currentEmail
  );

  const getDeskForStage = (stage: OrderPipelineStage): PartnerDeskConfig | undefined =>
    desks.find((d) => d.stage === stage);

  const defaultActorName =
    staffProfile?.name ||
    loggedInDesk?.partnerName ||
    currentUser?.displayName ||
    currentUser?.email ||
    'Authorized Staff';

  const openInspector = (ord: Order) => {
    setSelectedOrder(ord);
    setHandlerName(defaultActorName);
    setHandoffNote('');
    setCourierName(ord.pipeline?.courierName || 'Steadfast');
    setTrackingNumber(ord.pipeline?.trackingNumber || '');
    const payInfo = getOrderPaidAndDue(ord);
    setVerifiedPayInput(String(ord.pipeline?.verifiedPaymentAmount ?? (payInfo.paid > 0 ? payInfo.paid : payInfo.total)));
    setCancelReasonInput('');
    setStageErrorMsg(null);
  };

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleOrderAction = async (
    ord: Order,
    nextStage: OrderPipelineStage,
    extra?: {
      subStatus?: OrderPipelineSubStatus;
      markPaid?: boolean;
      markPaymentStatus?: 'paid' | 'refunded';
      dispatchShipped?: boolean;
      overrideOrderStatus?: Order['orderStatus'];
      keepCurrentStage?: boolean;
      verifiedPaymentAmount?: number;
      refundAmount?: number;
      cancelReason?: string;
      forceStockOverride?: boolean;
    }
  ) => {
    const actor = handlerName.trim() || defaultActorName;
    const prevSt = orderService.getOrderPipelineStage(ord);
    setStageErrorMsg(null);
    setProcessing(true);
    try {
      const updated = await orderService.transferOrderStage({
        orderId: ord.id,
        nextStage,
        subStatus: extra?.subStatus,
        handlerName: actor,
        handlerEmail: currentEmail || undefined,
        note: handoffNote.trim() || undefined,
        markPaymentStatus: extra?.markPaymentStatus || (extra?.markPaid ? 'paid' : undefined),
        overrideOrderStatus: extra?.overrideOrderStatus || (extra?.dispatchShipped ? 'shipped' : undefined),
        keepCurrentStage: extra?.keepCurrentStage,
        verifiedPaymentAmount: extra?.verifiedPaymentAmount,
        refundAmount: extra?.refundAmount,
        cancelReason: extra?.cancelReason,
        forceStockOverride: extra?.forceStockOverride,
        courierName:
          extra?.dispatchShipped || nextStage === 'delivery_dispatch' || nextStage === 'completed'
            ? courierName
            : undefined,
        trackingNumber:
          extra?.dispatchShipped || nextStage === 'delivery_dispatch' || nextStage === 'completed'
            ? trackingNumber.trim() || undefined
            : undefined,
      });

      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        setSelectedOrder((prev) => (prev && prev.id === updated.id ? updated : prev));
        settingsService
          .logAdminAction(
            currentUser?.uid || staffProfile?.id || 'staff',
            currentEmail || staffProfile?.username || 'staff',
            'ORDER_WORKFLOW_ACTION',
            updated.orderNumber,
            `Action -> ${nextStage}${extra?.subStatus ? ` (${extra.subStatus})` : ''} by ${actor}`,
            {
              entityType: 'order',
              beforeValue: `${ord.orderStatus} (${ord.pipeline?.subStatus || prevSt})`,
              afterValue: `${updated.orderStatus} (${updated.pipeline?.subStatus || nextStage})`,
            }
          )
          .catch(() => {});
        showToastMsg(`Order ${updated.orderNumber} updated by ${actor}`);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to update workflow stage.';
      setStageErrorMsg(msg);
      if (!selectedOrder) {
        showToastMsg(msg);
      }
    } finally {
      setProcessing(false);
    }
  };

  const stageCounts: Record<StageTabFilter, number> = {
    all: orders.length,
    order_verification: 0,
    payment_verification: 0,
    inventory_packing: 0,
    delivery_dispatch: 0,
    completed: 0,
    returned: 0,
    cancelled: 0,
  };
  const stageTotals: Record<string, number> = {
    order_verification: 0,
    payment_verification: 0,
    inventory_packing: 0,
    delivery_dispatch: 0,
  };

  orders.forEach((o) => {
    const st = orderService.getOrderPipelineStage(o);
    if (st in stageCounts) {
      stageCounts[st as StageTabFilter] += 1;
    }
    if (st in stageTotals) {
      stageTotals[st] += Number(o.total) || 0;
    }
  });

  const productStockMap = new Map<string, number>();
  const productMap = new Map<string, Product>();
  products.forEach((p) => {
    if (p.id) {
      productStockMap.set(p.id, p.totalStock ?? 0);
      productMap.set(p.id, p);
    }
  });

  const orderHasLowStock = (ord: Order): boolean => {
    if (ord.pipeline?.stockDeducted) return false;
    return (ord.items || []).some((it) => {
      const stock = productStockMap.get(it.productId);
      return typeof stock === 'number' && stock < (Number(it.quantity) || 1);
    });
  };

  // Dedicated Desk Metrics for Dashboard-like 4-card overview on each desk page
  const orderVerifyQueue = orders.filter((o) => orderService.getOrderPipelineStage(o) === 'order_verification');
  const orderVerifyPassed = orders.filter((o) => {
    const st = orderService.getOrderPipelineStage(o);
    return st !== 'order_verification' && st !== 'cancelled' && (Boolean(o.pipeline?.verifiedBy) || st !== 'returned');
  });
  const cancelledOrders = orders.filter((o) => orderService.getOrderPipelineStage(o) === 'cancelled');

  const paymentVerifyQueue = orders.filter((o) => orderService.getOrderPipelineStage(o) === 'payment_verification');
  const paidVerifiedOrders = orders.filter(
    (o) =>
      orderService.getOrderPipelineStage(o) !== 'cancelled' &&
      (o.paymentStatus === 'paid' || Boolean(o.pipeline?.paymentVerifiedBy))
  );
  const dueOrders = orders.filter((o) => {
    const st = orderService.getOrderPipelineStage(o);
    return st !== 'cancelled' && st !== 'returned' && getOrderPaidAndDue(o).due > 0;
  });
  const refundedOrders = orders.filter((o) => o.paymentStatus === 'refunded');

  const stockPackingQueue = orders.filter((o) => orderService.getOrderPipelineStage(o) === 'inventory_packing');
  const stockLowRiskQueue = stockPackingQueue.filter(orderHasLowStock);
  const stockPassedOrders = orders.filter((o) => {
    const st = orderService.getOrderPipelineStage(o);
    return (
      st !== 'cancelled' &&
      (Boolean(o.pipeline?.stockDeducted) || Boolean(o.pipeline?.inventoryHandledBy) || st === 'delivery_dispatch' || st === 'completed')
    );
  });
  const totalUnitsToPick = stockPackingQueue.reduce(
    (sum, o) => sum + (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0),
    0
  );

  const deliveryActiveQueue = orders.filter((o) => orderService.getOrderPipelineStage(o) === 'delivery_dispatch');
  const deliveryReadyOrders = deliveryActiveQueue.filter(
    (o) => o.orderStatus !== 'shipped' && o.pipeline?.subStatus !== 'OUT_FOR_DELIVERY'
  );
  const deliveryShippedOrders = deliveryActiveQueue.filter(
    (o) => o.orderStatus === 'shipped' || o.pipeline?.subStatus === 'OUT_FOR_DELIVERY'
  );
  const completedOrders = orders.filter((o) => orderService.getOrderPipelineStage(o) === 'completed');
  const returnedOrders = orders.filter((o) => orderService.getOrderPipelineStage(o) === 'returned');

  const sumOrderTotal = (list: Order[]) => list.reduce((s, o) => s + (Number(o.total) || 0), 0);

  const filteredOrders = orders.filter((o) => {
    const st = orderService.getOrderPipelineStage(o);

    if (deskStage) {
      if (deskStage === 'order_verification') {
        if (deskSubFilter === 'queue' && st !== 'order_verification') return false;
        if (deskSubFilter === 'handed_off' && !(st !== 'order_verification' && st !== 'cancelled' && (Boolean(o.pipeline?.verifiedBy) || st !== 'returned'))) return false;
        if (deskSubFilter === 'cancelled' && st !== 'cancelled') return false;
      } else if (deskStage === 'payment_verification') {
        if (deskSubFilter === 'queue' && st !== 'payment_verification') return false;
        if (deskSubFilter === 'paid' && !(st !== 'cancelled' && (o.paymentStatus === 'paid' || Boolean(o.pipeline?.paymentVerifiedBy)))) return false;
        if (deskSubFilter === 'due' && !(st !== 'cancelled' && st !== 'returned' && getOrderPaidAndDue(o).due > 0)) return false;
        if (deskSubFilter === 'refunded' && o.paymentStatus !== 'refunded') return false;
      } else if (deskStage === 'inventory_packing') {
        if (deskSubFilter === 'queue' && st !== 'inventory_packing') return false;
        if (deskSubFilter === 'low_stock' && !(st === 'inventory_packing' && orderHasLowStock(o))) return false;
        if (deskSubFilter === 'handed_off' && !(st !== 'cancelled' && (Boolean(o.pipeline?.stockDeducted) || Boolean(o.pipeline?.inventoryHandledBy) || st === 'delivery_dispatch' || st === 'completed'))) return false;
      } else if (deskStage === 'delivery_dispatch') {
        if (deskSubFilter === 'queue' && st !== 'delivery_dispatch') return false;
        if (deskSubFilter === 'ready' && !(st === 'delivery_dispatch' && o.orderStatus !== 'shipped' && o.pipeline?.subStatus !== 'OUT_FOR_DELIVERY')) return false;
        if (deskSubFilter === 'shipped' && !(st === 'delivery_dispatch' && (o.orderStatus === 'shipped' || o.pipeline?.subStatus === 'OUT_FOR_DELIVERY'))) return false;
        if (deskSubFilter === 'completed' && st !== 'completed') return false;
        if (deskSubFilter === 'returned' && st !== 'returned') return false;
      }
    } else if (stageFilter !== 'all' && st !== stageFilter) {
      return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.toLowerCase().includes(q) ||
        o.paymentDetails?.transactionId?.toLowerCase().includes(q) ||
        o.pipeline?.trackingNumber?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const canApprove = hasOrderPermission('order_approve');
  const canVerifyPayment = hasOrderPermission('payment_verify');
  const canPack = hasOrderPermission('packaging');
  const canShip = hasOrderPermission('shipping');
  const canReturn = hasOrderPermission('order_return');
  const canCancel = hasOrderPermission('order_cancel');

  const renderStagePill = (ord: Order) => {
    const st = orderService.getOrderPipelineStage(ord);
    const subTag = ord.pipeline?.subStatus ? (
      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[9px] font-mono font-bold text-neutral-700">
        {ord.pipeline.subStatus}
      </span>
    ) : null;
    if (st === 'cancelled') {
      return (
        <div>
          <span className="text-xs font-bold text-red-700 block">Cancelled</span>
          {subTag}
          {ord.pipeline?.cancelledBy && (
            <span className="text-[10px] text-neutral-500 block">By: {ord.pipeline.cancelledBy}</span>
          )}
        </div>
      );
    }
    if (st === 'returned') {
      return (
        <div>
          <span className="text-xs font-bold text-amber-700 block">Returned</span>
          {subTag}
          {ord.pipeline?.returnedBy && (
            <span className="text-[10px] text-neutral-500 block">By: {ord.pipeline.returnedBy}</span>
          )}
        </div>
      );
    }
    if (st === 'completed') {
      return (
        <div>
          <span className="text-xs font-bold text-emerald-700 block">Delivered · Completed</span>
          {subTag}
          {ord.pipeline?.deliveryHandledBy && (
            <span className="text-[10px] text-neutral-500 block">By: {ord.pipeline.deliveryHandledBy}</span>
          )}
        </div>
      );
    }
    const meta = STAGE_META[st];
    const desk = getDeskForStage(st);
    return (
      <div>
        <span className="text-xs font-bold text-neutral-900 block">{meta.fullTitle}</span>
        <span className="text-[11px] text-neutral-500 block">
          Desk: <b className="text-neutral-800">{desk?.partnerName || meta.shortTitle}</b>
          {st === 'delivery_dispatch' && ord.orderStatus === 'shipped' ? ' · In Transit' : ''}
        </span>
        {subTag}
      </div>
    );
  };

  const activeDeskMeta = deskStage ? STAGE_META[deskStage] : null;
  const activeDeskConfig = deskStage ? getDeskForStage(deskStage) : undefined;

  const deskCards: Array<{
    key: DeskSubFilter;
    label: string;
    value: string | number;
    subtext: string;
    icon: React.ReactNode;
    accent?: 'default' | 'emerald' | 'amber' | 'red';
  }> = deskStage === 'order_verification'
    ? [
        {
          key: 'queue',
          label: 'Pending Order Verify',
          value: orderVerifyQueue.length,
          subtext: `৳${sumOrderTotal(orderVerifyQueue).toLocaleString('en-BD')} awaiting review`,
          icon: <ClipboardCheck className="w-4 h-4 text-neutral-700" />,
        },
        {
          key: 'handed_off',
          label: 'Verified & Handed Off',
          value: orderVerifyPassed.length,
          subtext: `৳${sumOrderTotal(orderVerifyPassed).toLocaleString('en-BD')} passed to payment`,
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-700" />,
          accent: 'emerald',
        },
        {
          key: 'all',
          label: 'All Active & Historical',
          value: orders.length,
          subtext: `${orders.filter((o) => o.orderChannel !== 'pos').length} Online · ${orders.filter((o) => o.orderChannel === 'pos').length} POS`,
          icon: <Users className="w-4 h-4 text-neutral-700" />,
        },
        {
          key: 'cancelled',
          label: 'Cancelled Orders',
          value: cancelledOrders.length,
          subtext: `৳${sumOrderTotal(cancelledOrders).toLocaleString('en-BD')} cancelled`,
          icon: <XCircle className="w-4 h-4 text-red-600" />,
          accent: 'red',
        },
      ]
    : deskStage === 'payment_verification'
    ? [
        {
          key: 'queue',
          label: 'Pending Payment Verify',
          value: paymentVerifyQueue.length,
          subtext: `৳${sumOrderTotal(paymentVerifyQueue).toLocaleString('en-BD')} to verify`,
          icon: <CreditCard className="w-4 h-4 text-neutral-700" />,
        },
        {
          key: 'paid',
          label: 'Paid & Verified',
          value: paidVerifiedOrders.length,
          subtext: `৳${paidVerifiedOrders.reduce((s, o) => s + getOrderPaidAndDue(o).paid, 0).toLocaleString('en-BD')} collected`,
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-700" />,
          accent: 'emerald',
        },
        {
          key: 'due',
          label: 'Due / COD Remaining',
          value: dueOrders.length,
          subtext: `৳${dueOrders.reduce((s, o) => s + getOrderPaidAndDue(o).due, 0).toLocaleString('en-BD')} outstanding`,
          icon: <Wallet className="w-4 h-4 text-amber-700" />,
          accent: 'amber',
        },
        {
          key: 'refunded',
          label: 'Refunded Payments',
          value: refundedOrders.length,
          subtext: `৳${sumOrderTotal(refundedOrders).toLocaleString('en-BD')} refunded`,
          icon: <RefreshCw className="w-4 h-4 text-red-600" />,
          accent: 'red',
        },
      ]
    : deskStage === 'inventory_packing'
    ? [
        {
          key: 'queue',
          label: 'Pending Stock Audit',
          value: stockPackingQueue.length,
          subtext: `৳${sumOrderTotal(stockPackingQueue).toLocaleString('en-BD')} queue value`,
          icon: <Package className="w-4 h-4 text-neutral-700" />,
        },
        {
          key: 'queue',
          label: 'Units to Pick & Pack',
          value: `${totalUnitsToPick} pcs`,
          subtext: `${stockPackingQueue.length} orders awaiting cut`,
          icon: <Boxes className="w-4 h-4 text-neutral-700" />,
        },
        {
          key: 'low_stock',
          label: 'Low Stock Alerts',
          value: stockLowRiskQueue.length,
          subtext: stockLowRiskQueue.length > 0 ? 'Needs stock check / override' : 'All queue SKUs in stock',
          icon: <AlertTriangle className={`w-4 h-4 ${stockLowRiskQueue.length > 0 ? 'text-red-600' : 'text-emerald-700'}`} />,
          accent: stockLowRiskQueue.length > 0 ? 'red' : 'emerald',
        },
        {
          key: 'handed_off',
          label: 'Stock Cut & Passed',
          value: stockPassedOrders.length,
          subtext: `৳${sumOrderTotal(stockPassedOrders).toLocaleString('en-BD')} passed to delivery`,
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-700" />,
          accent: 'emerald',
        },
      ]
    : deskStage === 'delivery_dispatch'
    ? [
        {
          key: 'ready',
          label: 'Ready for Courier',
          value: deliveryReadyOrders.length,
          subtext: `৳${sumOrderTotal(deliveryReadyOrders).toLocaleString('en-BD')} packed / awaiting`,
          icon: <Package className="w-4 h-4 text-neutral-700" />,
        },
        {
          key: 'shipped',
          label: 'In Transit / Shipped',
          value: deliveryShippedOrders.length,
          subtext: `৳${sumOrderTotal(deliveryShippedOrders).toLocaleString('en-BD')} out for delivery`,
          icon: <Truck className="w-4 h-4 text-amber-700" />,
          accent: 'amber',
        },
        {
          key: 'completed',
          label: 'Delivered Completed',
          value: completedOrders.length,
          subtext: `৳${sumOrderTotal(completedOrders).toLocaleString('en-BD')} completed`,
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-700" />,
          accent: 'emerald',
        },
        {
          key: 'returned',
          label: 'Returned Orders',
          value: returnedOrders.length,
          subtext: `৳${sumOrderTotal(returnedOrders).toLocaleString('en-BD')} returned`,
          icon: <RotateCcw className="w-4 h-4 text-red-600" />,
          accent: 'red',
        },
      ]
    : [];

  const deskFilterTabs: Array<{ id: DeskSubFilter; label: string }> =
    deskStage === 'order_verification'
      ? [
          { id: 'queue', label: `Pending Verify (${orderVerifyQueue.length})` },
          { id: 'handed_off', label: `Verified & Passed (${orderVerifyPassed.length})` },
          { id: 'cancelled', label: `Cancelled (${cancelledOrders.length})` },
          { id: 'all', label: `All Orders (${orders.length})` },
        ]
      : deskStage === 'payment_verification'
      ? [
          { id: 'queue', label: `Pending Payment (${paymentVerifyQueue.length})` },
          { id: 'paid', label: `Paid & Verified (${paidVerifiedOrders.length})` },
          { id: 'due', label: `Due Balance (${dueOrders.length})` },
          { id: 'refunded', label: `Refunded (${refundedOrders.length})` },
          { id: 'all', label: `All Orders (${orders.length})` },
        ]
      : deskStage === 'inventory_packing'
      ? [
          { id: 'queue', label: `Needs Stock Audit (${stockPackingQueue.length})` },
          { id: 'low_stock', label: `Low Stock Alerts (${stockLowRiskQueue.length})` },
          { id: 'handed_off', label: `Stock Cut & Passed (${stockPassedOrders.length})` },
          { id: 'all', label: `All Orders (${orders.length})` },
        ]
      : deskStage === 'delivery_dispatch'
      ? [
          { id: 'queue', label: `Active Delivery (${deliveryActiveQueue.length})` },
          { id: 'ready', label: `Ready / Packed (${deliveryReadyOrders.length})` },
          { id: 'shipped', label: `In Transit (${deliveryShippedOrders.length})` },
          { id: 'completed', label: `Delivered (${completedOrders.length})` },
          { id: 'returned', label: `Returned (${returnedOrders.length})` },
          { id: 'all', label: `All Orders (${orders.length})` },
        ]
      : [];

  const workflowSubNavTabs = [
    ...(hasMenuPermission('pipeline')
      ? [{ id: 'pipeline' as AdminTab, label: 'Overview', count: undefined as number | undefined }]
      : []),
    ...(hasMenuPermission('desk_order_verify')
      ? [{ id: 'desk_order_verify' as AdminTab, label: 'Order Verify', count: orderVerifyQueue.length }]
      : []),
    ...(hasMenuPermission('desk_payment_verify')
      ? [{ id: 'desk_payment_verify' as AdminTab, label: 'Payment Verify', count: paymentVerifyQueue.length }]
      : []),
    ...(hasMenuPermission('desk_stock_packing')
      ? [{ id: 'desk_stock_packing' as AdminTab, label: 'Stock & Packing', count: stockPackingQueue.length }]
      : []),
    ...(hasMenuPermission('desk_delivery_dispatch')
      ? [{ id: 'desk_delivery_dispatch' as AdminTab, label: 'Delivery', count: deliveryActiveQueue.length }]
      : []),
  ];

  const activeNavTab: AdminTab = deskStage ? STAGE_META[deskStage].tabId : 'pipeline';

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={activeDeskMeta ? activeDeskMeta.pageTitle : 'Order Workflow'}
        subtitle={
          activeDeskMeta
            ? `${activeDeskConfig?.partnerName ? `${activeDeskConfig.partnerName} · ` : ''}${activeDeskMeta.pageSubtitle}`
            : 'All orders, payments, stock audit & delivery dispatch details'
        }
        actions={
          isSuperAdmin ? (
            <button
              type="button"
              onClick={() => {
                setDraftDesks(desks);
                setDeskModalOpen(true);
              }}
              className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer inline-flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Assign Staff</span>
            </button>
          ) : undefined
        }
      />

      {/* Minimal Editorial Sub-Navigation inside Order Workflow (filtered strictly by permission) */}
      {onNavigateTab && workflowSubNavTabs.length > 1 && (
        <div className="flex items-center gap-1 border-b border-neutral-200 overflow-x-auto text-xs font-bold uppercase tracking-wider">
          {workflowSubNavTabs.map((t) => {
            const isActive = activeNavTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onNavigateTab(t.id)}
                className={`pb-2.5 px-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'border-black text-black'
                    : 'border-transparent text-neutral-400 hover:text-neutral-800'
                }`}
              >
                <span>{t.label}</span>
                {typeof t.count === 'number' && t.count > 0 && (
                  <span
                    className={`text-[10px] font-mono ${
                      isActive ? 'text-neutral-900' : 'text-neutral-400'
                    }`}
                  >
                    ({t.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* TOP 4 MINIMAL MONOCHROME KPI CARDS */}
      {deskStage ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {deskCards.map((card, cIdx) => {
            const isActiveFilter =
              deskSubFilter === card.key &&
              !(deskStage === 'inventory_packing' && cIdx === 1);
            return (
              <button
                key={`${card.label}-${cIdx}`}
                type="button"
                onClick={() => setDeskSubFilter(card.key)}
                className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                  isActiveFilter
                    ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                    : 'bg-white border-neutral-200 hover:border-neutral-400 text-neutral-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      isActiveFilter ? 'text-neutral-300' : 'text-neutral-500'
                    }`}
                  >
                    {card.label}
                  </span>
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isActiveFilter ? 'bg-neutral-800 text-white' : 'bg-neutral-100'
                    }`}
                  >
                    {card.icon}
                  </span>
                </div>
                <div>
                  <p className="text-2xl font-black font-mono tabular-nums leading-none">
                    {card.value}
                  </p>
                  <p
                    className={`text-[11px] font-mono tabular-nums mt-1.5 truncate ${
                      isActiveFilter ? 'text-neutral-300' : 'text-neutral-500'
                    }`}
                  >
                    {card.subtext}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* Order Workflow Master Dashboard Overview: All Order, Payment, Stock & Delivery Details */
        <div className="space-y-4">
          {(() => {
            const activeOrdersList = orders.filter((o) => {
              const st = orderService.getOrderPipelineStage(o);
              return st !== 'cancelled' && st !== 'returned';
            });
            const totalOrderValue = sumOrderTotal(activeOrdersList);
            const totalCollected = activeOrdersList.reduce((s, o) => s + getOrderPaidAndDue(o).paid, 0);
            const totalDue = activeOrdersList.reduce((s, o) => s + getOrderPaidAndDue(o).due, 0);
            const inPipelineCount =
              orderVerifyQueue.length +
              paymentVerifyQueue.length +
              stockPackingQueue.length +
              deliveryActiveQueue.length;

            const paymentBreakdown = ['cod', 'cash', 'bkash', 'nagad', 'rocket'].map((method) => {
              const list = activeOrdersList.filter((o) => (o.paymentMethod || '').toLowerCase() === method);
              return {
                method: method === 'cod' ? 'COD' : method.toUpperCase(),
                count: list.length,
                total: sumOrderTotal(list),
                paid: list.reduce((s, o) => s + getOrderPaidAndDue(o).paid, 0),
                due: list.reduce((s, o) => s + getOrderPaidAndDue(o).due, 0),
              };
            });

            const courierCounts = new Map<string, number>();
            orders.forEach((o) => {
              const st = orderService.getOrderPipelineStage(o);
              if (st === 'delivery_dispatch' || st === 'completed') {
                const c = o.pipeline?.courierName || 'Unassigned';
                courierCounts.set(c, (courierCounts.get(c) || 0) + 1);
              }
            });

            const recentHandoffs = orders
              .flatMap((o) =>
                (o.pipeline?.handoffHistory || []).map((h) => ({
                  orderNumber: o.orderNumber,
                  action: h.action,
                  handlerName: h.handlerName,
                  timestamp: h.timestamp,
                }))
              )
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .slice(0, 4);

            return (
              <>
                {/* Row 1: 4 Master Operations KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 tabular-nums">
                  <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                        Total Orders &amp; Active Queue
                      </span>
                      <span className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center">
                        <ClipboardCheck className="w-4 h-4 text-neutral-800" />
                      </span>
                    </div>
                    <p className="text-2xl font-black font-mono text-neutral-950">{orders.length}</p>
                    <p className="text-[11px] font-mono text-neutral-500 truncate">
                      {inPipelineCount} in workflow · ৳{totalOrderValue.toLocaleString('en-BD')}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                        Payments Collected &amp; Due
                      </span>
                      <span className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center">
                        <CreditCard className="w-4 h-4 text-emerald-700" />
                      </span>
                    </div>
                    <p className="text-2xl font-black font-mono text-neutral-950">
                      ৳{totalCollected.toLocaleString('en-BD')}
                    </p>
                    <p className="text-[11px] font-mono text-neutral-500 truncate">
                      Due: <b className="text-red-600">৳{totalDue.toLocaleString('en-BD')}</b> · {refundedOrders.length} refunded
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                        Stock &amp; Packing Status
                      </span>
                      <span className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center">
                        <Boxes className="w-4 h-4 text-neutral-800" />
                      </span>
                    </div>
                    <p className="text-2xl font-black font-mono text-neutral-950">
                      {stockPassedOrders.length} Cut
                    </p>
                    <p className="text-[11px] font-mono text-neutral-500 truncate">
                      {stockPackingQueue.length} pending ({totalUnitsToPick} pcs) ·{' '}
                      <span className={stockLowRiskQueue.length > 0 ? 'text-red-600 font-bold' : ''}>
                        {stockLowRiskQueue.length} low risk
                      </span>
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                        Delivery &amp; Outcomes
                      </span>
                      <span className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center">
                        <Truck className="w-4 h-4 text-neutral-800" />
                      </span>
                    </div>
                    <p className="text-2xl font-black font-mono text-neutral-950">
                      {completedOrders.length} Delivered
                    </p>
                    <p className="text-[11px] font-mono text-neutral-500 truncate">
                      {deliveryShippedOrders.length} transit · {returnedOrders.length} ret · {cancelledOrders.length} cancel
                    </p>
                  </div>
                </div>

                {/* Row 2: 4 Staff Desk Stage Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {ORDERED_DESK_STAGES.map((stKey) => {
                    const meta = STAGE_META[stKey];
                    const desk = getDeskForStage(stKey);
                    const count = stageCounts[stKey];
                    const val = stageTotals[stKey];
                    const isSelected = stageFilter === stKey;
                    const canOpenDesk = hasMenuPermission(meta.tabId);
                    const isMine =
                      Boolean(currentEmail) &&
                      Boolean(desk?.partnerEmail) &&
                      desk!.partnerEmail!.trim().toLowerCase() === currentEmail;

                    return (
                      <div
                        key={stKey}
                        onClick={() => setStageFilter(isSelected ? 'all' : stKey)}
                        className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                          isSelected
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'bg-white text-neutral-900 border-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider block ${
                                isSelected ? 'text-neutral-400' : 'text-neutral-500'
                              }`}
                            >
                              {meta.shortTitle}
                            </span>
                            <h3 className="text-sm font-extrabold mt-0.5">
                              {desk?.partnerName || meta.shortTitle}
                            </h3>
                            {desk?.partnerEmail && (
                              <p className="text-[10px] font-mono truncate max-w-[160px] text-neutral-400">
                                {desk.partnerEmail}
                              </p>
                            )}
                          </div>
                          <span
                            className={`text-xl font-black font-mono tabular-nums ${
                              isSelected ? 'text-white' : count > 0 ? 'text-neutral-900' : 'text-neutral-300'
                            }`}
                          >
                            {count}
                          </span>
                        </div>

                        <div
                          className={`pt-2.5 border-t flex items-center justify-between text-[11px] tabular-nums ${
                            isSelected ? 'border-neutral-800 text-neutral-300' : 'border-neutral-100 text-neutral-500'
                          }`}
                        >
                          <span className="font-mono">৳{val.toLocaleString('en-BD')}</span>
                          {onNavigateTab && canOpenDesk ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onNavigateTab(meta.tabId);
                              }}
                              className={`font-bold hover:underline cursor-pointer ${
                                isSelected ? 'text-white' : 'text-neutral-900'
                              }`}
                            >
                              {isMine ? 'Open My Desk →' : 'Open Desk →'}
                            </button>
                          ) : (
                            <span className="font-semibold">
                              {isSelected ? 'Filtered Queue' : 'Click to Filter'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Row 3: Order, Payment & Delivery Breakdown Panels (Dashboard Details) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 text-xs tabular-nums">
                  {/* Order Stage & Outcome Breakdown */}
                  <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                      <span className="font-extrabold uppercase tracking-wider text-neutral-900">
                        Order Pipeline Breakdown
                      </span>
                      <span className="text-[11px] font-mono text-neutral-400">{orders.length} total</span>
                    </div>
                    <div className="space-y-1.5">
                      {[
                        { label: 'Order Verify Queue', count: orderVerifyQueue.length, val: sumOrderTotal(orderVerifyQueue), filter: 'order_verification' as StageTabFilter },
                        { label: 'Payment Verify Queue', count: paymentVerifyQueue.length, val: sumOrderTotal(paymentVerifyQueue), filter: 'payment_verification' as StageTabFilter },
                        { label: 'Stock & Packing Queue', count: stockPackingQueue.length, val: sumOrderTotal(stockPackingQueue), filter: 'inventory_packing' as StageTabFilter },
                        { label: 'Delivery & In Transit', count: deliveryActiveQueue.length, val: sumOrderTotal(deliveryActiveQueue), filter: 'delivery_dispatch' as StageTabFilter },
                        { label: 'Delivered Completed', count: completedOrders.length, val: sumOrderTotal(completedOrders), filter: 'completed' as StageTabFilter },
                        { label: 'Returned Orders', count: returnedOrders.length, val: sumOrderTotal(returnedOrders), filter: 'returned' as StageTabFilter },
                        { label: 'Cancelled Orders', count: cancelledOrders.length, val: sumOrderTotal(cancelledOrders), filter: 'cancelled' as StageTabFilter },
                      ].map((row) => (
                        <button
                          key={row.label}
                          type="button"
                          onClick={() => setStageFilter(row.filter)}
                          className="w-full flex items-center justify-between py-1 px-2 rounded hover:bg-neutral-50 cursor-pointer text-left"
                        >
                          <span className="text-neutral-700 font-medium">{row.label}</span>
                          <span className="font-mono text-neutral-900">
                            <b>{row.count}</b> · ৳{row.val.toLocaleString('en-BD')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment Methods & Collections Breakdown */}
                  <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                      <span className="font-extrabold uppercase tracking-wider text-neutral-900">
                        Payment &amp; Method Summary
                      </span>
                      <span className="text-[11px] font-mono text-emerald-700 font-bold">
                        Paid ৳{totalCollected.toLocaleString('en-BD')}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {paymentBreakdown.map((pm) => (
                        <div key={pm.method} className="flex items-center justify-between py-1 px-2">
                          <span className="font-semibold text-neutral-800">
                            {pm.method} <span className="text-neutral-400 font-normal">({pm.count})</span>
                          </span>
                          <span className="font-mono text-neutral-700">
                            Paid <b className="text-emerald-700">৳{pm.paid.toLocaleString('en-BD')}</b>
                            {pm.due > 0 && (
                              <span className="text-red-600 ml-1.5">Due ৳{pm.due.toLocaleString('en-BD')}</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Delivery Couriers & Latest Activity */}
                  <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                      <span className="font-extrabold uppercase tracking-wider text-neutral-900">
                        Delivery &amp; Recent Handoffs
                      </span>
                      <span className="text-[11px] font-mono text-neutral-400">
                        {deliveryReadyOrders.length} ready · {deliveryShippedOrders.length} transit
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {courierCounts.size === 0 ? (
                        <span className="text-[11px] text-neutral-400">No courier dispatches yet.</span>
                      ) : (
                        Array.from(courierCounts.entries()).map(([courier, cnt]) => (
                          <span
                            key={courier}
                            className="px-2 py-1 rounded bg-neutral-100 border border-neutral-200 font-mono text-[11px] text-neutral-800"
                          >
                            {courier}: <b>{cnt}</b>
                          </span>
                        ))
                      )}
                    </div>
                    <div className="pt-1 border-t border-neutral-100 space-y-1.5">
                      {recentHandoffs.length === 0 ? (
                        <p className="text-[11px] text-neutral-400">Waiting for workflow activity...</p>
                      ) : (
                        recentHandoffs.map((h, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="truncate text-neutral-700">
                              <b className="font-mono text-neutral-900">{h.orderNumber}</b> · {h.action} ({h.handlerName})
                            </span>
                            <span className="font-mono text-[10px] text-neutral-400 shrink-0">
                              {formatTimePart(h.timestamp)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Filter Bar & Tabs */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {deskStage
            ? deskFilterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDeskSubFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    deskSubFilter === tab.id
                      ? 'bg-black text-white'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))
            : [
                { id: 'all', label: `All (${stageCounts.all})` },
                { id: 'order_verification', label: `Order Verify (${stageCounts.order_verification})` },
                { id: 'payment_verification', label: `Payment Verify (${stageCounts.payment_verification})` },
                { id: 'inventory_packing', label: `Stock & Packing (${stageCounts.inventory_packing})` },
                { id: 'delivery_dispatch', label: `Delivery (${stageCounts.delivery_dispatch})` },
                { id: 'completed', label: `Completed (${stageCounts.completed})` },
                { id: 'returned', label: `Returned (${stageCounts.returned})` },
                { id: 'cancelled', label: `Cancelled (${stageCounts.cancelled})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStageFilter(tab.id as StageTabFilter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    stageFilter === tab.id
                      ? 'bg-black text-white'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer name, phone, TrxID, or tracking ID..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>
      </div>

      {/* Orders Live Visibility Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            <Package className="w-9 h-9 text-neutral-300 mx-auto mb-2" />
            <p className="font-bold text-neutral-900 text-sm">No orders in this view</p>
            <p className="text-neutral-400 mt-0.5">Select another filter above or wait for incoming orders.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Order &amp; Date</th>
                  <th className="p-3.5">Customer &amp; Items</th>
                  <th className="p-3.5">Total &amp; Payment</th>
                  <th className="p-3.5">
                    {deskStage === 'payment_verification'
                      ? 'TrxID & Proof'
                      : deskStage === 'inventory_packing'
                      ? 'Stock & Audit Check'
                      : deskStage === 'delivery_dispatch'
                      ? 'Courier & Destination'
                      : 'Approval & Handling Trail'}
                  </th>
                  <th className="p-3.5">Current Desk / Status</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium tabular-nums">
                {filteredOrders.map((ord) => {
                  const st = orderService.getOrderPipelineStage(ord);
                  const stepIdx =
                    st === 'order_verification'
                      ? 1
                      : st === 'payment_verification'
                      ? 2
                      : st === 'inventory_packing'
                      ? 3
                      : st === 'delivery_dispatch'
                      ? 4
                      : st === 'completed'
                      ? 5
                      : 0;
                  const lowStockRisk = orderHasLowStock(ord);
                  const payInfo = getOrderPaidAndDue(ord);

                  return (
                    <tr key={ord.id} className="hover:bg-neutral-50/50">
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-neutral-900 block">{ord.orderNumber}</span>
                        <span className="text-[10px] text-neutral-400 block">
                          {formatDatePart(ord.createdAt, 'Recent')} {formatTimePart(ord.createdAt)}
                        </span>
                        <span className="text-[10px] font-mono uppercase text-neutral-500">
                          {ord.orderChannel === 'pos' ? 'POS Sale' : 'Online'}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <p className="font-semibold text-neutral-900">{ord.customerName}</p>
                        <p className="text-[11px] font-mono text-neutral-500">{ord.customerPhone}</p>
                        <p className="text-[11px] text-neutral-500 mt-0.5 truncate max-w-[210px]">
                          {(ord.items || []).map((i) => `${i.productName} (${i.size}×${i.quantity})`).join(', ')}
                        </p>
                      </td>

                      <td className="p-3.5 whitespace-nowrap">
                        <p className="font-mono font-bold text-neutral-900">
                          ৳{(Number(ord.total) || 0).toLocaleString('en-BD')}
                        </p>
                        <p className="text-[11px] text-neutral-500 uppercase">
                          {ord.paymentMethod} ·{' '}
                          <span className={ord.paymentStatus === 'paid' ? 'text-emerald-700 font-bold' : 'text-amber-700 font-semibold'}>
                            {ord.paymentStatus}
                          </span>
                        </p>
                        <p className="text-[10px] font-mono text-neutral-500 mt-0.5">
                          Paid: <b className="text-emerald-700">৳{payInfo.paid.toLocaleString('en-BD')}</b>
                          {payInfo.due > 0 && (
                            <span className="ml-1.5 text-red-600 font-bold">
                              Due: ৳{payInfo.due.toLocaleString('en-BD')}
                            </span>
                          )}
                        </p>
                      </td>

                      <td className="p-3.5">
                        {deskStage === 'payment_verification' ? (
                          <div className="space-y-1 text-[11px]">
                            {ord.paymentDetails?.transactionId ? (
                              <span className="font-mono font-bold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded inline-block">
                                {ord.paymentDetails.transactionId}
                              </span>
                            ) : (
                              <span className="text-neutral-400">No TrxID (COD / Cash)</span>
                            )}
                            {ord.paymentDetails?.senderNumber && (
                              <p className="text-[10px] font-mono text-neutral-500">
                                From: {ord.paymentDetails.senderNumber}
                              </p>
                            )}
                            {ord.paymentDetails?.proofUrl && (
                              <button
                                type="button"
                                onClick={() => setZoomProofUrl(ord.paymentDetails?.proofUrl || null)}
                                className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer block"
                              >
                                View Screenshot
                              </button>
                            )}
                          </div>
                        ) : deskStage === 'inventory_packing' ? (
                          <div className="space-y-1">
                            <span
                              className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${
                                ord.pipeline?.stockDeducted
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : lowStockRisk
                                  ? 'bg-red-50 border-red-200 text-red-700'
                                  : 'bg-blue-50 border-blue-200 text-blue-800'
                              }`}
                            >
                              {ord.pipeline?.stockDeducted
                                ? 'Stock Cut ✓'
                                : lowStockRisk
                                ? 'Low SKU Stock!'
                                : 'Stock Ready ✓'}
                            </span>
                            <p className="text-[10px] font-mono text-neutral-500">
                              {(ord.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0)} pcs
                              {ord.discount > 0 ? ` · Disc -৳${ord.discount}` : ''}
                            </p>
                          </div>
                        ) : deskStage === 'delivery_dispatch' ? (
                          <div className="space-y-0.5 text-[11px]">
                            <p className="font-semibold text-neutral-800 truncate max-w-[190px]">
                              {ord.shippingAddress?.district || 'Dhaka'}, {ord.shippingAddress?.division || ''}
                            </p>
                            <p className="text-[10px] font-mono text-neutral-500">
                              {ord.pipeline?.courierName || 'Courier Pending'}
                              {ord.pipeline?.trackingNumber ? ` · ${ord.pipeline.trackingNumber}` : ''}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[10px] font-mono">
                              {[
                                { n: 1, label: 'Ord', doneBy: ord.pipeline?.verifiedBy },
                                { n: 2, label: 'Pay', doneBy: ord.pipeline?.paymentVerifiedBy },
                                { n: 3, label: 'Pkg', doneBy: ord.pipeline?.inventoryHandledBy },
                                { n: 4, label: 'Del', doneBy: ord.pipeline?.deliveredAt ? ord.pipeline?.deliveryHandledBy : undefined },
                              ].map((step) => {
                                const done = Boolean(step.doneBy) || stepIdx > step.n;
                                const active = stepIdx === step.n && !done;
                                return (
                                  <span
                                    key={step.n}
                                    title={step.doneBy ? `Done by ${step.doneBy}` : step.label}
                                    className={`px-1.5 py-0.5 rounded border ${
                                      done
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                                        : active
                                        ? 'bg-neutral-900 border-neutral-900 text-white font-bold'
                                        : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                                    }`}
                                  >
                                    {step.n}.{step.label}
                                  </span>
                                );
                              })}
                            </div>
                            {ord.pipeline?.verifiedBy && (
                              <p className="text-[10px] text-neutral-500">
                                Approved: <b className="text-neutral-800">{ord.pipeline.verifiedBy}</b>
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5">{renderStagePill(ord)}</td>

                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {deskStage === 'order_verification' && st === 'order_verification' && canApprove && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() =>
                                handleOrderAction(ord, 'payment_verification', { subStatus: 'ORDER_CHECKED' })
                              }
                              className="px-2.5 py-1.5 bg-emerald-700 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-800 cursor-pointer"
                            >
                              Approve → Pay
                            </button>
                          )}
                          {deskStage === 'payment_verification' && st === 'payment_verification' && canVerifyPayment && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() =>
                                handleOrderAction(ord, 'inventory_packing', {
                                  markPaid: payInfo.paid >= payInfo.total || ord.paymentMethod !== 'cod',
                                  verifiedPaymentAmount: payInfo.paid > 0 ? payInfo.paid : payInfo.total,
                                  subStatus: 'PAYMENT_VERIFIED',
                                })
                              }
                              className="px-2.5 py-1.5 bg-emerald-700 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-800 cursor-pointer"
                            >
                              Verify → Stock
                            </button>
                          )}
                          {deskStage === 'inventory_packing' && st === 'inventory_packing' && canPack && !lowStockRisk && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() =>
                                handleOrderAction(ord, 'delivery_dispatch', { subStatus: 'STOCK_APPROVED' })
                              }
                              className="px-2.5 py-1.5 bg-emerald-700 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-800 cursor-pointer"
                            >
                              Cut → Delivery
                            </button>
                          )}
                          {deskStage === 'delivery_dispatch' && st === 'delivery_dispatch' && canShip && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() =>
                                handleOrderAction(
                                  ord,
                                  ord.orderStatus === 'shipped' ? 'completed' : 'delivery_dispatch',
                                  ord.orderStatus === 'shipped'
                                    ? { markPaid: true, subStatus: 'DELIVERED' }
                                    : { dispatchShipped: true, subStatus: 'SHIPPED' }
                                )
                              }
                              className="px-2.5 py-1.5 bg-emerald-700 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-800 cursor-pointer"
                            >
                              {ord.orderStatus === 'shipped' ? 'Delivered ✓' : 'Ship Now'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openInspector(ord)}
                            className="px-3 py-1.5 bg-black text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer"
                          >
                            {deskStage ? 'Details' : 'Process Order'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Staff Order Action & Details Modal */}
      {selectedOrder && (() => {
        const currentStage = orderService.getOrderPipelineStage(selectedOrder);
        const currentDesk = getDeskForStage(currentStage);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-xl border border-neutral-200 max-w-3xl w-full my-4 max-h-[92vh] flex flex-col overflow-hidden">
              {/* Modal Top */}
              <div className="p-4 sm:p-5 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-sm sm:text-base text-neutral-900">
                      {selectedOrder.orderNumber}
                    </span>
                    <span className="text-xs font-semibold text-neutral-500">
                      · {formatDateTime(selectedOrder.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    Current Status:{' '}
                    <b>
                      {currentStage === 'completed'
                        ? 'Completed (Delivered)'
                        : currentStage === 'returned'
                        ? 'Returned'
                        : currentStage === 'cancelled'
                        ? 'Cancelled'
                        : `${currentDesk?.partnerName || STAGE_META[currentStage].shortTitle} — ${STAGE_META[currentStage].fullTitle}`}
                    </b>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowInvoiceModal(true)}
                    className="px-3 py-1.5 border border-neutral-300 bg-white text-neutral-800 text-xs font-bold rounded-lg hover:border-black cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Invoice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="p-1.5 text-neutral-400 hover:text-black cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs">
                {/* 4-Stage Step Bar showing Who Approved Each Step */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ORDERED_DESK_STAGES.map((stKey) => {
                    const meta = STAGE_META[stKey];
                    const desk = getDeskForStage(stKey);
                    const isCurrent = currentStage === stKey;
                    const doneBy =
                      stKey === 'order_verification'
                        ? selectedOrder.pipeline?.verifiedBy
                        : stKey === 'payment_verification'
                        ? selectedOrder.pipeline?.paymentVerifiedBy
                        : stKey === 'inventory_packing'
                        ? selectedOrder.pipeline?.inventoryHandledBy
                        : selectedOrder.pipeline?.deliveredAt
                        ? selectedOrder.pipeline?.deliveryHandledBy
                        : undefined;
                    const isDone = Boolean(doneBy);

                    return (
                      <div
                        key={stKey}
                        className={`p-3 rounded-lg border ${
                          isCurrent
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : isDone
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-neutral-50 border-neutral-200 text-neutral-500'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-[11px]">
                          <span>
                            {meta.stepNum}. {meta.shortTitle}
                          </span>
                          {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                        </div>
                        <p className="text-[11px] font-semibold mt-1 truncate">
                          {doneBy ? `By: ${doneBy}` : desk?.partnerName || meta.shortTitle}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Customer & Payment Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border border-neutral-200 rounded-xl">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-neutral-400 block">
                      Customer Details
                    </span>
                    <p className="font-bold text-neutral-900 text-sm">{selectedOrder.customerName}</p>
                    <p className="font-mono text-neutral-700 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{selectedOrder.customerPhone}</span>
                    </p>
                    <p className="text-neutral-600 flex items-start gap-1.5 pt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                      <span>
                        {selectedOrder.shippingAddress.address}, {selectedOrder.shippingAddress.district},{' '}
                        {selectedOrder.shippingAddress.division}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-neutral-400 block">
                      Payment &amp; Billing Summary
                    </span>
                    <p className="text-sm font-black font-mono text-neutral-900">
                      Total: ৳{selectedOrder.total.toLocaleString('en-BD')} ({selectedOrder.paymentMethod.toUpperCase()})
                    </p>
                    {(() => {
                      const paySummary = getOrderPaidAndDue(selectedOrder);
                      return (
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                          <span className="text-neutral-600">
                            Status:{' '}
                            <b className={selectedOrder.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-amber-700'}>
                              {selectedOrder.paymentStatus.toUpperCase()}
                            </b>
                          </span>
                          <span className="text-emerald-700 font-bold">
                            Paid: ৳{paySummary.paid.toLocaleString('en-BD')}
                          </span>
                          <span className={paySummary.due > 0 ? 'text-red-700 font-bold' : 'text-neutral-500'}>
                            Due: ৳{paySummary.due.toLocaleString('en-BD')}
                          </span>
                        </div>
                      );
                    })()}
                    {selectedOrder.pipeline?.subStatus && (
                      <span className="inline-block px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200 font-mono text-[10px] font-bold text-neutral-700">
                        Sub-Status: {selectedOrder.pipeline.subStatus}
                      </span>
                    )}
                    {selectedOrder.paymentDetails?.transactionId && (
                      <p className="font-mono text-neutral-800 bg-neutral-100 px-2 py-1 rounded inline-block">
                        TrxID: <b>{selectedOrder.paymentDetails.transactionId}</b>
                        {selectedOrder.paymentDetails.senderNumber
                          ? ` (${selectedOrder.paymentDetails.senderNumber})`
                          : ''}
                      </p>
                    )}
                    {selectedOrder.paymentDetails?.proofUrl && (
                      <button
                        type="button"
                        onClick={() => setZoomProofUrl(selectedOrder.paymentDetails?.proofUrl || null)}
                        className="text-blue-600 font-bold hover:underline cursor-pointer flex items-center gap-1 mt-1"
                      >
                        <Maximize2 className="w-3 h-3" /> View Payment Screenshot
                      </button>
                    )}
                  </div>
                </div>

                {/* Product Details, Price/Coupon Audit & Stock Cut Status */}
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold uppercase text-[11px] text-neutral-700 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      <span>
                        Product, Stock, Price &amp; Coupon Check ({selectedOrder.items.length} items)
                      </span>
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        selectedOrder.pipeline?.stockDeducted
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : selectedOrder.pipeline?.stockRestored
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : 'bg-blue-50 border-blue-200 text-blue-800'
                      }`}
                    >
                      {selectedOrder.pipeline?.stockDeducted
                        ? `Stock Cut ✓ (${selectedOrder.pipeline.stockDeductedBy || 'Stage 3'})`
                        : selectedOrder.pipeline?.stockRestored
                        ? 'Stock Restored'
                        : 'Stock Pending Stage 3 Cut'}
                    </span>
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {selectedOrder.items.map((item, idx) => {
                      const currentStock = productStockMap.get(item.productId);
                      const catalogProd = productMap.get(item.productId);
                      const unitCost =
                        typeof item.unitCost === 'number' && item.unitCost > 0
                          ? item.unitCost
                          : catalogProd?.costPrice || 0;
                      const insufficient =
                        selectedOrder.pipeline?.stockDeducted === false &&
                        typeof currentStock === 'number' &&
                        currentStock < item.quantity;
                      return (
                        <div key={idx} className="p-3.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={item.productImage || '/assets/aistudio/selvee1_8ff37f5b.jpg'}
                              alt={item.productName}
                              className="w-12 h-12 rounded-md object-cover border border-neutral-200 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="font-bold text-neutral-900 truncate">{item.productName}</p>
                              <p className="text-[11px] text-neutral-600">
                                Size: <b>{item.size}</b> · Color: <b>{item.color}</b> · Qty:{' '}
                                <b>{item.quantity}</b> × ৳{item.unitPrice.toLocaleString('en-BD')}
                                {unitCost > 0 && (
                                  <span className="ml-2 text-neutral-400 font-mono">
                                    (Cost: ৳{unitCost.toLocaleString('en-BD')})
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] font-mono text-neutral-400">
                                SKU: {item.sku || item.productCode || 'N/A'}
                                {typeof currentStock === 'number' && (
                                  <span
                                    className={`ml-2 font-bold ${
                                      insufficient ? 'text-red-600' : 'text-neutral-700'
                                    }`}
                                  >
                                    · Live Stock: {currentStock} pcs{insufficient ? ' (LOW!)' : ''}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <span className="font-mono font-bold text-neutral-900 shrink-0">
                            ৳{item.totalPrice.toLocaleString('en-BD')}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Price & Coupon Verification Bar */}
                  <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                    <div className="flex flex-wrap items-center gap-3 text-neutral-700">
                      <span>Subtotal: <b>৳{(selectedOrder.subtotal || 0).toLocaleString('en-BD')}</b></span>
                      {selectedOrder.discount > 0 && (
                        <span className="text-amber-800">
                          Coupon ({selectedOrder.couponCode || 'APPLIED'}):{' '}
                          <b>−৳{selectedOrder.discount.toLocaleString('en-BD')}</b>
                        </span>
                      )}
                      {selectedOrder.onlineDiscount && selectedOrder.onlineDiscount > 0 ? (
                        <span className="text-emerald-700">
                          Online Disc: <b>−৳{selectedOrder.onlineDiscount.toLocaleString('en-BD')}</b>
                        </span>
                      ) : null}
                      <span>Delivery: <b>৳{(selectedOrder.deliveryCharge || 0).toLocaleString('en-BD')}</b></span>
                    </div>
                    <span className="text-neutral-900 font-black text-xs">
                      Final Total: ৳{(selectedOrder.total || 0).toLocaleString('en-BD')}
                    </span>
                  </div>
                </div>

                {/* Role-Specific Action Controls — Strictly displays ONLY buttons permitted for logged-in role */}
                <div className="p-4 border border-neutral-300 bg-neutral-50 rounded-xl space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Your Permitted Actions</span>
                    </h4>
                    <span className="text-[11px] text-neutral-500">
                      Logged in as <b>{staffProfile?.name || 'Super Admin'}</b>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                        Handled / Approved By
                      </label>
                      <input
                        type="text"
                        value={handlerName}
                        onChange={(e) => setHandlerName(e.target.value)}
                        readOnly={Boolean(staffProfile && !isSuperAdmin)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                        Internal Action Note (Optional)
                      </label>
                      <input
                        type="text"
                        value={handoffNote}
                        onChange={(e) => setHandoffNote(e.target.value)}
                        placeholder="e.g. Call verified / TrxID checked / Stock & coupon OK"
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Courier / Tracking Inputs (Shown ONLY in Stage 4 Delivery to Delivery role) */}
                  {currentStage === 'delivery_dispatch' && canShip && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                          Courier Service (Delivery Role)
                        </label>
                        <select
                          value={courierName}
                          onChange={(e) => setCourierName(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg font-semibold"
                        >
                          <option value="Steadfast">Steadfast Courier</option>
                          <option value="Pathao">Pathao Parcel</option>
                          <option value="RedX">RedX Delivery</option>
                          <option value="Paperfly">Paperfly</option>
                          <option value="Own Rider">Own Delivery Rider</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                          Consignment / Tracking ID
                        </label>
                        <input
                          type="text"
                          value={trackingNumber}
                          onChange={(e) => setTrackingNumber(e.target.value)}
                          placeholder="e.g. SF-984512"
                          className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* Stage 2 Verified Amount Input (Shown ONLY in Stage 2 Payment Verification to Payment Verify role) */}
                  {currentStage === 'payment_verification' && canVerifyPayment && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white border border-neutral-200 rounded-lg">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                          Verified / Collected Amount (৳)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={selectedOrder.total}
                          value={verifiedPayInput}
                          onChange={(e) => setVerifiedPayInput(e.target.value)}
                          className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-mono font-bold"
                        />
                      </div>
                      <div className="flex flex-col justify-center font-mono text-[11px]">
                        <span className="text-neutral-500">
                          Order Total: <b className="text-neutral-900">৳{(selectedOrder.total || 0).toLocaleString('en-BD')}</b>
                        </span>
                        <span className="text-neutral-600 mt-0.5">
                          Remaining After Verify:{' '}
                          <b className="text-red-700">
                            ৳{Math.max(0, (selectedOrder.total || 0) - Math.max(0, Number(verifiedPayInput) || 0)).toLocaleString('en-BD')}
                          </b>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Stage 3 Insufficient Stock / Workflow Error Banner */}
                  {stageErrorMsg && (
                    <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-red-900 space-y-2">
                      <p className="font-bold text-[11px]">{stageErrorMsg}</p>
                      {isSuperAdmin && currentStage === 'inventory_packing' && stageErrorMsg.includes('Insufficient stock') && (
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() =>
                            handleOrderAction(selectedOrder, 'delivery_dispatch', {
                              subStatus: 'STOCK_APPROVED',
                              forceStockOverride: true,
                            })
                          }
                          className="px-3 py-1.5 bg-red-700 text-white text-[10px] font-bold uppercase rounded cursor-pointer hover:bg-red-800"
                        >
                          Super Admin Override Stock &amp; Transfer →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Strictly Stage-Filtered & Role-Filtered Action Buttons */}
                  {(() => {
                    const isClosedStage = currentStage === 'returned' || currentStage === 'cancelled';

                    if (isClosedStage) {
                      return (
                        <div className="p-3 bg-white border border-neutral-200 rounded-lg text-neutral-600 flex items-center gap-2">
                          <Lock className="w-4 h-4 text-neutral-400" />
                          <span>
                            This order is closed (<b>{currentStage.toUpperCase()}</b>). No further workflow actions apply.
                          </span>
                        </div>
                      );
                    }

                    const showStage1 = currentStage === 'order_verification' && canApprove;
                    const showStage2 = currentStage === 'payment_verification' && canVerifyPayment;
                    const showStage3 = currentStage === 'inventory_packing' && canPack;
                    const showStage4Ship = currentStage === 'delivery_dispatch' && canShip;
                    const showReturn =
                      (currentStage === 'delivery_dispatch' || currentStage === 'completed') && canReturn;
                    const showCancel = currentStage !== 'completed' && canCancel;

                    const hasAnyActionHere =
                      showStage1 || showStage2 || showStage3 || showStage4Ship || showReturn || showCancel;

                    if (!hasAnyActionHere) {
                      const stageLabel =
                        currentStage === 'completed'
                          ? 'Completed (Delivered)'
                          : STAGE_META[currentStage].fullTitle;
                      return (
                        <div className="p-3 bg-white border border-neutral-200 rounded-lg text-neutral-500 flex items-center gap-2">
                          <Lock className="w-4 h-4 text-neutral-400" />
                          <span>
                            Order is currently at <b>{stageLabel}</b>. Only the staff member assigned to this stage can act on it.
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* STAGE 1 ONLY: Order Approve -> Payment Verify */}
                          {showStage1 && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() =>
                                handleOrderAction(selectedOrder, 'payment_verification', {
                                  subStatus: 'ORDER_CHECKED',
                                })
                              }
                              className="px-4 py-2 bg-black text-white font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer inline-flex items-center gap-1.5 text-[11px] transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Order Approve → Payment Verify</span>
                            </button>
                          )}

                          {/* STAGE 2 ONLY: Payment Verification Controls */}
                          {showStage2 && (() => {
                            const enteredAmt = Math.max(0, Number(verifiedPayInput) || 0);
                            const fullTotal = Number(selectedOrder.total) || 0;
                            const isFullPay = enteredAmt >= fullTotal;
                            return (
                              <>
                                <button
                                  type="button"
                                  disabled={processing}
                                  onClick={() =>
                                    handleOrderAction(selectedOrder, currentStage, {
                                      keepCurrentStage: true,
                                      markPaymentStatus: isFullPay ? 'paid' : undefined,
                                      verifiedPaymentAmount: enteredAmt > 0 ? enteredAmt : fullTotal,
                                      subStatus: 'PAYMENT_VERIFIED',
                                    })
                                  }
                                  className="px-3.5 py-2 bg-white border border-emerald-600 text-emerald-800 font-bold uppercase tracking-wider rounded-lg hover:bg-emerald-50 cursor-pointer inline-flex items-center gap-1.5 text-[11px] transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Mark Paid</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={processing}
                                  onClick={() =>
                                    handleOrderAction(selectedOrder, 'inventory_packing', {
                                      markPaid: isFullPay,
                                      verifiedPaymentAmount: enteredAmt > 0 ? enteredAmt : fullTotal,
                                      subStatus: 'PAYMENT_VERIFIED',
                                    })
                                  }
                                  className="px-3.5 py-2 bg-emerald-700 text-white font-bold uppercase tracking-wider rounded-lg hover:bg-emerald-800 cursor-pointer inline-flex items-center gap-1.5 text-[11px] transition-colors"
                                >
                                  <CreditCard className="w-3.5 h-3.5" />
                                  <span>Verify Payment → Stock &amp; Audit</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={processing}
                                  onClick={() =>
                                    handleOrderAction(selectedOrder, currentStage, {
                                      keepCurrentStage: true,
                                      markPaymentStatus: 'refunded',
                                      subStatus: 'REFUNDED',
                                      refundAmount: getOrderPaidAndDue(selectedOrder).paid,
                                    })
                                  }
                                  className="px-3.5 py-2 border border-purple-300 bg-purple-50 text-purple-800 font-bold uppercase tracking-wider rounded-lg hover:bg-purple-100 cursor-pointer inline-flex items-center gap-1.5 text-[11px] transition-colors"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Refund Payment</span>
                                </button>
                              </>
                            );
                          })()}

                          {/* STAGE 3 ONLY: Stock, Price & Coupon Audit (Cuts Inventory on Approval) */}
                          {showStage3 && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() =>
                                handleOrderAction(selectedOrder, 'delivery_dispatch', {
                                  subStatus: 'STOCK_APPROVED',
                                })
                              }
                              className="px-4 py-2 bg-neutral-900 text-white font-bold uppercase tracking-wider rounded-lg hover:bg-black cursor-pointer inline-flex items-center gap-1.5 text-[11px] transition-colors"
                            >
                              <Package className="w-3.5 h-3.5" />
                              <span>
                                {selectedOrder.pipeline?.stockDeducted === false
                                  ? 'Approve Stock & Cut Inventory → Delivery'
                                  : 'Stock & Packing Approved → Delivery'}
                              </span>
                            </button>
                          )}

                          {/* STAGE 4 ONLY: Delivery & Dispatch */}
                          {showStage4Ship && (
                            <>
                              <button
                                type="button"
                                disabled={processing}
                                onClick={() =>
                                  handleOrderAction(selectedOrder, 'delivery_dispatch', {
                                    subStatus: 'PACKED',
                                    overrideOrderStatus: 'packed',
                                  })
                                }
                                className="px-3 py-2 bg-white border border-neutral-300 text-neutral-800 font-bold uppercase tracking-wider rounded-lg hover:border-black cursor-pointer inline-flex items-center gap-1.5 text-[11px] transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Mark Packed</span>
                              </button>

                              <button
                                type="button"
                                disabled={processing}
                                onClick={() =>
                                  handleOrderAction(selectedOrder, 'delivery_dispatch', {
                                    dispatchShipped: true,
                                    subStatus: 'SHIPPED',
                                  })
                                }
                                className="px-3.5 py-2 bg-neutral-900 text-white font-bold uppercase tracking-wider rounded-lg hover:bg-black cursor-pointer inline-flex items-center gap-1.5 text-[11px] transition-colors"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>Shipped / Dispatch</span>
                              </button>

                              <button
                                type="button"
                                disabled={processing}
                                onClick={() =>
                                  handleOrderAction(selectedOrder, 'delivery_dispatch', {
                                    dispatchShipped: true,
                                    subStatus: 'OUT_FOR_DELIVERY',
                                  })
                                }
                                className="px-3 py-2 bg-white border border-blue-600 text-blue-800 font-bold uppercase tracking-wider rounded-lg hover:bg-blue-50 cursor-pointer inline-flex items-center gap-1.5 text-[11px] transition-colors"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>Out For Delivery</span>
                              </button>

                              <button
                                type="button"
                                disabled={processing}
                                onClick={() =>
                                  handleOrderAction(selectedOrder, 'completed', {
                                    markPaid: true,
                                    subStatus: 'DELIVERED',
                                  })
                                }
                                className="px-3.5 py-2 bg-emerald-600 text-white font-bold uppercase tracking-wider rounded-lg hover:bg-emerald-700 cursor-pointer inline-flex items-center gap-1.5 text-[11px] transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Delivered (Complete)</span>
                              </button>
                            </>
                          )}

                          {/* Return (Delivery / Completed stages only) */}
                          {showReturn && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() =>
                                handleOrderAction(selectedOrder, 'returned', { subStatus: 'RETURNED' })
                              }
                              className="px-3.5 py-2 border border-amber-300 bg-amber-50 text-amber-800 font-bold uppercase tracking-wider rounded-lg hover:bg-amber-100 cursor-pointer inline-flex items-center gap-1.5 text-[11px] transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Return</span>
                            </button>
                          )}
                        </div>

                        {/* Cancel with Reason */}
                        {showCancel && (
                          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-neutral-200/80">
                            <input
                              type="text"
                              value={cancelReasonInput}
                              onChange={(e) => setCancelReasonInput(e.target.value)}
                              placeholder="Cancel reason (optional, e.g. Customer unreachable)..."
                              className="flex-1 px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-[11px]"
                            />
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() =>
                                handleOrderAction(selectedOrder, 'cancelled', {
                                  subStatus: 'CANCELLED',
                                  cancelReason: cancelReasonInput.trim() || handoffNote.trim() || 'Cancelled by staff',
                                })
                              }
                              className="px-3.5 py-1.5 border border-red-300 bg-red-50 text-red-700 font-bold uppercase tracking-wider rounded-lg hover:bg-red-100 cursor-pointer inline-flex items-center gap-1.5 text-[11px] transition-colors shrink-0"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Cancel Order</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Vertical Staff Workflow & Payment Timeline */}
                {((selectedOrder.pipeline?.handoffHistory && selectedOrder.pipeline.handoffHistory.length > 0) ||
                  (selectedOrder.paymentHistory && selectedOrder.paymentHistory.length > 0)) && (
                  <div className="border-t border-neutral-200 pt-4 space-y-4">
                    {selectedOrder.pipeline?.handoffHistory && selectedOrder.pipeline.handoffHistory.length > 0 && (
                      <div className="space-y-2.5">
                        <h4 className="font-bold uppercase tracking-wider text-neutral-500 text-[11px]">
                          Workflow &amp; Staff Activity Timeline
                        </h4>
                        <div className="relative pl-4 border-l border-neutral-200 space-y-3">
                          {selectedOrder.pipeline.handoffHistory.map((log, i) => (
                            <div key={i} className="relative flex items-start justify-between gap-3 text-xs">
                              <span className="w-2 h-2 rounded-full bg-neutral-900 absolute -left-[20.5px] top-1.5" />
                              <div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className="font-semibold text-neutral-900">{log.action}</p>
                                  {log.subStatus && (
                                    <span className="px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200 font-mono text-[9px] font-bold text-neutral-700">
                                      {log.subStatus}
                                    </span>
                                  )}
                                </div>
                                {log.note && <p className="text-neutral-500 mt-0.5">{log.note}</p>}
                              </div>
                              <span className="text-[11px] font-mono text-neutral-400 whitespace-nowrap">
                                {formatDateTime(log.timestamp)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedOrder.paymentHistory && selectedOrder.paymentHistory.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-neutral-100">
                        <h4 className="font-bold uppercase tracking-wider text-neutral-500 text-[11px]">
                          Payment Verification &amp; Collection Log
                        </h4>
                        <div className="space-y-1.5">
                          {selectedOrder.paymentHistory.map((pLog) => (
                            <div
                              key={pLog.id}
                              className="flex items-center justify-between gap-3 text-[11px] bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2"
                            >
                              <div>
                                <span className="font-mono font-bold text-emerald-700">
                                  ৳{pLog.amount.toLocaleString('en-BD')}
                                </span>{' '}
                                <span className="uppercase font-semibold text-neutral-700">
                                  ({pLog.method})
                                </span>{' '}
                                · By <b>{pLog.receivedBy}</b>
                                {pLog.note && <span className="text-neutral-500"> — {pLog.note}</span>}
                              </div>
                              <span className="font-mono text-neutral-400 whitespace-nowrap">
                                {formatDateTime(pLog.timestamp)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Assign Staff Desks Modal (Super Admin Only) */}
      {deskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-lg w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                  Assign Staff Workflow Desks
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Choose which staff member manages each stage of the order queue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeskModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 text-xs">
              {draftDesks.map((desk, idx) => (
                <div key={desk.stage} className="p-3 border border-neutral-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-neutral-900">
                      Stage {idx + 1}: {desk.roleTitle}
                    </p>
                    {staffList.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const chosen = staffList.find((s) => s.id === e.target.value);
                          if (!chosen) return;
                          setDraftDesks((prev) =>
                            prev.map((d, i) =>
                              i === idx
                                ? {
                                    ...d,
                                    partnerName: chosen.name,
                                    partnerEmail: chosen.email,
                                  }
                                : d
                            )
                          );
                        }}
                        className="px-2 py-1 bg-neutral-100 border border-neutral-200 rounded text-[11px] font-semibold cursor-pointer"
                      >
                        <option value="">Pick from Staff...</option>
                        {staffList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.designation})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={desk.partnerName}
                      onChange={(e) =>
                        setDraftDesks((prev) =>
                          prev.map((d, i) => (i === idx ? { ...d, partnerName: e.target.value } : d))
                        )
                      }
                      placeholder="Staff / Desk Name"
                      className="px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-md font-semibold"
                    />
                    <input
                      type="email"
                      value={desk.partnerEmail || ''}
                      onChange={(e) =>
                        setDraftDesks((prev) =>
                          prev.map((d, i) => (i === idx ? { ...d, partnerEmail: e.target.value } : d))
                        )
                      }
                      placeholder="Staff Login Email"
                      className="px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-md font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeskModalOpen(false)}
                className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 font-bold uppercase rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingDesks}
                onClick={async () => {
                  setSavingDesks(true);
                  try {
                    await posService.savePartnerDesks(draftDesks);
                    setDeskModalOpen(false);
                    showToastMsg('Staff workflow desks saved');
                  } finally {
                    setSavingDesks(false);
                  }
                }}
                className="flex-1 py-2.5 bg-black text-white font-bold uppercase rounded-lg hover:bg-neutral-800 cursor-pointer"
              >
                {savingDesks ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Invoice Overlay */}
      {showInvoiceModal && selectedOrder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <span className="font-bold text-sm">
                Invoice {getFormattedInvoiceNumber(selectedOrder.orderNumber, selectedOrder.id)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printElementById('pipeline-printable-invoice', selectedOrder.orderNumber)}
                  className="px-3.5 py-1.5 bg-black text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Invoice
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="p-1 text-neutral-500 hover:text-black cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div id="pipeline-printable-invoice" className="max-h-[75vh] overflow-y-auto">
              <InvoiceSheet order={selectedOrder} />
            </div>
          </div>
        </div>
      )}

      {/* Proof Zoom */}
      {zoomProofUrl && (
        <div
          onClick={() => setZoomProofUrl(null)}
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 cursor-pointer"
        >
          <img src={zoomProofUrl} alt="Payment Proof" className="max-h-[88vh] max-w-full rounded-lg" />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-60 bg-black text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-neutral-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
};
