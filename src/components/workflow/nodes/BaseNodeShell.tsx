'use client';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { WorkflowNodeType } from '@/lib/types';
import { NODE_TYPE_COLORS, NODE_TYPE_ICONS } from '../workflowNodeMeta';

/**
 * Shared visual chrome for every workflow node type: bordered card, header row (icon + name),
 * a colored left-edge accent bar keyed by node type, and a selected-state ring.
 *
 * Handle.Left target is always the single unconditional incoming handle. Handle(s).Right source
 * default to the single unconditional handle production_step needs (0-1 outgoing edges). Pass
 * `sourceHandles` (non-empty) to instead render one stacked, labeled source handle per entry --
 * used by approval/quality_check (fixed pairs) and conditional_branch (dynamic, one per drawn
 * edge plus one always-open "new" slot) -- each rendered inside its own relatively-positioned row
 * so React Flow's default Position.Right handle CSS (top: 50% of nearest positioned ancestor)
 * centers it within that row instead of stacking every handle at the same point.
 */
export function BaseNodeShell({
  nodeType,
  name,
  selected,
  badges,
  children,
  sourceHandles,
}: {
  nodeType: WorkflowNodeType;
  name: string;
  selected?: boolean;
  badges?: React.ReactNode;
  children?: React.ReactNode;
  sourceHandles?: { id: string; label: string }[];
}) {
  const Icon = NODE_TYPE_ICONS[nodeType];
  const accentColor = NODE_TYPE_COLORS[nodeType];

  return (
    <div
      className={cn(
        'relative min-w-[200px] max-w-[240px] rounded-lg border bg-[var(--paper)] shadow-[0_1px_4px_var(--shadow)]',
        'border-[var(--border-light)] overflow-hidden',
        selected && 'ring-2 ring-[var(--accent)]'
      )}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accentColor }} />
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !bg-[var(--paper)]" style={{ borderColor: accentColor }} />

      <div className="pl-3 pr-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon size={13} style={{ color: accentColor }} className="flex-shrink-0" />
          <span className="text-sm font-medium text-[var(--ink)] truncate">{name}</span>
        </div>
        {children}
        {badges && <div className="flex flex-wrap gap-1 mt-1.5">{badges}</div>}
      </div>

      {sourceHandles && sourceHandles.length > 0 ? (
        <div className="border-t border-[var(--border-light)]">
          {sourceHandles.map((h) => (
            <div
              key={h.id}
              className="relative flex items-center justify-end gap-1 pl-3 pr-4 py-1.5 text-[10px] text-[var(--ink-light)] border-b border-[var(--border-light)] last:border-b-0"
            >
              <span className="truncate">{h.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={h.id}
                className="!h-3 !w-3 !border-2 !bg-[var(--paper)]"
                style={{ borderColor: accentColor }}
              />
            </div>
          ))}
        </div>
      ) : (
        <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !bg-[var(--paper)]" style={{ borderColor: accentColor }} />
      )}
    </div>
  );
}
