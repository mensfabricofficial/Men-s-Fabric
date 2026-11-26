import React, { useEffect, useState } from 'react';
import { ChevronRight, Shield, Award, Layers } from 'lucide-react';
import { Product, Category, Banner, Review } from '../types';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { ProductGrid } from '../components/product/ProductGrid';
import { ProgressiveImage } from '../components/common/ProgressiveImage';
import { HeroBannerSkeleton, CategoryCardSkeleton } from '../components/common/SkeletonLoader';

interface HomePageProps {
  onNavigate: (route: string) => void;
}

const CategoryTile: React.FC<{ cat: Category; onNavigate: (route: string) => void }> = ({
  cat,
  onNavigate,
}) => {
  const hasImage = Boolean(cat.image && cat.image.trim());
  const [ready, setReady] = useState(!hasImage);

  return (
    <div
      onClick={() => {
        if (!ready) return;
        onNavigate(`/category/${cat.slug || cat.id}`);
      }}
      className={`group relative aspect-[4/5] bg-neutral-100 rounded-xl overflow-hidden shadow-xs transition-all ${
        ready ? 'cursor-pointer hover:shadow-xl' : 'cursor-default'
      }`}
    >
      {!ready && (
        <div className="absolute inset-0 z-20">
          <CategoryCardSkeleton />
        </div>
      )}
      <div
        className={`w-full h-full transition-opacity duration-300 ${
          ready ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <ProgressiveImage
          src={cat.image}
          alt={cat.name}
          decoding="async"
          onReadyChange={setReady}
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
    </div>
  );
};

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const initialProducts = productService.getInstantActiveProducts();
  const initialCategories = productService.getInstantCategories();
  const bannersReady = settingsService.hasLoadedBanners();

  const [banners, setBanners] = useState<Banner[]>(() => settingsService.getInstantBanners(true));
  const [loadingBanners, setLoadingBanners] = useState(!bannersReady);
  const [bannerImgReady, setBannerImgReady] = useState(false);
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

  return (
    <div className="space-y-7 sm:space-y-12">
      
      {/* Banner Section — aligned left & right with header and category grid */}
      <section className="max-w-[1660px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        {loadingBanners ? (
          <HeroBannerSkeleton />
        ) : activeBanner ? (
          <div
            onClick={() => {
              if (activeBanner.image?.trim() && !bannerImgReady) return;
              onNavigate(activeBanner.buttonLink || '/shop');
            }}
            className={`relative w-full bg-neutral-100 text-white rounded-xl overflow-hidden group ${
              activeBanner.image?.trim() && !bannerImgReady ? 'cursor-default' : 'cursor-pointer'
            }`}
          >
            {activeBanner.image && activeBanner.image.trim() && !bannerImgReady && (
              <div className="relative z-20">
                <HeroBannerSkeleton />
              </div>
            )}

            <div
              className={
                activeBanner.image && activeBanner.image.trim() && !bannerImgReady
                  ? 'absolute inset-0 opacity-0 pointer-events-none'
                  : 'relative transition-opacity duration-300 opacity-100'
              }
            >
              {activeBanner.image && activeBanner.image.trim() ? (
                <ProgressiveImage
                  src={activeBanner.image.trim()}
                  alt={activeBanner.title || 'Selvee Promotional Banner'}
                  decoding="async"
                  fetchPriority="high"
                  onReadyChange={setBannerImgReady}
                  wrapperClassName="relative w-full overflow-hidden bg-neutral-900"
                  skeletonClassName="skeleton-shimmer"
                  className={`w-full h-auto block select-none ${
                    hasBannerText ? 'opacity-80' : 'opacity-100'
                  }`}
                  emptyFallback={<div className="w-full min-h-[280px] sm:min-h-[480px] lg:min-h-[560px] bg-black" />}
                />
              ) : (
                <div className="w-full min-h-[280px] sm:min-h-[480px] lg:min-h-[560px] bg-black" />
              )}

              {hasBannerText && (
                <div className="absolute inset-0 flex items-center p-5 sm:p-12 lg:p-16 bg-gradient-to-r from-black/75 via-black/35 to-transparent">
                  <div className="max-w-xl space-y-2 sm:space-y-4">
                    {activeBanner.badge?.trim() && (
                      <span className="inline-block bg-white/20 backdrop-blur-md border border-white/30 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 sm:px-3 sm:py-1 rounded">
                        {activeBanner.badge}
                      </span>
                    )}
                    {activeBanner.title?.trim() && (
                      <h1 className="text-xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
                        {activeBanner.title}
                      </h1>
                    )}
                    {activeBanner.subtitle?.trim() && (
                      <p className="text-xs sm:text-base lg:text-lg text-neutral-200 font-light leading-snug sm:leading-relaxed line-clamp-2 sm:line-clamp-none">
                        {activeBanner.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Default Brand Banner when no banners exist in Firestore yet */
          <div
            onClick={() => onNavigate('/shop')}
            className="relative w-full min-h-[280px] sm:min-h-[480px] lg:min-h-[560px] bg-black text-white rounded-xl overflow-hidden flex items-center px-6 py-12 sm:px-14 sm:py-24 lg:px-20 lg:py-28 cursor-pointer"
          >
            <div className="max-w-3xl space-y-3 sm:space-y-6">
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.25em] text-neutral-400 font-medium">
                Elegance Defined · Contemporary Bangladeshi Menswear
              </p>
              <h1 className="text-3xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-none">
                SELVEE
              </h1>
              <p className="text-xs sm:text-lg text-neutral-300 font-light max-w-xl leading-relaxed">
                Elevate your presence with meticulously engineered menswear. Experience breathable pure cottons, regal panjabis, and sharp silhouettes tailored for distinction.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Featured Categories */}
      {(loadingCategories || categories.length > 0) && (
        <section className="max-w-[1660px] mx-auto px-4 sm:px-6 lg:px-8">
          {loadingCategories ? (
            <>
              <div className="flex items-end justify-between mb-5 sm:mb-6">
                <div className="space-y-2">
                  <div className="h-3 w-32 skeleton-shimmer rounded-sm" />
                  <div className="h-7 w-48 skeleton-shimmer rounded-sm" />
                </div>
                <div className="h-4 w-16 skeleton-shimmer rounded-sm" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <CategoryCardSkeleton key={i} />
                ))}
              </div>
            </>
          ) : (
            <>
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

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                {categories.map((cat) => (
                  <CategoryTile key={cat.id} cat={cat} onNavigate={onNavigate} />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* New Arrivals Section */}
      <section className="max-w-[1660px] mx-auto px-4 sm:px-6 lg:px-8">
        {loadingProducts ? (
          <div className="flex items-end justify-between mb-5 sm:mb-6">
            <div className="space-y-2">
              <div className="h-3 w-36 skeleton-shimmer rounded-sm" />
              <div className="h-7 w-44 skeleton-shimmer rounded-sm" />
            </div>
            <div className="h-4 w-20 skeleton-shimmer rounded-sm" />
          </div>
        ) : (
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
        )}

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
        <div className="max-w-[1660px] mx-auto px-4 sm:px-6 lg:px-8">
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
