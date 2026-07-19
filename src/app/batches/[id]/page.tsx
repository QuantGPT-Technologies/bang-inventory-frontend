'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, batchStatusBadge, lotStatusBadge, stepStatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ErrorState } from '@/components/ui/ErrorState';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { batchesApi, skusApi } from '@/lib/api';
import { Batch, SKU, BatchWorkflowDetail } from '@/lib/types';
import { formatDateTime, formatQty, BATCH_STATUS_LABELS, getNodeLabel, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import {
  completeBlendSchema, splitLotsSchema, validate, toNumber, type FieldErrors,
} from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { NODE_TYPE_ICONS, NODE_TYPE_COLORS } from '@/components/workflow/workflowNodeMeta';
import { Play, CheckCircle, Split, Plus, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function BatchDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [showBlend, setShowBlend] = useState(false);
  const [showCompleteBlend, setShowCompleteBlend] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [skus, setSkus] = useState<SKU[]>([]);

  const idParam = params?.id;
  const batchId = Number(idParam);
  const idIsValid = idParam != null && idParam !== '' && Number.isInteger(batchId) && batchId > 0;

  const fetchBatch = useCallback(async () => {
    if (!idIsValid) return null;
    const res = await batchesApi.get(batchId);
    return res.data?.data ?? null;
  }, [batchId, idIsValid]);

  const { data: batch, loading, error, reload } = useAsyncQuery<Batch | null>(fetchBatch, [batchId, idIsValid], null);

  const fetchBatchWorkflow = useCallback(async () => {
    if (!idIsValid) return null;
    const res = await batchesApi.getWorkflow(batchId);
    return res.data?.data ?? null;
  }, [batchId, idIsValid]);

  const { data: workflow, error: workflowError, reload: reloadWorkflow } = useAsyncQuery<BatchWorkflowDetail | null>(
    fetchBatchWorkflow,
    [batchId, idIsValid],
    null
  );

  // The batch's own workflow row is a supplementary visualization, not the primary record --
  // surface a toast on failure like the main batch fetch does, but don't block the rest of the
  // page (it just renders without that card, same as the other optional sections below).
  useEffect(() => {
    if (workflowError) toast.error(workflowError.message);
  }, [workflowError]);

  // Blend/split actions change the batch's workflow status (and, on split, spawn child lot
  // instances) -- refresh both the batch and its workflow view together after any of them.
  const refreshAll = useCallback(() => {
    reload();
    reloadWorkflow();
  }, [reload, reloadWorkflow]);

  useEffect(() => {
    if (error && !error.isNotFound) toast.error(error.message);
  }, [error]);

  useEffect(() => {
    skusApi.list(1, 100).then((r) => setSkus(r.data.data?.items || [])).catch(() => {
      toast.error('Failed to load SKU list. Lot splitting may be unavailable.');
    });
  }, []);

  if (!idIsValid) {
    return (
      <AppShell>
        <ErrorState error={{ message: 'Invalid batch reference.', isNetworkError: false, isValidationError: false, isAuthError: false, isForbidden: false, isNotFound: true, isConflict: false, isServerError: false }} />
      </AppShell>
    );
  }

  if (loading) return <AppShell><div className="p-8 text-center text-[var(--ink-muted)]">Loading…</div></AppShell>;

  if (error) {
    return (
      <AppShell>
        <ErrorState
          error={error}
          onRetry={error.isNotFound ? undefined : reload}
        />
      </AppShell>
    );
  }

  if (!batch) return <AppShell><div className="p-8 text-center text-[var(--ink-muted)]">Batch not found.</div></AppShell>;

  const canBlend = canAccess(user, 'batches', 'blend');
  const canSplit = canAccess(user, 'batches', 'split');
  const totalScrap = (batch.scrap || []).reduce((s, e) => s + e.quantity, 0);

  return (
    <AppShell>
      <PageHeader
        title={`Batch ${batch.batch_number}`}
        breadcrumb={[{ label: 'Batches', href: '/batches' }, { label: batch.batch_number }]}
        action={
          <div className="flex gap-2">
            {batch.status === 'created' && canBlend && (
              <Button size="sm" onClick={() => setShowBlend(true)}>
                <Play size={13} /> Start Blending
              </Button>
            )}
            {batch.status === 'blending' && canBlend && (
              <Button size="sm" onClick={() => setShowCompleteBlend(true)}>
                <CheckCircle size={13} /> Complete Blend
              </Button>
            )}
            {batch.status === 'blended' && canSplit && (
              <Button size="sm" onClick={() => setShowSplit(true)}>
                <Split size={13} /> Split into Lots
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Details */}
        <Card title="Batch Details" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            <DL label="Batch Number">
              <span className="font-mono font-semibold">{batch.batch_number}</span>
            </DL>
            <DL label="Status">
              <Badge variant={batchStatusBadge(batch.status)}>
                {BATCH_STATUS_LABELS[batch.status] || batch.status}
              </Badge>
            </DL>
            <DL label="Total Qty">{formatQty(batch.total_blend_qty, batch.unit)}</DL>
            {totalScrap > 0 && (
              <DL label="Total Scrap">
                <span className="text-amber-700">{formatQty(totalScrap, batch.unit)}</span>
              </DL>
            )}
            <DL label="Created">{formatDateTime(batch.created_at)}</DL>
            {batch.notes && <DL label="Notes"><span className="text-[var(--ink-muted)]">{batch.notes}</span></DL>}
          </dl>
        </Card>

        {/* Materials */}
        <Card title="Raw Materials" className="lg:col-span-2">
          {!batch.materials?.length ? (
            <p className="text-sm text-[var(--ink-muted)] italic">No materials recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-light)]">
                  <th className="text-left py-2 text-xs uppercase tracking-wide text-[var(--ink-muted)]">Material</th>
                  <th className="text-right py-2 text-xs uppercase tracking-wide text-[var(--ink-muted)]">Planned Qty</th>
                  <th className="text-right py-2 text-xs uppercase tracking-wide text-[var(--ink-muted)]">Actual Qty</th>
                </tr>
              </thead>
              <tbody>
                {batch.materials.map((m, i) => (
                  <tr key={i} className="border-b border-[var(--border-light)] last:border-0">
                    <td className="py-2">{m.material_name || `Material #${m.raw_material_id}`}</td>
                    <td className="py-2 text-right font-mono">{formatQty(m.planned_qty, m.unit || batch.unit)}</td>
                    <td className="py-2 text-right font-mono text-[var(--ink-muted)]">
                      {m.actual_qty != null ? formatQty(m.actual_qty, m.unit || batch.unit) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Scrap */}
        {batch.scrap && batch.scrap.length > 0 && (
          <Card title="Scrap" className="lg:col-span-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-light)]">
                  <th className="text-left py-2 text-xs uppercase tracking-wide text-[var(--ink-muted)]">Type</th>
                  <th className="text-right py-2 text-xs uppercase tracking-wide text-[var(--ink-muted)]">Quantity</th>
                  <th className="text-left py-2 text-xs uppercase tracking-wide text-[var(--ink-muted)]">Notes</th>
                </tr>
              </thead>
              <tbody>
                {batch.scrap.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border-light)] last:border-0">
                    <td className="py-2 capitalize">{s.scrap_type}</td>
                    <td className="py-2 text-right font-mono">{formatQty(s.quantity, s.unit)}</td>
                    <td className="py-2 text-[var(--ink-muted)]">{s.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Batch's own workflow (blend -> split_into_lots) plus every lot instance the fan-out spawned */}
        {workflow && (
          <Card title="Batch Workflow" className="lg:col-span-3">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                {workflow.nodes.map((node, i) => {
                  const Icon = NODE_TYPE_ICONS[node.node_type];
                  const color = NODE_TYPE_COLORS[node.node_type];
                  return (
                    <div key={node.id} className="flex items-center gap-2">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-light)] bg-[var(--paper)]">
                        <Icon size={14} style={{ color }} className="flex-shrink-0" />
                        <span className="text-sm font-medium text-[var(--ink)]">{getNodeLabel(node.node_key)}</span>
                        <Badge variant={stepStatusBadge(node.status)}>{node.status.replace('_', ' ')}</Badge>
                      </div>
                      {i < workflow.nodes.length - 1 && (
                        <ArrowRight size={14} className="text-[var(--ink-muted)] flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>

              {workflow.child_lots.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--ink-muted)] mb-2">
                    Spawned Lots
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {workflow.child_lots.map((cl) => (
                      <Link
                        key={cl.lot_id}
                        href={`/lots/${cl.lot_id}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-[var(--border-light)] hover:bg-[var(--paper-dark)] transition-colors"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono text-sm font-semibold text-[var(--accent)]">{cl.lot_number}</span>
                          <span className="text-xs text-[var(--ink-muted)] truncate">
                            {cl.current_node_key ? getNodeLabel(cl.current_node_key) : '—'}
                          </span>
                        </div>
                        <Badge variant={lotStatusBadge(cl.status)}>{cl.status.replace('_', ' ')}</Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Lots */}
        {batch.lots && batch.lots.length > 0 && (
          <Card title="Lots" className="lg:col-span-3" noPadding>
            <div className="divide-y divide-[var(--border-light)]">
              {batch.lots.map((lot) => (
                <Link
                  key={lot.id}
                  href={`/lots/${lot.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[var(--paper-dark)] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm font-semibold text-[var(--accent)]">{lot.lot_number}</span>
                    <span className="text-sm text-[var(--ink-muted)]">{lot.sku_code}</span>
                    <span className="text-sm">{formatQty(lot.quantity, lot.unit)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {lot.current_step && (
                      <span className="text-xs text-[var(--ink-muted)]">{lot.current_step}</span>
                    )}
                    <Badge variant={lotStatusBadge(lot.status)}>{lot.status}</Badge>
                    <ArrowRight size={14} className="text-[var(--ink-muted)]" />
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>

      {showBlend && batch.status === 'created' && (
        <StartBlendModal
          batch={batch}
          onClose={() => setShowBlend(false)}
          onDone={() => { setShowBlend(false); refreshAll(); }}
        />
      )}
      {showCompleteBlend && batch.status === 'blending' && (
        <CompleteBlendModal
          batch={batch}
          onClose={() => setShowCompleteBlend(false)}
          onDone={() => { setShowCompleteBlend(false); refreshAll(); }}
        />
      )}
      {showSplit && batch.status === 'blended' && (
        <SplitLotsModal
          batch={batch}
          skus={skus}
          onClose={() => setShowSplit(false)}
          onDone={() => { setShowSplit(false); refreshAll(); }}
        />
      )}
    </AppShell>
  );
}

function DL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)] flex-shrink-0">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function handleWorkflowError(err: unknown, refetch: () => void) {
  const info = parseApiError(err);
  toast.error(info.message);
  if (info.isConflict || info.isNotFound) {
    // Batch state changed under us (e.g. someone else advanced it) — resync the view.
    refetch();
  }
  return info;
}

function StartBlendModal({ batch, onClose, onDone }: { batch: Batch; onClose: () => void; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const hasMaterials = (batch.materials || []).length > 0;

  const handleConfirm = async () => {
    if (loading) return;
    if (!hasMaterials) {
      toast.error('This batch has no materials recorded; cannot start blending.');
      return;
    }
    setLoading(true);
    try {
      await batchesApi.startBlend(batch.id);
      toast.success('Blending started');
      onDone();
    } catch (err) {
      handleWorkflowError(err, onDone);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Start Blending"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading || !hasMaterials} onClick={handleConfirm}>Start Blend</Button></>}
    >
      {!hasMaterials ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          This batch has no raw materials recorded.
        </p>
      ) : (
        <p className="text-sm text-[var(--ink-muted)]">
          Start blending for batch <strong>{batch.batch_number}</strong>? This moves the batch into the{' '}
          <strong>blending</strong> state. Actual material quantities and any spillage scrap are recorded when you
          complete blending.
        </p>
      )}
    </Modal>
  );
}

interface ScrapRow { quantity: string; unit: string; notes: string }

function CompleteBlendModal({ batch, onClose, onDone }: { batch: Batch; onClose: () => void; onDone: () => void }) {
  const [actualQtys, setActualQtys] = useState<Record<number, string>>({});
  const [scrapRows, setScrapRows] = useState<ScrapRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const hasMaterials = (batch.materials || []).length > 0;

  const addScrapRow = () => setScrapRows((r) => [...r, { quantity: '', unit: batch.unit, notes: '' }]);
  const removeScrapRow = (i: number) => setScrapRows((r) => r.filter((_, idx) => idx !== i));
  const updateScrapRow = (i: number, field: keyof ScrapRow, value: string) =>
    setScrapRows((r) => r.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!hasMaterials) {
      toast.error('This batch has no materials recorded.');
      return;
    }

    const actual_materials = (batch.materials || []).map((m) => ({
      raw_material_id: m.raw_material_id,
      actual_qty: toNumber(actualQtys[m.raw_material_id] ?? String(m.planned_qty)),
    }));
    const scrap = scrapRows
      .filter((r) => r.quantity !== '')
      .map((r) => ({ scrap_type: 'spillage' as const, quantity: toNumber(r.quantity), unit: r.unit || undefined, notes: r.notes || undefined }));

    const result = validate(completeBlendSchema, { actual_materials, scrap });
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    const scrapTotal = result.data.scrap.reduce((s, e) => s + e.quantity, 0);
    if (scrapTotal > batch.total_blend_qty) {
      setErrors({ scrap: `Total scrap cannot exceed the batch total (${formatQty(batch.total_blend_qty, batch.unit)})` });
      toast.error('Scrap quantity exceeds the batch total.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      await batchesApi.completeBlend(batch.id, result.data);
      toast.success('Blending completed');
      onDone();
    } catch (err) {
      handleWorkflowError(err, onDone);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Complete Blending" subtitle="Record actual quantities and any spillage scrap" size="lg"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading || !hasMaterials} onClick={handleSubmit as unknown as React.MouseEventHandler}>Complete</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-[var(--ink-light)] uppercase tracking-wide block mb-2">
            Actual Material Quantities
          </label>
          {!hasMaterials ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              This batch has no raw materials recorded.
            </p>
          ) : (
            <div className="space-y-2">
              {(batch.materials || []).map((m) => (
                <div key={m.raw_material_id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm">{m.material_name || `Material #${m.raw_material_id}`}</span>
                  <span className="text-xs text-[var(--ink-muted)] w-20 text-right">Plan: {formatQty(m.planned_qty)}</span>
                  <Input
                    type="number" step="0.001" min="0"
                    value={actualQtys[m.raw_material_id] ?? String(m.planned_qty)}
                    onChange={(e) => setActualQtys((q) => ({ ...q, [m.raw_material_id]: e.target.value }))}
                    className="w-28 py-1.5 text-xs"
                    placeholder="Actual qty"
                  />
                </div>
              ))}
            </div>
          )}
          {errors.actual_materials && <p className="text-xs text-red-600 mt-1.5">{errors.actual_materials}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-[var(--ink-light)] uppercase tracking-wide">
              Spillage Scrap (optional)
            </label>
            <Button variant="ghost" size="sm" type="button" onClick={addScrapRow}>
              <Plus size={12} /> Add
            </Button>
          </div>
          {scrapRows.length === 0 ? (
            <p className="text-xs text-[var(--ink-muted)] italic">No spillage recorded.</p>
          ) : (
            <div className="space-y-2">
              {scrapRows.map((row, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="w-28">
                    <Input type="number" step="0.001" min="0" value={row.quantity} onChange={(e) => updateScrapRow(i, 'quantity', e.target.value)} placeholder="Qty" className="py-1.5 text-xs" />
                  </div>
                  <div className="w-20">
                    <Input value={row.unit} onChange={(e) => updateScrapRow(i, 'unit', e.target.value)} placeholder={batch.unit} className="py-1.5 text-xs" />
                  </div>
                  <div className="flex-1">
                    <Input value={row.notes} onChange={(e) => updateScrapRow(i, 'notes', e.target.value)} placeholder="Notes (optional)" className="py-1.5 text-xs" />
                  </div>
                  <button type="button" onClick={() => removeScrapRow(i)} className="text-[var(--ink-muted)] hover:text-red-600 pb-1"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
          {errors.scrap && <p className="text-xs text-red-600 mt-1.5">{errors.scrap}</p>}
        </div>
      </form>
    </Modal>
  );
}

interface LotRow { sku_id: number; quantity: string }

function SplitLotsModal({ batch, skus, onClose, onDone }: { batch: Batch; skus: SKU[]; onClose: () => void; onDone: () => void }) {
  const [lots, setLots] = useState<LotRow[]>([{ sku_id: 0, quantity: '' }]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const totalScrap = useMemo(() => (batch.scrap || []).reduce((s, e) => s + e.quantity, 0), [batch.scrap]);
  const remainingQty = useMemo(
    () => Math.max(0, batch.total_blend_qty - totalScrap),
    [batch.total_blend_qty, totalScrap]
  );

  const addLot = () => setLots((l) => [...l, { sku_id: 0, quantity: '' }]);
  const removeLot = (i: number) => setLots((l) => (l.length > 1 ? l.filter((_, idx) => idx !== i) : l));
  const updateLot = (i: number, field: keyof LotRow, value: string | number) =>
    setLots((l) => l.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const totalAssigned = useMemo(
    () => lots.reduce((s, l) => s + (toNumber(l.quantity) || 0), 0),
    [lots]
  );
  const noSkusAvailable = skus.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = {
      lots: lots
        .filter((l) => l.sku_id > 0 || l.quantity !== '')
        .map((l) => ({ sku_id: l.sku_id, quantity: toNumber(l.quantity) })),
    };

    const result = validate(splitLotsSchema(remainingQty), payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      await batchesApi.splitLots(batch.id, result.data.lots);
      toast.success('Lots created successfully');
      onDone();
    } catch (err) {
      handleWorkflowError(err, onDone);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Split into Lots" subtitle={`Splittable: ${formatQty(remainingQty, batch.unit)}`} size="lg"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading || noSkusAvailable} onClick={handleSubmit as unknown as React.MouseEventHandler}>Create Lots</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {noSkusAvailable && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            No SKUs exist yet. Create one under SKUs before splitting this batch.
          </p>
        )}
        <div className={`text-xs px-3 py-2 rounded-md ${Math.abs(totalAssigned - remainingQty) < 0.001 ? 'bg-green-50 text-green-700' : 'bg-[var(--paper-dark)] text-[var(--ink-muted)]'}`}>
          Assigned: {formatQty(totalAssigned, batch.unit)} / {formatQty(remainingQty, batch.unit)}
        </div>
        {lots.map((lot, i) => (
          <div key={i} className="flex gap-2 items-end">
            <div className="flex-1">
              <Select
                options={skus.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
                value={lot.sku_id || ''}
                onChange={(e) => updateLot(i, 'sku_id', Number(e.target.value))}
                placeholder="Select SKU…"
                className="text-xs py-1.5"
              />
            </div>
            <div className="w-28">
              <Input type="number" step="0.001" min="0" value={lot.quantity} onChange={(e) => updateLot(i, 'quantity', e.target.value)} placeholder="Qty" className="py-1.5 text-xs" />
            </div>
            <button type="button" onClick={() => removeLot(i)} disabled={lots.length === 1} className="text-[var(--ink-muted)] hover:text-red-600 pb-1 disabled:opacity-30"><X size={14} /></button>
          </div>
        ))}
        {errors.lots && <p className="text-xs text-red-600">{errors.lots}</p>}
        <Button type="button" variant="outline" size="sm" onClick={addLot} disabled={noSkusAvailable}><Plus size={12} /> Add Lot</Button>
      </form>
    </Modal>
  );
}
