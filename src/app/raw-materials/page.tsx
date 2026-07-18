'use client';
import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination } from '@/components/ui/Table';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { rawMaterialsApi, vendorsApi } from '@/lib/api';
import { RawMaterial, Vendor, PaginatedResponse } from '@/lib/types';
import { formatDate, formatQty, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { rawMaterialSchema, stockAdjustSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { Plus, TrendingUp, TrendingDown, Pencil } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<RawMaterial> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

export default function RawMaterialsPage() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdjust, setShowAdjust] = useState<{ id: number; name: string; stock: number; unit: string } | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const canWrite = canAccess(user, 'raw_materials', 'write');
  const canStock = canAccess(user, 'raw_materials', 'stock');

  const fetchMaterials = useCallback(async () => {
    const res = await rawMaterialsApi.list(page, PER_PAGE);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page]);

  const { data, loading, error, reload } = useAsyncQuery(fetchMaterials, [page], EMPTY);
  const materials = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  useEffect(() => {
    vendorsApi.list(1, 100).then((r) => setVendors(r.data.data?.items || [])).catch(() => {});
  }, []);

  const columns = [
    { key: 'name', header: 'Name', render: (r: RawMaterial) => <span className="font-medium">{r.name}</span> },
    { key: 'code', header: 'Code', render: (r: RawMaterial) => r.code ? <span className="font-mono">{r.code}</span> : '—' },
    { key: 'vendor_name', header: 'Vendor', render: (r: RawMaterial) => r.vendor_name || '—' },
    {
      key: 'current_stock',
      header: 'Stock',
      render: (r: RawMaterial) => (
        <span className={`font-mono ${r.current_stock <= 0 ? 'text-red-600' : ''}`}>{formatQty(r.current_stock, r.unit)}</span>
      ),
    },
    { key: 'created_at', header: 'Added', render: (r: RawMaterial) => formatDate(r.created_at) },
    ...(canStock
      ? [
          {
            key: 'actions',
            header: '',
            render: (r: RawMaterial) => (
              <button
                onClick={(e) => { e.stopPropagation(); setShowAdjust({ id: r.id, name: r.name, stock: r.current_stock, unit: r.unit }); }}
                className="p-1 text-[var(--ink-muted)] hover:text-[var(--accent)]"
                title="Adjust stock"
              >
                <Pencil size={12} />
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <AppShell>
      <PageHeader
        title="Raw Materials"
        subtitle="Base materials for blending"
        action={
          canWrite && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Material
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
              data={materials}
              keyExtractor={(r) => r.id}
              loading={loading}
              emptyMessage="No raw materials found."
            />
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CreateMaterialModal
          vendors={vendors}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setPage(1); reload(); }}
        />
      )}
      {showAdjust && (
        <AdjustStockModal
          {...showAdjust}
          onClose={() => setShowAdjust(null)}
          onDone={() => { setShowAdjust(null); reload(); }}
        />
      )}
    </AppShell>
  );
}

function CreateMaterialModal({
  vendors,
  onClose,
  onCreated,
}: {
  vendors: Vendor[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [vendorId, setVendorId] = useState<number | undefined>();
  const [unit, setUnit] = useState('kg');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = { name, code, vendor_id: vendorId, unit };
    const result = validate(rawMaterialSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      await rawMaterialsApi.create(result.data);
      toast.success('Raw material created');
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
    <Modal open onClose={onClose} title="New Raw Material" size="sm"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>Create</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Iron Powder" maxLength={150} />
        <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} error={errors.code} placeholder="RM-001" maxLength={50} />
        <Select label="Vendor" options={vendors.map((v) => ({ value: v.id, label: v.name }))} value={vendorId || ''} onChange={(e) => setVendorId(Number(e.target.value) || undefined)} placeholder="No vendor" />
        <Select label="Unit" options={[{ value: 'kg', label: 'kg' }, { value: 'g', label: 'g' }, { value: 'L', label: 'L' }]} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="" />
      </form>
    </Modal>
  );
}

function AdjustStockModal({ id, name, stock, unit, onClose, onDone }: { id: number; name: string; stock: number; unit: string; onClose: () => void; onDone: () => void }) {
  const [adjustment, setAdjustment] = useState('');
  const [direction, setDirection] = useState<'receive' | 'consume'>('receive');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const qtyNum = toNumber(adjustment);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const result = validate(stockAdjustSchema, { direction, quantity: qtyNum, currentStock: stock, reason });
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      const qty = result.data.direction === 'consume' ? -result.data.quantity : result.data.quantity;
      await rawMaterialsApi.adjustStock(id, { quantity: qty, reason: result.data.reason });
      toast.success('Stock adjusted');
      onDone();
    } catch (err) {
      const info = parseApiError(err);
      toast.error(info.message);
      if (info.fieldErrors) setErrors((prev) => ({ ...prev, ...info.fieldErrors }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Adjust Stock" subtitle={name} size="sm"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>Adjust</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="text-sm bg-[var(--paper-dark)] px-3 py-2 rounded-md">
          Current stock: <span className="font-mono font-medium">{formatQty(stock, unit)}</span>
        </div>
        <div className="flex gap-2">
          <Select
            options={[
              { value: 'receive', label: 'Receive' },
              { value: 'consume', label: 'Consume' },
            ]}
            value={direction}
            onChange={(e) => setDirection(e.target.value as typeof direction)}
            placeholder=""
          />
          <Input type="number" step="0.001" min="0" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} error={errors.quantity} placeholder="Qty" />
        </div>
        {errors.quantity && <p className="text-xs text-red-600 -mt-2">{errors.quantity}</p>}
        {qtyNum != null && !errors.quantity && (
          <div className="text-xs text-[var(--ink-muted)]">
            {direction === 'receive' && <span className="flex items-center gap-1"><TrendingUp size={12} /> New stock: {formatQty(stock + qtyNum, unit)}</span>}
            {direction === 'consume' && <span className="flex items-center gap-1"><TrendingDown size={12} /> New stock: {formatQty(Math.max(0, stock - qtyNum), unit)}</span>}
          </div>
        )}
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} placeholder="e.g. Received from vendor, consumed in production" maxLength={500} />
      </form>
    </Modal>
  );
}
