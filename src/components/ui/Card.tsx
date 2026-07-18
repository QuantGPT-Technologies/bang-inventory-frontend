import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  noPadding?: boolean;
}

export function Card({ className, title, subtitle, action, noPadding, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--paper)] border border-[var(--border-light)] rounded-lg',
        'shadow-[0_1px_4px_var(--shadow)]',
        className
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-[var(--border-light)]">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-[var(--ink)] uppercase tracking-wider">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn(!noPadding && 'p-5')}>{children}</div>
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
        'rounded-lg border p-4',
        accent
          ? 'bg-[var(--accent)] text-[var(--paper)] border-[var(--accent)]'
          : 'bg-[var(--paper)] border-[var(--border-light)] shadow-[0_1px_4px_var(--shadow)]'
      )}
    >
      <div className="flex items-start justify-between">
        <p className={cn('text-xs uppercase tracking-wider font-medium', accent ? 'text-[var(--paper)]/70' : 'text-[var(--ink-muted)]')}>
          {label}
        </p>
        {icon && <span className={cn('opacity-60', accent ? 'text-[var(--paper)]' : 'text-[var(--ink-muted)]')}>{icon}</span>}
      </div>
      <p className={cn('mt-2 text-2xl font-bold', accent ? 'text-[var(--paper)]' : 'text-[var(--ink)]')}>
        {value}
      </p>
      {sub && (
        <p className={cn('mt-0.5 text-xs', accent ? 'text-[var(--paper)]/60' : 'text-[var(--ink-muted)]')}>
          {sub}
        </p>
      )}
    </div>
  );
}
