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
  // 'warning' (amber) is reserved app-wide for "a human needs to act on this now" -- a skipped
  // step is the opposite, a benign bypass, so it maps to 'muted' like an unstarted step rather
  // than colliding with e.g. a blended batch (batchStatusBadge below) that genuinely needs
  // someone to act next.
  const map: Record<string, BadgeVariant> = {
    not_started: 'muted',
    pending: 'muted',
    in_progress: 'info',
    completed: 'success',
    skipped: 'muted',
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

// 'low' maps to 'warning' (amber) deliberately -- it's a genuine "needs action" state (reorder
// this soon), the one thing amber is reserved for app-wide.
export function stockStatusBadge(status: string) {
  const map: Record<string, BadgeVariant> = {
    out: 'danger',
    low: 'warning',
    ok: 'success',
  };
  return map[status] || 'default';
}
