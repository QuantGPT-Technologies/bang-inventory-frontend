'use client';
import { cn } from '@/lib/utils';
import { TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          rows={3}
          className={cn(
            'w-full px-4 py-3 text-base rounded-xl resize-y',
            'bg-[var(--paper-raised)] text-[var(--ink)]',
            'border-2 border-[var(--border-strong)]',
            'placeholder:text-[var(--ink-muted)]',
            'focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-tint)]',
            'transition-colors duration-150',
            error && 'border-[var(--danger)]',
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
Textarea.displayName = 'Textarea';
export default Textarea;
