'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination } from '@/components/ui/Table';
import { Badge, stockStatusBadge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { consumablesApi, reportsApi } from '@/lib/api';
import { Consumable, PaginatedResponse, StockLevelItem } from '@/lib/types';
import { formatDate, formatQty, parseApiError, suggestCode } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { consumableSchema, stockAdjustSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { useUrlState } from '@/lib/useUrlState';
import { Plus, TrendingUp, TrendingDown, Pencil, Search } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<Consumable> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

/** Canned reasons offered as one-tap chips above the Adjust Stock modal's Reason field -- the
 *  field itself is still freetext, this just covers the handful of reasons that account for
 *  most stock adjustments so the common case doesn't require typing. */
const STOCK_REASON_QUICK_PICKS = ['From vendor', 'Used in production', 'Stock count correction', 'Damaged/wasted'];

export default function ConsumablesPage() {
  return (
    <Suspense fallback={<AppShell><div className="text-base text-[var(--ink-muted)]">Loading…</div></AppShell>}>
      <ConsumablesPageInner />
    </Suspense>
  );
}

function ConsumablesPageInner() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useUrlState('q', '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdjust, setShowAdjust] = useState<{ id: number; name: string; stock: number; unit: string } | null>(null);
  // Keyed by consumable id -- fetched once (stockLevels() returns every consumable regardless of
  // this page's pagination), not refetched per page. Left empty (no badges shown) if the call
  // fails, per the "fail gracefully" rule -- this is a supplementary signal, not core data.
  const [stockById, setStockById] = useState<Record<number, StockLevelItem>>({});

  const canWrite = canAccess(user, 'consumables', 'write');
  const canStock = canAccess(user, 'consumables', 'stock');

  // Debounced so typing a consumable name doesn't fire a request per keystroke -- see the same
  // pattern on the Batches/Lots list pages. The page reset lives in this same callback (not the
  // input's onChange) so it fires once, together with the debounced value.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchConsumables = useCallback(async () => {
    const res = await consumablesApi.list(page, PER_PAGE, debouncedSearch || undefined);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page, debouncedSearch]);

  const { data, loading, error, reload } = useAsyncQuery(fetchConsumables, [page, debouncedSearch], EMPTY);
  const consumables = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  useEffect(() => {
    reportsApi.stockLevels()
      .then((r) => {
        const items: StockLevelItem[] = r.data?.data?.consumables || [];
        setStockById(Object.fromEntries(items.map((i) => [i.id, i])));
      })
      .catch(() => {
        // Supplementary "needs reordering" signal only -- omit badges rather than block the page.
      });
  }, []);

  const columns = [
    { key: 'name', header: 'Name', primary: true, render: (c: Consumable) => <span className="font-medium">{c.name}</span> },
    { key: 'code', header: 'Code', hideInCard: true, render: (c: Consumable) => c.code ? <span className="font-mono">{c.code}</span> : '—' },
    {
      key: 'current_stock',
      header: 'Stock',
      render: (c: Consumable) => <span className={`font-mono ${c.current_stock <= 0 ? 'text-[var(--danger)]' : ''}`}>{formatQty(c.current_stock, c.unit)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c: Consumable) => {
        const status = stockById[c.id]?.status;
        if (status !== 'out' && status !== 'low') return null;
        return <Badge variant={stockStatusBadge(status)}>{status === 'out' ? 'Out of Stock' : 'Low Stock'}</Badge>;
      },
    },
    { key: 'created_at', header: 'Added', hideInCard: true, render: (c: Consumable) => formatDate(c.created_at) },
    ...(canStock
      ? [
          {
            key: 'actions',
            header: '',
            isActions: true,
            render: (c: Consumable) => (
              <button
                onClick={(e) => { e.stopPropagation(); setShowAdjust({ id: c.id, name: c.name, stock: c.current_stock, unit: c.unit }); }}
                className="flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--accent)] hover:bg-[var(--paper-sunken)] transition-colors"
              >
                <Pencil size={18} /> Adjust Stock
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
        subtitle="Tools and supplies used up while making products"
        action={
          canWrite && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New Consumable
            </Button>
          )
        }
      />

      <Card noPadding>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] flex-wrap">
          <div className="relative w-64">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search consumables"
              className="pl-11"
            />
          </div>
        </div>

        {error && !loading ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <Table
              columns={columns}
              data={consumables}
              keyExtractor={(c) => c.id}
              loading={loading}
              emptyMessage={search ? 'No consumables match this search.' : 'No consumables found.'}
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
  // Tracks whether the user has hand-edited Code -- while false, Code auto-derives from Name
  // (suggestCode) on every keystroke; once the user types into Code directly, that stops.
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
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
      await consumablesApi.create(result.data);
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
        <Input
          label="Name"
          value={name}
          onChange={(e) => {
            const next = e.target.value;
            setName(next);
            if (!codeManuallyEdited) setCode(suggestCode(next, 50));
          }}
          error={errors.name}
          placeholder="Mold Insert #5"
          maxLength={150}
        />
        <Input
          label="Code"
          value={code}
          onChange={(e) => { setCode(e.target.value); setCodeManuallyEdited(true); }}
          error={errors.code}
          placeholder="CS-001"
          maxLength={50}
        />
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
        <div className="text-base bg-[var(--paper-sunken)] px-3 py-2.5 rounded-xl">
          Current stock: <span className="font-mono font-bold">{formatQty(stock, unit)}</span>
        </div>
        <div className="flex gap-2">
          <Select
            options={[
              { value: 'receive', label: 'Add Stock' },
              { value: 'consume', label: 'Use Stock' },
            ]}
            value={direction}
            onChange={(e) => setDirection(e.target.value as typeof direction)}
            placeholder=""
          />
          <Input type="number" step="0.001" min="0" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} error={errors.quantity} placeholder="Qty" />
        </div>
        {errors.quantity && <p className="text-sm font-semibold text-[var(--danger)] -mt-2">{errors.quantity}</p>}
        {qtyNum != null && !errors.quantity && (
          <div className="text-sm text-[var(--ink-muted)]">
            {direction === 'receive' && <span className="flex items-center gap-1.5"><TrendingUp size={18} /> New stock: {formatQty(stock + qtyNum, unit)}</span>}
            {direction === 'consume' && <span className="flex items-center gap-1.5"><TrendingDown size={18} /> New stock: {formatQty(Math.max(0, stock - qtyNum), unit)}</span>}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {STOCK_REASON_QUICK_PICKS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className="text-sm font-semibold px-3 min-h-9 rounded-full border-2 border-[var(--border-strong)] text-[var(--ink-light)] hover:bg-[var(--paper-sunken)] transition-colors"
            >
              {r}
            </button>
          ))}
        </div>
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} placeholder="e.g. From vendor, used in production" maxLength={500} />
      </form>
    </Modal>
  );
}
