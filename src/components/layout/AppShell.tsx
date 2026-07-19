'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canAccessRoute } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '@/components/ui/Toast';
import { ShieldAlert, Menu } from 'lucide-react';
import Link from 'next/link';

export function AppShell({ children, fullBleed = false }: { children: React.ReactNode; fullBleed?: boolean }) {
  const { isAuthenticated, hasHydrated, user, initialize } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      const next = pathname && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [hasHydrated, isAuthenticated, router, pathname]);

  // No explicit "close drawer on navigate" effect needed: AppShell isn't in a shared Next.js
  // layout (every page.tsx renders its own <AppShell>), so the whole tree -- including this
  // state -- remounts fresh on every route change anyway. NavLink's onClick (onNavigate={onClose}
  // below) still closes it immediately for the in-between-navigation-and-remount frame.

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
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Below `lg` the sidebar is an off-canvas drawer (see Sidebar.tsx) -- this bar is its
            only entry point on that viewport range. */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-[var(--border-light)] bg-[var(--paper)] flex-shrink-0">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            className="text-[var(--ink)] p-1.5 -ml-1.5 rounded-md hover:bg-[var(--paper-dark)]"
          >
            <Menu size={20} />
          </button>
          <span className="font-semibold text-sm text-[var(--ink)]" style={{ fontFamily: 'Playfair Display, serif' }}>
            Bang Inventory
          </span>
        </div>
        <main className={cn('flex-1 bg-[var(--paper-dark)]', fullBleed ? 'overflow-hidden' : 'overflow-y-auto')}>
          <div className={fullBleed ? 'h-full' : 'max-w-7xl mx-auto px-6 py-6'}>
            {allowed ? children : <AccessDenied />}
          </div>
        </main>
      </div>
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
