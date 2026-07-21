'use client';
import { cn } from '@/lib/utils';
import { SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, options, placeholder, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full px-4 min-h-[52px] text-base rounded-xl',
            'bg-[var(--paper-raised)] text-[var(--ink)]',
            'border-2 border-[var(--border-strong)]',
            'focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-tint)]',
            'transition-colors duration-150 cursor-pointer',
            error && 'border-[var(--danger)]',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
        {hint && !error && <p className="text-sm text-[var(--ink-muted)]">{hint}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
export default Select;
