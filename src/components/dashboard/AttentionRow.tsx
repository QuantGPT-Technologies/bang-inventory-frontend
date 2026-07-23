'use client';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { AttentionItem } from '@/lib/types';
import { formatDateTime, ROLE_LABELS, verbForNodeType } from '@/lib/utils';
import { NODE_TYPE_ICONS, NODE_TYPE_COLORS } from '@/components/workflow/workflowNodeMeta';
import { ArrowRight } from 'lucide-react';

/** How long an item can sit in the queue before it's flagged as stale. Deliberately not the
 *  amber/warning color (see Badge.tsx) -- that's reserved app-wide for "needs action now", and
 *  every row here already needs action, so staleness is a subtle ink-weight cue, not a new badge. */
const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

/** One row of the "what needs attention" queue -- shared between the dashboard's TaskQueue (a
 *  capped preview) and the full /attention list page, so the two never drift out of sync. */
export function AttentionRow({ item }: { item: AttentionItem }) {
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
