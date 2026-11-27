import React, { useState, useEffect, useMemo } from 'react';
import { 
  Filter, 
  X, 
  SlidersHorizontal, 
  Check, 
  ChevronDown, 
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Category, SiteSettings } from '../types';
import { productService } from '../services/productService';
import { settingsService, defaultSettings } from '../services/settingsService';
import { ProductGrid } from '../components/product/ProductGrid';

interface ShopPageProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  initialCategory?: string;
}

export const ShopPage: React.FC<ShopPageProps> = ({ currentRoute, onNavigate, initialCategory }) => {
  const initialProducts = productService.getInstantActiveProducts();
  const initialCategories = productService.getInstantCategories();

  const [allProducts, setAllProducts] = useState<Product[]>(initialProducts || []);
  const [categories, setCategories] = useState<Category[]>(() => (initialCategories || []).filter((c) => c.active));
  const [loading, setLoading] = useState(initialProducts === null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => settingsService.getInstantSettings() || defaultSettings);

  // Filters State
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || '');
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'price-asc' | 'price-desc' | 'popular'>('newest');
  const [priceMax, setPriceMax] = useState<number>(15000);
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown open states for top filter bar
  const [genderOpen, setGenderOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  // Parse URL params for initial filters
  useEffect(() => {
    const url = new URL(window.location.origin + currentRoute);
    const searchParam = url.searchParams.get('search');
    const filterParam = url.searchParams.get('filter');
    const catParam = url.searchParams.get('category');

    if (searchParam) setSearchQuery(searchParam);
    if (catParam) setSelectedCategory(catParam);
    if (filterParam === 'best') setSortBy('popular');
    if (filterParam === 'new') setSortBy('newest');
  }, [currentRoute]);

  // Real-time synchronization
  useEffect(() => {
    const unsubProducts = productService.subscribeToActiveProducts((products) => {
      setAllProducts(products);
      setLoading(false);
    });

    const unsubCategories = productService.subscribeToCategories((cats) => {
      setCategories(cats.filter((c) => c.active));
    });

    const unsubSettings = settingsService.subscribeToSettings((s) => {
      setSiteSettings(s);
    });

    return () => {
      unsubProducts();
      unsubCategories();
      unsubSettings();
    };
  }, []);

  const hasOnlineDiscount =
    Boolean(siteSettings.paymentSettings?.onlineDiscountActive) &&
    Number(siteSettings.paymentSettings?.onlineDiscountValue || 0) > 0;

  // Compute available sizes from products
  const availableSizes = useMemo(() => {
    const set = new Set<string>();
    allProducts.forEach((p) => {
      (p.sizes || []).forEach((s) => set.add(s));
      (p.variants || []).forEach((v) => { if (v.size) set.add(v.size); });
    });
    return Array.from(set);
  }, [allProducts]);

  // Filtered & sorted products
  const filteredProducts = useMemo(() => {
    return allProducts
      .filter((product) => {
        // Category
        if (selectedCategory && product.category !== selectedCategory && product.slug !== selectedCategory) {
          const cat = categories.find((c) => c.slug === selectedCategory || c.id === selectedCategory);
          if (cat && product.category !== cat.id && product.category !== cat.slug) {
            return false;
          }
        }
        // Gender
        if (selectedGender !== 'all' && product.gender !== selectedGender && product.gender !== 'unisex') {
          return false;
        }
        // Size
        if (selectedSize) {
          const hasSize = (product.sizes || []).includes(selectedSize) ||
            (product.variants || []).some((v) => v.size === selectedSize && v.stock > 0);
          if (!hasSize) return false;
        }
        // Stock
        if (inStockOnly && (Number(product.totalStock) || 0) <= 0) {
          return false;
        }
        // Price Max
        const price =
          typeof product.salePrice === 'number' && product.salePrice > 0
            ? product.salePrice
            : Number(product.price) || 0;
        if (price > priceMax) {
          return false;
        }
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = (product.name || '').toLowerCase().includes(q);
          const matchSku = (product.sku || '').toLowerCase().includes(q);
          const matchFabric = (product.fabric || '').toLowerCase().includes(q);
          const matchDesc = (product.description || '').toLowerCase().includes(q);
          if (!matchName && !matchSku && !matchFabric && !matchDesc) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const priceA = Number(a.salePrice) || Number(a.price) || 0;
        const priceB = Number(b.salePrice) || Number(b.price) || 0;
        if (sortBy === 'price-asc') return priceA - priceB;
        if (sortBy === 'price-desc') return priceB - priceA;
        if (sortBy === 'popular') return (b.bestSeller ? 1 : 0) - (a.bestSeller ? 1 : 0);
        // Default newest
        const toMs = (val: any): number => {
          if (!val) return 0;
          if (typeof val?.toMillis === 'function') return val.toMillis();
          if (typeof val?.toDate === 'function') return val.toDate().getTime() || 0;
          if (typeof val?.seconds === 'number') return val.seconds * 1000;
          const ms = new Date(val).getTime();
          return isNaN(ms) ? 0 : ms;
        };
        return toMs(b.createdAt) - toMs(a.createdAt);
      });
  }, [allProducts, selectedCategory, selectedGender, selectedSize, inStockOnly, priceMax, searchQuery, sortBy, categories]);

  const resetFilters = () => {
    setSelectedCategory('');
    setSelectedGender('all');
    setSelectedSize('');
    setInStockOnly(false);
    setPriceMax(15000);
    setSearchQuery('');
    setSortBy('newest');
  };

  const hasActiveFilters =
    Boolean(selectedCategory) ||
    selectedGender !== 'all' ||
    Boolean(selectedSize) ||
    inStockOnly ||
    Boolean(searchQuery) ||
    priceMax < 15000;

  return (
    <div className="max-w-[1660px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      
      {/* Top Breadcrumb & Page Title */}
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs text-neutral-400 uppercase tracking-wider mb-1.5">
          <button onClick={() => onNavigate('/')} className="hover:text-black cursor-pointer">Home</button>
          <span>/</span>
          <span className="text-black font-semibold">All Products</span>
          {selectedCategory && (
            <>
              <span>/</span>
              <span className="text-neutral-700 capitalize font-medium">
                {categories.find((c) => c.slug === selectedCategory || c.id === selectedCategory)?.name || selectedCategory}
              </span>
            </>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 uppercase">
          {selectedCategory
            ? categories.find((c) => c.slug === selectedCategory || c.id === selectedCategory)?.name || 'Collection'
            : 'All Products'}
        </h1>
      </div>

      {/* Top Horizontal Category Pills Bar (Touch-friendly & Smooth Scrolling) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none touch-pan-x">
        {loading && categories.length === 0 ? (
          Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="h-8 w-20 rounded-full skeleton-shimmer shrink-0"
            />
          ))
        ) : (
          <>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedCategory('')}
              className={`relative px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
                !selectedCategory
                  ? 'text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {!selectedCategory && (
                <motion.span
                  layoutId="shop-cat-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-full bg-black"
                />
              )}
              <span className="relative z-10">All</span>
            </motion.button>
            {categories.map((c) => {
              const isSelected = selectedCategory === c.id || selectedCategory === c.slug;
              return (
                <motion.button
                  key={c.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedCategory(isSelected ? '' : (c.slug || c.id))}
                  className={`relative px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
                    isSelected
                      ? 'text-white shadow-xs'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="shop-cat-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-full bg-black"
                    />
                  )}
                  <span className="relative z-10">{c.name}</span>
                </motion.button>
              );
            })}
          </>
        )}
      </div>

      {/* Filter & Sort Controls Bar (Responsive Mobile Grid + Single-row Desktop) */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3 sm:p-4 mb-6 shadow-2xs space-y-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          {/* Quick Sort dropdown */}
          <div className="relative col-span-2 sm:col-span-1">
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg font-semibold text-neutral-800 cursor-pointer appearance-none pr-7 focus:outline-none focus:border-black"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="popular">Sort: Best Selling</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500" />
          </div>
          
          {/* Gender Selector */}
          <div className="relative">
            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg font-semibold text-neutral-800 cursor-pointer appearance-none pr-7 focus:outline-none focus:border-black"
            >
              <option value="all">Gender: All</option>
              <option value="men">Men</option>
              <option value="women">Women</option>
              <option value="kids">Kids</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500" />
          </div>

          {/* Size Selector */}
          <div className="relative">
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg font-semibold text-neutral-800 cursor-pointer appearance-none pr-7 focus:outline-none focus:border-black"
            >
              <option value="">Size: All Sizes</option>
              {availableSizes.map((s) => (
                <option key={s} value={s}>
                  Size: {s}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500" />
          </div>

          {/* Price Max Filter */}
          <div className="relative">
            <select
              value={priceMax}
              onChange={(e) => setPriceMax(Number(e.target.value))}
              className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg font-semibold text-neutral-800 cursor-pointer appearance-none pr-7 focus:outline-none focus:border-black"
            >
              <option value={15000}>Price: Any Price</option>
              <option value={1500}>Under ৳1,500</option>
              <option value={2500}>Under ৳2,500</option>
              <option value={4000}>Under ৳4,000</option>
              <option value={6000}>Under ৳6,000</option>
              <option value={10000}>Under ৳10,000</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500" />
          </div>

          {/* Availability / In Stock Toggle Button */}
          <button
            onClick={() => setInStockOnly(!inStockOnly)}
            className={`w-full px-3 py-2 rounded-lg font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              inStockOnly
                ? 'bg-black text-white border-black'
                : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${inStockOnly ? 'bg-emerald-400' : 'bg-neutral-400'}`} />
            <span className="truncate">In Stock Only</span>
          </button>

        </div>

        {/* Active Filter Chips */}
        <AnimatePresence initial={false}>
          {hasActiveFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mr-1">Active Filters:</span>
                {selectedCategory && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full animate-scale-in">
                    Category: {categories.find((c) => c.id === selectedCategory || c.slug === selectedCategory)?.name || selectedCategory}
                    <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSelectedCategory('')} />
                  </span>
                )}
                {selectedGender !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full capitalize animate-scale-in">
                    Gender: {selectedGender}
                    <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSelectedGender('all')} />
                  </span>
                )}
                {selectedSize && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full animate-scale-in">
                    Size: {selectedSize}
                    <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSelectedSize('')} />
                  </span>
                )}
                {priceMax < 15000 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full animate-scale-in">
                    Max Price: ৳{priceMax.toLocaleString('en-BD')}
                    <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setPriceMax(15000)} />
                  </span>
                )}
                {inStockOnly && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full animate-scale-in">
                    In Stock Only
                    <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setInStockOnly(false)} />
                  </span>
                )}
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full animate-scale-in">
                    Search: "{searchQuery}"
                    <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSearchQuery('')} />
                  </span>
                )}
                <button
                  onClick={resetFilters}
                  className="ml-auto text-xs text-red-600 font-semibold hover:underline flex items-center gap-1 px-2.5 py-1 bg-red-50 hover:bg-red-100 rounded-full cursor-pointer shrink-0 transition-colors"
                  title="Reset all filters"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Promotional Bar */}
      <div className="bg-black text-white text-xs sm:text-sm font-semibold py-3 px-4 rounded-xl text-center mb-6 tracking-wide shadow-xs flex items-center justify-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          {hasOnlineDiscount
            ? `Save ${siteSettings.paymentSettings?.onlineDiscountType === 'percentage' ? `${siteSettings.paymentSettings?.onlineDiscountValue}%` : `৳${siteSettings.paymentSettings?.onlineDiscountValue}`} with Digital Prepayment (bKash, Nagad, Rocket) | Cash on Delivery Available Across Bangladesh`
            : 'Digital Prepayment (bKash, Nagad, Rocket) & Cash on Delivery Available Across Bangladesh'}
        </span>
      </div>

      {/* Product Catalog Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          {loading && allProducts.length === 0 ? (
            <div className="h-4 w-32 rounded skeleton-shimmer" aria-hidden="true" />
          ) : (
            <p className="text-xs text-neutral-500 font-medium">
              Showing <span className="font-bold text-neutral-900">{filteredProducts.length}</span> {filteredProducts.length === 1 ? 'product' : 'products'}
            </p>
          )}
        </div>

        <ProductGrid
          products={filteredProducts}
          loading={loading}
          onNavigate={onNavigate}
        />
      </div>

    </div>
  );
};
