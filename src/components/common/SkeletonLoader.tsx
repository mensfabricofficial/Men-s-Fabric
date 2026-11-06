import React from 'react';

export const ProductCardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col bg-white border border-neutral-100 rounded-lg overflow-hidden animate-pulse">
      <div className="w-full aspect-square bg-neutral-200" />
      <div className="p-4 space-y-3">
        <div className="h-3 w-1/3 bg-neutral-200 rounded" />
        <div className="h-4 w-4/5 bg-neutral-200 rounded" />
        <div className="h-4 w-1/4 bg-neutral-200 rounded" />
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
