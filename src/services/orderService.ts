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
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CartItem, Order, OrderStatus, PaymentStatus, ShippingAddress } from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';

export const orderService = {
  // Place Order with atomic inventory deduction and server-side price recalculation
  async createOrder(params: {
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    shippingAddress: ShippingAddress;
    items: CartItem[];
    couponCode?: string;
    deliveryZoneId: string;
    paymentMethod: 'cod' | 'bkash' | 'nagad' | 'card';
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
      } = params;

      if (!items || items.length === 0) {
        return { success: false, error: 'Your cart is empty.' };
      }

      // Generate human-readable order number
      const orderNumber = `MF-${Math.floor(100000 + Math.random() * 900000)}`;
      const orderDocRef = doc(collection(db, 'orders'));

      // Use Firestore transaction to verify prices and decrement inventory atomically
      await runTransaction(db, async (transaction) => {
        let calculatedSubtotal = 0;
        const verifiedOrderItems = [];

        // 1. Verify every product & variant from database
        for (const cartItem of items) {
          const productRef = doc(db, 'products', cartItem.productId);
          const productDoc = await transaction.get(productRef);

          if (!productDoc.exists()) {
            throw new Error(`Product "${cartItem.productName}" is no longer available.`);
          }

          const productData = productDoc.data();
          if (!productData.active) {
            throw new Error(`Product "${productData.name}" is currently inactive.`);
          }

          // Determine authoritative unit price
          const unitPrice =
            typeof productData.salePrice === 'number' && productData.salePrice > 0
              ? productData.salePrice
              : productData.price;

          const itemTotal = unitPrice * cartItem.quantity;
          calculatedSubtotal += itemTotal;

          // Check variant stock
          let currentStock = productData.totalStock || 0;
          let variantUpdated = false;

          const updatedVariants = (productData.variants || []).map((variant: any) => {
            if (variant.size === cartItem.size && variant.color === cartItem.color) {
              if (variant.stock < cartItem.quantity) {
                throw new Error(
                  `Insufficient stock for ${productData.name} (${cartItem.size} / ${cartItem.color}). Available: ${variant.stock}`
                );
              }
              variantUpdated = true;
              return { ...variant, stock: variant.stock - cartItem.quantity };
            }
            return variant;
          });

          // Deduct stock
          const newTotalStock = Math.max(0, currentStock - cartItem.quantity);
          transaction.update(productRef, {
            variants: variantUpdated ? updatedVariants : productData.variants || [],
            totalStock: newTotalStock,
            updatedAt: serverTimestamp(),
          });

          verifiedOrderItems.push({
            productId: cartItem.productId,
            productName: productData.name,
            productImage: cartItem.productImage || productData.thumbnail || '',
            size: cartItem.size,
            color: cartItem.color,
            quantity: cartItem.quantity,
            unitPrice,
            totalPrice: itemTotal,
            sku: cartItem.sku || productData.sku || '',
          });
        }

        // 2. Validate coupon if provided
        let calculatedDiscount = 0;
        if (couponCode) {
          const couponQuery = query(
            collection(db, 'coupons'),
            where('code', '==', couponCode.toUpperCase().trim()),
            where('active', '==', true),
            limit(1)
          );
          const couponSnap = await getDocs(couponQuery);
          if (!couponSnap.empty) {
            const couponData = couponSnap.docs[0].data();
            if (calculatedSubtotal >= (couponData.minOrderAmount || 0)) {
              if (couponData.discountType === 'percentage') {
                const perc = Math.round((calculatedSubtotal * couponData.discountAmount) / 100);
                calculatedDiscount = couponData.maxDiscount ? Math.min(perc, couponData.maxDiscount) : perc;
              } else {
                calculatedDiscount = Math.min(couponData.discountAmount, calculatedSubtotal);
              }

              // Increment coupon usage
              const couponRef = doc(db, 'coupons', couponSnap.docs[0].id);
              transaction.update(couponRef, {
                usedCount: (couponData.usedCount || 0) + 1,
              });
            }
          }
        }

        // 3. Authoritative delivery charge calculation
        let deliveryCharge = 70; // Inside Dhaka default
        let deliveryZoneName = 'Inside Dhaka City';
        if (deliveryZoneId === 'outside-dhaka') {
          deliveryCharge = 130;
          deliveryZoneName = 'Outside Dhaka (Nationwide)';
        }

        const grandTotal = Math.max(0, calculatedSubtotal - calculatedDiscount + deliveryCharge);

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
          couponCode: couponCode || '',
          deliveryCharge,
          deliveryZone: deliveryZoneName,
          total: grandTotal,
          paymentMethod,
          paymentStatus: 'pending',
          orderStatus: 'pending',
          timeline: [
            {
              status: 'pending',
              timestamp: new Date().toISOString(),
              note: 'Order placed by customer via Cash on Delivery.',
            },
          ],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const sanitizedOrder = sanitizeForFirestore(newOrder);
        transaction.set(orderDocRef, sanitizedOrder);
      });

      return {
        success: true,
        orderId: orderDocRef.id,
        orderNumber,
      };
    } catch (err: any) {
      console.error('Order creation error:', err);
      return {
        success: false,
        error: err.message || 'Failed to place order. Please check stock and try again.',
      };
    }
  },

  // Customer order history
  async getCustomerOrders(customerId: string): Promise<Order[]> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('customerId', '==', customerId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const orders: Order[] = [];
      snap.forEach((d) => orders.push({ id: d.id, ...d.data() } as Order));
      return orders;
    } catch (e) {
      console.warn('Customer orders fetch error:', e);
      return [];
    }
  },

  // Get order by ID
  async getOrderById(id: string): Promise<Order | null> {
    try {
      const snap = await getDoc(doc(db, 'orders', id));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as Order;
      }
      return null;
    } catch (e) {
      console.warn('Order fetch error:', e);
      return null;
    }
  },

  // Track order by Order Number and Phone
  async trackOrder(orderNumber: string, phone: string): Promise<Order | null> {
    try {
      const cleanPhone = phone.trim().replace(/[^0-9]/g, '');
      const cleanOrderNumber = orderNumber.trim().toUpperCase();

      const q = query(
        collection(db, 'orders'),
        where('orderNumber', '==', cleanOrderNumber),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;

      const orderData = { id: snap.docs[0].id, ...snap.docs[0].data() } as Order;
      const orderPhoneClean = orderData.customerPhone.replace(/[^0-9]/g, '');

      // Verify that phone number suffix or full match validates
      if (
        orderPhoneClean.includes(cleanPhone) ||
        cleanPhone.includes(orderPhoneClean) ||
        orderPhoneClean.slice(-8) === cleanPhone.slice(-8)
      ) {
        return orderData;
      }
      return null;
    } catch (e) {
      console.warn('Track order error:', e);
      return null;
    }
  },

  // Admin: Get all orders
  async getAllOrdersAdmin(status?: string): Promise<Order[]> {
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
      const orders: Order[] = [];
      snap.forEach((d) => orders.push({ id: d.id, ...d.data() } as Order));
      return orders;
    } catch (e) {
      console.warn('Admin orders error:', e);
      return [];
    }
  },

  // Admin: Update order status
  async updateOrderStatus(orderId: string, status: OrderStatus, note?: string) {
    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) throw new Error('Order not found');

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
  },

  // Admin: Update payment status
  async updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus) {
    await updateDoc(doc(db, 'orders', orderId), {
      paymentStatus,
      updatedAt: serverTimestamp(),
    });
  },
};
