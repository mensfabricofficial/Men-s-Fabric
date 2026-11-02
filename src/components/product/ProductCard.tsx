import React, { useState } from 'react';
import { Heart, ShoppingBag, Eye } from 'lucide-react';
import { Product } from '../../types';
import { useWishlist } from '../../context/WishlistContext';
import { useCart } from '../../context/CartContext';

interface ProductCardProps {
  product: Product;
  onQuickView?: (product: Product) => void;
  onNavigate: (route: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onQuickView,
  onNavigate,
}) => {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { addItem } = useCart();
  const [isHovered, setIsHovered] = useState(false);
  const isWishlisted = isInWishlist(product.id);

  const isSale = typeof product.salePrice === 'number' && product.salePrice > 0 && product.salePrice < product.price;
  const currentPrice = isSale ? product.salePrice! : product.price;
  const discountPercent = isSale ? Math.round(((product.price - product.salePrice!) / product.price) * 100) : 0;
  const isOutOfStock = product.totalStock <= 0;

  const primaryImage = product.thumbnail || product.images?.[0] || '/logo.jpg';
  const secondaryImage = product.images?.[1] || primaryImage;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;

    // Pick first size and color
    const defaultSize = product.sizes?.[0] || 'Standard';
    const defaultColor = product.colors?.[0]?.name || 'Standard';
    
    // Check variant stock if variants exist
    let available = product.totalStock;
    let sku = product.sku || '';
    if (product.variants && product.variants.length > 0) {
      const match = product.variants.find(v => v.size === defaultSize && v.color === defaultColor) || product.variants[0];
      if (match) {
        available = match.stock;
        sku = match.sku;
      }
    }

    addItem({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      productImage: primaryImage,
      size: defaultSize,
      color: defaultColor,
      quantity: 1,
      price: product.price,
      salePrice: product.salePrice,
      availableStock: available,
      sku,
    });
  };

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWishlist(product);
  };

  return (
    <div
      onClick={() => onNavigate(`/product/${product.slug || product.id}`)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative flex flex-col bg-white rounded-lg overflow-hidden border border-neutral-100 hover:border-neutral-300 transition-all duration-300 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
    >
      {/* Image container */}
      <div className="relative w-full aspect-[3/4] bg-neutral-100 overflow-hidden">
        <img
          src={isHovered && secondaryImage ? secondaryImage : primaryImage}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
        />

        {/* Badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
          {isOutOfStock ? (
            <span className="bg-neutral-900/90 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider uppercase">
              Sold Out
            </span>
          ) : (
            <>
              {isSale && (
                <span className="bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider uppercase">
                  -{discountPercent}%
                </span>
              )}
              {product.newArrival && (
                <span className="bg-white text-black border border-black/20 text-[10px] font-bold px-2 py-0.5 rounded tracking-wider uppercase">
                  New
                </span>
              )}
              {product.bestSeller && (
                <span className="bg-neutral-800 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider uppercase">
                  Hot
                </span>
              )}
            </>
          )}
        </div>

        {/* Wishlist Button */}
        <button
          onClick={handleWishlistClick}
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-neutral-700 hover:text-black hover:bg-white transition-all shadow-sm z-10 cursor-pointer"
        >
          <Heart className={`w-4 h-4 transition-colors ${isWishlisted ? 'fill-black text-black' : 'text-neutral-600'}`} />
        </button>

        {/* Bottom hover actions */}
        <div className="absolute inset-x-2 bottom-2 flex gap-1.5 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-10">
          <button
            onClick={handleQuickAdd}
            disabled={isOutOfStock}
            className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider rounded flex items-center justify-center gap-1.5 shadow-md transition-colors ${
              isOutOfStock
                ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                : 'bg-black text-white hover:bg-neutral-800 cursor-pointer'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>{isOutOfStock ? 'Sold Out' : 'Quick Add'}</span>
          </button>
          
          {onQuickView && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickView(product);
              }}
              title="Quick view"
              className="w-8 h-8 bg-white text-neutral-800 hover:text-black rounded flex items-center justify-center shadow-md transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Info container */}
      <div className="p-3.5 flex flex-col flex-1 justify-between">
        <div>
          <div className="flex items-center justify-between text-[11px] text-neutral-400 font-medium uppercase tracking-wider mb-1">
            <span>{product.categoryName || product.category || 'Menswear'}</span>
            {product.fabric && (
              <span className="truncate max-w-[100px] text-neutral-500">{product.fabric}</span>
            )}
          </div>
          
          <h4 className="text-sm font-semibold text-neutral-900 group-hover:text-black transition-colors line-clamp-1 mb-1.5">
            {product.name}
          </h4>
        </div>

        {/* Color swatches preview */}
        {product.colors && product.colors.length > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            {product.colors.slice(0, 4).map((c, idx) => (
              <span
                key={idx}
                title={c.name}
                className="w-2.5 h-2.5 rounded-full border border-neutral-300"
                style={{ backgroundColor: c.code || '#000000' }}
              />
            ))}
            {product.colors.length > 4 && (
              <span className="text-[10px] text-neutral-400">+{product.colors.length - 4}</span>
            )}
          </div>
        )}

        {/* Price container */}
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-neutral-900">
            ৳{currentPrice.toLocaleString('en-BD')}
          </span>
          {isSale && (
            <span className="text-xs text-neutral-400 line-through">
              ৳{product.price.toLocaleString('en-BD')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
