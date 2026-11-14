import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Sparkles, Shield, Award, Layers } from 'lucide-react';
import { Product, Category, Banner, Review } from '../types';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { ProductGrid } from '../components/product/ProductGrid';

interface HomePageProps {
  onNavigate: (route: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const initialProducts = productService.getInstantActiveProducts();
  const initialCategories = productService.getInstantCategories();

  const [banners, setBanners] = useState<Banner[]>(() => settingsService.getLocalBanners().filter((b) => b.active));
  const [categories, setCategories] = useState<Category[]>(() => (initialCategories || []).filter((c) => c.active));
  const [newArrivals, setNewArrivals] = useState<Product[]>(() => {
    if (!initialProducts) return [];
    const arrivals = initialProducts.filter((p) => p.newArrival);
    return arrivals.length > 0 ? arrivals.slice(0, 8) : initialProducts.slice(0, 8);
  });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(initialProducts === null);

  useEffect(() => {
    // Real-time products subscription
    const unsubProducts = productService.subscribeToActiveProducts((products) => {
      const arrivals = products.filter((p) => p.newArrival);
      setNewArrivals(arrivals.length > 0 ? arrivals.slice(0, 8) : products.slice(0, 8));
      setLoadingProducts(false);
    });

    // Real-time categories subscription
    const unsubCategories = productService.subscribeToCategories((cats) => {
      setCategories(cats.filter((c) => c.active));
    });

    // Real-time banners subscription
    const unsubBanners = settingsService.subscribeToBanners((bList) => {
      setBanners(bList.filter((b) => b.active));
    });

    return () => {
      unsubProducts();
      unsubCategories();
      unsubBanners();
    };
  }, []);

  const activeBanner = banners.length > 0 ? banners[0] : null;

  return (
    <div className="space-y-16 sm:space-y-24 pb-16">
      
      {/* Hero Section */}
      <section className="relative bg-neutral-950 text-white overflow-hidden min-h-[460px] sm:min-h-[560px] flex items-center">
        {activeBanner ? (
          <div className="relative w-full h-full min-h-[460px] sm:min-h-[560px] flex items-center">
            {activeBanner.image && (
              <img
                src={activeBanner.image}
                alt={activeBanner.title}
                className="absolute inset-0 w-full h-full object-cover object-center opacity-40"
              />
            )}
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 z-10 w-full">
              <div className="max-w-2xl space-y-5">
                {activeBanner.badge && (
                  <span className="inline-block bg-white text-black text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded">
                    {activeBanner.badge}
                  </span>
                )}
                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
                  {activeBanner.title}
                </h1>
                {activeBanner.subtitle && (
                  <p className="text-sm sm:text-lg text-neutral-300 font-normal leading-relaxed">
                    {activeBanner.subtitle}
                  </p>
                )}
                <div className="pt-2">
                  <button
                    onClick={() => onNavigate(activeBanner.buttonLink || '/shop')}
                    className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-200 transition-colors shadow-lg cursor-pointer"
                  >
                    <span>{activeBanner.buttonText || 'Explore Collection'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Default Brand Hero when no banners exist in Firestore yet */
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 w-full">
            <div className="max-w-3xl space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-full text-xs text-neutral-300 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
                <span>Elegance Defined • Contemporary Bangladeshi Menswear</span>
              </div>
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-none">
                SELVEE
              </h1>
              <p className="text-base sm:text-xl text-neutral-400 font-light max-w-xl leading-relaxed">
                Elevate your presence with meticulously engineered menswear. Experience breathable pure cottons, regal panjabis, and sharp silhouettes tailored for distinction.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 pt-4">
                <button
                  onClick={() => onNavigate('/shop')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-200 transition-colors shadow-lg cursor-pointer"
                >
                  <span>Shop Collection</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onNavigate('/shop?filter=new')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-transparent border border-neutral-700 text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-900 transition-colors cursor-pointer"
                >
                  <span>New Arrivals</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Featured Categories */}
      {categories.length > 0 && (
        <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-xs uppercase tracking-widest font-semibold text-neutral-400">Curated Collections</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mt-1">Shop by Category</h2>
            </div>
            <button
              onClick={() => onNavigate('/shop')}
              className="text-xs font-bold uppercase tracking-wider text-black hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View All</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {categories.map((cat) => (
              <div
                key={cat.id}
                onClick={() => onNavigate(`/category/${cat.slug || cat.id}`)}
                className="group relative aspect-[4/5] bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200 cursor-pointer shadow-sm hover:shadow-md transition-all"
              >
                {cat.image ? (
                  <img
                    src={cat.image}
                    alt={cat.name}
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-white p-6 text-center">
                    <span className="text-sm font-bold uppercase tracking-wider">{cat.name}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4 text-white">
                  <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider">{cat.name}</h3>
                  <p className="text-[11px] text-neutral-300 flex items-center gap-1 mt-0.5 group-hover:translate-x-1 transition-transform">
                    <span>Explore Products</span>
                    <ChevronRight className="w-3 h-3" />
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* New Arrivals Section */}
      <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold text-neutral-400">Fresh from the atelier</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mt-1">New Arrivals</h2>
          </div>
          <button
            onClick={() => onNavigate('/shop?filter=new')}
            className="text-xs font-bold uppercase tracking-wider text-black hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>See All New</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <ProductGrid
          products={newArrivals}
          loading={loadingProducts}
          emptyTitle="New collection releasing soon"
          emptyDescription="Our craftsmen are preparing the next drop. Check back shortly or browse our current catalog."
          onNavigate={onNavigate}
        />
      </section>

      {/* Brand Craftsmanship Spotlight */}
      <section className="bg-neutral-50 border-y border-neutral-200 py-16 sm:py-20">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12 text-center md:text-left">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-lg bg-black text-white flex items-center justify-center mx-auto md:mx-0 shadow-sm">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-neutral-900 uppercase tracking-wider">Heritage & Weave</h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Every fabric is hand-selected from the finest mills. From long-staple Egyptian cottons to raw linen blends designed specifically for the climate of Bangladesh.
              </p>
            </div>

            <div className="space-y-3">
              <div className="w-12 h-12 rounded-lg bg-black text-white flex items-center justify-center mx-auto md:mx-0 shadow-sm">
                <Award className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-neutral-900 uppercase tracking-wider">Tailored Precision</h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Engineered with bespoke collar stiffeners, reinforced seam finishes, and natural drape to ensure comfortable all-day wear without compromise.
              </p>
            </div>

            <div className="space-y-3">
              <div className="w-12 h-12 rounded-lg bg-black text-white flex items-center justify-center mx-auto md:mx-0 shadow-sm">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-neutral-900 uppercase tracking-wider">Trust & Integrity</h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Inspect your package right at your doorstep before final payment. We pride ourselves on transparent, dependable Cash on Delivery across the nation.
              </p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
};
