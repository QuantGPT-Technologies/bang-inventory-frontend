'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import { formatQty } from '@/lib/utils';
import { ExecutionNodeShell } from '../ExecutionNodeShell';
import { ExecutionRFNodeData } from '../executionGraph';

export type ExecutionProductionStepRFNode = Node<ExecutionRFNodeData, 'production_step'>;

export function ExecutionProductionStepNode({ data, selected }: NodeProps<ExecutionProductionStepRFNode>) {
  const { graphNode } = data;
  const inst = graphNode.instance;

  return (
    <ExecutionNodeShell nodeType="production_step" name={graphNode.name} status={graphNode.status} selected={selected}>
      {inst && (inst.machine_name || inst.actual_output_qty != null) && (
        <div className="mt-1 flex flex-col gap-0.5 text-[10px] text-[var(--ink-muted)]">
          {inst.machine_name && <span>Machine: {inst.machine_name}</span>}
          {inst.actual_output_qty != null && <span>Out: {formatQty(inst.actual_output_qty, inst.output_unit)}</span>}
        </div>
      )}
    </ExecutionNodeShell>
  );
}
