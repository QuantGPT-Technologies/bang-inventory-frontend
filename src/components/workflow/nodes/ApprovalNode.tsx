'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import { Badge } from '@/components/ui/Badge';
import { WorkflowRFNodeData, APPROVAL_HANDLES } from '@/store/workflowEditorStore';
import { ApprovalConfig } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/utils';
import { BaseNodeShell } from './BaseNodeShell';

export type ApprovalRFNode = Node<WorkflowRFNodeData, 'approval'>;

export function ApprovalNode({ data, selected }: NodeProps<ApprovalRFNode>) {
  const config = data.config as ApprovalConfig;

  return (
    <BaseNodeShell
      nodeType="approval"
      name={data.name}
      selected={selected}
      sourceHandles={[...APPROVAL_HANDLES]}
      badges={
        <>
          {config.required_role && (
            <Badge variant="info">Requires: {ROLE_LABELS[config.required_role] ?? config.required_role}</Badge>
          )}
          {data.is_entry_point && <Badge variant="muted">entry</Badge>}
          {data.is_terminal && <Badge variant="muted">terminal</Badge>}
        </>
      }
    />
  );
}
