import React from 'react';
import { ShoppingBag, Eye, ChevronUp } from 'lucide-react';
import { Product } from '../../types';
import { useCart } from '../../context/CartContext';
import { getProductUrlSlug } from '../../services/productService';
import { ProgressiveImage } from '../common/ProgressiveImage';

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
  const { addItem } = useCart();

  const regularPrice = Math.max(0, Number(product.price) || 0);
  const saleVal = typeof product.salePrice === 'number' && product.salePrice > 0 ? product.salePrice : 0;
  const isSale = saleVal > 0 && saleVal < regularPrice;
  const currentPrice = isSale ? saleVal : regularPrice;
  const discountPercent = isSale && regularPrice > 0 ? Math.round(((regularPrice - saleVal) / regularPrice) * 100) : 0;
  const isOutOfStock = (Number(product.totalStock) || 0) <= 0;

  const primaryImage =
    (typeof product.thumbnail === 'string' && product.thumbnail.trim()) ||
    (Array.isArray(product.images) ? product.images.find((u) => typeof u === 'string' && u.trim())?.trim() : '') ||
    '';

  // Compute display SKU (fallback to 6-char id or standard luxury code)
  const displaySku = product.sku || product.variants?.[0]?.sku || (product.id ? product.id.slice(0, 6).toUpperCase() : '277055');
  const colorCount = product.colors && product.colors.length > 0 ? product.colors.length : 1;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;

    // Pick first size and color
    const defaultSize = product.sizes?.[0] || 'Standard';
    const defaultColor = product.colors?.[0]?.name || 'Standard';
    
    // Check variant stock if variants exist
    let available = product.totalStock;
    let sku = displaySku;
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
      productSlug: getProductUrlSlug(product),
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

  return (
    <div
      onClick={() => onNavigate(`/product/${getProductUrlSlug(product)}`)}
      className="group relative flex flex-col bg-white overflow-hidden cursor-pointer select-none"
    >
      {/* Image container (Square 1:1, No auto image swap on hover) */}
      <div className="relative w-full aspect-square bg-neutral-50 overflow-hidden rounded-lg border border-neutral-100 group-hover:border-neutral-200 transition-colors">
        <ProgressiveImage
          src={primaryImage}
          alt={product.name}
          decoding="async"
          wrapperClassName="relative w-full h-full overflow-hidden bg-neutral-100"
          className="w-full h-full object-cover object-center transition-all duration-700 ease-out group-hover:scale-105 will-change-transform"
        />

        {/* Out of stock badge only (no floating discount badge on image) */}
        {isOutOfStock && (
          <div className="absolute top-2.5 left-2.5 z-10">
            <span className="bg-neutral-900/90 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-sm tracking-wider uppercase">
              Sold Out
            </span>
          </div>
        )}

        {/* Bottom-left Cart Icon Button */}
        <button
          onClick={handleQuickAdd}
          disabled={isOutOfStock}
          aria-label="Add to cart"
          title={isOutOfStock ? 'Sold Out' : 'Quick Add to Cart'}
          className={`absolute bottom-2.5 left-2.5 w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-white/95 border border-neutral-200/80 flex items-center justify-center transition-all duration-200 shadow-xs z-10 ${
            isOutOfStock
              ? 'opacity-40 cursor-not-allowed text-neutral-400'
              : 'text-neutral-900 hover:bg-black hover:text-white hover:border-black active:scale-95 cursor-pointer'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
        </button>

        {/* Quick View Button on hover bottom-right */}
        {onQuickView && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickView(product);
            }}
            title="Quick view"
            className="absolute bottom-2.5 right-2.5 w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-white/95 text-neutral-900 hover:bg-black hover:text-white border border-neutral-200/80 flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 shadow-xs cursor-pointer z-10"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Info container */}
      <div className="pt-3 pb-2 flex flex-col space-y-1">
        {/* Row 1: Title on Left, Product Code on Right */}
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-[13px] sm:text-sm font-heading font-bold text-neutral-900 group-hover:text-black transition-colors line-clamp-1 flex-1">
            {product.name}
          </h4>
          <span className="text-[11px] font-medium lining-nums tabular-nums text-neutral-400 shrink-0 tracking-wide">
            {displaySku}
          </span>
        </div>

        {/* Row 2: Color count line */}
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-1 hover:text-black transition-colors">
            <span>{colorCount} {colorCount === 1 ? 'color' : 'colors'}</span>
            <ChevronUp className="w-3 h-3 text-neutral-400" />
          </div>

          {/* Color swatch dots preview */}
          {product.colors && product.colors.length > 0 && (
            <div className="flex items-center gap-1">
              {product.colors.slice(0, 4).map((c, idx) => (
                <span
                  key={idx}
                  title={c.name}
                  className="w-2.5 h-2.5 rounded-full border border-neutral-300 shadow-2xs"
                  style={{ backgroundColor: c.code || '#000000' }}
                />
              ))}
              {product.colors.length > 4 && (
                <span className="text-[10px] text-neutral-400">+{product.colors.length - 4}</span>
              )}
            </div>
          )}
        </div>

        {/* Row 3: Price line */}
        <div className="flex items-baseline flex-wrap gap-1.5 sm:gap-2 pt-0.5 lining-nums tabular-nums">
          <span className="text-[13px] sm:text-sm font-heading font-bold text-neutral-900">
            BDT {currentPrice.toLocaleString('en-BD')}
          </span>

          {isSale && (
            <>
              <span className="text-[11px] sm:text-xs text-neutral-400 line-through font-normal">
                BDT {regularPrice.toLocaleString('en-BD')}
              </span>
              <span className="text-[11px] sm:text-xs font-heading font-bold text-red-600">
                -{discountPercent}%
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
