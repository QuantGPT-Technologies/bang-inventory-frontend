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
import { formatQty, parseApiError, type ApiErrorInfo } from '@/lib/utils';
import { FileText } from 'lucide-react';

type ReportType = 'production' | 'scrap' | 'material';

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
        title="Reports"
        subtitle="Production analytics and summaries"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              options={[
                { value: 'production', label: 'Production Summary' },
                { value: 'scrap', label: 'Scrap Summary' },
                { value: 'material', label: 'Material Usage' },
              ]}
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-40"
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

      {error ? (
        <Card><ErrorState error={error} onRetry={runReport} /></Card>
      ) : loading && !data ? (
        <Card><div className="p-8 text-center text-sm text-[var(--ink-muted)]">Loading report…</div></Card>
      ) : (
        <>
          {reportType === 'production' && data && <ProductionSummary data={data} />}
          {reportType === 'scrap' && data && <ScrapSummary data={data} />}
          {reportType === 'material' && data && <MaterialUsage data={data} />}
        </>
      )}
    </AppShell>
  );
}

function ProductionSummary({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Batches" value={String((data.total_batches as number) || 0)} />
        <StatCard label="Completed Batches" value={String((data.completed_batches as number) || 0)} />
        <StatCard label="Total Lots" value={String((data.total_lots as number) || 0)} />
        <StatCard label="Completed Lots" value={String((data.completed_lots as number) || 0)} />
      </div>
      <Card title="Production by Step">
        {(data as { by_step?: Record<string, number> }).by_step && Object.keys((data as { by_step: Record<string, number> }).by_step).length > 0 ? (
          <Table
            columns={[
              { key: 'step', header: 'Step' },
              { key: 'count', header: 'Completed', render: (r: { step: string; count: number }) => <span className="font-mono">{r.count}</span> },
            ]}
            data={Object.entries((data as { by_step: Record<string, number> }).by_step).map(([step, count]) => ({ step, count }))}
            keyExtractor={(r) => r.step}
            emptyMessage="No data"
          />
        ) : (
          <p className="text-sm text-[var(--ink-muted)] italic">No production data available.</p>
        )}
      </Card>
    </div>
  );
}

function ScrapSummary({ data }: { data: Record<string, unknown> }) {
  const byType = (data as { by_type?: Record<string, number> }).by_type;
  const rows = byType ? Object.entries(byType).map(([type, qty]) => ({ type, qty })) : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total Scrap" value={formatQty((data as { total_kg?: number }).total_kg || 0, 'kg')} />
      </div>
      <Card title="Scrap by Type">
        {rows.length > 0 ? (
          <Table
            columns={[
              { key: 'type', header: 'Scrap Type', render: (r: { type: string; qty: number }) => <span className="capitalize">{r.type.replace('_', ' ')}</span> },
              { key: 'qty', header: 'Quantity (kg)', render: (r: { type: string; qty: number }) => <span className="font-mono">{formatQty(r.qty, 'kg')}</span> },
            ]}
            data={rows}
            keyExtractor={(r) => r.type}
            emptyMessage="No scrap data"
          />
        ) : (
          <p className="text-sm text-[var(--ink-muted)] italic">No scrap data available for the selected range.</p>
        )}
      </Card>
    </div>
  );
}

function MaterialUsage({ data }: { data: Record<string, unknown> }) {
  const rows = (data as { by_material?: { name: string; total_qty: number; unit: string }[] }).by_material || [];

  return (
    <Card title="Material Usage">
      {rows.length > 0 ? (
        <Table
          columns={[
            { key: 'name', header: 'Material', render: (r: { name: string }) => <span className="font-medium">{r.name}</span> },
            { key: 'unit', header: 'Unit' },
            { key: 'total_qty', header: 'Total Used', render: (r: { name: string; total_qty: number; unit: string }) => <span className="font-mono">{formatQty(r.total_qty, r.unit)}</span> },
          ]}
          data={rows}
          keyExtractor={(r) => r.name}
          emptyMessage="No material usage data"
        />
      ) : (
        <p className="text-sm text-[var(--ink-muted)] italic">No material usage data available for the selected range.</p>
      )}
    </Card>
  );
}
