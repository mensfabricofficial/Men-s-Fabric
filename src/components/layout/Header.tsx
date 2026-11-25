import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  Heart, 
  User as UserIcon, 
  Search, 
  Menu, 
  X, 
  ChevronDown,
  ShieldCheck,
  Package,
  LogOut,
  SlidersHorizontal
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useAuth } from '../../context/AuthContext';
import { Category } from '../../types';
import { productService } from '../../services/productService';
import { settingsService, defaultSettings } from '../../services/settingsService';

import { BrandLogo } from '../common/BrandLogo';
import { FloatingInput } from '../common/FloatingInput';
import { PWAInstallButton } from '../common/PWAInstallButton';

interface HeaderProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentRoute, onNavigate }) => {
  const { totalItems, setIsCartDrawerOpen } = useCart();
  const { wishlistIds } = useWishlist();
  const { currentUser, isAdmin, logOut } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>(() => (productService.getInstantCategories() || []).filter((c) => c.active));
  const initialSettings = settingsService.getInstantSettings() || defaultSettings;
  const [announcement, setAnnouncement] = useState(() => initialSettings.announcementText || 'Welcome to Selvee — Save 5% on online payment!');
  const [announcementActive, setAnnouncementActive] = useState(() => initialSettings.announcementActive !== false);
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false);

  useEffect(() => {
    const unsubCategories = productService.subscribeToCategories((cats) => {
      setCategories(cats.filter((c) => c.active));
    });
    const unsubSettings = settingsService.subscribeToSettings((s) => {
      if (s.announcementText) setAnnouncement(s.announcementText);
      setAnnouncementActive(s.announcementActive !== false);
    });
    return () => {
      unsubCategories();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onNavigate(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setMobileMenuOpen(false);
    }
  };

  const navLinks = [
    { label: 'Home', href: '/' },
    { label: 'All Products', href: '/shop' },
    { label: 'New Arrivals', href: '/shop?filter=new' },
    { label: 'Best Sellers', href: '/shop?filter=best' },
    { label: 'Track Order', href: '/track-order' },
    { label: 'About', href: '/about' },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-neutral-200 shadow-xs">
        {/* Announcement Bar */}
        {announcementActive && (
          <div className="bg-black text-white text-[11px] sm:text-xs font-medium py-2 px-4 text-center tracking-wide flex items-center justify-center gap-2">
            <span>{announcement}</span>
          </div>
        )}

        {/* Main Header Container */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
            
            {/* Mobile Menu Button */}
            <div className="flex items-center lg:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open menu"
                aria-expanded={mobileMenuOpen}
                className="p-2 -ml-2 text-neutral-800 hover:text-black rounded-lg active:bg-neutral-100 cursor-pointer"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>

            {/* Official Brand Logo */}
            <div 
              onClick={() => onNavigate('/')}
              className="flex items-center cursor-pointer select-none py-1 shrink-0"
            >
              <BrandLogo variant="dark" size="md" />
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-7">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => onNavigate(link.href)}
                  className={`text-xs uppercase tracking-wider font-semibold transition-colors cursor-pointer ${
                    currentRoute === link.href ? 'text-black font-bold border-b-2 border-black pb-1' : 'text-neutral-600 hover:text-black'
                  }`}
                >
                  {link.label}
                </button>
              ))}

              {/* Categories Dropdown */}
              {categories.length > 0 && (
                <div 
                  className="relative"
                  onMouseEnter={() => setCategoriesDropdownOpen(true)}
                  onMouseLeave={() => setCategoriesDropdownOpen(false)}
                >
                  <button
                    onClick={() => onNavigate('/shop')}
                    className="flex items-center gap-1 text-xs uppercase tracking-wider font-semibold text-neutral-600 hover:text-black cursor-pointer py-2"
                  >
                    <span>Categories</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {categoriesDropdownOpen && (
                    <div className="absolute top-full left-0 w-52 bg-white border border-neutral-200 rounded-lg shadow-xl py-2 z-50 animate-fade-in">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            onNavigate(`/category/${cat.slug || cat.id}`);
                            setCategoriesDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 hover:text-black cursor-pointer flex items-center justify-between"
                        >
                          <span>{cat.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </nav>

            {/* Header Action Icons */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* Search Toggle */}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                aria-label="Search"
                className="p-2 text-neutral-700 hover:text-black rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <Search className="w-5 h-5" />
              </button>

              {/* Wishlist (Desktop header only) */}
              <button
                onClick={() => onNavigate('/wishlist')}
                aria-label="Wishlist"
                className="hidden lg:inline-flex relative p-2 text-neutral-700 hover:text-black rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <Heart className="w-5 h-5" />
                {wishlistIds.length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-black text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {wishlistIds.length}
                  </span>
                )}
              </button>

              {/* Account / Admin Portal (Desktop header only) */}
              {currentUser ? (
                <div className="hidden lg:block relative group">
                  <button
                    onClick={() => onNavigate('/account')}
                    className="flex items-center gap-1 p-2 text-neutral-700 hover:text-black rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
                    aria-label="My Account"
                  >
                    <UserIcon className="w-5 h-5" />
                  </button>
                  <div className="absolute right-0 top-full hidden group-hover:block w-48 bg-white border border-neutral-200 rounded-lg shadow-xl py-2 z-50">
                    <div className="px-4 py-2 border-b border-neutral-100">
                      <p className="text-xs font-semibold text-neutral-900 truncate">{currentUser.displayName || 'Customer'}</p>
                      <p className="text-[11px] text-neutral-500 truncate">{currentUser.email}</p>
                    </div>
                    <button
                      onClick={() => onNavigate('/account')}
                      className="w-full text-left px-4 py-2 text-xs text-neutral-700 hover:bg-neutral-50 cursor-pointer flex items-center gap-2"
                    >
                      <Package className="w-3.5 h-3.5" /> My Orders
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => onNavigate('/admin')}
                        className="w-full text-left px-4 py-2 text-xs font-semibold text-black bg-neutral-100 hover:bg-neutral-200 cursor-pointer flex items-center gap-2"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> Admin Dashboard
                      </button>
                    )}
                    <button
                      onClick={() => logOut()}
                      className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 cursor-pointer flex items-center gap-2 border-t border-neutral-100"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Logout
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => onNavigate('/account')}
                  aria-label="Account Login"
                  className="hidden lg:inline-flex p-2 text-neutral-700 hover:text-black rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  <UserIcon className="w-5 h-5" />
                </button>
              )}

              {/* Cart Trigger */}
              <button
                onClick={() => setIsCartDrawerOpen(true)}
                aria-label="Cart"
                className="relative p-2 text-neutral-700 hover:text-black rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <ShoppingBag className="w-5 h-5" />
                {totalItems > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-black text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Expandable Search Bar */}
        {searchOpen && (
          <div className="bg-neutral-50 border-t border-neutral-200 p-4 animate-fade-in">
            <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto flex items-center gap-2">
              <div className="flex-1">
                <FloatingInput
                  compact
                  label="Search products by name, fabric, or SKU"
                  labelBgClass="bg-[linear-gradient(to_bottom,#fafafa_50%,#ffffff_50%)]"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  leftIcon={<Search className="w-4 h-4" />}
                />
              </div>
              <button
                type="submit"
                className="h-10 px-5 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-[6px] hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="p-2 text-neutral-500 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Mobile Drawer Navigation — Rendered outside sticky backdrop-blurred <header> so fixed viewport positioning is never clipped */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation menu">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer content */}
          <div className="fixed inset-y-0 left-0 w-[85%] max-w-xs h-dvh bg-white shadow-2xl flex flex-col z-50 animate-slide-in-left">
            {/* Drawer header with logo */}
            <div className="px-4 py-3.5 border-b border-neutral-800 flex items-center justify-between bg-black shrink-0">
              <BrandLogo variant="light" imgClassName="h-7 w-auto" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Search */}
            <form onSubmit={handleSearchSubmit} className="p-4 border-b border-neutral-100 shrink-0 bg-white">
              <FloatingInput
                compact
                label="Search catalog"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </form>

            {/* Scrollable Navigation Links */}
            <div className="flex-1 overflow-y-auto py-3 px-4 space-y-1">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => {
                    onNavigate(link.href);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left py-3 text-xs font-semibold uppercase tracking-wider border-b border-neutral-100 transition-colors cursor-pointer flex items-center justify-between ${
                    currentRoute === link.href ? 'text-black font-bold' : 'text-neutral-700 hover:text-black'
                  }`}
                >
                  <span>{link.label}</span>
                </button>
              ))}

              {/* Wishlist Shortcut on Mobile */}
              <button
                type="button"
                onClick={() => {
                  onNavigate('/wishlist');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left py-3 text-xs font-semibold uppercase tracking-wider text-neutral-700 hover:text-black border-b border-neutral-100 transition-colors cursor-pointer flex items-center justify-between"
              >
                <span>Wishlist</span>
                {wishlistIds.length > 0 && (
                  <span className="px-2 py-0.5 bg-black text-white text-[10px] font-bold rounded-full tabular-nums">
                    {wishlistIds.length}
                  </span>
                )}
              </button>

              {/* Mobile Categories Section */}
              {categories.length > 0 && (
                <div className="pt-4 pb-2">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2.5">Categories</p>
                  <div className="pl-3 space-y-1 border-l-2 border-neutral-200">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onNavigate(`/category/${c.slug || c.id}`);
                          setMobileMenuOpen(false);
                        }}
                        className="w-full text-left py-2 text-xs font-medium text-neutral-600 hover:text-black cursor-pointer"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Footer in drawer */}
            <div className="p-4 border-t border-neutral-200 bg-neutral-50 space-y-2 shrink-0">
              <PWAInstallButton />
              {currentUser ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('/account');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left p-2.5 bg-white border border-neutral-200 rounded-lg flex items-center justify-between hover:border-neutral-400 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-semibold text-neutral-900 truncate">{currentUser.displayName || 'Customer'}</p>
                      <p className="text-neutral-500 text-[11px] truncate">{currentUser.email}</p>
                    </div>
                    <Package className="w-4 h-4 text-neutral-500 shrink-0" />
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('/admin');
                        setMobileMenuOpen(false);
                      }}
                      className="w-full py-2.5 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg text-center flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Admin Dashboard</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      logOut();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full py-2 text-xs text-red-600 font-semibold text-center rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('/account');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full py-2.5 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg text-center block cursor-pointer"
                >
                  Customer Login / Register
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
