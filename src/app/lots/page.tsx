'use client';
import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination, TABLE_ROW_HEIGHT_PX, TABLE_CARD_ROW_HEIGHT_PX } from '@/components/ui/Table';
import { Badge, lotStatusBadge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { lotsApi } from '@/lib/api';
import { Lot, PaginatedResponse } from '@/lib/types';
import { formatDate, formatQty, STEP_LABELS, LOT_STATUS_LABELS, resolvePaginationTotal } from '@/lib/utils';
import { useAsyncQuery } from '@/lib/useAsync';
import { useFitRowCount } from '@/lib/useFitRowCount';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Search } from 'lucide-react';

const INITIAL_PER_PAGE = 20;
const EMPTY: PaginatedResponse<Lot> = { items: [], total: 0, page: 1, per_page: INITIAL_PER_PAGE };

export default function LotsPage() {
  return (
    <Suspense fallback={null}>
      <LotsPageInner />
    </Suspense>
  );
}

function LotsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Lets links elsewhere in the app (e.g. dashboard stat tiles) land here pre-filtered, using the
  // same `status` values this page's own dropdown already sets -- read once on mount only, so the
  // dropdown remains the single source of truth for filter state afterwards.
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || '');
  const [stepFilter, setStepFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const tableBodyRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const perPage = useFitRowCount(tableBodyRef, isMobile ? TABLE_CARD_ROW_HEIGHT_PX : TABLE_ROW_HEIGHT_PX, 5, 100, INITIAL_PER_PAGE);

  // Debounced so typing a lot number doesn't fire a request per keystroke -- jumping straight to
  // a known lot/SKU/batch number was previously impossible here at all (only coarse status/step
  // dropdowns existed), the single highest-friction "find my thing" gap on this page. The page
  // reset lives in this same callback (not the input's onChange) so it fires once, together with
  // the debounced value -- resetting it immediately on every keystroke would, whenever the user
  // was on page >1, fire one fetch with the stale search term right away and a second one 300ms
  // later with the real term.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // A window resize can change how many rows fit -- reset to page 1 so `page` never points past
  // the new `totalPages` (skips the very first render so it doesn't fight the initial fetch).
  const isFirstPerPage = useRef(true);
  useEffect(() => {
    if (isFirstPerPage.current) { isFirstPerPage.current = false; return; }
    setPage(1);
  }, [perPage]);

  const fetchLots = useCallback(async () => {
    const params: Record<string, unknown> = { page, per_page: perPage };
    if (statusFilter) params.status = statusFilter;
    if (stepFilter) params.step = stepFilter;
    if (debouncedSearch) params.q = debouncedSearch;
    const res = await lotsApi.list(params);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: resolvePaginationTotal(data?.total, items, page, perPage), page, per_page: perPage };
  }, [page, perPage, statusFilter, stepFilter, debouncedSearch]);

  const { data, loading, error, reload } = useAsyncQuery(fetchLots, [page, perPage, statusFilter, stepFilter, debouncedSearch], EMPTY);
  const lots = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const columns = [
    {
      key: 'lot_number',
      header: 'Lot #',
      primary: true,
      render: (row: Lot) => (
        <div className="flex flex-col">
          <span className="font-mono font-bold text-base text-[var(--accent)]">{row.lot_number}</span>
          <span className="font-mono text-sm text-[var(--ink-muted)]">{row.batch_number || `#${row.batch_id}`}</span>
        </div>
      ),
    },
    { key: 'sku_code', header: 'SKU', render: (row: Lot) => row.sku_code || `#${row.sku_id}` },
    { key: 'quantity', header: 'Qty', render: (row: Lot) => formatQty(row.quantity, row.unit) },
    {
      key: 'status',
      header: 'Status',
      render: (row: Lot) => (
        <div className="flex flex-col gap-1">
          <Badge variant={lotStatusBadge(row.status)}>{LOT_STATUS_LABELS[row.status] || row.status}</Badge>
          {row.current_step && <span className="text-sm text-[var(--ink-muted)]">{STEP_LABELS[row.current_step]}</span>}
        </div>
      ),
    },
    { key: 'created_at', header: 'Created', hideInCard: true, render: (row: Lot) => formatDate(row.created_at) },
  ];

  const stepOptions = Object.entries(STEP_LABELS).map(([v, l]) => ({ value: v, label: l }));

  return (
    <AppShell>
      <PageHeader
        title="Lots"
        subtitle="Track each lot as it moves through production"
      />

      <Card noPadding fill>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] flex-wrap">
          <div className="relative w-64">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lot #, SKU, or batch #"
              className="pl-11"
            />
          </div>
          <Select
            options={[
              { value: '', label: 'All Statuses' },
              ...Object.entries(LOT_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
            ]}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="w-44"
            placeholder=""
          />
          <Select
            options={[{ value: '', label: 'All Steps' }, ...stepOptions]}
            value={stepFilter}
            onChange={(e) => { setStepFilter(e.target.value); setPage(1); }}
            className="w-44"
            placeholder=""
          />
        </div>

        {error && !loading ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <Table
              columns={columns}
              data={lots}
              keyExtractor={(r) => r.id}
              onRowClick={(r) => router.push(`/lots/${r.id}`)}
              loading={loading}
              emptyMessage={
                statusFilter || stepFilter || search
                  ? 'No lots match your filters.'
                  : 'No lots found.'
              }
              bodyRef={tableBodyRef}
            />
            <Pagination page={page} total={total} perPage={perPage} onChange={setPage} />
          </>
        )}
      </Card>
    </AppShell>
  );
}
