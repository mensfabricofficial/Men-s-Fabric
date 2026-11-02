import React from 'react';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import { EmptyState } from '../components/common/EmptyState';
import { ProductCard } from '../components/product/ProductCard';

interface WishlistPageProps {
  onNavigate: (route: string) => void;
}

export const WishlistPage: React.FC<WishlistPageProps> = ({ onNavigate }) => {
  const { wishlistProducts, clearWishlist } = useWishlist();
  const { addItem } = useCart();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-200 gap-4 mb-8">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Curated Favorites</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight mt-1">
            My Wishlist ({wishlistProducts.length})
          </h1>
        </div>

        {wishlistProducts.length > 0 && (
          <button
            onClick={() => clearWishlist()}
            className="text-xs text-red-600 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Wishlist</span>
          </button>
        )}
      </div>

      {wishlistProducts.length === 0 ? (
        <EmptyState
          icon={<Heart className="w-8 h-8 text-neutral-400" />}
          title="Your wishlist is currently empty"
          description="Save the pieces you love and revisit them whenever you're ready to order."
          actionText="Explore Menswear"
          onAction={() => onNavigate('/shop')}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {wishlistProducts.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

    </div>
  );
};
