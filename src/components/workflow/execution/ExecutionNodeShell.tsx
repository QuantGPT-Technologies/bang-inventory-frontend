'use client';
import { Handle, Position } from '@xyflow/react';
import { CheckCircle2, SkipForward, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WorkflowNodeType } from '@/lib/types';
import { NODE_TYPE_COLORS, NODE_TYPE_ICONS, withAlpha } from '../workflowNodeMeta';

export type ExecutionNodeStatus = 'not_started' | 'pending' | 'in_progress' | 'completed' | 'skipped';

/**
 * Read-only counterpart to nodes/BaseNodeShell.tsx, purpose-built for the lot execution graph
 * (LotWorkflowCanvas) rather than the template editor: instead of config badges ("optional",
 * "credits stock") it renders the node's LIVE run status. Same visual language -- paper/ink
 * card, colored left-edge accent bar keyed by node type from workflowNodeMeta.ts, single
 * Left-target/Right-source handle pair -- but:
 *  - `not_started` nodes are faded (opacity + muted accent/icon) so the untouched part of the
 *    pipeline visually recedes.
 *  - `pending`/`in_progress` (the one node `current_node_key` points at) gets a strong
 *    accent-colored glow ring plus a pulsing "CURRENT" pill -- this is the node an operator
 *    needs to act on right now, and it should be unmistakable at a glance.
 *  - `completed` gets a green check, `skipped` an amber skip icon, both at full opacity so the
 *    traversed path reads clearly against the faded untouched tail.
 * Deliberately a single Handle pair (not BaseNodeShell's per-condition stacked `sourceHandles`)
 * since this canvas never needs to originate a connection -- multiple edges from one node (e.g.
 * an approval's approved/rejected branches) still render correctly as separate bezier curves
 * from the same source point.
 */
export function ExecutionNodeShell({
  nodeType,
  name,
  status,
  selected,
  children,
}: {
  nodeType: WorkflowNodeType;
  name: string;
  status: ExecutionNodeStatus;
  selected?: boolean;
  children?: React.ReactNode;
}) {
  const Icon = NODE_TYPE_ICONS[nodeType];
  const accentColor = NODE_TYPE_COLORS[nodeType];
  const isNotStarted = status === 'not_started';
  const isCurrent = status === 'pending' || status === 'in_progress';
  const isSkipped = status === 'skipped';
  const isCompleted = status === 'completed';

  return (
    <div
      className={cn(
        'relative min-w-[200px] max-w-[240px] rounded-lg border bg-[var(--paper)]',
        'border-[var(--border-light)] overflow-hidden transition-opacity',
        isNotStarted ? 'opacity-55 shadow-none' : 'shadow-[0_1px_4px_var(--shadow)]',
        selected && 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--paper)]'
      )}
      style={
        isCurrent && !selected
          ? { boxShadow: `0 0 0 2px ${accentColor}, 0 0 10px 1px ${withAlpha(accentColor, 50)}` }
          : undefined
      }
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: isNotStarted ? 'var(--border)' : accentColor }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !bg-[var(--paper)]"
        style={{ borderColor: isNotStarted ? 'var(--border)' : accentColor }}
      />

      <div className="pl-3 pr-2.5 py-2.5">
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Icon size={13} style={{ color: isNotStarted ? 'var(--ink-muted)' : accentColor }} className="flex-shrink-0" />
            <span
              className={cn(
                'text-sm font-medium truncate',
                isNotStarted ? 'text-[var(--ink-muted)]' : 'text-[var(--ink)]'
              )}
            >
              {name}
            </span>
          </div>
          <StatusIcon status={status} accentColor={accentColor} />
        </div>

        {isCurrent && (
          <span
            className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded animate-pulse"
            style={{ backgroundColor: withAlpha(accentColor, 18), color: accentColor }}
          >
            Current
          </span>
        )}
        {isSkipped && (
          <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
            Skipped
          </span>
        )}
        {isCompleted && (
          <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700">
            Done
          </span>
        )}

        {children}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !bg-[var(--paper)]"
        style={{ borderColor: isNotStarted ? 'var(--border)' : accentColor }}
      />
    </div>
  );
}

function StatusIcon({ status, accentColor }: { status: ExecutionNodeStatus; accentColor: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={14} className="flex-shrink-0 text-green-600" />;
    case 'skipped':
      return <SkipForward size={14} className="flex-shrink-0 text-amber-500" />;
    case 'in_progress':
      return <Loader2 size={14} className="flex-shrink-0 animate-spin" style={{ color: accentColor }} />;
    case 'pending':
      return <Circle size={14} className="flex-shrink-0" style={{ color: accentColor }} />;
    case 'not_started':
    default:
      return <Circle size={12} className="flex-shrink-0 text-[var(--border)]" />;
  }
}
