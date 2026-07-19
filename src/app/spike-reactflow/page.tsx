"use client";

/**
 * SPIKE — de-risking @xyflow/react (React Flow v12) on:
 *   Next.js 16.2.4 (App Router) + React 19.2.4 + reactCompiler: true
 *
 * This is a throwaway page (underscore-prefixed dir => excluded from
 * routing... actually Next.js still routes `_`-prefixed folders under
 * `app/`, the underscore just signals "private/non-nav" by convention;
 * this route is intentionally not linked from anywhere).
 *
 * Do not "clean this up" — a follow-up task builds on what's proven here.
 */

import { useCallback, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes, type TriggerNode, type ActionNode, type OutputNode } from "./node-types";
import { edgeTypes, type LabeledEdge } from "./edge-types";

type SpikeNode = TriggerNode | ActionNode | OutputNode;
type SpikeEdge = LabeledEdge;

const initialNodes: SpikeNode[] = [
  {
    id: "n1",
    type: "trigger",
    position: { x: 40, y: 120 },
    data: { label: "Trigger", description: "Starts the workflow" },
  },
  {
    id: "n2",
    type: "action",
    position: { x: 340, y: 120 },
    data: { label: "Action", description: "Does something" },
  },
  {
    id: "n3",
    type: "output",
    position: { x: 640, y: 120 },
    data: { label: "Output", description: "Terminal step" },
  },
];

const initialEdges: SpikeEdge[] = [
  {
    id: "e1-2",
    source: "n1",
    target: "n2",
    sourceHandle: "trigger-out",
    targetHandle: "action-in",
    type: "labeled",
    data: { label: "on trigger" },
  },
  {
    id: "e2-3",
    source: "n2",
    target: "n3",
    sourceHandle: "action-out",
    targetHandle: "output-in",
    type: "labeled",
    data: { label: "on success" },
  },
];

function Spike() {
  // Controlled state — the real editor needs to read/serialize the graph on
  // save, so this deliberately uses the controlled pattern (useState +
  // onNodesChange/onEdgesChange via applyNodeChanges/applyEdgeChanges)
  // rather than React Flow's uncontrolled/internal-state-only mode.
  const [nodes, setNodes] = useState<SpikeNode[]>(initialNodes);
  const [edges, setEdges] = useState<SpikeEdge[]>(initialEdges);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);

  const onNodesChange: OnNodesChange<SpikeNode> = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange: OnEdgesChange<SpikeEdge> = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    setEdges((eds) =>
      addEdge<SpikeEdge>(
        { ...connection, type: "labeled", data: { label: "new edge" } },
        eds
      )
    );
    setConnectionLog((log) => [
      ...log,
      `onConnect: ${connection.source}(${connection.sourceHandle}) -> ${connection.target}(${connection.targetHandle})`,
    ]);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <ReactFlow<SpikeNode, SpikeEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>

      {/* Visible debug readout so behavior can be confirmed without devtools */}
      <div
        style={{
          position: "fixed",
          bottom: 8,
          left: 8,
          zIndex: 10,
          background: "white",
          border: "1px solid #ccc",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 11,
          maxWidth: 420,
          maxHeight: 160,
          overflow: "auto",
        }}
        data-testid="spike-debug"
      >
        <div>
          <strong>nodes:</strong> {nodes.length}
          {"   "}
          <strong>edges:</strong> {edges.length}
        </div>
        <div>
          <strong>node positions:</strong>{" "}
          {nodes
            .map((n) => `${n.id}=(${Math.round(n.position.x)},${Math.round(n.position.y)})`)
            .join(" ")}
        </div>
        <div>
          <strong>connections:</strong>
          <ul style={{ margin: 0, paddingLeft: 14 }}>
            {connectionLog.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function SpikeReactFlowPage() {
  return (
    <ReactFlowProvider>
      <Spike />
    </ReactFlowProvider>
  );
}
