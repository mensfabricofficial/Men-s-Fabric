import React from 'react';

export const HeroBannerTileSkeleton: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="relative w-full aspect-[3/2] rounded-xl overflow-hidden border border-neutral-200/70 skeleton-shimmer select-none"
    >
      <div className="absolute inset-0 flex items-center p-5 sm:p-8 lg:p-10">
        <div className="w-full max-w-sm space-y-2.5 sm:space-y-3.5">
          <div className="h-3 w-24 sm:w-32 rounded bg-black/10" />
          <div className="h-7 sm:h-10 w-3/4 rounded bg-black/10" />
          <div className="h-3 sm:h-3.5 w-5/6 rounded bg-black/10" />
        </div>
      </div>
    </div>
  );
};

export const HeroBannerSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-5">
      <HeroBannerTileSkeleton />
      <HeroBannerTileSkeleton />
    </div>
  );
};

export const CategoryCardSkeleton: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[4/5] rounded-xl overflow-hidden border border-neutral-200/70 skeleton-shimmer select-none"
    >
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 space-y-2 bg-gradient-to-t from-black/15 via-black/5 to-transparent">
        <div className="h-4 w-2/3 rounded-sm bg-black/15" />
        <div className="h-2.5 w-1/2 rounded-sm bg-black/10" />
      </div>
    </div>
  );
};

export const ProductCardSkeleton: React.FC = () => {
  return (
    <div aria-hidden="true" className="flex flex-col bg-white overflow-hidden select-none">
      <div className="relative w-full aspect-square rounded-lg border border-neutral-200/70 skeleton-shimmer overflow-hidden">
        <div className="absolute bottom-2.5 left-2.5 w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-white/70" />
      </div>
      <div className="pt-3 pb-2 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="h-3.5 w-3/5 skeleton-shimmer rounded-sm" />
          <div className="h-3 w-12 skeleton-shimmer rounded-sm" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="h-3 w-1/3 skeleton-shimmer rounded-sm" />
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full skeleton-shimmer" />
            <div className="w-2.5 h-2.5 rounded-full skeleton-shimmer" />
          </div>
        </div>
        <div className="h-3.5 w-1/3 skeleton-shimmer rounded-sm pt-0.5" />
      </div>
    </div>
  );
};

export const ProductDetailsSkeleton: React.FC = () => {
  return (
    <div className="max-w-[1660px] mx-auto px-0 lg:px-8 py-0 lg:py-8 select-none">
      <div className="hidden lg:block h-3 w-48 skeleton-shimmer rounded-sm mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-10 items-start">
        <div className="lg:col-span-6 aspect-square skeleton-shimmer rounded-none lg:rounded-lg border-b lg:border border-neutral-200/80" />
        <div className="lg:col-span-6 px-4 sm:px-6 lg:px-0 pt-3.5 lg:pt-0 space-y-4">
          <div className="lg:hidden h-3 w-36 skeleton-shimmer rounded-sm" />
          <div className="h-7 sm:h-8 w-3/4 skeleton-shimmer rounded-sm" />
          <div className="h-4 w-40 skeleton-shimmer rounded-sm" />
          <div className="h-7 w-1/3 skeleton-shimmer rounded-sm" />
          <div className="flex gap-2 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-12 h-10 skeleton-shimmer rounded-lg" />
            ))}
          </div>
          <div className="h-12 w-full skeleton-shimmer rounded-lg pt-2" />
        </div>
      </div>
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="w-full bg-white rounded-lg border border-neutral-200 overflow-hidden divide-y divide-neutral-100 animate-pulse">
      <div className="h-10 bg-neutral-100" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 px-4 flex items-center justify-between space-x-4">
          <div className="h-4 w-1/4 bg-neutral-200 rounded" />
          <div className="h-4 w-1/5 bg-neutral-200 rounded" />
          <div className="h-4 w-1/6 bg-neutral-200 rounded" />
          <div className="h-4 w-12 bg-neutral-200 rounded" />
        </div>
      ))}
    </div>
  );
};
