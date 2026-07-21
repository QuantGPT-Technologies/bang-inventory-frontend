'use client';
import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, StatCard } from '@/components/ui/Card';
import { Badge, batchStatusBadge, lotStatusBadge } from '@/components/ui/Badge';
import { reportsApi, batchesApi, lotsApi } from '@/lib/api';
import { formatDate, formatQty, BATCH_STATUS_LABELS, STEP_LABELS, LOT_STATUS_LABELS } from '@/lib/utils';
import { Batch, Lot } from '@/lib/types';
import { Factory, Layers, AlertTriangle, TrendingUp, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { TaskQueue } from '@/components/dashboard/TaskQueue';

export default function DashboardPage() {
  const [summary, setSummary] = useState<{
    active_batches?: number;
    active_lots?: number;
    completed_today?: number;
    total_scrap_kg?: number;
  }>({});
  const [recentBatches, setRecentBatches] = useState<Batch[]>([]);
  const [activeLots, setActiveLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [partialFailure, setPartialFailure] = useState(false);

  const load = useCallback(async () => {
    let anyFailed = false;
    const markFailed = <T,>(fallback: T) => (): T => { anyFailed = true; return fallback; };

    const [summaryRes, batchRes, lotRes] = await Promise.all([
      reportsApi.productionSummary().catch(markFailed({ data: { data: {} } })),
      batchesApi.list({ page: 1, per_page: 5 }).catch(markFailed({ data: { data: { items: [] } } })),
      lotsApi.list({ status: 'in_progress', page: 1, per_page: 8 }).catch(markFailed({ data: { data: { items: [] } } })),
    ]);
    setSummary(summaryRes.data?.data || {});
    setRecentBatches(batchRes.data?.data?.items || []);
    setActiveLots(lotRes.data?.data?.items || []);
    setPartialFailure(anyFailed);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <AppShell>
      <PageHeader
        title="Home"
        subtitle={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      />

      {partialFailure && !loading && (
        <div className="flex items-center justify-between gap-3 mb-4 text-sm font-semibold text-[var(--warning)] bg-[var(--warning-tint)] border-2 border-[var(--warning)] rounded-xl px-4 py-3">
          <span>Some numbers below did not load. They may be wrong or missing.</span>
          <Button variant="ghost" size="sm" onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}>
            <RefreshCw size={16} /> Retry
          </Button>
        </div>
      )}

      {/* The primary content: every actionable workflow step across the whole plant, in one
          place -- this is the "what do I do next" answer the app didn't have before. Everything
          below (stats, recent activity) is secondary/browse-oriented context. */}
      <div className="mb-6">
        <TaskQueue />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Batches Running"
          value={loading ? '—' : (summary.active_batches ?? recentBatches.filter(b => b.status !== 'completed').length)}
          icon={<Factory size={22} />}
          accent
        />
        <StatCard
          label="Lots Running"
          value={loading ? '—' : (summary.active_lots ?? activeLots.length)}
          icon={<Layers size={22} />}
        />
        <StatCard
          label="Done Today"
          value={loading ? '—' : (summary.completed_today ?? '—')}
          icon={<TrendingUp size={22} />}
        />
        <StatCard
          label="Total Scrap (kg)"
          value={loading ? '—' : (summary.total_scrap_kg != null ? formatQty(summary.total_scrap_kg) : '—')}
          icon={<AlertTriangle size={22} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Batches */}
        <Card
          title="Recent Batches"
          action={
            <Link href="/batches" className="text-sm font-bold text-[var(--accent)] hover:underline">
              View all →
            </Link>
          }
          noPadding
        >
          {loading ? (
            <div className="p-5 text-center text-base text-[var(--ink-muted)]">Loading…</div>
          ) : recentBatches.length === 0 ? (
            <div className="p-5 text-center text-base text-[var(--ink-muted)] italic">No batches yet.</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {recentBatches.map((b) => (
                <Link
                  key={b.id}
                  href={`/batches/${b.id}`}
                  className="flex items-center justify-between px-4 py-3.5 min-h-[64px] hover:bg-[var(--paper-sunken)] transition-colors group"
                >
                  <div>
                    <p className="text-base font-bold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors font-mono">
                      {b.batch_number}
                    </p>
                    <p className="text-sm text-[var(--ink-muted)]">
                      {formatQty(b.total_blend_qty, b.unit)} · {formatDate(b.created_at)}
                    </p>
                  </div>
                  <Badge variant={batchStatusBadge(b.status)}>
                    {BATCH_STATUS_LABELS[b.status] || b.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Active Lots */}
        <Card
          title="Active Lots"
          action={
            <Link href="/lots" className="text-sm font-bold text-[var(--accent)] hover:underline">
              View all →
            </Link>
          }
          noPadding
        >
          {loading ? (
            <div className="p-5 text-center text-base text-[var(--ink-muted)]">Loading…</div>
          ) : activeLots.length === 0 ? (
            <div className="p-5 text-center text-base text-[var(--ink-muted)] italic">No active lots.</div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {activeLots.map((l) => (
                <Link
                  key={l.id}
                  href={`/lots/${l.id}`}
                  className="flex items-center justify-between px-4 py-3.5 min-h-[64px] hover:bg-[var(--paper-sunken)] transition-colors group"
                >
                  <div>
                    <p className="text-base font-bold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors font-mono">
                      {l.lot_number}
                    </p>
                    <p className="text-sm text-[var(--ink-muted)]">
                      {l.sku_code} · {formatQty(l.quantity, l.unit)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={lotStatusBadge(l.status)}>{LOT_STATUS_LABELS[l.status] || l.status}</Badge>
                    {l.current_step && (
                      <span className="text-sm text-[var(--ink-muted)]">
                        {STEP_LABELS[l.current_step]}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
