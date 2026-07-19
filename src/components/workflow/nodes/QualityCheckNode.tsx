'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import { Badge } from '@/components/ui/Badge';
import { WorkflowRFNodeData, QUALITY_CHECK_HANDLES } from '@/store/workflowEditorStore';
import { QualityCheckConfig } from '@/lib/types';
import { BaseNodeShell } from './BaseNodeShell';

export type QualityCheckRFNode = Node<WorkflowRFNodeData, 'quality_check'>;

export function QualityCheckNode({ data, selected }: NodeProps<QualityCheckRFNode>) {
  const config = data.config as QualityCheckConfig;
  const fieldCount = config.measurement_fields?.length ?? 0;

  return (
    <BaseNodeShell
      nodeType="quality_check"
      name={data.name}
      selected={selected}
      sourceHandles={[...QUALITY_CHECK_HANDLES]}
      badges={
        <>
          {fieldCount > 0 && (
            <Badge variant="info">
              {fieldCount} measurement{fieldCount === 1 ? '' : 's'}
            </Badge>
          )}
          {data.is_entry_point && <Badge variant="muted">entry</Badge>}
          {data.is_terminal && <Badge variant="muted">terminal</Badge>}
        </>
      }
    />
  );
}
