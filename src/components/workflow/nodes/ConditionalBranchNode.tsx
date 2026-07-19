'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import { Badge } from '@/components/ui/Badge';
import { useWorkflowEditorStore, WorkflowRFNodeData, BRANCH_NEW_HANDLE_ID, selectIsReadOnly } from '@/store/workflowEditorStore';
import { ConditionalBranchConfig } from '@/lib/types';
import { BaseNodeShell } from './BaseNodeShell';

export type ConditionalBranchRFNode = Node<WorkflowRFNodeData, 'conditional_branch'>;

/**
 * A branch node's handles aren't a fixed pair -- they're one per outgoing edge the user has
 * actually drawn (labeled by that edge's condition_value, or "default" for the is_default
 * fallback), plus one always-open unconnected slot at the bottom for dragging the next edge.
 * The always-open slot uses the shared BRANCH_NEW_HANDLE_ID; the store's onConnect immediately
 * remaps any edge drawn from it to a fresh unique handle id so it renders on its own row from
 * then on and doesn't collide with the next "new" slot.
 */
export function ConditionalBranchNode({ id, data, selected }: NodeProps<ConditionalBranchRFNode>) {
  const config = data.config as ConditionalBranchConfig;
  const edges = useWorkflowEditorStore((s) => s.edges);
  const isReadOnly = useWorkflowEditorStore(selectIsReadOnly);

  const outgoing = edges.filter((e) => e.source === id);
  const sourceHandles = [
    ...outgoing.map((e) => ({
      id: e.sourceHandle ?? e.id,
      label: e.data?.is_default ? 'Default' : e.data?.condition_value || 'Unset',
    })),
    // Read-only (published) graphs shouldn't offer a dangling "draw a new edge" slot.
    ...(isReadOnly ? [] : [{ id: BRANCH_NEW_HANDLE_ID, label: '+ New' }]),
  ];

  return (
    <BaseNodeShell
      nodeType="conditional_branch"
      name={data.name}
      selected={selected}
      sourceHandles={sourceHandles}
      badges={
        <>
          {config.source_field && <Badge variant="info">branches on: {config.source_field}</Badge>}
          {data.is_entry_point && <Badge variant="muted">entry</Badge>}
          {data.is_terminal && <Badge variant="muted">terminal</Badge>}
        </>
      }
    />
  );
}
