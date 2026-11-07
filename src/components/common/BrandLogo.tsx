import React from 'react';

interface BrandLogoProps {
  variant?: 'dark' | 'light'; // 'dark' = deep black for white/light bg; 'light' = pure white for dark bg
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
  alt = "MEN'S FABRIC",
  size = 'md',
}) => {
  const isLightOnDark = variant === 'light';

  // Size configurations for high-contrast prestige presence
  const sizeStyles = {
    sm: 'h-8 sm:h-9',
    md: 'h-10 sm:h-12',
    lg: 'h-12 sm:h-16',
    xl: 'h-16 sm:h-20',
  }[size];

  return (
    <div className={`inline-flex items-center justify-center select-none ${className}`}>
      {/* Official Brand Logo Image Only */}
      <img
        src="/logo.jpg"
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

