import type { Node, Edge } from '@xyflow/react';
import { LotWorkflowGraph, LotWorkflowGraphNode } from '@/lib/types';
import type { WorkflowRFEdgeData } from '@/store/workflowEditorStore';

/** Data carried on every React Flow node in the execution canvas: the full merged
 * template-node + runtime-status shape the backend returns, untouched. Node components read
 * `graphNode.status` / `graphNode.instance` to render live state (see ExecutionNodeShell). */
export type ExecutionRFNodeData = { graphNode: LotWorkflowGraphNode };
export type ExecutionRFNode = Node<ExecutionRFNodeData>;

// Edge data intentionally reuses the editor's WorkflowRFEdgeData shape (condition_value/
// is_default/priority) rather than inventing a new one, so LabeledEdge -- the same component
// the template editor uses -- can be reused verbatim via edgeTypes.ts without any type gymnastics.
// Whether an edge was actually traversed by this run is expressed via the edge's top-level
// `style` (stroke color/width/opacity), not `data`, for exactly that reason.
export type ExecutionRFEdge = Edge<WorkflowRFEdgeData>;

const LAYER_X_SPACING = 280;
const ROW_Y_SPACING = 130;
const ORIGIN_X = 60;
const ORIGIN_Y = 60;

/**
 * GET /lots/:id/graph nodes carry no canvas position (confirmed live: WorkflowNode has no x/y
 * field, and the graph endpoint doesn't add one) -- the template editor's saved positions only
 * exist client-side in workflowEditorStore's React Flow state, they're never persisted to the
 * backend. So this lays the execution graph out itself: a simple left-to-right layered
 * (longest-path) layout, same spirit as workflowEditorStore.loadTemplate's grid fallback for a
 * fresh template load, but walking `is_entry_point` -> edges so the graph actually reads as a
 * left-to-right flow instead of an arbitrary grid.
 *
 * Algorithm: seed layer 0 at the entry-point node(s), then relax `layer[to] = max(layer[to],
 * layer[from] + 1)` along every edge for up to N passes (N = node count), which converges for
 * any DAG -- and a published template's graph is guaranteed acyclic (ValidateGraph rejects
 * cycles at publish time on the backend). Any node the relaxation never reaches (should not
 * happen for a valid published graph, but defensive) is appended after the deepest layer found,
 * ordered by sequence_hint, so it still renders somewhere sane rather than being dropped.
 */
export function buildExecutionGraph(graph: LotWorkflowGraph): { nodes: ExecutionRFNode[]; edges: ExecutionRFEdge[] } {
  const nodesByKey = new Map(graph.nodes.map((n) => [n.node_key, n]));
  const idToKey = new Map(graph.nodes.map((n) => [n.id, n.node_key]));

  const outgoingByKey = new Map<string, string[]>();
  for (const e of graph.edges) {
    const from = idToKey.get(e.from_node_id);
    const to = idToKey.get(e.to_node_id);
    if (!from || !to) continue;
    if (!outgoingByKey.has(from)) outgoingByKey.set(from, []);
    outgoingByKey.get(from)!.push(to);
  }

  const layer = new Map<string, number>();
  const entryKeys = graph.nodes.filter((n) => n.is_entry_point).map((n) => n.node_key);
  const seeds = entryKeys.length > 0
    ? entryKeys
    : [...graph.nodes].sort((a, b) => a.sequence_hint - b.sequence_hint).slice(0, 1).map((n) => n.node_key);
  for (const key of seeds) layer.set(key, 0);

  for (let pass = 0; pass < graph.nodes.length; pass++) {
    let changed = false;
    for (const [from, targets] of outgoingByKey) {
      if (!layer.has(from)) continue;
      const candidate = layer.get(from)! + 1;
      for (const to of targets) {
        if (!layer.has(to) || layer.get(to)! < candidate) {
          layer.set(to, candidate);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  let maxLayer = layer.size > 0 ? Math.max(...layer.values()) : -1;
  const unlaid = graph.nodes.filter((n) => !layer.has(n.node_key)).sort((a, b) => a.sequence_hint - b.sequence_hint);
  for (const n of unlaid) {
    maxLayer += 1;
    layer.set(n.node_key, maxLayer);
  }

  const byLayer = new Map<number, LotWorkflowGraphNode[]>();
  for (const n of graph.nodes) {
    const l = layer.get(n.node_key)!;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(n);
  }
  for (const rows of byLayer.values()) rows.sort((a, b) => a.sequence_hint - b.sequence_hint);

  const nodes: ExecutionRFNode[] = [];
  for (const [l, rows] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    rows.forEach((n, rowIdx) => {
      nodes.push({
        id: n.node_key,
        type: n.node_type,
        position: { x: ORIGIN_X + l * LAYER_X_SPACING, y: ORIGIN_Y + rowIdx * ROW_Y_SPACING },
        data: { graphNode: n },
        draggable: false,
        connectable: false,
        selectable: true,
      });
    });
  }

  const edges: ExecutionRFEdge[] = [];
  for (const e of graph.edges) {
    const fromKey = idToKey.get(e.from_node_id);
    const toKey = idToKey.get(e.to_node_id);
    if (!fromKey || !toKey) continue;
    const fromNode = nodesByKey.get(fromKey);
    const toNode = nodesByKey.get(toKey);
    const traversed =
      !!fromNode &&
      !!toNode &&
      (fromNode.status === 'completed' || fromNode.status === 'skipped') &&
      toNode.status !== 'not_started';

    edges.push({
      id: `e${e.id}`,
      source: fromKey,
      target: toKey,
      type: 'default',
      data: {
        condition_value: e.condition_value ?? null,
        is_default: e.is_default,
        priority: e.priority,
      },
      style: traversed
        ? { stroke: 'var(--accent)', strokeWidth: 2.5 }
        : { stroke: 'var(--border)', strokeWidth: 1, opacity: 0.55 },
    });
  }

  return { nodes, edges };
}
