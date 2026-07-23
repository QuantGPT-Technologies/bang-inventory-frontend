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
import { Lot, Consumable, WorkflowNodeType, LotWorkflowGraph, ProductionStepConfig, ApprovalConfig } from '@/lib/types';
import { cn, formatDateTime, formatQty, getNodeLabel, STEP_SCRAP_TYPES, SKIPPABLE_STEPS, LOT_STATUS_LABELS, STEP_STATUS_LABELS, ROLE_LABELS, SCRAP_TYPE_LABELS } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { useAsyncQuery } from '@/lib/useAsync';
import { pushRecent } from '@/lib/useLocalMemory';
import { capList } from '@/lib/capList';
import { NODE_TYPE_ICONS, NODE_TYPE_COLORS, NODE_TYPE_LABELS, withAlpha } from '@/components/workflow/workflowNodeMeta';
import { LotWorkflowCanvas } from '@/components/workflow/execution/LotWorkflowCanvas';
import { DL } from '@/components/lots/DL';
import { ProductionStepActionModal, type ProductionActionType } from '@/components/lots/ProductionStepActionModal';
import { ApprovalActionModal } from '@/components/lots/ApprovalActionModal';
import { QualityCheckActionModal } from '@/components/lots/QualityCheckActionModal';
import Button from '@/components/ui/Button';
import { Play, CheckCircle, SkipForward, AlertTriangle, Package, Pencil, BarChart3, Check, X, XCircle, List, Workflow } from 'lucide-react';

type PipelineView = 'list' | 'graph';

type ActionModalState =
  | { kind: 'production'; type: ProductionActionType | string; nodeKey: string; scrapTypes: string[]; defaultScrapUnit?: string }
  | { kind: 'approval'; decision: 'approved' | 'rejected'; nodeKey: string }
  | { kind: 'quality'; result: 'pass' | 'fail'; nodeKey: string };

// A production_step node's own config.allowed_scrap_types is the source of truth --
// STEP_SCRAP_TYPES is a fallback only for the legacy fixed six steps that predate that config
// field. Shared by the pipeline row loop and the page-header primary action so both agree.
function resolveScrapTypes(nodeType: WorkflowNodeType, nodeKey: string, config: unknown): string[] {
  if (nodeType !== 'production_step') return [];
  const configured = (config as ProductionStepConfig)?.allowed_scrap_types;
  return configured?.length ? configured : STEP_SCRAP_TYPES[nodeKey] || [];
}

// The template author's own configured default (e.g. every scrap on this step is normally
// weighed in grams, not kg) beats a one-size-fits-all hardcoded unit -- still just a prefill,
// never a restriction, the unit field stays editable.
function resolveDefaultScrapUnit(nodeType: WorkflowNodeType, config: unknown): string | undefined {
  if (nodeType !== 'production_step') return undefined;
  return (config as ProductionStepConfig)?.default_scrap_unit;
}

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

  // Record this lot in the sidebar's "Recently Viewed" list once it's actually loaded (so we have
  // the real lot number, not just the URL id, to show as the label) -- keyed on lot.id so it only
  // fires once per successful load, not on every re-render/reload.
  useEffect(() => {
    if (lot) {
      pushRecent('recently-viewed', JSON.stringify({ type: 'lot', id: lot.id, label: lot.lot_number }));
    }
  }, [lot?.id]);

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

  // Only the FIRST load blanks the page -- a reload after an action (or the graph's own
  // background refresh) keeps everything on screen instead of tearing it down and repainting,
  // which otherwise makes every single action feel like a full page reload.
  if (loading && !lot) return <AppShell><div className="p-8 text-center text-base text-[var(--ink-muted)]">Loading…</div></AppShell>;
  if (error && !lot) return <AppShell><ErrorState error={error} onRetry={error.isNotFound ? undefined : reload} /></AppShell>;
  if (!lot) return <AppShell><div className="p-8 text-center text-base text-[var(--ink-muted)]">Lot not found.</div></AppShell>;

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

  // The page-level primary action: one dominant, status-driven call-to-action for whatever the
  // current node is, mirroring the batch detail page's header button (Start Blending / Complete
  // Blend / Split into Lots) instead of leaving "what do I do next" to a small pulsing badge
  // buried in a pipeline row. production_step collapses to a single next step (start or
  // complete); approval/quality_check are genuine two-way decisions, so both options render as
  // equally prominent header buttons rather than picking one arbitrarily. When the signed-in
  // user's role can't act on it, an explanatory "waiting on" message renders instead of a button
  // that would just 403 -- never a silently missing action.
  const currentNode = graph?.current_node_key
    ? sortedNodes.find((n) => n.node_key === graph.current_node_key)
    : undefined;
  const scrapTypes = currentNode ? resolveScrapTypes(currentNode.node_type, currentNode.node_key, currentNode.config) : [];

  let primaryAction: React.ReactNode = null;
  if (currentNode) {
    const label = currentNode.name;
    if (currentNode.node_type === 'production_step' && currentNode.status === 'pending') {
      primaryAction = canStep ? (
        <Button onClick={() => setActionModal({ kind: 'production', type: 'start', nodeKey: currentNode.node_key, scrapTypes })}>
          <Play size={18} /> Start {label}
        </Button>
      ) : (
        <span className="text-base text-[var(--ink-muted)] italic">Waiting for Production to start {label}</span>
      );
    } else if (currentNode.node_type === 'production_step' && currentNode.status === 'in_progress') {
      primaryAction = canStep ? (
        <Button onClick={() => setActionModal({ kind: 'production', type: 'complete', nodeKey: currentNode.node_key, scrapTypes })}>
          <CheckCircle size={18} /> Finish {label}
        </Button>
      ) : (
        <span className="text-base text-[var(--ink-muted)] italic">Waiting for Production to finish {label}</span>
      );
    } else if (currentNode.node_type === 'approval') {
      const requiredRole = (currentNode.config as ApprovalConfig)?.required_role;
      primaryAction = canApprove ? (
        <div className="flex gap-2">
          <Button onClick={() => setActionModal({ kind: 'approval', decision: 'approved', nodeKey: currentNode.node_key })}>
            <Check size={18} /> Approve {label}
          </Button>
          <Button variant="danger" onClick={() => setActionModal({ kind: 'approval', decision: 'rejected', nodeKey: currentNode.node_key })}>
            <X size={18} /> Reject
          </Button>
        </div>
      ) : (
        <span className="text-base text-[var(--ink-muted)] italic">
          Waiting for {requiredRole ? ROLE_LABELS[requiredRole] : 'an approver'} to check {label}
        </span>
      );
    } else if (currentNode.node_type === 'quality_check') {
      primaryAction = canSubmitQuality ? (
        <div className="flex gap-2">
          <Button onClick={() => setActionModal({ kind: 'quality', result: 'pass', nodeKey: currentNode.node_key })}>
            <CheckCircle size={18} /> Pass {label}
          </Button>
          <Button variant="danger" onClick={() => setActionModal({ kind: 'quality', result: 'fail', nodeKey: currentNode.node_key })}>
            <XCircle size={18} /> Fail
          </Button>
        </div>
      ) : (
        <span className="text-base text-[var(--ink-muted)] italic">Waiting for a quality check on {label}</span>
      );
    }
  }

  return (
    <AppShell>
      <PageHeader
        title={`Lot ${lot.lot_number}`}
        breadcrumb={[
          { label: 'Lots', href: '/lots' },
          { label: lot.lot_number },
        ]}
        action={
          <div className="flex items-center gap-3">
            {primaryAction}
            <Badge variant={lotStatusBadge(lot.status)} className="text-base px-3 py-1.5">
              {LOT_STATUS_LABELS[lot.status] || lot.status}
            </Badge>
          </div>
        }
      />

      <div className={cn('flex-1 min-h-0 overflow-hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity duration-150', loading && 'opacity-60')}>
        {/* Info */}
        <Card title="Lot Details">
          <dl className="space-y-3 text-base">
            <DL label="Lot Number"><span className="font-mono font-bold">{lot.lot_number}</span></DL>
            <DL label="Batch"><span className="font-mono font-semibold text-[var(--accent)]">{lot.batch_number || `#${lot.batch_id}`}</span></DL>
            <DL label="SKU">{lot.sku_code || `#${lot.sku_id}`}</DL>
            <DL label="Quantity">{formatQty(lot.quantity, lot.unit)}</DL>
            {lot.current_step && <DL label="Current Step">{getNodeLabel(lot.current_step)}</DL>}
            <DL label="Created">{formatDateTime(lot.created_at)}</DL>
          </dl>
        </Card>

        {/* Pipeline */}
        <Card
          title="Production Steps"
          className="lg:col-span-2"
          fill
          action={
            <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border)] p-0.5">
              <button
                onClick={() => setPipelineView('list')}
                className={cn(
                  'flex items-center gap-1.5 px-3 min-h-11 rounded-md text-sm font-bold transition-colors',
                  pipelineView === 'list'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--paper-sunken)]'
                )}
              >
                <List size={18} /> List
              </button>
              <button
                onClick={() => setPipelineView('graph')}
                className={cn(
                  'flex items-center gap-1.5 px-3 min-h-11 rounded-md text-sm font-bold transition-colors',
                  pipelineView === 'graph'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--paper-sunken)]'
                )}
              >
                <Workflow size={18} /> Graph
              </button>
            </div>
          }
        >
          {lotIsTerminal && (
            <div className="mb-3 text-sm font-semibold text-[var(--success)] bg-[var(--success-tint)] border border-[var(--success)] rounded-lg px-3 py-2.5">
              This lot is done with all steps.
            </div>
          )}

          {pipelineView === 'graph' ? (
            <div className="flex-1 min-h-0 w-full rounded-lg border border-[var(--border)] overflow-hidden">
              {graphLoading && (
                <div className="h-full flex items-center justify-center text-base text-[var(--ink-muted)]">Loading graph…</div>
              )}
              {!graphLoading && graphError && (
                <div className="h-full flex items-center justify-center text-base font-semibold text-[var(--danger)]">Could not load the step map.</div>
              )}
              {!graphLoading && !graphError && graph && <LotWorkflowCanvas graph={graph} />}
            </div>
          ) : (
          <div className="flex-1 min-h-0 overflow-hidden space-y-2">
            {graphLoading && (
              <p className="text-base text-[var(--ink-muted)] italic">Loading pipeline…</p>
            )}
            {!graphLoading && graphError && (
              <p className="text-base font-semibold text-[var(--danger)]">Could not load the step map.</p>
            )}
            {!graphLoading && !graphError && sortedNodes.length === 0 && (
              <p className="text-base text-[var(--ink-muted)] italic">No steps recorded yet.</p>
            )}
            {(() => {
              // Steps have highly variable row height (a plain not-yet-reached row is one line;
              // a completed production_step with variance/scrap badges can be 3-4 lines) -- cap
              // conservatively rather than measuring exactly, same trade-off as the batch detail
              // page's capped lists.
              const { visible, hiddenCount } = capList(sortedNodes, 8);
              return (
                <>
                  {!graphLoading && !graphError && visible.map((node, idx) => {
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
                    className="flex items-center gap-3 rounded-lg px-3 py-3 min-h-11 border border-[var(--border)] bg-[var(--paper-sunken)] opacity-60"
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 bg-[var(--border)] text-[var(--ink-muted)]">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <Icon size={18} className="flex-shrink-0 text-[var(--ink-muted)]" />
                      <span className="text-base font-semibold text-[var(--ink-muted)]">{node.name}</span>
                      <span className="text-xs text-[var(--ink-muted)] uppercase tracking-wide">{NODE_TYPE_LABELS[nodeType]}</span>
                    </div>
                    <Badge variant="muted">{STEP_STATUS_LABELS.not_started}</Badge>
                  </div>
                );
              }

              const accentColor = NODE_TYPE_COLORS[nodeType];
              const isOptional = nodeType === 'production_step' && !!SKIPPABLE_STEPS[nodeKey];
              const scrapTypes = resolveScrapTypes(nodeType, nodeKey, node.config);
              const defaultScrapUnit = resolveDefaultScrapUnit(nodeType, node.config);
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
                    'flex items-center gap-3 rounded-lg px-3 py-3 min-h-11 border transition-colors',
                    status === 'completed' && 'bg-[var(--success-tint)] border-[var(--success)]',
                    status === 'in_progress' && 'bg-[var(--info-tint)] border-[var(--info)]',
                    // Amber is reserved app-wide for "needs action" -- skipped is a benign
                    // bypass, so it gets a neutral treatment, distinct from pending only by shade.
                    status === 'skipped' && 'bg-[var(--border)] border-[var(--border)]',
                    status === 'pending' && 'bg-[var(--paper-sunken)] border-[var(--border)]',
                    // Louder highlight for the one row that's actually actionable right now:
                    // a thicker, node-type-accented left border on top of the ordinary status
                    // coloring (see the "Current Step" pill below for the other half of this).
                    isCurrent && 'border-l-4 shadow-sm',
                  )}
                  style={isCurrent ? { borderLeftColor: accentColor } : undefined}
                >
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                    status === 'completed' && 'bg-[var(--success)] text-white',
                    status === 'in_progress' && 'bg-[var(--info)] text-white',
                    status === 'skipped' && 'bg-[var(--ink-muted)] text-white',
                    status === 'pending' && 'bg-[var(--border-strong)] text-[var(--ink-muted)]',
                  )}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon size={18} style={{ color: accentColor }} className="flex-shrink-0" />
                      <span className="text-base font-semibold">{node.name}</span>
                      <span className="text-xs text-[var(--ink-muted)] uppercase tracking-wide">{NODE_TYPE_LABELS[nodeType]}</span>
                      {isOptional && (
                        <span className="text-xs text-[var(--ink-muted)] uppercase tracking-wide">can skip</span>
                      )}
                      {isCurrent && (
                        <span
                          className="inline-flex items-center text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full animate-pulse"
                          style={{ backgroundColor: withAlpha(accentColor, 18), color: accentColor }}
                        >
                          Current Step
                        </span>
                      )}
                    </div>

                    {/* production_step meta: machine/qty/timing + variance + scrap entries */}
                    {nodeType === 'production_step' && (
                      <>
                        <div className="flex gap-3 text-sm text-[var(--ink-muted)] mt-0.5 flex-wrap">
                          {instance?.machine_name && <span>Machine: {instance.machine_name}</span>}
                          {instance?.actual_input_qty != null && <span>In: {formatQty(instance.actual_input_qty, instance.input_unit)}</span>}
                          {instance?.actual_output_qty != null && <span>Out: {formatQty(instance.actual_output_qty, instance.output_unit)}</span>}
                          {instance?.started_at && <span>{formatDateTime(instance.started_at)}</span>}
                        </div>
                        {variance && (
                          <div className="flex gap-2 mt-1 flex-wrap text-xs">
                            <span className="font-semibold bg-[var(--info-tint)] text-[var(--info)] px-2 py-0.5 rounded-full">
                              Yield: {variance.yield_pct.toFixed(1)}%
                            </span>
                            {variance.total_scrap > 0 && (
                              <span className="font-semibold bg-[var(--danger-tint)] text-[var(--danger)] px-2 py-0.5 rounded-full">
                                Scrap: {formatQty(variance.total_scrap, variance.scrap_unit)}
                              </span>
                            )}
                          </div>
                        )}
                        {scrapEntries && scrapEntries.length > 0 && (
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {scrapEntries.map((se) => (
                              <span key={se.id} className="text-xs font-semibold bg-[var(--danger-tint)] text-[var(--danger)] px-2 py-0.5 rounded-full">
                                {SCRAP_TYPE_LABELS[se.scrap_type] || se.scrap_type.replace(/_/g, ' ')}: {formatQty(se.quantity, se.unit)}
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
                        <div className="flex gap-3 text-sm text-[var(--ink-muted)] mt-0.5 flex-wrap">
                          {instance?.outcome && <span>Outcome: {instance.outcome}</span>}
                          {instance?.decided_at && <span>{formatDateTime(instance.decided_at)}</span>}
                        </div>
                        {instance?.decision_reason && (
                          <p className="text-sm text-[var(--ink-muted)] mt-0.5 italic">&ldquo;{instance.decision_reason}&rdquo;</p>
                        )}
                        {nodeType === 'quality_check' && instance?.data && Object.keys(instance.data).length > 0 && (
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {Object.entries(instance.data).map(([k, v]) => (
                              <span key={k} className="text-xs font-semibold bg-[var(--info-tint)] text-[var(--info)] px-2 py-0.5 rounded-full">
                                {k}: {String(v)}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* conditional_branch: inert row, no actions ever */}
                    {nodeType === 'conditional_branch' && (
                      <p className="text-sm text-[var(--ink-muted)] mt-0.5">
                        {instance?.outcome ? `→ ${instance.outcome}` : 'Not decided yet'}
                      </p>
                    )}
                  </div>
                  {/* Start/Complete/Approve/Reject/Pass/Fail for the CURRENT node live in the
                      page-header primary action above, not duplicated here -- everything below
                      is secondary: available on this row regardless of whether it's the current
                      node (scrap/override/analytics), or an alternate path to the same current
                      node the header doesn't offer (skip), all labeled rather than icon-only. */}
                  <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                    <Badge variant={stepStatusBadge(status)}>{STEP_STATUS_LABELS[status] || status}</Badge>

                    {nodeType === 'production_step' && (
                      <>
                        {(status === 'in_progress' || status === 'completed') && canScrap && hasScrapTypes && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActionModal({ kind: 'production', type: 'scrap', nodeKey, scrapTypes, defaultScrapUnit })}
                          >
                            <AlertTriangle size={18} /> Record Scrap
                          </Button>
                        )}
                        {status === 'in_progress' && canConsumable && isCurrent && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActionModal({ kind: 'production', type: 'consumable', nodeKey, scrapTypes })}
                          >
                            <Package size={18} /> Log Usage
                          </Button>
                        )}
                        {status === 'pending' && isOptional && canSkip && isCurrent && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActionModal({ kind: 'production', type: 'skip', nodeKey, scrapTypes })}
                          >
                            <SkipForward size={18} /> Skip
                          </Button>
                        )}
                        {status === 'completed' && canOverride && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActionModal({ kind: 'production', type: 'override', nodeKey, scrapTypes })}
                          >
                            <Pencil size={18} /> Fix a Mistake
                          </Button>
                        )}
                        {status !== 'pending' && canAnalytics && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setActionModal({ kind: 'production', type: 'analytics', nodeKey, scrapTypes })}
                          >
                            <BarChart3 size={18} /> Details
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
                  })}
                  {hiddenCount > 0 && (
                    <p className="text-sm text-[var(--ink-muted)]">+{hiddenCount} more step{hiddenCount === 1 ? '' : 's'} not shown</p>
                  )}
                </>
              );
            })()}
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
          defaultScrapUnit={actionModal.defaultScrapUnit}
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
