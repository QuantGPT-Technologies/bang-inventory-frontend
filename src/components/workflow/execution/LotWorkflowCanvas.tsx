'use client';
import { useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../workflow-canvas-theme.css';
import { LotWorkflowGraph } from '@/lib/types';
import { executionNodeTypes } from './executionNodeTypes';
import { edgeTypes } from '../edgeTypes';
import { buildExecutionGraph } from './executionGraph';
import { NodeDetailPanel } from './NodeDetailPanel';

/**
 * Read-only counterpart to WorkflowCanvas.tsx: same ReactFlowProvider+ReactFlow shell and the
 * same workflow-canvas-theme.css for visual consistency with the template editor, but built for
 * viewing a lot's live progress through its template graph, not editing a template:
 *  - no dragging, connecting, palette, or config panel (nodesDraggable/nodesConnectable false)
 *  - nodes render live status via executionNodeTypes (see ExecutionNodeShell) instead of the
 *    editor's draft-config badges
 *  - positions are computed client-side (buildExecutionGraph) since the backend's graph read
 *    path carries no canvas coordinates -- only the editor's own saved React Flow state does,
 *    and that's never persisted server-side
 *  - clicking a node opens a detail popover (NodeDetailPanel) instead of a docked config panel
 */
function LotWorkflowCanvasInner({ graph }: { graph: LotWorkflowGraph }) {
  const { nodes, edges } = useMemo(() => buildExecutionGraph(graph), [graph]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedNode = selectedKey != null ? graph.nodes.find((n) => n.node_key === selectedKey) ?? null : null;

  return (
    <div className="h-full w-full">
      {/*
        React Flow's <ReactFlow> defaults minZoom to 0.5. This canvas's layout
        (buildExecutionGraph) lays a linear/lightly-branching pipeline out as a single wide,
        short row (LAYER_X_SPACING=280 per node, one row for any non-branching run), so its
        content bounding box is extremely wide relative to its height (confirmed live: ~1600 x
        70 flow-units for a 6-node run inside a 729 x 518px container). fitView computes the
        scale needed to fit that box (~0.32 for the 6-node case) but then clamps it up to
        minZoom=0.5 because 0.32 < 0.5 -- so the canvas is forced to render ~56% larger than the
        fitted size, which both overflows the container on the left/right (confirmed via
        getBoundingClientRect: the leftmost node's edge sat 34.5px outside the container's own
        left edge, matching the reported clipping) and, since the vertical dimension was never
        the constraint, still leaves large empty space above/below. Lowering minZoom lets
        fitView actually reach the scale the content needs instead of being floored.
      */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={executionNodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => setSelectedKey(node.id)}
        onPaneClick={() => setSelectedKey(null)}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
      >
        <Background />
        <Controls showInteractive={false} />
        {selectedNode && <NodeDetailPanel node={selectedNode} onClose={() => setSelectedKey(null)} />}
      </ReactFlow>
    </div>
  );
}

export function LotWorkflowCanvas({ graph }: { graph: LotWorkflowGraph }) {
  return (
    <ReactFlowProvider>
      <LotWorkflowCanvasInner graph={graph} />
    </ReactFlowProvider>
  );
}
