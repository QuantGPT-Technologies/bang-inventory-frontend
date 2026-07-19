'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Badge, stepStatusBadge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { lotsApi } from '@/lib/api';
import { Lot, LotStep, Consumable } from '@/lib/types';
import { formatDateTime, formatQty, getNodeLabel, STEP_SCRAP_TYPES, SKIPPABLE_STEPS, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { startStepSchema, completeStepSchema, overrideStepSchema, scrapSchema, consumableUsageSchema, validate, toNumber, INTEGER_UNITS, type FieldErrors } from '@/lib/validation';
import { DL } from '@/components/lots/DL';

/** Discrete-count units (e.g. "pcs") only accept whole numbers; everything else allows 3 decimals. */
function qtyStepAttr(unit?: string): string {
  return unit && INTEGER_UNITS.has(unit) ? '1' : '0.001';
}

function qtyPlaceholder(unit?: string): string {
  return unit && INTEGER_UNITS.has(unit) ? '0' : '0.000';
}

export type ProductionActionType = 'start' | 'complete' | 'skip' | 'override' | 'analytics' | 'scrap' | 'consumable';

/**
 * Action modal for `production_step` nodes only -- start/complete/skip/scrap/consumable/
 * override/analytics. Generalized off `nodeKey` (a workflow node's `node_key`, e.g.
 * "compaction" or a custom template's "step1") rather than the old fixed `StepName` union, since
 * the workflow-driven lot detail page no longer assumes a fixed 6-step pipeline.
 *
 * approval/quality_check nodes use their own standalone modals (ApprovalActionModal /
 * QualityCheckActionModal) -- they don't share this component because reject requires a
 * mandatory reason with different button semantics/danger styling than anything here.
 */
export function ProductionStepActionModal({
  lot,
  actionType,
  nodeKey,
  consumables,
  onClose,
  onDone,
}: {
  lot: Lot;
  actionType: ProductionActionType | string;
  nodeKey: string;
  consumables: Consumable[];
  onClose: () => void;
  onDone: () => void;
}) {
  const currentStep = lot.steps?.find((s) => s.node_key === nodeKey);
  const label = getNodeLabel(nodeKey);

  const [startMachineName, setStartMachineName] = useState('');
  const [inputQty, setInputQty] = useState(String(currentStep?.expected_input_qty ?? ''));
  const [outputQty, setOutputQty] = useState(String(currentStep?.expected_output_qty ?? ''));
  const [machineName, setMachineName] = useState(currentStep?.machine_name ?? '');
  const [notes, setNotes] = useState('');
  const [overrideInputQty, setOverrideInputQty] = useState(String(currentStep?.actual_input_qty ?? ''));
  const [overrideOutputQty, setOverrideOutputQty] = useState(String(currentStep?.actual_output_qty ?? ''));
  // Intentionally starts blank (not prefilled from currentStep.notes) — it's the mandatory
  // reason for *this* override, not a continuation of the step's original completion notes.
  const [overrideNotes, setOverrideNotes] = useState('');
  const [scrapType, setScrapType] = useState('');
  const [scrapQty, setScrapQty] = useState('');
  const [scrapUnit, setScrapUnit] = useState('kg');
  const [consumableId, setConsumableId] = useState<number>(0);
  const [consumableQty, setConsumableQty] = useState('');
  const [consumableUnit, setConsumableUnit] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [analytics, setAnalytics] = useState<LotStep | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const scrapTypes = STEP_SCRAP_TYPES[nodeKey] || [];
  const noConsumablesAvailable = consumables.length === 0;
  const selectedConsumable = consumables.find((c) => c.id === consumableId);

  const titles: Record<string, string> = {
    start: `Start ${label}`,
    complete: `Complete ${label}`,
    skip: `Skip ${label}`,
    override: `Override — ${label}`,
    analytics: `Step Detail — ${label}`,
    scrap: `Record Scrap — ${label}`,
    consumable: `Record Consumable Usage`,
  };

  useEffect(() => {
    if (actionType !== 'analytics') return;
    let cancelled = false;
    (async () => {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      try {
        const res = await lotsApi.getAnalytics(lot.id, nodeKey);
        if (!cancelled) setAnalytics(res.data?.data ?? null);
      } catch (err) {
        if (!cancelled) setAnalyticsError(parseApiError(err).message);
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actionType, lot.id, nodeKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    try {
      switch (actionType) {
        case 'start': {
          const result = validate(startStepSchema, { machine_name: startMachineName });
          if (!result.success) {
            setErrors(result.errors);
            toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
            return;
          }
          setErrors({});
          setLoading(true);
          await lotsApi.startStep(lot.id, nodeKey, { machine_name: result.data.machine_name || undefined });
          toast.success('Step started');
          onDone();
          break;
        }
        case 'complete': {
          const payload = {
            actual_input_qty: toNumber(inputQty),
            actual_output_qty: toNumber(outputQty),
            machine_name: machineName,
            notes,
          };
          const result = validate(completeStepSchema(currentStep?.input_unit, currentStep?.output_unit), payload);
          if (!result.success) {
            setErrors(result.errors);
            toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
            return;
          }
          setErrors({});
          setLoading(true);
          await lotsApi.completeStep(lot.id, nodeKey, {
            actual_input_qty: result.data.actual_input_qty,
            actual_output_qty: result.data.actual_output_qty,
            machine_name: result.data.machine_name || undefined,
            notes: result.data.notes || undefined,
          });
          toast.success('Step completed');
          onDone();
          break;
        }
        case 'skip': {
          if (!SKIPPABLE_STEPS[nodeKey]) {
            toast.error(`The ${label} step cannot be skipped.`);
            return;
          }
          setLoading(true);
          await lotsApi.skipStep(lot.id, nodeKey);
          toast.success('Step skipped');
          onDone();
          break;
        }
        case 'override': {
          const payload = {
            actual_input_qty: overrideInputQty !== '' ? toNumber(overrideInputQty) : undefined,
            actual_output_qty: overrideOutputQty !== '' ? toNumber(overrideOutputQty) : undefined,
            notes: overrideNotes,
          };
          const result = validate(overrideStepSchema(currentStep?.input_unit, currentStep?.output_unit), payload);
          if (!result.success) {
            setErrors(result.errors);
            toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
            return;
          }
          setErrors({});
          setLoading(true);
          await lotsApi.updateStep(lot.id, nodeKey, result.data);
          toast.success('Step updated');
          onDone();
          break;
        }
        case 'analytics': {
          // Read-only view; nothing to submit.
          onClose();
          break;
        }
        case 'scrap': {
          const schema = scrapSchema(nodeKey, scrapUnit);
          const payload = { scrap_type: scrapType, quantity: toNumber(scrapQty), unit: scrapUnit, notes };
          const result = validate(schema, payload);
          if (!result.success) {
            setErrors(result.errors);
            toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
            return;
          }
          setErrors({});
          setLoading(true);
          await lotsApi.recordScrap(lot.id, nodeKey, {
            scrap_type: result.data.scrap_type,
            quantity: result.data.quantity,
            unit: result.data.unit || undefined,
            notes: result.data.notes || undefined,
          });
          toast.success('Scrap recorded');
          onDone();
          break;
        }
        case 'consumable': {
          if (noConsumablesAvailable) {
            toast.error('No consumables are configured. Create one under Consumables first.');
            return;
          }
          const payload = { consumable_id: consumableId, quantity: toNumber(consumableQty), unit: consumableUnit || selectedConsumable?.unit || '' };
          const result = validate(consumableUsageSchema, payload);
          if (!result.success) {
            setErrors(result.errors);
            toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
            return;
          }
          if (selectedConsumable && result.data.quantity > selectedConsumable.current_stock) {
            setErrors({ quantity: `Only ${formatQty(selectedConsumable.current_stock, selectedConsumable.unit)} in stock` });
            toast.error('Requested quantity exceeds available stock.');
            return;
          }
          setErrors({});
          setLoading(true);
          await lotsApi.recordConsumable(lot.id, nodeKey, result.data);
          toast.success('Consumable usage recorded');
          onDone();
          break;
        }
      }
    } catch (err) {
      const info = parseApiError(err);
      toast.error(info.message);
      if (info.isConflict || info.isNotFound) onDone();
      if (info.fieldErrors) setErrors((prev) => ({ ...prev, ...info.fieldErrors }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={titles[actionType] || 'Confirm'} size={actionType === 'analytics' ? 'xl' : 'sm'}
      footer={
        actionType === 'analytics' ? (
          <Button variant="ghost" onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>Confirm</Button>
          </>
        )
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {actionType === 'complete' && (
          <>
            <Input label={`Actual Input Qty (${currentStep?.input_unit || lot.unit || 'unit'})`} type="number" step={qtyStepAttr(currentStep?.input_unit)} min="0" value={inputQty} onChange={(e) => setInputQty(e.target.value)} error={errors.actual_input_qty} placeholder={qtyPlaceholder(currentStep?.input_unit)} />
            <Input label={`Actual Output Qty (${currentStep?.output_unit || lot.unit || 'unit'})`} type="number" step={qtyStepAttr(currentStep?.output_unit)} min="0" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} error={errors.actual_output_qty} placeholder={qtyPlaceholder(currentStep?.output_unit)} />
            <Input label="Machine Name" value={machineName} onChange={(e) => setMachineName(e.target.value)} placeholder="Press-A1" maxLength={100} />
            <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
          </>
        )}
        {actionType === 'start' && (
          <>
            <p className="text-sm text-[var(--ink-muted)] mb-3">
              Start the <strong>{label}</strong> step for lot <strong>{lot.lot_number}</strong>?
            </p>
            <Input label="Machine Name (optional)" value={startMachineName} onChange={(e) => setStartMachineName(e.target.value)} error={errors.machine_name} placeholder="Press-A1" maxLength={100} />
          </>
        )}
        {actionType === 'skip' && (
          <p className="text-sm text-[var(--ink-muted)]">
            Skip the <strong>{label}</strong> step for lot <strong>{lot.lot_number}</strong>? This cannot be undone.
          </p>
        )}
        {actionType === 'override' && (
          <>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-1">
              This overwrites the recorded quantities for a completed step. Leave a quantity field blank to keep its current value. A reason is required.
            </p>
            <Input label={`Actual Input Qty (${currentStep?.input_unit || lot.unit || 'unit'})`} type="number" step={qtyStepAttr(currentStep?.input_unit)} min="0" value={overrideInputQty} onChange={(e) => setOverrideInputQty(e.target.value)} error={errors.actual_input_qty} placeholder={qtyPlaceholder(currentStep?.input_unit)} />
            <Input label={`Actual Output Qty (${currentStep?.output_unit || lot.unit || 'unit'})`} type="number" step={qtyStepAttr(currentStep?.output_unit)} min="0" value={overrideOutputQty} onChange={(e) => setOverrideOutputQty(e.target.value)} error={errors.actual_output_qty} placeholder={qtyPlaceholder(currentStep?.output_unit)} />
            <Textarea label="Reason for Change" value={overrideNotes} onChange={(e) => setOverrideNotes(e.target.value)} error={errors.notes} rows={2} maxLength={1000} placeholder="e.g. Corrected after physical recount" />
          </>
        )}
        {actionType === 'analytics' && (
          <ProductionStepAnalyticsView loading={analyticsLoading} error={analyticsError} data={analytics} />
        )}
        {actionType === 'scrap' && (
          <>
            {scrapTypes.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                The {label} step does not allow scrap entries.
              </p>
            ) : (
              <>
                <Select
                  label="Scrap Type"
                  options={scrapTypes.map((t) => ({ value: t, label: t.replace('_', ' ') }))}
                  value={scrapType}
                  onChange={(e) => setScrapType(e.target.value)}
                  placeholder="Select type…"
                  error={errors.scrap_type}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Quantity" type="number" step={qtyStepAttr(scrapUnit)} min="0" value={scrapQty} onChange={(e) => setScrapQty(e.target.value)} error={errors.quantity} />
                  <Select label="Unit" options={[{ value: 'kg', label: 'kg' }, { value: 'pcs', label: 'pcs' }, { value: 'g', label: 'g' }]} value={scrapUnit} onChange={(e) => setScrapUnit(e.target.value)} placeholder="" />
                </div>
                <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
              </>
            )}
          </>
        )}
        {actionType === 'consumable' && (
          <>
            {noConsumablesAvailable ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                No consumables are configured yet.
              </p>
            ) : (
              <>
                <Select
                  label="Consumable"
                  options={consumables.map((c) => ({ value: c.id, label: `${c.name} (${c.unit}) — ${c.current_stock} in stock` }))}
                  value={consumableId || ''}
                  onChange={(e) => setConsumableId(Number(e.target.value))}
                  placeholder="Select consumable…"
                  error={errors.consumable_id}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Quantity"
                    type="number" step="0.001" min="0"
                    value={consumableQty}
                    onChange={(e) => setConsumableQty(e.target.value)}
                    error={errors.quantity}
                    hint={selectedConsumable ? `${formatQty(selectedConsumable.current_stock, selectedConsumable.unit)} in stock` : undefined}
                  />
                  <Input
                    label="Unit"
                    value={consumableUnit}
                    onChange={(e) => setConsumableUnit(e.target.value)}
                    error={errors.unit}
                    placeholder={selectedConsumable?.unit || 'unit'}
                  />
                </div>
              </>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{title}</h4>
      {children}
    </div>
  );
}

function ProductionStepAnalyticsView({ loading, error, data }: { loading: boolean; error: string | null; data: LotStep | null }) {
  const { user } = useAuthStore();
  // Only the roles that can actually perform an override (see `canOverride` above) get to
  // see who corrected a step and why — the backend also strips this for other roles, so
  // this just avoids showing a misleading "no corrections" empty state to everyone else.
  const canViewOverrideHistory = canAccess(user, 'lots', 'override');

  if (loading) return <p className="text-sm text-[var(--ink-muted)] text-center py-4">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-[var(--ink-muted)] italic">No detail available for this step yet.</p>;

  const v = data.variance;

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      <DetailSection title="Overview">
        <dl className="space-y-1.5 text-sm">
          <DL label="Status"><Badge variant={stepStatusBadge(data.status)}>{data.status}</Badge></DL>
          {data.machine_name && <DL label="Machine">{data.machine_name}</DL>}
          {data.operator_name && <DL label="Operator">{data.operator_name}</DL>}
          <DL label="Started">{formatDateTime(data.started_at ?? undefined)}</DL>
          <DL label="Completed">{formatDateTime(data.completed_at ?? undefined)}</DL>
          {data.notes && <DL label="Notes">{data.notes}</DL>}
        </dl>
      </DetailSection>

      <DetailSection title="Quantities">
        <dl className="space-y-1.5 text-sm">
          <DL label="Expected Input">{formatQty(data.expected_input_qty ?? undefined, data.input_unit)}</DL>
          <DL label="Actual Input">{formatQty(data.actual_input_qty ?? undefined, data.input_unit)}</DL>
          <DL label="Expected Output">{formatQty(data.expected_output_qty ?? undefined, data.output_unit)}</DL>
          <DL label="Actual Output">{formatQty(data.actual_output_qty ?? undefined, data.output_unit)}</DL>
          {v && (
            <>
              <DL label="Input Variance">{v.input_diff.toFixed(3)} ({v.input_diff_pct.toFixed(1)}%)</DL>
              <DL label="Output Variance">{v.output_diff.toFixed(3)} ({v.output_diff_pct.toFixed(1)}%)</DL>
              <DL label="Yield">{v.yield_pct.toFixed(1)}%</DL>
              <DL label="Total Scrap">{formatQty(v.total_scrap, v.scrap_unit)}</DL>
            </>
          )}
        </dl>
      </DetailSection>

      <DetailSection title={`Scrap Entries${data.scrap_entries?.length ? ` (${data.scrap_entries.length})` : ''}`}>
        {!data.scrap_entries?.length ? (
          <p className="text-sm text-[var(--ink-muted)] italic">No scrap recorded for this step.</p>
        ) : (
          <div className="border border-[var(--border-light)] rounded-md divide-y divide-[var(--border-light)]">
            {data.scrap_entries.map((se) => (
              <div key={se.id} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{se.scrap_type.replace('_', ' ')}</span>
                  <span className="text-[var(--ink-muted)]"> — {formatQty(se.quantity, se.unit)}</span>
                  {se.notes && <p className="text-xs text-[var(--ink-muted)]">{se.notes}</p>}
                </div>
                <div className="text-right text-xs text-[var(--ink-muted)] flex-shrink-0">
                  {se.recorded_by_name && <div>{se.recorded_by_name}</div>}
                  <div>{formatDateTime(se.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title={`Consumables Used${data.consumable_usages?.length ? ` (${data.consumable_usages.length})` : ''}`}>
        {!data.consumable_usages?.length ? (
          <p className="text-sm text-[var(--ink-muted)] italic">No consumables recorded for this step.</p>
        ) : (
          <div className="border border-[var(--border-light)] rounded-md divide-y divide-[var(--border-light)]">
            {data.consumable_usages.map((cu) => (
              <div key={cu.id} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                <span className="font-medium">{cu.consumable_name}</span>
                <div className="text-right text-xs text-[var(--ink-muted)] flex-shrink-0">
                  <div className="text-sm text-[var(--ink)] font-mono">{formatQty(cu.quantity, cu.unit)}</div>
                  <div>{formatDateTime(cu.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      {canViewOverrideHistory && (
        <DetailSection title={`Override History${data.override_history?.length ? ` (${data.override_history.length})` : ''}`}>
          {!data.override_history?.length ? (
            <p className="text-sm text-[var(--ink-muted)] italic">No manual corrections have been made to this step.</p>
          ) : (
            <div className="border border-[var(--border-light)] rounded-md divide-y divide-[var(--border-light)]">
              {data.override_history.map((o) => (
                <div key={o.id} className="px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--ink-muted)]">
                      {o.changed_by_name || 'Unknown'} · {formatDateTime(o.created_at)}
                    </span>
                  </div>
                  {(o.previous_input_qty != null || o.new_input_qty != null) && (
                    <div className="text-xs">
                      Input: <span className="font-mono">{o.previous_input_qty ?? '—'}</span> → <span className="font-mono font-semibold">{o.new_input_qty ?? '—'}</span> {data.input_unit}
                    </div>
                  )}
                  {(o.previous_output_qty != null || o.new_output_qty != null) && (
                    <div className="text-xs">
                      Output: <span className="font-mono">{o.previous_output_qty ?? '—'}</span> → <span className="font-mono font-semibold">{o.new_output_qty ?? '—'}</span> {data.output_unit}
                    </div>
                  )}
                  <div className="text-xs text-[var(--ink-muted)] italic">Reason: {o.reason}</div>
                </div>
              ))}
            </div>
          )}
        </DetailSection>
      )}
    </div>
  );
}
