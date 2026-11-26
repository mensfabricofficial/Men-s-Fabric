import React, { useState, useRef, useLayoutEffect } from 'react';
import { Shirt } from 'lucide-react';

interface ProgressiveImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  alt: string;
  wrapperClassName?: string;
  skeletonClassName?: string;
  emptyFallback?: React.ReactNode;
  onReadyChange?: (ready: boolean) => void;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  alt,
  className = '',
  wrapperClassName = 'relative w-full h-full overflow-hidden bg-neutral-100',
  skeletonClassName = 'skeleton-shimmer',
  emptyFallback,
  onReadyChange,
  onLoad,
  onError,
  ...imgProps
}) => {
  const cleanSrc = typeof src === 'string' ? src.trim() : '';
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    setFailed(false);
    if (!cleanSrc) {
      setLoaded(true);
      onReadyChange?.(true);
      return;
    }
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setLoaded(true);
      onReadyChange?.(true);
    } else {
      setLoaded(false);
      onReadyChange?.(false);
    }
  }, [cleanSrc, onReadyChange]);

  if (!cleanSrc || failed) {
    return (
      <div className={`${wrapperClassName} flex items-center justify-center`}>
        {emptyFallback ?? <Shirt className="w-7 h-7 text-neutral-300" />}
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      {!loaded && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 z-0 ${skeletonClassName}`}
        />
      )}
      <img
        ref={imgRef}
        src={cleanSrc}
        alt={alt}
        onLoad={(e) => {
          setLoaded(true);
          onReadyChange?.(true);
          onLoad?.(e);
        }}
        onError={(e) => {
          setFailed(true);
          setLoaded(true);
          onReadyChange?.(true);
          onError?.(e);
        }}
        className={`${className} transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        {...imgProps}
      />
    </div>
  );
};
