import React, { createContext, useContext, useEffect, useState } from 'react';
import { CartItem, Coupon, DeliveryZone, SiteSettings } from '../types';
import { settingsService, defaultSettings, getLocalSettings } from '../services/settingsService';
import { orderService } from '../services/orderService';
import { useAuth } from './AuthContext';

export interface CustomerContactHint {
  email?: string | null;
  phone?: string | null;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, size: string, color: string) => void;
  updateQuantity: (productId: string, size: string, color: string, deltaOrValue: number, isAbsolute?: boolean) => void;
  clearCart: () => void;
  coupons: Coupon[];
  appliedCoupon: Coupon | null;
  applyCoupon: (coupon: Coupon, identityOverride?: CustomerContactHint) => { success: boolean; message: string };
  removeCoupon: () => void;
  setCustomerContactHint: (hint: CustomerContactHint) => void;
  deliveryZones: DeliveryZone[];
  selectedZone: DeliveryZone | null;
  setSelectedZone: (zone: DeliveryZone) => void;
  subtotal: number;
  discount: number;
  baseDeliveryCharge: number;
  deliveryCharge: number;
  isFreeDelivery: boolean;
  isQtyFreeDelivery: boolean;
  freeDeliveryMinQtyActive: boolean;
  freeDeliveryMinQty: number;
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
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (it): it is CartItem =>
            Boolean(it && typeof it === 'object' && typeof it.productId === 'string')
        );
      }
      localStorage.removeItem('mf_cart');
    } catch {
      try {
        localStorage.removeItem('mf_cart');
      } catch {
        // ignore
      }
    }
    return [];
  });

  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(() => {
    try {
      const saved = localStorage.getItem('mf_coupon');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.code === 'string') {
        return parsed as Coupon;
      }
      localStorage.removeItem('mf_coupon');
    } catch {
      try {
        localStorage.removeItem('mf_coupon');
      } catch {
        // ignore
      }
    }
    return null;
  });

  const [coupons, setCoupons] = useState<Coupon[]>(() => settingsService.getInstantCoupons());
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(
    () => settingsService.getInstantSettings() || getLocalSettings() || defaultSettings
  );
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>(() =>
    settingsService.getInstantDeliveryZones()
  );
  const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(() => {
    const initial = settingsService.getInstantDeliveryZones();
    return initial[0] || null;
  });
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [orderConsumedCodes, setOrderConsumedCodes] = useState<string[]>([]);
  const [customerContactHint, setCustomerContactHint] = useState<CustomerContactHint>({});

  // Real-time synchronization of site settings (for quantity-based Free Delivery rule)
  useEffect(() => {
    const unsub = settingsService.subscribeToSettings((s) => {
      setSiteSettings(s);
    });
    return () => unsub();
  }, []);

  // Real-time synchronization of coupons (for auto free delivery & one-time voucher checks)
  useEffect(() => {
    const unsub = settingsService.subscribeToCoupons((list) => {
      setCoupons(list);
    });
    return () => unsub();
  }, []);

  // Track coupons already used in THIS customer's non-cancelled orders so 1-time passes never return
  useEffect(() => {
    let active = true;
    const myUid = currentUser?.uid?.trim() || '';
    const myEmail = (currentUser?.email || customerContactHint.email || '').trim().toLowerCase();
    const myPhoneDigits = (customerProfile?.phone || customerContactHint.phone || '').replace(/[^0-9]/g, '').slice(-10);

    const isMyOrder = (o: { customerId?: string; customerEmail?: string; customerPhone?: string; shippingAddress?: { email?: string; phone?: string } }) => {
      if (myUid && o.customerId && o.customerId === myUid) return true;
      const oEmail = (o.customerEmail || o.shippingAddress?.email || '').trim().toLowerCase();
      if (myEmail && oEmail && oEmail === myEmail) return true;
      const oPhone = (o.customerPhone || o.shippingAddress?.phone || '').replace(/[^0-9]/g, '').slice(-10);
      if (myPhoneDigits.length >= 10 && oPhone === myPhoneDigits) return true;
      return false;
    };

    const collectFromInstant = () => {
      if (!myUid && !myEmail && myPhoneDigits.length < 10) {
        if (active) setOrderConsumedCodes([]);
        return;
      }
      const codes = orderService
        .getInstantOrders()
        .filter((o) => o.orderStatus !== 'cancelled' && o.couponCode && isMyOrder(o))
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
          .filter((o) => o.orderStatus !== 'cancelled' && o.couponCode && isMyOrder(o))
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
  }, [currentUser?.uid, currentUser?.email, customerProfile?.phone, customerContactHint.email, customerContactHint.phone]);

  const consumedCouponTokens = React.useMemo(() => {
    const set = new Set<string>();
    (customerProfile?.consumedCoupons || []).forEach((t) => {
      if (t) set.add(t.trim().toUpperCase());
    });
    orderConsumedCodes.forEach((code) => {
      const matched = coupons.find((c) => c.code.toUpperCase() === code);
      // Only mark consumed per customer if it is strictly a 1-time voucher
      if (matched && settingsService.isOneTimeCoupon(matched)) {
        set.add(code);
        if (matched.id) set.add(matched.id.trim().toUpperCase());
      }
    });
    return set;
  }, [customerProfile?.consumedCoupons, orderConsumedCodes, coupons]);

  // Automatically invalidate stored appliedCoupon if disabled/expired/exhausted or belongs to another user
  useEffect(() => {
    if (!appliedCoupon) return;
    const latest = coupons.find((c) => c.id === appliedCoupon.id);
    const identity = {
      uid: currentUser?.uid,
      email: currentUser?.email || customerContactHint.email,
      phone: customerProfile?.phone || customerContactHint.phone,
    };
    const targetCoupon = latest || appliedCoupon;
    if (
      !settingsService.isCouponValidForUse(targetCoupon, consumedCouponTokens) ||
      !settingsService.doesCouponMatchCustomer(targetCoupon, identity)
    ) {
      setAppliedCoupon(null);
    }
  }, [
    coupons,
    appliedCoupon,
    consumedCouponTokens,
    currentUser?.uid,
    currentUser?.email,
    customerProfile?.phone,
    customerContactHint.email,
    customerContactHint.phone,
  ]);

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
    const saleVal = typeof item.salePrice === 'number' && item.salePrice > 0 ? item.salePrice : 0;
    const regVal = Number(item.price) || 0;
    const itemPrice = saleVal > 0 ? saleVal : regVal;
    const qty = Math.max(1, Number(item.quantity) || 1);
    return sum + itemPrice * qty;
  }, 0);

  const userIdentity = {
    uid: currentUser?.uid,
    email: currentUser?.email || customerContactHint.email,
    phone: customerProfile?.phone || customerContactHint.phone,
  };

  const liveAppliedCoupon = appliedCoupon
    ? coupons.find((c) => c.id === appliedCoupon.id) || appliedCoupon
    : null;

  // Validate and calculate coupon discount safely
  let discount = 0;
  if (liveAppliedCoupon && subtotal > 0 && liveAppliedCoupon.discountType !== 'free_delivery') {
    const minReq = Number(liveAppliedCoupon.minOrderAmount) || 0;
    const discVal = Number(liveAppliedCoupon.discountAmount) || 0;
    const maxCap = Number(liveAppliedCoupon.maxDiscount) || 0;
    if (subtotal < minReq) {
      discount = 0;
    } else {
      if (liveAppliedCoupon.discountType === 'percentage') {
        const calc = Math.round((subtotal * discVal) / 100);
        discount = maxCap > 0 ? Math.min(calc, maxCap) : calc;
      } else {
        discount = Math.min(discVal, subtotal);
      }
    }
  }

  const totalItems = items.reduce((sum, i) => sum + Math.max(1, Number(i.quantity) || 1), 0);
  const freeDeliveryMinQtyActive =
    siteSettings.freeDeliveryMinQtyActive ?? defaultSettings.freeDeliveryMinQtyActive ?? true;
  const freeDeliveryMinQty = Math.max(
    0,
    Math.floor(
      Number(
        typeof siteSettings.freeDeliveryMinQty === 'number'
          ? siteSettings.freeDeliveryMinQty
          : (defaultSettings.freeDeliveryMinQty ?? 2)
      ) || 0
    )
  );
  const isQtyFreeDelivery = Boolean(
    freeDeliveryMinQtyActive && freeDeliveryMinQty > 0 && totalItems >= freeDeliveryMinQty
  );

  // Check manual or auto-applied 1-time Free Delivery voucher
  const autoFreeDeliveryCoupon = settingsService.getActiveFreeDeliveryForUser(
    coupons,
    userIdentity,
    consumedCouponTokens
  );
  const activeFreeDeliveryCoupon =
    liveAppliedCoupon &&
    liveAppliedCoupon.discountType === 'free_delivery' &&
    settingsService.isCouponValidForUse(liveAppliedCoupon, consumedCouponTokens) &&
    subtotal >= (Number(liveAppliedCoupon.minOrderAmount) || 0)
      ? liveAppliedCoupon
      : autoFreeDeliveryCoupon && subtotal >= (Number(autoFreeDeliveryCoupon.minOrderAmount) || 0)
      ? autoFreeDeliveryCoupon
      : null;
  const isFreeDelivery = Boolean(activeFreeDeliveryCoupon || isQtyFreeDelivery);

  const applyCoupon = (
    coupon: Coupon,
    identityOverride?: CustomerContactHint
  ): { success: boolean; message: string } => {
    const checkIdentity = {
      uid: userIdentity.uid,
      email: identityOverride?.email || userIdentity.email,
      phone: identityOverride?.phone || userIdentity.phone,
    };
    if (!settingsService.isCouponValidForUse(coupon, consumedCouponTokens)) {
      return { success: false, message: 'This coupon has already been used or expired.' };
    }
    if (!settingsService.doesCouponMatchCustomer(coupon, checkIdentity)) {
      return { success: false, message: 'This coupon is assigned to a specific customer account.' };
    }
    const minReq = Number(coupon.minOrderAmount) || 0;
    if (subtotal < minReq) {
      return {
        success: false,
        message: `Minimum order amount of ৳${minReq} required for this coupon.`,
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

  const baseDeliveryCharge = selectedZone ? Number(selectedZone.charge) || 0 : 70;
  const deliveryCharge = isFreeDelivery ? 0 : baseDeliveryCharge;
  const grandTotal = Math.max(0, subtotal - discount + deliveryCharge);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        coupons,
        appliedCoupon: liveAppliedCoupon,
        applyCoupon,
        removeCoupon,
        setCustomerContactHint,
        deliveryZones,
        selectedZone,
        setSelectedZone,
        subtotal,
        discount,
        baseDeliveryCharge,
        deliveryCharge,
        isFreeDelivery,
        isQtyFreeDelivery,
        freeDeliveryMinQtyActive,
        freeDeliveryMinQty,
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
