import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[var(--paper-dark)] text-[var(--ink)] border-[var(--border)]',
  success: 'bg-green-100 text-green-800 border-green-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  danger: 'bg-red-100 text-red-700 border-red-200',
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  muted: 'bg-[var(--paper-dark)] text-[var(--ink-muted)] border-[var(--border-light)]',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function stepStatusBadge(status: string) {
  const map: Record<string, BadgeVariant> = {
    pending: 'muted',
    in_progress: 'info',
    completed: 'success',
    skipped: 'warning',
  };
  return map[status] || 'default';
}

export function batchStatusBadge(status: string) {
  const map: Record<string, BadgeVariant> = {
    created: 'muted',
    blending: 'info',
    blended: 'warning',
    completed: 'success',
  };
  return map[status] || 'default';
}

export function lotStatusBadge(status: string) {
  const map: Record<string, BadgeVariant> = {
    created: 'muted',
    in_progress: 'info',
    completed: 'success',
  };
  return map[status] || 'default';
}
