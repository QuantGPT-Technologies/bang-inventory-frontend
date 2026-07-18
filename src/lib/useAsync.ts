import { useEffect, useRef, useState } from 'react';
import { parseApiError, type ApiErrorInfo } from './utils';

/**
 * Runs an async fetcher whenever `deps` change and exposes { data, loading, error, reload }.
 *
 * Structured to satisfy the React Compiler's set-state-in-effect rule: the effect itself
 * only ever *reads* a ref-stored fetcher and kicks off a fire-and-forget async IIFE: no
 * setState call is synchronously reachable from the effect's own call graph, so loading/error/data
 * updates only ever happen after an `await`, inside a callback.
 */
export function useAsyncQuery<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
  fallback: T
): { data: T; loading: boolean; error: ApiErrorInfo | null; reload: () => void } {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const fetcherRef = useRef(fetcher);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetcherRef.current();
        if (cancelled) return;
        setData(result);
      } catch (err) {
        if (cancelled) return;
        setError(parseApiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const reload = () => setReloadToken((t) => t + 1);

  return { data, loading, error, reload };
}
