'use client';
import { useRef } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { attentionApi } from '@/lib/api';
import { AttentionList } from '@/lib/types';
import { useAsyncQuery } from '@/lib/useAsync';
import { useFitRowCount } from '@/lib/useFitRowCount';
import { AttentionRow } from './AttentionRow';
import { CheckCircle2, ArrowRight } from 'lucide-react';

const EMPTY: AttentionList = { items: [] };

/** Each row here is taller than a table row (icon block, two text lines, action button) --
 *  measured against the same `px-4 py-4` markup AttentionRow renders. */
const ROW_HEIGHT_PX = 84;

/**
 * The Home screen's task queue -- the single "what do I do next" view this app didn't have
 * before: every actionable workflow step across every lot/batch, in one place, as big
 * plain-language cards instead of something an operator had to know to go find on a specific
 * lot's detail page. Reads from GET /attention (see AttentionService on the backend), the one
 * source this queue, the Insights dashboard's alert tiles, and (later) a notification indicator
 * all render from.
 *
 * Shows only as many rows as fit the card's available height (no page scroll) -- if more items
 * exist than fit, the last visible slot becomes a "View all" link to /attention instead of
 * silently dropping them.
 *
 * Tapping a `can_act` card's button lands on the lot/batch detail page, which (since the lot
 * detail page's own primary-action header redesign) already shows the exact same action as its
 * one dominant call-to-action -- no separate deep-link/auto-open plumbing needed here.
 */
export function TaskQueue() {
  const fetchAttention = async () => {
    const res = await attentionApi.list();
    return (res.data?.data as AttentionList) ?? EMPTY;
  };

  const { data, loading, error } = useAsyncQuery(fetchAttention, [], EMPTY);
  const items = data.items;

  const listRef = useRef<HTMLDivElement>(null);
  const fitCount = useFitRowCount(listRef, ROW_HEIGHT_PX, 2, 50, 5);
  const overflow = items.length > fitCount;
  // Leave room for the "+N more" row itself when truncating, so the last real item doesn't get
  // pushed just past the fitted height.
  const visible = overflow ? items.slice(0, Math.max(1, fitCount - 1)) : items;
  const hiddenCount = items.length - visible.length;

  return (
    <Card title="What Needs Attention" noPadding fill>
      {loading ? (
        <div ref={listRef} className="flex-1 min-h-0 flex items-center justify-center text-base text-[var(--ink-muted)]">Loading…</div>
      ) : error ? (
        <div ref={listRef} className="flex-1 min-h-0 flex items-center justify-center text-base font-semibold text-[var(--danger)]">Could not load your to-do list.</div>
      ) : items.length === 0 ? (
        <div ref={listRef} className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2">
          <CheckCircle2 size={32} className="text-[var(--success)]" />
          <p className="text-base text-[var(--ink-muted)]">Nothing to do right now.</p>
        </div>
      ) : (
        <div ref={listRef} className="flex-1 min-h-0 overflow-hidden divide-y divide-[var(--border)]">
          {visible.map((item, i) => (
            <AttentionRow key={`${item.entity_type}-${item.lot_id ?? item.batch_id}-${item.node_key}-${i}`} item={item} />
          ))}
          {hiddenCount > 0 && (
            <Link
              href="/attention"
              className="flex items-center justify-between gap-2 px-4 py-4 hover:bg-[var(--paper-sunken)] transition-colors text-base font-bold text-[var(--accent)]"
            >
              +{hiddenCount} more — View all <ArrowRight size={18} />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
