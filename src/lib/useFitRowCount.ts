import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Measures `containerRef`'s available height (via ResizeObserver) and converts it into a row
 * count, so a list/table can fetch exactly as many rows as fit -- no scrollbar, no guesswork.
 *
 * Returns `initialRows` until the first real measurement lands client-side, so the server-
 * rendered/first-paint markup never depends on a value only the browser can know (no hydration
 * mismatch). Debounced so a resize drag doesn't refire on every intermediate frame.
 */
export function useFitRowCount(
  containerRef: RefObject<HTMLElement | null>,
  rowHeightPx: number,
  minRows: number,
  maxRows: number,
  initialRows: number
): number {
  const [rows, setRows] = useState(initialRows);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = (height: number) => {
      const fit = Math.floor(height / rowHeightPx);
      const clamped = Math.max(minRows, Math.min(maxRows, fit));
      setRows((prev) => (prev === clamped ? prev : clamped));
    };

    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height == null) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => measure(height), 200);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current, rowHeightPx, minRows, maxRows]);

  return rows;
}
