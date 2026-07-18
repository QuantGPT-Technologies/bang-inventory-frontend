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
import { consumablesApi } from '@/lib/api';
import { Consumable, PaginatedResponse } from '@/lib/types';
import { formatDate, formatQty, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { consumableSchema, stockAdjustSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { Plus, TrendingUp, TrendingDown, Pencil } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<Consumable> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

export default function ConsumablesPage() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdjust, setShowAdjust] = useState<{ id: number; name: string; stock: number; unit: string } | null>(null);

  const canWrite = canAccess(user, 'consumables', 'write');
  const canStock = canAccess(user, 'consumables', 'stock');

  const fetchConsumables = useCallback(async () => {
    const res = await consumablesApi.list(page, PER_PAGE);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page]);

  const { data, loading, error, reload } = useAsyncQuery(fetchConsumables, [page], EMPTY);
  const consumables = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const columns = [
    { key: 'name', header: 'Name', render: (c: Consumable) => <span className="font-medium">{c.name}</span> },
    { key: 'code', header: 'Code', render: (c: Consumable) => c.code ? <span className="font-mono">{c.code}</span> : '—' },
    {
      key: 'stock_qty',
      header: 'Stock',
      render: (c: Consumable) => <span className={`font-mono ${c.stock_qty <= 0 ? 'text-red-600' : ''}`}>{formatQty(c.stock_qty, c.unit)}</span>,
    },
    { key: 'created_at', header: 'Added', render: (c: Consumable) => formatDate(c.created_at) },
    ...(canStock
      ? [
          {
            key: 'actions',
            header: '',
            render: (c: Consumable) => (
              <button
                onClick={(e) => { e.stopPropagation(); setShowAdjust({ id: c.id, name: c.name, stock: c.stock_qty, unit: c.unit }); }}
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
        title="Consumables"
        subtitle="Tools and materials consumed during production"
        action={
          canWrite && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Consumable
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
              data={consumables}
              keyExtractor={(c) => c.id}
              loading={loading}
              emptyMessage="No consumables found."
            />
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CreateConsumableModal
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

function CreateConsumableModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const result = validate(consumableSchema, { name, code, unit });
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      await consumablesApi.create({ ...result.data, stock_qty: 0 });
      toast.success('Consumable created');
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
    <Modal open onClose={onClose} title="New Consumable" size="sm"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>Create</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Mold Insert #5" maxLength={150} />
        <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} error={errors.code} placeholder="CS-001" maxLength={50} />
        <Select label="Unit" options={[{ value: 'pcs', label: 'pcs' }, { value: 'kg', label: 'kg' }, { value: 'L', label: 'L' }]} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="" />
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
      await consumablesApi.adjustStock(id, { quantity: qty, reason: result.data.reason });
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
