import { cn } from '@/lib/utils';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

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

  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm transition-opacity duration-150', loading && data.length > 0 && 'opacity-50')}>
        <thead>
          <tr className="border-b border-[var(--border-light)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]',
                  col.headerClassName
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isInitialLoad ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-12 text-[var(--ink-muted)] text-xs">
                Loading…
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-12 text-[var(--ink-muted)] text-xs italic">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'border-b border-[var(--border-light)] last:border-0',
                  'transition-colors duration-100',
                  onRowClick && 'cursor-pointer hover:bg-[var(--paper-dark)]'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn('px-4 py-2.5 text-[var(--ink)]', col.className)}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
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
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-light)] text-xs text-[var(--ink-muted)]">
      <span>
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
      <div className="flex gap-1">
        <button
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          className="px-2 py-1 rounded border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--paper-dark)] transition-colors"
        >
          ‹ Prev
        </button>
        <button
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
          className="px-2 py-1 rounded border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--paper-dark)] transition-colors"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
