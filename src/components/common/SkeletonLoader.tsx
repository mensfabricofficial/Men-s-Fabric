import React from 'react';

export const ProductCardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col bg-white overflow-hidden animate-pulse select-none">
      <div className="w-full aspect-square bg-neutral-100 rounded-lg border border-neutral-100" />
      <div className="pt-3 pb-2 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="h-3.5 w-3/5 bg-neutral-100 rounded-sm" />
          <div className="h-3 w-12 bg-neutral-100 rounded-sm" />
        </div>
        <div className="h-3 w-1/3 bg-neutral-100 rounded-sm" />
        <div className="h-3.5 w-1/4 bg-neutral-100 rounded-sm pt-0.5" />
      </div>
    </div>
  );
};

export const ProductDetailsSkeleton: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-pulse">
      <div className="h-3 w-48 bg-neutral-100 rounded-sm mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        <div className="lg:col-span-6 aspect-square bg-neutral-100 rounded-lg border border-neutral-200/80" />
        <div className="lg:col-span-6 space-y-5">
          <div className="flex justify-between">
            <div className="h-3 w-20 bg-neutral-100 rounded-sm" />
            <div className="h-3 w-24 bg-neutral-100 rounded-sm" />
          </div>
          <div className="h-8 w-3/4 bg-neutral-100 rounded-sm" />
          <div className="h-7 w-1/3 bg-neutral-100 rounded-sm" />
          <div className="h-6 w-40 bg-neutral-100 rounded-sm" />
          <div className="flex gap-2 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-12 h-10 bg-neutral-100 rounded-md" />
            ))}
          </div>
          <div className="h-12 w-full bg-neutral-100 rounded-md pt-2" />
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
