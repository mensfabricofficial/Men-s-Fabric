import React, { useState, useEffect } from 'react';
import { 
  Heart, 
  ShoppingBag, 
  Truck, 
  RotateCcw, 
  ShieldCheck, 
  Check, 
  Star, 
  Ruler, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp,
  Share2,
  AlertCircle
} from 'lucide-react';
import { Product, Review } from '../types';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { ProductGrid } from '../components/product/ProductGrid';

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

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  
  // Accordion states
  const [activeTab, setActiveTab] = useState<'desc' | 'specs' | 'delivery' | 'reviews'>('desc');
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

  // Review submission state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewAuthor, setReviewAuthor] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    productService
      .getProductById(productIdOrSlug)
      .then(async (prod) => {
        if (prod) {
          setProduct(prod);
          const initialImg = prod.thumbnail || prod.images?.[0] || '/logo.jpg';
          setSelectedImage(initialImg);
          
          // Default size & color selection
          if (prod.sizes && prod.sizes.length > 0) {
            setSelectedSize(prod.sizes[0]);
          }
          if (prod.colors && prod.colors.length > 0) {
            setSelectedColor(prod.colors[0].name);
          }

          // Fetch related products
          if (prod.category) {
            const rel = await productService.getProducts({
              category: prod.category,
              limitCount: 4,
            });
            setRelatedProducts(rel.products.filter((p) => p.id !== prod.id));
          }

          // Fetch reviews
          const revs = await settingsService.getProductReviews(prod.id);
          setReviews(revs);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [productIdOrSlug]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 animate-pulse">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="aspect-[3/4] bg-neutral-200 rounded-lg" />
          <div className="space-y-4">
            <div className="h-4 w-1/4 bg-neutral-200 rounded" />
            <div className="h-8 w-3/4 bg-neutral-200 rounded" />
            <div className="h-6 w-1/3 bg-neutral-200 rounded" />
            <div className="h-24 bg-neutral-100 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
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

  const handleAddToCart = (redirect = false) => {
    if (isOutOfStock) return;
    addItem({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      productImage: selectedImage || product.thumbnail || '/logo.jpg',
      size: selectedSize || 'Standard',
      color: selectedColor || 'Standard',
      quantity,
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
      alert('Could not submit review at this moment.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-neutral-400 uppercase tracking-wider mb-8">
        <button onClick={() => onNavigate('/')} className="hover:text-black cursor-pointer">Home</button>
        <span>/</span>
        <button onClick={() => onNavigate('/shop')} className="hover:text-black cursor-pointer">Shop</button>
        <span>/</span>
        <span className="text-black font-semibold truncate max-w-xs">{product.name}</span>
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mb-16">
        
        {/* Left: Image Gallery (7 cols on lg) */}
        <div className="lg:col-span-7 flex flex-col-reverse md:flex-row gap-4">
          
          {/* Thumbnails vertical strip */}
          {product.images && product.images.length > 1 && (
            <div className="flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto shrink-0 pb-2 md:pb-0">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(img)}
                  className={`w-16 h-20 sm:w-20 sm:h-24 rounded border overflow-hidden shrink-0 transition-all cursor-pointer ${
                    selectedImage === img ? 'border-black ring-1 ring-black' : 'border-neutral-200 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Main Display Image */}
          <div className="relative flex-1 aspect-[3/4] bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200">
            <img
              src={selectedImage || product.thumbnail || '/logo.jpg'}
              alt={product.name}
              className="w-full h-full object-cover object-center"
            />
            {/* Badges */}
            <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-10">
              {isSale && (
                <span className="bg-black text-white text-[11px] font-bold px-2.5 py-1 rounded tracking-widest uppercase">
                  Save {discountPercent}%
                </span>
              )}
              {product.fabric && (
                <span className="bg-white/90 backdrop-blur-xs text-black border border-neutral-300 text-[10px] font-semibold px-2 py-0.5 rounded tracking-wider">
                  {product.fabric}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Product Actions & Specs (5 cols on lg) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
          
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-neutral-400 font-semibold tracking-wider uppercase">
              <span>{product.brand || "MEN'S FABRIC"}</span>
              <span>SKU: {currentSku}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 leading-tight">
              {product.name}
            </h1>

            {/* Price section */}
            <div className="flex items-baseline gap-3 pt-1">
              <span className="text-2xl sm:text-3xl font-bold text-neutral-900">
                ৳{currentPrice.toLocaleString('en-BD')}
              </span>
              {isSale && (
                <span className="text-base text-neutral-400 line-through">
                  ৳{product.price.toLocaleString('en-BD')}
                </span>
              )}
              <span className="text-[11px] text-neutral-500 font-medium">VAT Included</span>
            </div>

            {/* Stock indicator */}
            <div className="pt-1">
              {isOutOfStock ? (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Currently Out of Stock</span>
                </div>
              ) : availableStock < 5 ? (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded">
                  <span>Only {availableStock} left in stock — order soon</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded">
                  <Check className="w-3.5 h-3.5" />
                  <span>In Stock • Ready for Dispatch</span>
                </div>
              )}
            </div>

            {/* Color selection */}
            {product.colors && product.colors.length > 0 && (
              <div className="pt-3">
                <div className="flex items-center justify-between text-xs mb-2">
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

            {/* Size selection */}
            {product.sizes && product.sizes.length > 0 && (
              <div className="pt-3">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold uppercase tracking-wider text-neutral-700">
                    Size: <span className="font-normal text-neutral-900">{selectedSize}</span>
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
                      onClick={() => setSelectedSize(s)}
                      className={`min-w-11 h-10 px-3 flex items-center justify-center text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        selectedSize === s
                          ? 'border-black bg-black text-white'
                          : 'border-neutral-200 bg-white text-neutral-800 hover:border-black'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity Selector */}
            <div className="pt-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-2">
                Quantity
              </label>
              <div className="flex items-center border border-neutral-300 rounded-lg w-32 overflow-hidden bg-white">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center text-neutral-600 hover:bg-neutral-100 cursor-pointer"
                >
                  -
                </button>
                <span className="flex-1 text-center text-xs font-bold">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                  disabled={quantity >= availableStock}
                  className="w-10 h-10 flex items-center justify-center text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Main CTA Actions */}
            <div className="flex flex-col gap-2.5 pt-4">
              <div className="flex gap-2">
                <button
                  onClick={() => handleAddToCart(false)}
                  disabled={isOutOfStock}
                  className="flex-1 py-3.5 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 shadow-md disabled:bg-neutral-300 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{isOutOfStock ? 'Sold Out' : 'Add to Bag'}</span>
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

              <button
                onClick={() => handleAddToCart(true)}
                disabled={isOutOfStock}
                className="w-full py-3.5 bg-neutral-900 text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-black transition-colors shadow-sm disabled:bg-neutral-300 disabled:cursor-not-allowed cursor-pointer"
              >
                Buy Now (Cash on Delivery)
              </button>
            </div>

            {/* Shipping & Assurance Highlights */}
            <div className="border-t border-neutral-200 pt-5 space-y-2.5 text-xs text-neutral-600">
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4 text-black shrink-0" />
                <span>Delivery: <b>৳70 Inside Dhaka</b> (1-2 days), <b>৳130 Outside Dhaka</b> (2-4 days)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-black shrink-0" />
                <span>Pay via <b>Cash on Delivery</b> after physical parcel inspection</span>
              </div>
              <div className="flex items-center gap-2.5">
                <RotateCcw className="w-4 h-4 text-black shrink-0" />
                <span>7-Day standard exchange for sizing adjustments</span>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Tabs & Additional Details Accordion */}
      <div className="border-t border-neutral-200 pt-8 mb-16">
        <div className="flex border-b border-neutral-200 gap-6 overflow-x-auto">
          {[
            { id: 'desc', label: 'Description' },
            { id: 'specs', label: 'Fabric & Specifications' },
            { id: 'delivery', label: 'Delivery & Returns' },
            { id: 'reviews', label: `Reviews (${reviews.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 -mb-px shrink-0 ${
                activeTab === tab.id
                  ? 'border-black text-black'
                  : 'border-transparent text-neutral-400 hover:text-black'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="py-6 text-sm text-neutral-700 leading-relaxed max-w-3xl">
          {activeTab === 'desc' && (
            <div className="space-y-4">
              <p className="whitespace-pre-line">{product.description || 'Crafted with premium materials and precision tailoring for timeless style.'}</p>
            </div>
          )}

          {activeTab === 'specs' && (
            <div className="divide-y divide-neutral-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="font-semibold text-neutral-500">Fabric / Composition</span>
                <span className="font-bold text-neutral-900">{product.fabric || '100% Premium Cotton'}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="font-semibold text-neutral-500">Gender / Fit</span>
                <span className="font-bold text-neutral-900 capitalize">{product.gender}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="font-semibold text-neutral-500">Care Instructions</span>
                <span className="font-bold text-neutral-900">Machine wash cold with like colors; iron warm.</span>
              </div>
            </div>
          )}

          {activeTab === 'delivery' && (
            <div className="space-y-3 text-xs">
              <p><b>Inside Dhaka:</b> ৳70 (Delivered within 24–48 hours)</p>
              <p><b>Outside Dhaka:</b> ৳130 (Delivered via courier within 2–4 business days)</p>
              <p><b>Payment:</b> Cash on Delivery available nationwide. You may inspect the seal before accepting the delivery.</p>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="space-y-6">
              {/* Review list */}
              {reviews.length === 0 ? (
                <p className="text-xs text-neutral-500 italic">No reviews yet. Be the first to review this product!</p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((r) => (
                    <div key={r.id} className="p-4 bg-neutral-50 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-neutral-900">{r.customerName}</span>
                        <div className="flex text-amber-400">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-amber-400' : 'text-neutral-200'}`} />
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-neutral-600">{r.comment}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Submit Review Form */}
              <div className="border-t border-neutral-200 pt-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">Write a Customer Review</h4>
                {reviewSuccess ? (
                  <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded">
                    Thank you! Your review has been submitted and will appear upon moderation.
                  </div>
                ) : (
                  <form onSubmit={handleReviewSubmit} className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">Rating</label>
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
                    <div>
                      <input
                        type="text"
                        value={reviewAuthor}
                        onChange={(e) => setReviewAuthor(e.target.value)}
                        placeholder="Your Name (Optional)"
                        className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded"
                      />
                    </div>
                    <div>
                      <textarea
                        required
                        rows={3}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Share your experience regarding the fabric, fit, and finish..."
                        className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={reviewSubmitting}
                      className="px-5 py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded cursor-pointer hover:bg-neutral-800"
                    >
                      {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <section className="border-t border-neutral-200 pt-12">
          <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-neutral-900 mb-6">
            You May Also Like
          </h2>
          <ProductGrid
            products={relatedProducts}
            onNavigate={onNavigate}
          />
        </section>
      )}

      {/* Size Guide Modal */}
      {sizeGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">MEN'S FABRIC — Size Chart (Inches)</h3>
              <button onClick={() => setSizeGuideOpen(false)} className="text-neutral-500 hover:text-black">✕</button>
            </div>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-neutral-100 border-b border-neutral-200 text-neutral-600 font-bold uppercase">
                  <th className="p-2">Size</th>
                  <th className="p-2">Chest</th>
                  <th className="p-2">Length</th>
                  <th className="p-2">Sleeve</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                <tr><td className="p-2 font-bold">S</td><td className="p-2">38"</td><td className="p-2">28"</td><td className="p-2">24"</td></tr>
                <tr><td className="p-2 font-bold">M</td><td className="p-2">40"</td><td className="p-2">29"</td><td className="p-2">24.5"</td></tr>
                <tr><td className="p-2 font-bold">L</td><td className="p-2">42"</td><td className="p-2">30"</td><td className="p-2">25"</td></tr>
                <tr><td className="p-2 font-bold">XL</td><td className="p-2">44"</td><td className="p-2">31"</td><td className="p-2">25.5"</td></tr>
                <tr><td className="p-2 font-bold">XXL</td><td className="p-2">46"</td><td className="p-2">32"</td><td className="p-2">26"</td></tr>
              </tbody>
            </table>
            <p className="text-[11px] text-neutral-500">Measurements are standardized for regular tailored comfort fit. If between sizes, we recommend sizing up.</p>
            <button
              onClick={() => setSizeGuideOpen(false)}
              className="w-full py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded"
            >
              Close Guide
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
