import React from 'react';

interface BrandLogoProps {
  variant?: 'dark' | 'light'; // 'dark' = black Selvee for white/light bg; 'light' = white Selvee for dark bg
  className?: string;
  imgClassName?: string;
  alt?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'dark',
  className = '',
  imgClassName,
  alt = 'Selvee',
  size = 'md',
}) => {
  const isLightOnDark = variant === 'light';

  // Size configurations for crisp brand presence
  const sizeStyles = {
    sm: 'h-7 sm:h-8',
    md: 'h-9 sm:h-11',
    lg: 'h-11 sm:h-14',
    xl: 'h-14 sm:h-18',
  }[size];

  return (
    <div className={`inline-flex items-center justify-center select-none ${className}`}>
      {/* Official Selvee Wordmark Logo: black on light backgrounds, white on dark backgrounds */}
      <img
        src="/assets/aistudio/selvee1_8ff37f5b.jpg"
        alt={alt}
        className={`${imgClassName || sizeStyles} w-auto object-contain transition-all ${
          isLightOnDark
            ? 'mix-blend-screen brightness-110 contrast-125'
            : 'filter invert mix-blend-multiply contrast-125'
        }`}
      />
    </div>
  );
};
