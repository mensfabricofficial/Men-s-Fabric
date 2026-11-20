import React, { createContext, useContext, useEffect, useState } from 'react';
import { CartItem, Coupon, DeliveryZone } from '../types';
import { settingsService } from '../services/settingsService';
import { orderService } from '../services/orderService';
import { useAuth } from './AuthContext';

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, size: string, color: string) => void;
  updateQuantity: (productId: string, size: string, color: string, deltaOrValue: number, isAbsolute?: boolean) => void;
  clearCart: () => void;
  coupons: Coupon[];
  appliedCoupon: Coupon | null;
  applyCoupon: (coupon: Coupon) => { success: boolean; message: string };
  removeCoupon: () => void;
  deliveryZones: DeliveryZone[];
  selectedZone: DeliveryZone | null;
  setSelectedZone: (zone: DeliveryZone) => void;
  subtotal: number;
  discount: number;
  baseDeliveryCharge: number;
  deliveryCharge: number;
  isFreeDelivery: boolean;
  activeFreeDeliveryCoupon: Coupon | null;
  grandTotal: number;
  totalItems: number;
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, customerProfile } = useAuth();

  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('mf_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(() => {
    try {
      const saved = localStorage.getItem('mf_coupon');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [coupons, setCoupons] = useState<Coupon[]>(() => settingsService.getInstantCoupons());
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>(() =>
    settingsService.getInstantDeliveryZones()
  );
  const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(() => {
    const initial = settingsService.getInstantDeliveryZones();
    return initial[0] || null;
  });
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [orderConsumedCodes, setOrderConsumedCodes] = useState<string[]>([]);

  // Real-time synchronization of coupons (for auto free delivery & one-time voucher checks)
  useEffect(() => {
    const unsub = settingsService.subscribeToCoupons((list) => {
      setCoupons(list);
    });
    return () => unsub();
  }, []);

  // Track coupons already used in non-cancelled orders so 1-time Free Delivery never returns
  useEffect(() => {
    let active = true;
    const collectFromInstant = () => {
      const codes = orderService
        .getInstantOrders()
        .filter((o) => o.orderStatus !== 'cancelled' && o.couponCode)
        .map((o) => o.couponCode!.trim().toUpperCase());
      if (active) setOrderConsumedCodes(Array.from(new Set(codes)));
    };
    collectFromInstant();

    const syncRemoteOrders = async () => {
      if (!currentUser?.uid) return;
      try {
        const remoteOrders = await orderService.getCustomerOrders(
          currentUser.uid,
          currentUser.email || undefined,
          customerProfile?.phone || undefined
        );
        if (!active) return;
        const instantCodes = orderService
          .getInstantOrders()
          .filter((o) => o.orderStatus !== 'cancelled' && o.couponCode)
          .map((o) => o.couponCode!.trim().toUpperCase());
        const remoteCodes = remoteOrders
          .filter((o) => o.orderStatus !== 'cancelled' && o.couponCode)
          .map((o) => o.couponCode!.trim().toUpperCase());
        setOrderConsumedCodes(Array.from(new Set([...instantCodes, ...remoteCodes])));
      } catch {
        // ignore
      }
    };
    syncRemoteOrders();

    const onOrdersUpdated = () => collectFromInstant();
    window.addEventListener('mf_orders_updated', onOrdersUpdated);
    return () => {
      active = false;
      window.removeEventListener('mf_orders_updated', onOrdersUpdated);
    };
  }, [currentUser?.uid, currentUser?.email, customerProfile?.phone]);

  const consumedCouponTokens = React.useMemo(() => {
    const set = new Set<string>();
    (customerProfile?.consumedCoupons || []).forEach((t) => {
      if (t) set.add(t.trim().toUpperCase());
    });
    orderConsumedCodes.forEach((code) => {
      const matched = coupons.find((c) => c.code.toUpperCase() === code);
      // Mark consumed if free_delivery or 1-time voucher
      if (!matched || matched.discountType === 'free_delivery' || (matched.usageLimit || 0) <= 1) {
        set.add(code);
        if (matched?.id) set.add(matched.id.trim().toUpperCase());
      }
    });
    return set;
  }, [customerProfile?.consumedCoupons, orderConsumedCodes, coupons]);

  // Automatically invalidate stored appliedCoupon if exhausted/disabled/consumed or belongs to another user
  useEffect(() => {
    if (!appliedCoupon) return;
    const latest = coupons.find((c) => c.id === appliedCoupon.id || c.code === appliedCoupon.code);
    const identity = {
      uid: currentUser?.uid,
      email: currentUser?.email,
      phone: customerProfile?.phone,
    };
    const targetCoupon = latest || appliedCoupon;
    if (
      !settingsService.isCouponValidForUse(targetCoupon, consumedCouponTokens) ||
      !settingsService.doesCouponMatchCustomer(targetCoupon, identity)
    ) {
      setAppliedCoupon(null);
    }
  }, [coupons, appliedCoupon, consumedCouponTokens, currentUser?.uid, currentUser?.email, customerProfile?.phone]);

  // Single-source real-time synchronization of delivery zones via settingsService
  useEffect(() => {
    const unsub = settingsService.subscribeToDeliveryZones((zones) => {
      const activeZones = zones.filter((z) => z.active !== false);
      const list = activeZones.length > 0 ? activeZones : zones;
      setDeliveryZones(list);
      setSelectedZone((prev) => {
        if (!prev) return list[0] || null;
        const match = list.find((z) => z.id === prev.id);
        return match || list[0] || null;
      });
    });

    return () => unsub();
  }, []);

  // Save cart to local storage
  useEffect(() => {
    try {
      localStorage.setItem('mf_cart', JSON.stringify(items));
    } catch (e) {
      console.error(e);
    }
  }, [items]);

  useEffect(() => {
    try {
      if (appliedCoupon) {
        localStorage.setItem('mf_coupon', JSON.stringify(appliedCoupon));
      } else {
        localStorage.removeItem('mf_coupon');
      }
    } catch (e) {
      console.error(e);
    }
  }, [appliedCoupon]);

  const addItem = (newItem: CartItem) => {
    setItems((prev) => {
      const index = prev.findIndex(
        (i) => i.productId === newItem.productId && i.size === newItem.size && i.color === newItem.color
      );
      if (index > -1) {
        const updated = [...prev];
        const existing = updated[index];
        const newQty = Math.min(existing.quantity + newItem.quantity, newItem.availableStock || 999);
        updated[index] = { ...existing, quantity: newQty };
        return updated;
      }
      return [...prev, newItem];
    });
    setIsCartDrawerOpen(true);
  };

  const removeItem = (productId: string, size: string, color: string) => {
    setItems((prev) =>
      prev.filter((i) => !(i.productId === productId && i.size === size && i.color === color))
    );
  };

  const updateQuantity = (
    productId: string,
    size: string,
    color: string,
    deltaOrValue: number,
    isAbsolute = false
  ) => {
    setItems((prev) =>
      prev
        .map((i) => {
          if (i.productId === productId && i.size === size && i.color === color) {
            const newQty = isAbsolute ? deltaOrValue : i.quantity + deltaOrValue;
            if (newQty <= 0) return null;
            return { ...i, quantity: Math.min(newQty, i.availableStock || 999) };
          }
          return i;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const clearCart = () => {
    setItems([]);
    setAppliedCoupon(null);
  };

  const subtotal = items.reduce((sum, item) => {
    const itemPrice = typeof item.salePrice === 'number' && item.salePrice > 0 ? item.salePrice : item.price;
    return sum + itemPrice * item.quantity;
  }, 0);

  const userIdentity = {
    uid: currentUser?.uid,
    email: currentUser?.email,
    phone: customerProfile?.phone,
  };

  // Validate and calculate coupon discount safely
  let discount = 0;
  if (appliedCoupon && subtotal > 0 && appliedCoupon.discountType !== 'free_delivery') {
    if (subtotal < (appliedCoupon.minOrderAmount || 0)) {
      discount = 0;
    } else {
      if (appliedCoupon.discountType === 'percentage') {
        const calc = Math.round((subtotal * appliedCoupon.discountAmount) / 100);
        discount = appliedCoupon.maxDiscount ? Math.min(calc, appliedCoupon.maxDiscount) : calc;
      } else {
        discount = Math.min(appliedCoupon.discountAmount, subtotal);
      }
    }
  }

  // Check manual or auto-applied 1-time Free Delivery voucher
  const autoFreeDeliveryCoupon = settingsService.getActiveFreeDeliveryForUser(
    coupons,
    userIdentity,
    consumedCouponTokens
  );
  const activeFreeDeliveryCoupon =
    appliedCoupon &&
    appliedCoupon.discountType === 'free_delivery' &&
    settingsService.isCouponValidForUse(appliedCoupon, consumedCouponTokens) &&
    subtotal >= (appliedCoupon.minOrderAmount || 0)
      ? appliedCoupon
      : autoFreeDeliveryCoupon && subtotal >= (autoFreeDeliveryCoupon.minOrderAmount || 0)
      ? autoFreeDeliveryCoupon
      : null;
  const isFreeDelivery = Boolean(activeFreeDeliveryCoupon);

  const applyCoupon = (coupon: Coupon): { success: boolean; message: string } => {
    if (!settingsService.isCouponValidForUse(coupon, consumedCouponTokens)) {
      return { success: false, message: 'This coupon has already been used or expired.' };
    }
    if (!settingsService.doesCouponMatchCustomer(coupon, userIdentity)) {
      return { success: false, message: 'This coupon is assigned to a specific customer account.' };
    }
    if (subtotal < (coupon.minOrderAmount || 0)) {
      return {
        success: false,
        message: `Minimum order amount of ৳${coupon.minOrderAmount} required for this coupon.`,
      };
    }
    setAppliedCoupon(coupon);
    if (coupon.discountType === 'free_delivery') {
      return { success: true, message: `Free delivery coupon "${coupon.code}" applied!` };
    }
    return { success: true, message: `Coupon "${coupon.code}" applied successfully!` };
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
  };

  const baseDeliveryCharge = selectedZone ? selectedZone.charge : 70;
  const deliveryCharge = isFreeDelivery ? 0 : baseDeliveryCharge;
  const grandTotal = Math.max(0, subtotal - discount + deliveryCharge);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        coupons,
        appliedCoupon,
        applyCoupon,
        removeCoupon,
        deliveryZones,
        selectedZone,
        setSelectedZone,
        subtotal,
        discount,
        baseDeliveryCharge,
        deliveryCharge,
        isFreeDelivery,
        activeFreeDeliveryCoupon,
        grandTotal,
        totalItems,
        isCartDrawerOpen,
        setIsCartDrawerOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
