'use client';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import { WorkflowRFEdgeData } from '@/store/workflowEditorStore';

export type LabeledEdgeType = Edge<WorkflowRFEdgeData, 'default'>;

/** Mirrors spike-reactflow/edge-types.tsx's LabeledEdgeComponent pattern: BaseEdge + a small
 * label pill (rendered via EdgeLabelRenderer so it sits above the SVG layer) showing
 * `condition_value` when set. Plain unlabeled edge otherwise. */
export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<LabeledEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const label = data?.condition_value || (data?.is_default ? 'default' : null);

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan rounded bg-[var(--paper)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-light)] border border-[var(--border)] shadow-sm"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
