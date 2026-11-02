import React, { createContext, useContext, useEffect, useState } from 'react';
import { CartItem, Coupon, DeliveryZone } from '../types';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, size: string, color: string) => void;
  updateQuantity: (productId: string, size: string, color: string, deltaOrValue: number, isAbsolute?: boolean) => void;
  clearCart: () => void;
  appliedCoupon: Coupon | null;
  applyCoupon: (coupon: Coupon) => { success: boolean; message: string };
  removeCoupon: () => void;
  deliveryZones: DeliveryZone[];
  selectedZone: DeliveryZone | null;
  setSelectedZone: (zone: DeliveryZone) => void;
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  grandTotal: number;
  totalItems: number;
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Default Bangladeshi delivery zones if database has not been seeded yet
const DEFAULT_ZONES: DeliveryZone[] = [
  { id: 'dhaka', name: 'Inside Dhaka City', charge: 70, estimatedDays: '1 - 2 Days', active: true },
  { id: 'outside-dhaka', name: 'Outside Dhaka (Nationwide)', charge: 130, estimatedDays: '2 - 4 Days', active: true },
];

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>(DEFAULT_ZONES);
  const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(DEFAULT_ZONES[0]);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);

  // Load custom delivery zones from Firestore if available
  useEffect(() => {
    const fetchZones = async () => {
      try {
        const q = query(collection(db, 'deliveryZones'), where('active', '==', true));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const list: DeliveryZone[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as DeliveryZone));
          setDeliveryZones(list);
          if (!selectedZone || !list.some((z) => z.id === selectedZone.id)) {
            setSelectedZone(list[0]);
          }
        }
      } catch (e) {
        // Fallback to default zones
      }
    };
    fetchZones();
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

  // Validate and calculate coupon discount safely
  let discount = 0;
  if (appliedCoupon && subtotal > 0) {
    if (subtotal < (appliedCoupon.minOrderAmount || 0)) {
      // Not meeting minimum order amount
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

  const applyCoupon = (coupon: Coupon): { success: boolean; message: string } => {
    if (!coupon.active) {
      return { success: false, message: 'This coupon is no longer active.' };
    }
    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
      return { success: false, message: 'This coupon has expired.' };
    }
    if (subtotal < coupon.minOrderAmount) {
      return {
        success: false,
        message: `Minimum order amount of ৳${coupon.minOrderAmount} required for this coupon.`,
      };
    }
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return { success: false, message: 'Coupon usage limit has been reached.' };
    }
    setAppliedCoupon(coupon);
    return { success: true, message: `Coupon "${coupon.code}" applied successfully!` };
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
  };

  const deliveryCharge = selectedZone ? selectedZone.charge : 70;
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
        appliedCoupon,
        applyCoupon,
        removeCoupon,
        deliveryZones,
        selectedZone,
        setSelectedZone,
        subtotal,
        discount,
        deliveryCharge,
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
