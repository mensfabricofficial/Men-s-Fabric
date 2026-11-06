import React from 'react';

interface BarcodeProps {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  className?: string;
}

// Code 39 pattern encoding: 9 elements per char (5 bars, 4 spaces).
// 1 = wide (W), 0 = narrow (N). Elements alternate Bar, Space, Bar, Space, Bar, Space, Bar, Space, Bar.
const CODE39_PATTERNS: Record<string, string> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  'A': '100001001',
  'B': '001001001',
  'C': '101001000',
  'D': '000011001',
  'E': '100011000',
  'F': '001011000',
  'G': '000001101',
  'H': '100001100',
  'I': '001001100',
  'J': '000011100',
  'K': '100000011',
  'L': '001000011',
  'M': '101000010',
  'N': '000010011',
  'O': '100010010',
  'P': '001010010',
  'Q': '000000111',
  'R': '100000110',
  'S': '001000110',
  'T': '000010110',
  'U': '110000001',
  'V': '011000001',
  'W': '111000000',
  'X': '010010001',
  'Y': '110010000',
  'Z': '011010000',
  '-': '010000101',
  '.': '110000100',
  ' ': '011000100',
  '$': '010101000',
  '/': '010100010',
  '+': '010001010',
  '%': '000101010',
  '*': '010010100', // Delimiter
};

export const Barcode: React.FC<BarcodeProps> = ({
  value,
  width = 1.5,
  height = 42,
  displayValue = true,
  className = '',
}) => {
  // Normalize string to supported Code 39 uppercase characters
  const clean = (value || 'MF-ORDER')
    .toUpperCase()
    .replace(/[^0-9A-Z\-\. \$\/\+\%]/g, '-');
  
  const encodedStr = `*${clean}*`;

  const narrowWidth = width;
  const wideWidth = width * 2.5;
  const gapWidth = narrowWidth; // gap between characters

  // Build bars array: each bar has x, width
  let currentX = 0;
  const bars: { x: number; width: number }[] = [];

  for (let i = 0; i < encodedStr.length; i++) {
    const char = encodedStr[i];
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS['-'];

    for (let el = 0; el < 9; el++) {
      const isWide = pattern[el] === '1';
      const elWidth = isWide ? wideWidth : narrowWidth;
      const isBar = el % 2 === 0;

      if (isBar) {
        bars.push({ x: currentX, width: elWidth });
      }
      currentX += elWidth;
    }

    // Inter-character space
    if (i < encodedStr.length - 1) {
      currentX += gapWidth;
    }
  }

  const totalWidth = Math.ceil(currentX);

  return (
    <div className={`inline-flex flex-col items-center select-none ${className}`}>
      <svg
        width={totalWidth}
        height={height}
        viewBox={`0 0 ${totalWidth} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        className="shape-rendering-crispEdges block"
      >
        {bars.map((bar, idx) => (
          <rect
            key={idx}
            x={bar.x}
            y={0}
            width={bar.width}
            height={height}
            fill="#000000"
          />
        ))}
      </svg>
      {displayValue && (
        <span className="font-mono text-[10px] font-bold tracking-widest text-neutral-800 mt-1 uppercase">
          {clean}
        </span>
      )}
    </div>
  );
};
