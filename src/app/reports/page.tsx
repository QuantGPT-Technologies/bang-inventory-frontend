'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, StatCard } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Badge, stockStatusBadge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { reportsApi } from '@/lib/api';
import { cn, formatQty, parseApiError, type ApiErrorInfo } from '@/lib/utils';
import { StockLevelItem, StockLevels, YieldSummary, YieldSummaryRow } from '@/lib/types';
import { BarChart, type BarChartRow } from '@/components/charts/BarChart';
import { LineChart, type LineChartPoint } from '@/components/charts/LineChart';
import { stepLabel } from './shared';
import { Factory, Layers, TrendingUp, AlertTriangle, PackageX, ArrowRight } from 'lucide-react';

type ReportsTab = 'yield' | 'stock' | 'trends';
const TABS: { key: ReportsTab; label: string }[] = [
  { key: 'yield', label: 'Yield' },
  { key: 'stock', label: 'Stock Levels' },
  { key: 'trends', label: 'Trends' },
];

const TREND_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

interface TrendDay {
  date: string;
  batches_created: number;
  lots_completed: number;
  scrap_kg: number;
}

const STOCK_STATUS_RANK: Record<string, number> = { out: 0, low: 1, ok: 2 };

/**
 * Insights: one scrollable, glance-level pane replacing the old report-type dropdown (which
 * showed one report at a time, "Production Summary" vs. "Scrap Summary" vs. ... as mutually
 * exclusive choices instead of a dashboard). A single date-range filter up top applies only to
 * the sections that are genuinely date-scoped (scrap this period, yield, both trends) --
 * current-state sections (open work, stock levels) are explicitly labeled "as of now" so
 * changing the range doesn't silently fail to move them. The three granular legacy reports
 * (material usage, raw material variance, step-wise usage) are demoted to /reports/detailed,
 * linked at the bottom -- still available, not competing for space here.
 */
export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateError, setDateError] = useState('');
  const [yieldGroupBy, setYieldGroupBy] = useState<'step' | 'sku'>('step');
  const [tab, setTab] = useState<ReportsTab>('yield');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [production, setProduction] = useState<{
    active_batches?: number;
    active_lots?: number;
    completed_today?: number;
  }>({});
  const [scrapKg, setScrapKg] = useState(0);
  const [yieldData, setYieldData] = useState<YieldSummary>({ group_by: 'step', rows: [] });
  const [stock, setStock] = useState<StockLevels | null>(null);
  const [trendDays, setTrendDays] = useState<TrendDay[]>([]);

  const load = useCallback(async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setDateError('Start date must be before end date');
      return;
    }
    setDateError('');
    setLoading(true);
    setError(null);
    const dateParams = dateFrom || dateTo ? { date_from: dateFrom || undefined, date_to: dateTo || undefined } : undefined;
    try {
      const [prodRes, scrapRes, yieldRes, stockRes, trendsRes] = await Promise.all([
        reportsApi.productionSummary(),
        reportsApi.scrapSummary(dateParams),
        reportsApi.yieldSummary({ ...dateParams, group_by: yieldGroupBy }),
        reportsApi.stockLevels(),
        reportsApi.trends(dateParams),
      ]);
      setProduction(prodRes.data?.data ?? {});
      setScrapKg((scrapRes.data?.data as { total_kg?: number } | undefined)?.total_kg ?? 0);
      setYieldData(yieldRes.data?.data ?? { group_by: yieldGroupBy, rows: [] });
      setStock(stockRes.data?.data ?? null);
      setTrendDays((trendsRes.data?.data as { days?: TrendDay[] } | undefined)?.days ?? []);
    } catch (err) {
      const info = parseApiError(err);
      setError(info);
      toast.error(info.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, yieldGroupBy]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, yieldGroupBy]);

  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    setDateTo(to.toISOString().slice(0, 10));
    setDateFrom(from.toISOString().slice(0, 10));
  };

  // Aggregate-then-divide (SUM(output)/SUM(input)), matching the backend's own per-row math --
  // an average of each row's yield_pct would let a handful of small-input rows skew the figure.
  const totalInput = yieldData.rows.reduce((s, r) => s + r.total_input_qty, 0);
  const totalOutput = yieldData.rows.reduce((s, r) => s + r.total_output_qty, 0);
  const avgYieldPct = totalInput > 0 ? (totalOutput / totalInput) * 100 : null;

  const needsReorder = (stock?.summary.out_of_stock_count ?? 0) + (stock?.summary.low_stock_count ?? 0);

  const yieldRows: BarChartRow[] = yieldData.rows.map((r) => ({
    category: yieldRowLabel(r),
    values: { yield: r.yield_pct },
  }));

  const stockRows: (StockLevelItem & { category: string })[] = stock
    ? [
        ...stock.raw_materials.map((i) => ({ ...i, category: 'Raw Material' })),
        ...stock.consumables.map((i) => ({ ...i, category: 'Consumable' })),
        ...stock.skus.map((i) => ({ ...i, category: 'SKU' })),
      ].sort((a, b) => STOCK_STATUS_RANK[a.status] - STOCK_STATUS_RANK[b.status] || a.name.localeCompare(b.name))
    : [];

  const activityPoints: LineChartPoint[] = trendDays.map((d) => ({
    x: d.date,
    values: { batches: d.batches_created, lots: d.lots_completed },
  }));
  const scrapPoints: LineChartPoint[] = trendDays.map((d) => ({ x: d.date, values: { scrap: d.scrap_kg } }));

  return (
    <AppShell>
      <PageHeader
        title="Insights"
        subtitle="What matters for the business, at a glance"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--ink-muted)]">Period:</span>
            {TREND_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => applyPreset(p.days)}
                className="text-sm font-semibold px-3 min-h-11 rounded-lg border-2 border-[var(--border-strong)] text-[var(--ink-light)] hover:bg-[var(--paper-sunken)] transition-colors"
              >
                {p.label}
              </button>
            ))}
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            <span className="text-sm text-[var(--ink-muted)]">to</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
          </div>
        }
      />
      {dateError && <p className="text-sm font-semibold text-[var(--danger)] -mt-4 mb-4">{dateError}</p>}

      {error && (
        <Card className="mb-4"><ErrorState error={error} onRetry={load} /></Card>
      )}

      {/* KPI row -- "as of now" tiles don't move with the date range above; "selected period"
          ones do. Pinned above the tabs, always visible regardless of which tab is active. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
        <StatCard label="Open Batches" sub="as of now" value={loading ? '—' : (production.active_batches ?? '—')} icon={<Factory size={22} />} />
        <StatCard label="Open Lots" sub="as of now" value={loading ? '—' : (production.active_lots ?? '—')} icon={<Layers size={22} />} />
        <StatCard
          label="Avg Yield"
          sub="selected period"
          value={loading ? '—' : avgYieldPct != null ? `${avgYieldPct.toFixed(1)}%` : '—'}
          icon={<TrendingUp size={22} />}
        />
        <StatCard label="Scrap" sub="selected period" value={loading ? '—' : formatQty(scrapKg, 'kg')} icon={<AlertTriangle size={22} />} />
        <StatCard
          label="Needs Reorder"
          sub="as of now"
          value={loading ? '—' : needsReorder}
          icon={<PackageX size={22} />}
          accent={needsReorder > 0}
        />
        <StatCard label="Completed Today" sub="as of now" value={loading ? '—' : (production.completed_today ?? '—')} icon={<TrendingUp size={22} />} />
      </div>

      {/* Tab strip -- Yield / Stock Levels / Trends each fill the remaining screen height below
          this, one at a time, so no section has to compete for space with the others. */}
      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'text-sm font-bold px-3.5 min-h-11 rounded-lg border-2 transition-colors',
              tab === t.key
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'border-[var(--border-strong)] text-[var(--ink-light)] hover:bg-[var(--paper-sunken)]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === 'yield' && (
          <Card
            title="Yield"
            subtitle="Actual output ÷ actual input across completed production steps"
            fill
            action={
              <div className="flex gap-2">
                <button
                  onClick={() => setYieldGroupBy('step')}
                  className={cn(
                    'text-sm font-bold px-3.5 min-h-11 rounded-lg border-2 transition-colors',
                    yieldGroupBy === 'step'
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'border-[var(--border-strong)] text-[var(--ink-light)] hover:bg-[var(--paper-sunken)]'
                  )}
                >
                  By Step
                </button>
                <button
                  onClick={() => setYieldGroupBy('sku')}
                  className={cn(
                    'text-sm font-bold px-3.5 min-h-11 rounded-lg border-2 transition-colors',
                    yieldGroupBy === 'sku'
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'border-[var(--border-strong)] text-[var(--ink-light)] hover:bg-[var(--paper-sunken)]'
                  )}
                >
                  By SKU
                </button>
              </div>
            }
          >
            <BarChart
              rows={yieldRows}
              series={[{ key: 'yield', label: 'Yield %' }]}
              formatValue={(v) => `${v.toFixed(1)}%`}
              emptyMessage="No completed production steps in the selected range."
            />
            {yieldData.rows.length > 0 && (
              <div className="mt-4 flex-1 min-h-0 flex flex-col">
                <Table
                  columns={[
                    { key: 'key', header: yieldGroupBy === 'step' ? 'Step' : 'SKU', render: (r: YieldSummaryRow) => yieldRowLabel(r) },
                    { key: 'total_input_qty', header: 'Input', render: (r: YieldSummaryRow) => <span className="font-mono">{formatQty(r.total_input_qty)}</span> },
                    { key: 'total_output_qty', header: 'Output', render: (r: YieldSummaryRow) => <span className="font-mono">{formatQty(r.total_output_qty)}</span> },
                    { key: 'yield_pct', header: 'Yield', render: (r: YieldSummaryRow) => <span className="font-mono font-medium">{r.yield_pct.toFixed(1)}%</span> },
                    { key: 'instance_count', header: 'Instances', render: (r: YieldSummaryRow) => <span className="font-mono text-[var(--ink-muted)]">{r.instance_count}</span> },
                  ]}
                  data={yieldData.rows}
                  keyExtractor={(r) => r.key}
                />
              </div>
            )}
          </Card>
        )}

        {tab === 'stock' && (
          <Card
            title="Stock Levels"
            subtitle={
              stock
                ? `${stock.summary.out_of_stock_count} out of stock, ${stock.summary.low_stock_count} running low · based on the trailing ${stock.usage_window_days} days of usage`
                : 'as of now'
            }
            noPadding
            fill
          >
            <Table
              columns={[
                { key: 'category', header: 'Type', render: (r: (typeof stockRows)[number]) => <span className="text-[var(--ink-muted)]">{r.category}</span> },
                { key: 'name', header: 'Item', render: (r: (typeof stockRows)[number]) => <span className="font-medium">{r.name}</span> },
                { key: 'current_stock', header: 'On Hand', render: (r: (typeof stockRows)[number]) => <span className="font-mono">{formatQty(r.current_stock, r.unit)}</span> },
                {
                  key: 'days_of_cover',
                  header: 'Days of Cover',
                  render: (r: (typeof stockRows)[number]) => (
                    <span className="font-mono text-[var(--ink-muted)]">{r.days_of_cover != null ? r.days_of_cover.toFixed(1) : '—'}</span>
                  ),
                },
                { key: 'status', header: 'Status', render: (r: (typeof stockRows)[number]) => <Badge variant={stockStatusBadge(r.status)}>{r.status}</Badge> },
              ]}
              data={stockRows}
              keyExtractor={(r) => `${r.category}-${r.id}`}
              loading={loading}
              emptyMessage="No stock data available."
            />
          </Card>
        )}

        {tab === 'trends' && (
          <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Scrap Trend" subtitle="Weight-denominated (kg), per day" fill>
              <div className="flex-1 min-h-0">
                <LineChart points={scrapPoints} series={[{ key: 'scrap', label: 'Scrap (kg)' }]} formatValue={(v) => formatQty(v, 'kg')} />
              </div>
            </Card>
            <Card title="Production Trend" subtitle="Batches created and lots completed, per day" fill>
              <div className="flex-1 min-h-0">
                <LineChart
                  points={activityPoints}
                  series={[
                    { key: 'batches', label: 'Batches Created' },
                    { key: 'lots', label: 'Lots Completed' },
                  ]}
                  formatValue={(v) => v.toLocaleString()}
                />
              </div>
            </Card>
          </div>
        )}
      </div>

      <div className="text-center pt-3 flex-shrink-0">
        <Link href="/reports/detailed" className="text-base font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1.5">
          View detailed reports <ArrowRight size={18} />
        </Link>
      </div>
    </AppShell>
  );
}

function yieldRowLabel(r: YieldSummaryRow): string {
  return r.label || stepLabel(r.key);
}
