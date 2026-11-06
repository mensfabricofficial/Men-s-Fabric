import React from 'react';

interface BrandLogoProps {
  variant?: 'dark' | 'light'; // 'dark' = black logo for white/light bg; 'light' = white logo for black/dark bg
  className?: string;
  alt?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'dark',
  className = 'h-9 w-auto object-contain',
  alt = "MEN'S FABRIC Clothing Brand",
}) => {
  const isLightOnDark = variant === 'light';

  return (
    <div className="relative inline-flex items-center justify-center select-none overflow-hidden">
      <img
        src="/logo.jpg"
        alt={alt}
        className={`${className} ${
          isLightOnDark
            ? 'mix-blend-screen brightness-110 contrast-125'
            : 'invert mix-blend-multiply contrast-125'
        }`}
      />
    </div>
  );
};
