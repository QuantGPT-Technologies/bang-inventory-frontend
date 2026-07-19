'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import { Badge } from '@/components/ui/Badge';
import { WorkflowRFNodeData } from '@/store/workflowEditorStore';
import { BaseNodeShell } from './BaseNodeShell';

export type LotFanoutRFNode = Node<WorkflowRFNodeData, 'lot_fanout'>;

/** Simplest of the five node types: like production_step, it has a single unconditional source
 * handle -- the branching this node represents (one child lot workflow per lot created by the
 * batch split) happens at the instance level via dynamically-spawned child instances, not via
 * multiple statically-drawn outgoing edges. Config is always `{}` (see LotFanoutConfig). */
export function LotFanoutNode({ data, selected }: NodeProps<LotFanoutRFNode>) {
  return (
    <BaseNodeShell
      nodeType="lot_fanout"
      name={data.name}
      selected={selected}
      badges={
        <>
          {data.is_entry_point && <Badge variant="muted">entry</Badge>}
          {data.is_terminal && <Badge variant="muted">terminal</Badge>}
        </>
      }
    >
      <p className="text-[10px] text-[var(--ink-muted)] italic">spawns N lot workflows at runtime</p>
    </BaseNodeShell>
  );
}
