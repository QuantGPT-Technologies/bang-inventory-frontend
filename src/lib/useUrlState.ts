'use client';
import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

/**
 * Keeps a single filter/search value synced to a URL query param, so navigating away (e.g. into
 * a row's detail page) and back with the browser's back button restores exactly what was being
 * looked at -- list pages otherwise reset every filter/search box to its default on remount.
 * Falls back to `fallback` when the param is absent. Pass '' (not the fallback) to clear a param.
 */
export function useUrlState(key: string, fallback = ''): [string, (value: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const value = searchParams.get(key) ?? fallback;

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!next || next === fallback) {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      const qs = params.toString();
      // replace (not push) -- filter/search changes shouldn't each get their own back-button
      // stop; only the page-to-page navigation itself should.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, key, fallback]
  );

  return [value, setValue];
}
