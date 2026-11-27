import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  CheckCircle2,
  Package,
  X,
  Printer,
  Maximize2,
  XCircle,
  RotateCcw,
  ChevronDown,
  Receipt,
  FileText,
  Edit3,
  History,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import {
  Order,
  Product,
  CustomerVerificationFieldKey,
  PaymentVerifyStepKey,
  StockVerifyFieldKey,
  DeliveryStepKey,
} from '../types';
import {
  orderService,
  getOrderWorkflowStatus,
  DELIVERY_STEP_SEQUENCE,
} from '../services/orderService';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { formatDatePart, formatTimePart, formatDateTime } from '../lib/dateFormat';
import {
  getOrderPaidAndDue,
  getOrderCustomerPaidAndDue,
  getOrderRecognizedSale,
  getOrderFreeDeliveryFee,
} from '../lib/accountingUtils';
import { InvoiceSheet, getFormattedInvoiceNumber } from '../components/common/InvoiceSheet';
import { ThermalPosReceipt } from '../components/common/ThermalPosReceipt';
import { printElementById } from '../lib/printHelper';
import { AdminPageHeader } from './AdminLayout';
import {
  BD_DIVISIONS,
  BD_DISTRICTS_BY_DIVISION,
  getThanasForDistrict,
} from '../data/bdLocations';

type StageTabFilter =
  | 'all'
  | 'order_verification'
  | 'payment_verification'
  | 'inventory_packing'
  | 'delivery_dispatch'
  | 'cod_reconciliation'
  | 'completed'
  | 'returned'
  | 'cancelled';

const StepActionCell: React.FC<{
  verified: boolean;
  canVerify: boolean;
  processing?: boolean;
  verifyLabel?: string;
  onVerify: () => void;
  onEdit?: () => void;
  isEditing?: boolean;
  extraControls?: React.ReactNode;
}> = ({
  verified,
  canVerify,
  processing,
  verifyLabel = 'Verify',
  onVerify,
  onEdit,
  isEditing,
  extraControls,
}) => {
  if (verified) {
    return <span className="font-mono font-bold text-emerald-700 shrink-0">✓ Verified</span>;
  }
  if (!canVerify) {
    return <span className="text-[11px] font-mono text-neutral-400 shrink-0">Pending</span>;
  }
  if (isEditing) {
    return null;
  }
  return (
    <div className="flex items-center gap-1.5 shrink-0 font-sans">
      {extraControls}
      {onEdit && (
        <button
          type="button"
          disabled={processing}
          onClick={onEdit}
          title="Edit"
          aria-label="Edit"
          className="p-1 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded cursor-pointer transition-colors"
        >
          <Edit3 className="w-3 h-3" />
        </button>
      )}
      <button
        type="button"
        disabled={processing}
        onClick={onVerify}
        className="px-3 py-1 rounded text-[11px] font-bold bg-black text-white hover:bg-neutral-800 cursor-pointer transition-colors"
      >
        {verifyLabel}
      </button>
    </div>
  );
};

export const AdminOrderPipeline: React.FC = () => {
  const { currentUser, staffProfile, isSuperAdmin, hasOrderPermission } = useAuth();
  const [orders, setOrders] = useState<Order[]>(() => orderService.getInstantOrders());
  const [products, setProducts] = useState<Product[]>(() => productService.getInstantAllProducts());
  const [stageFilter, setStageFilter] = useState<StageTabFilter>('all');
  const [search, setSearch] = useState('');

  // Selected order slip page
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [handoffNote, setHandoffNote] = useState('');
  const [stageErrorMsg, setStageErrorMsg] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [zoomProofUrl, setZoomProofUrl] = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceFormat, setInvoiceFormat] = useState<'thermal' | 'a4'>('thermal');
  const [invoiceVariant, setInvoiceVariant] = useState<'customer' | 'final_sale'>('customer');

  // Inline editors
  const [editingFieldKey, setEditingFieldKey] = useState<CustomerVerificationFieldKey | null>(null);
  const [editingFieldValue, setEditingFieldValue] = useState('');
  const [editingInlineStep, setEditingInlineStep] = useState<{ id: string; value: string } | null>(null);

  // Payment inputs
  const [trxIdInput, setTrxIdInput] = useState('');
  const [verifiedPayInput, setVerifiedPayInput] = useState('');
  const [codCollectedInput, setCodCollectedInput] = useState('');
  const [freeDeliveryFeeInput, setFreeDeliveryFeeInput] = useState('0');
  const [codChargeInput, setCodChargeInput] = useState('0');
  const [codChargePctInput, setCodChargePctInput] = useState('0');

  // Delivery courier & tracking inputs
  const [courierName, setCourierName] = useState('Steadfast');
  const [trackingNumber, setTrackingNumber] = useState('');

  // Dropdown & exception states
  const [openRowMenu, setOpenRowMenu] = useState<{
    order: Order;
    top: number;
    right: number;
    openUp: boolean;
  } | null>(null);
  const [modalActionMenuOpen, setModalActionMenuOpen] = useState(false);
  const [pendingCancelMode, setPendingCancelMode] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const modalActionMenuRef = useRef<HTMLDivElement | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubOrders = orderService.subscribeToAllOrdersAdmin((list) => setOrders(list));
    const unsubProds = productService.subscribeToAllProductsAdmin(setProducts);
    return () => {
      unsubOrders();
      unsubProds();
    };
  }, []);

  useEffect(() => {
    if (!openRowMenu && !modalActionMenuOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (openRowMenu && rowMenuRef.current && !rowMenuRef.current.contains(target)) {
        setOpenRowMenu(null);
      }
      if (modalActionMenuOpen && modalActionMenuRef.current && !modalActionMenuRef.current.contains(target)) {
        setModalActionMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenRowMenu(null);
        setModalActionMenuOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      if (openRowMenu) setOpenRowMenu(null);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [openRowMenu, modalActionMenuOpen]);

  const selectedOrder = selectedOrderId ? orders.find((o) => o.id === selectedOrderId) || null : null;

  const canApprove = hasOrderPermission('order_approve');
  const canVerifyPayment = hasOrderPermission('payment_verify');
  const canPack = hasOrderPermission('packaging');
  const canShip = hasOrderPermission('shipping');
  const canReturn = hasOrderPermission('order_return');
  const canCancel = hasOrderPermission('order_cancel');

  const currentEmail = (staffProfile?.email || currentUser?.email || '').trim().toLowerCase();
  const actorDisplayName =
    staffProfile?.name ||
    currentUser?.displayName ||
    currentUser?.email ||
    'Authorized Staff';

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const openInspector = (ord: Order, opts?: { cancelMode?: boolean }) => {
    setSelectedOrderId(ord.id);
    setHandoffNote('');
    setEditingFieldKey(null);
    setEditingFieldValue('');
    setEditingInlineStep(null);
    setCourierName(ord.pipeline?.courierName || 'Steadfast');
    setTrackingNumber(ord.pipeline?.trackingNumber || '');
    const payInfo = getOrderCustomerPaidAndDue(ord);
    setVerifiedPayInput(String(payInfo.total));
    setTrxIdInput(ord.paymentDetails?.transactionId || '');
    const expectedCodCash = ord.pipeline?.codReconciliation?.expectedCash ?? payInfo.due ?? 0;
    const initCollected = ord.pipeline?.codReconciliation?.collectedCash ?? expectedCodCash;
    const initFreeDeliveryFee = getOrderFreeDeliveryFee(ord);
    const initCodCharge =
      ord.pipeline?.codReconciliation?.codCharge ??
      ord.codCharge ??
      ord.pipeline?.financialSnapshot?.codCharge ??
      0;
    setCodCollectedInput(String(initCollected));
    setFreeDeliveryFeeInput(String(initFreeDeliveryFee));
    setCodChargeInput(String(initCodCharge));
    setCodChargePctInput(
      initCollected > 0 && initCodCharge > 0
        ? String(Number(((initCodCharge / initCollected) * 100).toFixed(2)))
        : '0'
    );
    setCancelReasonInput('');
    setStageErrorMsg(null);
    setModalActionMenuOpen(false);
    setPendingCancelMode(Boolean(opts?.cancelMode));
    setOpenRowMenu(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const syncUpdatedOrderInState = (updated: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  };

  // ================= UNIFIED SEQUENTIAL ACTION HANDLERS =================
  const runWorkflowTask = async (fn: () => Promise<Order | null>, successMsg: string) => {
    setStageErrorMsg(null);
    setProcessing(true);
    try {
      const updated = await fn();
      if (updated) {
        syncUpdatedOrderInState(updated);
        settingsService
          .logAdminAction(
            currentUser?.uid || staffProfile?.id || 'staff',
            currentEmail || staffProfile?.username || 'staff',
            'ORDER_WORKFLOW_STEP',
            updated.orderNumber,
            `${successMsg} (${actorDisplayName})`
          )
          .catch(() => {});
        showToastMsg(successMsg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Action could not be completed.';
      setStageErrorMsg(msg);
      showToastMsg(msg);
    } finally {
      setProcessing(false);
    }
  };

  const handleVerifyCustomerField = (ord: Order, fieldKey: CustomerVerificationFieldKey) => {
    runWorkflowTask(
      () =>
        orderService.verifyCustomerFieldStep({
          orderId: ord.id,
          fieldKey,
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
          roleLabel: 'Order Verify',
          note: handoffNote.trim() || undefined,
        }),
      `Verified field (${ord.orderNumber})`
    );
  };

  const handleMarkNeedsCorrection = (ord: Order, fieldKey: CustomerVerificationFieldKey) => {
    runWorkflowTask(
      () =>
        orderService.flagOrCorrectCustomerField({
          orderId: ord.id,
          fieldKey,
          mode: 'needs_correction',
          note: handoffNote.trim() || 'Needs Correction',
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
          roleLabel: 'Order Verify',
        }),
      `Marked Needs Correction (${ord.orderNumber})`
    );
  };

  const handleSaveFieldCorrection = (ord: Order, fieldKey: CustomerVerificationFieldKey) => {
    runWorkflowTask(async () => {
      const res = await orderService.flagOrCorrectCustomerField({
        orderId: ord.id,
        fieldKey,
        mode: 'update_value',
        newValue: editingFieldValue,
        actorName: actorDisplayName,
        actorEmail: currentEmail || undefined,
        roleLabel: 'Order Verify',
      });
      setEditingFieldKey(null);
      setEditingFieldValue('');
      return res;
    }, `Updated & queued re-verify (${ord.orderNumber})`);
  };

  const handleVerifyInitialPayment = (
    ord: Order,
    step: 'paymentAmount' | 'paymentMethod'
  ) => {
    runWorkflowTask(
      () =>
        orderService.verifyInitialPaymentStep({
          orderId: ord.id,
          step,
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
          roleLabel: 'Order Verify',
          note: handoffNote.trim() || undefined,
        }),
      step === 'paymentMethod'
        ? `Customer & Initial Payment Completed (${ord.orderNumber})`
        : `Payment Amount Verified (${ord.orderNumber})`
    );
  };

  const handleVerifyPaymentStep = (ord: Order, stepKey: PaymentVerifyStepKey) => {
    const isCod = ord.paymentMethod === 'cod';
    const parsedAmt = verifiedPayInput.trim() !== '' ? Number(verifiedPayInput) : undefined;
    runWorkflowTask(async () => {
      const res = await orderService.verifyPaymentStep({
        orderId: ord.id,
        stepKey,
        editedTrxId: stepKey === 'trxId' ? trxIdInput.trim() || undefined : undefined,
        editedAmount:
          stepKey === 'finalPayable' && typeof parsedAmt === 'number' && !isNaN(parsedAmt)
            ? Math.max(0, parsedAmt)
            : undefined,
        note: handoffNote.trim() || undefined,
        actorName: actorDisplayName,
        actorEmail: currentEmail || undefined,
        roleLabel: 'Payment Verify',
      });
      setEditingInlineStep(null);
      return res;
    }, stepKey === 'confirmation'
      ? isCod
        ? `${ord.orderNumber} COD Confirmed (Awaiting Cash Collection)`
        : `${ord.orderNumber} Payment Verified & Paid`
      : `Verified ${stepKey} (${ord.orderNumber})`);
  };

  const handleSaveInlineEdit = (ord: Order) => {
    if (!editingInlineStep) return;
    const { id, value } = editingInlineStep;

    if (id === 'init:paymentAmount' || id === 'init:paymentMethod') {
      const step = id === 'init:paymentAmount' ? 'paymentAmount' : 'paymentMethod';
      runWorkflowTask(async () => {
        const res = await orderService.updateInitialPaymentStepValue({
          orderId: ord.id,
          step,
          value,
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
        });
        setEditingInlineStep(null);
        return res;
      }, `Updated ${step === 'paymentAmount' ? 'Payment Amount' : 'Payment Method'} (${ord.orderNumber})`);
      return;
    }

    if (id.startsWith('pay:')) {
      const stepKey = id.slice(4) as PaymentVerifyStepKey;
      runWorkflowTask(async () => {
        const res = await orderService.updatePaymentStepValue({
          orderId: ord.id,
          stepKey,
          value,
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
        });
        if (stepKey === 'trxId') setTrxIdInput(value);
        if (stepKey === 'finalPayable') setVerifiedPayInput(value);
        setEditingInlineStep(null);
        return res;
      }, `Updated ${stepKey} (${ord.orderNumber})`);
      return;
    }

    if (id.startsWith('stock:')) {
      const parts = id.split(':');
      const itemIndex = Number(parts[1]) || 0;
      const fieldKey = parts[2] as StockVerifyFieldKey;
      runWorkflowTask(async () => {
        const res = await orderService.updateStockItemFieldValue({
          orderId: ord.id,
          itemIndex,
          fieldKey,
          value,
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
        });
        setEditingInlineStep(null);
        return res;
      }, `Updated ${fieldKey} (${ord.orderNumber})`);
      return;
    }

    if (id.startsWith('del:')) {
      const stepKey = id.slice(4) as DeliveryStepKey;
      runWorkflowTask(async () => {
        const res = await orderService.updateDeliveryFieldValue({
          orderId: ord.id,
          stepKey,
          value,
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
        });
        if (stepKey === 'courierConfirmed' && value.trim()) setCourierName(value.trim());
        if (stepKey === 'trackingAdded') setTrackingNumber(value.trim());
        setEditingInlineStep(null);
        return res;
      }, `Updated ${stepKey} (${ord.orderNumber})`);
      return;
    }

    if (id === 'codrec') {
      const nextCollected = Math.max(0, Number(codCollectedInput) || 0);
      const nextFreeDeliveryFee = Math.max(0, Number(freeDeliveryFeeInput) || 0);
      const nextCodCharge = Math.max(0, Number(codChargeInput) || 0);
      runWorkflowTask(async () => {
        const res = await orderService.updateCodReconciliationValues({
          orderId: ord.id,
          collectedCash: nextCollected,
          freeDeliveryFee: nextFreeDeliveryFee,
          codCharge: nextCodCharge,
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
        });
        setEditingInlineStep(null);
        return res;
      }, `Updated COD Reconciliation & Charge (${ord.orderNumber})`);
    }
  };

  const handleVerifyStockFieldStep = (
    ord: Order,
    itemIndex: number,
    fieldKey: StockVerifyFieldKey,
    forceOverride = false
  ) => {
    const isFinalStockStep =
      itemIndex >= (ord.items?.length || 1) - 1 && fieldKey === 'stockUpdate';
    runWorkflowTask(
      () =>
        orderService.verifyStockFieldStep({
          orderId: ord.id,
          itemIndex,
          fieldKey,
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
          roleLabel: 'Stock Verify',
          note: handoffNote.trim() || undefined,
          forceStockOverride: forceOverride,
        }),
      isFinalStockStep
        ? `Stock Updated (${ord.orderNumber})`
        : `Verified ${fieldKey} (${ord.orderNumber})`
    );
  };

  const handleVerifyStockUpdate = (ord: Order, forceOverride = false) => {
    runWorkflowTask(
      () =>
        orderService.performRoleBStockUpdate({
          orderId: ord.id,
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
          roleLabel: 'Stock Verify',
          note: handoffNote.trim() || undefined,
          forceStockOverride: forceOverride,
        }),
      `Stock Updated (${ord.orderNumber})`
    );
  };

  const handleVerifyDeliveryStep = (ord: Order, stepKey: DeliveryStepKey) => {
    runWorkflowTask(
      () =>
        orderService.advanceRoleDDeliveryStep({
          orderId: ord.id,
          stepKey,
          courierName: courierName.trim() || ord.pipeline?.courierName,
          trackingNumber: trackingNumber.trim() || ord.pipeline?.trackingNumber,
          note: handoffNote.trim() || undefined,
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
          roleLabel: 'Delivery',
        }),
      `${DELIVERY_STEP_SEQUENCE.find((s) => s.key === stepKey)?.label || 'Step'} verified (${ord.orderNumber})`
    );
  };

  const handleVerifyCodReconcile = (ord: Order, resolveDiscrepancy = false) => {
    const enteredCash = Math.max(0, Number(codCollectedInput) || 0);
    const enteredFreeDeliveryFee = Math.max(0, Number(freeDeliveryFeeInput) || 0);
    const enteredCodCharge = Math.max(0, Number(codChargeInput) || 0);
    runWorkflowTask(
      () =>
        orderService.recordRoleCCodReconciliation({
          orderId: ord.id,
          collectedAmount: enteredCash,
          freeDeliveryFee: enteredFreeDeliveryFee,
          codCharge: enteredCodCharge,
          resolveDiscrepancy,
          note: handoffNote.trim() || undefined,
          actorName: actorDisplayName,
          actorEmail: currentEmail || undefined,
          roleLabel: 'Payment Verify',
        }),
      resolveDiscrepancy
        ? `Discrepancy Resolved & Completed (${ord.orderNumber})`
        : `Finance Reconciled (${ord.orderNumber})`
    );
  };

  const handleExceptionStageAction = (
    ord: Order,
    nextStage: 'returned' | 'cancelled',
    cancelReason?: string
  ) => {
    runWorkflowTask(
      () =>
        orderService.transferOrderStage({
          orderId: ord.id,
          nextStage,
          subStatus: nextStage === 'returned' ? 'RETURNED' : 'CANCELLED',
          handlerName: actorDisplayName,
          handlerEmail: currentEmail || undefined,
          note: handoffNote.trim() || undefined,
          cancelReason,
        }),
      `Order ${ord.orderNumber} marked ${nextStage.toUpperCase()}`
    );
  };

  // ================= COUNTS & FILTERING =================
  const stageCounts: Record<StageTabFilter, number> = {
    all: orders.length,
    order_verification: 0,
    payment_verification: 0,
    inventory_packing: 0,
    delivery_dispatch: 0,
    cod_reconciliation: 0,
    completed: 0,
    returned: 0,
    cancelled: 0,
  };

  orders.forEach((o) => {
    const st = orderService.getOrderPipelineStage(o);
    if (st in stageCounts) {
      stageCounts[st as StageTabFilter] += 1;
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
    if (ord.pipeline?.stockDeducted || ord.pipeline?.stockVerification?.stockUpdated) return false;
    return (ord.items || []).some((it) => {
      const stock = productStockMap.get(it.productId);
      return typeof stock === 'number' && stock < (Number(it.quantity) || 1);
    });
  };

  const filteredOrders = orders.filter((o) => {
    const st = orderService.getOrderPipelineStage(o);
    if (stageFilter !== 'all' && st !== stageFilter) return false;
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

  const activeOrderCount = orders.filter((o) => {
    const st = orderService.getOrderPipelineStage(o);
    return st !== 'completed' && st !== 'cancelled' && st !== 'returned';
  }).length;

  return (
    <div className="space-y-4">
      {!selectedOrder && (
        <>
          <AdminPageHeader
            title="Orders"
            subtitle={
              activeOrderCount > 0
                ? `${activeOrderCount} active ${activeOrderCount === 1 ? 'order' : 'orders'} in progress`
                : 'All orders processed'
            }
          />

          {/* Minimal Editorial Orders Card */}
          <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
        {/* Top Clean Strip with Filter & Search */}
        <div className="bg-[#f4f4f5] border-b border-neutral-200 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="relative sm:w-56 shrink-0">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as StageTabFilter)}
              className="w-full appearance-none pl-3 pr-8 py-1.5 text-xs font-medium bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:border-neutral-400 cursor-pointer"
            >
              <option value="all">All Orders ({stageCounts.all})</option>
              <option value="order_verification">Customer Verify ({stageCounts.order_verification})</option>
              <option value="payment_verification">Payment Verify ({stageCounts.payment_verification})</option>
              <option value="inventory_packing">Stock Verify ({stageCounts.inventory_packing})</option>
              <option value="delivery_dispatch">Packing &amp; Delivery ({stageCounts.delivery_dispatch})</option>
              <option value="cod_reconciliation">COD Reconciliation ({stageCounts.cod_reconciliation})</option>
              <option value="completed">Completed ({stageCounts.completed})</option>
              <option value="returned">Returned ({stageCounts.returned})</option>
              <option value="cancelled">Cancelled ({stageCounts.cancelled})</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order ID, name, phone, TrxID..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        {/* Minimal Orders Table */}
        <div className="p-5 sm:p-7">
          {filteredOrders.length === 0 ? (
            <div className="py-10 text-center text-xs text-neutral-500">
              <Package className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
              <p className="font-medium text-neutral-900 text-sm">No orders found</p>
              <p className="text-neutral-400 mt-0.5">Select another filter above or wait for incoming orders.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[680px]">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs sm:text-[13px] font-medium text-neutral-800">
                    <th className="pb-3.5 pr-4 font-medium">Order ID</th>
                    <th className="pb-3.5 px-3 font-medium">Order Date</th>
                    <th className="pb-3.5 px-3 font-medium">Customer</th>
                    <th className="pb-3.5 px-3 font-medium">Amount</th>
                    <th className="pb-3.5 px-3 font-medium">Payment Status</th>
                    <th className="pb-3.5 px-3 font-medium">Order Status</th>
                    <th className="pb-3.5 pl-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-xs sm:text-[13px] tabular-nums">
                  {filteredOrders.map((ord) => {
                    const wf = getOrderWorkflowStatus(ord);
                    const st = wf.stage;

                    const paymentColor =
                      ord.paymentStatus === 'paid'
                        ? 'text-emerald-600'
                        : ord.paymentStatus === 'failed'
                        ? 'text-red-600'
                        : ord.paymentStatus === 'refunded'
                        ? 'text-neutral-600'
                        : 'text-amber-500';

                    const paymentLabel =
                      ord.paymentMethod === 'cod' && ord.paymentStatus !== 'paid'
                        ? 'PENDING (COD)'
                        : (ord.paymentStatus || 'pending').toUpperCase();

                    const orderStatusColor =
                      st === 'completed'
                        ? 'text-emerald-600'
                        : st === 'cancelled'
                        ? 'text-red-600'
                        : st === 'returned'
                        ? 'text-amber-600'
                        : 'text-neutral-900';

                    const orderStatusLabel =
                      st === 'completed'
                        ? 'COMPLETED'
                        : st === 'cancelled'
                        ? 'CANCELLED'
                        : st === 'returned'
                        ? 'RETURNED'
                        : wf.currentActionLabel.toUpperCase();

                    return (
                      <tr
                        key={ord.id}
                        onClick={() => openInspector(ord)}
                        className="hover:bg-neutral-50/70 transition-colors cursor-pointer"
                      >
                        <td className="py-4 pr-4 font-mono text-neutral-900 whitespace-nowrap">
                          {ord.orderNumber}
                        </td>

                        <td className="py-4 px-3 text-neutral-700 whitespace-nowrap">
                          {formatDatePart(ord.createdAt, 'Recent')}
                        </td>

                        <td
                          className="py-4 px-3 text-neutral-800 whitespace-nowrap"
                          title={`${ord.customerName} · ${ord.customerPhone}`}
                        >
                          {ord.customerName}
                        </td>

                        <td
                          className="py-4 px-3 text-neutral-900 font-medium whitespace-nowrap"
                          title={(() => {
                            const codFee =
                              ord.codCharge || ord.pipeline?.codReconciliation?.codCharge || 0;
                            const freeDeliv = getOrderFreeDeliveryFee(ord);
                            const delivFee = Number(ord.deliveryCharge) || 0;
                            if (codFee > 0 || freeDeliv > 0) {
                              const parts: string[] = [];
                              if (delivFee > 0) {
                                parts.push(`Delivery ৳${delivFee.toLocaleString('en-BD')}`);
                              }
                              if (freeDeliv > 0) {
                                parts.push(`Free Delivery -৳${freeDeliv.toLocaleString('en-BD')}`);
                              }
                              if (codFee > 0) {
                                parts.push(`COD Charge -৳${codFee.toLocaleString('en-BD')}`);
                              }
                              return `Net Sale (${parts.join(' · ')})`;
                            }
                            return undefined;
                          })()}
                        >
                          ৳{getOrderRecognizedSale(ord).toLocaleString('en-BD')}
                        </td>

                        <td className={`py-4 px-3 font-semibold uppercase tracking-wide whitespace-nowrap ${paymentColor}`}>
                          {paymentLabel}
                        </td>

                        <td
                          className={`py-4 px-3 font-semibold uppercase tracking-wide whitespace-nowrap ${orderStatusColor}`}
                          title={wf.currentActionLabel}
                        >
                          {orderStatusLabel}
                        </td>

                        <td
                          className="py-4 pl-3 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => openInspector(ord)}
                              className="text-neutral-900 underline underline-offset-2 hover:text-black cursor-pointer font-medium"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                if (openRowMenu?.order.id === ord.id) {
                                  setOpenRowMenu(null);
                                  return;
                                }
                                const spaceBelow = window.innerHeight - rect.bottom;
                                const openUp = spaceBelow < 240;
                                setOpenRowMenu({
                                  order: ord,
                                  top: openUp ? rect.top - 6 : rect.bottom + 6,
                                  right: Math.max(12, window.innerWidth - rect.right),
                                  openUp,
                                });
                              }}
                              aria-label="More order actions"
                              className="p-1 text-neutral-400 hover:text-black rounded cursor-pointer transition-colors"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
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
      </div>

      {!selectedOrder && filteredOrders.length > 0 && (
        <p className="text-center text-xs text-neutral-500">
          Showing 1–{filteredOrders.length} of {filteredOrders.length}
        </p>
      )}
        </>
      )}

      {/* DEDICATED ORDER VERIFICATION PAGE VIEW */}
      {selectedOrder && (() => {
        const wf = getOrderWorkflowStatus(selectedOrder);
        const currentStage = wf.stage;
        const stockSnapItems = selectedOrder.pipeline?.stockVerification?.itemsSnapshot || [];
        const isClosed = currentStage === 'returned' || currentStage === 'cancelled';

        const showReturn =
          (currentStage === 'delivery_dispatch' ||
            currentStage === 'cod_reconciliation' ||
            currentStage === 'completed') &&
          canReturn;
        const showCancel = !isClosed && currentStage !== 'completed' && canCancel;

        const isPaymentActive = currentStage === 'payment_verification' && canVerifyPayment;
        const isStockActive = currentStage === 'inventory_packing' && canPack;
        const isDeliveryStage = currentStage === 'delivery_dispatch' && canShip;
        const isCodRecActive = currentStage === 'cod_reconciliation' && canVerifyPayment;

        // Calculate continuous serial numbers across the entire slip (01 -> N)
        const baseCustomerCount = wf.customerFields.length; // 6
        const paymentStartSerial = baseCustomerCount + 3; // 09 (after 07 Amount, 08 Method)
        const stockStartSerial = paymentStartSerial + wf.paymentSteps.length;
        const stockStepCount = Math.max(1, wf.stockFieldSteps.length);
        const deliveryStartSerial = stockStartSerial + stockStepCount;
        const codRecSerial = deliveryStartSerial + wf.deliverySteps.length;

        return (
          <div className="space-y-4">
            <AdminPageHeader
              title={`Order ${selectedOrder.orderNumber}`}
              subtitle={`${formatDateTime(selectedOrder.createdAt)} · ${wf.currentActionLabel}`}
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedOrderId(null)}
                    className="px-3 py-1.5 border border-neutral-300 bg-white text-neutral-800 text-xs font-semibold rounded-lg hover:border-black cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Orders</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceVariant('customer');
                      setInvoiceFormat('thermal');
                      setShowInvoiceModal(true);
                    }}
                    className="px-3 py-1.5 bg-black text-white text-xs font-bold rounded-lg hover:bg-neutral-800 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Customer Invoice</span>
                  </button>
                </>
              }
            />

            <div className="w-full bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
              {/* Top Minimal Slip Strip */}
              <div className="px-4 sm:px-6 py-3 border-b border-dashed border-neutral-300 bg-[#f4f4f5] flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-neutral-950">{selectedOrder.orderNumber}</span>
                  <span className="text-neutral-500">· {formatDateTime(selectedOrder.createdAt)}</span>
                </div>
                <span className="text-[11px] font-bold text-neutral-900 uppercase tracking-wide">
                  {wf.currentActionLabel}
                </span>
              </div>

              {/* Continuous Thermal POS Serial Slip Body */}
              <div className="p-4 sm:p-6 space-y-4 font-mono text-[11px] sm:text-xs text-neutral-900">
                {stageErrorMsg && (
                  <div className="p-2.5 bg-red-50 border border-red-300 rounded font-sans text-red-900 font-semibold text-xs">
                    {stageErrorMsg}
                  </div>
                )}

                {/* ORDERED PRODUCTS WITH IMAGE ABOVE CUSTOMER INFORMATION */}
                <div>
                  <div className="flex justify-between items-center border-b border-dashed border-neutral-400 pb-1 mb-2">
                    <span className="font-bold uppercase tracking-wider">ORDER ITEMS</span>
                    <span className="text-neutral-500">
                      {(selectedOrder.items || []).reduce((s, it) => s + (Number(it.quantity) || 1), 0)} pcs
                    </span>
                  </div>

                  <div className="divide-y divide-dashed divide-neutral-200">
                    {(selectedOrder.items || []).map((item, idx) => {
                      const prod = productMap.get(item.productId);
                      const thumbUrl = item.productImage || prod?.images?.[0] || '';
                      const skuText = item.sku || item.productCode || prod?.sku || 'N/A';
                      const qty = Number(item.quantity) || 1;
                      const lineTotal = Number(item.totalPrice) || (Number(item.unitPrice) || 0) * qty;

                      return (
                        <div key={`${item.productId}-${idx}`} className="py-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {thumbUrl ? (
                              <img
                                src={thumbUrl}
                                alt={item.productName}
                                className="w-12 h-12 aspect-square object-cover rounded border border-neutral-200 bg-neutral-50 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 aspect-square rounded border border-neutral-200 bg-neutral-50 flex items-center justify-center text-neutral-400 shrink-0">
                                <Package className="w-4 h-4" />
                              </div>
                            )}
                            <div className="min-w-0 font-sans">
                              <p className="font-bold text-xs text-neutral-950 truncate">{item.productName}</p>
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-neutral-600 mt-0.5 font-mono">
                                <span>Size: <b className="text-neutral-900">{item.size || 'Standard'}</b></span>
                                <span>Colour: <b className="text-neutral-900">{item.color || 'Standard'}</b></span>
                                <span>SKU: <b className="text-neutral-900">{skuText}</b></span>
                                <span>Qty: <b className="text-neutral-900">{qty}</b></span>
                              </div>
                            </div>
                          </div>
                          <span className="font-mono font-bold text-neutral-950 shrink-0">
                            ৳{lineTotal.toLocaleString('en-BD')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SECTION 1: CUSTOMER INFORMATION (01 - 06) */}
                <div className="border-t border-dashed border-neutral-400 pt-3">
                  <div className="flex justify-between items-center border-b border-dashed border-neutral-400 pb-1 mb-1">
                    <span className="font-bold uppercase tracking-wider">CUSTOMER INFORMATION</span>
                    <span className="text-neutral-500">
                      {wf.customerFields.filter((f) => f.entry.status === 'verified').length}/{wf.customerFields.length}
                    </span>
                  </div>

                  <div className="divide-y divide-dashed divide-neutral-200">
                    {wf.customerFields.map((field, idx) => {
                      const isVerified = field.entry.status === 'verified';
                      const needsCorr = field.entry.status === 'needs_correction';
                      const isEditing = editingFieldKey === field.key;
                      const isCurrent = currentStage === 'order_verification' && field.isCurrentActionable;
                      const canClickVerify = isCurrent && canApprove && !needsCorr;

                      return (
                        <div
                          key={field.key}
                          className={`py-2 flex items-center justify-between gap-3 ${
                            isCurrent ? 'bg-neutral-50 px-2 -mx-2 rounded' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-1.5">
                              <span className="text-neutral-400">{String(idx + 1).padStart(2, '0')}.</span>
                              <span className="font-bold">{field.label}:</span>
                              {!isEditing && (
                                <span className="font-sans text-neutral-800 break-words">
                                  {field.value || <span className="text-neutral-400 italic">Not provided</span>}
                                </span>
                              )}
                            </div>

                            {isEditing && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1.5 font-sans">
                                {field.key === 'district' ? (
                                  <select
                                    value={editingFieldValue}
                                    onChange={(e) => setEditingFieldValue(e.target.value)}
                                    className="px-2 py-1 border border-neutral-400 rounded text-xs bg-white min-w-[180px]"
                                  >
                                    {editingFieldValue &&
                                      !Object.values(BD_DISTRICTS_BY_DIVISION)
                                        .flat()
                                        .includes(editingFieldValue) && (
                                        <option value={editingFieldValue}>{editingFieldValue}</option>
                                      )}
                                    {BD_DIVISIONS.map((div) => (
                                      <optgroup key={div} label={`${div} Division`}>
                                        {(BD_DISTRICTS_BY_DIVISION[div] || []).map((dist) => (
                                          <option key={dist} value={dist}>{dist}</option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                ) : field.key === 'thana' ? (
                                  <select
                                    value={editingFieldValue}
                                    onChange={(e) => setEditingFieldValue(e.target.value)}
                                    className="px-2 py-1 border border-neutral-400 rounded text-xs bg-white min-w-[180px]"
                                  >
                                    <option value="">Select Thana / Upazila</option>
                                    {(() => {
                                      const list = getThanasForDistrict(
                                        selectedOrder.shippingAddress?.district,
                                        selectedOrder.shippingAddress?.division
                                      );
                                      const opts =
                                        editingFieldValue && !list.includes(editingFieldValue)
                                          ? [editingFieldValue, ...list]
                                          : list;
                                      return opts.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                      ));
                                    })()}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={editingFieldValue}
                                    onChange={(e) => setEditingFieldValue(e.target.value)}
                                    className="px-2 py-1 border border-neutral-400 rounded text-xs bg-white min-w-[180px]"
                                  />
                                )}
                                <button
                                  type="button"
                                  disabled={processing}
                                  onClick={() => handleSaveFieldCorrection(selectedOrder, field.key)}
                                  className="px-2.5 py-1 bg-black text-white rounded font-bold text-[11px] cursor-pointer"
                                >
                                  Save
                                </button>
                                {!needsCorr && (
                                  <button
                                    type="button"
                                    disabled={processing}
                                    onClick={() => {
                                      setEditingFieldKey(null);
                                      handleMarkNeedsCorrection(selectedOrder, field.key);
                                    }}
                                    className="px-2 py-1 border border-red-200 bg-red-50 text-red-700 font-semibold text-[11px] rounded cursor-pointer"
                                  >
                                    Needs Correction
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setEditingFieldKey(null)}
                                  className="px-2 py-1 border border-neutral-300 rounded text-[11px] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 font-sans">
                            {isVerified ? (
                              <span className="font-mono font-bold text-emerald-700">✓ Verified</span>
                            ) : isEditing ? null : isCurrent && canApprove ? (
                              <>
                                <button
                                  type="button"
                                  disabled={processing}
                                  onClick={() => {
                                    setEditingFieldKey(field.key);
                                    setEditingFieldValue(field.value);
                                  }}
                                  title="Edit"
                                  aria-label="Edit"
                                  className="p-1 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded cursor-pointer transition-colors"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                {canClickVerify ? (
                                  <button
                                    type="button"
                                    disabled={processing}
                                    onClick={() => handleVerifyCustomerField(selectedOrder, field.key)}
                                    className="px-3 py-1 rounded text-[11px] font-bold bg-black text-white hover:bg-neutral-800 cursor-pointer"
                                  >
                                    Verify
                                  </button>
                                ) : (
                                  <span className="text-[11px] font-mono font-bold text-red-700">Needs Correction</span>
                                )}
                              </>
                            ) : needsCorr ? (
                              <span className="text-[11px] font-mono font-bold text-red-700">Needs Correction</span>
                            ) : (
                              <span className="text-[11px] font-mono text-neutral-400">Pending</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SECTION 2: PAYMENT & FINANCE (07 onwards — includes Amount, Method, Discounts, Charges, Proof, Confirmation) */}
                <div className="border-t border-dashed border-neutral-400 pt-3">
                  <div className="flex justify-between items-center border-b border-dashed border-neutral-400 pb-1 mb-1">
                    <span className="font-bold uppercase tracking-wider">PAYMENT &amp; FINANCE</span>
                    <span className={selectedOrder.paymentStatus === 'paid' ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                      {wf.isCod && selectedOrder.paymentStatus !== 'paid'
                        ? 'Awaiting Cash Collection'
                        : (selectedOrder.paymentStatus || 'pending').toUpperCase()}
                    </span>
                  </div>

                  <div className="divide-y divide-dashed divide-neutral-200">
                    {/* 07. Payment Amount */}
                    {(() => {
                      const isEditingInitAmt = editingInlineStep?.id === 'init:paymentAmount';
                      const canAct = currentStage === 'order_verification' && wf.initialPaymentAmountActionable && canApprove;
                      return (
                        <div
                          className={`py-2 flex flex-col gap-1.5 ${
                            wf.initialPaymentAmountActionable ? 'bg-neutral-50 px-2 -mx-2 rounded' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-neutral-400 mr-1.5">
                                {String(baseCustomerCount + 1).padStart(2, '0')}.
                              </span>
                              <span className="font-bold">Payment Amount:</span>{' '}
                              {!isEditingInitAmt && (
                                <span>৳{(Number(selectedOrder.total) || 0).toLocaleString('en-BD')}</span>
                              )}
                            </div>
                            <StepActionCell
                              verified={wf.initialPaymentAmount.status === 'verified'}
                              canVerify={canAct}
                              processing={processing}
                              isEditing={isEditingInitAmt}
                              onEdit={() =>
                                setEditingInlineStep({
                                  id: 'init:paymentAmount',
                                  value: String(Number(selectedOrder.total) || 0),
                                })
                              }
                              onVerify={() => handleVerifyInitialPayment(selectedOrder, 'paymentAmount')}
                            />
                          </div>
                          {isEditingInitAmt && (
                            <div className="pl-5 flex flex-wrap items-center gap-1.5 font-sans">
                              <input
                                type="number"
                                value={editingInlineStep.value}
                                onChange={(e) =>
                                  setEditingInlineStep({ id: 'init:paymentAmount', value: e.target.value })
                                }
                                className="px-2 py-1 border border-neutral-400 rounded font-mono text-xs w-36 bg-white"
                              />
                              <button
                                type="button"
                                disabled={processing}
                                onClick={() => handleSaveInlineEdit(selectedOrder)}
                                className="px-2.5 py-1 bg-black text-white rounded font-bold text-[11px] cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingInlineStep(null)}
                                className="px-2 py-1 border border-neutral-300 rounded text-[11px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* 08. Payment Method */}
                    {(() => {
                      const isEditingInitMethod = editingInlineStep?.id === 'init:paymentMethod';
                      const canAct = currentStage === 'order_verification' && wf.initialPaymentMethodActionable && canApprove;
                      return (
                        <div
                          className={`py-2 flex flex-col gap-1.5 ${
                            wf.initialPaymentMethodActionable ? 'bg-neutral-50 px-2 -mx-2 rounded' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-neutral-400 mr-1.5">
                                {String(baseCustomerCount + 2).padStart(2, '0')}.
                              </span>
                              <span className="font-bold">Payment Method:</span>{' '}
                              {!isEditingInitMethod && (
                                <span className="uppercase">
                                  {selectedOrder.paymentMethod === 'cod'
                                    ? 'Cash on Delivery (COD)'
                                    : selectedOrder.paymentMethod}
                                </span>
                              )}
                            </div>
                            <StepActionCell
                              verified={wf.initialPaymentMethod.status === 'verified'}
                              canVerify={canAct}
                              processing={processing}
                              isEditing={isEditingInitMethod}
                              onEdit={() =>
                                setEditingInlineStep({
                                  id: 'init:paymentMethod',
                                  value: selectedOrder.paymentMethod || 'cod',
                                })
                              }
                              onVerify={() => handleVerifyInitialPayment(selectedOrder, 'paymentMethod')}
                            />
                          </div>
                          {isEditingInitMethod && (
                            <div className="pl-5 flex flex-wrap items-center gap-1.5 font-sans">
                              <select
                                value={editingInlineStep.value}
                                onChange={(e) =>
                                  setEditingInlineStep({ id: 'init:paymentMethod', value: e.target.value })
                                }
                                className="px-2 py-1 border border-neutral-400 rounded text-xs bg-white font-semibold uppercase"
                              >
                                <option value="cod">Cash on Delivery (COD)</option>
                                <option value="bkash">bKash</option>
                                <option value="nagad">Nagad</option>
                                <option value="rocket">Rocket</option>
                                <option value="cash">Cash</option>
                                <option value="due">Due</option>
                              </select>
                              <button
                                type="button"
                                disabled={processing}
                                onClick={() => handleSaveInlineEdit(selectedOrder)}
                                className="px-2.5 py-1 bg-black text-white rounded font-bold text-[11px] cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingInlineStep(null)}
                                className="px-2 py-1 border border-neutral-300 rounded text-[11px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {wf.paymentSteps.map((step, pIdx) => {
                      const serialNum = paymentStartSerial + pIdx;
                      const isVerified = step.entry.status === 'verified';
                      const isCurrent = currentStage === 'payment_verification' && step.isCurrentActionable;
                      const canClickStep = isPaymentActive && step.isCurrentActionable;
                      const inlineId = `pay:${step.key}`;
                      const isEditingStep = canClickStep && editingInlineStep?.id === inlineId;

                      const displayedStepVal =
                        step.key === 'trxId'
                          ? selectedOrder.paymentDetails?.transactionId ||
                            step.entry.correctedValue ||
                            step.displayValue
                          : step.displayValue;

                      const getPaymentEditDefault = (): string => {
                        const snap = selectedOrder.pipeline?.financialSnapshot;
                        switch (step.key) {
                          case 'productPrice':
                            return String(snap?.productPrice ?? selectedOrder.subtotal ?? 0);
                          case 'onlineDiscount':
                            return String(snap?.onlineDiscount ?? selectedOrder.onlineDiscount ?? 0);
                          case 'couponDiscount':
                            return String(snap?.couponDiscount ?? selectedOrder.discount ?? 0);
                          case 'discount':
                            return String(Math.max(0, (snap?.discount || 0) - (snap?.couponDiscount || 0) - (snap?.onlineDiscount || 0)));
                          case 'shipping':
                            return String(snap?.shippingCharge ?? selectedOrder.deliveryCharge ?? 0);
                          case 'freeDeliveryFee':
                            return String(getOrderFreeDeliveryFee(selectedOrder));
                          case 'codCharge':
                            return String(snap?.codCharge ?? 0);
                          case 'finalPayable':
                            return String(snap?.finalPayable ?? selectedOrder.total ?? 0);
                          case 'advancePaid':
                            return String(selectedOrder.paidAmount ?? selectedOrder.advanceAmount ?? 0);
                          case 'dueOnDelivery':
                            return String(selectedOrder.dueAmount ?? selectedOrder.dueOnDelivery ?? 0);
                          case 'senderNumber':
                            return selectedOrder.paymentDetails?.senderNumber || '';
                          case 'trxId':
                            return selectedOrder.paymentDetails?.transactionId || '';
                          case 'proof':
                            return selectedOrder.paymentDetails?.proofUrl || '';
                          case 'confirmation':
                            return selectedOrder.pipeline?.paymentNote || '';
                          default:
                            return '';
                        }
                      };

                      const isNumericPayField = [
                        'productPrice',
                        'onlineDiscount',
                        'couponDiscount',
                        'discount',
                        'shipping',
                        'freeDeliveryFee',
                        'codCharge',
                        'finalPayable',
                        'advancePaid',
                        'dueOnDelivery',
                      ].includes(step.key);

                      return (
                        <div
                          key={step.key}
                          className={`py-2 flex flex-col gap-1.5 ${
                            isCurrent ? 'bg-neutral-50 px-2 -mx-2 rounded' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5">
                              <span className="text-neutral-400">
                                {String(serialNum).padStart(2, '0')}.
                              </span>
                              <span className="font-bold">{step.label}:</span>
                              {step.key === 'proof' && selectedOrder.paymentDetails?.proofUrl && !isEditingStep ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setZoomProofUrl(selectedOrder.paymentDetails?.proofUrl || null)
                                  }
                                  className="text-blue-600 font-sans font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Maximize2 className="w-3 h-3" /> View Screenshot
                                </button>
                              ) : !isEditingStep ? (
                                <span
                                  className={`font-sans break-words ${
                                    step.key === 'finalPayable'
                                      ? 'font-bold text-neutral-950'
                                      : step.key === 'freeDeliveryFee' && displayedStepVal.startsWith('-')
                                      ? 'font-semibold text-red-700'
                                      : step.key === 'onlineDiscount' && displayedStepVal.startsWith('-')
                                      ? 'font-semibold text-emerald-700'
                                      : 'text-neutral-800'
                                  }`}
                                >
                                  {displayedStepVal}
                                </span>
                              ) : null}
                            </div>

                            <StepActionCell
                              verified={isVerified}
                              canVerify={canClickStep}
                              processing={processing}
                              isEditing={isEditingStep}
                              onEdit={() =>
                                setEditingInlineStep({
                                  id: inlineId,
                                  value: getPaymentEditDefault(),
                                })
                              }
                              onVerify={() => handleVerifyPaymentStep(selectedOrder, step.key)}
                            />
                          </div>

                          {isEditingStep && (
                            <div className="pl-5 flex flex-wrap items-center gap-1.5 font-sans">
                              <input
                                type={isNumericPayField ? 'number' : 'text'}
                                value={editingInlineStep.value}
                                onChange={(e) =>
                                  setEditingInlineStep({ id: inlineId, value: e.target.value })
                                }
                                placeholder={`Edit ${step.label}`}
                                className="px-2.5 py-1 bg-white border border-neutral-400 rounded font-mono text-xs min-w-[180px]"
                              />
                              <button
                                type="button"
                                disabled={processing}
                                onClick={() => handleSaveInlineEdit(selectedOrder)}
                                className="px-2.5 py-1 bg-black text-white rounded font-bold text-[11px] cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingInlineStep(null)}
                                className="px-2 py-1 border border-neutral-300 rounded text-[11px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SECTION 3: STOCK VERIFICATION & UPDATE */}
                <div className="border-t border-dashed border-neutral-400 pt-3">
                  <div className="flex justify-between items-center border-b border-dashed border-neutral-400 pb-1 mb-1">
                    <span className="font-bold uppercase tracking-wider">STOCK VERIFICATION &amp; UPDATE</span>
                    <span className={wf.roleBStockUpdated ? 'text-emerald-700 font-bold' : 'text-neutral-500'}>
                      {wf.stockFieldSteps.filter((s) => s.verified).length}/{Math.max(1, wf.stockFieldSteps.length)}
                    </span>
                  </div>

                  <div className="divide-y divide-dashed divide-neutral-200">
                    {wf.stockFieldSteps.length === 0 ? (
                      <div
                        className={`py-2 flex items-center justify-between gap-3 ${
                          isStockActive ? 'bg-neutral-50 px-2 -mx-2 rounded' : ''
                        }`}
                      >
                        <div>
                          <span className="text-neutral-400 mr-1.5">
                            {String(stockStartSerial).padStart(2, '0')}.
                          </span>
                          <span className="font-bold">Stock Verification &amp; Deduction</span>
                        </div>
                        <StepActionCell
                          verified={wf.roleBStockUpdated}
                          canVerify={isStockActive}
                          processing={processing}
                          onVerify={() => handleVerifyStockUpdate(selectedOrder, false)}
                        />
                      </div>
                    ) : (
                      wf.stockFieldSteps.map((sStep, sIdx) => {
                        const serialNum = stockStartSerial + sIdx;
                        const item = sStep.item;
                        const snapItem = stockSnapItems.find(
                          (s) =>
                            s.productId === item.productId &&
                            s.size === item.size &&
                            s.color === item.color
                        );
                        const liveStock = productStockMap.get(item.productId) ?? 0;
                        const stockBefore = snapItem ? snapItem.stockBefore : liveStock;
                        const orderQty = snapItem ? snapItem.orderQuantity : item.quantity;
                        const stockAfter = snapItem
                          ? snapItem.stockAfter
                          : Math.max(0, liveStock - orderQty);
                        const insufficient = !sStep.verified && stockBefore < orderQty;
                        const skuText =
                          item.sku ||
                          item.productCode ||
                          productMap.get(item.productId)?.sku ||
                          'N/A';

                        let valueNode: React.ReactNode = null;
                        if (sStep.fieldKey === 'product') {
                          valueNode = <span className="font-sans text-neutral-800">{item.productName}</span>;
                        } else if (sStep.fieldKey === 'sku') {
                          valueNode = <span className="text-neutral-800">{skuText}</span>;
                        } else if (sStep.fieldKey === 'size') {
                          valueNode = <span className="text-neutral-800">{item.size || 'Standard'}</span>;
                        } else if (sStep.fieldKey === 'color') {
                          valueNode = <span className="text-neutral-800">{item.color || 'Standard'}</span>;
                        } else if (sStep.fieldKey === 'quantity') {
                          valueNode = <span className="text-neutral-800">{orderQty} pcs</span>;
                        } else if (sStep.fieldKey === 'currentStock') {
                          valueNode = (
                            <span className={insufficient ? 'text-red-600 font-bold' : 'text-neutral-800'}>
                              {stockBefore} pcs
                            </span>
                          );
                        } else if (sStep.fieldKey === 'stockUpdate') {
                          valueNode = (
                            <span className="tabular-nums text-neutral-700">
                              Before: <b>{stockBefore}</b> · Qty: <b>{orderQty}</b> · After:{' '}
                              <b className={insufficient ? 'text-red-600' : 'text-emerald-700'}>
                                {stockAfter}
                              </b>
                            </span>
                          );
                        }

                        const isMultiItem = (selectedOrder.items || []).length > 1;
                        const isCurrent =
                          currentStage === 'inventory_packing' && sStep.isCurrentActionable;
                        const canClickStep = isStockActive && sStep.isCurrentActionable;
                        const inlineId = `stock:${sStep.itemIndex}:${sStep.fieldKey}`;
                        const isEditingStep = canClickStep && editingInlineStep?.id === inlineId;

                        const getStockEditDefault = (): string => {
                          switch (sStep.fieldKey) {
                            case 'product':
                              return item.productName || '';
                            case 'sku':
                              return skuText === 'N/A' ? '' : skuText;
                            case 'size':
                              return item.size || '';
                            case 'color':
                              return item.color || '';
                            case 'quantity':
                              return String(orderQty);
                            default:
                              return selectedOrder.pipeline?.inventoryNote || '';
                          }
                        };

                        return (
                          <div
                            key={`${item.productId}-${sStep.itemIndex}-${sStep.fieldKey}`}
                            className={`py-2 flex flex-col gap-1.5 ${
                              isCurrent ? 'bg-neutral-50 px-2 -mx-2 rounded' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5">
                                <span className="text-neutral-400">
                                  {String(serialNum).padStart(2, '0')}.
                                </span>
                                {isMultiItem && (
                                  <span className="text-[10px] text-neutral-400">
                                    [#{sStep.itemIndex + 1}]
                                  </span>
                                )}
                                <span className="font-bold">{sStep.label}:</span>
                                {!isEditingStep && valueNode}
                              </div>

                              <StepActionCell
                                verified={sStep.verified}
                                canVerify={canClickStep}
                                processing={processing}
                                isEditing={isEditingStep}
                                verifyLabel={
                                  sStep.fieldKey === 'stockUpdate' ? 'Update Stock' : 'Verify'
                                }
                                onEdit={() =>
                                  setEditingInlineStep({
                                    id: inlineId,
                                    value: getStockEditDefault(),
                                  })
                                }
                                onVerify={() =>
                                  handleVerifyStockFieldStep(
                                    selectedOrder,
                                    sStep.itemIndex,
                                    sStep.fieldKey,
                                    false
                                  )
                                }
                                extraControls={
                                  canClickStep &&
                                  sStep.fieldKey === 'stockUpdate' &&
                                  isSuperAdmin &&
                                  (insufficient || orderHasLowStock(selectedOrder)) ? (
                                    <button
                                      type="button"
                                      disabled={processing}
                                      onClick={() =>
                                        handleVerifyStockFieldStep(
                                          selectedOrder,
                                          sStep.itemIndex,
                                          sStep.fieldKey,
                                          true
                                        )
                                      }
                                      className="px-2.5 py-1 bg-red-600 text-white font-sans font-bold text-[11px] rounded cursor-pointer"
                                    >
                                      Override
                                    </button>
                                  ) : undefined
                                }
                              />
                            </div>

                            {isEditingStep && (
                              <div className="pl-5 flex flex-wrap items-center gap-1.5 font-sans">
                                <input
                                  type={sStep.fieldKey === 'quantity' ? 'number' : 'text'}
                                  value={editingInlineStep.value}
                                  onChange={(e) =>
                                    setEditingInlineStep({ id: inlineId, value: e.target.value })
                                  }
                                  placeholder={`Edit ${sStep.label}`}
                                  className="px-2.5 py-1 bg-white border border-neutral-400 rounded font-mono text-xs min-w-[180px]"
                                />
                                <button
                                  type="button"
                                  disabled={processing}
                                  onClick={() => handleSaveInlineEdit(selectedOrder)}
                                  className="px-2.5 py-1 bg-black text-white rounded font-bold text-[11px] cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingInlineStep(null)}
                                  className="px-2 py-1 border border-neutral-300 rounded text-[11px] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* SECTION 5: PACKING & DELIVERY (11 - 21) */}
                <div className="border-t border-dashed border-neutral-400 pt-3">
                  <div className="flex justify-between items-center border-b border-dashed border-neutral-400 pb-1 mb-1">
                    <span className="font-bold uppercase tracking-wider">PACKING &amp; DELIVERY</span>
                    <span className="text-neutral-500">
                      {wf.deliverySteps.filter((d) => d.completed).length}/{wf.deliverySteps.length}
                    </span>
                  </div>

                  <div className="divide-y divide-dashed divide-neutral-200">
                    {wf.deliverySteps.map((step, sIdx) => {
                      const serialNum = deliveryStartSerial + sIdx;
                      const isCurrent = currentStage === 'delivery_dispatch' && step.isCurrentActionable;
                      const canClickStep = isDeliveryStage && step.isCurrentActionable;
                      const inlineId = `del:${step.key}`;
                      const isEditingStep = canClickStep && editingInlineStep?.id === inlineId;

                      return (
                        <div
                          key={step.key}
                          className={`py-2 flex flex-col gap-1.5 ${
                            isCurrent ? 'bg-neutral-50 px-2 -mx-2 rounded' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-neutral-400 mr-1.5">
                                {String(serialNum).padStart(2, '0')}.
                              </span>
                              <span className="font-bold">{step.label}</span>
                              {step.key === 'courierConfirmed' && selectedOrder.pipeline?.courierName && (
                                <span className="text-neutral-500 ml-2">
                                  ({selectedOrder.pipeline.courierName})
                                </span>
                              )}
                              {step.key === 'trackingAdded' && selectedOrder.pipeline?.trackingNumber && (
                                <span className="text-neutral-500 ml-2">
                                  ({selectedOrder.pipeline.trackingNumber})
                                </span>
                              )}
                            </div>

                            <StepActionCell
                              verified={step.completed}
                              canVerify={canClickStep}
                              processing={processing}
                              isEditing={isEditingStep}
                              onEdit={() =>
                                setEditingInlineStep({
                                  id: inlineId,
                                  value:
                                    step.key === 'courierConfirmed'
                                      ? selectedOrder.pipeline?.courierName || courierName
                                      : step.key === 'trackingAdded'
                                      ? selectedOrder.pipeline?.trackingNumber || trackingNumber
                                      : selectedOrder.pipeline?.deliveryNote || '',
                                })
                              }
                              onVerify={() => handleVerifyDeliveryStep(selectedOrder, step.key)}
                            />
                          </div>

                          {isEditingStep && (
                            <div className="pl-5 flex flex-wrap items-center gap-1.5 font-sans">
                              <input
                                type="text"
                                value={editingInlineStep.value}
                                onChange={(e) =>
                                  setEditingInlineStep({ id: inlineId, value: e.target.value })
                                }
                                placeholder={
                                  step.key === 'courierConfirmed'
                                    ? 'Courier name'
                                    : step.key === 'trackingAdded'
                                    ? 'Tracking number'
                                    : `Note for ${step.label}`
                                }
                                className="px-2.5 py-1 bg-white border border-neutral-400 rounded font-mono text-xs min-w-[190px]"
                              />
                              <button
                                type="button"
                                disabled={processing}
                                onClick={() => handleSaveInlineEdit(selectedOrder)}
                                className="px-2.5 py-1 bg-black text-white rounded font-bold text-[11px] cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingInlineStep(null)}
                                className="px-2 py-1 border border-neutral-300 rounded text-[11px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          )}

                          {canClickStep && !isEditingStep && step.key === 'courierConfirmed' && (
                            <div className="pl-5 font-sans">
                              <select
                                value={courierName}
                                onChange={(e) => setCourierName(e.target.value)}
                                className="px-2.5 py-1 bg-white border border-neutral-300 rounded text-xs font-semibold"
                              >
                                <option value="Steadfast">Steadfast</option>
                                <option value="Pathao">Pathao</option>
                                <option value="RedX">RedX</option>
                                <option value="Paperfly">Paperfly</option>
                                <option value="Own Rider">Own Rider</option>
                              </select>
                            </div>
                          )}

                          {canClickStep && !isEditingStep && step.key === 'trackingAdded' && (
                            <div className="pl-5 font-sans">
                              <input
                                type="text"
                                value={trackingNumber}
                                onChange={(e) => setTrackingNumber(e.target.value)}
                                placeholder="Enter Tracking Number"
                                className="px-2.5 py-1 bg-white border border-neutral-300 rounded font-mono text-xs w-56"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SECTION 6: COD CASH COLLECTION & COD CHARGE RECONCILIATION */}
                {(wf.isCod ||
                  getOrderCustomerPaidAndDue(selectedOrder).due > 0 ||
                  currentStage === 'cod_reconciliation' ||
                  Boolean(selectedOrder.pipeline?.codReconciliation?.reconciledBy)) && (() => {
                  const recState = selectedOrder.pipeline?.codReconciliation;
                  const isReconciled = Boolean(recState?.reconciledBy) && !wf.reconciliationRequired;
                  const expectedCash = Math.max(
                    0,
                    recState?.expectedCash ?? getOrderCustomerPaidAndDue(selectedOrder).due
                  );
                  const orderTotalAmt = Math.max(0, Number(selectedOrder.total) || 0);
                  const deliveryChargeAmt = Math.max(
                    0,
                    Number(
                      selectedOrder.deliveryCharge ??
                        selectedOrder.pipeline?.financialSnapshot?.shippingCharge ??
                        0
                    ) || 0
                  );
                  const defaultFreeDeliveryFee = getOrderFreeDeliveryFee(selectedOrder);
                  const hasFreeDeliveryDeduction =
                    deliveryChargeAmt === 0 &&
                    (Boolean(selectedOrder.freeDeliveryApplied) ||
                      defaultFreeDeliveryFee > 0 ||
                      selectedOrder.orderChannel !== 'pos' ||
                      Boolean(selectedOrder.deliveryRequired));

                  const preCollectionPaid = Math.max(0, orderTotalAmt - expectedCash);
                  const productAdvancePaid = Math.max(0, preCollectionPaid - deliveryChargeAmt);
                  const isEditingCod = editingInlineStep?.id === 'codrec';
                  const showInputs = (isCodRecActive || isEditingCod) && (!isReconciled || isEditingCod);

                  const activeCollected = showInputs
                    ? Math.max(0, Number(codCollectedInput) || 0)
                    : Math.max(0, Number(recState?.collectedCash ?? expectedCash) || 0);
                  const activeFreeDeliveryFee = hasFreeDeliveryDeduction
                    ? showInputs
                      ? Math.max(0, Number(freeDeliveryFeeInput) || 0)
                      : defaultFreeDeliveryFee
                    : 0;
                  const activeCodCharge = showInputs
                    ? Math.max(0, Number(codChargeInput) || 0)
                    : Math.max(0, Number(recState?.codCharge ?? selectedOrder.codCharge ?? 0) || 0);
                  const productGrossCollected = Math.max(
                    0,
                    preCollectionPaid + activeCollected - deliveryChargeAmt - activeFreeDeliveryFee
                  );
                  const netFinalSale = Math.max(0, productGrossCollected - activeCodCharge);

                  const freeDeliveryOffset = hasFreeDeliveryDeduction ? 1 : 0;
                  const codChargeSerial = codRecSerial + 2 + freeDeliveryOffset;
                  const finalSaleSerial = codChargeSerial + 1;
                  const invoiceSerial = finalSaleSerial + 1;

                  return (
                    <div className="border-t border-dashed border-neutral-400 pt-3">
                      <div className="flex justify-between items-center border-b border-dashed border-neutral-400 pb-1 mb-1">
                        <span className="font-bold uppercase tracking-wider">COD RECONCILIATION</span>
                        {wf.reconciliationRequired ? (
                          <span className="text-red-700 font-bold">Reconciliation Required</span>
                        ) : isReconciled ? (
                          <span className="text-emerald-700 font-bold">
                            Final Sale: ৳{netFinalSale.toLocaleString('en-BD')}
                          </span>
                        ) : (
                          <span className="text-neutral-500 font-semibold">
                            Expected: ৳{expectedCash.toLocaleString('en-BD')}
                          </span>
                        )}
                      </div>

                      <div className="divide-y divide-dashed divide-neutral-200">
                        <div className="py-2 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-neutral-400 mr-1.5">
                              {String(codRecSerial).padStart(2, '0')}.
                            </span>
                            <span className="font-bold">Expected COD Cash:</span>{' '}
                            <span>৳{expectedCash.toLocaleString('en-BD')}</span>
                            {productAdvancePaid > 0 && (
                              <span className="text-neutral-500 text-[11px] ml-2">
                                (+৳{productAdvancePaid.toLocaleString('en-BD')} Product Adv)
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-neutral-400">
                            {isReconciled ? '✓ Matched' : 'Target'}
                          </span>
                        </div>

                        <div className="py-2 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-neutral-400 mr-1.5">
                              {String(codRecSerial + 1).padStart(2, '0')}.
                            </span>
                            <span className="font-bold">Collected Cash:</span>{' '}
                            {!showInputs && (
                              <span>৳{activeCollected.toLocaleString('en-BD')}</span>
                            )}
                          </div>
                          {showInputs ? (
                            <input
                              type="number"
                              min={0}
                              value={codCollectedInput}
                              onChange={(e) => {
                                const rawCash = e.target.value;
                                setCodCollectedInput(rawCash);
                                const nextCash = Math.max(0, Number(rawCash) || 0);
                                const currentAmt = Math.max(0, Number(codChargeInput) || 0);
                                if (currentAmt > 0 && nextCash > 0) {
                                  setCodChargePctInput(
                                    String(Number(((currentAmt / nextCash) * 100).toFixed(2)))
                                  );
                                }
                              }}
                              className="px-2.5 py-1 bg-white border border-neutral-400 rounded font-mono text-xs w-32 text-right font-bold"
                            />
                          ) : (
                            <span className="font-mono text-xs text-neutral-700">
                              ৳{activeCollected.toLocaleString('en-BD')}
                            </span>
                          )}
                        </div>

                        {hasFreeDeliveryDeduction && (
                          <div className="py-2 flex items-center justify-between gap-3">
                            <div>
                              <span className="text-neutral-400 mr-1.5">
                                {String(codRecSerial + 2).padStart(2, '0')}.
                              </span>
                              <span className="font-bold">Free Delivery Charge (From Product):</span>{' '}
                              {!showInputs && (
                                <span className={activeFreeDeliveryFee > 0 ? 'text-red-700' : 'text-neutral-600'}>
                                  {activeFreeDeliveryFee > 0
                                    ? `-৳${activeFreeDeliveryFee.toLocaleString('en-BD')}${
                                        selectedOrder.deliveryZone ? ` (${selectedOrder.deliveryZone})` : ''
                                      }`
                                    : '৳0'}
                                </span>
                              )}
                              {showInputs && selectedOrder.deliveryZone && (
                                <span className="text-[11px] text-neutral-500 font-sans ml-1">
                                  ({selectedOrder.deliveryZone})
                                </span>
                              )}
                            </div>
                            {showInputs ? (
                              <div className="flex items-center border border-neutral-400 rounded bg-white overflow-hidden">
                                <span className="pl-2 text-[11px] font-mono font-bold text-neutral-500 select-none">
                                  ৳
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step="1"
                                  value={freeDeliveryFeeInput}
                                  onChange={(e) => setFreeDeliveryFeeInput(e.target.value)}
                                  aria-label="Free Delivery Charge Deducted from Product"
                                  title="Enter Free Delivery Charge deducted from product total"
                                  className="px-2 py-1 font-mono text-xs w-24 text-right font-bold focus:outline-none"
                                />
                              </div>
                            ) : (
                              <span
                                className={`font-mono text-xs ${
                                  activeFreeDeliveryFee > 0 ? 'text-red-700' : 'text-neutral-500'
                                }`}
                              >
                                {activeFreeDeliveryFee > 0
                                  ? `-৳${activeFreeDeliveryFee.toLocaleString('en-BD')}`
                                  : '৳0'}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="py-2 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-neutral-400 mr-1.5">
                              {String(codChargeSerial).padStart(2, '0')}.
                            </span>
                            <span className="font-bold">COD Charge (Courier Fee):</span>{' '}
                            {!showInputs && (
                              <span className={activeCodCharge > 0 ? 'text-red-700' : 'text-neutral-600'}>
                                {activeCodCharge > 0
                                  ? `-৳${activeCodCharge.toLocaleString('en-BD')}${
                                      activeCollected > 0
                                        ? ` (${Number(((activeCodCharge / activeCollected) * 100).toFixed(2))}%)`
                                        : ''
                                    }`
                                  : '৳0'}
                              </span>
                            )}
                          </div>
                          {showInputs ? (
                            <div className="flex items-center gap-1.5 font-sans">
                              <div className="flex items-center border border-neutral-400 rounded bg-white overflow-hidden">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={codChargePctInput}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setCodChargePctInput(raw);
                                    const pct = Math.max(0, Number(raw) || 0);
                                    const baseCash = Math.max(0, Number(codCollectedInput) || 0);
                                    const calcAmt = Math.round((baseCash * pct) / 100);
                                    setCodChargeInput(raw === '' ? '' : String(calcAmt));
                                  }}
                                  aria-label="COD Charge Percentage"
                                  title="Enter COD Charge %"
                                  className="px-2 py-1 font-mono text-xs w-16 text-right font-bold focus:outline-none"
                                />
                                <span className="pr-2 text-[11px] font-mono font-bold text-neutral-500 select-none">
                                  %
                                </span>
                              </div>
                              <div className="flex items-center border border-neutral-400 rounded bg-white overflow-hidden">
                                <span className="pl-2 text-[11px] font-mono font-bold text-neutral-500 select-none">
                                  ৳
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step="1"
                                  value={codChargeInput}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setCodChargeInput(raw);
                                    const amt = Math.max(0, Number(raw) || 0);
                                    const baseCash = Math.max(0, Number(codCollectedInput) || 0);
                                    const calcPct =
                                      baseCash > 0 ? Number(((amt / baseCash) * 100).toFixed(2)) : 0;
                                    setCodChargePctInput(raw === '' ? '' : String(calcPct));
                                  }}
                                  aria-label="COD Charge Amount"
                                  title="Enter COD Charge Amount"
                                  className="px-2 py-1 font-mono text-xs w-24 text-right font-bold focus:outline-none"
                                />
                              </div>
                            </div>
                          ) : (
                            <span className={`font-mono text-xs ${activeCodCharge > 0 ? 'text-red-700' : 'text-neutral-500'}`}>
                              {activeCodCharge > 0 ? `-৳${activeCodCharge.toLocaleString('en-BD')}` : '৳0'}
                            </span>
                          )}
                        </div>

                        <div
                          className={`py-2.5 flex flex-col gap-2 ${
                            isCodRecActive || isEditingCod ? 'bg-neutral-50 px-2 -mx-2 rounded' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-neutral-400 mr-1.5">
                                {String(finalSaleSerial).padStart(2, '0')}.
                              </span>
                              <span className="font-bold">Final Sale Amount:</span>{' '}
                              <span className="font-mono font-bold text-emerald-700">
                                ৳{netFinalSale.toLocaleString('en-BD')}
                              </span>
                              <span className="text-[11px] text-neutral-500 ml-2 font-sans">
                                (
                                {productAdvancePaid > 0
                                  ? `Adv ৳${productAdvancePaid.toLocaleString('en-BD')} + Cash ৳${activeCollected.toLocaleString('en-BD')}`
                                  : preCollectionPaid === 0 && deliveryChargeAmt > 0
                                  ? `Cash ৳${activeCollected.toLocaleString('en-BD')} − Delivery ৳${deliveryChargeAmt.toLocaleString('en-BD')}`
                                  : `Cash ৳${activeCollected.toLocaleString('en-BD')}`}
                                {activeFreeDeliveryFee > 0
                                  ? ` − Free Delivery ৳${activeFreeDeliveryFee.toLocaleString('en-BD')}`
                                  : ''}
                                {` − COD Fee ৳${activeCodCharge.toLocaleString('en-BD')}`}
                                )
                              </span>
                            </div>

                            {isEditingCod ? (
                              <div className="flex items-center gap-1.5 font-sans shrink-0">
                                <button
                                  type="button"
                                  disabled={processing}
                                  onClick={() => handleSaveInlineEdit(selectedOrder)}
                                  className="px-2.5 py-1 bg-black text-white rounded font-bold text-[11px] cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingInlineStep(null)}
                                  className="px-2 py-1 border border-neutral-300 rounded text-[11px] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : isReconciled ? (
                              <div className="flex items-center gap-1.5 shrink-0 font-sans">
                                {canVerifyPayment && (
                                  <button
                                    type="button"
                                    disabled={processing}
                                    onClick={() => {
                                      setCodCollectedInput(String(activeCollected));
                                      setFreeDeliveryFeeInput(String(activeFreeDeliveryFee));
                                      setCodChargeInput(String(activeCodCharge));
                                      setCodChargePctInput(
                                        activeCollected > 0 && activeCodCharge > 0
                                          ? String(
                                              Number(((activeCodCharge / activeCollected) * 100).toFixed(2))
                                            )
                                          : '0'
                                      );
                                      setEditingInlineStep({
                                        id: 'codrec',
                                        value: String(activeCollected),
                                      });
                                    }}
                                    title="Edit COD Collection / Charge"
                                    aria-label="Edit COD Collection / Charge"
                                    className="p-1 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded cursor-pointer transition-colors"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                )}
                                <span className="font-mono font-bold text-emerald-700">✓ Verified</span>
                              </div>
                            ) : (
                              <StepActionCell
                                verified={false}
                                canVerify={isCodRecActive}
                                processing={processing}
                                isEditing={isEditingCod}
                                verifyLabel={wf.reconciliationRequired ? 'Resolve & Verify' : 'Verify'}
                                onEdit={() => {
                                  setFreeDeliveryFeeInput(String(activeFreeDeliveryFee));
                                  setEditingInlineStep({
                                    id: 'codrec',
                                    value: codCollectedInput,
                                  });
                                }}
                                onVerify={() => handleVerifyCodReconcile(selectedOrder, wf.reconciliationRequired)}
                              />
                            )}
                          </div>
                        </div>

                        <div className="py-2 flex items-center justify-between gap-3">
                          <div className="flex items-center flex-wrap gap-2">
                            <span>
                              <span className="text-neutral-400 mr-1.5">
                                {String(invoiceSerial).padStart(2, '0')}.
                              </span>
                              <span className="font-bold">Final Sale Invoice:</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setInvoiceVariant('final_sale');
                                setInvoiceFormat('a4');
                                setShowInvoiceModal(true);
                              }}
                              className="text-blue-600 font-semibold font-sans inline-flex items-center gap-1 hover:underline cursor-pointer"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>View Invoice</span>
                            </button>
                          </div>
                          <span
                            className={`font-mono text-[11px] shrink-0 ${
                              isReconciled ? 'font-bold text-emerald-700' : 'text-neutral-400'
                            }`}
                          >
                            {isReconciled ? '✓ Completed' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Note & Exception Dropdown */}
                {(showReturn || showCancel) && (
                  <div className="border-t border-dashed border-neutral-400 pt-3 font-sans space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={handoffNote}
                        onChange={(e) => setHandoffNote(e.target.value)}
                        placeholder="Optional note..."
                        className="flex-1 min-w-[180px] px-2.5 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs"
                      />

                      <div ref={modalActionMenuRef} className="relative">
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() => setModalActionMenuOpen((p) => !p)}
                          className="px-3 py-1.5 border border-neutral-300 bg-white text-neutral-800 font-bold uppercase tracking-wider rounded-lg hover:border-black cursor-pointer inline-flex items-center gap-1.5 text-[11px]"
                        >
                          <span>Exceptions</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {modalActionMenuOpen && (
                          <div className="absolute right-0 bottom-full mb-1.5 z-30 w-52 bg-white border border-neutral-200 rounded-xl shadow-xl py-1 text-xs">
                            {showReturn && (
                              <button
                                type="button"
                                onClick={() => {
                                  setModalActionMenuOpen(false);
                                  handleExceptionStageAction(selectedOrder, 'returned');
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-amber-50 text-amber-800 font-semibold flex items-center gap-2 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Return Order</span>
                              </button>
                            )}
                            {showCancel && (
                              <button
                                type="button"
                                onClick={() => {
                                  setModalActionMenuOpen(false);
                                  setPendingCancelMode(true);
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-red-50 text-red-700 font-bold flex items-center gap-2 cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Cancel Order...</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {pendingCancelMode && showCancel && (
                      <div className="flex flex-col sm:flex-row gap-2 bg-red-50/70 border border-red-200 p-2.5 rounded-lg">
                        <input
                          type="text"
                          value={cancelReasonInput}
                          onChange={(e) => setCancelReasonInput(e.target.value)}
                          placeholder="Reason for cancellation..."
                          className="flex-1 px-2.5 py-1.5 bg-white border border-neutral-300 rounded text-[11px]"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={processing}
                            onClick={() => {
                              setPendingCancelMode(false);
                              handleExceptionStageAction(
                                selectedOrder,
                                'cancelled',
                                cancelReasonInput.trim() || handoffNote.trim() || 'Cancelled by staff'
                              );
                            }}
                            className="px-3 py-1.5 bg-red-600 text-white font-bold uppercase rounded hover:bg-red-700 cursor-pointer text-[11px]"
                          >
                            Confirm Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingCancelMode(false)}
                            className="px-2.5 py-1.5 border border-neutral-300 bg-white text-neutral-700 font-semibold rounded cursor-pointer text-[11px]"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Activity History Footer */}
                <div className="border-t border-dashed border-neutral-400 pt-3 space-y-1.5">
                  <h4 className="font-bold uppercase tracking-wider text-neutral-500 text-[10px] flex items-center gap-1.5">
                    <History className="w-3 h-3" />
                    <span>Activity Log</span>
                  </h4>
                  <div className="space-y-1 text-[10px] text-neutral-600">
                    {(selectedOrder.pipeline?.activityLog && selectedOrder.pipeline.activityLog.length > 0
                      ? selectedOrder.pipeline.activityLog
                      : (selectedOrder.pipeline?.handoffHistory || []).map((h, i) => ({
                          id: String(i),
                          label: h.action,
                          actorName: h.handlerName,
                          timestamp: h.timestamp,
                        }))
                    ).map((entry: any, i: number) => (
                      <div key={entry.id || i} className="flex items-start justify-between gap-2">
                        <span>
                          <b className="text-neutral-900">{entry.label}</b> · {entry.actorName}
                        </span>
                        <span className="text-neutral-400 shrink-0">
                          {formatTimePart(entry.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Receipt / Invoice Overlay */}
      {showInvoiceModal && selectedOrder && (() => {
        const isEditingCodRec =
          editingInlineStep?.id === 'codrec' ||
          (orderService.getOrderPipelineStage(selectedOrder) === 'cod_reconciliation' &&
            !selectedOrder.pipeline?.codReconciliation?.reconciledBy);
        const previewOrder: Order =
          invoiceVariant === 'final_sale' && isEditingCodRec
            ? (() => {
                const liveCollected = Math.max(0, Number(codCollectedInput) || 0);
                const liveFreeDelivFee =
                  Math.max(0, Number(selectedOrder.deliveryCharge) || 0) > 0
                    ? 0
                    : Math.max(0, Number(freeDeliveryFeeInput) || 0);
                const liveCodFee = Math.max(0, Number(codChargeInput) || 0);
                const ordTotal = Math.max(0, Number(selectedOrder.total) || 0);
                const deliv = Math.max(0, Number(selectedOrder.deliveryCharge) || 0);
                const expCash = Math.max(
                  0,
                  selectedOrder.pipeline?.codReconciliation?.expectedCash ??
                    getOrderCustomerPaidAndDue(selectedOrder).due
                );
                const prePaid = Math.max(0, ordTotal - expCash);
                const liveFinalSale = Math.max(
                  0,
                  prePaid + liveCollected - deliv - liveFreeDelivFee - liveCodFee
                );
                return {
                  ...selectedOrder,
                  freeDeliveryCost: liveFreeDelivFee,
                  codCharge: liveCodFee,
                  netSaleAmount: liveFinalSale,
                  pipeline: {
                    ...(selectedOrder.pipeline || { currentStage: 'cod_reconciliation' }),
                    codReconciliation: {
                      ...(selectedOrder.pipeline?.codReconciliation || { expectedCash: expCash }),
                      expectedCash: expCash,
                      collectedCash: liveCollected,
                      freeDeliveryFee: liveFreeDelivFee,
                      codCharge: liveCodFee,
                      finalSaleAmount: liveFinalSale,
                      resolved: Boolean(selectedOrder.pipeline?.codReconciliation?.resolved),
                    },
                  },
                };
              })()
            : selectedOrder;

        return (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 overflow-y-auto">
            <div className="bg-white rounded-xl max-w-3xl w-full p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-3">
                <span className="font-bold text-sm">
                  {invoiceVariant === 'final_sale' ? 'Final Sale Invoice' : 'Customer Invoice'}{' '}
                  {getFormattedInvoiceNumber(previewOrder.orderNumber, previewOrder.id)}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex bg-neutral-100 p-0.5 rounded-lg border border-neutral-200 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setInvoiceVariant('customer')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer ${
                        invoiceVariant === 'customer' ? 'bg-black text-white' : 'text-neutral-600'
                      }`}
                    >
                      Customer Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceVariant('final_sale')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer ${
                        invoiceVariant === 'final_sale' ? 'bg-black text-white' : 'text-neutral-600'
                      }`}
                    >
                      Final Sale
                    </button>
                  </div>
                  <div className="inline-flex bg-neutral-100 p-0.5 rounded-lg border border-neutral-200 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setInvoiceFormat('thermal')}
                      className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 cursor-pointer ${
                        invoiceFormat === 'thermal' ? 'bg-black text-white' : 'text-neutral-600'
                      }`}
                    >
                      <Receipt className="w-3 h-3" /> Thermal POS
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceFormat('a4')}
                      className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 cursor-pointer ${
                        invoiceFormat === 'a4' ? 'bg-black text-white' : 'text-neutral-600'
                      }`}
                    >
                      <FileText className="w-3 h-3" /> A4
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      printElementById('pipeline-printable-invoice', previewOrder.orderNumber, invoiceFormat)
                    }
                    className="px-3.5 py-1.5 bg-black text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print
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
              <div
                className={`max-h-[75vh] overflow-y-auto rounded-lg ${
                  invoiceFormat === 'thermal' ? 'bg-neutral-100 p-4 flex justify-center' : ''
                }`}
              >
                <div id="pipeline-printable-invoice" className={invoiceFormat === 'thermal' ? 'w-fit' : 'w-full'}>
                  {invoiceFormat === 'thermal' ? (
                    <ThermalPosReceipt order={previewOrder} variant={invoiceVariant} />
                  ) : (
                    <InvoiceSheet order={previewOrder} variant={invoiceVariant} />
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating Table Row Actions Dropdown */}
      {!selectedOrder && openRowMenu && (() => {
        const ord = openRowMenu.order;
        const wf = getOrderWorkflowStatus(ord);
        const st = wf.stage;

        return (
          <div
            ref={rowMenuRef}
            style={{
              top: openRowMenu.openUp ? undefined : openRowMenu.top,
              bottom: openRowMenu.openUp ? window.innerHeight - openRowMenu.top : undefined,
              right: openRowMenu.right,
            }}
            className="fixed z-50 w-60 bg-white border border-neutral-200 rounded-xl shadow-2xl py-1.5 text-xs"
          >
            <div className="px-3 py-1.5 border-b border-neutral-100 flex items-center justify-between">
              <span className="font-mono font-bold text-[11px] text-neutral-900">{ord.orderNumber}</span>
              <span className="text-[10px] font-mono text-neutral-500 truncate max-w-[120px]">
                {wf.currentActionLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={() => openInspector(ord)}
              className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-neutral-900 font-bold flex items-center gap-2 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5 text-neutral-700 shrink-0" />
              <span>Open Serial Slip &amp; Verify</span>
            </button>

            <button
              type="button"
              onClick={() => {
                openInspector(ord);
                setInvoiceFormat('thermal');
                setShowInvoiceModal(true);
              }}
              className="w-full px-3 py-2 text-left hover:bg-neutral-50 text-neutral-800 font-semibold flex items-center gap-2 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <span>Print Thermal / A4 Receipt</span>
            </button>

            {(((st === 'delivery_dispatch' || st === 'cod_reconciliation' || st === 'completed') && canReturn) ||
              (st !== 'completed' && st !== 'cancelled' && st !== 'returned' && canCancel)) && (
              <div className="my-1 border-t border-neutral-100" />
            )}

            {(st === 'delivery_dispatch' || st === 'cod_reconciliation' || st === 'completed') && canReturn && (
              <button
                type="button"
                disabled={processing}
                onClick={() => {
                  setOpenRowMenu(null);
                  handleExceptionStageAction(ord, 'returned');
                }}
                className="w-full px-3 py-2 text-left hover:bg-amber-50 text-amber-800 font-semibold flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Return Order</span>
              </button>
            )}

            {st !== 'completed' && st !== 'cancelled' && st !== 'returned' && canCancel && (
              <button
                type="button"
                disabled={processing}
                onClick={() => openInspector(ord, { cancelMode: true })}
                className="w-full px-3 py-2 text-left hover:bg-red-50 text-red-700 font-bold flex items-center gap-2 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Cancel Order...</span>
              </button>
            )}
          </div>
        );
      })()}

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
