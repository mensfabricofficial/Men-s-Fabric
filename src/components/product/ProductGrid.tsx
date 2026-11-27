import React from 'react';
import { motion } from 'motion/react';
import { Product } from '../../types';
import { ProductCard } from './ProductCard';
import { ProductCardSkeleton } from '../common/SkeletonLoader';
import { EmptyState } from '../common/EmptyState';
import { Shirt } from 'lucide-react';

interface ProductGridProps {
  products: Product[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onQuickView?: (product: Product) => void;
  onNavigate: (route: string) => void;
  onResetFilters?: () => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  loading = false,
  emptyTitle = 'No products found',
  emptyDescription = 'There are no items matching your criteria at this moment.',
  onQuickView,
  onNavigate,
  onResetFilters,
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<Shirt className="w-8 h-8 text-neutral-400" />}
        title={emptyTitle}
        description={emptyDescription}
        actionText={onResetFilters ? 'Clear Filters' : 'Explore Collections'}
        onAction={onResetFilters || (() => onNavigate('/shop'))}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
      {products.map((product, index) => (
        <motion.div
          key={product.id}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.08 }}
          transition={{
            duration: 0.36,
            delay: Math.min(index % 8, 7) * 0.045,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <ProductCard
            product={product}
            onQuickView={onQuickView}
            onNavigate={onNavigate}
          />
        </motion.div>
      ))}
    </div>
  );
};
