import { AlertTriangle, RefreshCw, WifiOff, ShieldAlert } from 'lucide-react';
import { type ApiErrorInfo } from '@/lib/utils';
import Button from './Button';

export function ErrorState({ error, onRetry }: { error: ApiErrorInfo; onRetry?: () => void }) {
  const Icon = error.isNetworkError ? WifiOff : error.isForbidden ? ShieldAlert : AlertTriangle;

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
      <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
        <Icon size={20} />
      </div>
      <p className="text-sm font-medium text-[var(--ink)]">{error.message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw size={13} /> Try again
        </Button>
      )}
    </div>
  );
}
