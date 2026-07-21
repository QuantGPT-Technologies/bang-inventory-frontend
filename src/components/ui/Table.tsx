import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  /** This column becomes the card's title line on narrow screens (below `md`). First column with
   *  `primary: true` wins; if none is marked, the first column in the array is used. */
  primary?: boolean;
  /** Omit this column from the narrow-screen card entirely (e.g. a column that's redundant with
   *  the primary line, or too verbose for a compact card -- still shown in the full table). */
  hideInCard?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

// Below `md` (768px, small-tablet-portrait and phones) every list page in the app was pure
// horizontal-scroll -- tables with 5-7+ columns routinely ran 700-1000px+ wide, well past a
// phone viewport, with no way to see a full row without scrolling sideways. Below `md` this
// component now renders one stacked card per row instead of a `<table>`: the `primary` column
// as a large title line, every other non-`hideInCard` column as a label/value pair underneath.
// At `md` and above it's the original dense table, unchanged.
export function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No records found.',
  loading,
}: TableProps<T>) {
  // Only the FIRST load (no rows yet) shows the bare "Loading…" placeholder -- a reload after a
  // filter/search change or a background refresh keeps the existing rows visible (just dimmed),
  // rather than tearing the whole table down and repainting from scratch on every request.
  const isInitialLoad = loading && data.length === 0;
  const primaryCol = columns.find((c) => c.primary) ?? columns[0];
  const cardCols = columns.filter((c) => c !== primaryCol && !c.hideInCard);

  const cellValue = (col: Column<T>, row: T) =>
    col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—');

  if (isInitialLoad) {
    return <div className="text-center py-14 text-[var(--ink-muted)] text-base">Loading…</div>;
  }
  if (data.length === 0) {
    return <div className="text-center py-14 text-[var(--ink-muted)] text-base italic">{emptyMessage}</div>;
  }

  return (
    <div className={cn('transition-opacity duration-150', loading && data.length > 0 && 'opacity-50')}>
      {/* Card list -- phones and small tablets */}
      <div className="md:hidden divide-y divide-[var(--border)]">
        {data.map((row) => (
          <div
            key={keyExtractor(row)}
            onClick={() => onRowClick?.(row)}
            className={cn(
              'flex items-center gap-3 px-4 py-4',
              onRowClick && 'cursor-pointer active:bg-[var(--paper-sunken)]'
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-[var(--ink)] truncate">{cellValue(primaryCol, row)}</div>
              {cardCols.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {cardCols.map((col) => (
                    <div key={col.key} className="flex items-center gap-1.5 text-sm text-[var(--ink-muted)]">
                      <span className="font-semibold uppercase tracking-wide text-xs">{col.header}</span>
                      <span className="text-[var(--ink)]">{cellValue(col, row)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {onRowClick && <ChevronRight size={22} className="flex-shrink-0 text-[var(--ink-muted)]" />}
          </div>
        ))}
      </div>

      {/* Full table -- md and above */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b-2 border-[var(--border)] bg-[var(--paper-sunken)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3.5 text-left text-sm font-bold uppercase tracking-wider text-[var(--ink-muted)]',
                    col.headerClassName
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'border-b border-[var(--border)] last:border-0',
                  'transition-colors duration-100',
                  onRowClick && 'cursor-pointer hover:bg-[var(--paper-sunken)]'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn('px-4 py-3.5 text-[var(--ink)]', col.className)}
                  >
                    {cellValue(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Pagination({
  page,
  total,
  perPage,
  onChange,
}: {
  page: number;
  total: number;
  perPage: number;
  onChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] text-sm font-semibold text-[var(--ink-muted)]">
      <span>
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
      <div className="flex gap-2">
        <button
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          className="px-4 min-h-11 rounded-lg border-2 border-[var(--border-strong)] disabled:opacity-40 hover:bg-[var(--paper-sunken)] transition-colors text-[var(--ink)]"
        >
          ‹ Prev
        </button>
        <button
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
          className="px-4 min-h-11 rounded-lg border-2 border-[var(--border-strong)] disabled:opacity-40 hover:bg-[var(--paper-sunken)] transition-colors text-[var(--ink)]"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
