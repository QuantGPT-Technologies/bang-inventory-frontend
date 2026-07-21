'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

let toastCounter = 0;
let addToastFn: ((t: Omit<Toast, 'id'>) => void) | null = null;

export function toast(message: string, type: ToastType = 'info') {
  addToastFn?.({ type, message });
}
toast.success = (msg: string) => toast(msg, 'success');
toast.error = (msg: string) => toast(msg, 'error');
toast.info = (msg: string) => toast(msg, 'info');

const AUTO_DISMISS_MS = 4000;

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Timers keyed by toast id, so hover/focus can cancel-and-reschedule without touching toasts
  // that aren't being interacted with.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const schedule = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
  }, [dismiss]);

  const add = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { ...t, id }]);
    schedule(id);
  }, [schedule]);

  useEffect(() => {
    addToastFn = add;
    return () => { addToastFn = null; };
  }, [add]);

  const icons = { success: CheckCircle, error: XCircle, info: Info };
  const colors = {
    success: 'bg-[var(--success-tint)] border-[var(--success)] text-[var(--success)]',
    error: 'bg-[var(--danger-tint)] border-[var(--danger)] text-[var(--danger)]',
    info: 'bg-[var(--info-tint)] border-[var(--info)] text-[var(--info)]',
  };

  return (
    // aria-live announces new toasts to screen readers as they arrive; role="status" (not
    // "alert") since these are non-interruptive confirmations, not urgent errors demanding
    // immediate attention.
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 min-w-[280px] max-w-[420px]"
    >
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <div
            key={t.id}
            // A factory-floor operator's attention may be split between the tablet and the
            // machine -- hovering or focusing a toast pauses its auto-dismiss so a message
            // being read doesn't vanish underneath them; it resumes on mouse/focus-out.
            onMouseEnter={() => clearTimeout(timers.current.get(t.id))}
            onMouseLeave={() => schedule(t.id)}
            onFocus={() => clearTimeout(timers.current.get(t.id))}
            onBlur={() => schedule(t.id)}
            className={cn(
              'flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 shadow-lg text-base font-semibold',
              colors[t.type]
            )}
          >
            <Icon size={22} className="mt-0.5 flex-shrink-0" />
            <span className="flex-1 text-[var(--ink)]">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="flex items-center gap-1 text-sm font-bold opacity-70 hover:opacity-100 min-h-9 px-1"
            >
              <X size={18} />
              Dismiss
            </button>
          </div>
        );
      })}
    </div>
  );
}
