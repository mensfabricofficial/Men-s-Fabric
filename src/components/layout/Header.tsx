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
import { settingsService } from '../../services/settingsService';

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [announcement, setAnnouncement] = useState('🔥 Free Shipping on Orders Over ৳2500 across Bangladesh! Cash on Delivery Available.');
  const [announcementActive, setAnnouncementActive] = useState(true);
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false);

  useEffect(() => {
    productService.getCategories().then((cats) => {
      setCategories(cats.filter((c) => c.active));
    });
    settingsService.getSettings().then((s) => {
      if (s.announcementText) setAnnouncement(s.announcementText);
      setAnnouncementActive(s.announcementActive !== false);
    });
  }, []);

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
    { label: 'Shop All', href: '/shop' },
    { label: 'New Arrivals', href: '/shop?filter=new' },
    { label: 'Best Sellers', href: '/shop?filter=best' },
    { label: 'Track Order', href: '/track-order' },
    { label: 'About', href: '/about' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-neutral-200">
      {/* Announcement Bar */}
      {announcementActive && (
        <div className="bg-black text-white text-[11px] sm:text-xs font-medium py-1.5 px-4 text-center tracking-wide flex items-center justify-center gap-2">
          <span>{announcement}</span>
        </div>
      )}

      {/* Main Header Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
          
          {/* Mobile Menu Button */}
          <div className="flex items-center lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="p-2 -ml-2 text-neutral-800 hover:text-black cursor-pointer"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>

          {/* Official Logo */}
          <div 
            onClick={() => onNavigate('/')}
            className="flex items-center cursor-pointer select-none"
          >
            <div className="h-10 sm:h-12 flex items-center bg-black px-2 py-1 rounded">
              <img
                src="/logo.jpg"
                alt="MEN'S FABRIC"
                className="h-8 sm:h-10 object-contain"
              />
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-7">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => onNavigate(link.href)}
                className={`text-xs uppercase tracking-wider font-semibold transition-colors cursor-pointer ${
                  currentRoute === link.href ? 'text-black border-b-2 border-black pb-1' : 'text-neutral-600 hover:text-black'
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

            {/* Wishlist */}
            <button
              onClick={() => onNavigate('/wishlist')}
              aria-label="Wishlist"
              className="relative p-2 text-neutral-700 hover:text-black rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <Heart className="w-5 h-5" />
              {wishlistIds.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-black text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {wishlistIds.length}
                </span>
              )}
            </button>

            {/* Account / Admin Portal */}
            {currentUser ? (
              <div className="relative group">
                <button
                  onClick={() => onNavigate('/account')}
                  className="flex items-center gap-1 p-2 text-neutral-700 hover:text-black rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  <UserIcon className="w-5 h-5" />
                  {isAdmin && (
                    <span className="hidden sm:inline-block bg-black text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ml-1">
                      Admin
                    </span>
                  )}
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
                className="p-2 text-neutral-700 hover:text-black rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
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
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products by name, fabric, or SKU..."
                autoFocus
                className="w-full pl-10 pr-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-black"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
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

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer content */}
          <div className="fixed inset-y-0 left-0 w-4/5 max-w-xs bg-white shadow-2xl flex flex-col justify-between z-50">
            <div>
              {/* Drawer header with logo */}
              <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-black">
                <img src="/logo.jpg" alt="MEN'S FABRIC" className="h-8 object-contain" />
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-white hover:text-neutral-300 cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Mobile Search */}
              <form onSubmit={handleSearchSubmit} className="p-4 border-b border-neutral-100">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search catalog..."
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs"
                  />
                </div>
              </form>

              {/* Navigation Links */}
              <div className="py-2 px-4 space-y-1">
                {navLinks.map((link) => (
                  <button
                    key={link.label}
                    onClick={() => {
                      onNavigate(link.href);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left py-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-800 hover:text-black border-b border-neutral-50"
                  >
                    {link.label}
                  </button>
                ))}

                {/* Mobile Categories Accordion */}
                {categories.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Categories</p>
                    <div className="pl-2 space-y-1 border-l-2 border-neutral-200">
                      {categories.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            onNavigate(`/category/${c.slug || c.id}`);
                            setMobileMenuOpen(false);
                          }}
                          className="w-full text-left py-1.5 text-xs font-medium text-neutral-600 hover:text-black"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile Footer in drawer */}
            <div className="p-4 border-t border-neutral-200 bg-neutral-50 space-y-2">
              {currentUser ? (
                <>
                  <div className="text-xs">
                    <p className="font-semibold text-neutral-900">{currentUser.displayName || 'Customer'}</p>
                    <p className="text-neutral-500 text-[11px] truncate">{currentUser.email}</p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        onNavigate('/admin');
                        setMobileMenuOpen(false);
                      }}
                      className="w-full py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded text-center block"
                    >
                      Admin Dashboard
                    </button>
                  )}
                  <button
                    onClick={() => {
                      logOut();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full py-2 text-xs text-red-600 font-semibold text-center block"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    onNavigate('/account');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full py-2.5 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded text-center block"
                >
                  Customer Login / Register
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
