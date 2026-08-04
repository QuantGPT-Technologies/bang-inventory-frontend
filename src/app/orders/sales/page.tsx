'use client';
import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination, TABLE_ROW_HEIGHT_PX, TABLE_CARD_ROW_HEIGHT_PX } from '@/components/ui/Table';
import { Badge, soStatusBadge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { salesOrdersApi, customersApi, skusApi } from '@/lib/api';
import { SalesOrder, SalesOrderDetail, Customer, SKU, PaginatedResponse } from '@/lib/types';
import { formatDate, formatQty, parseApiError, resolvePaginationTotal, SO_STATUS_LABELS } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { createSalesOrderSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { useUrlState } from '@/lib/useUrlState';
import { useFitRowCount } from '@/lib/useFitRowCount';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Plus, X, Search } from 'lucide-react';

const INITIAL_PER_PAGE = 20;
const EMPTY: PaginatedResponse<SalesOrder> = { items: [], total: 0, page: 1, per_page: INITIAL_PER_PAGE };

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'partially_shipped', label: 'Partially Shipped' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function SalesOrdersPage() {
  return (
    <Suspense fallback={<AppShell><div className="text-base text-[var(--ink-muted)]">Loading…</div></AppShell>}>
      <SalesOrdersPageInner />
    </Suspense>
  );
}

function SalesOrdersPageInner() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useUrlState('q', '');
  const [status, setStatus] = useUrlState('status', '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [showCreate, setShowCreate] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);

  const canWrite = canAccess(user, 'sales_orders', 'write');

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
    const res = await salesOrdersApi.list({ page, per_page: perPage, q: debouncedSearch || undefined, status: status || undefined });
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
    customersApi.list(1, 100).then((r) => setCustomers(r.data.data?.items || [])).catch(() => {});
    skusApi.list(1, 100).then((r) => setSkus(r.data.data?.items || [])).catch(() => {
      toast.error('Failed to load products list. Sales order creation may be unavailable.');
    });
  }, []);

  const columns = [
    { key: 'so_number', header: 'SO Number', primary: true, render: (o: SalesOrder) => <span className="font-mono font-bold text-[var(--accent)]">{o.so_number}</span> },
    { key: 'customer', header: 'Customer', render: (o: SalesOrder) => o.customer_name || `Customer #${o.customer_id}` },
    { key: 'status', header: 'Status', render: (o: SalesOrder) => <Badge variant={soStatusBadge(o.status)}>{SO_STATUS_LABELS[o.status] || o.status}</Badge> },
    { key: 'expected_date', header: 'Expected', render: (o: SalesOrder) => o.expected_date ? formatDate(o.expected_date) : '—' },
    { key: 'created_at', header: 'Created', hideInCard: true, render: (o: SalesOrder) => formatDate(o.created_at) },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Sales Orders"
        subtitle="Sending finished products out to customers"
        action={
          canWrite && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New Sales Order
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
              placeholder="Search SO number"
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
              onRowClick={(o) => router.push(`/orders/sales/${o.id}`)}
              loading={loading}
              emptyMessage={search || status ? 'No sales orders match this filter.' : 'No sales orders found.'}
              bodyRef={tableBodyRef}
            />
            <Pagination page={page} total={total} perPage={perPage} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CreateSalesOrderModal
          customers={customers}
          skus={skus}
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setShowCreate(false);
            // Clears this route's client-side Router Cache entry so navigating back here later
            // shows the just-created SO instead of the pre-create snapshot (see the matching
            // comment in orders/purchase/page.tsx).
            router.refresh();
            router.push(`/orders/sales/${created.id}`);
          }}
        />
      )}
    </AppShell>
  );
}

interface LineRow { sku_id: number; ordered_qty: string; unit_price: string }

function CreateSalesOrderModal({
  customers,
  skus,
  onClose,
  onCreated,
}: {
  customers: Customer[];
  skus: SKU[];
  onClose: () => void;
  onCreated: (created: SalesOrderDetail) => void;
}) {
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>([{ sku_id: 0, ordered_qty: '', unit_price: '' }]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const noSkusAvailable = skus.length === 0;

  const addLine = () => setLines((l) => [...l, { sku_id: 0, ordered_qty: '', unit_price: '' }]);
  const removeLine = (i: number) => setLines((l) => (l.length > 1 ? l.filter((_, idx) => idx !== i) : l));
  const updateLine = (i: number, field: keyof LineRow, value: string | number) =>
    setLines((l) => l.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = {
      customer_id: customerId,
      expected_date: expectedDate,
      notes,
      lines: lines
        .filter((l) => l.sku_id > 0 || l.ordered_qty !== '')
        .map((l) => ({
          sku_id: l.sku_id,
          ordered_qty: toNumber(l.ordered_qty),
          unit_price: l.unit_price !== '' ? toNumber(l.unit_price) : undefined,
        })),
    };

    const result = validate(createSalesOrderSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      const res = await salesOrdersApi.create({
        customer_id: result.data.customer_id,
        expected_date: result.data.expected_date || undefined,
        notes: result.data.notes || undefined,
        lines: result.data.lines,
      });
      toast.success('Sales order created');
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
      title="New Sales Order"
      subtitle="Order products for a customer"
      size="lg"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>Create Sales Order</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Customer"
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            value={customerId || ''}
            onChange={(e) => setCustomerId(Number(e.target.value) || undefined)}
            placeholder="Select customer…"
            error={errors.customer_id}
          />
          <Input label="Expected Date (optional)" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} error={errors.expected_date} />
        </div>
        <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} error={errors.notes} />

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide">Lines</label>
            <Button variant="ghost" size="sm" type="button" onClick={addLine} disabled={noSkusAvailable}>
              <Plus size={16} /> Add
            </Button>
          </div>
          {noSkusAvailable && (
            <p className="text-sm font-semibold text-[var(--warning)] bg-[var(--warning-tint)] border-2 border-[var(--warning)] rounded-lg px-3 py-2 mb-2">
              No products exist yet. Create one under Products first.
            </p>
          )}
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Select
                    options={skus.map((s) => ({ value: s.id, label: `${s.code} — ${s.name} (${formatQty(s.current_stock, s.unit)} in stock)` }))}
                    value={l.sku_id || ''}
                    onChange={(e) => updateLine(i, 'sku_id', Number(e.target.value))}
                    placeholder="Select product…"
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
