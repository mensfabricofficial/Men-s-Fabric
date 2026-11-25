import React, { useState, useId } from 'react';

const renderFloatingLabel = (label: string, isRequired?: boolean) => {
  const trimmed = label.trim();
  const hasTrailingStar = trimmed.endsWith('*');
  const cleanLabel = hasTrailingStar ? trimmed.slice(0, -1).trimEnd() : label;
  const showRequired = hasTrailingStar || Boolean(isRequired);

  return (
    <>
      <span>{cleanLabel}</span>
      {showRequired && (
        <sup
          aria-hidden="true"
          className="ml-0.5 font-mono text-[10px] font-bold leading-none text-current"
        >
          *
        </sup>
      )}
    </>
  );
};

interface FloatingInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  labelBgClass?: string;
  prefixText?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerClassName?: string;
  compact?: boolean;
}

export const FloatingInput: React.FC<FloatingInputProps> = ({
  label,
  labelBgClass = 'bg-white',
  prefixText,
  leftIcon,
  rightElement,
  containerClassName = '',
  className = '',
  compact = false,
  id,
  value,
  defaultValue,
  onFocus,
  onBlur,
  placeholder,
  required,
  ...props
}) => {
  const autoId = useId();
  const inputId = id || autoId;
  const [focused, setFocused] = useState(false);

  const hasValue =
    value !== undefined && value !== null
      ? String(value).length > 0
      : defaultValue !== undefined && defaultValue !== null
      ? String(defaultValue).length > 0
      : false;

  const isFloated = focused || hasValue;

  return (
    <div className={`relative w-full ${containerClassName}`}>
      {/* Left Icon or Prefix (only visible when floated or always cleanly aligned) */}
      {leftIcon && (
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none z-10 flex items-center">
          {leftIcon}
        </span>
      )}

      {prefixText && isFloated && (
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-500 pointer-events-none select-none z-10">
          {prefixText}
        </span>
      )}

      <input
        id={inputId}
        value={value}
        defaultValue={defaultValue}
        required={required}
        placeholder={isFloated ? placeholder : ''}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={`peer w-full ${compact ? 'h-10 text-xs' : 'h-12 text-sm'} bg-white text-neutral-900 rounded-[6px] border transition-colors duration-150 focus:outline-none ${
          focused
            ? 'border-neutral-900'
            : 'border-neutral-300 hover:border-neutral-400'
        } ${
          leftIcon
            ? 'pl-10'
            : prefixText && isFloated
            ? 'pl-12'
            : 'pl-3.5'
        } ${rightElement ? 'pr-11' : 'pr-3.5'} ${className}`}
        {...props}
      />

      <label
        htmlFor={inputId}
        className={`pointer-events-none absolute transition-all duration-150 ease-out origin-left select-none ${
          isFloated
            ? `-top-2 left-2.5 px-1.5 text-[11px] font-medium leading-none ${labelBgClass} ${
                focused ? 'text-neutral-900' : 'text-neutral-600'
              }`
            : `top-1/2 -translate-y-1/2 ${
                leftIcon ? 'left-10' : 'left-3.5'
              } ${compact ? 'text-xs' : 'text-sm'} text-neutral-500 bg-transparent`
        }`}
      >
        {renderFloatingLabel(label, required)}
      </label>

      {rightElement && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center z-10">
          {rightElement}
        </div>
      )}
    </div>
  );
};

interface FloatingTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  labelBgClass?: string;
  containerClassName?: string;
}

export const FloatingTextarea: React.FC<FloatingTextareaProps> = ({
  label,
  labelBgClass = 'bg-white',
  containerClassName = '',
  className = '',
  id,
  value,
  defaultValue,
  onFocus,
  onBlur,
  placeholder,
  rows = 3,
  required,
  ...props
}) => {
  const autoId = useId();
  const textareaId = id || autoId;
  const [focused, setFocused] = useState(false);

  const hasValue =
    value !== undefined && value !== null
      ? String(value).length > 0
      : defaultValue !== undefined && defaultValue !== null
      ? String(defaultValue).length > 0
      : false;

  const isFloated = focused || hasValue;

  return (
    <div className={`relative w-full ${containerClassName}`}>
      <textarea
        id={textareaId}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        required={required}
        placeholder={isFloated ? placeholder : ''}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={`peer w-full px-3.5 py-3 text-sm bg-white text-neutral-900 rounded-[6px] border transition-colors duration-150 focus:outline-none leading-relaxed ${
          focused
            ? 'border-neutral-900'
            : 'border-neutral-300 hover:border-neutral-400'
        } ${className}`}
        {...props}
      />

      <label
        htmlFor={textareaId}
        className={`pointer-events-none absolute transition-all duration-150 ease-out origin-left select-none ${
          isFloated
            ? `-top-2 left-2.5 px-1.5 text-[11px] font-medium leading-none ${labelBgClass} ${
                focused ? 'text-neutral-900' : 'text-neutral-600'
              }`
            : 'top-3.5 left-3.5 text-sm text-neutral-500 bg-transparent'
        }`}
      >
        {renderFloatingLabel(label, required)}
      </label>
    </div>
  );
};

interface FloatingSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  labelBgClass?: string;
  containerClassName?: string;
}

export const FloatingSelect: React.FC<FloatingSelectProps> = ({
  label,
  labelBgClass = 'bg-white',
  containerClassName = '',
  className = '',
  id,
  children,
  onFocus,
  onBlur,
  required,
  ...props
}) => {
  const autoId = useId();
  const selectId = id || autoId;
  const [focused, setFocused] = useState(false);

  return (
    <div className={`relative w-full ${containerClassName}`}>
      <select
        id={selectId}
        required={required}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={`w-full h-12 px-3.5 text-sm bg-white text-neutral-900 rounded-[6px] border transition-colors duration-150 focus:outline-none cursor-pointer ${
          focused
            ? 'border-neutral-900'
            : 'border-neutral-300 hover:border-neutral-400'
        } ${className}`}
        {...props}
      >
        {children}
      </select>

      <label
        htmlFor={selectId}
        className={`pointer-events-none absolute -top-2 left-2.5 px-1.5 text-[11px] font-medium leading-none select-none ${labelBgClass} ${
          focused ? 'text-neutral-900' : 'text-neutral-600'
        }`}
      >
        {renderFloatingLabel(label, required)}
      </label>
    </div>
  );
};
