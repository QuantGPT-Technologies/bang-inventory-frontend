'use client';
import { useCallback, useRef } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, useReactFlow, type OnConnect } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './workflow-canvas-theme.css';
import { useWorkflowEditorStore, selectIsReadOnly } from '@/store/workflowEditorStore';
import { WorkflowNodeType } from '@/lib/types';
import { nodeTypes } from './nodeTypes';
import { edgeTypes } from './edgeTypes';

function WorkflowCanvasInner() {
  const nodes = useWorkflowEditorStore((s) => s.nodes);
  const edges = useWorkflowEditorStore((s) => s.edges);
  const onNodesChange = useWorkflowEditorStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowEditorStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowEditorStore((s) => s.onConnect);
  const addNodeFromPalette = useWorkflowEditorStore((s) => s.addNodeFromPalette);
  const select = useWorkflowEditorStore((s) => s.select);
  const selectEdge = useWorkflowEditorStore((s) => s.selectEdge);
  const isReadOnly = useWorkflowEditorStore(selectIsReadOnly);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const handleConnect: OnConnect = useCallback((connection) => onConnect(connection), [onConnect]);

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = isReadOnly ? 'none' : 'move';
    },
    [isReadOnly]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (isReadOnly) return;
      const nodeType = event.dataTransfer.getData('application/reactflow') as WorkflowNodeType | '';
      if (!nodeType) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNodeFromPalette(nodeType, position);
    },
    [screenToFlowPosition, addNodeFromPalette, isReadOnly]
  );

  return (
    <div ref={wrapperRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={(_, node) => select(node.id)}
        onEdgeClick={(_, edge) => selectEdge(edge.id)}
        onPaneClick={() => select(null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={!isReadOnly}
        nodesConnectable={!isReadOnly}
        edgesReconnectable={!isReadOnly}
        deleteKeyCode={isReadOnly ? null : ['Backspace', 'Delete']}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  );
}
