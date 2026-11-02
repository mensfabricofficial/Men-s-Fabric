import React, { useState, useEffect, useMemo } from 'react';
import { 
  Filter, 
  X, 
  SlidersHorizontal, 
  Check, 
  ChevronDown, 
  RotateCcw,
  Search
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
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Filters State
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || '');
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'price-asc' | 'price-desc' | 'popular'>('newest');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 15000]);
  const [searchQuery, setSearchQuery] = useState('');

  // Parse URL params for initial filters (e.g. ?search=, ?filter=new, ?filter=best)
  useEffect(() => {
    const url = new URL(window.location.origin + currentRoute);
    const searchParam = url.searchParams.get('search');
    const filterParam = url.searchParams.get('filter');
    const catParam = url.searchParams.get('category');

    if (searchParam) setSearchQuery(searchParam);
    if (catParam) setSelectedCategory(catParam);
    if (filterParam === 'best') setSortBy('popular');
  }, [currentRoute]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      productService.getAllProductsAdmin(), // Retrieve catalog
      productService.getCategories(),
    ])
      .then(([productsRes, catsRes]) => {
        // Filter to active products for public shop
        const activeOnly = productsRes.filter((p) => p.active !== false);
        setAllProducts(activeOnly);
        setCategories(catsRes.filter((c) => c.active));
      })
      .finally(() => {
        setLoading(false);
      });
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
          // Also match slug
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
        // Price
        const effectivePrice = product.salePrice || product.price;
        if (effectivePrice < priceRange[0] || effectivePrice > priceRange[1]) {
          return false;
        }
        // Search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = product.name?.toLowerCase().includes(q);
          const matchSku = product.sku?.toLowerCase().includes(q);
          const matchFabric = product.fabric?.toLowerCase().includes(q);
          const matchDesc = product.description?.toLowerCase().includes(q);
          if (!matchName && !matchSku && !matchFabric && !matchDesc) return false;
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
  }, [allProducts, selectedCategory, selectedGender, selectedSize, inStockOnly, priceRange, searchQuery, sortBy, categories]);

  const resetFilters = () => {
    setSelectedCategory('');
    setSelectedGender('all');
    setSelectedSize('');
    setInStockOnly(false);
    setPriceRange([0, 15000]);
    setSearchQuery('');
    setSortBy('newest');
  };

  const hasActiveFilters =
    Boolean(selectedCategory) ||
    selectedGender !== 'all' ||
    Boolean(selectedSize) ||
    inStockOnly ||
    Boolean(searchQuery) ||
    priceRange[0] > 0 ||
    priceRange[1] < 15000;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      
      {/* Breadcrumb & Header */}
      <div className="border-b border-neutral-200 pb-6 mb-8">
        <div className="flex items-center gap-2 text-xs text-neutral-400 uppercase tracking-wider mb-2">
          <button onClick={() => onNavigate('/')} className="hover:text-black cursor-pointer">Home</button>
          <span>/</span>
          <span className="text-black font-semibold">Shop Collection</span>
          {selectedCategory && (
            <>
              <span>/</span>
              <span className="text-neutral-700 capitalize">
                {categories.find((c) => c.slug === selectedCategory || c.id === selectedCategory)?.name || selectedCategory}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 uppercase">
              {selectedCategory
                ? categories.find((c) => c.slug === selectedCategory || c.id === selectedCategory)?.name || 'Collection'
                : 'All Menswear'}
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              Showing {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
            </p>
          </div>

          {/* Controls: Search input & Sort dropdown & Mobile filter button */}
          <div className="flex items-center gap-2.5">
            {/* Search filter input */}
            <div className="relative hidden md:block w-52">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="px-3 py-2 bg-white border border-neutral-200 rounded-lg text-xs font-semibold uppercase tracking-wider text-neutral-800 focus:outline-none focus:border-black cursor-pointer appearance-none pr-8"
              >
                <option value="newest">Sort: Newest</option>
                <option value="popular">Sort: Best Selling</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500" />
            </div>

            {/* Mobile Filter Toggle */}
            <button
              onClick={() => setMobileFilterOpen(true)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold uppercase tracking-wider cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-white ml-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-neutral-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mr-1">Active:</span>
            {selectedCategory && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-800 text-xs rounded-full">
                Category: {categories.find((c) => c.id === selectedCategory || c.slug === selectedCategory)?.name || selectedCategory}
                <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSelectedCategory('')} />
              </span>
            )}
            {selectedGender !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-800 text-xs rounded-full capitalize">
                Gender: {selectedGender}
                <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSelectedGender('all')} />
              </span>
            )}
            {selectedSize && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-800 text-xs rounded-full">
                Size: {selectedSize}
                <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSelectedSize('')} />
              </span>
            )}
            {inStockOnly && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-800 text-xs rounded-full">
                In Stock Only
                <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setInStockOnly(false)} />
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-800 text-xs rounded-full">
                Search: "{searchQuery}"
                <X className="w-3 h-3 cursor-pointer hover:text-black" onClick={() => setSearchQuery('')} />
              </span>
            )}
            <button
              onClick={resetFilters}
              className="text-xs text-red-600 font-semibold hover:underline flex items-center gap-1 ml-2 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Clear All
            </button>
          </div>
        )}
      </div>

      {/* Main Content Layout: Sidebar + Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Desktop Filter Sidebar */}
        <aside className="hidden lg:block space-y-6 pr-4">
          
          {/* Categories Filter */}
          <div className="border-b border-neutral-200 pb-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">Categories</h3>
            <div className="space-y-1.5">
              <button
                onClick={() => setSelectedCategory('')}
                className={`w-full text-left py-1 text-xs font-medium cursor-pointer flex items-center justify-between ${
                  !selectedCategory ? 'font-bold text-black' : 'text-neutral-500 hover:text-black'
                }`}
              >
                <span>All Categories</span>
                <span>{allProducts.length}</span>
              </button>
              {categories.map((c) => {
                const count = allProducts.filter((p) => p.category === c.id || p.category === c.slug).length;
                const isSelected = selectedCategory === c.id || selectedCategory === c.slug;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCategory(isSelected ? '' : (c.slug || c.id))}
                    className={`w-full text-left py-1 text-xs font-medium cursor-pointer flex items-center justify-between ${
                      isSelected ? 'font-bold text-black' : 'text-neutral-500 hover:text-black'
                    }`}
                  >
                    <span>{c.name}</span>
                    <span className="text-[11px] text-neutral-400">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gender Filter */}
          <div className="border-b border-neutral-200 pb-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">Gender / Fit</h3>
            <div className="flex flex-wrap gap-1.5">
              {['all', 'men', 'women', 'unisex', 'kids'].map((g) => (
                <button
                  key={g}
                  onClick={() => setSelectedGender(g)}
                  className={`px-3 py-1.5 text-xs rounded border capitalize transition-colors cursor-pointer ${
                    selectedGender === g
                      ? 'border-black bg-black text-white font-semibold'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-black'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Sizes Filter */}
          {availableSizes.length > 0 && (
            <div className="border-b border-neutral-200 pb-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">Size</h3>
              <div className="flex flex-wrap gap-1.5">
                {availableSizes.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSize(selectedSize === s ? '' : s)}
                    className={`min-w-9 h-8 px-2 flex items-center justify-center text-xs font-semibold rounded border transition-colors cursor-pointer ${
                      selectedSize === s
                        ? 'border-black bg-black text-white'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:border-black'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Availability */}
          <div className="border-b border-neutral-200 pb-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">Availability</h3>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="w-4 h-4 accent-black rounded"
              />
              <span>In Stock items only</span>
            </label>
          </div>

        </aside>

        {/* Product Grid Area */}
        <div className="lg:col-span-3">
          <ProductGrid
            products={filteredProducts}
            loading={loading}
            emptyTitle={hasActiveFilters ? "No products match filters" : "No products available yet"}
            emptyDescription={
              hasActiveFilters
                ? "Try clearing some filters to explore our full selection."
                : "Our catalog is being updated with fresh fabrics. Please check back soon or browse other categories."
            }
            onResetFilters={hasActiveFilters ? resetFilters : undefined}
            onNavigate={onNavigate}
          />
        </div>

      </div>

      {/* Mobile Filters Drawer / Bottom Sheet */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileFilterOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 w-full max-w-xs bg-white shadow-2xl flex flex-col justify-between p-5 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-neutral-200 mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">Filters</h3>
                <button
                  onClick={() => setMobileFilterOpen(false)}
                  className="p-1 text-neutral-500 hover:text-black cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Search */}
              <div className="mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search catalog..."
                  className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-300 rounded-lg"
                />
              </div>

              {/* Mobile Categories */}
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Category</p>
                <div className="space-y-1">
                  <button
                    onClick={() => setSelectedCategory('')}
                    className={`w-full text-left py-1 text-xs ${!selectedCategory ? 'font-bold text-black' : 'text-neutral-600'}`}
                  >
                    All Categories
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategory(c.slug || c.id)}
                      className={`w-full text-left py-1 text-xs ${
                        selectedCategory === c.id || selectedCategory === c.slug ? 'font-bold text-black' : 'text-neutral-600'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile Sizes */}
              {availableSizes.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Size</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableSizes.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSelectedSize(selectedSize === s ? '' : s)}
                        className={`min-w-8 h-8 px-2 flex items-center justify-center text-xs rounded border ${
                          selectedSize === s ? 'bg-black text-white border-black' : 'border-neutral-200 text-neutral-700'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Availability */}
              <div className="mb-5">
                <label className="flex items-center gap-2 text-xs text-neutral-800">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  <span>In Stock items only</span>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-200 flex gap-2">
              <button
                onClick={resetFilters}
                className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 text-xs font-semibold rounded-lg uppercase tracking-wider"
              >
                Reset
              </button>
              <button
                onClick={() => setMobileFilterOpen(false)}
                className="flex-1 py-2.5 bg-black text-white text-xs font-semibold rounded-lg uppercase tracking-wider"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
