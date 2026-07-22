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
import { rawMaterialsApi, vendorsApi, reportsApi } from '@/lib/api';
import { RawMaterial, Vendor, PaginatedResponse, StockLevelItem } from '@/lib/types';
import { formatDate, formatQty, parseApiError, suggestCode } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { rawMaterialSchema, stockAdjustSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { useUrlState } from '@/lib/useUrlState';
import { Plus, TrendingUp, TrendingDown, Pencil, Search } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<RawMaterial> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

/** Canned reasons offered as one-tap chips above the Adjust Stock modal's Reason field -- the
 *  field itself is still freetext, this just covers the handful of reasons that account for
 *  most stock adjustments so the common case doesn't require typing. */
const STOCK_REASON_QUICK_PICKS = ['From vendor', 'Used in production', 'Stock count correction', 'Damaged/wasted'];

export default function RawMaterialsPage() {
  return (
    <Suspense fallback={<AppShell><div className="text-base text-[var(--ink-muted)]">Loading…</div></AppShell>}>
      <RawMaterialsPageInner />
    </Suspense>
  );
}

function RawMaterialsPageInner() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useUrlState('q', '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdjust, setShowAdjust] = useState<{ id: number; name: string; stock: number; unit: string } | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  // Keyed by raw material id -- fetched once (stockLevels() returns every material regardless of
  // this page's pagination), not refetched per page. Left empty (no badges shown) if the call
  // fails, per the "fail gracefully" rule -- this is a supplementary signal, not core data.
  const [stockById, setStockById] = useState<Record<number, StockLevelItem>>({});

  const canWrite = canAccess(user, 'raw_materials', 'write');
  const canStock = canAccess(user, 'raw_materials', 'stock');

  // Debounced so typing a material name doesn't fire a request per keystroke -- see the same
  // pattern on the Batches/Lots list pages. The page reset lives in this same callback (not the
  // input's onChange) so it fires once, together with the debounced value.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchMaterials = useCallback(async () => {
    const res = await rawMaterialsApi.list(page, PER_PAGE, debouncedSearch || undefined);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page, debouncedSearch]);

  const { data, loading, error, reload } = useAsyncQuery(fetchMaterials, [page, debouncedSearch], EMPTY);
  const materials = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  useEffect(() => {
    vendorsApi.list(1, 100).then((r) => setVendors(r.data.data?.items || [])).catch(() => {});
  }, []);

  useEffect(() => {
    reportsApi.stockLevels()
      .then((r) => {
        const items: StockLevelItem[] = r.data?.data?.raw_materials || [];
        setStockById(Object.fromEntries(items.map((i) => [i.id, i])));
      })
      .catch(() => {
        // Supplementary "needs reordering" signal only -- omit badges rather than block the page.
      });
  }, []);

  const columns = [
    { key: 'name', header: 'Name', primary: true, render: (r: RawMaterial) => <span className="font-medium">{r.name}</span> },
    { key: 'short_code', header: 'Code', hideInCard: true, render: (r: RawMaterial) => r.short_code ? <span className="font-mono">{r.short_code}</span> : '—' },
    { key: 'vendor_name', header: 'Vendor', render: (r: RawMaterial) => r.vendor_name || '—' },
    {
      key: 'current_stock',
      header: 'Stock',
      render: (r: RawMaterial) => (
        <span className={`font-mono ${r.current_stock <= 0 ? 'text-[var(--danger)]' : ''}`}>{formatQty(r.current_stock, r.unit)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: RawMaterial) => {
        const status = stockById[r.id]?.status;
        if (status !== 'out' && status !== 'low') return null;
        return <Badge variant={stockStatusBadge(status)}>{status === 'out' ? 'Out of Stock' : 'Low Stock'}</Badge>;
      },
    },
    { key: 'created_at', header: 'Added', hideInCard: true, render: (r: RawMaterial) => formatDate(r.created_at) },
    ...(canStock
      ? [
          {
            key: 'actions',
            header: '',
            isActions: true,
            render: (r: RawMaterial) => (
              <button
                onClick={(e) => { e.stopPropagation(); setShowAdjust({ id: r.id, name: r.name, stock: r.current_stock, unit: r.unit }); }}
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
        title="Raw Materials"
        subtitle="Materials used to make products"
        action={
          canWrite && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New Material
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
              placeholder="Search raw materials"
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
              data={materials}
              keyExtractor={(r) => r.id}
              loading={loading}
              emptyMessage={search ? 'No raw materials match this search.' : 'No raw materials found.'}
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
  const [shortCode, setShortCode] = useState('');
  // Tracks whether the user has hand-edited Code -- while false, Code auto-derives from Name
  // (suggestCode) on every keystroke; once the user types into Code directly, that stops.
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [vendorId, setVendorId] = useState<number | undefined>();
  const [unit, setUnit] = useState('kg');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = { name, short_code: shortCode, vendor_id: vendorId, unit };
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
        <Input
          label="Name"
          value={name}
          onChange={(e) => {
            const next = e.target.value;
            setName(next);
            if (!codeManuallyEdited) setShortCode(suggestCode(next, 50));
          }}
          error={errors.name}
          placeholder="Iron Powder"
          maxLength={150}
        />
        <Input
          label="Code"
          value={shortCode}
          onChange={(e) => { setShortCode(e.target.value); setCodeManuallyEdited(true); }}
          error={errors.short_code}
          placeholder="RM-001"
          maxLength={50}
        />
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
