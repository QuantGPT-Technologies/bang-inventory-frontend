import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  noPadding?: boolean;
  /** Fills the remaining height of its flex parent instead of sizing to content -- for a Card
   *  that hosts a Table/list which should stretch to fill the viewport rather than grow it. */
  fill?: boolean;
}

export function Card({ className, title, subtitle, action, noPadding, fill, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--paper-raised)] border border-[var(--border)] rounded-2xl',
        'shadow-[0_1px_4px_var(--shadow)]',
        fill && 'flex-1 min-h-0 flex flex-col',
        className
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-[var(--border)]">
          <div>
            {title && (
              <h2 className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-sm text-[var(--ink-muted)] mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn(!noPadding && 'p-5', fill && 'flex-1 min-h-0 flex flex-col')}>{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border-2 p-5',
        accent
          ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
          : 'bg-[var(--paper-raised)] border-[var(--border)] shadow-[0_1px_4px_var(--shadow)]'
      )}
    >
      <div className="flex items-start justify-between">
        <p className={cn('text-sm uppercase tracking-wider font-bold', accent ? 'text-white/75' : 'text-[var(--ink-muted)]')}>
          {label}
        </p>
        {icon && <span className={cn('opacity-70', accent ? 'text-white' : 'text-[var(--ink-muted)]')}>{icon}</span>}
      </div>
      <p className={cn('mt-2 text-3xl font-bold font-mono tabular-nums', accent ? 'text-white' : 'text-[var(--ink)]')}>
        {value}
      </p>
      {sub && (
        <p className={cn('mt-1 text-sm', accent ? 'text-white/70' : 'text-[var(--ink-muted)]')}>
          {sub}
        </p>
      )}
    </div>
  );
}
