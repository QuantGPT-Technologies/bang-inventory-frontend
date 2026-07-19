'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import { ExecutionNodeShell } from '../ExecutionNodeShell';
import { ExecutionRFNodeData } from '../executionGraph';

export type ExecutionConditionalBranchRFNode = Node<ExecutionRFNodeData, 'conditional_branch'>;

export function ExecutionConditionalBranchNode({ data, selected }: NodeProps<ExecutionConditionalBranchRFNode>) {
  const { graphNode } = data;
  const inst = graphNode.instance;

  return (
    <ExecutionNodeShell nodeType="conditional_branch" name={graphNode.name} status={graphNode.status} selected={selected}>
      {inst?.outcome && <div className="mt-1 text-[10px] text-[var(--ink-muted)]">&rarr; {inst.outcome}</div>}
    </ExecutionNodeShell>
  );
}
