'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import { ExecutionNodeShell } from '../ExecutionNodeShell';
import { ExecutionRFNodeData } from '../executionGraph';

export type ExecutionQualityCheckRFNode = Node<ExecutionRFNodeData, 'quality_check'>;

export function ExecutionQualityCheckNode({ data, selected }: NodeProps<ExecutionQualityCheckRFNode>) {
  const { graphNode } = data;
  const inst = graphNode.instance;

  return (
    <ExecutionNodeShell nodeType="quality_check" name={graphNode.name} status={graphNode.status} selected={selected}>
      {inst?.outcome && <div className="mt-1 text-[10px] text-[var(--ink-muted)]">&rarr; {inst.outcome}</div>}
    </ExecutionNodeShell>
  );
}
