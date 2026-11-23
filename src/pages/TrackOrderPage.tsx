import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Check,
  ShieldAlert,
  FileText,
  Phone,
  MessageCircle,
  ArrowRight,
  MapPin,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order, OrderStatus, SiteSettings } from '../types';
import { orderService, getOrderWorkflowStatus } from '../services/orderService';
import { settingsService, defaultSettings } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { A4InvoiceModal } from '../components/common/A4InvoiceModal';
import { FloatingInput } from '../components/common/FloatingInput';

interface TrackOrderPageProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

const formatDate = (ts: any): string => {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

const formatDateTimeShort = (ts: any): string => {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

interface TrackingStageItem {
  id: string;
  index: string;
  title: string;
  description: string;
  timestamp?: string;
  state: 'completed' | 'current' | 'upcoming';
}

interface LiveUpdateItem {
  id: string;
  title: string;
  note: string;
  timestamp: string;
}

export const TrackOrderPage: React.FC<TrackOrderPageProps> = ({ currentRoute, onNavigate }) => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<SiteSettings>(() => settingsService.getInstantSettings() || defaultSettings);
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  useEffect(() => {
    const unsub = settingsService.subscribeToSettings(setSettings);
    return () => unsub();
  }, []);

  const performTrack = useCallback(async (num: string, fallbackId?: string) => {
    const targetNum = (num || '').trim();
    const targetId = (fallbackId || '').trim();
    if (!targetNum && !targetId) return;

    setLoading(true);
    setError('');
    try {
      let res = targetNum ? await orderService.trackOrder(targetNum) : null;
      if (!res && targetId) {
        res = await orderService.getOrderById(targetId);
      }
      if (res) {
        setOrder(res);
        setOrderNumber(res.orderNumber || targetNum);
      } else {
        setOrder(null);
        setError('No order found matching that Order Number. Please check and try again.');
      }
    } catch {
      setError('Unable to load order details right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.origin + currentRoute);
    const paramNum =
      url.searchParams.get('number') ||
      url.searchParams.get('order') ||
      url.searchParams.get('orderId') ||
      '';
    const paramId = url.searchParams.get('id') || '';
    const hashNum = url.hash ? url.hash.split('&')[0].trim() : '';
    const resolvedNum = (paramNum || hashNum).trim();

    if (resolvedNum || paramId) {
      if (resolvedNum) setOrderNumber(resolvedNum);
      performTrack(resolvedNum, paramId);
    }
  }, [currentRoute, performTrack]);

  useEffect(() => {
    const loadRecent = async () => {
      if (currentUser) {
        try {
          const list = await orderService.getCustomerOrders(currentUser.uid, currentUser.email || undefined);
          if (list.length > 0) {
            setRecentOrders(list.slice(0, 4));
            return;
          }
        } catch {
          // fallback below
        }
      }
      const instantList = orderService.getInstantOrders();
      setRecentOrders(instantList.slice(0, 4));
    };
    void loadRecent();
  }, [currentUser]);

  useEffect(() => {
    const trackedId = order?.id;
    const trackedNum = order?.orderNumber;
    if (!trackedId) return;

    const unsub = onSnapshot(
      doc(db, 'orders', trackedId),
      (snap) => {
        if (snap.exists()) {
          const liveOrder = { id: snap.id, ...(snap.data() as Omit<Order, 'id'>) };
          orderService.saveLocalOrder(liveOrder);
          setOrder(liveOrder);
        }
      },
      () => {
        // Silently rely on manual refresh / local updates if offline
      }
    );

    const handleLocalUpdate = (e: Event) => {
      const updated = (e as CustomEvent<Order>).detail;
      if (
        updated &&
        ((trackedId && updated.id === trackedId) ||
          (trackedNum && updated.orderNumber === trackedNum))
      ) {
        setOrder(updated);
      }
    };

    const handleStorageSync = (e: StorageEvent) => {
      if (e.key !== 'mf_placed_orders_v2' || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        const list = Array.isArray(parsed) ? (parsed as Order[]) : [];
        const matched = list.find(
          (item) =>
            item &&
            ((trackedId && item.id === trackedId) ||
              (trackedNum && item.orderNumber === trackedNum))
        );
        if (matched) {
          setOrder(matched);
        }
      } catch {
        // ignore parse errors
      }
    };

    window.addEventListener('mf_orders_updated', handleLocalUpdate);
    window.addEventListener('storage', handleStorageSync);

    return () => {
      unsub();
      window.removeEventListener('mf_orders_updated', handleLocalUpdate);
      window.removeEventListener('storage', handleStorageSync);
    };
  }, [order?.id, order?.orderNumber]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) {
      setError('Please enter your Order Number.');
      return;
    }
    performTrack(orderNumber);
  };

  const getStatusLabel = (status: OrderStatus) => {
    const map: Record<string, string> = {
      pending: 'Order Placed',
      confirmed: 'Order Confirmed',
      processing: 'Order Processing',
      packed: 'Packed & Ready',
      shipped: 'Out for Delivery',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
      returned: 'Returned',
    };
    return map[status] || status;
  };

  // Derive accurate 8-stage workflow milestones and live updates from order + pipeline state
  const trackingData = useMemo(() => {
    if (!order) return null;
    const wf = getOrderWorkflowStatus(order);
    const dp = order.pipeline?.deliveryProgress || {};
    const stage = wf.stage;
    const isException = stage === 'cancelled' || stage === 'returned';

    const paymentVerifiedDone =
      wf.roleCVerified ||
      order.paymentStatus === 'paid' ||
      stage === 'inventory_packing' ||
      stage === 'delivery_dispatch' ||
      stage === 'cod_reconciliation' ||
      stage === 'completed' ||
      ['confirmed', 'processing', 'packed', 'shipped', 'delivered'].includes(order.orderStatus);

    const orderConfirmedDone =
      wf.roleACompleted ||
      paymentVerifiedDone ||
      ['confirmed', 'processing', 'packed', 'shipped', 'delivered'].includes(order.orderStatus);

    const deliveredDone =
      order.orderStatus === 'delivered' ||
      Boolean(dp.delivered?.completed) ||
      stage === 'cod_reconciliation' ||
      stage === 'completed';

    const outForDeliveryDone = Boolean(dp.outForDelivery?.completed) || deliveredDone;

    const shippedDone =
      Boolean(dp.shipped?.completed) ||
      order.orderStatus === 'shipped' ||
      outForDeliveryDone;

    const courierConfirmedDone =
      Boolean(dp.courierConfirmed?.completed) ||
      shippedDone ||
      Boolean(order.pipeline?.courierName && ['packed', 'shipped', 'delivered'].includes(order.orderStatus));

    const packedDone =
      Boolean(dp.packed?.completed) ||
      ['packed', 'shipped', 'delivered'].includes(order.orderStatus) ||
      courierConfirmedDone ||
      shippedDone;

    const processingStarted =
      wf.roleBStockUpdated ||
      Boolean(dp.packing?.completed) ||
      order.orderStatus === 'processing' ||
      packedDone;

    const processingActive =
      !packedDone &&
      (stage === 'inventory_packing' ||
        stage === 'delivery_dispatch' ||
        order.orderStatus === 'confirmed' ||
        order.orderStatus === 'processing');

    const paymentActive =
      !paymentVerifiedDone && (stage === 'order_verification' || stage === 'payment_verification');

    const inTransitActive =
      !outForDeliveryDone &&
      (shippedDone || courierConfirmedDone || Boolean(dp.trackingAdded?.completed));

    const stages: TrackingStageItem[] = [
      {
        id: 'placed',
        index: '01',
        title: 'Order Placed',
        description: 'We received your order and queued it for review.',
        timestamp: formatDateTimeShort(order.createdAt),
        state: 'completed',
      },
      {
        id: 'payment_verified',
        index: '02',
        title: 'Payment Verified',
        description: paymentVerifiedDone
          ? (order.paymentMethod || 'cod') === 'cod'
            ? order.advanceAmount && order.advanceAmount > 0
              ? 'Advance fee and COD payment details verified.'
              : 'Cash on Delivery payment details verified.'
            : `${(order.paymentMethod || 'Online').toUpperCase()} payment verified.`
          : paymentActive
          ? (order.paymentMethod || 'cod') === 'cod'
            ? 'Checking customer & COD advance details.'
            : 'Verifying your transaction details.'
          : 'Awaiting payment verification.',
        timestamp: paymentVerifiedDone
          ? formatDateTimeShort(order.pipeline?.paymentVerifiedAt || order.pipeline?.verifiedAt)
          : undefined,
        state: paymentVerifiedDone ? 'completed' : paymentActive ? 'current' : 'upcoming',
      },
      {
        id: 'confirmed',
        index: '03',
        title: 'Order Confirmed',
        description: orderConfirmedDone
          ? 'Order approved and scheduled for warehouse preparation.'
          : 'Confirms immediately after verification checks.',
        timestamp: orderConfirmedDone
          ? formatDateTimeShort(order.pipeline?.paymentVerifiedAt || order.pipeline?.verifiedAt)
          : undefined,
        state: orderConfirmedDone ? 'completed' : 'upcoming',
      },
      {
        id: 'processing',
        index: '04',
        title: 'Order Processing',
        description: packedDone
          ? 'Stock verified and garment quality inspection completed.'
          : dp.packing?.completed
          ? 'Quality inspection complete; preparing parcel packaging.'
          : wf.roleBStockUpdated || order.orderStatus === 'processing'
          ? 'Quality inspection and warehouse preparation underway.'
          : processingActive
          ? 'Checking warehouse stock and preparing items.'
          : 'Warehouse inspection and item preparation.',
        timestamp: packedDone || wf.roleBStockUpdated
          ? formatDateTimeShort(
              order.pipeline?.stockApprovedAt ||
                dp.packing?.completedAt ||
                dp.packed?.completedAt ||
                order.pipeline?.packedAt
            )
          : undefined,
        state: packedDone ? 'completed' : processingActive ? 'current' : 'upcoming',
      },
      {
        id: 'packed',
        index: '05',
        title: 'Packed',
        description: packedDone
          ? 'Parcel sealed and labeled for courier dispatch.'
          : dp.packing?.completed
          ? 'Sealing parcel for courier pickup.'
          : 'Awaiting final packaging and seal.',
        timestamp: packedDone
          ? formatDateTimeShort(dp.packed?.completedAt || order.pipeline?.packedAt)
          : undefined,
        state: packedDone ? 'completed' : dp.packing?.completed ? 'current' : 'upcoming',
      },
      {
        id: 'shipped',
        index: '06',
        title: 'Shipped',
        description: outForDeliveryDone
          ? 'Dispatched with courier and reached delivery hub.'
          : shippedDone
          ? 'Parcel shipped and on the way.'
          : courierConfirmedDone
          ? 'Courier confirmed; awaiting dispatch.'
          : 'Courier pickup and live shipment dispatch.',
        timestamp:
          outForDeliveryDone || inTransitActive
            ? formatDateTimeShort(
                dp.shipped?.completedAt ||
                  order.pipeline?.shippedAt ||
                  dp.trackingAdded?.completedAt ||
                  dp.courierConfirmed?.completedAt
              )
            : undefined,
        state: outForDeliveryDone ? 'completed' : inTransitActive ? 'current' : 'upcoming',
      },
      {
        id: 'out_for_delivery',
        index: '07',
        title: 'Out for Delivery',
        description: deliveredDone
          ? 'Rider completed doorstep delivery.'
          : outForDeliveryDone
          ? 'Rider is on the way to your address.'
          : 'Awaiting local rider dispatch.',
        timestamp: outForDeliveryDone
          ? formatDateTimeShort(dp.outForDelivery?.completedAt || dp.delivered?.completedAt)
          : undefined,
        state: deliveredDone ? 'completed' : outForDeliveryDone ? 'current' : 'upcoming',
      },
      {
        id: 'delivered',
        index: '08',
        title: 'Delivered',
        description: deliveredDone
          ? 'Parcel delivered to your shipping address.'
          : 'Awaiting doorstep delivery completion.',
        timestamp: deliveredDone
          ? formatDateTimeShort(dp.delivered?.completedAt || order.pipeline?.deliveredAt || order.updatedAt)
          : undefined,
        state: deliveredDone ? 'completed' : 'upcoming',
      },
    ];

    const completedCount = stages.filter((s) => s.state === 'completed').length;
    const activeStage = stages.find((s) => s.state === 'current') || stages[Math.max(0, completedCount - 1)];

    // Build chronological milestone feed strictly matching Admin Panel steps (newest displayed first)
    const milestones: LiveUpdateItem[] = [];

    const addMilestone = (id: string, title: string, note: string, rawTs: any) => {
      const formattedTs = formatDateTimeShort(rawTs);
      milestones.push({
        id,
        title,
        note,
        timestamp: formattedTs || formatDateTimeShort(order.updatedAt) || 'Just now',
      });
    };

    addMilestone(
      'order_placed',
      'Order Placed',
      `Order ${order.orderNumber} placed via checkout.`,
      order.createdAt
    );

    if (orderConfirmedDone) {
      addMilestone(
        'order_confirmed',
        'Order Confirmed',
        'Customer & order details verified and confirmed.',
        order.pipeline?.verifiedAt ||
          order.pipeline?.initialPaymentVerification?.completedAt ||
          order.pipeline?.paymentVerifiedAt ||
          order.updatedAt
      );
    }

    if (paymentVerifiedDone) {
      addMilestone(
        'payment_verified',
        'Payment Verified',
        (order.paymentMethod || 'cod') === 'cod'
          ? order.advanceAmount && order.advanceAmount > 0
            ? 'Advance payment and Cash on Delivery details verified.'
            : 'Cash on Delivery (COD) payment verified.'
          : `${(order.paymentMethod || 'Online').toUpperCase()} payment verified.`,
        order.pipeline?.paymentVerifiedAt ||
          order.pipeline?.paymentVerification?.verifiedAt ||
          order.pipeline?.verifiedAt ||
          order.updatedAt
      );
    }

    if (processingStarted) {
      addMilestone(
        'order_processing',
        'Order Processing',
        'Warehouse stock verified and updated for dispatch.',
        order.pipeline?.stockApprovedAt ||
          order.pipeline?.stockVerification?.updatedAt ||
          dp.productCheck?.completedAt ||
          dp.packing?.completedAt ||
          order.updatedAt
      );
    }

    if (dp.quantityCheck?.completed) {
      addMilestone(
        'quality_checked',
        'Quality Check Completed',
        'Product, size, colour & quantity verified in warehouse.',
        dp.quantityCheck?.completedAt || dp.packing?.completedAt || order.updatedAt
      );
    }

    if (dp.packing?.completed || packedDone) {
      addMilestone(
        'packing',
        'Packing',
        dp.packing?.note || 'Items are being packed for courier dispatch.',
        dp.packing?.completedAt || dp.packed?.completedAt || order.pipeline?.packedAt || order.updatedAt
      );
    }

    if (packedDone) {
      addMilestone(
        'packed',
        'Packed',
        dp.packed?.note || 'Parcel packed, sealed, and ready for courier handover.',
        dp.packed?.completedAt || order.pipeline?.packedAt || order.updatedAt
      );
    }

    if (courierConfirmedDone) {
      addMilestone(
        'courier_confirmed',
        'Courier Confirmed',
        'Courier partner confirmed for dispatch.',
        dp.courierConfirmed?.completedAt ||
          dp.trackingAdded?.completedAt ||
          dp.shipped?.completedAt ||
          order.updatedAt
      );
    }

    if (shippedDone) {
      addMilestone(
        'shipped',
        'Shipped',
        'Parcel shipped and handed over to courier.',
        dp.shipped?.completedAt || order.pipeline?.shippedAt || order.updatedAt
      );
    }

    if (outForDeliveryDone) {
      addMilestone(
        'out_for_delivery',
        'Out for Delivery',
        'Parcel is out for doorstep delivery.',
        dp.outForDelivery?.completedAt || dp.delivered?.completedAt || order.updatedAt
      );
    }

    if (deliveredDone) {
      addMilestone(
        'delivered',
        'Delivered',
        'Order successfully delivered to customer.',
        dp.delivered?.completedAt || order.pipeline?.deliveredAt || order.updatedAt
      );
    }

    if (isException) {
      const exceptionEntry = [...(order.timeline || [])]
        .reverse()
        .find((t) => t.status === 'cancelled' || t.status === 'returned');
      addMilestone(
        'exception',
        order.orderStatus === 'returned' ? 'Order Returned' : 'Order Cancelled',
        exceptionEntry?.note || `Order marked as ${order.orderStatus}.`,
        exceptionEntry?.timestamp || order.updatedAt
      );
    }

    const liveUpdates = [...milestones].reverse();

    return {
      wf,
      isException,
      stages,
      completedCount,
      activeStage,
      liveUpdates,
    };
  }, [order]);

  const paymentMethodLabel = order
    ? (order.paymentMethod || 'cod') === 'cod'
      ? 'Cash on Delivery'
      : (order.paymentMethod || 'Online').toUpperCase()
    : '';

  const addr = order?.shippingAddress;
  const addressLine = addr
    ? [
        addr.address,
        addr.thana || addr.upazila,
        addr.district,
        addr.division,
        addr.postCode ? `Post ${addr.postCode}` : '',
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <div className="bg-[#FAFAFA] min-h-[75vh] py-10 sm:py-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="mb-7 sm:mb-9">
          <p className="text-xs font-medium text-neutral-500">Order &amp; Shipment Status</p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-900 tracking-tight mt-1">
            Track Your Order
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1.5">
            Follow live payment verification, warehouse processing, and courier delivery updates.
          </p>
        </div>

        {/* Lookup Bar */}
        <div className="bg-white border border-neutral-200/80 rounded-xl p-4 sm:p-6 mb-6">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex-1">
                <FloatingInput
                  label="Order Number"
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. MF-102948"
                  className="font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="h-12 px-7 bg-neutral-900 text-white text-xs font-medium uppercase tracking-wider rounded-[6px] hover:bg-black transition-colors cursor-pointer flex items-center justify-center gap-2 shrink-0 disabled:opacity-60"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{loading ? 'Tracking...' : 'Track Order'}</span>
              </button>
            </div>

            {error && <p className="text-xs text-red-600 pt-1">{error}</p>}
          </form>

          {recentOrders.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-neutral-100 flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-400 mr-1">Recent orders:</span>
              {recentOrders.map((ro, idx) => (
                <React.Fragment key={ro.id}>
                  {idx > 0 && <span className="text-neutral-300 text-xs">·</span>}
                  <button
                    type="button"
                    onClick={() => {
                      setOrderNumber(ro.orderNumber);
                      performTrack(ro.orderNumber, ro.id);
                    }}
                    className={`text-xs font-mono transition-colors cursor-pointer underline-offset-4 ${
                      order?.id === ro.id
                        ? 'text-neutral-900 font-semibold underline'
                        : 'text-neutral-600 hover:text-neutral-900 hover:underline'
                    }`}
                  >
                    {ro.orderNumber}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Pre-Search Guide */}
        {!order && (
          <div className="bg-white border border-neutral-200/80 rounded-xl divide-y divide-neutral-100">
            <div className="p-6 sm:p-8">
              <h2 className="text-base font-semibold text-neutral-900 tracking-tight">
                Live Verification &amp; Delivery Stages
              </h2>
              <p className="text-xs sm:text-sm text-neutral-500 mt-1 leading-relaxed">
                Every order passes through clear verification and quality checks before nationwide dispatch.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-6 border-t border-neutral-100">
                <div>
                  <p className="text-xs font-semibold text-neutral-900">01. Order Placed &amp; Payment Verified</p>
                  <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                    Shipping address and payment or COD advance details are verified immediately.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-900">02. Confirmed &amp; Processing</p>
                  <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                    Your order is confirmed, checked for fabric quality, and carefully packed.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-900 tabular-nums">03. Courier &amp; Doorstep Delivery</p>
                  <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed tabular-nums">
                    Courier tracking updates appear live. Delivery takes 1–2 days in Dhaka and 2–4 days nationwide.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
              <div>
                <h3 className="font-semibold text-neutral-900">Where to find your Order Number</h3>
                <p className="text-neutral-500 mt-1.5 leading-relaxed">
                  Your order number starts with <span className="font-mono text-neutral-800">MF-</span> and is shown on your checkout receipt and Account Order History.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('/account')}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-900 hover:underline cursor-pointer"
                >
                  <span>{currentUser ? 'View Order History' : 'Sign in to view past orders'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <h3 className="font-semibold text-neutral-900">Need help with delivery?</h3>
                <p className="text-neutral-500 mt-1.5 leading-relaxed">
                  Contact our support desk directly for address updates or courier assistance.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  {settings.phone && (
                    <a
                      href={`tel:${settings.phone.replace(/[^+\d]/g, '')}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-900 hover:underline tabular-nums"
                    >
                      <Phone className="w-3.5 h-3.5 text-neutral-500" />
                      <span>{settings.phone}</span>
                    </a>
                  )}
                  {settings.whatsapp && settings.whatsapp.trim() && (
                    <a
                      href={`https://wa.me/${settings.whatsapp.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-900 hover:underline"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-neutral-500" />
                      <span>WhatsApp Support</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active Tracked Order Card */}
        {order && trackingData && (
          <div className="bg-white border border-neutral-200/80 rounded-xl divide-y divide-neutral-100 animate-fade-in">
            {/* Top Summary Header */}
            <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-neutral-500">
                  <span className="font-mono text-sm font-semibold text-neutral-900">
                    {order.orderNumber}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-neutral-900">
                    {trackingData.isException
                      ? getStatusLabel(order.orderStatus)
                      : trackingData.activeStage.title}
                  </span>
                  {formatDate(order.createdAt) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">Placed {formatDate(order.createdAt)}</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-neutral-600 mt-1.5">
                  {order.customerName || 'Customer'}
                  {addr?.district ? `, ${addr.district}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setIsInvoiceOpen(true)}
                  className="px-4 py-2 border border-neutral-300 hover:border-neutral-900 text-neutral-900 text-xs font-medium rounded-md flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-neutral-500" />
                  <span>View Invoice</span>
                </button>
              </div>
            </div>

            {/* 8-Stage Order Progress */}
            <div className="p-5 sm:px-7 sm:py-6">
              {trackingData.isException ? (
                <div className="p-4 bg-red-50/70 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-3">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                  <span>
                    This order is currently marked as <strong>{getStatusLabel(order.orderStatus)}</strong>. Please contact support if you need any assistance.
                  </span>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-sm font-semibold text-neutral-900">
                      Order Progress
                    </h2>
                    <span className="text-xs text-neutral-500 font-mono tabular-nums">
                      {trackingData.completedCount}/{trackingData.stages.length} Completed
                    </span>
                  </div>

                  {/* Clean 8-Stage Progress Rail (Desktop) */}
                  <div className="hidden md:block">
                    <div className="relative pt-1 pb-2">
                      <div className="absolute top-[19px] left-[6.25%] right-[6.25%] h-[1.5px] bg-neutral-200" />
                      <div
                        className="absolute top-[19px] left-[6.25%] h-[1.5px] bg-neutral-900 transition-all duration-300"
                        style={{
                          width: `${
                            (Math.max(0, trackingData.completedCount - 1) /
                              (trackingData.stages.length - 1)) *
                            87.5
                          }%`,
                        }}
                      />
                      <div className="relative grid grid-cols-8 gap-1">
                        {trackingData.stages.map((st) => (
                          <div key={st.id} className="flex flex-col items-center text-center min-w-0">
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                                st.state === 'completed'
                                  ? 'bg-neutral-900 text-white'
                                  : st.state === 'current'
                                  ? 'bg-white border-2 border-neutral-900 text-neutral-900 font-semibold ring-4 ring-neutral-900/10'
                                  : 'bg-white border border-neutral-300 text-neutral-400'
                              }`}
                            >
                              {st.state === 'completed' ? <Check className="w-4 h-4" /> : st.index}
                            </div>
                            <p
                              className={`mt-2.5 text-[10.5px] lg:text-xs leading-tight whitespace-nowrap ${
                                st.state === 'upcoming'
                                  ? 'text-neutral-400 font-normal'
                                  : 'text-neutral-900 font-semibold'
                              }`}
                            >
                              {st.title}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Detailed Vertical Stage Breakdown */}
                  <div className="md:pt-4 md:border-t md:border-neutral-100 divide-y divide-neutral-100">
                    {trackingData.stages.map((st) => (
                      <div
                        key={st.id}
                        className={`py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4 ${
                          st.state === 'current' ? 'bg-neutral-50/80 -mx-3 px-3 rounded-lg' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0 ${
                              st.state === 'completed'
                                ? 'bg-neutral-900 text-white'
                                : st.state === 'current'
                                ? 'border-2 border-neutral-900 text-neutral-900 bg-white'
                                : 'border border-neutral-300 text-neutral-400 bg-white'
                            }`}
                          >
                            {st.state === 'completed' ? <Check className="w-3 h-3" /> : st.index}
                          </div>
                          <div className="min-w-0">
                            <p
                              className={`text-xs ${
                                st.state === 'upcoming'
                                  ? 'text-neutral-400 font-medium'
                                  : 'text-neutral-900 font-semibold'
                              }`}
                            >
                              {st.title}
                            </p>
                            <p
                              className={`text-xs mt-0.5 ${
                                st.state === 'upcoming' ? 'text-neutral-400' : 'text-neutral-500'
                              }`}
                            >
                              {st.description}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[11px] shrink-0 font-mono ${
                            st.state === 'completed'
                              ? 'text-neutral-700 font-medium'
                              : st.state === 'current'
                              ? 'text-neutral-900 font-semibold'
                              : 'text-neutral-400'
                          }`}
                        >
                          {st.state === 'completed'
                            ? 'Completed'
                            : st.state === 'current'
                            ? 'In Progress'
                            : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Shipping & Payment Details */}
            <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
              <div>
                <span className="text-neutral-400 flex items-center gap-1.5 mb-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Delivery Address</span>
                </span>
                <p className="text-neutral-900 font-medium">{addr?.fullName || order.customerName || 'Customer'}</p>
                <p className="text-neutral-600 leading-relaxed mt-0.5">{addressLine || 'Address not provided'}</p>
                <p className="text-neutral-500 mt-0.5 tabular-nums">{order.customerPhone || ''}</p>
              </div>

              <div>
                <span className="text-neutral-400 block mb-1.5">Payment Status</span>
                <p className="text-neutral-900 font-medium">{paymentMethodLabel}</p>
                <p className="text-neutral-600 mt-0.5 capitalize">
                  {order.paymentStatus === 'paid'
                    ? 'Verified & Paid'
                    : trackingData.wf.roleCVerified
                    ? 'Verified (COD Due on Delivery)'
                    : `Status: ${order.paymentStatus || 'pending'}`}
                </p>
                {order.paymentDetails?.transactionId && (
                  <p className="text-neutral-500 mt-0.5 font-mono">
                    TrxID: {order.paymentDetails.transactionId}
                  </p>
                )}
              </div>

              <div className="sm:text-right">
                <span className="text-neutral-400 block mb-1.5">Order Total</span>
                <p className="text-base font-semibold text-neutral-900 tabular-nums font-mono">
                  ৳{(Number(order.total) || 0).toLocaleString('en-BD')}
                </p>
                {order.paymentMethod === 'cod' && order.paymentStatus !== 'paid' && (
                  <p className="text-neutral-500 mt-0.5 tabular-nums">
                    Due on delivery: ৳
                    {(
                      order.dueOnDelivery ??
                      order.dueAmount ??
                      Math.max(0, (Number(order.total) || 0) - (Number(order.advanceAmount) || 0))
                    ).toLocaleString('en-BD')}
                  </p>
                )}
              </div>
            </div>

            {/* Ordered Items */}
            <div className="p-6 sm:p-8">
              <h3 className="text-xs font-semibold text-neutral-900 mb-4">
                Items in Order ({(order.items || []).length})
              </h3>
              <div className="divide-y divide-neutral-100">
                {(order.items || []).map((item, i) => (
                  <div key={i} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <img
                        src={item.productImage || '/assets/aistudio/selvee1_8ff37f5b.jpg'}
                        alt={item.productName || 'Item'}
                        className="w-12 h-12 aspect-square object-cover object-center rounded-md bg-neutral-50 border border-neutral-200/70 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 truncate">{item.productName || 'Item'}</p>
                        <p className="text-neutral-500 mt-0.5">
                          Size {item.size || 'Std'} · {item.color || 'Default'} · Qty {item.quantity || 1}
                        </p>
                      </div>
                    </div>
                    <span className="text-neutral-900 font-medium tabular-nums font-mono shrink-0">
                      ৳{(Number(item.totalPrice) || 0).toLocaleString('en-BD')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Updates Feed */}
            {trackingData.liveUpdates.length > 0 && (
              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <h3 className="text-xs font-semibold text-neutral-900">Live Updates</h3>
                  {trackingData.isException ? (
                    <span className="text-[11px] font-medium text-red-600">
                      {order.orderStatus === 'returned' ? 'Returned' : 'Cancelled'}
                    </span>
                  ) : order.orderStatus === 'delivered' || trackingData.wf.roleDDelivered ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                      <Check className="w-3.5 h-3.5" />
                      <span>Delivered</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Live</span>
                    </span>
                  )}
                </div>

                <div className="relative pl-5 space-y-0">
                  {trackingData.liveUpdates.map((entry, idx) => {
                    const isLatest = idx === 0;
                    const isLast = idx === trackingData.liveUpdates.length - 1;
                    const isCancelledLatest = isLatest && trackingData.isException;
                    return (
                      <div key={entry.id} className={`relative ${isLast ? '' : 'pb-5'}`}>
                        {!isLast && (
                          <span
                            aria-hidden="true"
                            className="absolute left-[-13px] top-3 bottom-0 w-px bg-neutral-200"
                          />
                        )}
                        <span
                          aria-hidden="true"
                          className={`absolute left-[-17px] top-1 w-2.5 h-2.5 rounded-full border-2 ${
                            isCancelledLatest
                              ? 'bg-red-600 border-red-200'
                              : isLatest
                              ? 'bg-neutral-900 border-neutral-300 ring-2 ring-neutral-900/10'
                              : 'bg-white border-neutral-400'
                          }`}
                        />
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 text-xs">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`${
                                  isLatest
                                    ? 'font-semibold text-neutral-900'
                                    : 'font-medium text-neutral-800'
                                }`}
                              >
                                {entry.title}
                              </span>
                              {isLatest && (
                                <span
                                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                    isCancelledLatest
                                      ? 'bg-red-50 text-red-700'
                                      : 'bg-neutral-900 text-white'
                                  }`}
                                >
                                  Latest
                                </span>
                              )}
                            </div>
                            {entry.note && (
                              <p className="text-neutral-500 mt-0.5 leading-relaxed">{entry.note}</p>
                            )}
                          </div>
                          <span className="text-neutral-400 text-[11px] shrink-0 tabular-nums font-mono sm:text-right">
                            {entry.timestamp}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* A4 Invoice Modal */}
      {order && (
        <A4InvoiceModal
          order={order}
          isOpen={isInvoiceOpen}
          onClose={() => setIsInvoiceOpen(false)}
        />
      )}
    </div>
  );
};
