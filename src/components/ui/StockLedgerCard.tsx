'use client';
import { useCallback, useState } from 'react';
import { Card } from './Card';
import { Table, Pagination } from './Table';
import { Badge } from './Badge';
import { ErrorState } from './ErrorState';
import { stockLedgerApi } from '@/lib/api';
import { StockLedgerEntry, StockLedgerItemType } from '@/lib/types';
import { formatDateTime, formatQty, STOCK_LEDGER_REASON_LABELS } from '@/lib/utils';
import { useAsyncQuery } from '@/lib/useAsync';

const PER_PAGE = 20;

/**
 * GET /stock/ledger — read-only audit trail for one item's stock movements, newest first (see
 * UI_GUIDE.md §7 Step 7). Embedded as a card/tab on item detail pages rather than a standalone
 * nav item; visible to every authenticated role, so callers don't need a canAccess gate.
 */
export function StockLedgerCard({
  itemType,
  itemId,
  unit,
  title = 'Audit Trail',
}: {
  itemType: StockLedgerItemType;
  itemId: number;
  unit?: string;
  title?: string;
}) {
  const [page, setPage] = useState(1);

  const fetchLedger = useCallback(async () => {
    const res = await stockLedgerApi.list({ item_type: itemType, item_id: itemId, page, per_page: PER_PAGE });
    const data = res.data?.data;
    const items: StockLedgerEntry[] = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length };
  }, [itemType, itemId, page]);

  const { data, loading, error, reload } = useAsyncQuery(fetchLedger, [itemType, itemId, page], { items: [], total: 0 });

  return (
    <Card title={title} subtitle="Every stock movement recorded against this item" noPadding fill className="max-h-96">
      {error && !loading ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <>
          <Table
            columns={[
              {
                key: 'reason',
                header: 'Reason',
                primary: true,
                render: (e: StockLedgerEntry) => (
                  <div className="flex flex-col">
                    <span className="font-medium">{STOCK_LEDGER_REASON_LABELS[e.reason] || e.reason}</span>
                    {e.note && <span className="text-sm text-[var(--ink-muted)]">{e.note}</span>}
                  </div>
                ),
              },
              {
                key: 'delta',
                header: 'Change',
                className: 'text-right font-mono',
                headerClassName: 'text-right',
                render: (e: StockLedgerEntry) => (
                  <span className={e.delta >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                    {e.delta >= 0 ? '+' : ''}{formatQty(e.delta, unit)}
                  </span>
                ),
              },
              {
                key: 'balance_after',
                header: 'Balance After',
                className: 'text-right font-mono text-[var(--ink-muted)]',
                headerClassName: 'text-right',
                render: (e: StockLedgerEntry) => formatQty(e.balance_after, unit),
              },
              {
                key: 'ref',
                header: 'Source',
                hideInCard: true,
                render: (e: StockLedgerEntry) =>
                  e.ref_type ? <Badge variant="muted">{e.ref_type.replace(/_/g, ' ')} #{e.ref_id}</Badge> : '—',
              },
              {
                key: 'created_at',
                header: 'When',
                hideInCard: true,
                render: (e: StockLedgerEntry) => formatDateTime(e.created_at),
              },
            ]}
            data={data.items}
            keyExtractor={(e) => e.id}
            loading={loading}
            emptyMessage="No stock movements recorded yet."
          />
          <Pagination page={page} total={data.total} perPage={PER_PAGE} onChange={setPage} />
        </>
      )}
    </Card>
  );
}
