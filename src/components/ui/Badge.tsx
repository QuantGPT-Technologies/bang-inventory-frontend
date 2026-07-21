import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[var(--paper-sunken)] text-[var(--ink)] border-[var(--border)]',
  success: 'bg-[var(--success-tint)] text-[var(--success)] border-transparent',
  warning: 'bg-[var(--warning-tint)] text-[var(--warning)] border-transparent',
  danger: 'bg-[var(--danger-tint)] text-[var(--danger)] border-transparent',
  info: 'bg-[var(--info-tint)] text-[var(--info)] border-transparent',
  muted: 'bg-[var(--paper-sunken)] text-[var(--ink-muted)] border-[var(--border)]',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border',
        className,
        variantClasses[variant]
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" aria-hidden="true" />
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
