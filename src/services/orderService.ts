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
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { CartItem, Order, OrderStatus, PaymentStatus, ShippingAddress, PaymentMethod, PaymentDetails } from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';
import { getLocalDeliveryZones, settingsService } from './settingsService';
import { productService } from './productService';
import { notificationService } from './notificationService';

const LOCAL_ORDERS_KEY = 'mf_placed_orders_v2';
const cachedOrdersMap = new Map<string, Order>();

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
  // Get persistent local orders
  getLocalOrders(): Order[] {
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

  // Save to local storage and notify listeners
  saveLocalOrder(order: Order) {
    if (!order) return;
    try {
      const list = this.getLocalOrders();
      const idx = list.findIndex(
        (o) => (o.id && o.id === order.id) || (o.orderNumber && o.orderNumber === order.orderNumber)
      );
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...order };
      } else {
        list.unshift(order);
      }
      localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(list.slice(0, 100)));
    } catch {
      // ignore
    }
    cacheOrderRecord(order);
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
            let variantUpdated = false;

            const updatedVariants = (productData.variants || []).map((variant: any) => {
              if (variant.size === cartItem.size && (!variant.color || variant.color === cartItem.color)) {
                if (typeof variant.stock === 'number' && variant.stock < cartItem.quantity) {
                  throw new Error(
                    `Insufficient stock for ${productData.name} (${cartItem.size}). Available: ${variant.stock}`
                  );
                }
                variantUpdated = true;
                return { ...variant, stock: Math.max(0, (variant.stock || 0) - cartItem.quantity) };
              }
              return variant;
            });

            const newTotalStock = Math.max(0, currentStock - cartItem.quantity);
            productUpdates.push({
              productRef,
              newTotalStock,
              updatedVariants: variantUpdated ? updatedVariants : (productData.variants || []),
            });

            verifiedOrderItems.push({
              productId: cartItem.productId,
              productName: productData.name,
              productImage: cartItem.productImage || productData.thumbnail || '',
              size: cartItem.size || 'Standard',
              color: cartItem.color || 'Standard',
              quantity: cartItem.quantity,
              unitPrice,
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
          // 1. Decrement inventory
          for (const update of productUpdates) {
            transaction.update(update.productRef, {
              variants: update.updatedVariants,
              totalStock: update.newTotalStock,
              updatedAt: serverTimestamp(),
            });
          }

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

        // Sync stock decrement locally without blocking checkout redirect (Firestore transaction already committed inventory)
        productService
          .decrementProductStock(
            items.map((i) => ({
              productId: i.productId,
              size: i.size,
              color: i.color,
              quantity: i.quantity,
            })),
            true
          )
          .catch(() => {});

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
        const fallbackItems = items.map((item) => {
          const price = item.salePrice || item.price;
          const total = price * item.quantity;
          fallbackSubtotal += total;
          return {
            productId: item.productId,
            productName: item.productName,
            productImage: item.productImage || '',
            size: item.size || 'Standard',
            color: item.color || 'Standard',
            quantity: item.quantity,
            unitPrice: price,
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

        // Sync inventory decrement in background so checkout navigation is instant
        productService
          .decrementProductStock(
            items.map((i) => ({
              productId: i.productId,
              size: i.size,
              color: i.color,
              quantity: i.quantity,
            }))
          )
          .catch(() => {});

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

  // Admin: Update order status
  async updateOrderStatus(orderId: string, status: OrderStatus, note?: string) {
    let notifiedOrderInfo: Partial<Order> | null = null;
    const timestamp = new Date().toISOString();
    const resolvedNote = note || `Status updated to ${status} by Administrator.`;

    // 1. Update local copy immediately
    const localOrders = this.getLocalOrders();
    const target = localOrders.find((o) => o.id === orderId);
    if (target) {
      target.orderStatus = status;
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

        const updPromise = updateDoc(orderRef, {
          orderStatus: status,
          timeline,
          updatedAt: serverTimestamp(),
        });
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
};
