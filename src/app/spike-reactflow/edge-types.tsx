"use client";

/**
 * SPIKE — module-level edgeTypes map (same rationale as node-types.tsx:
 * stable object identity so React Flow doesn't remount edges on re-render).
 */

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

export type LabeledEdgeData = {
  label?: string;
};
export type LabeledEdge = Edge<LabeledEdgeData, "labeled">;

function LabeledEdgeComponent({
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
}: EdgeProps<LabeledEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan rounded bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-300 shadow-sm"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// Module-level const map — stable identity across every render of the page.
export const edgeTypes = {
  labeled: LabeledEdgeComponent,
};
