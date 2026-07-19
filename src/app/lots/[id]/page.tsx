'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, stepStatusBadge, lotStatusBadge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { toast } from '@/components/ui/Toast';
import { lotsApi, consumablesApi } from '@/lib/api';
import { Lot, Consumable, WorkflowNodeType, LotWorkflowGraph, ProductionStepConfig } from '@/lib/types';
import { cn, formatDateTime, formatQty, getNodeLabel, STEP_SCRAP_TYPES, SKIPPABLE_STEPS, LOT_STATUS_LABELS, STEP_STATUS_LABELS } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { useAsyncQuery } from '@/lib/useAsync';
import { NODE_TYPE_ICONS, NODE_TYPE_COLORS, NODE_TYPE_LABELS, withAlpha } from '@/components/workflow/workflowNodeMeta';
import { LotWorkflowCanvas } from '@/components/workflow/execution/LotWorkflowCanvas';
import { DL } from '@/components/lots/DL';
import { ProductionStepActionModal, type ProductionActionType } from '@/components/lots/ProductionStepActionModal';
import { ApprovalActionModal } from '@/components/lots/ApprovalActionModal';
import { QualityCheckActionModal } from '@/components/lots/QualityCheckActionModal';
import { Play, CheckCircle, SkipForward, AlertTriangle, Package, Pencil, BarChart3, Check, X, XCircle, List, Workflow } from 'lucide-react';

type PipelineView = 'list' | 'graph';

type ActionModalState =
  | { kind: 'production'; type: ProductionActionType | string; nodeKey: string; scrapTypes: string[] }
  | { kind: 'approval'; decision: 'approved' | 'rejected'; nodeKey: string }
  | { kind: 'quality'; result: 'pass' | 'fail'; nodeKey: string };

export default function LotDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [actionModal, setActionModal] = useState<ActionModalState | null>(null);
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [pipelineView, setPipelineView] = useState<PipelineView>('list');

  const idParam = params?.id;
  const lotId = Number(idParam);
  const idIsValid = idParam != null && idParam !== '' && Number.isInteger(lotId) && lotId > 0;

  const fetchLot = useCallback(async () => {
    if (!idIsValid) return null;
    const res = await lotsApi.get(lotId);
    return res.data?.data ?? null;
  }, [lotId, idIsValid]);

  const { data: lot, loading, error, reload } = useAsyncQuery<Lot | null>(fetchLot, [lotId, idIsValid], null);

  // Fetched unconditionally (not lazily on first switch to Graph view) so toggling is instant --
  // same rationale as the unconditional consumables fetch below, and this payload is small (one
  // template's worth of nodes/edges). Both views read from `lot`/`graph` independently but both
  // reload after every mutation (see the action modals' onDone below) so they never drift apart.
  const fetchGraph = useCallback(async () => {
    if (!idIsValid) return null;
    const res = await lotsApi.getGraph(lotId);
    return res.data?.data ?? null;
  }, [lotId, idIsValid]);

  const { data: graph, loading: graphLoading, error: graphError, reload: reloadGraph } = useAsyncQuery<LotWorkflowGraph | null>(
    fetchGraph,
    [lotId, idIsValid],
    null
  );

  useEffect(() => {
    if (error && !error.isNotFound) toast.error(error.message);
  }, [error]);

  const reloadAll = useCallback(() => {
    reload();
    reloadGraph();
  }, [reload, reloadGraph]);

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
  const canApprove = canAccess(user, 'lots', 'approve');
  const canSubmitQuality = canAccess(user, 'lots', 'quality_result');

  const lotIsTerminal = lot.status === 'completed';

  // List view now sources from the SAME full-graph data (`graph.nodes`, GET /lots/:id/graph) as
  // the Graph view, instead of `lot.steps` (which the backend only lazy-appends a row for once a
  // node is actually visited -- so a fresh lot's `steps` array has just one row and every
  // not-yet-reached node was invisible, the bug this fixes). `graph.nodes` always contains every
  // template node (`status: 'not_started'` for ones not yet reached), sorted by the designer's
  // intended display order (`sequence_hint`). The "current, actionable" node is read directly off
  // `graph.current_node_key` (explicit from the backend) instead of inferred from array position.
  //
  // GetLotWorkflowGraph (backend, internal/service/workflow_service.go) does NOT run the
  // variance/scrap-entries enrichment that GetLotWorkflowDetail (backing `lot.steps`) does --
  // graph.nodes[i].instance.variance and .scrap_entries are always empty. `lot.steps` (still
  // fetched -- the action modals look up their node from it by key) has both, so supplement from
  // there by node_key for whichever node the instance has actually reached.
  const stepsByNodeKey = new Map((lot.steps || []).flatMap((s) => (s.node_key ? [[s.node_key, s] as const] : [])));
  const sortedNodes = graph ? [...graph.nodes].sort((a, b) => (a.sequence_hint ?? 0) - (b.sequence_hint ?? 0)) : [];

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
            {LOT_STATUS_LABELS[lot.status] || lot.status}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Info */}
        <Card title="Lot Details">
          <dl className="space-y-3 text-sm">
            <DL label="Lot Number"><span className="font-mono font-semibold">{lot.lot_number}</span></DL>
            <DL label="Batch"><span className="font-mono text-[var(--accent)]">{lot.batch_number || `#${lot.batch_id}`}</span></DL>
            <DL label="SKU">{lot.sku_code || `#${lot.sku_id}`}</DL>
            <DL label="Quantity">{formatQty(lot.quantity, lot.unit)}</DL>
            {lot.current_step && <DL label="Current Step">{getNodeLabel(lot.current_step)}</DL>}
            <DL label="Created">{formatDateTime(lot.created_at)}</DL>
          </dl>
        </Card>

        {/* Pipeline */}
        <Card
          title="Production Pipeline"
          className="lg:col-span-2"
          action={
            <div className="flex items-center gap-0.5 rounded-md border border-[var(--border-light)] p-0.5">
              <button
                onClick={() => setPipelineView('list')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                  pipelineView === 'list'
                    ? 'bg-[var(--accent)] text-[var(--paper)]'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--paper-dark)]'
                )}
                title="List view"
              >
                <List size={13} /> List
              </button>
              <button
                onClick={() => setPipelineView('graph')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                  pipelineView === 'graph'
                    ? 'bg-[var(--accent)] text-[var(--paper)]'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--paper-dark)]'
                )}
                title="Graph view"
              >
                <Workflow size={13} /> Graph
              </button>
            </div>
          }
        >
          {lotIsTerminal && (
            <div className="mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              This lot has completed all production steps.
            </div>
          )}

          {pipelineView === 'graph' ? (
            <div className="h-[520px] w-full rounded-md border border-[var(--border-light)] overflow-hidden">
              {graphLoading && (
                <div className="h-full flex items-center justify-center text-sm text-[var(--ink-muted)]">Loading graph…</div>
              )}
              {!graphLoading && graphError && (
                <div className="h-full flex items-center justify-center text-sm text-red-600">Failed to load workflow graph.</div>
              )}
              {!graphLoading && !graphError && graph && <LotWorkflowCanvas graph={graph} />}
            </div>
          ) : (
          <div className="space-y-2">
            {graphLoading && (
              <p className="text-sm text-[var(--ink-muted)] italic">Loading pipeline…</p>
            )}
            {!graphLoading && graphError && (
              <p className="text-sm text-red-600">Failed to load workflow graph.</p>
            )}
            {!graphLoading && !graphError && sortedNodes.length === 0 && (
              <p className="text-sm text-[var(--ink-muted)] italic">No workflow steps recorded yet.</p>
            )}
            {!graphLoading && !graphError && sortedNodes.map((node, idx) => {
              const nodeType: WorkflowNodeType = node.node_type;
              const nodeKey = node.node_key;
              const status = node.status;
              const Icon = NODE_TYPE_ICONS[nodeType];

              // Not-yet-reached node: no instance exists yet, so there's nothing to show beyond
              // identity -- render a simplified, muted row with no actions and no qty/timestamp detail.
              if (status === 'not_started') {
                return (
                  <div
                    key={nodeKey}
                    className="flex items-center gap-3 rounded-md px-3 py-3 border border-[var(--border-light)] bg-[var(--paper-dark)] opacity-60"
                  >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-[var(--border)] text-[var(--ink-muted)]">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <Icon size={13} className="flex-shrink-0 text-[var(--ink-muted)]" />
                      <span className="text-sm font-medium text-[var(--ink-muted)]">{node.name}</span>
                      <span className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wide">{NODE_TYPE_LABELS[nodeType]}</span>
                    </div>
                    <Badge variant="muted">Not started</Badge>
                  </div>
                );
              }

              const accentColor = NODE_TYPE_COLORS[nodeType];
              const isOptional = nodeType === 'production_step' && !!SKIPPABLE_STEPS[nodeKey];
              // A custom workflow-template node's own config.allowed_scrap_types is the source of
              // truth -- STEP_SCRAP_TYPES is a fallback only for the legacy fixed six steps that
              // predate the config field, never a ceiling on what a custom template can allow.
              const scrapTypes = nodeType === 'production_step'
                ? ((node.config as ProductionStepConfig)?.allowed_scrap_types?.length
                    ? (node.config as ProductionStepConfig).allowed_scrap_types
                    : STEP_SCRAP_TYPES[nodeKey] || [])
                : [];
              const hasScrapTypes = scrapTypes.length > 0;
              const isCurrent = graph?.current_node_key === nodeKey;
              const instance = node.instance;
              // See the stepsByNodeKey comment above: graph.nodes[i].instance never carries
              // variance/scrap_entries (the latter isn't even on the WorkflowNodeInstance TS
              // shape -- it's an LotStep-only field), so supplement from the matching lot.steps row.
              const legacyStep = stepsByNodeKey.get(nodeKey);
              const variance = legacyStep?.variance ?? instance?.variance ?? null;
              const scrapEntries = legacyStep?.scrap_entries;

              return (
                <div
                  key={nodeKey}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-3 border transition-colors',
                    status === 'completed' && 'bg-green-50 border-green-200',
                    status === 'in_progress' && 'bg-blue-50 border-blue-200',
                    // Amber is reserved app-wide for "needs action" -- skipped is a benign
                    // bypass, so it gets a neutral treatment, distinct from pending only by shade.
                    status === 'skipped' && 'bg-[var(--paper-darker)] border-[var(--border)]',
                    status === 'pending' && 'bg-[var(--paper-dark)] border-[var(--border-light)]',
                    // Louder highlight for the one row that's actually actionable right now:
                    // a thicker, node-type-accented left border on top of the ordinary status
                    // coloring (see the "Current Step" pill below for the other half of this).
                    isCurrent && 'border-l-4 shadow-sm',
                  )}
                  style={isCurrent ? { borderLeftColor: accentColor } : undefined}
                >
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                    status === 'completed' && 'bg-green-600 text-white',
                    status === 'in_progress' && 'bg-blue-600 text-white',
                    status === 'skipped' && 'bg-[var(--ink-muted)] text-white',
                    status === 'pending' && 'bg-[var(--border)] text-[var(--ink-muted)]',
                  )}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon size={13} style={{ color: accentColor }} className="flex-shrink-0" />
                      <span className="text-sm font-medium">{node.name}</span>
                      <span className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wide">{NODE_TYPE_LABELS[nodeType]}</span>
                      {isOptional && (
                        <span className="text-[10px] text-[var(--ink-muted)] uppercase tracking-wide">optional</span>
                      )}
                      {isCurrent && (
                        <span
                          className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded animate-pulse"
                          style={{ backgroundColor: withAlpha(accentColor, 18), color: accentColor }}
                        >
                          Current Step
                        </span>
                      )}
                    </div>

                    {/* production_step meta: machine/qty/timing + variance + scrap entries */}
                    {nodeType === 'production_step' && (
                      <>
                        <div className="flex gap-3 text-xs text-[var(--ink-muted)] mt-0.5 flex-wrap">
                          {instance?.machine_name && <span>Machine: {instance.machine_name}</span>}
                          {instance?.actual_input_qty != null && <span>In: {formatQty(instance.actual_input_qty, instance.input_unit)}</span>}
                          {instance?.actual_output_qty != null && <span>Out: {formatQty(instance.actual_output_qty, instance.output_unit)}</span>}
                          {instance?.started_at && <span>{formatDateTime(instance.started_at)}</span>}
                        </div>
                        {variance && (
                          <div className="flex gap-2 mt-1 flex-wrap text-[10px]">
                            <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                              Yield: {variance.yield_pct.toFixed(1)}%
                            </span>
                            {variance.total_scrap > 0 && (
                              <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                                Scrap: {formatQty(variance.total_scrap, variance.scrap_unit)}
                              </span>
                            )}
                          </div>
                        )}
                        {scrapEntries && scrapEntries.length > 0 && (
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {scrapEntries.map((se) => (
                              <span key={se.id} className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                                {se.scrap_type}: {formatQty(se.quantity, se.unit)}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* approval / quality_check meta: who decided, when, why, and (quality_check
                        only) the free-form measurements captured at submission time */}
                    {(nodeType === 'approval' || nodeType === 'quality_check') && (
                      <>
                        <div className="flex gap-3 text-xs text-[var(--ink-muted)] mt-0.5 flex-wrap">
                          {instance?.outcome && <span>Outcome: {instance.outcome}</span>}
                          {instance?.decided_at && <span>{formatDateTime(instance.decided_at)}</span>}
                        </div>
                        {instance?.decision_reason && (
                          <p className="text-xs text-[var(--ink-muted)] mt-0.5 italic">&ldquo;{instance.decision_reason}&rdquo;</p>
                        )}
                        {nodeType === 'quality_check' && instance?.data && Object.keys(instance.data).length > 0 && (
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {Object.entries(instance.data).map(([k, v]) => (
                              <span key={k} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                {k}: {String(v)}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* conditional_branch: inert row, no actions ever */}
                    {nodeType === 'conditional_branch' && (
                      <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                        {instance?.outcome ? `→ ${instance.outcome}` : 'Pending evaluation'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge variant={stepStatusBadge(status)}>{STEP_STATUS_LABELS[status] || status}</Badge>

                    {nodeType === 'production_step' && (
                      <>
                        {status === 'pending' && canStep && isCurrent && (
                          <button
                            onClick={() => setActionModal({ kind: 'production', type: 'start', nodeKey, scrapTypes })}
                            className="text-blue-600 hover:text-blue-800 p-1 rounded"
                            title="Start step"
                          >
                            <Play size={13} />
                          </button>
                        )}
                        {status === 'in_progress' && canStep && isCurrent && (
                          <button
                            onClick={() => setActionModal({ kind: 'production', type: 'complete', nodeKey, scrapTypes })}
                            className="text-green-600 hover:text-green-800 p-1 rounded"
                            title="Complete step"
                          >
                            <CheckCircle size={13} />
                          </button>
                        )}
                        {(status === 'in_progress' || status === 'completed') && canScrap && hasScrapTypes && (
                          <button
                            onClick={() => setActionModal({ kind: 'production', type: 'scrap', nodeKey, scrapTypes })}
                            className="text-amber-600 hover:text-amber-800 p-1 rounded"
                            title="Record scrap"
                          >
                            <AlertTriangle size={13} />
                          </button>
                        )}
                        {status === 'in_progress' && canConsumable && isCurrent && (
                          <button
                            onClick={() => setActionModal({ kind: 'production', type: 'consumable', nodeKey, scrapTypes })}
                            className="text-purple-600 hover:text-purple-800 p-1 rounded"
                            title="Record consumable usage"
                          >
                            <Package size={13} />
                          </button>
                        )}
                        {status === 'pending' && isOptional && canSkip && isCurrent && (
                          <button
                            onClick={() => setActionModal({ kind: 'production', type: 'skip', nodeKey, scrapTypes })}
                            className="text-amber-600 hover:text-amber-800 p-1 rounded"
                            title="Skip step"
                          >
                            <SkipForward size={13} />
                          </button>
                        )}
                        {status === 'completed' && canOverride && (
                          <button
                            onClick={() => setActionModal({ kind: 'production', type: 'override', nodeKey, scrapTypes })}
                            className="text-blue-600 hover:text-blue-800 p-1 rounded"
                            title="Override recorded quantities"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {status !== 'pending' && canAnalytics && (
                          <button
                            onClick={() => setActionModal({ kind: 'production', type: 'analytics', nodeKey, scrapTypes })}
                            className="text-[var(--ink-muted)] hover:text-[var(--ink)] p-1 rounded"
                            title="View step detail"
                          >
                            <BarChart3 size={13} />
                          </button>
                        )}
                      </>
                    )}

                    {nodeType === 'approval' && isCurrent && canApprove && (
                      <>
                        <button
                          onClick={() => setActionModal({ kind: 'approval', decision: 'approved', nodeKey })}
                          className="text-green-600 hover:text-green-800 p-1 rounded"
                          title="Approve"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setActionModal({ kind: 'approval', decision: 'rejected', nodeKey })}
                          className="text-red-600 hover:text-red-800 p-1 rounded"
                          title="Reject"
                        >
                          <X size={13} />
                        </button>
                      </>
                    )}

                    {nodeType === 'quality_check' && isCurrent && canSubmitQuality && (
                      <>
                        <button
                          onClick={() => setActionModal({ kind: 'quality', result: 'pass', nodeKey })}
                          className="text-green-600 hover:text-green-800 p-1 rounded"
                          title="Pass"
                        >
                          <CheckCircle size={13} />
                        </button>
                        <button
                          onClick={() => setActionModal({ kind: 'quality', result: 'fail', nodeKey })}
                          className="text-red-600 hover:text-red-800 p-1 rounded"
                          title="Fail"
                        >
                          <XCircle size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </Card>
      </div>

      {actionModal?.kind === 'production' && (
        <ProductionStepActionModal
          lot={lot}
          actionType={actionModal.type}
          nodeKey={actionModal.nodeKey}
          allowedScrapTypes={actionModal.scrapTypes}
          consumables={consumables}
          onClose={() => setActionModal(null)}
          onDone={() => { setActionModal(null); reloadAll(); }}
        />
      )}
      {actionModal?.kind === 'approval' && (
        <ApprovalActionModal
          lot={lot}
          nodeKey={actionModal.nodeKey}
          decision={actionModal.decision}
          onClose={() => setActionModal(null)}
          onDone={() => { setActionModal(null); reloadAll(); }}
        />
      )}
      {actionModal?.kind === 'quality' && (
        <QualityCheckActionModal
          lot={lot}
          nodeKey={actionModal.nodeKey}
          initialResult={actionModal.result}
          onClose={() => setActionModal(null)}
          onDone={() => { setActionModal(null); reloadAll(); }}
        />
      )}
    </AppShell>
  );
}
