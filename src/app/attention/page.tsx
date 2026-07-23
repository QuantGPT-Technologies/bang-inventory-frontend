'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';
import { attentionApi } from '@/lib/api';
import { AttentionList } from '@/lib/types';
import { useAsyncQuery } from '@/lib/useAsync';
import { useFitRowCount } from '@/lib/useFitRowCount';
import { AttentionRow } from '@/components/dashboard/AttentionRow';
import { CheckCircle2 } from 'lucide-react';

const EMPTY: AttentionList = { items: [] };
const INITIAL_PER_PAGE = 10;
/** Same estimate as the dashboard's TaskQueue -- both render AttentionRow, so they must agree. */
const ROW_HEIGHT_PX = 84;

/** GET /attention has no page/per_page params -- it returns the full list in one response, same
 *  as Webhooks/Workflow Templates. Paged here on the client instead of guessing at query params
 *  the backend may not support. */
export default function AttentionPage() {
  const [page, setPage] = useState(1);

  const listRef = useRef<HTMLDivElement>(null);
  const perPage = useFitRowCount(listRef, ROW_HEIGHT_PX, 3, 100, INITIAL_PER_PAGE);

  const isFirstPerPage = useRef(true);
  useEffect(() => {
    if (isFirstPerPage.current) { isFirstPerPage.current = false; return; }
    setPage(1);
  }, [perPage]);

  const fetchAttention = useCallback(async () => {
    const res = await attentionApi.list();
    return (res.data?.data as AttentionList) ?? EMPTY;
  }, []);

  const { data, loading, error } = useAsyncQuery(fetchAttention, [], EMPTY);
  const allItems = data.items;
  const total = allItems.length;
  const items = allItems.slice((page - 1) * perPage, page * perPage);

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  // If the list shrinks below the current page's range, snap back rather than showing an empty
  // page with working-looking Prev/Next above it.
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / perPage));
    if (page > maxPage) setPage(maxPage);
  }, [total, page, perPage]);

  return (
    <AppShell>
      <PageHeader
        title="What Needs Attention"
        subtitle="Every actionable workflow step across every lot and batch"
        breadcrumb={[{ label: 'Home', href: '/dashboard' }, { label: 'What Needs Attention' }]}
      />

      <Card noPadding fill>
        {loading && allItems.length === 0 ? (
          <div ref={listRef} className="flex-1 min-h-0 flex items-center justify-center text-base text-[var(--ink-muted)]">Loading…</div>
        ) : total === 0 ? (
          <div ref={listRef} className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2">
            <CheckCircle2 size={32} className="text-[var(--success)]" />
            <p className="text-base text-[var(--ink-muted)]">Nothing to do right now.</p>
          </div>
        ) : (
          <>
            <div ref={listRef} className="flex-1 min-h-0 overflow-hidden divide-y divide-[var(--border)]">
              {items.map((item, i) => (
                <AttentionRow key={`${item.entity_type}-${item.lot_id ?? item.batch_id}-${item.node_key}-${i}`} item={item} />
              ))}
            </div>
            <Pagination page={page} total={total} perPage={perPage} onChange={setPage} />
          </>
        )}
      </Card>
    </AppShell>
  );
}
