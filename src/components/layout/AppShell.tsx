'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canAccessRoute } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '@/components/ui/Toast';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
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
        <div className="text-base text-[var(--ink-muted)]">Loading…</div>
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
        <div className="lg:hidden flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--paper-raised)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="flex items-center gap-1.5 text-[var(--ink)] min-h-11 min-w-11 justify-center -ml-2 rounded-lg hover:bg-[var(--paper-sunken)]"
            >
              <Menu size={24} />
            </button>
            <span className="font-bold text-base text-[var(--ink)]">
              QGPT Production Tracker
            </span>
          </div>
          <ThemeToggle className="!px-2" />
        </div>
        <main className="flex-1 flex flex-col min-h-0 bg-[var(--paper-sunken)] overflow-hidden">
          <div className={cn('flex-1 flex flex-col min-h-0', fullBleed ? 'h-full' : 'max-w-7xl w-full mx-auto px-6 py-6')}>
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
    <div className="flex flex-col items-center justify-center text-center py-24 gap-4">
      <div className="w-16 h-16 rounded-full bg-[var(--danger-tint)] text-[var(--danger)] flex items-center justify-center">
        <ShieldAlert size={28} />
      </div>
      <h1 className="text-2xl font-bold text-[var(--ink)]">
        You Can&apos;t Open This Page
      </h1>
      <p className="text-base text-[var(--ink-muted)] max-w-sm">
        Your account doesn&apos;t have access to this page. If you think that&apos;s wrong, ask your manager.
      </p>
      <Link href="/dashboard" className="text-base font-bold text-[var(--accent)] hover:underline mt-2">
        Go to Home
      </Link>
    </div>
  );
}
