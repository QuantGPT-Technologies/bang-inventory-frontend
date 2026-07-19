'use client';
import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, StatCard } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { ErrorState } from '@/components/ui/ErrorState';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { reportsApi } from '@/lib/api';
import { formatQty, parseApiError, STEP_LABELS, type ApiErrorInfo } from '@/lib/utils';
import { BarChart, type BarChartRow } from '@/components/charts/BarChart';
import { LineChart, type LineChartPoint } from '@/components/charts/LineChart';
import { FileText } from 'lucide-react';

type ReportType = 'production' | 'scrap' | 'material' | 'raw-material' | 'step' | 'trends';

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: 'production', label: 'Production Summary' },
  { value: 'scrap', label: 'Scrap Summary' },
  { value: 'material', label: 'Material Usage (by Step)' },
  { value: 'raw-material', label: 'Raw Material Usage' },
  { value: 'step', label: 'Step-wise Usage' },
  { value: 'trends', label: 'Trends (Date-wise)' },
];

// Step keys are data-driven (workflow templates can define arbitrary node_keys), so this is a
// display-only fallback to the raw key — not a validation list.
function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? step;
}

function groupByUnit<T extends { unit: string }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.unit) ?? [];
    list.push(row);
    groups.set(row.unit, list);
  }
  return Array.from(groups.entries());
}

const TREND_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('production');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateError, setDateError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const runReport = useCallback(async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setDateError('Start date must be before end date');
      return;
    }
    setDateError('');
    setLoading(true);
    setError(null);
    try {
      const params = dateFrom || dateTo ? { date_from: dateFrom || undefined, date_to: dateTo || undefined } : undefined;
      let res;
      switch (reportType) {
        case 'production':
          res = await reportsApi.productionSummary();
          break;
        case 'scrap':
          res = await reportsApi.scrapSummary(params);
          break;
        case 'material':
          res = await reportsApi.materialUsage(params);
          break;
        case 'raw-material':
          res = await reportsApi.rawMaterialUsage(params);
          break;
        case 'step':
          res = await reportsApi.stepUsage(params);
          break;
        case 'trends':
          res = await reportsApi.trends(params);
          break;
      }
      setData(res.data?.data ?? {});
    } catch (err) {
      const info = parseApiError(err);
      setError(info);
      setData(null);
      toast.error(info.message);
    } finally {
      setLoading(false);
    }
  }, [reportType, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await runReport();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType]);

  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    setDateTo(to.toISOString().slice(0, 10));
    setDateFrom(from.toISOString().slice(0, 10));
  };

  return (
    <AppShell>
      <PageHeader
        title="Reports"
        subtitle="Production analytics and summaries"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              options={REPORT_OPTIONS}
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-52"
              placeholder=""
            />
            {reportType !== 'production' && (
              <>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 text-xs py-1.5" />
                <span className="text-xs text-[var(--ink-muted)]">to</span>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 text-xs py-1.5" />
              </>
            )}
            <Button onClick={runReport} loading={loading} disabled={loading}>
              <FileText size={14} /> Run Report
            </Button>
          </div>
        }
      />
      {dateError && <p className="text-xs text-red-600 -mt-4 mb-4">{dateError}</p>}

      {reportType === 'trends' && (
        <div className="flex items-center gap-2 mb-4 -mt-2">
          <span className="text-xs text-[var(--ink-muted)]">Presets:</span>
          {TREND_PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => applyPreset(p.days)}
              className="text-xs px-2.5 py-1 rounded border border-[var(--border-light)] text-[var(--ink-light)] hover:bg-[var(--paper-dark)] transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <Card><ErrorState error={error} onRetry={runReport} /></Card>
      ) : loading && !data ? (
        <Card><div className="p-8 text-center text-sm text-[var(--ink-muted)]">Loading report…</div></Card>
      ) : (
        <>
          {reportType === 'production' && data && <ProductionSummary data={data} />}
          {reportType === 'scrap' && data && <ScrapSummary data={data} />}
          {reportType === 'material' && data && <MaterialUsage data={data} />}
          {reportType === 'raw-material' && data && <RawMaterialUsage data={data} />}
          {reportType === 'step' && data && <StepUsage data={data} />}
          {reportType === 'trends' && data && <Trends data={data} />}
        </>
      )}
    </AppShell>
  );
}

function ProductionSummary({ data }: { data: Record<string, unknown> }) {
  const byStep = (data as { by_step?: Record<string, number> }).by_step ?? {};
  const rows: BarChartRow[] = Object.entries(byStep).map(([step, count]) => ({
    category: stepLabel(step),
    values: { count },
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Batches" value={String((data.total_batches as number) || 0)} />
        <StatCard label="Completed Batches" value={String((data.completed_batches as number) || 0)} />
        <StatCard label="Total Lots" value={String((data.total_lots as number) || 0)} />
        <StatCard label="Completed Lots" value={String((data.completed_lots as number) || 0)} />
      </div>
      <Card title="Production by Step" subtitle="Completed step-instances, current step-order">
        <BarChart
          rows={rows}
          series={[{ key: 'count', label: 'Completed' }]}
          formatValue={(v) => v.toLocaleString()}
          emptyMessage="No production data available."
        />
      </Card>
      {rows.length > 0 && (
        <Card title="Production by Step — table" noPadding>
          <Table
            columns={[
              { key: 'step', header: 'Step' },
              { key: 'count', header: 'Completed', render: (r: { step: string; count: number }) => <span className="font-mono">{r.count}</span> },
            ]}
            data={Object.entries(byStep).map(([step, count]) => ({ step: stepLabel(step), count }))}
            keyExtractor={(r) => r.step}
          />
        </Card>
      )}
    </div>
  );
}

function ScrapSummary({ data }: { data: Record<string, unknown> }) {
  const byType = (data as { by_type?: Record<string, number> }).by_type ?? {};
  const rows: BarChartRow[] = Object.entries(byType).map(([type, qty]) => ({
    category: type.replace(/_/g, ' '),
    values: { qty },
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total Scrap" value={formatQty((data as { total_kg?: number }).total_kg || 0, 'kg')} />
      </div>
      <Card title="Scrap by Type" subtitle="Weight-denominated (kg) — piece-count scrap isn't convertible and is excluded">
        <BarChart
          rows={rows}
          series={[{ key: 'qty', label: 'Scrap (kg)' }]}
          formatValue={(v) => formatQty(v, 'kg')}
          emptyMessage="No scrap data available for the selected range."
        />
      </Card>
    </div>
  );
}

function MaterialUsage({ data }: { data: Record<string, unknown> }) {
  const rows = (data as { by_material?: { name: string; total_qty: number; unit: string }[] }).by_material || [];
  const groups = groupByUnit(rows);

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <Card title="Material Usage">
          <p className="text-sm text-[var(--ink-muted)] italic">No material usage data available for the selected range.</p>
        </Card>
      ) : (
        groups.map(([unit, group]) => (
          <Card key={unit} title={`Material Usage — ${unit}`}>
            <BarChart
              rows={group.map((r) => ({ category: r.name, values: { qty: r.total_qty } }))}
              series={[{ key: 'qty', label: `Used (${unit})` }]}
              formatValue={(v) => formatQty(v, unit)}
            />
          </Card>
        ))
      )}
    </div>
  );
}

function RawMaterialUsage({ data }: { data: Record<string, unknown> }) {
  const rows = (data as { by_material?: { name: string; unit: string; planned_qty: number; actual_qty: number; variance_qty: number }[] }).by_material || [];
  const groups = groupByUnit(rows);

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <Card title="Raw Material Usage">
          <p className="text-sm text-[var(--ink-muted)] italic">No raw material usage data available for the selected range.</p>
        </Card>
      ) : (
        groups.map(([unit, group]) => (
          <Card key={unit} title={`Raw Material Usage — ${unit}`} subtitle="Blend-time planned vs. actual consumption">
            <BarChart
              rows={group.map((r) => ({ category: r.name, values: { planned: r.planned_qty, actual: r.actual_qty } }))}
              series={[
                { key: 'planned', label: 'Planned' },
                { key: 'actual', label: 'Actual' },
              ]}
              formatValue={(v) => formatQty(v, unit)}
            />
          </Card>
        ))
      )}
      {rows.length > 0 && (
        <Card title="Variance — table" subtitle="Actual − planned; positive means more was used than planned" noPadding>
          <Table
            columns={[
              { key: 'name', header: 'Material', render: (r: (typeof rows)[number]) => <span className="font-medium">{r.name}</span> },
              { key: 'planned_qty', header: 'Planned', render: (r: (typeof rows)[number]) => <span className="font-mono">{formatQty(r.planned_qty, r.unit)}</span> },
              { key: 'actual_qty', header: 'Actual', render: (r: (typeof rows)[number]) => <span className="font-mono">{formatQty(r.actual_qty, r.unit)}</span> },
              {
                key: 'variance_qty',
                header: 'Variance',
                render: (r: (typeof rows)[number]) => (
                  <span className={`font-mono ${r.variance_qty > 0 ? 'text-[var(--accent)]' : r.variance_qty < 0 ? 'text-[var(--green)]' : ''}`}>
                    {r.variance_qty > 0 ? '+' : ''}
                    {formatQty(r.variance_qty, r.unit)}
                  </span>
                ),
              },
            ]}
            data={rows}
            keyExtractor={(r) => r.name}
          />
        </Card>
      )}
    </div>
  );
}

function StepUsage({ data }: { data: Record<string, unknown> }) {
  const steps = (data as { steps?: { step: string; completed_count: number; scrap_kg: number; consumables: { name: string; unit: string; total_qty: number }[] }[] }).steps || [];

  const consumableRows = steps.flatMap((s) =>
    s.consumables.map((c) => ({ step: stepLabel(s.step), name: c.name, unit: c.unit, total_qty: c.total_qty }))
  );

  return (
    <div className="space-y-4">
      <Card title="Completed Step-Instances" subtitle="Count of step executions completed in range">
        <BarChart
          rows={steps.map((s) => ({ category: stepLabel(s.step), values: { count: s.completed_count } }))}
          series={[{ key: 'count', label: 'Completed' }]}
          formatValue={(v) => v.toLocaleString()}
          emptyMessage="No step activity in the selected range."
        />
      </Card>
      <Card title="Scrap by Step" subtitle="Weight-denominated (kg)">
        <BarChart
          rows={steps.map((s) => ({ category: stepLabel(s.step), values: { kg: s.scrap_kg } }))}
          series={[{ key: 'kg', label: 'Scrap (kg)' }]}
          formatValue={(v) => formatQty(v, 'kg')}
          emptyMessage="No scrap recorded in the selected range."
        />
      </Card>
      <Card title="Consumables by Step — table" noPadding>
        <Table
          columns={[
            { key: 'step', header: 'Step' },
            { key: 'name', header: 'Consumable' },
            { key: 'total_qty', header: 'Total Used', render: (r: (typeof consumableRows)[number]) => <span className="font-mono">{formatQty(r.total_qty, r.unit)}</span> },
          ]}
          data={consumableRows}
          keyExtractor={(r) => `${r.step}-${r.name}`}
          emptyMessage="No consumable usage in the selected range."
        />
      </Card>
    </div>
  );
}

function Trends({ data }: { data: Record<string, unknown> }) {
  const days = (data as { days?: { date: string; batches_created: number; lots_completed: number; scrap_kg: number }[] }).days || [];
  const activityPoints: LineChartPoint[] = days.map((d) => ({
    x: d.date,
    values: { batches: d.batches_created, lots: d.lots_completed },
  }));
  const scrapPoints: LineChartPoint[] = days.map((d) => ({ x: d.date, values: { scrap: d.scrap_kg } }));

  return (
    <div className="space-y-4">
      <Card title="Production Activity" subtitle="Batches created and lots completed, per day">
        <LineChart
          points={activityPoints}
          series={[
            { key: 'batches', label: 'Batches Created' },
            { key: 'lots', label: 'Lots Completed' },
          ]}
          formatValue={(v) => v.toLocaleString()}
        />
      </Card>
      <Card title="Scrap Trend" subtitle="Weight-denominated (kg), per day">
        <LineChart points={scrapPoints} series={[{ key: 'scrap', label: 'Scrap (kg)' }]} formatValue={(v) => formatQty(v, 'kg')} />
      </Card>
    </div>
  );
}
