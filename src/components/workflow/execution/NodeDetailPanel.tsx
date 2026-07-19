'use client';
import { Panel } from '@xyflow/react';
import { X } from 'lucide-react';
import { Badge, stepStatusBadge } from '@/components/ui/Badge';
import { formatDateTime, formatQty, STEP_STATUS_LABELS } from '@/lib/utils';
import { LotWorkflowGraphNode } from '@/lib/types';
import { NODE_TYPE_LABELS } from '../workflowNodeMeta';

/** Click-to-inspect detail popover for the read-only execution canvas -- selection is otherwise
 * inert here (no drag/connect/config), so this is the payoff for `elementsSelectable`. Shows
 * whatever the merged LotWorkflowGraphNode carries: always name/type/status, plus (once the node
 * has actually been reached) the runtime instance's qty/machine/operator/timing/outcome detail. */
export function NodeDetailPanel({ node, onClose }: { node: LotWorkflowGraphNode; onClose: () => void }) {
  const inst = node.instance;

  return (
    <Panel position="top-right" className="!m-3">
      <div className="w-64 rounded-lg border border-[var(--border-light)] bg-[var(--paper)] shadow-[0_2px_10px_var(--shadow)] p-3 text-xs">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-[var(--ink)] truncate">{node.name}</p>
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">{NODE_TYPE_LABELS[node.node_type]}</p>
          </div>
          <button onClick={onClose} className="text-[var(--ink-muted)] hover:text-[var(--ink)] flex-shrink-0" title="Close">
            <X size={14} />
          </button>
        </div>

        <Badge variant={stepStatusBadge(node.status)}>{STEP_STATUS_LABELS[node.status] || node.status}</Badge>

        {inst ? (
          <dl className="mt-2 space-y-1">
            {inst.machine_name && <DetailRow label="Machine" value={inst.machine_name} />}
            {inst.actual_input_qty != null && <DetailRow label="In" value={formatQty(inst.actual_input_qty, inst.input_unit)} />}
            {inst.actual_output_qty != null && <DetailRow label="Out" value={formatQty(inst.actual_output_qty, inst.output_unit)} />}
            {inst.outcome && <DetailRow label="Outcome" value={inst.outcome} />}
            {inst.operator_name && <DetailRow label="Operator" value={inst.operator_name} />}
            {inst.started_at && <DetailRow label="Started" value={formatDateTime(inst.started_at)} />}
            {inst.completed_at && <DetailRow label="Completed" value={formatDateTime(inst.completed_at)} />}
            {inst.decision_reason && (
              <p className="text-[11px] text-[var(--ink-muted)] italic pt-1">&ldquo;{inst.decision_reason}&rdquo;</p>
            )}
            {inst.data && Object.keys(inst.data).length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {Object.entries(inst.data).map(([k, v]) => (
                  <span key={k} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            )}
          </dl>
        ) : (
          <p className="mt-2 italic text-[var(--ink-muted)]">Not reached yet.</p>
        )}
      </div>
    </Panel>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--ink-muted)]">{label}</dt>
      <dd className="text-[var(--ink)] font-medium truncate max-w-[140px] text-right">{value}</dd>
    </div>
  );
}
