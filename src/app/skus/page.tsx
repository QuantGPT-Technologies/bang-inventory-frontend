'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { skusApi, customersApi, rawMaterialsApi } from '@/lib/api';
import { SKU, Customer, RawMaterial, PaginatedResponse } from '@/lib/types';
import { formatDate, formatQty, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { skuSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { Plus, X } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<SKU> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

export default function SKUsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);

  const fetchSkus = useCallback(async () => {
    const res = await skusApi.list(page, PER_PAGE);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page]);

  const { data, loading, error, reload } = useAsyncQuery(fetchSkus, [page], EMPTY);
  const skus = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  useEffect(() => {
    customersApi.list(1, 100).then((r) => setCustomers(r.data.data?.items || [])).catch(() => {});
    rawMaterialsApi.list(1, 100).then((r) => setRawMaterials(r.data.data?.items || [])).catch(() => {
      toast.error('Failed to load raw materials list. SKU creation may be unavailable.');
    });
  }, []);

  const columns = [
    { key: 'name', header: 'Name', primary: true, render: (row: SKU) => <span className="font-medium">{row.name}</span> },
    { key: 'code', header: 'SKU Code', render: (row: SKU) => <span className="font-mono font-medium">{row.code}</span> },
    { key: 'customer_name', header: 'Customer', render: (row: SKU) => row.customer_name || '—' },
    { key: 'unit', header: 'Unit', hideInCard: true },
    {
      key: 'current_stock',
      header: 'Stock',
      render: (row: SKU) => <span className="font-mono">{formatQty(row.current_stock, row.unit)}</span>,
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (row: SKU) => (
        <Badge variant={row.is_active ? 'success' : 'muted'}>{row.is_active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    { key: 'created_at', header: 'Created', hideInCard: true, render: (row: SKU) => formatDate(row.created_at) },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Products"
        subtitle="What we sell"
        action={
          canAccess(user, 'skus', 'write') && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New Product
            </Button>
          )
        }
      />

      <Card noPadding>
        {error && !loading ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <Table
              columns={columns}
              data={skus}
              keyExtractor={(r) => r.id}
              onRowClick={(r) => router.push(`/skus/${r.id}`)}
              loading={loading}
              emptyMessage="No products found. Create one to get started."
            />
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CreateSKUModal
          customers={customers}
          rawMaterials={rawMaterials}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setPage(1); reload(); }}
        />
      )}
    </AppShell>
  );
}

interface MaterialRow { raw_material_id: number; ratio_percent: string }

function CreateSKUModal({
  customers,
  rawMaterials,
  onClose,
  onCreated,
}: {
  customers: Customer[];
  rawMaterials: RawMaterial[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [unit, setUnit] = useState('pcs');
  const [materials, setMaterials] = useState<MaterialRow[]>([{ raw_material_id: 0, ratio_percent: '' }]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const noMaterialsAvailable = rawMaterials.length === 0;

  const addMaterial = () => setMaterials((m) => [...m, { raw_material_id: 0, ratio_percent: '' }]);
  const removeMaterial = (i: number) => setMaterials((m) => (m.length > 1 ? m.filter((_, idx) => idx !== i) : m));
  const updateMaterial = (i: number, field: keyof MaterialRow, value: string | number) =>
    setMaterials((m) => m.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const totalRatio = useMemo(
    () => materials.reduce((s, m) => s + (toNumber(m.ratio_percent) || 0), 0),
    [materials]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = {
      code,
      name,
      description,
      customer_id: customerId,
      unit,
      materials: materials
        .filter((m) => m.raw_material_id > 0 || m.ratio_percent !== '')
        .map((m) => ({ raw_material_id: m.raw_material_id, ratio_percent: toNumber(m.ratio_percent) })),
    };

    const result = validate(skuSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      await skusApi.create(result.data);
      toast.success('Product created');
      onCreated();
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
      title="New Product"
      subtitle="Add a finished product"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>
            Create Product
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="SKU Code" value={code} onChange={(e) => setCode(e.target.value)} error={errors.code} placeholder="SKU-001" maxLength={50} />
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Product Name" maxLength={150} />
        </div>
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} error={errors.description} />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Customer"
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            value={customerId || ''}
            onChange={(e) => setCustomerId(Number(e.target.value) || undefined)}
            placeholder="Internal / No customer"
          />
          <Select
            label="Unit"
            options={[{ value: 'pcs', label: 'pcs' }, { value: 'kg', label: 'kg' }, { value: 'g', label: 'g' }]}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder=""
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide">
              What It&apos;s Made Of (must add up to 100%)
            </label>
            <Button variant="ghost" size="sm" type="button" onClick={addMaterial} disabled={noMaterialsAvailable}>
              <Plus size={16} /> Add
            </Button>
          </div>
          {noMaterialsAvailable && (
            <p className="text-sm font-semibold text-[var(--warning)] bg-[var(--warning-tint)] border-2 border-[var(--warning)] rounded-lg px-3 py-2 mb-2">
              No raw materials exist yet. Create one under Raw Materials before setting what this product is made from.
            </p>
          )}
          <div className="text-sm text-[var(--ink-muted)] mb-2">
            Adds up to: <span className={Math.abs(totalRatio - 100) < 0.01 ? 'text-[var(--success)] font-bold' : 'text-[var(--warning)] font-bold'}>{totalRatio.toFixed(1)}%</span>
          </div>
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
                <div className="w-24">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={m.ratio_percent}
                    onChange={(e) => updateMaterial(i, 'ratio_percent', e.target.value)}
                    placeholder="%"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeMaterial(i)}
                  disabled={materials.length === 1}
                  className="flex items-center gap-1.5 text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--danger)] min-h-11 px-2 disabled:opacity-30"
                >
                  <X size={18} /> Remove
                </button>
              </div>
            ))}
          </div>
          {errors.materials && <p className="text-sm font-semibold text-[var(--danger)] mt-1.5">{errors.materials}</p>}
        </div>
      </form>
    </Modal>
  );
}
