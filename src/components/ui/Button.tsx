'use client';
import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 cursor-pointer select-none',
          'border disabled:opacity-50 disabled:cursor-not-allowed',
          // sizes
          size === 'sm' && 'text-xs px-3 py-1.5 rounded',
          size === 'md' && 'text-sm px-4 py-2 rounded-md',
          size === 'lg' && 'text-base px-6 py-2.5 rounded-md',
          // variants
          variant === 'primary' && [
            'bg-[var(--accent)] text-[var(--paper)] border-[var(--accent)]',
            'hover:bg-[var(--accent-light)] hover:border-[var(--accent-light)]',
            'shadow-sm',
          ],
          variant === 'secondary' && [
            'bg-[var(--paper-dark)] text-[var(--ink)] border-[var(--border)]',
            'hover:bg-[var(--paper-darker)] hover:border-[var(--ink-muted)]',
          ],
          variant === 'outline' && [
            'bg-transparent text-[var(--ink)] border-[var(--border)]',
            'hover:bg-[var(--paper-dark)] hover:border-[var(--ink-muted)]',
          ],
          variant === 'ghost' && [
            'bg-transparent text-[var(--ink-light)] border-transparent',
            'hover:bg-[var(--paper-dark)]',
          ],
          variant === 'danger' && [
            'bg-red-700 text-white border-red-700',
            'hover:bg-red-800 hover:border-red-800',
          ],
          className
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
export default Button;
