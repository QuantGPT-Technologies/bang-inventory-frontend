'use client';
import { useEffect } from 'react';
import { AlertOctagon } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper-dark)] p-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-100 text-red-600 mb-4">
          <AlertOctagon size={24} />
        </div>
        <h1 className="text-2xl font-bold text-[var(--ink)]">
          Something Went Wrong
        </h1>
        <p className="text-sm text-[var(--ink-muted)] mt-2">
          This page had a problem. Please try again, or go back to Home.
        </p>
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={reset}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--accent-light)] transition-colors"
          >
            Try Again
          </button>
          <a
            href="/dashboard"
            className="px-4 py-2 border border-[var(--border)] rounded-md text-sm font-medium hover:bg-[var(--paper)] transition-colors"
          >
            Go to Home
          </a>
        </div>
      </div>
    </div>
  );
}
