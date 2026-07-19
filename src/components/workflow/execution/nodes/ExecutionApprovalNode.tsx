'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import { ExecutionNodeShell } from '../ExecutionNodeShell';
import { ExecutionRFNodeData } from '../executionGraph';

export type ExecutionApprovalRFNode = Node<ExecutionRFNodeData, 'approval'>;

export function ExecutionApprovalNode({ data, selected }: NodeProps<ExecutionApprovalRFNode>) {
  const { graphNode } = data;
  const inst = graphNode.instance;

  return (
    <ExecutionNodeShell nodeType="approval" name={graphNode.name} status={graphNode.status} selected={selected}>
      {inst?.outcome && (
        <div className="mt-1 text-[10px] text-[var(--ink-muted)]">
          &rarr; {inst.outcome}
          {inst.operator_name && ` by ${inst.operator_name}`}
        </div>
      )}
    </ExecutionNodeShell>
  );
}
