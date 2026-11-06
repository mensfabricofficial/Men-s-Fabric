import React from 'react';
import { Home, LayoutGrid, ShoppingBag, Heart, User } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useAuth } from '../../context/AuthContext';

interface MobileBottomNavProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentRoute,
  onNavigate,
}) => {
  const { totalItems, setIsCartDrawerOpen } = useCart();
  const { wishlistIds } = useWishlist();
  const { currentUser } = useAuth();

  const pathname = currentRoute.split('?')[0];

  const isHome = pathname === '/' || pathname === '';
  const isShop = pathname === '/shop' || pathname.startsWith('/category');
  const isWishlist = pathname === '/wishlist';
  const isAccount = pathname === '/account';
  const isCart = pathname === '/cart' || pathname === '/checkout';

  return (
    <nav
      aria-label="Mobile Navigation Bar"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200/90 shadow-[0_-4px_25px_rgba(0,0,0,0.06)] md:hidden transition-all duration-300"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid grid-cols-5 h-16 max-w-md mx-auto items-center px-1">
        {/* 1. Home */}
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className={`flex flex-col items-center justify-center w-full h-full py-1 gap-1 transition-colors relative cursor-pointer select-none ${
            isHome ? 'text-black font-bold' : 'text-neutral-500 hover:text-black font-medium'
          }`}
        >
          <div className="relative">
            <Home className={`w-5 h-5 transition-transform duration-200 ${isHome ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {isHome && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-black rounded-full" />
            )}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Home</span>
        </button>

        {/* 2. Categories / Shop */}
        <button
          type="button"
          onClick={() => onNavigate('/shop')}
          className={`flex flex-col items-center justify-center w-full h-full py-1 gap-1 transition-colors relative cursor-pointer select-none ${
            isShop ? 'text-black font-bold' : 'text-neutral-500 hover:text-black font-medium'
          }`}
        >
          <div className="relative">
            <LayoutGrid className={`w-5 h-5 transition-transform duration-200 ${isShop ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {isShop && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-black rounded-full" />
            )}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Categories</span>
        </button>

        {/* 3. Cart with Drawer Open */}
        <button
          type="button"
          onClick={() => setIsCartDrawerOpen(true)}
          className={`flex flex-col items-center justify-center w-full h-full py-1 gap-1 transition-colors relative cursor-pointer select-none ${
            isCart ? 'text-black font-bold' : 'text-neutral-500 hover:text-black font-medium'
          }`}
        >
          <div className="relative">
            <ShoppingBag className={`w-5 h-5 transition-transform duration-200 ${isCart ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {totalItems > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-red-600 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center shadow-xs animate-scale-in">
                {totalItems > 99 ? '99+' : totalItems}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Cart</span>
        </button>

        {/* 4. Wishlist */}
        <button
          type="button"
          onClick={() => onNavigate('/wishlist')}
          className={`flex flex-col items-center justify-center w-full h-full py-1 gap-1 transition-colors relative cursor-pointer select-none ${
            isWishlist ? 'text-black font-bold' : 'text-neutral-500 hover:text-black font-medium'
          }`}
        >
          <div className="relative">
            <Heart className={`w-5 h-5 transition-transform duration-200 ${isWishlist ? 'scale-110 stroke-[2.5] fill-black' : 'stroke-[1.8]'}`} />
            {wishlistIds.length > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-black text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {wishlistIds.length > 99 ? '99+' : wishlistIds.length}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Wishlist</span>
        </button>

        {/* 5. Account */}
        <button
          type="button"
          onClick={() => onNavigate('/account')}
          className={`flex flex-col items-center justify-center w-full h-full py-1 gap-1 transition-colors relative cursor-pointer select-none ${
            isAccount ? 'text-black font-bold' : 'text-neutral-500 hover:text-black font-medium'
          }`}
        >
          <div className="relative">
            <User className={`w-5 h-5 transition-transform duration-200 ${isAccount ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
            {currentUser && (
              <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-emerald-500 rounded-full border border-white" />
            )}
            {isAccount && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-black rounded-full" />
            )}
          </div>
          <span className="text-[10px] tracking-tight leading-none">
            {currentUser ? 'Account' : 'Login'}
          </span>
        </button>
      </div>
    </nav>
  );
};
