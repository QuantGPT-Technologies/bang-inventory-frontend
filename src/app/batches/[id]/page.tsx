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
import { cn, formatDateTime, formatQty, BATCH_STATUS_LABELS, LOT_STATUS_LABELS, STEP_STATUS_LABELS, SCRAP_TYPE_LABELS, getNodeLabel, parseApiError } from '@/lib/utils';
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

  // Only the FIRST load blanks the page -- a reload after an action keeps everything on screen
  // instead of tearing it down and repainting, which otherwise makes every single action feel
  // like a full page reload. A reload that fails still surfaces via the toast effect above.
  if (loading && !batch) return <AppShell><div className="p-8 text-center text-base text-[var(--ink-muted)]">Loading…</div></AppShell>;

  if (error && !batch) {
    return (
      <AppShell>
        <ErrorState
          error={error}
          onRetry={error.isNotFound ? undefined : reload}
        />
      </AppShell>
    );
  }

  if (!batch) return <AppShell><div className="p-8 text-center text-base text-[var(--ink-muted)]">Batch not found.</div></AppShell>;

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
              <Button onClick={() => setShowBlend(true)}>
                <Play size={18} /> Start Mixing
              </Button>
            )}
            {batch.status === 'blending' && canBlend && (
              <Button onClick={() => setShowCompleteBlend(true)}>
                <CheckCircle size={18} /> Finish Mixing
              </Button>
            )}
            {batch.status === 'blended' && canSplit && (
              <Button onClick={() => setShowSplit(true)}>
                <Split size={18} /> Split into Lots
              </Button>
            )}
          </div>
        }
      />

      <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity duration-150', loading && 'opacity-60')}>
        {/* Details */}
        <Card title="Batch Details" className="lg:col-span-1">
          <dl className="space-y-3 text-base">
            <DL label="Batch Number">
              <span className="font-mono font-bold">{batch.batch_number}</span>
            </DL>
            <DL label="Status">
              <Badge variant={batchStatusBadge(batch.status)}>
                {BATCH_STATUS_LABELS[batch.status] || batch.status}
              </Badge>
            </DL>
            <DL label="Total Qty">{formatQty(batch.total_blend_qty, batch.unit)}</DL>
            {totalScrap > 0 && (
              <DL label="Total Scrap">
                <span className="text-[var(--warning)] font-semibold">{formatQty(totalScrap, batch.unit)}</span>
              </DL>
            )}
            <DL label="Created">{formatDateTime(batch.created_at)}</DL>
            {batch.notes && <DL label="Notes"><span className="text-[var(--ink-muted)]">{batch.notes}</span></DL>}
          </dl>
        </Card>

        {/* Materials */}
        <Card title="Raw Materials" className="lg:col-span-2">
          {!batch.materials?.length ? (
            <p className="text-base text-[var(--ink-muted)] italic">No materials recorded.</p>
          ) : (
            <table className="w-full text-base">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 text-sm font-bold uppercase tracking-wide text-[var(--ink-muted)]">Material</th>
                  <th className="text-right py-2 text-sm font-bold uppercase tracking-wide text-[var(--ink-muted)]">Planned</th>
                  <th className="text-right py-2 text-sm font-bold uppercase tracking-wide text-[var(--ink-muted)]">Actual</th>
                </tr>
              </thead>
              <tbody>
                {batch.materials.map((m, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5">{m.material_name || `Material #${m.raw_material_id}`}</td>
                    <td className="py-2.5 text-right font-mono">{formatQty(m.planned_qty, m.unit || batch.unit)}</td>
                    <td className="py-2.5 text-right font-mono text-[var(--ink-muted)]">
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
            <table className="w-full text-base">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 text-sm font-bold uppercase tracking-wide text-[var(--ink-muted)]">Type</th>
                  <th className="text-right py-2 text-sm font-bold uppercase tracking-wide text-[var(--ink-muted)]">Quantity</th>
                  <th className="text-left py-2 text-sm font-bold uppercase tracking-wide text-[var(--ink-muted)]">Notes</th>
                </tr>
              </thead>
              <tbody>
                {batch.scrap.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5">{SCRAP_TYPE_LABELS[s.scrap_type] || s.scrap_type.replace(/_/g, ' ')}</td>
                    <td className="py-2.5 text-right font-mono">{formatQty(s.quantity, s.unit)}</td>
                    <td className="py-2.5 text-[var(--ink-muted)]">{s.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Batch's own workflow (blend -> split_into_lots) plus every lot instance the fan-out spawned */}
        {workflow && (
          <Card title="Batch Steps" className="lg:col-span-3">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                {workflow.nodes.map((node, i) => {
                  const Icon = NODE_TYPE_ICONS[node.node_type];
                  const color = NODE_TYPE_COLORS[node.node_type];
                  return (
                    <div key={node.id} className="flex items-center gap-2">
                      <div className="flex items-center gap-2 px-3 py-2.5 min-h-11 rounded-lg border border-[var(--border)] bg-[var(--paper-sunken)]">
                        <Icon size={18} style={{ color }} className="flex-shrink-0" />
                        <span className="text-base font-semibold text-[var(--ink)]">{getNodeLabel(node.node_key)}</span>
                        <Badge variant={stepStatusBadge(node.status)}>{STEP_STATUS_LABELS[node.status] || node.status}</Badge>
                      </div>
                      {i < workflow.nodes.length - 1 && (
                        <ArrowRight size={18} className="text-[var(--ink-muted)] flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>

              {workflow.child_lots.length > 0 && (
                <div>
                  <div className="text-sm font-bold uppercase tracking-wide text-[var(--ink-muted)] mb-2">
                    Lots Created
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {workflow.child_lots.map((cl) => (
                      <Link
                        key={cl.lot_id}
                        href={`/lots/${cl.lot_id}`}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 min-h-11 rounded-lg border border-[var(--border)] hover:bg-[var(--paper-sunken)] transition-colors"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono text-base font-bold text-[var(--accent)]">{cl.lot_number}</span>
                          <span className="text-sm text-[var(--ink-muted)] truncate">
                            {cl.current_node_key ? getNodeLabel(cl.current_node_key) : '—'}
                          </span>
                        </div>
                        <Badge variant={lotStatusBadge(cl.status)}>{LOT_STATUS_LABELS[cl.status] || cl.status}</Badge>
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
            <div className="divide-y divide-[var(--border)]">
              {batch.lots.map((lot) => (
                <Link
                  key={lot.id}
                  href={`/lots/${lot.id}`}
                  className="flex items-center justify-between px-4 py-3.5 min-h-11 hover:bg-[var(--paper-sunken)] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-base font-bold text-[var(--accent)]">{lot.lot_number}</span>
                    <span className="text-base text-[var(--ink-muted)]">{lot.sku_code}</span>
                    <span className="text-base">{formatQty(lot.quantity, lot.unit)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {lot.current_step && (
                      <span className="text-sm text-[var(--ink-muted)]">{getNodeLabel(lot.current_step)}</span>
                    )}
                    <Badge variant={lotStatusBadge(lot.status)}>{LOT_STATUS_LABELS[lot.status] || lot.status}</Badge>
                    <ArrowRight size={18} className="text-[var(--ink-muted)]" />
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
      <dt className="text-sm font-bold uppercase tracking-wide text-[var(--ink-muted)] flex-shrink-0">{label}</dt>
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
      toast.error('This batch has no materials. You cannot start mixing.');
      return;
    }
    setLoading(true);
    try {
      await batchesApi.startBlend(batch.id);
      toast.success('Mixing started');
      onDone();
    } catch (err) {
      handleWorkflowError(err, onDone);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Start Mixing"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading || !hasMaterials} onClick={handleConfirm}>Start Mixing</Button></>}
    >
      {!hasMaterials ? (
        <p className="text-base font-semibold text-[var(--warning)] bg-[var(--warning-tint)] border border-[var(--warning)] rounded-lg px-3 py-2.5">
          This batch has no raw materials.
        </p>
      ) : (
        <p className="text-base text-[var(--ink-muted)]">
          Start mixing batch <strong className="text-[var(--ink)]">{batch.batch_number}</strong>?
          You will enter the real amounts used when you finish mixing.
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
      toast.error('This batch has no materials.');
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
      setErrors({ scrap: `Scrap cannot be more than the batch total (${formatQty(batch.total_blend_qty, batch.unit)})` });
      toast.error('Scrap amount is more than the batch total.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      await batchesApi.completeBlend(batch.id, result.data);
      toast.success('Mixing finished');
      onDone();
    } catch (err) {
      handleWorkflowError(err, onDone);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Finish Mixing" subtitle="Enter the real amounts used and any spilled material" size="lg"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading || !hasMaterials} onClick={handleSubmit as unknown as React.MouseEventHandler}>Finish</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide block mb-2">
            Real Amounts Used
          </label>
          {!hasMaterials ? (
            <p className="text-sm font-semibold text-[var(--warning)] bg-[var(--warning-tint)] border border-[var(--warning)] rounded-lg px-3 py-2">
              This batch has no raw materials.
            </p>
          ) : (
            <div className="space-y-2">
              {(batch.materials || []).map((m) => (
                <div key={m.raw_material_id} className="flex items-center gap-3">
                  <span className="flex-1 text-base">{m.material_name || `Material #${m.raw_material_id}`}</span>
                  <span className="text-sm text-[var(--ink-muted)] w-24 text-right">Plan: {formatQty(m.planned_qty)}</span>
                  <Input
                    type="number" step="0.001" min="0"
                    value={actualQtys[m.raw_material_id] ?? String(m.planned_qty)}
                    onChange={(e) => setActualQtys((q) => ({ ...q, [m.raw_material_id]: e.target.value }))}
                    className="w-32"
                    placeholder="Real amount"
                  />
                </div>
              ))}
            </div>
          )}
          {errors.actual_materials && <p className="text-sm font-semibold text-[var(--danger)] mt-1.5">{errors.actual_materials}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide">
              Spilled Material (optional)
            </label>
            <Button variant="ghost" size="sm" type="button" onClick={addScrapRow}>
              <Plus size={16} /> Add
            </Button>
          </div>
          {scrapRows.length === 0 ? (
            <p className="text-base text-[var(--ink-muted)] italic">No spilled material.</p>
          ) : (
            <div className="space-y-2">
              {scrapRows.map((row, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="w-28">
                    <Input type="number" step="0.001" min="0" value={row.quantity} onChange={(e) => updateScrapRow(i, 'quantity', e.target.value)} placeholder="Qty" />
                  </div>
                  <div className="w-20">
                    <Input value={row.unit} onChange={(e) => updateScrapRow(i, 'unit', e.target.value)} placeholder={batch.unit} />
                  </div>
                  <div className="flex-1">
                    <Input value={row.notes} onChange={(e) => updateScrapRow(i, 'notes', e.target.value)} placeholder="Notes (optional)" />
                  </div>
                  <button type="button" onClick={() => removeScrapRow(i)} className="flex items-center gap-1.5 text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--danger)] min-h-[52px] px-2.5">
                    <X size={18} />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {errors.scrap && <p className="text-sm font-semibold text-[var(--danger)] mt-1.5">{errors.scrap}</p>}
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
      toast.success('Lots created');
      onDone();
    } catch (err) {
      handleWorkflowError(err, onDone);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Split into Lots" subtitle={`Amount left to split: ${formatQty(remainingQty, batch.unit)}`} size="lg"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading || noSkusAvailable} onClick={handleSubmit as unknown as React.MouseEventHandler}>Create Lots</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {noSkusAvailable && (
          <p className="text-sm font-semibold text-[var(--warning)] bg-[var(--warning-tint)] border border-[var(--warning)] rounded-lg px-3 py-2">
            No SKUs yet. Add one under SKUs first.
          </p>
        )}
        <div className={`text-sm font-semibold px-3 py-2.5 rounded-lg ${Math.abs(totalAssigned - remainingQty) < 0.001 ? 'bg-[var(--success-tint)] text-[var(--success)]' : 'bg-[var(--paper-sunken)] text-[var(--ink-muted)]'}`}>
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
              />
            </div>
            <div className="w-28">
              <Input type="number" step="0.001" min="0" value={lot.quantity} onChange={(e) => updateLot(i, 'quantity', e.target.value)} placeholder="Qty" />
            </div>
            <button type="button" onClick={() => removeLot(i)} disabled={lots.length === 1} className="flex items-center gap-1.5 text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--danger)] min-h-[52px] px-2.5 disabled:opacity-30">
              <X size={18} />
              Remove
            </button>
          </div>
        ))}
        {errors.lots && <p className="text-sm font-semibold text-[var(--danger)]">{errors.lots}</p>}
        <Button type="button" variant="outline" size="sm" onClick={addLot} disabled={noSkusAvailable}><Plus size={16} /> Add Lot</Button>
      </form>
    </Modal>
  );
}
