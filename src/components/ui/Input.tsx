'use client';
import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-4 min-h-[52px] text-base rounded-xl',
            'bg-[var(--paper-raised)] text-[var(--ink)]',
            'border-2 border-[var(--border-strong)]',
            'placeholder:text-[var(--ink-muted)]',
            'focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-tint)]',
            'transition-colors duration-150',
            error && 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger-tint)]',
            className
          )}
          {...props}
        />
        {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
        {hint && !error && <p className="text-sm text-[var(--ink-muted)]">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
export default Input;
