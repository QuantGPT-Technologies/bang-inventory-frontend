'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { loginSchema, validate, type FieldErrors } from '@/lib/validation';
import { ToastContainer, toast } from '@/components/ui/Toast';
import { Lock, Mail, Factory } from 'lucide-react';

function isSafeNextPath(next: string | null): next is string {
  return !!next && next.startsWith('/') && !next.startsWith('//') && !next.includes('://');
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper-dark)]">
      <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { login, isAuthenticated, hasHydrated, initialize } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (hasHydrated && isAuthenticated) {
      const next = searchParams.get('next');
      router.replace(isSafeNextPath(next) ? next : '/dashboard');
    }
  }, [hasHydrated, isAuthenticated, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const result = validate(loginSchema, { email, password });
    if (!result.success) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const res = await authApi.login(result.data.email, result.data.password);
      const { token, user } = res.data.data;
      if (!token || !user) {
        toast.error('Unexpected response from server. Please try again.');
        return;
      }
      login(token, user);
      const next = searchParams.get('next');
      router.replace(isSafeNextPath(next) ? next : '/dashboard');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper-dark)] p-4">
      <ToastContainer />

      {/* Decorative lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--accent)]" />
        <div className="absolute top-1 left-0 right-0 h-px bg-[var(--accent-light)] opacity-50" />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--accent)] text-white mb-4 shadow-lg">
            <Factory size={24} />
          </div>
          <h1
            className="text-3xl font-bold text-[var(--ink)]"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Bang Inventory
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Production Line Tracking System
          </p>
          <div className="flex items-center gap-2 mt-3 justify-center">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-xs text-[var(--ink-muted)] uppercase tracking-wider">Sign In</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
        </div>

        {/* Card */}
        <div className="bg-[var(--paper)] border border-[var(--border-light)] rounded-lg shadow-[0_4px_24px_var(--shadow)] p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-[var(--ink-light)] uppercase tracking-wide block mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-md bg-[var(--paper)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors disabled:opacity-60"
                  placeholder="you@company.com"
                />
              </div>
              {fieldErrors.email && <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>}
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--ink-light)] uppercase tracking-wide block mb-1">
                Password
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-md bg-[var(--paper)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors disabled:opacity-60"
                  placeholder="••••••••"
                />
              </div>
              {fieldErrors.password && <p className="text-xs text-red-600 mt-1">{fieldErrors.password}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[var(--accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--accent-light)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-sm"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[var(--ink-muted)] mt-6">
          Powder Metallurgy Factory · v1.0
        </p>
      </div>
    </div>
  );
}
