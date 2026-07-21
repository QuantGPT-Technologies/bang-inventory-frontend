import { AlertTriangle, RefreshCw, WifiOff, ShieldAlert } from 'lucide-react';
import { type ApiErrorInfo } from '@/lib/utils';
import Button from './Button';

export function ErrorState({ error, onRetry }: { error: ApiErrorInfo; onRetry?: () => void }) {
  const Icon = error.isNetworkError ? WifiOff : error.isForbidden ? ShieldAlert : AlertTriangle;

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-4">
      <div className="w-16 h-16 rounded-full bg-[var(--danger-tint)] text-[var(--danger)] flex items-center justify-center">
        <Icon size={28} />
      </div>
      <p className="text-base font-semibold text-[var(--ink)] max-w-sm">{error.message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw size={16} /> Try again
        </Button>
      )}
    </div>
  );
}
