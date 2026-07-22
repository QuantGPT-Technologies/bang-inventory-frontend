'use client';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { attentionApi } from '@/lib/api';
import { AttentionItem, AttentionList } from '@/lib/types';
import { formatDateTime, ROLE_LABELS, verbForNodeType } from '@/lib/utils';
import { useAsyncQuery } from '@/lib/useAsync';
import { NODE_TYPE_ICONS, NODE_TYPE_COLORS } from '@/components/workflow/workflowNodeMeta';
import { CheckCircle2, ArrowRight } from 'lucide-react';

const EMPTY: AttentionList = { items: [] };

/**
 * The Home screen's task queue -- the single "what do I do next" view this app didn't have
 * before: every actionable workflow step across every lot/batch, in one place, as big
 * plain-language cards instead of something an operator had to know to go find on a specific
 * lot's detail page. Reads from GET /attention (see AttentionService on the backend), the one
 * source this queue, the Insights dashboard's alert tiles, and (later) a notification indicator
 * all render from.
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

  return (
    <Card title="What Needs Attention" noPadding>
      {loading ? (
        <div className="p-5 text-center text-base text-[var(--ink-muted)]">Loading…</div>
      ) : error ? (
        <div className="p-5 text-center text-base font-semibold text-[var(--danger)]">Could not load your to-do list.</div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center gap-2 flex flex-col items-center">
          <CheckCircle2 size={32} className="text-[var(--success)]" />
          <p className="text-base text-[var(--ink-muted)]">Nothing to do right now.</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {items.map((item, i) => (
            <TaskCard key={`${item.entity_type}-${item.lot_id ?? item.batch_id}-${item.node_key}-${i}`} item={item} />
          ))}
        </div>
      )}
    </Card>
  );
}

// How long an item can sit in the queue before we flag it as stale. Deliberately not the
// amber/warning color (see Badge.tsx) -- that's reserved app-wide for "needs action now", and
// every card in this queue already needs action, so staleness is a subtle ink-weight cue, not a
// new loud badge.
const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

function TaskCard({ item }: { item: AttentionItem }) {
  const router = useRouter();
  const Icon = NODE_TYPE_ICONS[item.node_type];
  const color = NODE_TYPE_COLORS[item.node_type];
  const entityLabel = item.entity_type === 'lot'
    ? `Lot ${item.lot_number ?? item.lot_id}`
    : `Batch ${item.batch_number ?? item.batch_id}`;
  const href = item.entity_type === 'lot' ? `/lots/${item.lot_id}` : `/batches/${item.batch_id}`;
  const verb = verbForNodeType(item.node_type, item.status);
  const waitingMs = Date.now() - new Date(item.waiting_since).getTime();
  const isStale = Number.isFinite(waitingMs) && waitingMs > STALE_AFTER_MS;

  return (
    <div
      className="flex items-center gap-4 px-4 py-4 hover:bg-[var(--paper-sunken)] transition-colors cursor-pointer"
      onClick={() => router.push(href)}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={
          isStale
            ? { backgroundColor: 'color-mix(in srgb, var(--ink) 12%, transparent)', color: 'var(--ink)' }
            : { backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }
        }
      >
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-[var(--ink)] truncate">
          {verb} {item.node_name} — {entityLabel}
          {item.sku_code && <span className="text-[var(--ink-muted)] font-normal"> · {item.sku_code}</span>}
        </p>
        <p className={`text-sm font-mono mt-0.5 ${isStale ? 'text-[var(--ink)] font-bold' : 'text-[var(--ink-muted)]'}`}>
          Waiting since {formatDateTime(item.waiting_since)}
        </p>
      </div>
      {item.can_act ? (
        <Button size="md" onClick={(e) => { e.stopPropagation(); router.push(href); }}>
          {verb} <ArrowRight size={18} />
        </Button>
      ) : (
        <Badge variant="muted">
          Waiting on {item.waiting_on_role ? ROLE_LABELS[item.waiting_on_role] : 'another person'}
        </Badge>
      )}
    </div>
  );
}
