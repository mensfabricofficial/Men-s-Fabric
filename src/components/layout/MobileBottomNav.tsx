import React from 'react';
import { Home, LayoutGrid, ShoppingBag, Heart, User } from 'lucide-react';
import { motion } from 'motion/react';
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
  const { totalItems, isCartDrawerOpen, setIsCartDrawerOpen } = useCart();
  const { wishlistIds } = useWishlist();
  const { currentUser } = useAuth();

  const pathname = currentRoute.split('?')[0];

  const isHome = !isCartDrawerOpen && (pathname === '/' || pathname === '');
  const isShop = !isCartDrawerOpen && (pathname === '/shop' || pathname.startsWith('/category'));
  const isWishlist = !isCartDrawerOpen && pathname === '/wishlist';
  const isAccount = !isCartDrawerOpen && pathname === '/account';
  const isCart = isCartDrawerOpen || pathname === '/cart' || pathname === '/checkout';

  return (
    <nav
      aria-label="Mobile Navigation Bar"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-neutral-200/80 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] md:hidden transition-all duration-300"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid grid-cols-5 h-[66px] max-w-md mx-auto items-stretch px-2">
        {/* 1. Home */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => onNavigate('/')}
          aria-current={isHome ? 'page' : undefined}
          className="group relative flex flex-col items-center justify-center w-full h-full gap-1 cursor-pointer select-none"
        >
          <div className="relative w-11 h-7 rounded-full flex items-center justify-center">
            {isHome && (
              <motion.span
                layoutId="mobile-nav-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full bg-neutral-100"
              />
            )}
            <Home
              className={`relative z-10 w-[19px] h-[19px] transition-colors duration-200 ${
                isHome ? 'text-neutral-950' : 'text-neutral-500 group-hover:text-neutral-900'
              }`}
              strokeWidth={isHome ? 2.25 : 1.75}
            />
          </div>
          <span
            className={`text-[10.5px] leading-none tracking-[0.01em] transition-colors ${
              isHome ? 'font-bold text-neutral-950' : 'font-medium text-neutral-500'
            }`}
          >
            Home
          </span>
        </motion.button>

        {/* 2. Categories / Shop */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => onNavigate('/shop')}
          aria-current={isShop ? 'page' : undefined}
          className="group relative flex flex-col items-center justify-center w-full h-full gap-1 cursor-pointer select-none"
        >
          <div className="relative w-11 h-7 rounded-full flex items-center justify-center">
            {isShop && (
              <motion.span
                layoutId="mobile-nav-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full bg-neutral-100"
              />
            )}
            <LayoutGrid
              className={`relative z-10 w-[19px] h-[19px] transition-colors duration-200 ${
                isShop ? 'text-neutral-950' : 'text-neutral-500 group-hover:text-neutral-900'
              }`}
              strokeWidth={isShop ? 2.25 : 1.75}
            />
          </div>
          <span
            className={`text-[10.5px] leading-none tracking-[0.01em] transition-colors ${
              isShop ? 'font-bold text-neutral-950' : 'font-medium text-neutral-500'
            }`}
          >
            Categories
          </span>
        </motion.button>

        {/* 3. Cart with Drawer Open */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => setIsCartDrawerOpen(true)}
          aria-current={isCart ? 'page' : undefined}
          className="group relative flex flex-col items-center justify-center w-full h-full gap-1 cursor-pointer select-none"
        >
          <div className="relative w-11 h-7 rounded-full flex items-center justify-center">
            {isCart && (
              <motion.span
                layoutId="mobile-nav-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full bg-neutral-100"
              />
            )}
            <div className="relative z-10">
              <ShoppingBag
                className={`w-[19px] h-[19px] transition-colors duration-200 ${
                  isCart ? 'text-neutral-950' : 'text-neutral-500 group-hover:text-neutral-900'
                }`}
                strokeWidth={isCart ? 2.25 : 1.75}
              />
              {totalItems > 0 && (
                <motion.span
                  key={totalItems}
                  initial={{ scale: 0.6 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                  className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-neutral-950 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-white tabular-nums"
                >
                  {totalItems > 99 ? '99+' : totalItems}
                </motion.span>
              )}
            </div>
          </div>
          <span
            className={`text-[10.5px] leading-none tracking-[0.01em] transition-colors ${
              isCart ? 'font-bold text-neutral-950' : 'font-medium text-neutral-500'
            }`}
          >
            Cart
          </span>
        </motion.button>

        {/* 4. Wishlist */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => onNavigate('/wishlist')}
          aria-current={isWishlist ? 'page' : undefined}
          className="group relative flex flex-col items-center justify-center w-full h-full gap-1 cursor-pointer select-none"
        >
          <div className="relative w-11 h-7 rounded-full flex items-center justify-center">
            {isWishlist && (
              <motion.span
                layoutId="mobile-nav-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full bg-neutral-100"
              />
            )}
            <div className="relative z-10">
              <Heart
                className={`w-[19px] h-[19px] transition-colors duration-200 ${
                  isWishlist ? 'fill-neutral-950 text-neutral-950' : 'text-neutral-500 group-hover:text-neutral-900'
                }`}
                strokeWidth={isWishlist ? 2.25 : 1.75}
              />
              {wishlistIds.length > 0 && (
                <motion.span
                  key={wishlistIds.length}
                  initial={{ scale: 0.6 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                  className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-neutral-950 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-white tabular-nums"
                >
                  {wishlistIds.length > 99 ? '99+' : wishlistIds.length}
                </motion.span>
              )}
            </div>
          </div>
          <span
            className={`text-[10.5px] leading-none tracking-[0.01em] transition-colors ${
              isWishlist ? 'font-bold text-neutral-950' : 'font-medium text-neutral-500'
            }`}
          >
            Wishlist
          </span>
        </motion.button>

        {/* 5. Account */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => onNavigate('/account')}
          aria-current={isAccount ? 'page' : undefined}
          className="group relative flex flex-col items-center justify-center w-full h-full gap-1 cursor-pointer select-none"
        >
          <div className="relative w-11 h-7 rounded-full flex items-center justify-center">
            {isAccount && (
              <motion.span
                layoutId="mobile-nav-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full bg-neutral-100"
              />
            )}
            <div className="relative z-10">
              <User
                className={`w-[19px] h-[19px] transition-colors duration-200 ${
                  isAccount ? 'text-neutral-950' : 'text-neutral-500 group-hover:text-neutral-900'
                }`}
                strokeWidth={isAccount ? 2.25 : 1.75}
              />
              {currentUser && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white" />
              )}
            </div>
          </div>
          <span
            className={`text-[10.5px] leading-none tracking-[0.01em] transition-colors ${
              isAccount ? 'font-bold text-neutral-950' : 'font-medium text-neutral-500'
            }`}
          >
            {currentUser ? 'Account' : 'Login'}
          </span>
        </motion.button>
      </div>
    </nav>
  );
};
