'use client';
import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination } from '@/components/ui/Table';
import { Badge, batchStatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ErrorState } from '@/components/ui/ErrorState';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { batchesApi, rawMaterialsApi } from '@/lib/api';
import { Batch, RawMaterial, PaginatedResponse } from '@/lib/types';
import { formatDate, formatQty, BATCH_STATUS_LABELS, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { createBatchSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { Plus, X, Search } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<Batch> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

export default function BatchesPage() {
  return (
    <Suspense fallback={null}>
      <BatchesPageInner />
    </Suspense>
  );
}

function BatchesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Lets links elsewhere in the app (e.g. dashboard stat tiles) land here pre-filtered, using the
  // same `status` values this page's own dropdown already sets -- read once on mount only, so the
  // dropdown remains the single source of truth for filter state afterwards.
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || '');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);

  // Debounced so typing a batch number doesn't fire a request per keystroke. The page reset
  // lives in this same callback (not the input's onChange) so it fires once, together with the
  // debounced value, instead of firing an extra fetch with the stale search term immediately
  // whenever the user was on page >1.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchBatches = useCallback(async () => {
    const params: Record<string, unknown> = { page, per_page: PER_PAGE };
    if (statusFilter) params.status = statusFilter;
    if (debouncedSearch) params.q = debouncedSearch;
    const res = await batchesApi.list(params);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page, statusFilter, debouncedSearch]);

  const { data, loading, error, reload } = useAsyncQuery(fetchBatches, [page, statusFilter, debouncedSearch], EMPTY);
  const batches = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  // If the current page is now out of range (e.g. after a filter change), snap back —
  // adjusted during render per https://react.dev/learn/you-might-not-need-an-effect
  // ("Adjusting some state when a prop changes"), which permits setState during render
  // as long as it's guarded by a comparison against previous render's tracked value.
  const [prevRangeKey, setPrevRangeKey] = useState<string | null>(null);
  const rangeKey = `${page}:${total}:${batches.length}:${loading}`;
  if (rangeKey !== prevRangeKey) {
    setPrevRangeKey(rangeKey);
    if (!loading && batches.length === 0 && page > 1 && total > 0) {
      setPage(1);
    }
  }

  useEffect(() => {
    rawMaterialsApi.list(1, 100).then((r) => setRawMaterials(r.data.data?.items || [])).catch(() => {
      toast.error('Failed to load raw materials list. Batch creation may be unavailable.');
    });
  }, []);

  const columns = [
    {
      key: 'batch_number',
      header: 'Batch #',
      primary: true,
      render: (row: Batch) => (
        <span className="font-mono font-bold text-base text-[var(--accent)]">{row.batch_number}</span>
      ),
    },
    { key: 'total_blend_qty', header: 'Total Qty', render: (row: Batch) => formatQty(row.total_blend_qty, row.unit) },
    {
      key: 'status',
      header: 'Status',
      render: (row: Batch) => (
        <Badge variant={batchStatusBadge(row.status)}>{BATCH_STATUS_LABELS[row.status] || row.status}</Badge>
      ),
    },
    { key: 'created_at', header: 'Created', hideInCard: true, render: (row: Batch) => formatDate(row.created_at) },
  ];

  const canCreate = canAccess(user, 'batches', 'create');

  return (
    <AppShell>
      <PageHeader
        title="Batches"
        subtitle="Mixing batches and production runs"
        action={
          canCreate && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New Batch
            </Button>
          )
        }
      />

      <Card noPadding>
        {/* Filters */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] flex-wrap">
          <div className="relative w-64">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search batch #"
              className="pl-11"
            />
          </div>
          <Select
            options={[
              { value: '', label: 'All Statuses' },
              ...Object.entries(BATCH_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
            ]}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="w-48"
            placeholder=""
          />
        </div>

        {error && !loading ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <Table
              columns={columns}
              data={batches}
              keyExtractor={(r) => r.id}
              onRowClick={(r) => router.push(`/batches/${r.id}`)}
              loading={loading}
              emptyMessage={statusFilter ? 'No batches match this filter.' : 'No batches found. Create one to get started.'}
            />
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CreateBatchModal
          rawMaterials={rawMaterials}
          onClose={() => setShowCreate(false)}
          // Straight to the new batch's detail page -- "Start Blending" is almost always the
          // very next thing to do, so landing back on the list would just mean finding it again.
          onCreated={(newBatchId) => { setShowCreate(false); router.push(`/batches/${newBatchId}`); }}
        />
      )}
    </AppShell>
  );
}

interface MaterialRow { raw_material_id: number; planned_qty: string }

function CreateBatchModal({
  rawMaterials,
  onClose,
  onCreated,
}: {
  rawMaterials: RawMaterial[];
  onClose: () => void;
  onCreated: (newBatchId: number) => void;
}) {
  const [totalQty, setTotalQty] = useState('');
  const [unit, setUnit] = useState('kg');
  const [notes, setNotes] = useState('');
  const [materials, setMaterials] = useState<MaterialRow[]>([{ raw_material_id: 0, planned_qty: '' }]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const noMaterialsAvailable = rawMaterials.length === 0;

  const addMaterial = () => setMaterials((m) => [...m, { raw_material_id: 0, planned_qty: '' }]);
  const removeMaterial = (i: number) => setMaterials((m) => (m.length > 1 ? m.filter((_, idx) => idx !== i) : m));
  const updateMaterial = (i: number, field: keyof MaterialRow, value: string | number) =>
    setMaterials((m) => m.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const plannedTotal = useMemo(
    () => materials.reduce((s, m) => s + (toNumber(m.planned_qty) || 0), 0),
    [materials]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = {
      total_blend_qty: toNumber(totalQty),
      unit,
      notes,
      materials: materials
        .filter((m) => m.raw_material_id > 0 || m.planned_qty !== '')
        .map((m) => ({ raw_material_id: m.raw_material_id, planned_qty: toNumber(m.planned_qty) })),
    };

    const result = validate(createBatchSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      const firstError = Object.values(result.errors)[0];
      if (firstError) toast.error(firstError);
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      const res = await batchesApi.create(result.data);
      toast.success('Batch created');
      onCreated(res.data.data.id);
    } catch (err) {
      const info = parseApiError(err);
      toast.error(info.message);
      if (info.fieldErrors) setErrors((prev) => ({ ...prev, ...info.fieldErrors }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New Batch"
      subtitle="Start a new mixing batch"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>
            Create Batch
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Total Amount to Mix"
            type="number"
            step="0.001"
            min="0"
            value={totalQty}
            onChange={(e) => setTotalQty(e.target.value)}
            error={errors.total_blend_qty}
            placeholder="350.000"
          />
          <Select
            label="Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            options={[{ value: 'kg', label: 'kg' }, { value: 'g', label: 'g' }, { value: 'pcs', label: 'pcs' }]}
            placeholder=""
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide">
              Raw Materials
            </label>
            <Button variant="ghost" size="sm" type="button" onClick={addMaterial} disabled={noMaterialsAvailable}>
              <Plus size={16} /> Add
            </Button>
          </div>
          {noMaterialsAvailable && (
            <p className="text-sm font-semibold text-[var(--warning)] bg-[var(--warning-tint)] border border-[var(--warning)] rounded-lg px-3 py-2 mb-2">
              No raw materials yet. Add one under Raw Materials first.
            </p>
          )}
          <div className="space-y-2">
            {materials.map((m, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Select
                    options={rawMaterials.map((r) => ({ value: r.id, label: `${r.name} (${r.unit})` }))}
                    value={m.raw_material_id || ''}
                    onChange={(e) => updateMaterial(i, 'raw_material_id', Number(e.target.value))}
                    placeholder="Select material…"
                  />
                </div>
                <div className="w-28">
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={m.planned_qty}
                    onChange={(e) => updateMaterial(i, 'planned_qty', e.target.value)}
                    placeholder="Qty"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeMaterial(i)}
                  disabled={materials.length === 1}
                  className="flex items-center gap-1.5 text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--danger)] min-h-[52px] px-2.5 disabled:opacity-30 disabled:hover:text-[var(--ink-muted)]"
                >
                  <X size={18} />
                  Remove
                </button>
              </div>
            ))}
          </div>
          {errors.materials && <p className="text-sm font-semibold text-[var(--danger)] mt-1.5">{errors.materials}</p>}
          <p className="text-sm text-[var(--ink-muted)] mt-1.5">
            Materials total: <span className="font-mono">{plannedTotal.toFixed(3)}</span> {unit}
          </p>
        </div>

        <Textarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          maxLength={1000}
        />
      </form>
    </Modal>
  );
}
