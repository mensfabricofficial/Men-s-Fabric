import React, { useEffect, useState } from 'react';
import { ChevronRight, Shield, Award, Layers } from 'lucide-react';
import { motion } from 'motion/react';
import { Product, Category, Banner, Review } from '../types';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { ProductGrid } from '../components/product/ProductGrid';
import { ProgressiveImage } from '../components/common/ProgressiveImage';
import { HeroBannerSkeleton, HeroBannerTileSkeleton, CategoryCardSkeleton } from '../components/common/SkeletonLoader';

interface HomePageProps {
  onNavigate: (route: string) => void;
}

const HeroBannerTile: React.FC<{ banner: Banner; onNavigate: (route: string) => void; priority?: boolean; index?: number }> = ({
  banner,
  onNavigate,
  priority = false,
  index = 0,
}) => {
  const hasImage = Boolean(banner.image && banner.image.trim());
  const [ready, setReady] = useState(!hasImage);
  const hasText = Boolean(banner.badge?.trim() || banner.title?.trim() || banner.subtitle?.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      whileHover={!hasImage || ready ? { y: -3 } : undefined}
      onClick={() => {
        if (hasImage && !ready) return;
        onNavigate(banner.buttonLink || '/shop');
      }}
      className={`relative w-full aspect-[3/2] bg-neutral-100 text-white rounded-xl overflow-hidden group shadow-xs hover:shadow-lg transition-shadow duration-300 ${
        hasImage && !ready ? 'cursor-default' : 'cursor-pointer'
      }`}
    >
      {hasImage && !ready && (
        <div className="absolute inset-0 z-20">
          <HeroBannerTileSkeleton />
        </div>
      )}

      <div
        className={`w-full h-full transition-opacity duration-300 ${
          hasImage && !ready ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {hasImage ? (
          <ProgressiveImage
            src={banner.image.trim()}
            alt={banner.title || 'Selvee Promotional Banner'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            onReadyChange={setReady}
            wrapperClassName="relative w-full h-full overflow-hidden bg-neutral-900"
            skeletonClassName="skeleton-shimmer"
            className={`w-full h-full object-cover object-center block select-none group-hover:scale-[1.02] transition-transform duration-500 ${
              hasText ? 'opacity-80' : 'opacity-100'
            }`}
            emptyFallback={<div className="w-full h-full bg-black" />}
          />
        ) : (
          <div className="w-full h-full bg-black" />
        )}

        {hasText && (
          <div className="absolute inset-0 flex items-center p-5 sm:p-8 lg:p-10 bg-gradient-to-r from-black/75 via-black/35 to-transparent">
            <div className="max-w-md space-y-1.5 sm:space-y-3">
              {banner.badge?.trim() && (
                <span className="inline-block bg-white/20 backdrop-blur-md border border-white/30 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded">
                  {banner.badge}
                </span>
              )}
              {banner.title?.trim() && (
                <h2 className="text-xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight">
                  {banner.title}
                </h2>
              )}
              {banner.subtitle?.trim() && (
                <p className="text-xs sm:text-sm lg:text-base text-neutral-200 font-light leading-snug line-clamp-2">
                  {banner.subtitle}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const CategoryTile: React.FC<{ cat: Category; onNavigate: (route: string) => void; index?: number }> = ({
  cat,
  onNavigate,
  index = 0,
}) => {
  const hasImage = Boolean(cat.image && cat.image.trim());
  const [ready, setReady] = useState(!hasImage);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.38, delay: Math.min(index, 7) * 0.06, ease: [0.16, 1, 0.3, 1] }}
      whileHover={ready ? { y: -4 } : undefined}
      onClick={() => {
        if (!ready) return;
        onNavigate(`/category/${cat.slug || cat.id}`);
      }}
      className={`group relative aspect-[4/5] bg-neutral-100 rounded-xl overflow-hidden shadow-xs transition-shadow duration-300 ${
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
    </motion.div>
  );
};

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

  const heroBanners = banners.slice(0, 2);

  return (
    <div className="space-y-7 sm:space-y-10">
      
      {/* Banner Section — 2 compact cards side-by-side on desktop, stacked same 3:2 size on mobile */}
      <section className="max-w-[1660px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        {loadingBanners ? (
          <HeroBannerSkeleton />
        ) : heroBanners.length >= 2 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-5">
            {heroBanners.map((b, idx) => (
              <HeroBannerTile key={b.id} banner={b} onNavigate={onNavigate} priority={idx === 0} index={idx} />
            ))}
          </div>
        ) : heroBanners.length === 1 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-5">
            <HeroBannerTile banner={heroBanners[0]} onNavigate={onNavigate} priority />
            <div
              onClick={() => onNavigate('/shop?filter=new')}
              className="relative w-full aspect-[3/2] bg-neutral-100 border border-neutral-200 text-neutral-900 rounded-xl overflow-hidden flex items-center p-6 sm:p-10 lg:p-12 cursor-pointer group"
            >
              <div className="max-w-md space-y-2 sm:space-y-3.5">
                <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-neutral-500 font-semibold">
                  Fresh From The Atelier
                </p>
                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-none">
                  NEW ARRIVALS
                </h2>
                <p className="text-xs sm:text-sm lg:text-base text-neutral-600 font-normal leading-relaxed line-clamp-2 sm:line-clamp-3">
                  Explore pure cotton shirts, regal panjabis, and tailored silhouettes crafted for everyday distinction.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Default Dual Brand Showcase when no banners exist in Firestore yet */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-5">
            <div
              onClick={() => onNavigate('/shop')}
              className="relative w-full aspect-[3/2] bg-black text-white rounded-xl overflow-hidden flex items-center p-6 sm:p-10 lg:p-12 cursor-pointer"
            >
              <div className="max-w-md space-y-2 sm:space-y-3.5">
                <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-neutral-400 font-medium">
                  Elegance Defined · Bangladeshi Menswear
                </p>
                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-none">
                  SELVEE
                </h1>
                <p className="text-xs sm:text-sm lg:text-base text-neutral-300 font-light leading-relaxed line-clamp-3">
                  Elevate your presence with meticulously engineered menswear, breathable cottons, and sharp silhouettes tailored for distinction.
                </p>
              </div>
            </div>

            <div
              onClick={() => onNavigate('/shop?filter=new')}
              className="relative w-full aspect-[3/2] bg-neutral-100 border border-neutral-200 text-neutral-900 rounded-xl overflow-hidden flex items-center p-6 sm:p-10 lg:p-12 cursor-pointer"
            >
              <div className="max-w-md space-y-2 sm:space-y-3.5">
                <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-neutral-500 font-semibold">
                  Curated Collection · Seasonal Edit
                </p>
                <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-none">
                  NEW DROP
                </h2>
                <p className="text-xs sm:text-sm lg:text-base text-neutral-600 font-normal leading-relaxed line-clamp-3">
                  Discover handcrafted panjabis, structured shirts, and refined wardrobe essentials ready for nationwide delivery.
                </p>
              </div>
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
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-end justify-between mb-5 sm:mb-6"
              >
                <div>
                  <p className="text-xs uppercase tracking-widest font-semibold text-neutral-400">Curated Collections</p>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mt-1">Shop by Category</h2>
                </div>
                <button
                  onClick={() => onNavigate('/shop')}
                  className="text-xs font-bold uppercase tracking-wider text-black hover:underline flex items-center gap-1 cursor-pointer group"
                >
                  <span>View All</span>
                  <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </motion.div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                {categories.map((cat, idx) => (
                  <CategoryTile key={cat.id} cat={cat} onNavigate={onNavigate} index={idx} />
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
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-end justify-between mb-5 sm:mb-6"
          >
            <div>
              <p className="text-xs uppercase tracking-widest font-semibold text-neutral-400">Fresh from the atelier</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mt-1">New Arrivals</h2>
            </div>
            <button
              onClick={() => onNavigate('/shop?filter=new')}
              className="text-xs font-bold uppercase tracking-wider text-black hover:underline flex items-center gap-1 cursor-pointer group"
            >
              <span>See All New</span>
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </motion.div>
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
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: 0, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-3.5 group"
            >
              <div className="w-11 h-11 rounded-lg bg-black text-white flex items-center justify-center mx-auto md:mx-0 group-hover:scale-105 transition-transform duration-300">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-widest">Heritage & Weave</h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Every fabric is hand-selected from the finest mills. From long-staple Egyptian cottons to raw linen blends designed specifically for the climate of Bangladesh.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-3.5 group"
            >
              <div className="w-11 h-11 rounded-lg bg-black text-white flex items-center justify-center mx-auto md:mx-0 group-hover:scale-105 transition-transform duration-300">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-widest">Tailored Precision</h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Engineered with bespoke collar stiffeners, reinforced seam finishes, and natural drape to ensure comfortable all-day wear without compromise.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-3.5 group"
            >
              <div className="w-11 h-11 rounded-lg bg-black text-white flex items-center justify-center mx-auto md:mx-0 group-hover:scale-105 transition-transform duration-300">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-widest">Trust & Integrity</h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Inspect your package right at your doorstep before final payment. We pride ourselves on transparent, dependable Cash on Delivery across the nation.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

    </div>
  );
};
