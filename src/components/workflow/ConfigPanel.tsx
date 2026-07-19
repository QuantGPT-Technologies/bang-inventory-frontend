'use client';
import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import {
  useWorkflowEditorStore,
  slugifyNodeKey,
  selectIsReadOnly,
  WorkflowRFEdgeData,
  WorkflowRFNodeData,
} from '@/store/workflowEditorStore';
import { ProductionStepConfig, ApprovalConfig, QualityCheckConfig, ConditionalBranchConfig, WorkflowNodeType } from '@/lib/types';
import {
  productionStepConfigSchema,
  approvalConfigSchema,
  qualityCheckConfigSchema,
  conditionalBranchConfigSchema,
  validate,
  ROLES,
  type FieldErrors,
} from '@/lib/validation';
import { ROLE_LABELS } from '@/lib/utils';

/** Local, editable mirror of a production_step node's config -- kept as a form-friendly shape
 * (allowed_scrap_types as raw comma-separated text while typing) and only pushed into the store
 * once it validates against productionStepConfigSchema. */
interface ProductionStepForm {
  name: string;
  isEntryPoint: boolean;
  isTerminal: boolean;
  inputUnit: string;
  outputUnit: string;
  skippable: boolean;
  creditsStock: boolean;
  scrapTypesText: string;
  defaultScrapUnit: string;
}

/** `commit()`-style handlers in these forms re-validate the WHOLE config on every keystroke (so
 * a valid config can live-sync into the store as soon as it's valid), which means editing one
 * field surfaces "required" errors for every other still-empty field the user hasn't reached yet
 * -- e.g. typing a Name immediately flags empty Input/Output Unit as invalid. Gate error display
 * on a field having been touched (blurred) at least once, so errors only appear once the user has
 * actually visited and left a field empty/invalid, not pre-emptively for the whole form. */
function visibleError(touched: Set<string>, errors: FieldErrors, field: string): string | undefined {
  return touched.has(field) ? errors[field] : undefined;
}

function formFromNode(name: string, config: ProductionStepConfig, isEntryPoint: boolean, isTerminal: boolean): ProductionStepForm {
  return {
    name,
    isEntryPoint,
    isTerminal,
    inputUnit: config.input_unit ?? '',
    outputUnit: config.output_unit ?? '',
    skippable: config.skippable ?? false,
    creditsStock: config.credits_sku_stock_on_complete ?? false,
    scrapTypesText: (config.allowed_scrap_types ?? []).join(', '),
    defaultScrapUnit: config.default_scrap_unit ?? '',
  };
}

export function ConfigPanel() {
  const selectedId = useWorkflowEditorStore((s) => s.selectedId);
  const selectedEdgeId = useWorkflowEditorStore((s) => s.selectedEdgeId);
  const nodes = useWorkflowEditorStore((s) => s.nodes);
  const edges = useWorkflowEditorStore((s) => s.edges);
  const updateNodeConfig = useWorkflowEditorStore((s) => s.updateNodeConfig);
  const updateNodeMeta = useWorkflowEditorStore((s) => s.updateNodeMeta);
  const updateEdgeData = useWorkflowEditorStore((s) => s.updateEdgeData);
  const select = useWorkflowEditorStore((s) => s.select);
  const selectEdge = useWorkflowEditorStore((s) => s.selectEdge);
  const isReadOnly = useWorkflowEditorStore(selectIsReadOnly);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

  const [form, setForm] = useState<ProductionStepForm | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (field: string) => setTouched((prev) => new Set(prev).add(field));

  // Reset the local form whenever the selection changes to a different node -- deliberately not
  // keyed on the node's data itself, since this panel is the thing driving those data changes
  // (keying on data would either fight the user's typing or be a no-op). This uses React's
  // "adjust state during render when a prop changes" pattern (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than an effect, since a setState synchronously inside an effect body is flagged by
  // this repo's react-hooks lint config as causing a needless extra render.
  //
  // prevSelectedId must NOT initialize to `selectedId` itself: the parent only mounts this
  // component when a node is selected (`{selectedId && <ConfigPanel />}`), so on the very first
  // selection after being unmounted, useState(selectedId) would seed prevSelectedId to that same
  // id -- the "did it change" check below would then be false on mount, and `form` would never
  // populate for a freshly-selected production_step node (it stayed permanently null, showing
  // "This node type isn't configurable yet." even for a valid one). `undefined` is a safe
  // sentinel here since selectedId's type (string | null) can never actually be undefined.
  const [prevSelectedId, setPrevSelectedId] = useState<string | null | undefined>(undefined);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (selectedNode && selectedNode.data.node_type === 'production_step') {
      setForm(formFromNode(selectedNode.data.name, selectedNode.data.config as ProductionStepConfig, selectedNode.data.is_entry_point, selectedNode.data.is_terminal));
    } else {
      setForm(null);
    }
    setErrors({});
    setTouched(new Set());
  }

  if (selectedEdge) {
    const sourceNode = nodes.find((n) => n.id === selectedEdge.source);
    return (
      <EdgeConfigForm
        key={selectedEdge.id}
        edgeData={selectedEdge.data ?? { condition_value: null, is_default: false, priority: 0 }}
        sourceNodeType={sourceNode?.data.node_type}
        isReadOnly={isReadOnly}
        onChange={(patch) => updateEdgeData(selectedEdge.id, patch)}
        onClose={() => selectEdge(null)}
      />
    );
  }

  if (!selectedNode) return null;

  if (selectedNode.data.node_type === 'approval') {
    return (
      <ApprovalConfigForm
        key={selectedNode.id}
        data={selectedNode.data}
        isReadOnly={isReadOnly}
        onCommitMeta={(meta) => updateNodeMeta(selectedNode.id, meta)}
        onCommitConfig={(config) => updateNodeConfig(selectedNode.id, config)}
        onClose={() => select(null)}
      />
    );
  }

  if (selectedNode.data.node_type === 'quality_check') {
    return (
      <QualityCheckConfigForm
        key={selectedNode.id}
        data={selectedNode.data}
        isReadOnly={isReadOnly}
        onCommitMeta={(meta) => updateNodeMeta(selectedNode.id, meta)}
        onCommitConfig={(config) => updateNodeConfig(selectedNode.id, config)}
        onClose={() => select(null)}
      />
    );
  }

  if (selectedNode.data.node_type === 'conditional_branch') {
    return (
      <ConditionalBranchConfigForm
        key={selectedNode.id}
        data={selectedNode.data}
        isReadOnly={isReadOnly}
        onCommitMeta={(meta) => updateNodeMeta(selectedNode.id, meta)}
        onCommitConfig={(config) => updateNodeConfig(selectedNode.id, config)}
        onClose={() => select(null)}
      />
    );
  }

  if (selectedNode.data.node_type === 'lot_fanout') {
    return (
      <LotFanoutConfigForm
        key={selectedNode.id}
        data={selectedNode.data}
        isReadOnly={isReadOnly}
        onCommitMeta={(meta) => updateNodeMeta(selectedNode.id, meta)}
        onClose={() => select(null)}
      />
    );
  }

  if (selectedNode.data.node_type !== 'production_step' || !form) {
    return (
      <PanelShell onClose={() => select(null)} title="Node">
        <p className="text-sm text-[var(--ink-muted)]">This node type isn&apos;t configurable yet.</p>
      </PanelShell>
    );
  }

  const nodeId = selectedNode.id;

  function commit(next: ProductionStepForm) {
    setForm(next);
    if (isReadOnly) return;

    updateNodeMeta(nodeId, {
      name: next.name,
      node_key: slugifyNodeKey(next.name),
      is_entry_point: next.isEntryPoint,
      is_terminal: next.isTerminal,
    });

    const candidateConfig = {
      input_unit: next.inputUnit,
      output_unit: next.outputUnit,
      skippable: next.skippable,
      credits_sku_stock_on_complete: next.creditsStock,
      allowed_scrap_types: next.scrapTypesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      default_scrap_unit: next.defaultScrapUnit || undefined,
    };

    const result = validate(productionStepConfigSchema, candidateConfig);
    if (result.success) {
      setErrors({});
      updateNodeConfig(nodeId, result.data as ProductionStepConfig);
    } else {
      setErrors(result.errors);
    }
  }

  return (
    <PanelShell onClose={() => select(null)} title="Production Step" subtitle={slugifyNodeKey(form.name)} readOnly={isReadOnly}>
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          value={form.name}
          onChange={(e) => commit({ ...form, name: e.target.value })}
          maxLength={150}
          disabled={isReadOnly}
        />

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
            <input
              type="checkbox"
              checked={form.isEntryPoint}
              onChange={(e) => commit({ ...form, isEntryPoint: e.target.checked })}
              className="accent-[var(--accent)]"
              disabled={isReadOnly}
            />
            Entry point
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
            <input
              type="checkbox"
              checked={form.isTerminal}
              onChange={(e) => commit({ ...form, isTerminal: e.target.checked })}
              className="accent-[var(--accent)]"
              disabled={isReadOnly}
            />
            Terminal
          </label>
        </div>

        <div className="h-px bg-[var(--border-light)]" />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Input Unit"
            value={form.inputUnit}
            onChange={(e) => commit({ ...form, inputUnit: e.target.value })}
            onBlur={() => touch('input_unit')}
            error={visibleError(touched, errors, 'input_unit')}
            maxLength={20}
            disabled={isReadOnly}
          />
          <Input
            label="Output Unit"
            value={form.outputUnit}
            onChange={(e) => commit({ ...form, outputUnit: e.target.value })}
            onBlur={() => touch('output_unit')}
            error={visibleError(touched, errors, 'output_unit')}
            maxLength={20}
            disabled={isReadOnly}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
          <input
            type="checkbox"
            checked={form.skippable}
            onChange={(e) => commit({ ...form, skippable: e.target.checked })}
            className="accent-[var(--accent)]"
            disabled={isReadOnly}
          />
          Skippable
        </label>

        <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
          <input
            type="checkbox"
            checked={form.creditsStock}
            onChange={(e) => commit({ ...form, creditsStock: e.target.checked })}
            className="accent-[var(--accent)]"
            disabled={isReadOnly}
          />
          Credits SKU stock on complete
        </label>

        <Input
          label="Allowed Scrap Types"
          value={form.scrapTypesText}
          onChange={(e) => commit({ ...form, scrapTypesText: e.target.value })}
          onBlur={() => touch('allowed_scrap_types')}
          error={visibleError(touched, errors, 'allowed_scrap_types')}
          hint="Comma-separated, e.g. handling, setting, visual"
          disabled={isReadOnly}
        />

        <Input
          label="Default Scrap Unit"
          value={form.defaultScrapUnit}
          onChange={(e) => commit({ ...form, defaultScrapUnit: e.target.value })}
          onBlur={() => touch('default_scrap_unit')}
          error={visibleError(touched, errors, 'default_scrap_unit')}
          maxLength={20}
          disabled={isReadOnly}
        />
      </div>
    </PanelShell>
  );
}

/** Shared meta fields (name/entry/terminal) every per-type form below starts with, mirroring
 * ProductionStepForm's equivalents. */
interface NodeMetaForm {
  name: string;
  isEntryPoint: boolean;
  isTerminal: boolean;
}

function NodeMetaFields<T extends NodeMetaForm>({
  form,
  onChange,
  isReadOnly,
}: {
  form: T;
  onChange: (next: T) => void;
  isReadOnly: boolean;
}) {
  return (
    <>
      <Input
        label="Name"
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        maxLength={150}
        disabled={isReadOnly}
      />
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
          <input
            type="checkbox"
            checked={form.isEntryPoint}
            onChange={(e) => onChange({ ...form, isEntryPoint: e.target.checked })}
            className="accent-[var(--accent)]"
            disabled={isReadOnly}
          />
          Entry point
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
          <input
            type="checkbox"
            checked={form.isTerminal}
            onChange={(e) => onChange({ ...form, isTerminal: e.target.checked })}
            className="accent-[var(--accent)]"
            disabled={isReadOnly}
          />
          Terminal
        </label>
      </div>
      <div className="h-px bg-[var(--border-light)]" />
    </>
  );
}

function metaPatch(form: NodeMetaForm) {
  return {
    name: form.name,
    node_key: slugifyNodeKey(form.name),
    is_entry_point: form.isEntryPoint,
    is_terminal: form.isTerminal,
  };
}

// --- Approval config form ---

interface ApprovalForm extends NodeMetaForm {
  requiredRole: string;
}

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r }));

function ApprovalConfigForm({
  data,
  isReadOnly,
  onCommitMeta,
  onCommitConfig,
  onClose,
}: {
  data: WorkflowRFNodeData;
  isReadOnly: boolean;
  onCommitMeta: (meta: ReturnType<typeof metaPatch>) => void;
  onCommitConfig: (config: ApprovalConfig) => void;
  onClose: () => void;
}) {
  const config = data.config as ApprovalConfig;
  const [form, setForm] = useState<ApprovalForm>({
    name: data.name,
    isEntryPoint: data.is_entry_point,
    isTerminal: data.is_terminal,
    requiredRole: config.required_role ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (field: string) => setTouched((prev) => new Set(prev).add(field));

  function commit(next: ApprovalForm) {
    setForm(next);
    if (isReadOnly) return;

    onCommitMeta(metaPatch(next));

    const result = validate(approvalConfigSchema, { required_role: next.requiredRole });
    if (result.success) {
      setErrors({});
      onCommitConfig(result.data);
    } else {
      setErrors(result.errors);
    }
  }

  return (
    <PanelShell onClose={onClose} title="Approval" subtitle={slugifyNodeKey(form.name)} readOnly={isReadOnly}>
      <div className="flex flex-col gap-4">
        <NodeMetaFields form={form} onChange={commit} isReadOnly={isReadOnly} />
        <Select
          label="Required Role"
          value={form.requiredRole}
          onChange={(e) => commit({ ...form, requiredRole: e.target.value })}
          onBlur={() => touch('required_role')}
          options={ROLE_OPTIONS}
          placeholder="Select a role"
          error={visibleError(touched, errors, 'required_role')}
          disabled={isReadOnly}
        />
        <p className="text-xs text-[var(--ink-muted)]">
          Only users with this role (or higher) can approve or reject at this step. Draw an edge from the{' '}
          <span className="font-medium">Approved</span>/<span className="font-medium">Rejected</span> handles on the
          right of the node for each outcome.
        </p>
      </div>
    </PanelShell>
  );
}

// --- Quality check config form ---

interface MeasurementFieldRow {
  rowId: string;
  key: string;
  label: string;
  type: 'number' | 'text';
  required: boolean;
}

interface QualityCheckForm extends NodeMetaForm {
  fields: MeasurementFieldRow[];
}

function newFieldRow(): MeasurementFieldRow {
  return { rowId: crypto.randomUUID(), key: '', label: '', type: 'number', required: false };
}

function QualityCheckConfigForm({
  data,
  isReadOnly,
  onCommitMeta,
  onCommitConfig,
  onClose,
}: {
  data: WorkflowRFNodeData;
  isReadOnly: boolean;
  onCommitMeta: (meta: ReturnType<typeof metaPatch>) => void;
  onCommitConfig: (config: QualityCheckConfig) => void;
  onClose: () => void;
}) {
  const config = data.config as QualityCheckConfig;
  const [form, setForm] = useState<QualityCheckForm>({
    name: data.name,
    isEntryPoint: data.is_entry_point,
    isTerminal: data.is_terminal,
    fields: (config.measurement_fields ?? []).map((f) => ({ rowId: crypto.randomUUID(), ...f })),
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (field: string) => setTouched((prev) => new Set(prev).add(field));

  function commit(next: QualityCheckForm) {
    setForm(next);
    if (isReadOnly) return;

    onCommitMeta(metaPatch(next));

    const candidateConfig = {
      measurement_fields: next.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required })),
    };
    const result = validate(qualityCheckConfigSchema, candidateConfig);
    if (result.success) {
      setErrors({});
      onCommitConfig(result.data);
    } else {
      setErrors(result.errors);
    }
  }

  function updateRow(rowId: string, patch: Partial<MeasurementFieldRow>) {
    commit({ ...form, fields: form.fields.map((f) => (f.rowId === rowId ? { ...f, ...patch } : f)) });
  }

  function removeRow(rowId: string) {
    commit({ ...form, fields: form.fields.filter((f) => f.rowId !== rowId) });
  }

  function addRow() {
    touch('measurement_fields');
    commit({ ...form, fields: [...form.fields, newFieldRow()] });
  }

  return (
    <PanelShell onClose={onClose} title="Quality Check" subtitle={slugifyNodeKey(form.name)} readOnly={isReadOnly}>
      <div className="flex flex-col gap-4">
        <NodeMetaFields form={form} onChange={commit} isReadOnly={isReadOnly} />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--ink-light)] uppercase tracking-wide">Measurement Fields</span>
            {!isReadOnly && (
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
              >
                <Plus size={12} /> Add field
              </button>
            )}
          </div>
          {visibleError(touched, errors, 'measurement_fields') && (
            <p className="text-xs text-red-600">{visibleError(touched, errors, 'measurement_fields')}</p>
          )}

          {form.fields.length === 0 && (
            <p className="text-xs text-[var(--ink-muted)]">No measurement fields yet.</p>
          )}

          <div className="flex flex-col gap-3">
            {form.fields.map((f, i) => (
              <div key={f.rowId} className="rounded-md border border-[var(--border-light)] p-2 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Key"
                    value={f.key}
                    onChange={(e) => updateRow(f.rowId, { key: e.target.value })}
                    onBlur={() => touch(`measurement_fields.${i}.key`)}
                    error={visibleError(touched, errors, `measurement_fields.${i}.key`)}
                    maxLength={100}
                    disabled={isReadOnly}
                  />
                  <Input
                    label="Label"
                    value={f.label}
                    onChange={(e) => updateRow(f.rowId, { label: e.target.value })}
                    onBlur={() => touch(`measurement_fields.${i}.label`)}
                    error={visibleError(touched, errors, `measurement_fields.${i}.label`)}
                    maxLength={150}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Select
                    label="Type"
                    value={f.type}
                    onChange={(e) => updateRow(f.rowId, { type: e.target.value as 'number' | 'text' })}
                    options={[
                      { value: 'number', label: 'Number' },
                      { value: 'text', label: 'Text' },
                    ]}
                    className="flex-1"
                    disabled={isReadOnly}
                  />
                  <label className="flex items-center gap-1.5 text-sm text-[var(--ink)] pb-2">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => updateRow(f.rowId, { required: e.target.checked })}
                      className="accent-[var(--accent)]"
                      disabled={isReadOnly}
                    />
                    Required
                  </label>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => removeRow(f.rowId)}
                      className="text-[var(--ink-muted)] hover:text-red-600 transition-colors pb-2"
                      title="Remove field"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-[var(--ink-muted)]">
          Draw an edge from the <span className="font-medium">Pass</span>/<span className="font-medium">Fail</span>{' '}
          handles on the right of the node for each outcome.
        </p>
      </div>
    </PanelShell>
  );
}

// --- Conditional branch config form ---

type SourceFieldOption = 'outcome' | 'actual_output_qty' | 'custom';

interface ConditionalBranchForm extends NodeMetaForm {
  sourceFieldOption: SourceFieldOption;
  customField: string;
  operator: ConditionalBranchConfig['operator'];
  threshold: string;
}

function parseSourceField(sourceField: ConditionalBranchConfig['source_field'] | undefined): { option: SourceFieldOption; custom: string } {
  if (sourceField === 'outcome' || sourceField === 'actual_output_qty') return { option: sourceField, custom: '' };
  if (sourceField?.startsWith('data.')) return { option: 'custom', custom: sourceField.slice('data.'.length) };
  return { option: 'outcome', custom: '' };
}

function ConditionalBranchConfigForm({
  data,
  isReadOnly,
  onCommitMeta,
  onCommitConfig,
  onClose,
}: {
  data: WorkflowRFNodeData;
  isReadOnly: boolean;
  onCommitMeta: (meta: ReturnType<typeof metaPatch>) => void;
  onCommitConfig: (config: ConditionalBranchConfig) => void;
  onClose: () => void;
}) {
  const config = data.config as ConditionalBranchConfig;
  const parsed = parseSourceField(config.source_field);
  const [form, setForm] = useState<ConditionalBranchForm>({
    name: data.name,
    isEntryPoint: data.is_entry_point,
    isTerminal: data.is_terminal,
    sourceFieldOption: parsed.option,
    customField: parsed.custom,
    operator: config.operator ?? 'equals',
    threshold: config.threshold != null ? String(config.threshold) : '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (field: string) => setTouched((prev) => new Set(prev).add(field));

  const operatorLocked = form.sourceFieldOption === 'outcome';

  function commit(next: ConditionalBranchForm) {
    // `equals` only makes sense for source_field === 'outcome'; the numeric comparators only
    // make sense otherwise -- keep the operator in sync when the source field type changes so
    // the user can't submit an invalid combination.
    if (next.sourceFieldOption === 'outcome' && next.operator !== 'equals') {
      next = { ...next, operator: 'equals' };
    } else if (next.sourceFieldOption !== 'outcome' && next.operator === 'equals') {
      next = { ...next, operator: 'gte' };
    }

    setForm(next);
    if (isReadOnly) return;

    onCommitMeta(metaPatch(next));

    const sourceField: ConditionalBranchConfig['source_field'] =
      next.sourceFieldOption === 'custom' ? `data.${next.customField.trim()}` : next.sourceFieldOption;

    const candidateConfig = {
      source_field: sourceField,
      operator: next.operator,
      threshold: next.operator === 'equals' || next.threshold === '' ? undefined : Number(next.threshold),
    };
    const result = validate(conditionalBranchConfigSchema, candidateConfig);
    if (result.success) {
      setErrors({});
      // conditionalBranchConfigSchema validates source_field with a .refine() (not a literal
      // union), so its inferred output type is plain `string` -- narrower at runtime (the refine
      // enforces the same 'outcome' | 'actual_output_qty' | 'data.<key>' shape) than TS can see.
      onCommitConfig(result.data as ConditionalBranchConfig);
    } else {
      setErrors(result.errors);
    }
  }

  return (
    <PanelShell onClose={onClose} title="Conditional Branch" subtitle={slugifyNodeKey(form.name)} readOnly={isReadOnly}>
      <div className="flex flex-col gap-4">
        <NodeMetaFields form={form} onChange={commit} isReadOnly={isReadOnly} />

        <Select
          label="Source Field"
          value={form.sourceFieldOption}
          onChange={(e) => commit({ ...form, sourceFieldOption: e.target.value as SourceFieldOption })}
          options={[
            { value: 'outcome', label: "Preceding node's outcome" },
            { value: 'actual_output_qty', label: 'Actual output quantity' },
            { value: 'custom', label: 'Custom data field (data.<key>)' },
          ]}
          disabled={isReadOnly}
        />

        {form.sourceFieldOption === 'custom' && (
          <Input
            label="Data Field Key"
            value={form.customField}
            onChange={(e) => commit({ ...form, customField: e.target.value })}
            onBlur={() => touch('source_field')}
            hint="Resolves to data.<key>, e.g. a quality_check measurement key"
            error={visibleError(touched, errors, 'source_field')}
            disabled={isReadOnly}
          />
        )}
        {form.sourceFieldOption !== 'custom' && visibleError(touched, errors, 'source_field') && (
          <p className="text-xs text-red-600 -mt-2">{visibleError(touched, errors, 'source_field')}</p>
        )}

        <Select
          label="Operator"
          value={form.operator}
          onChange={(e) => commit({ ...form, operator: e.target.value as ConditionalBranchConfig['operator'] })}
          options={
            operatorLocked
              ? [{ value: 'equals', label: 'Equals' }]
              : [
                  { value: 'gte', label: '>=' },
                  { value: 'lte', label: '<=' },
                  { value: 'gt', label: '>' },
                  { value: 'lt', label: '<' },
                ]
          }
          onBlur={() => touch('operator')}
          error={visibleError(touched, errors, 'operator')}
          disabled={isReadOnly || operatorLocked}
          hint={operatorLocked ? "Outcome-based branches always compare with 'equals'." : undefined}
        />

        {form.operator !== 'equals' && (
          <Input
            label="Threshold"
            type="number"
            value={form.threshold}
            onChange={(e) => commit({ ...form, threshold: e.target.value })}
            onBlur={() => touch('threshold')}
            error={visibleError(touched, errors, 'threshold')}
            disabled={isReadOnly}
          />
        )}

        <p className="text-xs text-[var(--ink-muted)]">
          Each outgoing edge routes on the value this node resolves to. Select an edge to set its match value, or
          drag a new one from the <span className="font-medium">+ New</span> handle.
        </p>
      </div>
    </PanelShell>
  );
}

// --- Lot fanout config form ---
// No config fields (LotFanoutConfig is always `{}`) -- only the shared meta fields (name/entry/
// terminal) are editable here, mirroring how ApprovalConfigForm etc. handle them.

function LotFanoutConfigForm({
  data,
  isReadOnly,
  onCommitMeta,
  onClose,
}: {
  data: WorkflowRFNodeData;
  isReadOnly: boolean;
  onCommitMeta: (meta: ReturnType<typeof metaPatch>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<NodeMetaForm>({
    name: data.name,
    isEntryPoint: data.is_entry_point,
    isTerminal: data.is_terminal,
  });

  function commit(next: NodeMetaForm) {
    setForm(next);
    if (isReadOnly) return;
    onCommitMeta(metaPatch(next));
  }

  return (
    <PanelShell onClose={onClose} title="Split into Lots" subtitle={slugifyNodeKey(form.name)} readOnly={isReadOnly}>
      <div className="flex flex-col gap-4">
        <NodeMetaFields form={form} onChange={commit} isReadOnly={isReadOnly} />
        <p className="text-xs text-[var(--ink-muted)]">
          This step splits the blended batch into lots. Each lot created here starts its own lot-level workflow.
        </p>
      </div>
    </PanelShell>
  );
}

// --- Edge (connection) config form ---

function EdgeConfigForm({
  edgeData,
  sourceNodeType,
  isReadOnly,
  onChange,
  onClose,
}: {
  edgeData: WorkflowRFEdgeData;
  sourceNodeType: WorkflowNodeType | undefined;
  isReadOnly: boolean;
  onChange: (patch: Partial<WorkflowRFEdgeData>) => void;
  onClose: () => void;
}) {
  const [conditionValue, setConditionValue] = useState(edgeData.condition_value ?? '');
  const [isDefault, setIsDefault] = useState(edgeData.is_default);

  const needsConfig = sourceNodeType === 'approval' || sourceNodeType === 'quality_check' || sourceNodeType === 'conditional_branch';
  // approval/quality_check condition_value is fixed by which handle the edge was drawn from
  // (approved/rejected, pass/fail) -- only conditional_branch's is free text.
  const conditionEditable = sourceNodeType === 'conditional_branch';

  function commitDefault(next: boolean) {
    setIsDefault(next);
    if (isReadOnly) return;
    // A default/fallback edge is matched regardless of condition_value, so clear it on
    // conditional_branch edges to avoid implying it also needs to match a specific value.
    const patch: Partial<WorkflowRFEdgeData> = { is_default: next };
    if (next && conditionEditable) {
      setConditionValue('');
      patch.condition_value = null;
    }
    onChange(patch);
  }

  function commitConditionValue(next: string) {
    setConditionValue(next);
    if (isReadOnly) return;
    onChange({ condition_value: next.trim() || null });
  }

  return (
    <PanelShell onClose={onClose} title="Connection" readOnly={isReadOnly}>
      <div className="flex flex-col gap-4">
        {!needsConfig ? (
          <p className="text-sm text-[var(--ink-muted)]">
            This connection doesn&apos;t need configuration -- {sourceNodeType ?? 'this'} nodes have a single
            unconditional outgoing edge.
          </p>
        ) : (
          <>
            <Input
              label="Condition Value"
              value={conditionValue}
              onChange={(e) => commitConditionValue(e.target.value)}
              disabled={isReadOnly || !conditionEditable || isDefault}
              hint={
                conditionEditable
                  ? 'The value this node must resolve to for this edge to be taken'
                  : 'Set automatically by the handle this edge was drawn from'
              }
            />
            <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => commitDefault(e.target.checked)}
                className="accent-[var(--accent)]"
                disabled={isReadOnly}
              />
              Default / fallback edge
            </label>
            <p className="text-xs text-[var(--ink-muted)]">
              Exactly one outgoing edge on this node must be marked default -- it&apos;s taken when no other edge&apos;s
              condition value matches.
            </p>
          </>
        )}
      </div>
    </PanelShell>
  );
}

function PanelShell({
  title,
  subtitle,
  onClose,
  readOnly,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  readOnly?: boolean;
  children: React.ReactNode;
}) {
  return (
    <aside className="w-80 flex-shrink-0 border-l border-[var(--border-light)] bg-[var(--paper)] overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
          {subtitle && <p className="text-xs text-[var(--ink-muted)] font-mono mt-0.5">{subtitle}</p>}
          {readOnly && <p className="text-xs text-[var(--gold)] mt-0.5">Published -- read only</p>}
        </div>
        <button onClick={onClose} className="text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors">
          <X size={16} />
        </button>
      </div>
      {children}
    </aside>
  );
}
