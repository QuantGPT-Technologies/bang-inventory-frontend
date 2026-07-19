'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import { ExecutionNodeShell } from '../ExecutionNodeShell';
import { ExecutionRFNodeData } from '../executionGraph';

export type ExecutionLotFanoutRFNode = Node<ExecutionRFNodeData, 'lot_fanout'>;

export function ExecutionLotFanoutNode({ data, selected }: NodeProps<ExecutionLotFanoutRFNode>) {
  const { graphNode } = data;

  return (
    <ExecutionNodeShell nodeType="lot_fanout" name={graphNode.name} status={graphNode.status} selected={selected}>
      <p className="mt-1 text-[10px] text-[var(--ink-muted)] italic">spawns N lot workflows</p>
    </ExecutionNodeShell>
  );
}
