'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import { Badge } from '@/components/ui/Badge';
import { WorkflowRFNodeData } from '@/store/workflowEditorStore';
import { ProductionStepConfig } from '@/lib/types';
import { BaseNodeShell } from './BaseNodeShell';

export type ProductionStepRFNode = Node<WorkflowRFNodeData, 'production_step'>;

export function ProductionStepNode({ data, selected }: NodeProps<ProductionStepRFNode>) {
  const config = data.config as ProductionStepConfig;

  return (
    <BaseNodeShell
      nodeType="production_step"
      name={data.name}
      selected={selected}
      badges={
        <>
          {config.skippable && <Badge variant="info">optional</Badge>}
          {config.credits_sku_stock_on_complete && <Badge variant="success">credits stock</Badge>}
          {data.is_entry_point && <Badge variant="muted">entry</Badge>}
          {data.is_terminal && <Badge variant="muted">terminal</Badge>}
        </>
      }
    />
  );
}
