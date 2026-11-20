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
} from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';
import { getLocalDeliveryZones, settingsService } from './settingsService';
import { productService } from './productService';
import { notificationService } from './notificationService';

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
  try {
    localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {
    // ignore quota
  }
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
            const maxWidth = 900;
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
            const compressed = canvas.toDataURL('image/jpeg', 0.8);
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

  // Derive the effective 4-stage workflow position for both new and legacy orders
  getOrderPipelineStage(ord: Order): OrderPipelineStage {
    if (ord.orderStatus === 'returned') {
      return 'returned';
    }
    if (ord.orderStatus === 'cancelled') {
      return 'cancelled';
    }
    if (ord.orderStatus === 'delivered' || ord.orderChannel === 'pos') {
      return 'completed';
    }
    if (ord.pipeline?.currentStage) {
      return ord.pipeline.currentStage;
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

    const updatedPipeline: OrderPipelineData = {
      ...existingPipeline,
      currentStage: resolvedNextStage,
      subStatus: resolvedSubStatus,
      stockDeducted: stockDeductedFlag,
      stockDeductedAt: stockDeductedAtFlag,
      stockDeductedBy: stockDeductedByFlag,
      stockRestored: stockRestoredFlag,
      stockRestoredAt: stockRestoredAtFlag,
      handoffHistory: nextHistory,
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
      upd.catch(() => {});
      await withTimeout(upd, 2500, 'Pipeline sync queued');
    } catch {
      // background queued
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
          actionUrl: '/admin?tab=orders',
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
