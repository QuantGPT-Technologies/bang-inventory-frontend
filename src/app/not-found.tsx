import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper-dark)] p-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--accent-muted)] text-[var(--accent)] mb-4">
          <Compass size={24} />
        </div>
        <h1 className="text-3xl font-bold text-[var(--ink)]">
          Page Not Found
        </h1>
        <p className="text-sm text-[var(--ink-muted)] mt-2">
          This page doesn&apos;t exist, or it moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-block mt-6 px-4 py-2 bg-[var(--accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--accent-light)] transition-colors"
        >
          Go to Home
        </Link>
      </div>
    </div>
  );
}
