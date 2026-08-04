'use client';
import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination, TABLE_ROW_HEIGHT_PX, TABLE_CARD_ROW_HEIGHT_PX } from '@/components/ui/Table';
import { Badge, poStatusBadge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { purchaseOrdersApi, vendorsApi, rawMaterialsApi } from '@/lib/api';
import { PurchaseOrder, PurchaseOrderDetail, Vendor, RawMaterial, PaginatedResponse } from '@/lib/types';
import { formatDate, parseApiError, resolvePaginationTotal, PO_STATUS_LABELS } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { createPurchaseOrderSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { useUrlState } from '@/lib/useUrlState';
import { useFitRowCount } from '@/lib/useFitRowCount';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Plus, X, Search } from 'lucide-react';

const INITIAL_PER_PAGE = 20;
const EMPTY: PaginatedResponse<PurchaseOrder> = { items: [], total: 0, page: 1, per_page: INITIAL_PER_PAGE };

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={<AppShell><div className="text-base text-[var(--ink-muted)]">Loading…</div></AppShell>}>
      <PurchaseOrdersPageInner />
    </Suspense>
  );
}

function PurchaseOrdersPageInner() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useUrlState('q', '');
  const [status, setStatus] = useUrlState('status', '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [showCreate, setShowCreate] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);

  const canWrite = canAccess(user, 'purchase_orders', 'write');

  const tableBodyRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const perPage = useFitRowCount(tableBodyRef, isMobile ? TABLE_CARD_ROW_HEIGHT_PX : TABLE_ROW_HEIGHT_PX, 5, 100, INITIAL_PER_PAGE);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const isFirstPerPage = useRef(true);
  useEffect(() => {
    if (isFirstPerPage.current) { isFirstPerPage.current = false; return; }
    setPage(1);
  }, [perPage]);

  const fetchOrders = useCallback(async () => {
    const res = await purchaseOrdersApi.list({ page, per_page: perPage, q: debouncedSearch || undefined, status: status || undefined });
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: resolvePaginationTotal(data?.total, items, page, perPage), page, per_page: perPage };
  }, [page, perPage, debouncedSearch, status]);

  const { data, loading, error, reload } = useAsyncQuery(fetchOrders, [page, perPage, debouncedSearch, status], EMPTY);
  const orders = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  useEffect(() => {
    vendorsApi.list(1, 100).then((r) => setVendors(r.data.data?.items || [])).catch(() => {});
    rawMaterialsApi.list(1, 100).then((r) => setRawMaterials(r.data.data?.items || [])).catch(() => {
      toast.error('Failed to load raw materials list. Purchase order creation may be unavailable.');
    });
  }, []);

  const columns = [
    { key: 'po_number', header: 'PO Number', primary: true, render: (o: PurchaseOrder) => <span className="font-mono font-bold text-[var(--accent)]">{o.po_number}</span> },
    { key: 'vendor', header: 'Vendor', render: (o: PurchaseOrder) => o.vendor_name || `Vendor #${o.vendor_id}` },
    { key: 'status', header: 'Status', render: (o: PurchaseOrder) => <Badge variant={poStatusBadge(o.status)}>{PO_STATUS_LABELS[o.status] || o.status}</Badge> },
    { key: 'expected_date', header: 'Expected', render: (o: PurchaseOrder) => o.expected_date ? formatDate(o.expected_date) : '—' },
    { key: 'created_at', header: 'Created', hideInCard: true, render: (o: PurchaseOrder) => formatDate(o.created_at) },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Purchase Orders"
        subtitle="Bringing raw material stock in from vendors"
        action={
          canWrite && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New Purchase Order
            </Button>
          )
        }
      />

      <Card noPadding fill>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] flex-wrap">
          <div className="relative w-64">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PO number"
              className="pl-11"
            />
          </div>
          <div className="w-56">
            <Select
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              placeholder="All statuses"
            />
          </div>
        </div>

        {error && !loading ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <Table
              columns={columns}
              data={orders}
              keyExtractor={(o) => o.id}
              onRowClick={(o) => router.push(`/orders/purchase/${o.id}`)}
              loading={loading}
              emptyMessage={search || status ? 'No purchase orders match this filter.' : 'No purchase orders found.'}
              bodyRef={tableBodyRef}
            />
            <Pagination page={page} total={total} perPage={perPage} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CreatePurchaseOrderModal
          vendors={vendors}
          rawMaterials={rawMaterials}
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setShowCreate(false);
            // Clears this route's client-side Router Cache entry so navigating back here later
            // shows the just-created PO instead of the pre-create snapshot (Next.js only refetches
            // a route's data on a fresh navigation, not when the browser restores it via Back --
            // see the Client Cache glossary entry).
            router.refresh();
            router.push(`/orders/purchase/${created.id}`);
          }}
        />
      )}
    </AppShell>
  );
}

interface LineRow { raw_material_id: number; ordered_qty: string; unit_price: string }

function CreatePurchaseOrderModal({
  vendors,
  rawMaterials,
  onClose,
  onCreated,
}: {
  vendors: Vendor[];
  rawMaterials: RawMaterial[];
  onClose: () => void;
  onCreated: (created: PurchaseOrderDetail) => void;
}) {
  const [vendorId, setVendorId] = useState<number | undefined>();
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>([{ raw_material_id: 0, ordered_qty: '', unit_price: '' }]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const noMaterialsAvailable = rawMaterials.length === 0;

  const addLine = () => setLines((l) => [...l, { raw_material_id: 0, ordered_qty: '', unit_price: '' }]);
  const removeLine = (i: number) => setLines((l) => (l.length > 1 ? l.filter((_, idx) => idx !== i) : l));
  const updateLine = (i: number, field: keyof LineRow, value: string | number) =>
    setLines((l) => l.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = {
      vendor_id: vendorId,
      expected_date: expectedDate,
      notes,
      lines: lines
        .filter((l) => l.raw_material_id > 0 || l.ordered_qty !== '')
        .map((l) => ({
          raw_material_id: l.raw_material_id,
          ordered_qty: toNumber(l.ordered_qty),
          unit_price: l.unit_price !== '' ? toNumber(l.unit_price) : undefined,
        })),
    };

    const result = validate(createPurchaseOrderSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      const res = await purchaseOrdersApi.create({
        vendor_id: result.data.vendor_id,
        expected_date: result.data.expected_date || undefined,
        notes: result.data.notes || undefined,
        lines: result.data.lines,
      });
      toast.success('Purchase order created');
      onCreated(res.data.data);
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
      title="New Purchase Order"
      subtitle="Order raw materials from a vendor"
      size="lg"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>Create Purchase Order</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Vendor"
            options={vendors.map((v) => ({ value: v.id, label: v.name }))}
            value={vendorId || ''}
            onChange={(e) => setVendorId(Number(e.target.value) || undefined)}
            placeholder="Select vendor…"
            error={errors.vendor_id}
          />
          <Input label="Expected Date (optional)" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} error={errors.expected_date} />
        </div>
        <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} error={errors.notes} />

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide">Lines</label>
            <Button variant="ghost" size="sm" type="button" onClick={addLine} disabled={noMaterialsAvailable}>
              <Plus size={16} /> Add
            </Button>
          </div>
          {noMaterialsAvailable && (
            <p className="text-sm font-semibold text-[var(--warning)] bg-[var(--warning-tint)] border-2 border-[var(--warning)] rounded-lg px-3 py-2 mb-2">
              No raw materials exist yet. Create one under Raw Materials first.
            </p>
          )}
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Select
                    options={rawMaterials.map((r) => ({ value: r.id, label: `${r.name} (${r.unit})` }))}
                    value={l.raw_material_id || ''}
                    onChange={(e) => updateLine(i, 'raw_material_id', Number(e.target.value))}
                    placeholder="Select material…"
                  />
                </div>
                <div className="w-28">
                  <Input type="number" step="0.001" min="0" value={l.ordered_qty} onChange={(e) => updateLine(i, 'ordered_qty', e.target.value)} placeholder="Qty" />
                </div>
                <div className="w-28">
                  <Input type="number" step="0.01" min="0" value={l.unit_price} onChange={(e) => updateLine(i, 'unit_price', e.target.value)} placeholder="Unit Price" />
                </div>
                <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} className="flex items-center gap-1.5 text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--danger)] min-h-[52px] px-2.5 disabled:opacity-30">
                  <X size={18} /> Remove
                </button>
              </div>
            ))}
          </div>
          {errors.lines && <p className="text-sm font-semibold text-[var(--danger)] mt-1.5">{errors.lines}</p>}
        </div>
      </form>
    </Modal>
  );
}
