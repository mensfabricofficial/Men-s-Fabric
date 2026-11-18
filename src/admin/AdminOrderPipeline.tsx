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
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order, OrderPipelineStage, PartnerDeskConfig, Product, StaffAccount } from '../types';
import { orderService } from '../services/orderService';
import { posService, DEFAULT_PARTNER_DESKS } from '../services/posService';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { staffService } from '../services/staffService';
import { useAuth } from '../context/AuthContext';
import { formatDatePart, formatTimePart, formatDateTime } from '../lib/dateFormat';
import { InvoiceSheet, getFormattedInvoiceNumber } from '../components/common/InvoiceSheet';
import { printElementById } from '../lib/printHelper';

type StageTabFilter =
  | 'all'
  | 'order_verification'
  | 'payment_verification'
  | 'inventory_packing'
  | 'delivery_dispatch'
  | 'completed'
  | 'returned'
  | 'cancelled';

const STAGE_META: Record<
  'order_verification' | 'payment_verification' | 'inventory_packing' | 'delivery_dispatch',
  { stepNum: number; shortTitle: string; fullTitle: string }
> = {
  order_verification: {
    stepNum: 1,
    shortTitle: 'Order Verify',
    fullTitle: '1. Order Verification',
  },
  payment_verification: {
    stepNum: 2,
    shortTitle: 'Payment Verify',
    fullTitle: '2. Payment Verification',
  },
  inventory_packing: {
    stepNum: 3,
    shortTitle: 'Packaging & Stock',
    fullTitle: '3. Packaging & Inventory',
  },
  delivery_dispatch: {
    stepNum: 4,
    shortTitle: 'Delivery',
    fullTitle: '4. Delivery & Shipping',
  },
};

const ORDERED_DESK_STAGES: Array<
  'order_verification' | 'payment_verification' | 'inventory_packing' | 'delivery_dispatch'
> = ['order_verification', 'payment_verification', 'inventory_packing', 'delivery_dispatch'];

export const AdminOrderPipeline: React.FC = () => {
  const { currentUser, staffProfile, isSuperAdmin, hasOrderPermission } = useAuth();
  const [orders, setOrders] = useState<Order[]>(() => orderService.getLocalOrders());
  const [products, setProducts] = useState<Product[]>(() => productService.getLocalProducts());
  const [desks, setDesks] = useState<PartnerDeskConfig[]>(() => posService.getLocalPartnerDesks());
  const [staffList, setStaffList] = useState<StaffAccount[]>(() => staffService.getLocalStaff());
  const [stageFilter, setStageFilter] = useState<StageTabFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Selected order modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [handlerName, setHandlerName] = useState('');
  const [handoffNote, setHandoffNote] = useState('');
  const [courierName, setCourierName] = useState('Steadfast');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [zoomProofUrl, setZoomProofUrl] = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Desk Assignment Modal
  const [deskModalOpen, setDeskModalOpen] = useState(false);
  const [draftDesks, setDraftDesks] = useState<PartnerDeskConfig[]>(DEFAULT_PARTNER_DESKS);
  const [savingDesks, setSavingDesks] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const list = await orderService.getAllOrdersAdmin();
      setOrders(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    const unsubDesks = posService.subscribeToPartnerDesks(setDesks);
    const unsubProds = productService.subscribeToAllProductsAdmin(setProducts);
    const unsubStaff = staffService.subscribeToStaff(setStaffList);

    const handleLocalUpdate = () => setOrders(orderService.getLocalOrders());
    window.addEventListener('mf_orders_updated', handleLocalUpdate);

    let unsubOrders: (() => void) | null = null;
    try {
      const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(80));
      unsubOrders = onSnapshot(q, (snap) => {
        const remote: Order[] = [];
        snap.forEach((d) => remote.push({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }));
        const map = new Map<string, Order>();
        remote.forEach((o) => map.set(o.id, o));
        orderService.getLocalOrders().forEach((lo) => {
          const existing = map.get(lo.id);
          if (!existing || (lo.timeline?.length || 0) > (existing.timeline?.length || 0)) {
            map.set(lo.id, lo);
          }
        });
        setOrders(Array.from(map.values()));
      });
    } catch {
      // ignore
    }

    return () => {
      unsubDesks();
      unsubProds();
      unsubStaff();
      window.removeEventListener('mf_orders_updated', handleLocalUpdate);
      if (unsubOrders) unsubOrders();
    };
  }, []);

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
  };

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleOrderAction = async (
    ord: Order,
    nextStage: OrderPipelineStage,
    extra?: { markPaid?: boolean; dispatchShipped?: boolean }
  ) => {
    const actor = handlerName.trim() || defaultActorName;

    setProcessing(true);
    try {
      const updated = await orderService.transferOrderStage({
        orderId: ord.id,
        nextStage,
        handlerName: actor,
        handlerEmail: currentEmail || undefined,
        note: handoffNote.trim() || undefined,
        markPaymentStatus: extra?.markPaid ? 'paid' : undefined,
        overrideOrderStatus: extra?.dispatchShipped ? 'shipped' : undefined,
        courierName:
          extra?.dispatchShipped || nextStage === 'completed' ? courierName : undefined,
        trackingNumber:
          extra?.dispatchShipped || nextStage === 'completed' ? trackingNumber.trim() : undefined,
      });

      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        setSelectedOrder(updated);
        settingsService
          .logAdminAction(
            currentUser?.uid || staffProfile?.id || 'staff',
            currentEmail || staffProfile?.username || 'staff',
            'ORDER_WORKFLOW_ACTION',
            updated.orderNumber,
            `Action -> ${nextStage} (${updated.orderStatus}) by ${actor}`
          )
          .catch(() => {});
        showToastMsg(`Order ${updated.orderNumber} updated by ${actor}`);
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

  const filteredOrders = orders.filter((o) => {
    const st = orderService.getOrderPipelineStage(o);
    if (stageFilter !== 'all' && st !== stageFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.toLowerCase().includes(q) ||
        o.paymentDetails?.transactionId?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const productStockMap = new Map<string, number>();
  products.forEach((p) => {
    if (p.id) productStockMap.set(p.id, p.totalStock ?? 0);
  });

  const canApprove = hasOrderPermission('order_approve');
  const canVerifyPayment = hasOrderPermission('payment_verify');
  const canPack = hasOrderPermission('packaging');
  const canShip = hasOrderPermission('shipping');
  const canReturn = hasOrderPermission('order_return');
  const canCancel = hasOrderPermission('order_cancel');

  const renderStagePill = (ord: Order) => {
    const st = orderService.getOrderPipelineStage(ord);
    if (st === 'cancelled') {
      return (
        <div>
          <span className="text-xs font-bold text-red-700 block">Cancelled</span>
          {ord.pipeline?.cancelledBy && (
            <span className="text-[10px] text-neutral-500">By: {ord.pipeline.cancelledBy}</span>
          )}
        </div>
      );
    }
    if (st === 'returned') {
      return (
        <div>
          <span className="text-xs font-bold text-amber-700 block">Returned</span>
          {ord.pipeline?.returnedBy && (
            <span className="text-[10px] text-neutral-500">By: {ord.pipeline.returnedBy}</span>
          )}
        </div>
      );
    }
    if (st === 'completed') {
      return (
        <div>
          <span className="text-xs font-bold text-emerald-700 block">Delivered · Completed</span>
          {ord.pipeline?.deliveryHandledBy && (
            <span className="text-[10px] text-neutral-500">By: {ord.pipeline.deliveryHandledBy}</span>
          )}
        </div>
      );
    }
    const meta = STAGE_META[st];
    const desk = getDeskForStage(st);
    return (
      <div>
        <span className="text-xs font-bold text-neutral-900 block">{meta.fullTitle}</span>
        <span className="text-[11px] text-neutral-500">
          Desk: <b className="text-neutral-800">{desk?.partnerName || meta.shortTitle}</b>
          {st === 'delivery_dispatch' && ord.orderStatus === 'shipped' ? ' · In Transit' : ''}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Order Workflow &amp; Staff Desk Queue
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Track who approves each order across Verification, Payment Verify, Packaging &amp; Shipping with role-restricted action buttons.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadOrders}
            className="px-3 py-2 bg-white border border-neutral-200 text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg hover:border-black cursor-pointer inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => {
                setDraftDesks(desks);
                setDeskModalOpen(true);
              }}
              className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer inline-flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Assign Staff Desks</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Workflow Desk Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {ORDERED_DESK_STAGES.map((stKey) => {
          const meta = STAGE_META[stKey];
          const desk = getDeskForStage(stKey);
          const count = stageCounts[stKey];
          const val = stageTotals[stKey];
          const isSelected = stageFilter === stKey;
          const isMine =
            Boolean(currentEmail) &&
            Boolean(desk?.partnerEmail) &&
            desk!.partnerEmail!.trim().toLowerCase() === currentEmail;

          return (
            <button
              key={stKey}
              type="button"
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
                    Stage 0{meta.stepNum} · {meta.shortTitle}
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
                <span className="font-semibold">
                  {isMine ? 'Your Desk' : isSelected ? 'Showing Queue' : 'View Queue →'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter Bar & Tabs */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: `All (${stageCounts.all})` },
            { id: 'order_verification', label: `1. Order Verify (${stageCounts.order_verification})` },
            { id: 'payment_verification', label: `2. Payment Verify (${stageCounts.payment_verification})` },
            { id: 'inventory_packing', label: `3. Packaging (${stageCounts.inventory_packing})` },
            { id: 'delivery_dispatch', label: `4. Delivery (${stageCounts.delivery_dispatch})` },
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
            placeholder="Search order #, customer name, phone, or TrxID..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>
      </div>

      {/* Orders Live Visibility Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            <Package className="w-9 h-9 text-neutral-300 mx-auto mb-2" />
            <p className="font-bold text-neutral-900 text-sm">No orders in this stage</p>
            <p className="text-neutral-400 mt-0.5">Select another workflow tab above or wait for new orders.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Order &amp; Date</th>
                  <th className="p-3.5">Customer &amp; Items</th>
                  <th className="p-3.5">Total &amp; Payment</th>
                  <th className="p-3.5">Approval &amp; Handling Trail</th>
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
                        <p className="text-[11px] text-neutral-500 mt-0.5 truncate max-w-[200px]">
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
                      </td>

                      <td className="p-3.5">
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
                      </td>

                      <td className="p-3.5">{renderStagePill(ord)}</td>

                      <td className="p-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openInspector(ord)}
                          className="px-3 py-1.5 bg-black text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer"
                        >
                          Process Order
                        </button>
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
                    <p className="text-neutral-600">
                      Status:{' '}
                      <b className={selectedOrder.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-amber-700'}>
                        {selectedOrder.paymentStatus.toUpperCase()}
                      </b>
                      {selectedOrder.dueOnDelivery ? ` · Due on Delivery: ৳${selectedOrder.dueOnDelivery}` : ''}
                    </p>
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

                {/* Product Details & Inventory Checklist */}
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                    <span className="font-bold uppercase text-[11px] text-neutral-700 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      <span>Product Details &amp; Stock List ({selectedOrder.items.length})</span>
                    </span>
                    <span className="text-[11px] text-neutral-500">Verify SKU, Size &amp; Color</span>
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {selectedOrder.items.map((item, idx) => {
                      const currentStock = productStockMap.get(item.productId);
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
                                Size: <b>{item.size}</b> · Color: <b>{item.color}</b> · Qty: <b>{item.quantity}</b>
                              </p>
                              <p className="text-[10px] font-mono text-neutral-400">
                                SKU: {item.sku || item.productCode || 'N/A'}
                                {typeof currentStock === 'number' && (
                                  <span className="ml-2 text-neutral-600">
                                    · Remaining Stock: <b>{currentStock}</b>
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
                </div>

                {/* Role-Restricted All-in-One Order Action Buttons */}
                <div className="p-4 border border-neutral-300 bg-neutral-50 rounded-xl space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Order Control Actions (Role Permissions Applied)</span>
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
                        placeholder="e.g. Call verified / TrxID checked / Parcel packed"
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Courier / Tracking Inputs (for Shipping button) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                        Courier Service (For Shipping)
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

                  {/* ALL 7 ACTION BUTTONS with Role Enforcement */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {/* 1. Order Approve */}
                    <button
                      type="button"
                      disabled={processing || !canApprove}
                      title={!canApprove ? 'No permission for Order Approve' : undefined}
                      onClick={() => handleOrderAction(selectedOrder, 'payment_verification')}
                      className={`px-3.5 py-2 font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-1.5 text-[11px] transition-colors ${
                        canApprove
                          ? 'bg-black text-white hover:bg-neutral-800 cursor-pointer'
                          : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      {!canApprove && <Lock className="w-3 h-3" />}
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Order Approve</span>
                    </button>

                    {/* 2. Payment Verify */}
                    <button
                      type="button"
                      disabled={processing || !canVerifyPayment}
                      title={!canVerifyPayment ? 'No permission for Payment Verify' : undefined}
                      onClick={() =>
                        handleOrderAction(selectedOrder, 'inventory_packing', { markPaid: true })
                      }
                      className={`px-3.5 py-2 font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-1.5 text-[11px] transition-colors ${
                        canVerifyPayment
                          ? 'bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer'
                          : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      {!canVerifyPayment && <Lock className="w-3 h-3" />}
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Payment Verify</span>
                    </button>

                    {/* 3. Packaging */}
                    <button
                      type="button"
                      disabled={processing || !canPack}
                      title={!canPack ? 'No permission for Packaging' : undefined}
                      onClick={() => handleOrderAction(selectedOrder, 'delivery_dispatch')}
                      className={`px-3.5 py-2 font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-1.5 text-[11px] transition-colors ${
                        canPack
                          ? 'bg-neutral-800 text-white hover:bg-black cursor-pointer'
                          : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      {!canPack && <Lock className="w-3 h-3" />}
                      <Package className="w-3.5 h-3.5" />
                      <span>Packaging Done</span>
                    </button>

                    {/* 4. Shipping / Dispatch */}
                    <button
                      type="button"
                      disabled={processing || !canShip}
                      title={!canShip ? 'No permission for Shipping / Delivery' : undefined}
                      onClick={() =>
                        handleOrderAction(selectedOrder, 'delivery_dispatch', { dispatchShipped: true })
                      }
                      className={`px-3.5 py-2 font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-1.5 text-[11px] transition-colors ${
                        canShip
                          ? 'bg-neutral-900 text-white hover:bg-black cursor-pointer'
                          : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      {!canShip && <Lock className="w-3 h-3" />}
                      <Truck className="w-3.5 h-3.5" />
                      <span>Shipping / Dispatch</span>
                    </button>

                    {/* 5. Delivered */}
                    <button
                      type="button"
                      disabled={processing || !canShip}
                      title={!canShip ? 'No permission for Delivery Complete' : undefined}
                      onClick={() => handleOrderAction(selectedOrder, 'completed', { markPaid: true })}
                      className={`px-3.5 py-2 font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-1.5 text-[11px] transition-colors ${
                        canShip
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'
                          : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      {!canShip && <Lock className="w-3 h-3" />}
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Delivered</span>
                    </button>

                    {/* 6. Return */}
                    <button
                      type="button"
                      disabled={processing || !canReturn}
                      title={!canReturn ? 'No permission for Order Return' : undefined}
                      onClick={() => handleOrderAction(selectedOrder, 'returned')}
                      className={`px-3.5 py-2 font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-1.5 text-[11px] border transition-colors ${
                        canReturn
                          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer'
                          : 'border-neutral-200 bg-neutral-100 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      {!canReturn && <Lock className="w-3 h-3" />}
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Return</span>
                    </button>

                    {/* 7. Cancel */}
                    <button
                      type="button"
                      disabled={processing || !canCancel}
                      title={!canCancel ? 'No permission for Order Cancel' : undefined}
                      onClick={() => handleOrderAction(selectedOrder, 'cancelled')}
                      className={`px-3.5 py-2 font-bold uppercase tracking-wider rounded-lg inline-flex items-center gap-1.5 text-[11px] border transition-colors ${
                        canCancel
                          ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer'
                          : 'border-neutral-200 bg-neutral-100 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      {!canCancel && <Lock className="w-3 h-3" />}
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Cancel Order</span>
                    </button>
                  </div>
                </div>

                {/* Internal Staff Approval & Handoff Log */}
                {selectedOrder.pipeline?.handoffHistory && selectedOrder.pipeline.handoffHistory.length > 0 && (
                  <div className="border-t border-neutral-200 pt-4 space-y-2.5">
                    <h4 className="font-bold uppercase tracking-wider text-neutral-500 text-[11px]">
                      Staff Approval &amp; Activity History
                    </h4>
                    <div className="space-y-2">
                      {selectedOrder.pipeline.handoffHistory.map((log, i) => (
                        <div key={i} className="flex items-start justify-between gap-3 text-xs">
                          <div>
                            <p className="font-semibold text-neutral-900">{log.action}</p>
                            {log.note && <p className="text-neutral-500">{log.note}</p>}
                          </div>
                          <span className="text-[11px] font-mono text-neutral-400 whitespace-nowrap">
                            {formatDateTime(log.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
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
