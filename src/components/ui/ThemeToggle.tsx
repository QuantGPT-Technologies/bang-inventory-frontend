'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeStore, getInitialTheme } from '@/store/themeStore';

export function ThemeToggle({ className, dark }: { className?: string; dark?: boolean }) {
  const { theme, setTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
    // Only run once on mount to sync the store with what the pre-paint script already applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return <div className={cn('min-h-11 min-w-11', className)} />;

  const isDark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'flex items-center gap-2 min-h-11 px-3 rounded-lg text-sm font-bold transition-colors',
        dark
          ? 'text-white/70 hover:text-white hover:bg-white/10'
          : 'text-[var(--ink-light)] hover:text-[var(--ink)] hover:bg-[var(--paper-sunken)]',
        className
      )}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {isDark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
