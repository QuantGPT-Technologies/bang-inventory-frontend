import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
} from '@xyflow/react';
import {
  WorkflowTemplateDetail,
  WorkflowTemplateEntityType,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowNodeConfig,
  WorkflowNodeInput,
  WorkflowEdgeInput,
  ProductionStepConfig,
} from '@/lib/types';

/**
 * Data carried on every React Flow node: the full backend node shape (or as much of it as
 * exists client-side for a brand-new node) so nothing is lost on the round trip to/from the
 * backend's node_key-addressed graph payload. `id` (backend numeric id) is omitted for new
 * nodes that haven't been saved yet.
 */
export type WorkflowRFNodeData = {
  node_key: string;
  node_type: WorkflowNodeType;
  name: string;
  sequence_hint: number;
  is_entry_point: boolean;
  is_terminal: boolean;
  config: WorkflowNodeConfig;
};

export type WorkflowRFEdgeData = {
  condition_value: string | null;
  is_default: boolean;
  priority: number;
};

export type WorkflowRFNode = Node<WorkflowRFNodeData>;
export type WorkflowRFEdge = Edge<WorkflowRFEdgeData>;

/** Fixed source-handle ids for the two node types with a static pair of outgoing conditions.
 * The handle id IS the condition_value an edge drawn from it should carry (see onConnect). */
export const APPROVAL_HANDLES = [
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
] as const;
export const QUALITY_CHECK_HANDLES = [
  { id: 'pass', label: 'Pass' },
  { id: 'fail', label: 'Fail' },
] as const;

/** conditional_branch's always-open extra handle for dragging a brand-new edge. onConnect
 * rewrites any edge created from this id to a fresh unique handle id so it never collides with
 * the next "new" slot rendered after it (see ConditionalBranchNode.tsx). */
export const BRANCH_NEW_HANDLE_ID = '__new__';

function defaultConfigFor(nodeType: WorkflowNodeType): WorkflowNodeConfig {
  switch (nodeType) {
    case 'production_step':
      return {
        input_unit: '',
        output_unit: '',
        skippable: false,
        credits_sku_stock_on_complete: false,
        allowed_scrap_types: [],
        default_scrap_unit: '',
      } satisfies ProductionStepConfig;
    case 'approval':
      return { required_role: 'manager' };
    case 'quality_check':
      return { measurement_fields: [] };
    case 'conditional_branch':
      return { source_field: 'outcome', operator: 'equals' };
    case 'lot_fanout':
      return {};
  }
}

/** Turns "Compaction Step" into "compaction_step"; falls back to a short random suffix if empty. */
export function slugifyNodeKey(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `node_${Math.random().toString(36).slice(2, 8)}`;
}

interface WorkflowEditorState {
  nodes: WorkflowRFNode[];
  edges: WorkflowRFEdge[];
  selectedId: string | null;
  selectedEdgeId: string | null;
  templateId: number | null;
  versionId: number | null;
  versionNumber: number | null;
  templateName: string;
  /** Which kind of entity this template's graph is for -- gates whether `lot_fanout` is offered
   * in the palette (batch-only; the backend doesn't reject it server-side, so the UI is the
   * primary safeguard). Defaults to 'lot' until a template is loaded. */
  entityType: WorkflowTemplateEntityType;
  versionStatus: 'draft' | 'published';
  isDirty: boolean;

  loadTemplate: (detail: WorkflowTemplateDetail) => void;
  onNodesChange: OnNodesChange<WorkflowRFNode>;
  onEdgesChange: OnEdgesChange<WorkflowRFEdge>;
  onConnect: (connection: Connection) => void;
  addNodeFromPalette: (nodeType: WorkflowNodeType, position: { x: number; y: number }) => void;
  updateNodeConfig: (nodeId: string, config: WorkflowNodeConfig) => void;
  updateNodeMeta: (
    nodeId: string,
    meta: Partial<Pick<WorkflowRFNodeData, 'name' | 'node_key' | 'is_entry_point' | 'is_terminal'>>
  ) => void;
  updateEdgeData: (edgeId: string, data: Partial<WorkflowRFEdgeData>) => void;
  select: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  toGraphPayload: () => { nodes: WorkflowNodeInput[]; edges: WorkflowEdgeInput[] };
  markClean: () => void;
  setVersionStatus: (status: 'draft' | 'published') => void;
  reset: () => void;
}

/** Derived read-only flag: once a version is published, the graph is frozen -- canvas/palette/
 * config-panel mutation actions all check this (or gate on it via the store's own guards). */
export const selectIsReadOnly = (s: WorkflowEditorState) => s.versionStatus === 'published';

/** Backend node id -> node_key, needed to translate WorkflowEdge (id-addressed) into RF edges (node_key/RF-id-addressed). */
function keyById(nodes: WorkflowNode[]): Map<number, string> {
  return new Map(nodes.map((n) => [n.id, n.node_key]));
}

const initialState = {
  nodes: [] as WorkflowRFNode[],
  edges: [] as WorkflowRFEdge[],
  selectedId: null as string | null,
  selectedEdgeId: null as string | null,
  templateId: null as number | null,
  versionId: null as number | null,
  versionNumber: null as number | null,
  templateName: '',
  entityType: 'lot' as WorkflowTemplateEntityType,
  versionStatus: 'draft' as 'draft' | 'published',
  isDirty: false,
};

export const useWorkflowEditorStore = create<WorkflowEditorState>((set, get) => ({
  ...initialState,

  loadTemplate: (detail) => {
    // A brand-new draft template has zero nodes/edges; some backend responses serialize an empty
    // SQL result set as JSON null rather than [] (Go's nil-slice-marshals-to-null behavior), so
    // never assume these are arrays without normalizing first.
    const detailNodes = detail.nodes ?? [];
    const detailEdges = detail.edges ?? [];

    const idOf = keyById(detailNodes);
    const typeById = new Map(detailNodes.map((n) => [n.id, n.node_type]));

    const nodes: WorkflowRFNode[] = detailNodes.map((n, i) => ({
      id: n.node_key,
      type: n.node_type,
      // Backend nodes don't carry a canvas position yet -- lay out new loads in a simple grid
      // so nodes don't all stack at (0,0); the user can drag them anywhere afterwards.
      position: { x: 80 + (i % 4) * 260, y: 80 + Math.floor(i / 4) * 160 },
      data: {
        node_key: n.node_key,
        node_type: n.node_type,
        name: n.name,
        sequence_hint: n.sequence_hint,
        is_entry_point: n.is_entry_point,
        is_terminal: n.is_terminal,
        config: n.config,
      },
    }));

    const edges: WorkflowRFEdge[] = [];
    for (const e of detailEdges) {
      const source = idOf.get(e.from_node_id);
      const target = idOf.get(e.to_node_id);
      if (!source || !target) continue;

      // The backend has no concept of a "handle id" -- it's purely a client-side rendering detail
      // (see BaseNodeShell's sourceHandles / onConnect above), so it has to be re-derived here on
      // every load: approval/quality_check's fixed handles are keyed by condition_value (which by
      // construction already holds 'approved'/'rejected'/'pass'/'fail'); conditional_branch's
      // per-edge handles just need a stable unique id, so the edge's own backend id is reused.
      const fromType = typeById.get(e.from_node_id);
      let sourceHandle: string | undefined;
      if (fromType === 'approval' || fromType === 'quality_check') {
        sourceHandle = e.condition_value ?? undefined;
      } else if (fromType === 'conditional_branch') {
        sourceHandle = `branch-${e.id}`;
      }

      edges.push({
        id: `e${e.id}`,
        source,
        target,
        sourceHandle,
        type: 'default',
        data: {
          condition_value: e.condition_value ?? null,
          is_default: e.is_default,
          priority: e.priority,
        },
      });
    }

    set({
      nodes,
      edges,
      selectedId: null,
      selectedEdgeId: null,
      templateId: detail.template_id,
      versionId: detail.id,
      versionNumber: detail.version_number,
      templateName: detail.template_name,
      entityType: detail.template_entity_type,
      versionStatus: detail.status,
      isDirty: false,
    });
  },

  onNodesChange: (changes) => {
    // Once published, block structural changes (drag/remove/add) but keep selection and the
    // dimension measurements React Flow needs on first mount to lay out handles/edges correctly.
    if (get().versionStatus === 'published') {
      const allowed = changes.filter((c) => c.type === 'select' || c.type === 'dimensions');
      if (allowed.length > 0) set({ nodes: applyNodeChanges(allowed, get().nodes) });
      return;
    }
    set({ nodes: applyNodeChanges(changes, get().nodes), isDirty: true });
  },

  onEdgesChange: (changes) => {
    if (get().versionStatus === 'published') {
      const allowed = changes.filter((c) => c.type === 'select');
      if (allowed.length > 0) set({ edges: applyEdgeChanges(allowed, get().edges) });
      return;
    }
    set({ edges: applyEdgeChanges(changes, get().edges), isDirty: true });
  },

  onConnect: (connection) => {
    if (get().versionStatus === 'published') return;

    const sourceNode = get().nodes.find((n) => n.id === connection.source);
    let sourceHandle: string | null = connection.sourceHandle;
    // approval/quality_check: the fixed handle the user dragged from (approved/rejected,
    // pass/fail) directly IS the condition_value the backend matches the node's outcome
    // against -- see resolveEdgeTarget in workflow_service.go.
    let conditionValue: string | null = null;
    if (sourceNode?.data.node_type === 'approval' || sourceNode?.data.node_type === 'quality_check') {
      conditionValue = sourceHandle;
    } else if (sourceNode?.data.node_type === 'conditional_branch') {
      // The dragged-from handle is always the shared "always open" slot -- remap to a fresh,
      // unique id so this new edge gets its own stable handle on next render instead of
      // colliding with the next "new" slot (see ConditionalBranchNode.tsx).
      sourceHandle = `branch-${crypto.randomUUID()}`;
    }

    set({
      edges: addEdge<WorkflowRFEdge>(
        {
          ...connection,
          sourceHandle,
          type: 'default',
          data: { condition_value: conditionValue, is_default: false, priority: 0 },
        },
        get().edges
      ),
      isDirty: true,
    });
  },

  addNodeFromPalette: (nodeType, position) => {
    if (get().versionStatus === 'published') return;
    const nodeKey = crypto.randomUUID();
    const existingCount = get().nodes.length;
    const newNode: WorkflowRFNode = {
      id: nodeKey,
      type: nodeType,
      position,
      data: {
        node_key: nodeKey,
        node_type: nodeType,
        name: nodeType === 'production_step' ? 'New Production Step' : 'New Node',
        sequence_hint: existingCount + 1,
        is_entry_point: existingCount === 0,
        is_terminal: false,
        config: defaultConfigFor(nodeType),
      },
    };
    set({ nodes: [...get().nodes, newNode], isDirty: true });
  },

  updateNodeConfig: (nodeId, config) => {
    if (get().versionStatus === 'published') return;
    set({
      nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, config } } : n)),
      isDirty: true,
    });
  },

  updateNodeMeta: (nodeId, meta) => {
    if (get().versionStatus === 'published') return;
    // Entry point is exclusive -- the backend's ValidateGraph rejects publish unless exactly one
    // node has is_entry_point=true, so enforce that here too rather than only discovering the
    // conflict at publish time. Turning it on for one node clears it on every other node in the
    // same update. Terminal is NOT exclusive -- the backend explicitly allows multiple terminal
    // nodes (e.g. an approval's "rejected" branch can end at a different terminal node than its
    // "approved" branch; the only real rule is "a terminal node has zero outgoing edges").
    const makingEntryPoint = meta.is_entry_point === true;
    set({
      nodes: get().nodes.map((n) => {
        if (n.id === nodeId) return { ...n, data: { ...n.data, ...meta } };
        if (makingEntryPoint && n.data.is_entry_point) {
          return { ...n, data: { ...n.data, is_entry_point: false } };
        }
        return n;
      }),
      isDirty: true,
    });
  },

  updateEdgeData: (edgeId, data) => {
    if (get().versionStatus === 'published') return;
    set({
      edges: get().edges.map((e) => (e.id === edgeId ? { ...e, data: { ...(e.data as WorkflowRFEdgeData), ...data } } : e)),
      isDirty: true,
    });
  },

  select: (id) => set({ selectedId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedId: null }),

  toGraphPayload: () => {
    const { nodes, edges } = get();
    const keyOfRfId = new Map(nodes.map((n) => [n.id, n.data.node_key]));

    const nodeInputs: WorkflowNodeInput[] = nodes.map((n) => ({
      node_key: n.data.node_key,
      node_type: n.data.node_type,
      name: n.data.name,
      sequence_hint: n.data.sequence_hint,
      is_entry_point: n.data.is_entry_point,
      is_terminal: n.data.is_terminal,
      config: n.data.config,
    }));

    const edgeInputs: WorkflowEdgeInput[] = [];
    for (const e of edges) {
      const fromKey = keyOfRfId.get(e.source);
      const toKey = keyOfRfId.get(e.target);
      if (!fromKey || !toKey) continue;
      edgeInputs.push({
        from_node_key: fromKey,
        to_node_key: toKey,
        condition_value: e.data?.condition_value ?? undefined,
        is_default: e.data?.is_default ?? false,
        priority: e.data?.priority ?? 0,
      });
    }

    return { nodes: nodeInputs, edges: edgeInputs };
  },

  markClean: () => set({ isDirty: false }),

  setVersionStatus: (status) => set({ versionStatus: status }),

  reset: () => set({ ...initialState }),
}));
