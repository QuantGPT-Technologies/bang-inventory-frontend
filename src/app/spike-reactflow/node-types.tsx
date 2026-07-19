"use client";

/**
 * SPIKE — module-level nodeTypes map.
 *
 * React Flow's docs explicitly warn that if you define `nodeTypes` /
 * `edgeTypes` inline inside your component body, a new object identity is
 * created on every render, which React Flow interprets as "the node type
 * changed" and remounts every node of that type — losing any local state
 * and causing visible flicker while dragging. Defining these maps as
 * module-level `const`s (here, in a file separate from the page component)
 * guarantees stable identity across renders.
 *
 * https://reactflow.dev/learn/advanced-use/typescript#custom-nodes
 */

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export type TriggerNodeData = {
  label: string;
  description?: string;
};
export type TriggerNode = Node<TriggerNodeData, "trigger">;

export type ActionNodeData = {
  label: string;
  description?: string;
};
export type ActionNode = Node<ActionNodeData, "action">;

export type OutputNodeData = {
  label: string;
  description?: string;
};
export type OutputNode = Node<OutputNodeData, "output">;

const nodeShellClass =
  "rounded-lg border-2 bg-white shadow-md px-4 py-3 min-w-[180px] text-sm";

/** Source-only node: has a single source handle a user can drag a new edge from. */
function TriggerNodeComponent({ data, selected }: NodeProps<TriggerNode>) {
  return (
    <div
      className={`${nodeShellClass} border-emerald-500 ${
        selected ? "ring-2 ring-emerald-400" : ""
      }`}
    >
      <div className="font-semibold text-emerald-700">{data.label}</div>
      {data.description && (
        <div className="text-xs text-gray-500 mt-1">{data.description}</div>
      )}
      {/* Custom, explicitly id'd handle — the drag-a-new-connection test target. */}
      <Handle
        type="source"
        position={Position.Right}
        id="trigger-out"
        className="!h-3 !w-3 !bg-emerald-500"
      />
    </div>
  );
}

/** Mid-chain node: target handle on the left, source handle on the right. */
function ActionNodeComponent({ data, selected }: NodeProps<ActionNode>) {
  return (
    <div
      className={`${nodeShellClass} border-blue-500 ${
        selected ? "ring-2 ring-blue-400" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="action-in"
        className="!h-3 !w-3 !bg-blue-500"
      />
      <div className="font-semibold text-blue-700">{data.label}</div>
      {data.description && (
        <div className="text-xs text-gray-500 mt-1">{data.description}</div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        id="action-out"
        className="!h-3 !w-3 !bg-blue-500"
      />
    </div>
  );
}

/** Terminal node: target-only handle. */
function OutputNodeComponent({ data, selected }: NodeProps<OutputNode>) {
  return (
    <div
      className={`${nodeShellClass} border-orange-500 ${
        selected ? "ring-2 ring-orange-400" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="output-in"
        className="!h-3 !w-3 !bg-orange-500"
      />
      <div className="font-semibold text-orange-700">{data.label}</div>
      {data.description && (
        <div className="text-xs text-gray-500 mt-1">{data.description}</div>
      )}
    </div>
  );
}

// Module-level const map — stable identity across every render of the page.
export const nodeTypes = {
  trigger: TriggerNodeComponent,
  action: ActionNodeComponent,
  output: OutputNodeComponent,
};
