'use client';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, subtitle, children, size = 'md', footer }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="absolute inset-0 bg-[var(--ink)]/40 backdrop-blur-sm animate-[modal-backdrop-in_150ms_ease-out]"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full bg-[var(--paper-raised)] rounded-2xl shadow-xl',
          'border border-[var(--border)]',
          'flex flex-col max-h-[90vh]',
          'animate-[modal-panel-in_150ms_ease-out]',
          sizeClass
        )}
      >
        {title && (
          <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
            <div>
              <h2 className="font-bold text-[var(--ink)] text-lg">{title}</h2>
              {subtitle && <p className="text-sm text-[var(--ink-muted)] mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--paper-sunken)] transition-colors rounded-lg px-2.5 min-h-11 -mr-2"
            >
              <X size={20} />
              Close
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] flex-shrink-0 bg-[var(--paper-sunken)] rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
