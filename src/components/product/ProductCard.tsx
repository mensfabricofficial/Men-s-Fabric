import React, { useState } from 'react';
import { ShoppingBag, Eye, ChevronUp } from 'lucide-react';
import { Product } from '../../types';
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
  const { addItem } = useCart();
  const [isHovered, setIsHovered] = useState(false);

  const isSale = typeof product.salePrice === 'number' && product.salePrice > 0 && product.salePrice < product.price;
  const currentPrice = isSale ? product.salePrice! : product.price;
  const discountPercent = isSale ? Math.round(((product.price - product.salePrice!) / product.price) * 100) : 0;
  const isOutOfStock = product.totalStock <= 0;

  const primaryImage = product.thumbnail || product.images?.[0] || '/assets/aistudio/selvee1_8ff37f5b.jpg';
  const secondaryImage = product.images?.[1] || primaryImage;

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

  return (
    <div
      onClick={() => onNavigate(`/product/${product.id}`)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative flex flex-col bg-white overflow-hidden cursor-pointer select-none transition-all duration-300"
    >
      {/* Image container */}
      <div className="relative w-full aspect-square bg-neutral-100 overflow-hidden rounded-md border border-neutral-100/80">
        <img
          src={isHovered && secondaryImage ? secondaryImage : primaryImage}
          alt={product.name}
          decoding="async"
          className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-103"
        />

        {/* Badges on top-left: Discount % or Sold Out only (no extra label below discount) */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
          {isOutOfStock ? (
            <span className="bg-neutral-900/90 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider uppercase">
              Sold Out
            </span>
          ) : (
            isSale && (
              <span className="bg-red-600 text-white text-[10px] sm:text-[11px] font-extrabold px-2 py-0.5 rounded tracking-wider uppercase shadow-xs">
                -{discountPercent}%
              </span>
            )
          )}
        </div>

        {/* Bottom-left Premium White Shopping Bag Icon Button */}
        <button
          onClick={handleQuickAdd}
          disabled={isOutOfStock}
          aria-label="Add to bag"
          title={isOutOfStock ? 'Sold Out' : 'Quick Add to Bag'}
          className={`absolute bottom-2.5 left-2.5 w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-white/95 backdrop-blur-xs border border-neutral-200/90 shadow-xs flex items-center justify-center transition-all z-10 ${
            isOutOfStock
              ? 'opacity-40 cursor-not-allowed text-neutral-400'
              : 'text-neutral-800 hover:bg-black hover:text-white hover:border-black cursor-pointer'
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
            className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-md bg-white/95 text-neutral-800 hover:text-black hover:bg-white border border-neutral-200/90 flex items-center justify-center shadow-xs opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 cursor-pointer z-10"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Info container strictly formatted per reference */}
      <div className="pt-2.5 pb-2 flex flex-col space-y-1">
        {/* Row 1: Title on Left, Product Code on Right */}
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-[13px] sm:text-sm font-semibold text-neutral-900 group-hover:text-black transition-colors line-clamp-1 flex-1">
            {product.name}
          </h4>
          <span className="text-[11px] sm:text-xs font-mono text-neutral-500 shrink-0">
            {displaySku}
          </span>
        </div>

        {/* Row 2: Color count dropdown line */}
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

        {/* Row 3: Price line with BDT, strike-through original, and bold red discount percent */}
        <div className="flex items-baseline flex-wrap gap-2 pt-0.5">
          <span className="text-[13px] sm:text-sm font-bold text-neutral-900">
            BDT {currentPrice.toLocaleString('en-BD')}
          </span>

          {isSale && (
            <>
              <span className="text-[11px] sm:text-xs text-neutral-400 line-through font-normal">
                BDT {product.price.toLocaleString('en-BD')}
              </span>
              <span className="text-[11px] sm:text-xs font-bold text-red-600">
                -{discountPercent}%
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
