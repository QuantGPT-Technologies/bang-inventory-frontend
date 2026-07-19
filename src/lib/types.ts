export type Role = 'admin' | 'manager' | 'engineer' | 'production';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

export interface Customer {
  id: number;
  code?: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  is_active?: boolean;
  created_at: string;
}

export interface Vendor {
  id: number;
  code?: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  is_active?: boolean;
  created_at: string;
}

export interface SKUMaterial {
  raw_material_id: number;
  raw_material_name?: string;
  ratio_percent: number;
}

export interface SKU {
  id: number;
  code: string;
  name: string;
  description?: string;
  customer_id?: number;
  customer_name?: string;
  unit: string;
  current_stock: number;
  is_active: boolean;
  materials?: SKUMaterial[];
  default_workflow_template_id?: number;
  created_at: string;
}

export interface RawMaterial {
  id: number;
  name: string;
  code?: string;
  unit: string;
  current_stock: number;
  vendor_id?: number;
  vendor_name?: string;
  created_at: string;
}

export interface Consumable {
  id: number;
  name: string;
  code?: string;
  unit: string;
  current_stock: number;
  created_at: string;
}

export interface BatchMaterial {
  id?: number;
  raw_material_id: number;
  material_name?: string;
  planned_qty: number;
  actual_qty?: number | null;
  unit?: string;
}

export type BatchStatus = 'created' | 'blending' | 'blended' | 'completed';

export interface BatchScrap {
  id: number;
  scrap_type: string;
  quantity: number;
  unit: string;
  notes?: string | null;
  created_at: string;
}

export interface Batch {
  id: number;
  batch_number: string;
  year?: number;
  week?: number;
  day_of_week?: number;
  sequence?: number;
  total_blend_qty: number;
  unit: string;
  status: BatchStatus;
  notes?: string | null;
  materials?: BatchMaterial[];
  scrap?: BatchScrap[];
  lots?: Lot[];
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  updated_at?: string;
}

export const STEP_ORDER_LIST = ['compaction', 'sintering', 'marking', 'barreling', 'sizing', 'batching'] as const;
export type StepName = (typeof STEP_ORDER_LIST)[number];
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type LotStatus = 'created' | 'in_progress' | 'completed';

export interface ScrapEntry {
  id: number;
  scrap_type: string;
  quantity: number;
  unit: string;
  notes?: string;
  recorded_by_name?: string;
  created_at: string;
}

export interface StepVariance {
  input_diff: number;
  input_diff_pct: number;
  output_diff: number;
  output_diff_pct: number;
  yield_pct: number;
  total_scrap: number;
  scrap_unit: string;
}

export interface ConsumableUsageDetail {
  id: number;
  lot_step_id: number;
  consumable_id: number;
  consumable_name: string;
  quantity: number;
  unit: string;
  created_at: string;
}

export interface StepOverride {
  id: number;
  lot_step_id: number;
  previous_input_qty?: number | null;
  previous_output_qty?: number | null;
  previous_notes?: string | null;
  new_input_qty?: number | null;
  new_output_qty?: number | null;
  reason: string;
  changed_by: number;
  changed_by_name?: string;
  created_at: string;
}

/**
 * NOTE (verified against internal/models/lot.go and internal/models/workflow.go on the backend):
 * GET /lots/:id populates its `steps` array from workflow_node_instances, not lot_steps. The
 * live per-item JSON key for the step's identifier is `node_key`, not `step_name` -- `step_name`
 * no longer exists on the wire and reads as undefined at runtime. It's kept below only because no
 * other page currently reads it (confirmed via repo-wide grep as of the lots/[id] migration);
 * remove it once nothing references it. Always use `node_key` for new code.
 */
export interface LotStep {
  id: number;
  lot_id?: number;
  step_name: StepName;
  step_sequence: number;
  status: StepStatus;
  machine_name?: string | null;
  skipped: boolean;
  expected_input_qty?: number | null;
  expected_output_qty?: number | null;
  actual_input_qty?: number | null;
  actual_output_qty?: number | null;
  input_unit?: string;
  output_unit?: string;
  operator_id?: number;
  operator_name?: string;
  notes?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  scrap_entries?: ScrapEntry[];
  consumable_usages?: ConsumableUsageDetail[];
  override_history?: StepOverride[];
  variance?: StepVariance | null;

  // --- Workflow-graph fields (added alongside the workflow template editor; see WorkflowNodeInstance) ---
  node_id?: number;
  node_key?: string;
  node_type?: WorkflowNodeType;
  outcome?: string;
  decision_reason?: string;
  decided_by?: number;
  decided_at?: string;
  data?: Record<string, unknown>;
  workflow_instance_id?: number;
  sequence_no?: number;
}

export interface Lot {
  id: number;
  lot_number: string;
  batch_id: number;
  batch_number?: string;
  sequence?: number;
  sku_id: number;
  sku_code?: string;
  sku_name?: string;
  quantity: number;
  unit?: string;
  status: LotStatus;
  current_step?: StepName;
  steps?: LotStep[];
  created_at: string;
  updated_at?: string;
}

// --- Workflow templates (graph-based step editor) ---

export type WorkflowNodeType = 'production_step' | 'approval' | 'quality_check' | 'conditional_branch' | 'lot_fanout';
export type WorkflowTemplateStatus = 'draft' | 'published';
/** 'lot' (per-SKU production pipeline, the default) or 'batch' (blend & split flow, the only
 * entity type that legitimately hosts a `lot_fanout` node). */
export type WorkflowTemplateEntityType = 'lot' | 'batch';

export interface WorkflowTemplate {
  id: number;
  name: string;
  entity_type: WorkflowTemplateEntityType;
  description?: string;
  is_system_default: boolean;
  current_version_id?: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateVersion {
  id: number;
  template_id: number;
  version_number: number;
  status: WorkflowTemplateStatus;
  published_at?: string;
  published_by?: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** GET /workflow-templates/:id returns this: the version being viewed plus its full graph. */
export interface WorkflowTemplateDetail extends WorkflowTemplateVersion {
  template_name: string;
  template_description?: string;
  template_entity_type: WorkflowTemplateEntityType;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// --- Per-node-type config shapes ---
// These are kept as separate named types (matching this file's existing style, e.g. StepVariance /
// ConsumableUsageDetail are not folded into a single discriminated union either) rather than a
// single tagged union on WorkflowNode itself, since WorkflowNode.config arrives as an untyped JSON
// blob from the backend (Go's json.RawMessage) -- call sites narrow by the sibling node_type field.
// WorkflowNodeConfigFor<T> below is provided for call sites that already know T statically.

export interface ProductionStepConfig {
  input_unit: string;
  output_unit: string;
  skippable: boolean;
  credits_sku_stock_on_complete: boolean;
  allowed_scrap_types: string[];
  default_scrap_unit?: string;
}

export interface ApprovalConfig {
  required_role: Role;
}

export interface QualityCheckConfig {
  measurement_fields: Array<{
    key: string;
    label: string;
    type: 'number' | 'text';
    required: boolean;
  }>;
}

export interface ConditionalBranchConfig {
  source_field: 'outcome' | 'actual_output_qty' | `data.${string}`;
  operator: 'equals' | 'gte' | 'lte' | 'gt' | 'lt';
  threshold?: number;
}

/** lot_fanout has no configurable fields -- it always saves/loads as `{}` (batch-only: spawns one
 * child lot instance per lot created by the batch's split-into-lots action). */
export type LotFanoutConfig = Record<string, never>;

/** Union of every node config shape -- use WorkflowNodeConfigFor<T> to narrow by node_type. */
export type WorkflowNodeConfig =
  | ProductionStepConfig
  | ApprovalConfig
  | QualityCheckConfig
  | ConditionalBranchConfig
  | LotFanoutConfig;

export type WorkflowNodeConfigFor<T extends WorkflowNodeType> = T extends 'production_step'
  ? ProductionStepConfig
  : T extends 'approval'
    ? ApprovalConfig
    : T extends 'quality_check'
      ? QualityCheckConfig
      : T extends 'conditional_branch'
        ? ConditionalBranchConfig
        : T extends 'lot_fanout'
          ? LotFanoutConfig
          : never;

export interface WorkflowNode {
  id: number;
  template_version_id: number;
  node_key: string;
  node_type: WorkflowNodeType;
  name: string;
  sequence_hint: number;
  is_entry_point: boolean;
  is_terminal: boolean;
  config: WorkflowNodeConfig;
  created_at: string;
  updated_at: string;
}

export interface WorkflowEdge {
  id: number;
  template_version_id: number;
  from_node_id: number;
  to_node_id: number;
  condition_value?: string;
  is_default: boolean;
  priority: number;
  created_at: string;
}

/**
 * Save-graph request bodies are keyed by node_key/from_node_key/to_node_key (not database ids) --
 * new nodes drawn on the canvas don't have a real id yet, so the backend resolves keys to ids
 * server-side. See PUT /workflow-templates/:id/versions/:versionNumber/graph.
 */
export interface WorkflowNodeInput {
  node_key: string;
  node_type: WorkflowNodeType;
  name: string;
  sequence_hint: number;
  is_entry_point: boolean;
  is_terminal: boolean;
  config: WorkflowNodeConfig;
}

export interface WorkflowEdgeInput {
  from_node_key: string;
  to_node_key: string;
  condition_value?: string;
  is_default: boolean;
  priority: number;
}

export interface DecideApprovalRequest {
  decision: 'approved' | 'rejected';
  reason?: string;
}

// --- Batch-level workflow (blend -> split_into_lots -> N spawned lot instances) ---

/**
 * Runtime node-instance record shape shared by both a lot's `steps[]` (GET /lots/:id) and a
 * batch's own `nodes[]` (GET /batches/:id/workflow) -- both are backed by the same
 * workflow_node_instances table (see internal/models/workflow.go's WorkflowNodeInstance). Kept
 * separate from LotStep (which still carries legacy required fields like `step_name`/`lot_id`
 * that don't exist on the wire for a batch's own nodes) rather than reusing it.
 */
export interface WorkflowNodeInstance {
  id: number;
  workflow_instance_id: number;
  node_id: number;
  node_key: string;
  node_type: WorkflowNodeType;
  sequence_no: number;
  status: StepStatus;
  skipped: boolean;
  expected_input_qty?: number | null;
  expected_output_qty?: number | null;
  actual_input_qty?: number | null;
  actual_output_qty?: number | null;
  input_unit?: string;
  output_unit?: string;
  machine_name?: string | null;
  outcome?: string;
  decision_reason?: string;
  decided_by?: number;
  decided_at?: string;
  data?: Record<string, unknown>;
  operator_id?: number;
  operator_name?: string;
  started_at?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  variance?: StepVariance | null;
}

/**
 * GET /lots/:id/graph response: the lot's full template graph (every node, visited or not)
 * merged with this lot's own runtime instance state per node. Unlike `Lot.steps` (LotStep[],
 * lazy-appended -- only visited/current nodes exist as rows), `nodes` here always contains every
 * node the template defines, so "not yet reached" nodes are representable (status:
 * 'not_started', no `instance`). Verified live against GET /lots/:id/graph for an early-pipeline,
 * a mid-pipeline (in_progress), and a fully-completed lot: `current_node_key` is present and
 * matches the one 'pending'/'in_progress' node while the lot is running, and is entirely absent
 * (not merely undefined-valued) once `instance_status` is 'completed'. Nodes carry no canvas
 * position -- see LotWorkflowCanvas's buildExecutionGraph for the auto-layout this requires.
 */
export interface LotWorkflowGraph {
  lot_id: number;
  workflow_instance_id: number;
  instance_status: 'created' | 'in_progress' | 'completed';
  template_version_id: number;
  current_node_key?: string;
  nodes: LotWorkflowGraphNode[];
  edges: WorkflowEdge[];
}

export interface LotWorkflowGraphNode extends WorkflowNode {
  status: 'not_started' | 'pending' | 'in_progress' | 'completed' | 'skipped';
  instance?: WorkflowNodeInstance;
}

/** GET /batches/:id/workflow response: the batch's own workflow instance (blend,
 * split_into_lots) plus a summary of every lot instance the fan-out has spawned so far. */
export interface BatchWorkflowDetail {
  instance_id: number;
  status: 'created' | 'in_progress' | 'completed';
  nodes: WorkflowNodeInstance[];
  child_lots: BatchWorkflowChildLot[];
}

export interface BatchWorkflowChildLot {
  lot_id: number;
  lot_number: string;
  instance_id: number;
  status: 'created' | 'in_progress' | 'completed';
  current_node_key?: string;
}

export interface SubmitQualityResultRequest {
  result: 'pass' | 'fail';
  measurements?: Record<string, string | number>;
  notes?: string;
}

export interface Webhook {
  id: number;
  name: string;
  url: string;
  secret?: string;
  events: string[];
  is_active: boolean;
  created_by?: number;
  created_at: string;
  deliveries?: WebhookDelivery[];
}

export interface WebhookDelivery {
  id: number;
  event_type: string;
  http_status?: number;
  attempt: number;
  delivered_at: string;
}

/**
 * GET /attention response item -- the single "what needs a human's attention right now" shape
 * behind the Home task queue and (later) dashboard/notification surfaces. `kind` is
 * "workflow_step" today (an actionable production_step/approval/quality_check current node);
 * later phases add more kinds (low stock, failed webhook deliveries) without changing this
 * shape. `can_act`/`waiting_on_role` are computed server-side from the same role rules the
 * underlying action endpoints already enforce -- never trust this to grant an action the
 * endpoint itself would reject, it's presentation-only.
 */
export interface AttentionItem {
  kind: 'workflow_step';
  entity_type: 'lot' | 'batch';
  lot_id?: number;
  lot_number?: string;
  batch_id?: number;
  batch_number?: string;
  sku_code?: string;
  node_key: string;
  node_type: WorkflowNodeType;
  node_name: string;
  status: 'pending' | 'in_progress';
  waiting_since: string;
  can_act: boolean;
  waiting_on_role?: string;
}

export interface AttentionList {
  items: AttentionItem[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}
