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
          'inline-flex items-center justify-center gap-2 font-bold transition-all duration-150 cursor-pointer select-none',
          'border-2 disabled:opacity-50 disabled:cursor-not-allowed',
          // sizes -- floor raised to a 44px+ tap target even at 'sm', since row-level actions
          // (the most common size in the app) are exactly what a gloved/imprecise touch needs
          size === 'sm' && 'text-sm px-3.5 min-h-11 rounded-lg',
          size === 'md' && 'text-base px-5 min-h-[52px] rounded-xl',
          size === 'lg' && 'text-lg px-7 min-h-[60px] rounded-xl',
          // variants
          variant === 'primary' && [
            'bg-[var(--accent)] text-white border-[var(--accent)]',
            'hover:bg-[var(--accent-dark)] hover:border-[var(--accent-dark)]',
            'shadow-[0_3px_0_var(--accent-dark)] active:shadow-none active:translate-y-[3px]',
          ],
          variant === 'secondary' && [
            'bg-[var(--paper-raised)] text-[var(--ink)] border-[var(--border-strong)]',
            'hover:bg-[var(--paper-sunken)] hover:border-[var(--ink-muted)]',
          ],
          variant === 'outline' && [
            'bg-transparent text-[var(--ink)] border-[var(--border-strong)]',
            'hover:bg-[var(--paper-sunken)]',
          ],
          variant === 'ghost' && [
            'bg-transparent text-[var(--ink-light)] border-transparent',
            'hover:bg-[var(--paper-sunken)]',
          ],
          variant === 'danger' && [
            'bg-[var(--danger)] text-white border-[var(--danger)]',
            'hover:brightness-90',
          ],
          className
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
