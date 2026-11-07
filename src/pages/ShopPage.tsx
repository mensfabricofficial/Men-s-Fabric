import React, { useState, useEffect, useMemo } from 'react';
import { 
  Filter, 
  X, 
  SlidersHorizontal, 
  Check, 
  ChevronDown, 
  RotateCcw,
  Search,
  Sparkles
} from 'lucide-react';
import { Product, Category } from '../types';
import { productService } from '../services/productService';
import { ProductGrid } from '../components/product/ProductGrid';

interface ShopPageProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  initialCategory?: string;
}

export const ShopPage: React.FC<ShopPageProps> = ({ currentRoute, onNavigate, initialCategory }) => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

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
    setLoading(true);

    const unsubProducts = productService.subscribeToActiveProducts((products) => {
      setAllProducts(products);
      setLoading(false);
    });

    const unsubCategories = productService.subscribeToCategories((cats) => {
      setCategories(cats.filter((c) => c.active));
    });

    return () => {
      unsubProducts();
      unsubCategories();
    };
  }, []);

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
        if (inStockOnly && product.totalStock <= 0) {
          return false;
        }
        // Price Max
        const price = typeof product.salePrice === 'number' && product.salePrice > 0 ? product.salePrice : product.price;
        if (price > priceMax) {
          return false;
        }
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = product.name.toLowerCase().includes(q);
          const matchSku = product.sku?.toLowerCase().includes(q);
          const matchFabric = product.fabric?.toLowerCase().includes(q);
          const matchDesc = product.description?.toLowerCase().includes(q);
          if (!matchName && !matchSku && !matchFabric && !matchDesc) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const priceA = a.salePrice || a.price;
        const priceB = b.salePrice || b.price;
        if (sortBy === 'price-asc') return priceA - priceB;
        if (sortBy === 'price-desc') return priceB - priceA;
        if (sortBy === 'popular') return (b.bestSeller ? 1 : 0) - (a.bestSeller ? 1 : 0);
        // Default newest
        return new Date(b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt || 0).getTime() -
               new Date(a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt || 0).getTime();
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
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-6 sm:py-10">
      
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
        <button
          onClick={() => setSelectedCategory('')}
          className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer shrink-0 ${
            !selectedCategory
              ? 'bg-black text-white shadow-xs'
              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          All
        </button>
        {categories.map((c) => {
          const isSelected = selectedCategory === c.id || selectedCategory === c.slug;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(isSelected ? '' : (c.slug || c.id))}
              className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                isSelected
                  ? 'bg-black text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {/* Filter & Sort Controls Bar (Responsive Mobile Grid + Desktop Flex) */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3 sm:p-4 mb-6 shadow-2xs space-y-3">
        
        {/* Search Bar - Full width on mobile, inline on desktop */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-full sm:max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by title, fabric, or SKU..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black text-neutral-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Sort dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-500 uppercase hidden sm:inline">Sort:</span>
            <div className="relative flex-1 sm:flex-initial">
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="w-full sm:w-auto px-3.5 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-800 cursor-pointer appearance-none pr-8 focus:outline-none focus:border-black"
              >
                <option value="newest">Sort: Newest First</option>
                <option value="popular">Sort: Best Selling</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500" />
            </div>

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="text-xs text-red-600 font-semibold hover:underline flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer shrink-0 transition-colors"
                title="Reset all filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Selectors - Clean 2-column or 4-column aligned responsive grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-neutral-100 text-xs">
          
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
              <option value="unisex">Unisex</option>
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
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mr-1">Active Filters:</span>
            {selectedCategory && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full">
                Category: {categories.find((c) => c.id === selectedCategory || c.slug === selectedCategory)?.name || selectedCategory}
                <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSelectedCategory('')} />
              </span>
            )}
            {selectedGender !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full capitalize">
                Gender: {selectedGender}
                <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSelectedGender('all')} />
              </span>
            )}
            {selectedSize && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full">
                Size: {selectedSize}
                <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSelectedSize('')} />
              </span>
            )}
            {priceMax < 15000 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full">
                Max Price: ৳{priceMax.toLocaleString('en-BD')}
                <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setPriceMax(15000)} />
              </span>
            )}
            {inStockOnly && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full">
                In Stock Only
                <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setInStockOnly(false)} />
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-neutral-100 text-neutral-800 text-xs rounded-full">
                Search: "{searchQuery}"
                <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSearchQuery('')} />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Promotional Bar (Illiyeen inspiration) */}
      <div className="bg-black text-white text-xs sm:text-sm font-semibold py-3 px-4 rounded-xl text-center mb-6 tracking-wide shadow-xs flex items-center justify-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
        <span>Save with Digital Prepayment (bKash, Nagad, Rocket) | Cash on Delivery Available Across Bangladesh</span>
      </div>

      {/* Product Catalog Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-neutral-500 font-medium">
            Showing <span className="font-bold text-neutral-900">{filteredProducts.length}</span> {filteredProducts.length === 1 ? 'product' : 'products'}
          </p>
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
