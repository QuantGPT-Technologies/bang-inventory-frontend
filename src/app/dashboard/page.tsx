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

// Poll the dashboard's own load() this often while the page stays mounted -- background refresh,
// not a user-visible loading state (see the isInitialLoad-style guard on `loading` below).
const AUTO_REFRESH_MS = 60_000;

/** "Updated Xs/Xm ago" from a completion timestamp, ticking live via the caller's re-render. */
function formatAgo(sinceMs: number | null): string {
  if (sinceMs == null) return '';
  const deltaSec = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
  if (deltaSec < 5) return 'Updated just now';
  if (deltaSec < 60) return `Updated ${deltaSec}s ago`;
  const deltaMin = Math.floor(deltaSec / 60);
  return `Updated ${deltaMin}m ago`;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<{
    active_batches?: number;
    active_lots?: number;
    completed_today?: number;
    total_scrap_kg?: number;
  }>({});
  const [recentBatches, setRecentBatches] = useState<Batch[]>([]);
  const [activeLots, setActiveLots] = useState<Lot[]>([]);
  // Only the first load (no data yet) should show the "Loading…" placeholders below -- background
  // refreshes (auto-refresh, retry) keep existing data on screen instead of blanking the page.
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [partialFailure, setPartialFailure] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

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
    if (!anyFailed) setLastUpdatedAt(Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setLoading(true);
      await load();
      if (!cancelled) {
        setLoading(false);
        setIsInitialLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Auto-refresh in the background every 60s -- no loading flash, old data stays visible
  // (mirrors the isInitialLoad distinction Table.tsx uses for its own reloads).
  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Live-ticking "Updated Xs ago" -- cheap re-render, no data refetch.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <AppShell>
      <PageHeader
        title="Home"
        subtitle={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        action={
          lastUpdatedAt != null ? (
            <span className="text-sm font-semibold text-[var(--ink-muted)]">{formatAgo(lastUpdatedAt)}</span>
          ) : undefined
        }
      />

      {partialFailure && !isInitialLoad && (
        <div className="flex items-center justify-between gap-3 mb-4 text-sm font-semibold text-[var(--warning)] bg-[var(--warning-tint)] border-2 border-[var(--warning)] rounded-xl px-4 py-3">
          <span>Some numbers below did not load. They may be wrong or missing.</span>
          <Button variant="ghost" size="sm" onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}>
            <RefreshCw size={16} /> Retry
          </Button>
        </div>
      )}

      {/* The primary content: every actionable workflow step across the whole plant, in one
          place -- this is the "what do I do next" answer the app didn't have before. Everything
          below (stats, recent activity) is secondary/browse-oriented context. This is the one
          region that flexes to fill whatever height is left after the fixed-height blocks below
          it, so the whole page fits the viewport without scrolling. */}
      <div className="flex-1 min-h-0 flex flex-col mb-4">
        <TaskQueue />
      </div>

      {/* Stats */}
      <div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Link href="/batches" className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <StatCard
            label="Batches Running"
            value={isInitialLoad ? '—' : (summary.active_batches ?? recentBatches.filter(b => b.status !== 'completed').length)}
            icon={<Factory size={22} />}
            accent
          />
        </Link>
        <Link href="/lots?status=in_progress" className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <StatCard
            label="Lots Running"
            value={isInitialLoad ? '—' : (summary.active_lots ?? activeLots.length)}
            icon={<Layers size={22} />}
          />
        </Link>
        <Link href="/batches?status=completed" className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <StatCard
            label="Done Today"
            value={isInitialLoad ? '—' : (summary.completed_today ?? '—')}
            icon={<TrendingUp size={22} />}
          />
        </Link>
        <StatCard
          label="Total Scrap (kg)"
          value={isInitialLoad ? '—' : (summary.total_scrap_kg != null ? formatQty(summary.total_scrap_kg) : '—')}
          icon={<AlertTriangle size={22} />}
        />
      </div>

      <div className="flex-shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-64">
        {/* Recent Batches */}
        <Card
          title="Recent Batches"
          action={
            <Link href="/batches" className="text-sm font-bold text-[var(--accent)] hover:underline">
              View all →
            </Link>
          }
          noPadding
          className="overflow-hidden"
        >
          {isInitialLoad ? (
            <div className="p-5 text-center text-base text-[var(--ink-muted)]">Loading…</div>
          ) : recentBatches.length === 0 ? (
            <div className="p-5 text-center text-base text-[var(--ink-muted)] italic">No batches yet.</div>
          ) : (
            <div className="divide-y divide-[var(--border)] h-full overflow-y-auto">
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
          className="overflow-hidden"
        >
          {isInitialLoad ? (
            <div className="p-5 text-center text-base text-[var(--ink-muted)]">Loading…</div>
          ) : activeLots.length === 0 ? (
            <div className="p-5 text-center text-base text-[var(--ink-muted)] italic">No active lots.</div>
          ) : (
            <div className="divide-y divide-[var(--border)] h-full overflow-y-auto">
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
