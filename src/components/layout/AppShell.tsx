'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canAccessRoute } from '@/lib/auth';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '@/components/ui/Toast';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasHydrated, user, initialize } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      const next = pathname && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [hasHydrated, isAuthenticated, router, pathname]);

  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      </div>
    );
  }

  const allowed = canAccessRoute(user, pathname || '');

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-[var(--paper-dark)]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {allowed ? children : <AccessDenied />}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 gap-3">
      <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
        <ShieldAlert size={24} />
      </div>
      <h1 className="text-xl font-bold text-[var(--ink)]" style={{ fontFamily: 'Playfair Display, serif' }}>
        Access Denied
      </h1>
      <p className="text-sm text-[var(--ink-muted)] max-w-sm">
        Your role does not have permission to view this page. Contact an administrator if you believe this is a mistake.
      </p>
      <Link href="/dashboard" className="text-sm text-[var(--accent)] hover:underline mt-2">
        Return to dashboard
      </Link>
    </div>
  );
}
