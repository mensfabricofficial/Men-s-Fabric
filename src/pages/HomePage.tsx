import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Shield, Award, Layers } from 'lucide-react';
import { Product, Category, Banner, Review } from '../types';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { ProductGrid } from '../components/product/ProductGrid';
import { ProgressiveImage } from '../components/common/ProgressiveImage';

interface HomePageProps {
  onNavigate: (route: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const initialProducts = productService.getInstantActiveProducts();
  const initialCategories = productService.getInstantCategories();
  const bannersReady = settingsService.hasLoadedBanners();

  const [banners, setBanners] = useState<Banner[]>(() => settingsService.getInstantBanners(true));
  const [loadingBanners, setLoadingBanners] = useState(!bannersReady);
  const [categories, setCategories] = useState<Category[]>(() => (initialCategories || []).filter((c) => c.active));
  const [loadingCategories, setLoadingCategories] = useState(initialCategories === null);
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
      setLoadingCategories(false);
    });

    // Real-time banners subscription
    const unsubBanners = settingsService.subscribeToBanners((bList) => {
      setBanners(bList.filter((b) => b.active));
      setLoadingBanners(false);
    });

    return () => {
      unsubProducts();
      unsubCategories();
      unsubBanners();
    };
  }, []);

  const activeBanner = banners.length > 0 ? banners[0] : null;
  const hasBannerText = Boolean(
    activeBanner &&
      (activeBanner.badge?.trim() || activeBanner.title?.trim() || activeBanner.subtitle?.trim())
  );
  const hasBannerButton = Boolean(activeBanner && activeBanner.buttonText?.trim());

  return (
    <div className="space-y-7 sm:space-y-12">
      
      {/* Banner Section — aligned left & right with Shop by Category / View All */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        {loadingBanners ? (
          <div className="w-full aspect-[16/9] sm:aspect-[21/9] bg-neutral-100 rounded-xl animate-pulse" />
        ) : activeBanner ? (
          <div
            onClick={() => onNavigate(activeBanner.buttonLink || '/shop')}
            className="relative w-full bg-neutral-100 text-white rounded-xl overflow-hidden cursor-pointer group"
          >
            {activeBanner.image && activeBanner.image.trim() ? (
              <ProgressiveImage
                src={activeBanner.image.trim()}
                alt={activeBanner.title || 'Selvee Promotional Banner'}
                decoding="async"
                fetchPriority="high"
                wrapperClassName="relative w-full min-h-[180px] sm:min-h-[280px] overflow-hidden bg-neutral-100"
                skeletonClassName="bg-neutral-200/70 animate-pulse"
                className={`w-full h-auto block select-none ${
                  hasBannerText ? 'opacity-80' : 'opacity-100'
                }`}
                emptyFallback={<div className="w-full aspect-[16/9] sm:aspect-[21/9] bg-black" />}
              />
            ) : (
              <div className="w-full aspect-[16/9] sm:aspect-[21/9] bg-black" />
            )}

            {(hasBannerText || hasBannerButton) && (
              <div
                className={`absolute inset-0 flex items-center p-3.5 sm:p-10 lg:p-14 ${
                  hasBannerText ? 'bg-gradient-to-r from-black/75 via-black/35 to-transparent' : 'items-end justify-start'
                }`}
              >
                <div className="max-w-xl space-y-1 sm:space-y-4">
                  {activeBanner.badge?.trim() && (
                    <span className="inline-block bg-white/20 backdrop-blur-md border border-white/30 text-white text-[8px] sm:text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 sm:px-3 sm:py-1 rounded">
                      {activeBanner.badge}
                    </span>
                  )}
                  {activeBanner.title?.trim() && (
                    <h1 className="text-base sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
                      {activeBanner.title}
                    </h1>
                  )}
                  {activeBanner.subtitle?.trim() && (
                    <p className="text-[10px] sm:text-base lg:text-lg text-neutral-200 font-light leading-snug sm:leading-relaxed line-clamp-2 sm:line-clamp-none">
                      {activeBanner.subtitle}
                    </p>
                  )}
                  {hasBannerButton && (
                    <div className="pt-1 sm:pt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate(activeBanner.buttonLink || '/shop');
                        }}
                        className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-7 sm:py-3 bg-white text-black hover:bg-neutral-200 text-[9px] sm:text-xs font-bold uppercase tracking-widest rounded-lg transition-all shadow-lg cursor-pointer"
                      >
                        <span>{activeBanner.buttonText}</span>
                        <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Default Brand Banner when no banners exist in Firestore yet — compact mobile-friendly proportions */
          <div className="relative w-full bg-black text-white rounded-xl overflow-hidden px-5 py-6 sm:px-12 sm:py-20 lg:px-16 lg:py-24">
            <div className="max-w-3xl space-y-2.5 sm:space-y-6">
              <p className="text-[9px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.25em] text-neutral-400 font-medium">
                Elegance Defined · Contemporary Bangladeshi Menswear
              </p>
              <h1 className="text-2xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-none">
                SELVEE
              </h1>
              <p className="text-xs sm:text-lg text-neutral-300 font-light max-w-xl leading-relaxed line-clamp-2 sm:line-clamp-none">
                Elevate your presence with meticulously engineered menswear. Experience breathable pure cottons, regal panjabis, and sharp silhouettes tailored for distinction.
              </p>
              <div className="flex flex-row flex-wrap items-center gap-2.5 sm:gap-4 pt-1.5 sm:pt-3">
                <button
                  onClick={() => onNavigate('/shop')}
                  className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-4 py-2 sm:px-8 sm:py-3.5 bg-white text-black hover:bg-neutral-200 text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest rounded-lg transition-all cursor-pointer"
                >
                  <span>Shop Collection</span>
                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={() => onNavigate('/shop?filter=new')}
                  className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-4 py-2 sm:px-7 sm:py-3.5 bg-transparent border border-neutral-700 hover:border-white hover:bg-white/10 text-white text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest rounded-lg transition-all cursor-pointer"
                >
                  <span>New Arrivals</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Featured Categories */}
      {(loadingCategories || categories.length > 0) && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-5 sm:mb-6">
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

          {loadingCategories ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[4/5] bg-neutral-100 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => onNavigate(`/category/${cat.slug || cat.id}`)}
                  className="group relative aspect-[4/5] bg-neutral-100 rounded-xl overflow-hidden shadow-xs cursor-pointer transition-all hover:shadow-xl"
                >
                  <ProgressiveImage
                    src={cat.image}
                    alt={cat.name}
                    decoding="async"
                    wrapperClassName="relative w-full h-full overflow-hidden bg-neutral-100"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-all duration-500 will-change-transform"
                    emptyFallback={
                      <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-white p-6 text-center">
                        <span className="text-sm font-bold uppercase tracking-wider">{cat.name}</span>
                      </div>
                    }
                  />
                  <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/15 to-transparent flex flex-col justify-end p-5 text-white">
                    <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider">{cat.name}</h3>
                    <p className="text-[11px] text-neutral-300 flex items-center gap-1 mt-0.5 group-hover:translate-x-1 transition-transform">
                      <span>Explore Products</span>
                      <ChevronRight className="w-3 h-3" />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* New Arrivals Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-5 sm:mb-6">
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
      <section className="bg-neutral-50 border-t border-neutral-200 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 sm:gap-14 text-center md:text-left">
            <div className="space-y-3.5">
              <div className="w-11 h-11 rounded-lg bg-black text-white flex items-center justify-center mx-auto md:mx-0">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-widest">Heritage & Weave</h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Every fabric is hand-selected from the finest mills. From long-staple Egyptian cottons to raw linen blends designed specifically for the climate of Bangladesh.
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="w-11 h-11 rounded-lg bg-black text-white flex items-center justify-center mx-auto md:mx-0">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-widest">Tailored Precision</h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Engineered with bespoke collar stiffeners, reinforced seam finishes, and natural drape to ensure comfortable all-day wear without compromise.
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="w-11 h-11 rounded-lg bg-black text-white flex items-center justify-center mx-auto md:mx-0">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-widest">Trust & Integrity</h3>
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
