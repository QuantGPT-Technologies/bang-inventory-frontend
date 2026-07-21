'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { loginSchema, validate, type FieldErrors } from '@/lib/validation';
import { ToastContainer, toast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper-sunken)]">
      <div className="text-base text-[var(--ink-muted)]">Loading…</div>
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper-sunken)] p-4">
      <ToastContainer />

      {/* Decorative lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--accent)]" />
        <div className="absolute top-1 left-0 right-0 h-px bg-[var(--accent-dark)] opacity-50" />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--accent)] text-white mb-4 shadow-lg">
            <Factory size={28} />
          </div>
          <h1 className="text-3xl font-bold text-[var(--ink)]">
            Bang Inventory
          </h1>
          <p className="text-base text-[var(--ink-muted)] mt-1">
            Track your factory&apos;s stock and production
          </p>
          <div className="flex items-center gap-2 mt-3 justify-center">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-sm font-bold text-[var(--ink-muted)] uppercase tracking-wider">Sign In</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
        </div>

        {/* Card */}
        <div className="bg-[var(--paper-raised)] border border-[var(--border)] rounded-2xl shadow-[0_4px_24px_var(--shadow)] p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail size={20} className="absolute left-4 top-[46px] text-[var(--ink-muted)] pointer-events-none" />
              <Input
                type="email"
                label="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="username"
                placeholder="you@company.com"
                error={fieldErrors.email}
                className="pl-11"
              />
            </div>

            <div className="relative">
              <Lock size={20} className="absolute left-4 top-[46px] text-[var(--ink-muted)] pointer-events-none" />
              <Input
                type="password"
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                placeholder="••••••••"
                error={fieldErrors.password}
                className="pl-11"
              />
            </div>

            <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-[var(--ink-muted)] mt-6">
          Bang Inventory
        </p>
      </div>
    </div>
  );
}
