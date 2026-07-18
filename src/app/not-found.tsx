import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper-dark)] p-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--accent-muted)] text-[var(--accent)] mb-4">
          <Compass size={24} />
        </div>
        <h1 className="text-3xl font-bold text-[var(--ink)]" style={{ fontFamily: 'Playfair Display, serif' }}>
          404
        </h1>
        <p className="text-sm text-[var(--ink-muted)] mt-2">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-block mt-6 px-4 py-2 bg-[var(--accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--accent-light)] transition-colors"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
