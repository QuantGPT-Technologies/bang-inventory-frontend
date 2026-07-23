'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, TABLE_ROW_HEIGHT_PX } from '@/components/ui/Table';
import { ErrorState } from '@/components/ui/ErrorState';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { reportsApi } from '@/lib/api';
import { formatQty, parseApiError, type ApiErrorInfo } from '@/lib/utils';
import { BarChart } from '@/components/charts/BarChart';
import { useFitRowCount } from '@/lib/useFitRowCount';
import { capList } from '@/lib/capList';
import { FileText } from 'lucide-react';
import { stepLabel, groupByUnit } from '../shared';

type ReportType = 'material' | 'raw-material' | 'step';

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: 'material', label: 'Material Usage (by Step)' },
  { value: 'raw-material', label: 'Raw Material Usage' },
  { value: 'step', label: 'Step-wise Usage' },
];

/**
 * The three granular, drill-down reports demoted off the main Insights dashboard -- too specific
 * for a glance-level pane, still available one click away via its "View detailed reports" link.
 * Kept as a report-type switcher (rather than folded into one scrollable page like Insights)
 * since these are genuinely separate deep-dive questions, not things a manager scans together.
 */
export default function DetailedReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('material');
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
        case 'material':
          res = await reportsApi.materialUsage(params);
          break;
        case 'raw-material':
          res = await reportsApi.rawMaterialUsage(params);
          break;
        case 'step':
          res = await reportsApi.stepUsage(params);
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

  return (
    <AppShell>
      <PageHeader
        title="Detailed Reports"
        subtitle="Granular usage and variance breakdowns"
        breadcrumb={[{ label: 'Insights', href: '/reports' }, { label: 'Detailed Reports' }]}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              options={REPORT_OPTIONS}
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-52"
              placeholder=""
            />
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            <span className="text-sm text-[var(--ink-muted)]">to</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            <Button onClick={runReport} loading={loading} disabled={loading}>
              <FileText size={18} /> Run Report
            </Button>
          </div>
        }
      />
      {dateError && <p className="text-sm font-semibold text-[var(--danger)] -mt-4 mb-4">{dateError}</p>}

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {error ? (
          <Card><ErrorState error={error} onRetry={runReport} /></Card>
        ) : loading && !data ? (
          <Card><div className="p-8 text-center text-base text-[var(--ink-muted)]">Loading report…</div></Card>
        ) : (
          <>
            {reportType === 'material' && data && <MaterialUsage data={data} />}
            {reportType === 'raw-material' && data && <RawMaterialUsage data={data} />}
            {reportType === 'step' && data && <StepUsage data={data} />}
          </>
        )}
      </div>
    </AppShell>
  );
}

function MaterialUsage({ data }: { data: Record<string, unknown> }) {
  const rows = (data as { by_material?: { name: string; total_qty: number; unit: string }[] }).by_material || [];
  const groups = groupByUnit(rows);
  // Distinct units are typically 2-4 (kg, g, L, pcs) in practice -- capped so a data set with
  // unusually many distinct units still fits on screen, rather than growing the page unbounded.
  const { visible: visibleGroups, hiddenCount } = capList(groups, 4);

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
      {rows.length === 0 ? (
        <Card title="Material Usage">
          <p className="text-base text-[var(--ink-muted)] italic">No material usage data available for the selected range.</p>
        </Card>
      ) : (
        <>
          {visibleGroups.map(([unit, group]) => (
            <Card key={unit} title={`Material Usage — ${unit}`} className="flex-1 min-h-0" fill>
              <BarChart
                rows={group.map((r) => ({ category: r.name, values: { qty: r.total_qty } }))}
                series={[{ key: 'qty', label: `Used (${unit})` }]}
                formatValue={(v) => formatQty(v, unit)}
              />
            </Card>
          ))}
          {hiddenCount > 0 && (
            <p className="text-sm text-[var(--ink-muted)] flex-shrink-0">+{hiddenCount} more unit group{hiddenCount === 1 ? '' : 's'} not shown</p>
          )}
        </>
      )}
    </div>
  );
}

function RawMaterialUsage({ data }: { data: Record<string, unknown> }) {
  const rows = (data as { by_material?: { name: string; unit: string; planned_qty: number; actual_qty: number; variance_qty: number }[] }).by_material || [];
  const groups = groupByUnit(rows);
  const { visible: visibleGroups, hiddenCount } = capList(groups, 2);

  const varianceTableRef = useRef<HTMLDivElement>(null);
  const varianceRowCount = useFitRowCount(varianceTableRef, TABLE_ROW_HEIGHT_PX, 3, 100, 10);
  const varianceVisible = rows.slice(0, varianceRowCount);
  const varianceHiddenCount = rows.length - varianceVisible.length;

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
      {rows.length === 0 ? (
        <Card title="Raw Material Usage">
          <p className="text-base text-[var(--ink-muted)] italic">No raw material usage data available for the selected range.</p>
        </Card>
      ) : (
        <>
          {visibleGroups.map(([unit, group]) => (
            <Card key={unit} title={`Raw Material Usage — ${unit}`} subtitle="Blend-time planned vs. actual consumption" className="flex-shrink-0">
              <BarChart
                rows={group.map((r) => ({ category: r.name, values: { planned: r.planned_qty, actual: r.actual_qty } }))}
                series={[
                  { key: 'planned', label: 'Planned' },
                  { key: 'actual', label: 'Actual' },
                ]}
                formatValue={(v) => formatQty(v, unit)}
              />
            </Card>
          ))}
          {hiddenCount > 0 && (
            <p className="text-sm text-[var(--ink-muted)] flex-shrink-0">+{hiddenCount} more unit group{hiddenCount === 1 ? '' : 's'} not shown</p>
          )}
          <Card title="Variance — table" subtitle="Actual − planned; positive means more was used than planned" noPadding fill>
            <Table
              columns={[
                { key: 'name', header: 'Material', render: (r: (typeof rows)[number]) => <span className="font-medium">{r.name}</span> },
                { key: 'planned_qty', header: 'Planned', render: (r: (typeof rows)[number]) => <span className="font-mono">{formatQty(r.planned_qty, r.unit)}</span> },
                { key: 'actual_qty', header: 'Actual', render: (r: (typeof rows)[number]) => <span className="font-mono">{formatQty(r.actual_qty, r.unit)}</span> },
                {
                  key: 'variance_qty',
                  header: 'Variance',
                  render: (r: (typeof rows)[number]) => (
                    <span className={`font-mono font-semibold ${r.variance_qty > 0 ? 'text-[var(--warning)]' : r.variance_qty < 0 ? 'text-[var(--success)]' : ''}`}>
                      {r.variance_qty > 0 ? '+' : ''}
                      {formatQty(r.variance_qty, r.unit)}
                    </span>
                  ),
                },
              ]}
              data={varianceVisible}
              keyExtractor={(r) => r.name}
              bodyRef={varianceTableRef}
            />
            {varianceHiddenCount > 0 && (
              <p className="text-sm text-[var(--ink-muted)] px-4 py-2 border-t border-[var(--border)]">+{varianceHiddenCount} more not shown</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function StepUsage({ data }: { data: Record<string, unknown> }) {
  const steps = (data as { steps?: { step: string; completed_count: number; scrap_kg: number; consumables: { name: string; unit: string; total_qty: number }[] }[] }).steps || [];

  const consumableRows = steps.flatMap((s) =>
    s.consumables.map((c) => ({ step: stepLabel(s.step), name: c.name, unit: c.unit, total_qty: c.total_qty }))
  );

  const consumablesTableRef = useRef<HTMLDivElement>(null);
  const consumablesRowCount = useFitRowCount(consumablesTableRef, TABLE_ROW_HEIGHT_PX, 3, 100, 10);
  const consumablesVisible = consumableRows.slice(0, consumablesRowCount);
  const consumablesHiddenCount = consumableRows.length - consumablesVisible.length;

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
      <Card title="Completed Step-Instances" subtitle="Count of step executions completed in range" className="flex-shrink-0">
        <BarChart
          rows={steps.map((s) => ({ category: stepLabel(s.step), values: { count: s.completed_count } }))}
          series={[{ key: 'count', label: 'Completed' }]}
          formatValue={(v) => v.toLocaleString()}
          emptyMessage="No step activity in the selected range."
        />
      </Card>
      <Card title="Scrap by Step" subtitle="Weight-denominated (kg)" className="flex-shrink-0">
        <BarChart
          rows={steps.map((s) => ({ category: stepLabel(s.step), values: { kg: s.scrap_kg } }))}
          series={[{ key: 'kg', label: 'Scrap (kg)' }]}
          formatValue={(v) => formatQty(v, 'kg')}
          emptyMessage="No scrap recorded in the selected range."
        />
      </Card>
      <Card title="Consumables by Step — table" noPadding fill>
        <Table
          columns={[
            { key: 'step', header: 'Step' },
            { key: 'name', header: 'Consumable' },
            { key: 'total_qty', header: 'Total Used', render: (r: (typeof consumableRows)[number]) => <span className="font-mono">{formatQty(r.total_qty, r.unit)}</span> },
          ]}
          data={consumablesVisible}
          keyExtractor={(r) => `${r.step}-${r.name}`}
          emptyMessage="No consumable usage in the selected range."
          bodyRef={consumablesTableRef}
        />
        {consumablesHiddenCount > 0 && (
          <p className="text-sm text-[var(--ink-muted)] px-4 py-2 border-t border-[var(--border)]">+{consumablesHiddenCount} more not shown</p>
        )}
      </Card>
    </div>
  );
}
