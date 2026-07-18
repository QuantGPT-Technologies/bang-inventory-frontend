'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, stepStatusBadge, lotStatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ErrorState } from '@/components/ui/ErrorState';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { lotsApi, consumablesApi } from '@/lib/api';
import { Lot, StepName, Consumable, StepVariance } from '@/lib/types';
import { formatDateTime, formatQty, STEP_ORDER, STEP_LABELS, STEP_SCRAP_TYPES, SKIPPABLE_STEPS, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { startStepSchema, completeStepSchema, overrideStepSchema, scrapSchema, consumableUsageSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { Play, CheckCircle, SkipForward, AlertTriangle, Package, Pencil, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LotDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [actionModal, setActionModal] = useState<{ type: string; step: StepName } | null>(null);
  const [consumables, setConsumables] = useState<Consumable[]>([]);

  const idParam = params?.id;
  const lotId = Number(idParam);
  const idIsValid = idParam != null && idParam !== '' && Number.isInteger(lotId) && lotId > 0;

  const fetchLot = useCallback(async () => {
    if (!idIsValid) return null;
    const res = await lotsApi.get(lotId);
    return res.data?.data ?? null;
  }, [lotId, idIsValid]);

  const { data: lot, loading, error, reload } = useAsyncQuery<Lot | null>(fetchLot, [lotId, idIsValid], null);

  useEffect(() => {
    if (error && !error.isNotFound) toast.error(error.message);
  }, [error]);

  useEffect(() => {
    consumablesApi.list(1, 100).then((r) => setConsumables(r.data.data?.items || [])).catch(() => {
      toast.error('Failed to load consumables list.');
    });
  }, []);

  if (!idIsValid) {
    return (
      <AppShell>
        <ErrorState error={{ message: 'Invalid lot reference.', isNetworkError: false, isValidationError: false, isAuthError: false, isForbidden: false, isNotFound: true, isConflict: false, isServerError: false }} />
      </AppShell>
    );
  }

  if (loading) return <AppShell><div className="p-8 text-center text-[var(--ink-muted)]">Loading…</div></AppShell>;
  if (error) return <AppShell><ErrorState error={error} onRetry={error.isNotFound ? undefined : reload} /></AppShell>;
  if (!lot) return <AppShell><div className="p-8 text-center text-[var(--ink-muted)]">Lot not found.</div></AppShell>;

  const canStep = canAccess(user, 'lots', 'step');
  const canSkip = canAccess(user, 'lots', 'skip');
  const canOverride = canAccess(user, 'lots', 'override');
  const canAnalytics = canAccess(user, 'lots', 'analytics');
  const canScrap = canAccess(user, 'lots', 'scrap');
  const canConsumable = canAccess(user, 'lots', 'consumable');

  const getStepByName = (name: string) => lot.steps?.find((s) => s.step_name === name);

  /** A step can be started only if every prior step in STEP_ORDER is completed or skipped. */
  const isStepUnlocked = (idx: number): boolean => {
    for (let i = 0; i < idx; i++) {
      const prior = getStepByName(STEP_ORDER[i]);
      if (!prior || (prior.status !== 'completed' && prior.status !== 'skipped')) return false;
    }
    return true;
  };

  const lotIsTerminal = lot.status === 'completed';

  return (
    <AppShell>
      <PageHeader
        title={`Lot ${lot.lot_number}`}
        breadcrumb={[
          { label: 'Lots', href: '/lots' },
          { label: lot.lot_number },
        ]}
        action={
          <Badge variant={lotStatusBadge(lot.status)} className="text-sm px-3 py-1">
            {lot.status}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Info */}
        <Card title="Lot Details">
          <dl className="space-y-3 text-sm">
            <DL label="Lot Number"><span className="font-mono font-semibold">{lot.lot_number}</span></DL>
            <DL label="Batch"><span className="font-mono text-[var(--accent)]">{lot.batch_number || `#${lot.batch_id}`}</span></DL>
            <DL label="SKU">{lot.sku_code || `#${lot.sku_id}`}</DL>
            <DL label="Quantity">{formatQty(lot.quantity, lot.unit)}</DL>
            {lot.current_step && <DL label="Current Step">{STEP_LABELS[lot.current_step]}</DL>}
            <DL label="Created">{formatDateTime(lot.created_at)}</DL>
          </dl>
        </Card>

        {/* Pipeline */}
        <Card title="Production Pipeline" className="lg:col-span-2">
          {lotIsTerminal && (
            <div className="mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              This lot has completed all production steps.
            </div>
          )}
          <div className="space-y-2">
            {STEP_ORDER.map((stepName, idx) => {
              const step = getStepByName(stepName);
              const status = step?.status || 'pending';
              const isOptional = !!SKIPPABLE_STEPS[stepName];
              const unlocked = isStepUnlocked(idx);
              const hasScrapTypes = (STEP_SCRAP_TYPES[stepName] || []).length > 0;

              return (
                <div
                  key={stepName}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-3 border transition-colors',
                    status === 'completed' && 'bg-green-50 border-green-200',
                    status === 'in_progress' && 'bg-blue-50 border-blue-200',
                    status === 'skipped' && 'bg-amber-50 border-amber-200',
                    status === 'pending' && 'bg-[var(--paper-dark)] border-[var(--border-light)]',
                  )}
                >
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                    status === 'completed' && 'bg-green-600 text-white',
                    status === 'in_progress' && 'bg-blue-600 text-white',
                    status === 'skipped' && 'bg-amber-500 text-white',
                    status === 'pending' && 'bg-[var(--border)] text-[var(--ink-muted)]',
                  )}>
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{STEP_LABELS[stepName]}</span>
                      {isOptional && (
                        <span className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wide">optional</span>
                      )}
                    </div>
                    {step && (
                      <div className="flex gap-3 text-xs text-[var(--ink-muted)] mt-0.5">
                        {step.machine_name && <span>Machine: {step.machine_name}</span>}
                        {step.actual_input_qty != null && <span>In: {formatQty(step.actual_input_qty, step.input_unit)}</span>}
                        {step.actual_output_qty != null && <span>Out: {formatQty(step.actual_output_qty, step.output_unit)}</span>}
                        {step.started_at && <span>{formatDateTime(step.started_at)}</span>}
                      </div>
                    )}
                    {step?.variance && (
                      <div className="flex gap-2 mt-1 flex-wrap text-[10px]">
                        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          Yield: {step.variance.yield_pct.toFixed(1)}%
                        </span>
                        {step.variance.total_scrap > 0 && (
                          <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            Scrap: {formatQty(step.variance.total_scrap, step.variance.scrap_unit)}
                          </span>
                        )}
                      </div>
                    )}
                    {step?.scrap_entries && step.scrap_entries.length > 0 && (
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {step.scrap_entries.map((se) => (
                          <span key={se.id} className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            {se.scrap_type}: {formatQty(se.quantity, se.unit)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge variant={stepStatusBadge(status)}>{status}</Badge>
                    {/* Actions */}
                    {status === 'pending' && canStep && unlocked && (
                      <button
                        onClick={() => setActionModal({ type: 'start', step: stepName })}
                        className="text-blue-600 hover:text-blue-800 p-1 rounded"
                        title="Start step"
                      >
                        <Play size={13} />
                      </button>
                    )}
                    {status === 'in_progress' && canStep && (
                      <button
                        onClick={() => setActionModal({ type: 'complete', step: stepName })}
                        className="text-green-600 hover:text-green-800 p-1 rounded"
                        title="Complete step"
                      >
                        <CheckCircle size={13} />
                      </button>
                    )}
                    {(status === 'in_progress' || status === 'completed') && canScrap && hasScrapTypes && (
                      <button
                        onClick={() => setActionModal({ type: 'scrap', step: stepName })}
                        className="text-amber-600 hover:text-amber-800 p-1 rounded"
                        title="Record scrap"
                      >
                        <AlertTriangle size={13} />
                      </button>
                    )}
                    {status === 'in_progress' && canConsumable && (
                      <button
                        onClick={() => setActionModal({ type: 'consumable', step: stepName })}
                        className="text-purple-600 hover:text-purple-800 p-1 rounded"
                        title="Record consumable usage"
                      >
                        <Package size={13} />
                      </button>
                    )}
                    {status === 'pending' && isOptional && canSkip && unlocked && (
                      <button
                        onClick={() => setActionModal({ type: 'skip', step: stepName })}
                        className="text-amber-600 hover:text-amber-800 p-1 rounded"
                        title="Skip step"
                      >
                        <SkipForward size={13} />
                      </button>
                    )}
                    {status === 'completed' && canOverride && (
                      <button
                        onClick={() => setActionModal({ type: 'override', step: stepName })}
                        className="text-blue-600 hover:text-blue-800 p-1 rounded"
                        title="Override recorded quantities"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {status === 'completed' && canAnalytics && (
                      <button
                        onClick={() => setActionModal({ type: 'analytics', step: stepName })}
                        className="text-[var(--ink-muted)] hover:text-[var(--ink)] p-1 rounded"
                        title="View step analytics"
                      >
                        <BarChart3 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {actionModal && (
        <StepActionModal
          lot={lot}
          actionType={actionModal.type}
          stepName={actionModal.step}
          consumables={consumables}
          onClose={() => setActionModal(null)}
          onDone={() => { setActionModal(null); reload(); }}
        />
      )}
    </AppShell>
  );
}

function DL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)] flex-shrink-0">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

function StepActionModal({
  lot,
  actionType,
  stepName,
  consumables,
  onClose,
  onDone,
}: {
  lot: Lot;
  actionType: string;
  stepName: StepName;
  consumables: Consumable[];
  onClose: () => void;
  onDone: () => void;
}) {
  const currentStep = lot.steps?.find((s) => s.step_name === stepName);

  const [startMachineName, setStartMachineName] = useState('');
  const [inputQty, setInputQty] = useState('');
  const [outputQty, setOutputQty] = useState('');
  const [machineName, setMachineName] = useState('');
  const [notes, setNotes] = useState('');
  const [overrideInputQty, setOverrideInputQty] = useState(String(currentStep?.actual_input_qty ?? ''));
  const [overrideOutputQty, setOverrideOutputQty] = useState(String(currentStep?.actual_output_qty ?? ''));
  const [overrideNotes, setOverrideNotes] = useState(currentStep?.notes ?? '');
  const [scrapType, setScrapType] = useState('');
  const [scrapQty, setScrapQty] = useState('');
  const [scrapUnit, setScrapUnit] = useState('kg');
  const [consumableId, setConsumableId] = useState<number>(0);
  const [consumableQty, setConsumableQty] = useState('');
  const [consumableUnit, setConsumableUnit] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [analytics, setAnalytics] = useState<StepVariance | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const scrapTypes = STEP_SCRAP_TYPES[stepName] || [];
  const noConsumablesAvailable = consumables.length === 0;
  const selectedConsumable = consumables.find((c) => c.id === consumableId);

  const titles: Record<string, string> = {
    start: `Start ${STEP_LABELS[stepName]}`,
    complete: `Complete ${STEP_LABELS[stepName]}`,
    skip: `Skip ${STEP_LABELS[stepName]}`,
    override: `Override — ${STEP_LABELS[stepName]}`,
    analytics: `Analytics — ${STEP_LABELS[stepName]}`,
    scrap: `Record Scrap — ${STEP_LABELS[stepName]}`,
    consumable: `Record Consumable Usage`,
  };

  useEffect(() => {
    if (actionType !== 'analytics') return;
    let cancelled = false;
    (async () => {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      try {
        const res = await lotsApi.getAnalytics(lot.id, stepName);
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
  }, [actionType, lot.id, stepName]);

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
          await lotsApi.startStep(lot.id, stepName, { machine_name: result.data.machine_name || undefined });
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
          const result = validate(completeStepSchema, payload);
          if (!result.success) {
            setErrors(result.errors);
            toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
            return;
          }
          setErrors({});
          setLoading(true);
          await lotsApi.completeStep(lot.id, stepName, {
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
          if (!SKIPPABLE_STEPS[stepName]) {
            toast.error(`The ${STEP_LABELS[stepName]} step cannot be skipped.`);
            return;
          }
          setLoading(true);
          await lotsApi.skipStep(lot.id, stepName);
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
          const result = validate(overrideStepSchema, payload);
          if (!result.success) {
            setErrors(result.errors);
            toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
            return;
          }
          setErrors({});
          setLoading(true);
          await lotsApi.updateStep(lot.id, stepName, result.data);
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
          const schema = scrapSchema(stepName);
          const payload = { scrap_type: scrapType, quantity: toNumber(scrapQty), unit: scrapUnit, notes };
          const result = validate(schema, payload);
          if (!result.success) {
            setErrors(result.errors);
            toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
            return;
          }
          setErrors({});
          setLoading(true);
          await lotsApi.recordScrap(lot.id, stepName, {
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
          if (selectedConsumable && result.data.quantity > selectedConsumable.stock_qty) {
            setErrors({ quantity: `Only ${formatQty(selectedConsumable.stock_qty, selectedConsumable.unit)} in stock` });
            toast.error('Requested quantity exceeds available stock.');
            return;
          }
          setErrors({});
          setLoading(true);
          await lotsApi.recordConsumable(lot.id, stepName, result.data);
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
    <Modal open onClose={onClose} title={titles[actionType] || 'Confirm'} size="sm"
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
            <Input label="Actual Input Qty" type="number" step="0.001" min="0" value={inputQty} onChange={(e) => setInputQty(e.target.value)} error={errors.actual_input_qty} placeholder="200.000" />
            <Input label="Actual Output Qty" type="number" step="0.001" min="0" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} error={errors.actual_output_qty} placeholder="190.000" />
            <Input label="Machine Name" value={machineName} onChange={(e) => setMachineName(e.target.value)} placeholder="Press-A1" maxLength={100} />
            <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
          </>
        )}
        {actionType === 'start' && (
          <>
            <p className="text-sm text-[var(--ink-muted)] mb-3">
              Start the <strong>{STEP_LABELS[stepName]}</strong> step for lot <strong>{lot.lot_number}</strong>?
            </p>
            <Input label="Machine Name (optional)" value={startMachineName} onChange={(e) => setStartMachineName(e.target.value)} error={errors.machine_name} placeholder="Press-A1" maxLength={100} />
          </>
        )}
        {actionType === 'skip' && (
          <p className="text-sm text-[var(--ink-muted)]">
            Skip the <strong>{STEP_LABELS[stepName]}</strong> step for lot <strong>{lot.lot_number}</strong>? This cannot be undone.
          </p>
        )}
        {actionType === 'override' && (
          <>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-1">
              This overwrites the recorded quantities/notes for a completed step. Leave a field blank to keep its current value.
            </p>
            <Input label="Actual Input Qty" type="number" step="0.001" min="0" value={overrideInputQty} onChange={(e) => setOverrideInputQty(e.target.value)} error={errors.actual_input_qty} placeholder="200.000" />
            <Input label="Actual Output Qty" type="number" step="0.001" min="0" value={overrideOutputQty} onChange={(e) => setOverrideOutputQty(e.target.value)} error={errors.actual_output_qty} placeholder="190.000" />
            <Textarea label="Notes" value={overrideNotes} onChange={(e) => setOverrideNotes(e.target.value)} rows={2} maxLength={1000} />
          </>
        )}
        {actionType === 'analytics' && (
          <StepAnalyticsView loading={analyticsLoading} error={analyticsError} data={analytics} />
        )}
        {actionType === 'scrap' && (
          <>
            {scrapTypes.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                The {STEP_LABELS[stepName]} step does not allow scrap entries.
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
                  <Input label="Quantity" type="number" step="0.001" min="0" value={scrapQty} onChange={(e) => setScrapQty(e.target.value)} error={errors.quantity} />
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
                  options={consumables.map((c) => ({ value: c.id, label: `${c.name} (${c.unit}) — ${c.stock_qty} in stock` }))}
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
                    hint={selectedConsumable ? `${formatQty(selectedConsumable.stock_qty, selectedConsumable.unit)} in stock` : undefined}
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

function StepAnalyticsView({ loading, error, data }: { loading: boolean; error: string | null; data: StepVariance | null }) {
  if (loading) return <p className="text-sm text-[var(--ink-muted)] text-center py-4">Loading analytics…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-[var(--ink-muted)] italic">No analytics available for this step yet.</p>;

  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between"><dt className="text-[var(--ink-muted)]">Input variance</dt><dd className="font-mono">{data.input_diff.toFixed(3)} ({data.input_diff_pct.toFixed(1)}%)</dd></div>
      <div className="flex justify-between"><dt className="text-[var(--ink-muted)]">Output variance</dt><dd className="font-mono">{data.output_diff.toFixed(3)} ({data.output_diff_pct.toFixed(1)}%)</dd></div>
      <div className="flex justify-between"><dt className="text-[var(--ink-muted)]">Yield</dt><dd className="font-mono">{data.yield_pct.toFixed(1)}%</dd></div>
      <div className="flex justify-between"><dt className="text-[var(--ink-muted)]">Total scrap</dt><dd className="font-mono">{formatQty(data.total_scrap, data.scrap_unit)}</dd></div>
    </dl>
  );
}
