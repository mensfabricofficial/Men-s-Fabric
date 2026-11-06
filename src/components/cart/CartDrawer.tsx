import React, { useState } from 'react';
import { X, Trash2, Plus, Minus, ArrowRight, ShoppingBag, Tag, CheckCircle2 } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { EmptyState } from '../common/EmptyState';
import { settingsService } from '../../services/settingsService';

interface CartDrawerProps {
  onNavigate: (route: string) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onNavigate }) => {
  const {
    items,
    isCartDrawerOpen,
    setIsCartDrawerOpen,
    removeItem,
    updateQuantity,
    subtotal,
    discount,
    deliveryCharge,
    grandTotal,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    deliveryZones,
    selectedZone,
    setSelectedZone,
  } = useCart();
  const { currentUser } = useAuth();

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  if (!isCartDrawerOpen) return null;

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    if (!couponInput.trim()) return;

    setCouponLoading(true);
    try {
      const allCoupons = await settingsService.getCoupons();
      const match = allCoupons.find(
        (c) => c.code.toUpperCase() === couponInput.trim().toUpperCase()
      );
      if (!match) {
        setCouponError('Invalid coupon code.');
      } else {
        const res = applyCoupon(match);
        if (!res.success) {
          setCouponError(res.message);
        } else {
          setCouponInput('');
        }
      }
    } catch {
      setCouponError('Failed to validate coupon.');
    } finally {
      setCouponLoading(false);
    }
  };

  const freeDeliveryThreshold = 2500;
  const progressToFreeShipping = Math.min(100, (subtotal / freeDeliveryThreshold) * 100);
  const remainingForFreeShipping = Math.max(0, freeDeliveryThreshold - subtotal);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => setIsCartDrawerOpen(false)}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between">
          
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-neutral-200 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-black" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                Your Shopping Bag ({items.reduce((s, i) => s + i.quantity, 0)})
              </h3>
            </div>
            <button
              onClick={() => setIsCartDrawerOpen(false)}
              className="p-1.5 text-neutral-500 hover:text-black rounded-md hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 divide-y divide-neutral-100">
            {items.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag className="w-8 h-8 text-neutral-400" />}
                title="Your bag is empty"
                description="Explore our newest collections and exclusive fabrics."
                actionText="Start Shopping"
                onAction={() => {
                  setIsCartDrawerOpen(false);
                  onNavigate('/shop');
                }}
              />
            ) : (
              items.map((item, idx) => {
                const itemPrice = typeof item.salePrice === 'number' && item.salePrice > 0 ? item.salePrice : item.price;
                return (
                  <div key={`${item.productId}-${item.size}-${item.color}-${idx}`} className="py-4 flex gap-4 first:pt-0">
                    <img
                      src={item.productImage || '/logo.jpg'}
                      alt={item.productName}
                      onClick={() => {
                        setIsCartDrawerOpen(false);
                        onNavigate(`/product/${item.productId}`);
                      }}
                      className="w-18 h-24 object-cover object-center rounded bg-neutral-100 shrink-0 border border-neutral-200 cursor-pointer hover:opacity-90 transition-opacity"
                    />
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 
                            onClick={() => {
                              setIsCartDrawerOpen(false);
                              onNavigate(`/product/${item.productId}`);
                            }}
                            className="text-xs sm:text-sm font-semibold text-neutral-900 hover:underline cursor-pointer line-clamp-1"
                          >
                            {item.productName}
                          </h4>
                          <button
                            onClick={() => removeItem(item.productId, item.size, item.color)}
                            className="text-neutral-400 hover:text-red-600 transition-colors cursor-pointer p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-500">
                          <span className="bg-neutral-100 px-1.5 py-0.5 rounded">Size: {item.size}</span>
                          <span className="bg-neutral-100 px-1.5 py-0.5 rounded">Color: {item.color}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        {/* Quantity selector */}
                        <div className="flex items-center border border-neutral-300 rounded overflow-hidden">
                          <button
                            onClick={() => updateQuantity(item.productId, item.size, item.color, -1)}
                            className="p-1 px-2 text-neutral-600 hover:bg-neutral-100 cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.productId, item.size, item.color, 1)}
                            disabled={item.quantity >= item.availableStock}
                            className="p-1 px-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Price */}
                        <div className="text-right">
                          <span className="text-xs font-bold text-neutral-900">
                            ৳{(itemPrice * item.quantity).toLocaleString('en-BD')}
                          </span>
                          {item.salePrice && item.salePrice < item.price && (
                            <span className="block text-[10px] text-neutral-400 line-through">
                              ৳{(item.price * item.quantity).toLocaleString('en-BD')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Cart Footer */}
          {items.length > 0 && (
            <div className="border-t border-neutral-200 p-4 sm:p-5 bg-neutral-50/50 space-y-3">
              {/* Coupon input */}
              <div>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Tag className="w-3.5 h-3.5" />
                      <span>Code <b>{appliedCoupon.code}</b> applied (-৳{discount})</span>
                    </div>
                    <button
                      onClick={removeCoupon}
                      className="text-red-600 hover:underline text-[11px] font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Coupon Code"
                      className="flex-1 px-3 py-1.5 bg-white border border-neutral-300 rounded text-xs uppercase focus:outline-none focus:border-black"
                    />
                    <button
                      type="submit"
                      disabled={couponLoading || !couponInput.trim()}
                      className="px-3 py-1.5 bg-neutral-900 text-white text-xs font-semibold rounded hover:bg-black disabled:opacity-50 cursor-pointer"
                    >
                      {couponLoading ? '...' : 'Apply'}
                    </button>
                  </form>
                )}
                {couponError && <p className="text-[11px] text-red-600 mt-1">{couponError}</p>}
              </div>

              {/* Order summary breakdown */}
              <div className="space-y-1.5 pt-2 text-xs border-t border-neutral-200">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal</span>
                  <span>৳{subtotal.toLocaleString('en-BD')}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Discount</span>
                    <span>-৳{discount.toLocaleString('en-BD')}</span>
                  </div>
                )}
                <div className="flex justify-between text-neutral-600">
                  <span>Shipping</span>
                  <span className="text-neutral-500 font-medium">Calculated at checkout</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-neutral-900 pt-1.5 border-t border-neutral-200">
                  <span>Estimated Subtotal</span>
                  <span>৳{Math.max(0, subtotal - discount).toLocaleString('en-BD')}</span>
                </div>
              </div>

              {/* Notice if user is not logged in */}
              {!currentUser && (
                <div className="p-2.5 bg-neutral-100 rounded-lg text-neutral-600 text-[11px] flex items-center gap-2">
                  <span className="font-semibold text-neutral-900">Note:</span>
                  <span>You will be prompted to sign in or register to confirm your order.</span>
                </div>
              )}

              {/* Checkout Action */}
              <button
                onClick={() => {
                  setIsCartDrawerOpen(false);
                  if (!currentUser) {
                    onNavigate('/account?redirect=checkout');
                  } else {
                    onNavigate('/checkout');
                  }
                }}
                className="w-full py-3 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <span>{currentUser ? 'Proceed to Checkout' : 'Sign In to Order'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
