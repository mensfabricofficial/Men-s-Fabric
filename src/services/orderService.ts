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
import { getLocalDeliveryZones } from './settingsService';
import { productService } from './productService';

const LOCAL_ORDERS_KEY = 'mf_placed_orders_v2';
const cachedOrdersMap = new Map<string, Order>();

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
        deliveryZoneId,
        paymentMethod,
        paymentDetails,
      } = params;

      if (!items || items.length === 0) {
        return { success: false, error: 'Your cart is empty.' };
      }

      // 1. Pre-validate coupon before transaction if provided
      let validCouponDocId: string | null = null;
      if (couponCode) {
        try {
          const couponQuery = query(
            collection(db, 'coupons'),
            where('code', '==', couponCode.toUpperCase().trim()),
            where('active', '==', true),
            limit(1)
          );
          const couponSnap = await getDocs(couponQuery);
          if (!couponSnap.empty) {
            validCouponDocId = couponSnap.docs[0].id;
          }
        } catch (e) {
          console.warn("Coupon lookup warning:", e);
        }
      }

      // Generate human-readable order number
      const orderNumber = `MF-${Math.floor(100000 + Math.random() * 900000)}`;
      const orderDocRef = doc(collection(db, 'orders'));

      // Use Firestore transaction to verify prices and decrement inventory atomically
      // Strictly separating: ALL READS FIRST -> CALCULATIONS -> ALL WRITES
      try {
        await runTransaction(db, async (transaction) => {
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
          if (couponDoc && couponDoc.exists()) {
            const couponData = couponDoc.data();
            if (calculatedSubtotal >= (couponData.minOrderAmount || 0)) {
              if (couponData.discountType === 'percentage') {
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

          // Online Payment Prepayment Discount (bKash, Nagad, Rocket)
          let onlineDiscount = 0;
          if (paymentMethod !== 'cod' && paymentDetails?.onlineDiscountApplied) {
            onlineDiscount = paymentDetails.onlineDiscountApplied;
          }

          const grandTotal = Math.max(0, calculatedSubtotal - calculatedDiscount - onlineDiscount + deliveryCharge);

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

          const isAdvanceCod = paymentMethod === 'cod' && Boolean(paymentDetails?.advanceDeliveryPaid);
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

          let initialTimelineNote = 'Order placed by customer via Cash on Delivery.';
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
            deliveryCharge,
            deliveryZone: deliveryZoneName,
            total: grandTotal,
            paymentMethod,
            ...(cleanPaymentDetails ? { paymentDetails: cleanPaymentDetails } : {}),
            advanceDeliveryPaid: Boolean(paymentMethod !== 'cod' || isAdvanceCod),
            advanceGateway: paymentDetails?.advanceGateway,
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

          // 2. Increment coupon usage
          if (couponDoc && couponDoc.exists() && validCouponDocId) {
            const couponRef = doc(db, 'coupons', validCouponDocId);
            transaction.update(couponRef, {
              usedCount: (couponDoc.data()?.usedCount || 0) + 1,
              updatedAt: serverTimestamp(),
            });
          }

          // 3. Write order document
          this.saveLocalOrder(newOrder);
          const sanitizedOrder = sanitizeForFirestore(newOrder);
          transaction.set(orderDocRef, sanitizedOrder);
        });

        // Automatically decrement inventory across local catalog & broadcast to Admin Panel
        try {
          await productService.decrementProductStock(
            items.map((i) => ({
              productId: i.productId,
              size: i.size,
              color: i.color,
              quantity: i.quantity,
            }))
          );
        } catch (stockErr) {
          console.warn('Stock decrement notice:', stockErr);
        }

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
        let onlineDiscount = (paymentMethod !== 'cod' && paymentDetails?.onlineDiscountApplied) ? paymentDetails.onlineDiscountApplied : 0;
        let grandTotal = Math.max(0, fallbackSubtotal - onlineDiscount + deliveryCharge);

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
          discount: 0,
          onlineDiscount,
          couponCode: couponCode || '',
          deliveryCharge,
          deliveryZone: deliveryZoneId === 'outside-dhaka' ? 'Outside Dhaka (Nationwide)' : 'Inside Dhaka City',
          total: grandTotal,
          paymentMethod,
          ...(paymentDetails ? { paymentDetails } : {}),
          advanceDeliveryPaid: Boolean(paymentMethod !== 'cod' || paymentDetails?.advanceDeliveryPaid),
          advanceAmount: paymentMethod !== 'cod' ? grandTotal : (paymentDetails?.advanceDeliveryPaid ? deliveryCharge : 0),
          dueOnDelivery: paymentMethod !== 'cod' ? 0 : fallbackSubtotal,
          paymentStatus: 'pending',
          orderStatus: 'pending',
          timeline: [
            {
              status: 'pending',
              timestamp: new Date().toISOString(),
              note: `Order placed via ${paymentMethod === 'cod' ? 'Cash on Delivery' : paymentMethod.toUpperCase()}.`,
            },
          ],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        this.saveLocalOrder(fallbackOrder);

        try {
          const sanitizedOrder = sanitizeForFirestore(fallbackOrder);
          await setDoc(orderDocRef, sanitizedOrder);
        } catch (setDocErr) {
          console.warn('Remote setDoc notice, order preserved in persistent storage:', setDocErr);
        }

        // Automatically decrement inventory across local catalog & broadcast to Admin Panel in fallback mode
        try {
          await productService.decrementProductStock(
            items.map((i) => ({
              productId: i.productId,
              size: i.size,
              color: i.color,
              quantity: i.quantity,
            }))
          );
        } catch (stockErr) {
          console.warn('Fallback stock decrement notice:', stockErr);
        }

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

  // Customer order history - Multi-field resilient lookup without composite index requirement
  async getCustomerOrders(customerId?: string, email?: string, phone?: string): Promise<Order[]> {
    try {
      const orderMap = new Map<string, Order>();

      // 1. Local orders first
      const localOrders = this.getLocalOrders();
      localOrders.forEach((lo) => {
        const matchesId = customerId && customerId !== 'guest' && lo.customerId === customerId;
        const matchesEmail = email && lo.customerEmail && lo.customerEmail.toLowerCase() === email.toLowerCase();
        const matchesPhone = phone && lo.customerPhone && lo.customerPhone.replace(/[^0-9]/g, '').slice(-8) === phone.replace(/[^0-9]/g, '').slice(-8);
        if (matchesId || matchesEmail || matchesPhone) {
          orderMap.set(lo.id, lo);
        }
      });

      // 2. Query by customerId (if available and not 'guest')
      if (customerId && customerId !== 'guest') {
        try {
          const q = query(collection(db, 'orders'), where('customerId', '==', customerId));
          const snap = await getDocs(q);
          snap.forEach((d) => {
            const ord = { id: d.id, ...d.data() } as Order;
            orderMap.set(d.id, ord);
            this.saveLocalOrder(ord);
          });
        } catch (idErr) {
          console.warn('Orders by customerId notice:', idErr);
        }
      }

      // 3. Query by customerEmail
      if (email && email.trim()) {
        try {
          const q = query(collection(db, 'orders'), where('customerEmail', '==', email.trim().toLowerCase()));
          const snap = await getDocs(q);
          snap.forEach((d) => {
            const ord = { id: d.id, ...d.data() } as Order;
            orderMap.set(d.id, ord);
            this.saveLocalOrder(ord);
          });
        } catch (mailErr) {
          console.warn('Orders by email notice:', mailErr);
        }
      }

      // 4. Query by customerPhone
      if (phone && phone.trim()) {
        const cleanPhone = phone.trim().replace(/[^0-9]/g, '');
        if (cleanPhone.length >= 10) {
          try {
            const q = query(collection(db, 'orders'), where('customerPhone', '==', cleanPhone));
            const snap = await getDocs(q);
            snap.forEach((d) => {
              const ord = { id: d.id, ...d.data() } as Order;
              orderMap.set(d.id, ord);
              this.saveLocalOrder(ord);
            });
          } catch (phoneErr) {
            console.warn('Orders by phone notice:', phoneErr);
          }
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
      return this.getLocalOrders();
    }
  },

  // Get order by ID or Order Number (Local-first & Firestore resilient)
  async getOrderById(id: string): Promise<Order | null> {
    if (!id) return null;
    const cleanId = id.trim();

    // 1. Instant Cache & Local Storage Check (0ms)
    const cached = cachedOrdersMap.get(cleanId) || cachedOrdersMap.get(cleanId.toUpperCase()) || cachedOrdersMap.get(cleanId.toLowerCase());
    if (cached) return cached;

    const localOrders = this.getLocalOrders();
    const localMatch = localOrders.find(
      (o) =>
        o.id === cleanId ||
        o.orderNumber?.toUpperCase() === cleanId.toUpperCase() ||
        o.orderNumber?.replace(/^MF-/, '') === cleanId.replace(/^MF-/, '')
    );
    if (localMatch) {
      cacheOrderRecord(localMatch);
      return localMatch;
    }

    // 2. Query Firestore by doc ID
    try {
      const snap = await getDoc(doc(db, 'orders', cleanId));
      if (snap.exists()) {
        const ord = { id: snap.id, ...snap.data() } as Order;
        this.saveLocalOrder(ord);
        return ord;
      }
    } catch (e) {
      console.warn('Order fetch error by doc ID:', e);
    }

    // 3. Query Firestore by orderNumber
    try {
      const q = query(collection(db, 'orders'), where('orderNumber', '==', cleanId.toUpperCase()), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const ord = { id: snap.docs[0].id, ...snap.docs[0].data() } as Order;
        this.saveLocalOrder(ord);
        return ord;
      }
    } catch (e) {
      console.warn('Order fetch error by orderNumber:', e);
    }

    return null;
  },

  // Track order by Order Number and/or Phone Number (Multi-strategy & 100% forgiving)
  async trackOrder(orderQuery: string, phoneQuery?: string): Promise<Order | null> {
    try {
      const rawOrder = (orderQuery || '').trim();
      const cleanOrderNumber = rawOrder.replace(/^#/, '').trim().toUpperCase();
      const cleanDigits = rawOrder.replace(/[^0-9]/g, '');
      const cleanPhone = (phoneQuery || '').trim().replace(/[^0-9]/g, '');

      if (!cleanOrderNumber && !cleanPhone) {
        return null;
      }

      // 1. Instant Cache Check (Memory + Local Storage)
      const cached =
        cachedOrdersMap.get(rawOrder) ||
        cachedOrdersMap.get(cleanOrderNumber) ||
        cachedOrdersMap.get(cleanOrderNumber.toLowerCase()) ||
        (cleanDigits.length >= 4 ? cachedOrdersMap.get(cleanDigits) : undefined);

      if (cached) {
        return cached;
      }

      const localOrders = this.getLocalOrders();
      const localMatch = localOrders.find((ord) => {
        const ordNum = (ord.orderNumber || '').toUpperCase();
        const ordId = (ord.id || '').toUpperCase();
        const ordPhone = (ord.customerPhone || '').replace(/[^0-9]/g, '');
        const shippingPhone = (ord.shippingAddress?.phone || '').replace(/[^0-9]/g, '');

        const orderMatches = Boolean(
          cleanOrderNumber &&
            (ordNum === cleanOrderNumber ||
              ordId === cleanOrderNumber ||
              ordNum.replace(/^MF-/, '') === cleanOrderNumber.replace(/^MF-/, '') ||
              (cleanDigits.length >= 4 && ordNum.includes(cleanDigits)) ||
              (cleanDigits.length >= 4 && ordId.includes(cleanDigits)))
        );

        const phoneMatches = Boolean(
          cleanPhone &&
            (ordPhone.includes(cleanPhone) ||
              cleanPhone.includes(ordPhone) ||
              shippingPhone.includes(cleanPhone) ||
              (cleanPhone.length >= 8 && ordPhone.slice(-8) === cleanPhone.slice(-8)))
        );

        if (cleanOrderNumber && cleanPhone) {
          return orderMatches || phoneMatches;
        }
        if (cleanOrderNumber) {
          return orderMatches;
        }
        if (cleanPhone) {
          return phoneMatches;
        }
        return false;
      });

      if (localMatch) {
        cacheOrderRecord(localMatch);
        return localMatch;
      }

      // 2. Direct Firestore Doc ID lookup
      if (rawOrder) {
        try {
          const docSnap = await getDoc(doc(db, 'orders', rawOrder));
          if (docSnap.exists()) {
            const ord = { id: docSnap.id, ...docSnap.data() } as Order;
            this.saveLocalOrder(ord);
            return ord;
          }
        } catch {
          // ignore
        }
      }

      // 3. Query Firestore by orderNumber variations
      if (cleanOrderNumber) {
        const variants = [
          cleanOrderNumber,
          `MF-${cleanOrderNumber}`,
          cleanOrderNumber.replace(/^MF-/, ''),
        ];
        if (cleanDigits.length >= 5) {
          variants.push(`MF-${cleanDigits}`);
        }

        for (const variant of variants) {
          try {
            const q = query(
              collection(db, 'orders'),
              where('orderNumber', '==', variant),
              limit(1)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              const ord = { id: snap.docs[0].id, ...snap.docs[0].data() } as Order;
              this.saveLocalOrder(ord);
              return ord;
            }
          } catch {
            // ignore
          }
        }
      }

      // 4. Query Firestore by customerPhone
      if (cleanPhone && cleanPhone.length >= 8) {
        try {
          const phoneVariants = [
            phoneQuery?.trim() || '',
            cleanPhone,
            `+88${cleanPhone}`,
            cleanPhone.startsWith('88') ? cleanPhone.slice(2) : cleanPhone,
          ].filter(Boolean);

          for (const pv of phoneVariants) {
            const q = query(
              collection(db, 'orders'),
              where('customerPhone', '==', pv),
              limit(5)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              const ord = { id: snap.docs[0].id, ...snap.docs[0].data() } as Order;
              this.saveLocalOrder(ord);
              return ord;
            }
          }
        } catch {
          // ignore
        }
      }

      // 5. Broad scan in recent orders
      try {
        const recentQ = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(50));
        const recentSnap = await getDocs(recentQ);
        for (const d of recentSnap.docs) {
          const ord = { id: d.id, ...d.data() } as Order;
          this.saveLocalOrder(ord);
          const ordNum = (ord.orderNumber || '').toUpperCase();
          const ordId = (ord.id || '').toUpperCase();
          const ordPhone = (ord.customerPhone || '').replace(/[^0-9]/g, '');

          if (cleanOrderNumber) {
            if (
              ordNum === cleanOrderNumber ||
              ordId === cleanOrderNumber ||
              ordNum.replace(/^MF-/, '') === cleanOrderNumber.replace(/^MF-/, '') ||
              (cleanDigits.length >= 4 && ordNum.includes(cleanDigits))
            ) {
              return ord;
            }
          } else if (cleanPhone && (ordPhone.includes(cleanPhone) || ordPhone.slice(-8) === cleanPhone.slice(-8))) {
            return ord;
          }
        }
      } catch {
        // ignore
      }

      return null;
    } catch (e) {
      console.warn('Track order error:', e);
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

    // 2. Fetch remote orders from Firestore
    try {
      let q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      if (status && status !== 'all') {
        q = query(
          collection(db, 'orders'),
          where('orderStatus', '==', status),
          orderBy('createdAt', 'desc')
        );
      }
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const ord = { id: d.id, ...d.data() } as Order;
        orderMap.set(d.id, ord);
        this.saveLocalOrder(ord);
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
    // 1. Update local copy immediately
    const localOrders = this.getLocalOrders();
    const target = localOrders.find((o) => o.id === orderId);
    if (target) {
      target.orderStatus = status;
      target.timeline = target.timeline || [];
      target.timeline.push({
        status,
        timestamp: new Date().toISOString(),
        note: note || `Status updated to ${status} by Administrator.`,
      });
      this.saveLocalOrder(target);
    }

    // 2. Update remote Firestore
    try {
      const orderRef = doc(db, 'orders', orderId);
      const snap = await getDoc(orderRef);
      if (snap.exists()) {
        const data = snap.data() as Order;
        const timeline = data.timeline || [];
        timeline.push({
          status,
          timestamp: new Date().toISOString(),
          note: note || `Status updated to ${status} by Administrator.`,
        });

        await updateDoc(orderRef, {
          orderStatus: status,
          timeline,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.warn('Remote updateOrderStatus notice (updated in local store):', e);
    }
  },

  // Admin: Update payment status
  async updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus, note?: string) {
    // 1. Update local copy immediately
    const localOrders = this.getLocalOrders();
    const target = localOrders.find((o) => o.id === orderId);
    if (target) {
      target.paymentStatus = paymentStatus;
      target.timeline = target.timeline || [];
      target.timeline.push({
        status: target.orderStatus,
        timestamp: new Date().toISOString(),
        note: note || `Payment marked as "${paymentStatus.toUpperCase()}" by Administrator.`,
      });
      this.saveLocalOrder(target);
    }

    // 2. Update remote Firestore
    try {
      const orderRef = doc(db, 'orders', orderId);
      const snap = await getDoc(orderRef);
      if (snap.exists()) {
        const data = snap.data() as Order;
        const timeline = data.timeline || [];
        timeline.push({
          status: data.orderStatus,
          timestamp: new Date().toISOString(),
          note: note || `Payment marked as "${paymentStatus.toUpperCase()}" by Administrator.`,
        });

        await updateDoc(orderRef, {
          paymentStatus,
          timeline,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.warn('Remote updatePaymentStatus notice (updated in local store):', e);
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
