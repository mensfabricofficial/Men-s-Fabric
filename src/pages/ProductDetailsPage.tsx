import React, { useState, useEffect } from 'react';
import { 
  Heart, 
  ShoppingBag, 
  Truck, 
  RotateCcw, 
  ShieldCheck, 
  Star, 
  Ruler, 
  ChevronRight, 
  ChevronLeft,
  Plus,
  Minus,
  AlertCircle
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Product, Review } from '../types';
import { productService, getProductUrlSlug } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { sizeGuideService, SizeGuideCategory, DEFAULT_SIZE_GUIDES } from '../services/sizeGuideService';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { ProductGrid } from '../components/product/ProductGrid';
import { ProductDetailsSkeleton } from '../components/common/SkeletonLoader';
import { FloatingInput, FloatingTextarea } from '../components/common/FloatingInput';
import { ProgressiveImage } from '../components/common/ProgressiveImage';

interface ProductDetailsPageProps {
  productIdOrSlug: string;
  onNavigate: (route: string) => void;
}

export const ProductDetailsPage: React.FC<ProductDetailsPageProps> = ({
  productIdOrSlug,
  onNavigate,
}) => {
  const { addItem } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { currentUser } = useAuth();

  const instantMatch = productService.getInstantProductById(productIdOrSlug);
  const [product, setProduct] = useState<Product | null>(instantMatch);
  const [loading, setLoading] = useState(!instantMatch);
  const [selectedImage, setSelectedImage] = useState<string>(() =>
    instantMatch ? (instantMatch.thumbnail || instantMatch.images?.[0] || '') : ''
  );
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>(() => instantMatch?.colors?.[0]?.name || '');
  const [sizeError, setSizeError] = useState<string>('');
  const [descExpanded, setDescExpanded] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [deliveryZones, setDeliveryZones] = useState(() => settingsService.getInstantDeliveryZones());
  
  // Dynamic Size Guides
  const [sizeGuides, setSizeGuides] = useState<SizeGuideCategory[]>(DEFAULT_SIZE_GUIDES);
  const [activeGuideCatId, setActiveGuideCatId] = useState<string>('panjabi');
  
  // Accordion state (collapsed by default: Details, Materials, Delivery & Returns, Reviews)
  const [openAccordion, setOpenAccordion] = useState<'details' | 'materials' | 'delivery' | 'reviews' | null>(null);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

  // Review submission state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewAuthor, setReviewAuthor] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [reviewError, setReviewError] = useState('');

  useEffect(() => {
    return settingsService.subscribeToDeliveryZones(setDeliveryZones);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let unsubLive: (() => void) | null = null;
    let unsubReviews: (() => void) | null = null;
    const warmProd = productService.getInstantProductById(productIdOrSlug);
    if (warmProd) {
      setProduct(warmProd);
      setSelectedImage(warmProd.thumbnail || warmProd.images?.[0] || '');
      setSelectedSize('');
      setSizeError('');
      setSelectedColor(warmProd.colors?.[0]?.name || '');
      setLoading(false);
    } else {
      setLoading(true);
    }
    setReviews([]);

    const initProduct = async () => {
      try {
        const prod = await productService.getProductById(productIdOrSlug);
        if (!isMounted) return;

        if (prod) {
          setProduct(prod);
          const canonicalPath = `/product/${getProductUrlSlug(prod)}`;
          if (typeof window !== 'undefined' && window.location.pathname !== canonicalPath) {
            window.history.replaceState({}, '', canonicalPath);
          }
          const initialImg = prod.thumbnail || prod.images?.[0] || '';
          setSelectedImage(initialImg);
          
          // Keep size unselected so customer actively picks their size; default color
          setSelectedSize('');
          setSizeError('');
          if (prod.colors && prod.colors.length > 0) {
            setSelectedColor(prod.colors[0].name);
          }

          // Unblock the UI immediately!
          setLoading(false);

          // Real-time synchronization for stock & price updates
          if (prod.id) {
            unsubLive = onSnapshot(doc(db, 'products', prod.id), (snap) => {
              if (snap.exists() && isMounted) {
                const updated = { id: snap.id, ...snap.data() } as Product;
                setProduct((prev) => ({ ...(prev || prod), ...updated }));
              }
            }, (err) => console.warn('Product live sync notice:', err));

            // Real-time approved reviews subscription
            unsubReviews = settingsService.subscribeToProductReviews(prod.id, (revs) => {
              if (isMounted) {
                setReviews(revs || []);
              }
            });
          }

          // Fetch related products in background
          if (prod.category) {
            productService.getProducts({
              category: prod.category,
              limitCount: 4,
            }).then((rel) => {
              if (isMounted) {
                setRelatedProducts((rel.products || []).filter((p) => p.id !== prod.id));
              }
            }).catch((relErr) => {
              console.warn('Could not load related garments:', relErr);
            });
          }

          // Fetch dynamic size guides in background
          sizeGuideService.getSizeGuides().then((guides) => {
            if (isMounted && guides.length > 0) {
              setSizeGuides(guides);
              const text = `${prod.category || ''} ${prod.name || ''}`.toLowerCase();
              if (text.includes('panjabi')) setActiveGuideCatId('panjabi');
              else if (text.includes('shirt') && !text.includes('t-shirt') && !text.includes('tshirt')) setActiveGuideCatId('shirts');
              else if (text.includes('polo') || text.includes('t-shirt') || text.includes('tshirt')) setActiveGuideCatId('tshirts');
              else if (text.includes('pant') || text.includes('trouser') || text.includes('chino')) setActiveGuideCatId('pants');
              else setActiveGuideCatId(guides[0].id);
            }
          }).catch(() => {});
        } else {
          setProduct(null);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load product details:', err);
        if (isMounted) {
          setProduct(null);
          setLoading(false);
        }
      }
    };

    initProduct();

    return () => {
      isMounted = false;
      if (unsubLive) unsubLive();
      if (unsubReviews) unsubReviews();
    };
  }, [productIdOrSlug]);

  if (loading) {
    return <ProductDetailsSkeleton />;
  }

  if (!product) {
    return (
      <div className="max-w-[1660px] mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 mb-2">Product Not Found</h2>
        <p className="text-sm text-neutral-500 mb-6">The requested garment could not be found or has been discontinued.</p>
        <button
          onClick={() => onNavigate('/shop')}
          className="px-6 py-2.5 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg"
        >
          Return to Shop
        </button>
      </div>
    );
  }

  const isSale = typeof product.salePrice === 'number' && product.salePrice > 0 && product.salePrice < product.price;
  const currentPrice = isSale ? product.salePrice! : product.price;
  const discountPercent = isSale ? Math.round(((product.price - product.salePrice!) / product.price) * 100) : 0;
  
  // Calculate stock for selected size & color variant
  let availableStock = product.totalStock || 0;
  let currentSku = product.sku;
  if (product.variants && product.variants.length > 0 && selectedSize && selectedColor) {
    const match = product.variants.find(
      (v) => v.size === selectedSize && v.color === selectedColor
    );
    if (match) {
      availableStock = match.stock;
      currentSku = match.sku || currentSku;
    }
  }

  const isWishlisted = isInWishlist(product.id);
  const isOutOfStock = availableStock <= 0;

  const cleanProductImages = (product.images || [])
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter(Boolean);
  const fallbackThumb = typeof product.thumbnail === 'string' ? product.thumbnail.trim() : '';
  const galleryImages = cleanProductImages.length > 0 ? cleanProductImages : fallbackThumb ? [fallbackThumb] : [];
  const foundImgIndex = galleryImages.indexOf(selectedImage);
  const activeImageIndex = foundImgIndex >= 0 ? foundImgIndex : 0;

  const handlePrevImage = () => {
    const nextIdx = (activeImageIndex - 1 + galleryImages.length) % galleryImages.length;
    setSelectedImage(galleryImages[nextIdx]);
  };

  const handleNextImage = () => {
    const nextIdx = (activeImageIndex + 1) % galleryImages.length;
    setSelectedImage(galleryImages[nextIdx]);
  };

  const requiresSize = Array.isArray(product.sizes) && product.sizes.length > 0;

  const handleAddToCart = (redirect = false) => {
    if (isOutOfStock) return;
    if (requiresSize && !selectedSize) {
      setSizeError('Please select a size first');
      return;
    }
    setSizeError('');
    addItem({
      productId: product.id,
      productName: product.name,
      productSlug: getProductUrlSlug(product),
      productImage: selectedImage || product.thumbnail || '',
      size: selectedSize || 'Standard',
      color: selectedColor || 'Standard',
      quantity: 1,
      price: product.price,
      salePrice: product.salePrice,
      availableStock,
      sku: currentSku || product.sku || '',
    });
    if (redirect) {
      onNavigate('/checkout');
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewComment.trim()) return;

    setReviewSubmitting(true);
    setReviewError('');
    try {
      await settingsService.submitReview({
        productId: product.id,
        productName: product.name,
        customerId: currentUser?.uid || 'guest',
        customerName: reviewAuthor.trim() || currentUser?.displayName || 'Verified Customer',
        rating: reviewRating,
        comment: reviewComment.trim(),
        verifiedPurchase: Boolean(currentUser),
      });
      setReviewSuccess(true);
      setReviewComment('');
      setReviewAuthor('');
    } catch {
      setReviewError('Could not submit review at this moment. Please try again.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1660px] mx-auto px-0 lg:px-8 py-0 lg:py-8">
      
      {/* Desktop Breadcrumb */}
      <div className="hidden lg:flex items-center gap-2 text-xs text-neutral-400 uppercase tracking-wider mb-6">
        <button onClick={() => onNavigate('/')} className="hover:text-black cursor-pointer">Home</button>
        <span>/</span>
        <button onClick={() => onNavigate('/shop')} className="hover:text-black cursor-pointer">Shop</button>
        <span>/</span>
        <span className="text-black font-semibold truncate max-w-xs">{product.name}</span>
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-10 items-start mb-10 sm:mb-12">
        
        {/* Left: Square Image Showcase (Full-width edge-to-edge on mobile) */}
        <div className="lg:col-span-6">
          <div className="relative w-full aspect-square bg-neutral-100 rounded-none lg:rounded-lg overflow-hidden border-b lg:border border-neutral-200/80">
            <ProgressiveImage
              src={galleryImages[activeImageIndex] || ''}
              alt={product.name}
              decoding="async"
              fetchPriority="high"
              wrapperClassName="relative w-full h-full overflow-hidden bg-neutral-100"
              className="w-full h-full object-cover object-center"
            />

            {/* Bottom-left Image Counter Pill (e.g. 1 | 4) */}
            {galleryImages.length > 0 && (
              <div className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/85 backdrop-blur-xs text-neutral-900 text-xs font-semibold border border-black/5 shadow-xs lining-nums tabular-nums select-none">
                <span>{activeImageIndex + 1}</span>
                <span className="text-neutral-400 font-normal">|</span>
                <span>{galleryImages.length}</span>
              </div>
            )}

            {/* Smaller Frosted Circular Carousel Navigation Arrows */}
            {galleryImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevImage}
                  aria-label="Previous image"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-neutral-900/30 hover:bg-neutral-900/50 border border-white/75 text-white backdrop-blur-xs shadow-xs flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer z-10"
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={handleNextImage}
                  aria-label="Next image"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-neutral-900/30 hover:bg-neutral-900/50 border border-white/75 text-white backdrop-blur-xs shadow-xs flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer z-10"
                >
                  <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right: Product Actions & Specs */}
        <div className="lg:col-span-6 px-4 sm:px-6 lg:px-0 pt-3.5 lg:pt-0 flex flex-col justify-between space-y-4">
          
          <div className="space-y-2.5">
            {/* Mobile Breadcrumb directly under product image */}
            <div className="flex lg:hidden items-center gap-1.5 text-xs text-neutral-500">
              <button onClick={() => onNavigate('/')} className="underline underline-offset-2 text-neutral-800 hover:text-black cursor-pointer">
                Home
              </button>
              <span className="text-neutral-300">/</span>
              <button onClick={() => onNavigate('/shop')} className="underline underline-offset-2 text-neutral-800 hover:text-black cursor-pointer">
                Shop
              </button>
              <span className="text-neutral-300">/</span>
              <span className="text-neutral-500 truncate">{product.name}</span>
            </div>

            <h1 className="font-sans text-2xl sm:text-3xl font-semibold text-neutral-900 leading-snug tracking-tight">
              {product.name}
            </h1>

            {/* Product Code (replaces stock ready pill) */}
            <div className="flex items-center flex-wrap gap-2.5 text-xs sm:text-sm text-neutral-500">
              <span>
                Product Code: <span className="font-medium text-neutral-700">{currentSku || product.id}</span>
              </span>
              {isOutOfStock && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Out of Stock</span>
                </span>
              )}
            </div>

            {/* Price section with normal red discount text (no red background) */}
            <div className="flex items-baseline flex-wrap gap-2.5 pt-1 lining-nums tabular-nums">
              <span className="font-sans text-xl sm:text-2xl font-bold text-neutral-900">
                BDT {(Number(currentPrice) || 0).toLocaleString('en-BD')}
              </span>
              {isSale && (
                <>
                  <span className="text-sm sm:text-base text-neutral-400 line-through font-normal tabular-nums">
                    BDT {(Number(product.price) || 0).toLocaleString('en-BD')}
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-red-600 tracking-wide">
                    -{discountPercent}% OFF
                  </span>
                </>
              )}
            </div>

            {/* Color selection */}
            {product.colors && product.colors.length > 0 && (
              <div className="pt-1.5">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold uppercase tracking-wider text-neutral-700">
                    Color: <span className="font-normal text-neutral-900">{selectedColor}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {product.colors.map((c, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedColor(c.name)}
                      className={`relative w-8 h-8 rounded-full border-2 transition-all cursor-pointer ${
                        selectedColor === c.name ? 'border-black ring-2 ring-neutral-300' : 'border-neutral-200'
                      }`}
                      style={{ backgroundColor: c.code || '#000000' }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Size selection (never pre-selected; customer chooses before adding to cart) */}
            {product.sizes && product.sizes.length > 0 && (
              <div className="pt-1.5">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold uppercase tracking-wider text-neutral-700">
                    Size:{' '}
                    <span className={selectedSize ? 'font-normal text-neutral-900' : 'font-normal text-neutral-400'}>
                      {selectedSize || 'Select a size'}
                    </span>
                  </span>
                  <button
                    onClick={() => setSizeGuideOpen(true)}
                    className="flex items-center gap-1 text-neutral-600 hover:text-black font-semibold underline cursor-pointer"
                  >
                    <Ruler className="w-3.5 h-3.5" /> Size Guide
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSelectedSize(s);
                        if (sizeError) setSizeError('');
                      }}
                      className={`min-w-11 h-10 px-3 flex items-center justify-center text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        selectedSize === s
                          ? 'border-black bg-black text-white'
                          : sizeError
                            ? 'border-red-400 bg-white text-neutral-800 hover:border-black'
                            : 'border-neutral-200 bg-white text-neutral-800 hover:border-black'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {sizeError && (
                  <p role="alert" className="mt-2 text-xs font-medium text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{sizeError}</span>
                  </p>
                )}
              </div>
            )}

            {/* Main CTA Actions */}
            <div className="flex flex-col gap-2 pt-2">
              <div className="flex gap-2">
                <button
                  onClick={() => handleAddToCart(false)}
                  disabled={isOutOfStock}
                  className="flex-1 py-3.5 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 shadow-md disabled:bg-neutral-300 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{isOutOfStock ? 'Sold Out' : 'Add to Cart'}</span>
                </button>
                <button
                  onClick={() => toggleWishlist(product)}
                  className={`w-12 h-12 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                    isWishlisted ? 'border-black bg-neutral-100 text-black' : 'border-neutral-300 text-neutral-600 hover:border-black'
                  }`}
                  aria-label="Wishlist"
                >
                  <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-black' : ''}`} />
                </button>
              </div>
            </div>

            {/* Product Description directly below Add to Cart */}
            {(() => {
              const descText =
                product.description?.trim() ||
                'Crafted with premium materials and precision tailoring for timeless everyday elegance.';
              const isLong = descText.length > 140 || descText.includes('\n');
              return (
                <div className="pt-3 space-y-2">
                  <p
                    className={`whitespace-pre-line text-sm text-neutral-600 leading-relaxed ${
                      !descExpanded && isLong ? 'line-clamp-3' : ''
                    }`}
                  >
                    {descText}
                  </p>
                  {isLong && (
                    <button
                      type="button"
                      onClick={() => setDescExpanded((prev) => !prev)}
                      className="text-xs sm:text-sm font-medium text-neutral-900 underline underline-offset-4 hover:text-black cursor-pointer"
                    >
                      {descExpanded ? 'Read less' : 'Read more'}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Stacked Hairline Accordion: Details, Materials, Delivery & Returns, Reviews */}
            <div className="pt-3 border-b border-neutral-200">
              {[
                {
                  id: 'details' as const,
                  label: 'Details',
                  content: (
                    <div className="w-full divide-y divide-neutral-100 text-xs sm:text-sm">
                      <div className="py-2.5 flex justify-between gap-6">
                        <span className="font-medium text-neutral-500">Product Code</span>
                        <span className="font-semibold text-neutral-900 text-right">{currentSku || product.id}</span>
                      </div>
                      <div className="py-2.5 flex justify-between gap-6">
                        <span className="font-medium text-neutral-500">Gender / Fit</span>
                        <span className="font-semibold text-neutral-900 capitalize text-right">{product.gender || 'Menswear'}</span>
                      </div>
                      <div className="py-2.5 flex justify-between gap-6">
                        <span className="font-medium text-neutral-500">Authenticity</span>
                        <span className="font-semibold text-neutral-900 text-right">100% Original Selvee Tailoring</span>
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'materials' as const,
                  label: 'Materials',
                  content: (
                    <div className="w-full divide-y divide-neutral-100 text-xs sm:text-sm">
                      <div className="py-2.5 flex justify-between gap-6">
                        <span className="font-medium text-neutral-500">Fabric / Composition</span>
                        <span className="font-semibold text-neutral-900 text-right">{product.fabric || '100% Premium Cotton'}</span>
                      </div>
                      <div className="py-2.5 flex justify-between gap-6">
                        <span className="font-medium text-neutral-500">Care Instructions</span>
                        <span className="font-semibold text-neutral-900 text-right">Machine wash cold with like colors; iron warm.</span>
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'delivery' as const,
                  label: 'Delivery & Returns',
                  content: (() => {
                    const dh = deliveryZones.find((z) => z.id === 'dhaka');
                    const out = deliveryZones.find((z) => z.id === 'outside-dhaka');
                    return (
                      <div className="w-full space-y-2.5 text-xs sm:text-sm text-neutral-600 leading-relaxed">
                        <div className="flex items-start gap-2.5">
                          <Truck className="w-4 h-4 text-black shrink-0 mt-0.5" />
                          <span>
                            <strong className="font-semibold text-neutral-900">Inside Dhaka:</strong> ৳{dh?.charge ?? 70} ({dh?.estimatedDays || '1–2 days'}) · <strong className="font-semibold text-neutral-900">Outside Dhaka:</strong> ৳{out?.charge ?? 130} ({out?.estimatedDays || '2–4 days'})
                          </span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <RotateCcw className="w-4 h-4 text-black shrink-0 mt-0.5" />
                          <span>
                            <strong className="font-semibold text-neutral-900">Exchange Policy:</strong> Easy 3-day size exchange for unworn items with original invoice &amp; tag attached.
                          </span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <ShieldCheck className="w-4 h-4 text-black shrink-0 mt-0.5" />
                          <span>
                            <strong className="font-semibold text-neutral-900">Payment:</strong> Cash on Delivery available nationwide; inspect package seal before accepting.
                          </span>
                        </div>
                      </div>
                    );
                  })(),
                },
                {
                  id: 'reviews' as const,
                  label: `Reviews (${reviews.length})`,
                  content: (
                    <div className="w-full space-y-6">
                      {reviews.length === 0 ? (
                        <p className="text-xs sm:text-sm text-neutral-500 italic">No reviews yet. Be the first to review this product!</p>
                      ) : (
                        <div className="space-y-3">
                          {reviews.map((r) => (
                            <div key={r.id} className="p-4 bg-neutral-50 border border-neutral-100 rounded-lg space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-xs sm:text-sm text-neutral-900">{r.customerName}</span>
                                <div className="flex text-amber-400">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-amber-400' : 'text-neutral-200'}`} />
                                  ))}
                                </div>
                              </div>
                              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">{r.comment}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Submit Review Form */}
                      <div className="border-t border-neutral-200 pt-5 max-w-2xl">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3.5">Write a Customer Review</h4>
                        {reviewSuccess ? (
                          <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg">
                            Thank you! Your review has been submitted and will appear upon moderation.
                          </div>
                        ) : (
                          <form onSubmit={handleReviewSubmit} className="space-y-3.5">
                            {reviewError && (
                              <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                                {reviewError}
                              </div>
                            )}
                            <div>
                              <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Rating</label>
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((num) => (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() => setReviewRating(num)}
                                    className="p-1 cursor-pointer text-amber-400"
                                  >
                                    <Star className={`w-5 h-5 ${num <= reviewRating ? 'fill-amber-400' : 'text-neutral-200'}`} />
                                  </button>
                                ))}
                              </div>
                            </div>
                            <FloatingInput
                              compact
                              label="Your Name (Optional)"
                              type="text"
                              value={reviewAuthor}
                              onChange={(e) => setReviewAuthor(e.target.value)}
                            />
                            <FloatingTextarea
                              label="Write your review *"
                              required
                              rows={3}
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                              placeholder="Share your experience regarding the fabric, fit, and finish..."
                            />
                            <button
                              type="submit"
                              disabled={reviewSubmitting}
                              className="w-full sm:w-auto px-6 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer hover:bg-neutral-800"
                            >
                              {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  ),
                },
              ].map((section) => {
                const isOpen = openAccordion === section.id;
                return (
                  <div key={section.id} className="border-t border-neutral-200">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenAccordion(isOpen ? null : section.id)}
                      className="w-full py-4 flex items-center justify-between text-left cursor-pointer group"
                    >
                      <span className="font-sans text-sm sm:text-base font-medium text-neutral-900 group-hover:text-black transition-colors">
                        {section.label}
                      </span>
                      {isOpen ? (
                        <Minus className="w-4 h-4 text-neutral-700 shrink-0" />
                      ) : (
                        <Plus className="w-4 h-4 text-neutral-700 shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="pb-5 animate-fade-in">
                        {section.content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </div>

      </div>

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <section className="px-4 sm:px-6 lg:px-0 pb-8 lg:pb-0">
          <div className="border-t border-neutral-200 pt-8 sm:pt-10">
            <h2 className="font-sans text-xl sm:text-2xl font-bold uppercase tracking-tight text-neutral-900 mb-6">
              You May Also Like
            </h2>
            <ProductGrid
              products={relatedProducts}
              onNavigate={onNavigate}
            />
          </div>
        </section>
      )}

      {/* Size Guide Modal */}
      {sizeGuideOpen && (() => {
        const currentGuide = sizeGuides.find((g) => g.id === activeGuideCatId) || sizeGuides[0];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 text-xs animate-fade-in">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-neutral-900">
                    Selvee — Size Chart
                  </h3>
                  <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">
                    Precision Fit ({currentGuide?.unit || 'Inches'})
                  </span>
                </div>
                <button onClick={() => setSizeGuideOpen(false)} className="text-neutral-400 hover:text-black p-1">
                  ✕
                </button>
              </div>

              {/* Category Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 border-b border-neutral-100">
                {sizeGuides.map((guide) => (
                  <button
                    key={guide.id}
                    type="button"
                    onClick={() => setActiveGuideCatId(guide.id)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                      activeGuideCatId === guide.id
                        ? 'bg-black text-white shadow-xs'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {(guide.name || 'Size').split(' ')[0]}
                  </button>
                ))}
              </div>

              {currentGuide && (
                <div className="border border-neutral-200 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse min-w-[320px]">
                    <thead>
                      <tr className="bg-neutral-100/70 border-b border-neutral-200 text-neutral-700 font-bold uppercase text-[10px]">
                        {currentGuide.columns.map((col) => (
                          <th key={col.key} className="p-2.5">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 font-medium">
                      {currentGuide.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-neutral-50">
                          {currentGuide.columns.map((col) => (
                            <td key={col.key} className={`p-2.5 ${col.key === 'size' ? 'font-bold text-neutral-900' : 'text-neutral-700'}`}>
                              {row[col.key] || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[11px] text-neutral-500">
                {currentGuide?.tip || 'Measurements are standardized for regular tailored comfort fit. If between sizes, we recommend sizing up.'}
              </p>

              <button
                type="button"
                onClick={() => setSizeGuideOpen(false)}
                className="w-full py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Close Guide
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
