import React, { useState, useEffect } from 'react';
import { X, Trash2, Plus, Minus, ArrowRight, ShoppingBag, Tag, CheckCircle2 } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { EmptyState } from '../common/EmptyState';
import { FloatingInput } from '../common/FloatingInput';
import { settingsService } from '../../services/settingsService';
import { getProductUrlSlug } from '../../services/productService';
import { ProgressiveImage } from '../common/ProgressiveImage';

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
    baseDeliveryCharge,
    isFreeDelivery,
    activeFreeDeliveryCoupon,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
  } = useCart();
  const { currentUser } = useAuth();

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [mobileLayout, setMobileLayout] = useState<{ isMobile: boolean; topOffset: number }>(() => {
    if (typeof window === 'undefined') return { isMobile: false, topOffset: 96 };
    const isMob = window.innerWidth < 640;
    const hdr = document.querySelector('header');
    const bottom = hdr ? Math.max(0, Math.round(hdr.getBoundingClientRect().bottom)) : 96;
    return { isMobile: isMob, topOffset: bottom };
  });

  useEffect(() => {
    if (!isCartDrawerOpen) return;

    const updateHeaderOffset = () => {
      const isMob = window.innerWidth < 640;
      const hdr = document.querySelector('header');
      const bottom = hdr ? Math.max(0, Math.round(hdr.getBoundingClientRect().bottom)) : 96;
      setMobileLayout({ isMobile: isMob, topOffset: bottom });
    };

    updateHeaderOffset();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCartDrawerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateHeaderOffset);

    const hdr = document.querySelector('header');
    let resizeObserver: ResizeObserver | null = null;
    if (hdr && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateHeaderOffset);
      resizeObserver.observe(hdr);
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateHeaderOffset);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [isCartDrawerOpen, setIsCartDrawerOpen]);

  if (!isCartDrawerOpen) return null;

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    if (!couponInput.trim()) return;

    setCouponLoading(true);
    try {
      const allCoupons = await settingsService.getCoupons();
      const match = allCoupons.find(
        (c) => (c.code || '').toUpperCase() === couponInput.trim().toUpperCase()
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

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 sm:inset-0 overflow-hidden ${
        mobileLayout.isMobile ? 'z-[45]' : 'z-50'
      }`}
      style={mobileLayout.isMobile ? { top: `${mobileLayout.topOffset}px` } : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Shopping Cart"
    >
      {/* Backdrop (Desktop side-drawer dimmer) */}
      <div
        className="hidden sm:block fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => setIsCartDrawerOpen(false)}
      />

      <div className="relative w-full h-full sm:fixed sm:inset-y-0 sm:left-auto sm:right-0 sm:w-auto max-w-full flex sm:pl-10">
        <div className="w-full sm:w-screen sm:max-w-md h-full sm:h-dvh bg-white sm:shadow-2xl flex flex-col justify-between animate-fade-in sm:animate-slide-in-right">
          
          {/* Header */}
          <div className="px-4 py-3 sm:p-5 border-b border-neutral-100 sm:border-neutral-200 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
              <h3 className="font-sans text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-900">
                Your Shopping Cart ({totalQty})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsCartDrawerOpen(false)}
              aria-label="Close cart"
              className="p-1.5 -mr-1 sm:mr-0 text-neutral-500 hover:text-black rounded-md hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto px-4 py-2 sm:p-5 divide-y divide-neutral-100">
            {items.length === 0 ? (
              <div className="min-h-full flex items-center justify-center">
                <EmptyState
                  icon={<ShoppingBag className="w-7 h-7 sm:w-8 sm:h-8 text-neutral-400" />}
                  title="Your cart is empty"
                  description="Explore our newest collections and exclusive fabrics."
                  actionText="Start Shopping"
                  onAction={() => {
                    setIsCartDrawerOpen(false);
                    onNavigate('/shop');
                  }}
                />
              </div>
            ) : (
              items.map((item, idx) => {
                const regPrice = Number(item.price) || 0;
                const salePrice = typeof item.salePrice === 'number' && item.salePrice > 0 ? item.salePrice : 0;
                const itemPrice = salePrice > 0 ? salePrice : regPrice;
                const itemQty = Math.max(1, Number(item.quantity) || 1);
                const itemSlug = getProductUrlSlug({
                  id: item.productId,
                  name: item.productName,
                  slug: item.productSlug,
                  sku: item.sku,
                });
                return (
                  <div key={`${item.productId}-${item.size}-${item.color}-${idx}`} className="py-3.5 sm:py-4 flex gap-3 sm:gap-4">
                    <div
                      onClick={() => {
                        setIsCartDrawerOpen(false);
                        onNavigate(`/product/${itemSlug}`);
                      }}
                      className="w-[72px] h-[72px] sm:w-20 sm:h-20 aspect-square rounded-md overflow-hidden bg-neutral-100 shrink-0 border border-neutral-200/80 cursor-pointer hover:opacity-90 transition-opacity"
                    >
                      <ProgressiveImage
                        src={item.productImage}
                        alt={item.productName}
                        wrapperClassName="relative w-full h-full overflow-hidden bg-neutral-100"
                        className="w-full h-full object-cover object-center"
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4
                            onClick={() => {
                              setIsCartDrawerOpen(false);
                              onNavigate(`/product/${itemSlug}`);
                            }}
                            className="font-sans text-[13px] sm:text-sm font-semibold text-neutral-900 hover:underline cursor-pointer line-clamp-1 leading-snug"
                          >
                            {item.productName}
                          </h4>
                          <button
                            type="button"
                            onClick={() => removeItem(item.productId, item.size, item.color)}
                            aria-label="Remove item"
                            className="text-neutral-400 hover:text-red-600 transition-colors cursor-pointer p-1 -mr-1 -mt-0.5 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-neutral-500">
                          <span className="bg-neutral-100 px-1.5 py-0.5 rounded">Size: {item.size}</span>
                          <span className="bg-neutral-100 px-1.5 py-0.5 rounded">Color: {item.color}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-2.5 sm:mt-3">
                        {/* Quantity selector */}
                        <div className="flex items-center h-7 border border-neutral-300 rounded overflow-hidden">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, item.size, item.color, -1)}
                            aria-label="Decrease quantity"
                            className="px-2 h-full text-neutral-600 hover:bg-neutral-100 flex items-center justify-center cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-semibold tabular-nums">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, item.size, item.color, 1)}
                            disabled={item.quantity >= item.availableStock}
                            aria-label="Increase quantity"
                            className="px-2 h-full text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Price */}
                        <div className="text-right lining-nums tabular-nums">
                          <span className="text-[13px] sm:text-xs font-bold text-neutral-900">
                            ৳{(itemPrice * itemQty).toLocaleString('en-BD')}
                          </span>
                          {salePrice > 0 && salePrice < regPrice && (
                            <span className="block text-[10px] text-neutral-400 line-through">
                              ৳{(regPrice * itemQty).toLocaleString('en-BD')}
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
            <div className="border-t border-neutral-200 px-4 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 bg-neutral-50/50 space-y-2.5 sm:space-y-3 shrink-0">
              {/* Coupon input */}
              <div>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Tag className="w-3.5 h-3.5" />
                      <span>
                        Code <b>{appliedCoupon.code}</b> applied{' '}
                        {appliedCoupon.discountType === 'free_delivery' ? '(Free Delivery)' : `(-৳${discount})`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={removeCoupon}
                      className="text-red-600 hover:underline text-[11px] font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="flex gap-2 items-center">
                    <FloatingInput
                      compact
                      label="Coupon Code"
                      labelBgClass="bg-[linear-gradient(to_bottom,#fafafa_50%,#ffffff_50%)]"
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      className="uppercase"
                    />
                    <button
                      type="submit"
                      disabled={couponLoading || !couponInput.trim()}
                      className="h-10 px-4 bg-neutral-900 text-white text-xs font-semibold rounded-[6px] hover:bg-black disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {couponLoading ? '...' : 'Apply'}
                    </button>
                  </form>
                )}
                {!appliedCoupon && isFreeDelivery && activeFreeDeliveryCoupon && (
                  <div className="mt-2 flex items-center gap-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-800 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>One-Time Free Delivery unlocked ({activeFreeDeliveryCoupon.code})!</span>
                  </div>
                )}
                {couponError && <p className="text-[11px] text-red-600 mt-1">{couponError}</p>}
              </div>

              {/* Order summary breakdown */}
              <div className="space-y-1.5 pt-2 text-xs border-t border-neutral-200 lining-nums tabular-nums">
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
                  {isFreeDelivery ? (
                    <span className="font-bold text-emerald-700">
                      <span className="line-through text-neutral-400 mr-1.5 font-normal">৳{baseDeliveryCharge}</span>
                      FREE (৳0)
                    </span>
                  ) : (
                    <span className="text-neutral-500 font-medium">Calculated at checkout</span>
                  )}
                </div>
                <div className="flex justify-between text-sm font-bold text-neutral-900 pt-1.5 border-t border-neutral-200">
                  <span>Estimated Subtotal</span>
                  <span>৳{Math.max(0, subtotal - discount).toLocaleString('en-BD')}</span>
                </div>
              </div>

              {/* Notice if user is not logged in */}
              {!currentUser && (
                <div className="p-2 sm:p-2.5 bg-neutral-100 rounded-md text-neutral-600 text-[11px] flex items-center gap-2 leading-snug">
                  <span className="font-semibold text-neutral-900 shrink-0">Note:</span>
                  <span>You will be prompted to sign in or register to confirm your order.</span>
                </div>
              )}

              {/* Checkout Action */}
              <button
                type="button"
                onClick={() => {
                  setIsCartDrawerOpen(false);
                  if (!currentUser) {
                    onNavigate('/account?redirect=checkout');
                  } else {
                    onNavigate('/checkout');
                  }
                }}
                className="w-full py-3 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
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
