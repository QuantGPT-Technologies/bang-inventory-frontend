'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Badge, soStatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ErrorState } from '@/components/ui/ErrorState';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { salesOrdersApi } from '@/lib/api';
import { SalesOrderDetail, SalesOrderLine } from '@/lib/types';
import { formatDate, formatDateTime, formatQty, parseApiError, SO_STATUS_LABELS } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { fulfillLinesSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { CheckCircle2, Truck, CheckCircle, Ban, Pencil, Save, XCircle, AlertTriangle } from 'lucide-react';

export default function SalesOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const idParam = params?.id;
  const soId = Number(idParam);
  const idIsValid = idParam != null && idParam !== '' && Number.isInteger(soId) && soId > 0;

  const fetchSO = useCallback(async () => {
    if (!idIsValid) return null;
    const res = await salesOrdersApi.get(soId);
    return res.data?.data ?? null;
  }, [soId, idIsValid]);

  const { data: so, loading, error, reload } = useAsyncQuery<SalesOrderDetail | null>(fetchSO, [soId, idIsValid], null);

  useEffect(() => {
    if (error && !error.isNotFound) toast.error(error.message);
  }, [error]);

  if (!idIsValid) {
    return (
      <AppShell>
        <ErrorState error={{ message: 'Invalid sales order reference.', isNetworkError: false, isValidationError: false, isAuthError: false, isForbidden: false, isNotFound: true, isConflict: false, isServerError: false }} />
      </AppShell>
    );
  }

  if (loading && !so) return <AppShell><div className="p-8 text-center text-base text-[var(--ink-muted)]">Loading…</div></AppShell>;
  if (error && !so) return <AppShell><ErrorState error={error} onRetry={error.isNotFound ? undefined : reload} /></AppShell>;
  if (!so) return <AppShell><div className="p-8 text-center text-base text-[var(--ink-muted)]">Sales order not found.</div></AppShell>;

  const canWrite = canAccess(user, 'sales_orders', 'write');
  const canDispatch = canAccess(user, 'sales_orders', 'dispatch');

  const handleAction = async (action: () => Promise<unknown>, successMsg: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(successMsg);
      reload();
      setShowConfirm(false);
      setShowClose(false);
      setShowCancel(false);
    } catch (err) {
      const info = parseApiError(err);
      toast.error(info.message);
      if (info.isConflict || info.isNotFound) reload();
    } finally {
      setBusy(false);
    }
  };

  const totalOrdered = so.lines.reduce((s, l) => s + l.ordered_qty, 0);
  const totalShipped = so.lines.reduce((s, l) => s + l.shipped_qty, 0);

  return (
    <AppShell>
      <PageHeader
        title={`Sales Order ${so.so_number}`}
        breadcrumb={[{ label: 'Sales Orders', href: '/orders/sales' }, { label: so.so_number }]}
        action={
          <div className="flex gap-2">
            {so.status === 'draft' && canWrite && (
              <Button onClick={() => setShowConfirm(true)}>
                <CheckCircle2 size={18} /> Confirm
              </Button>
            )}
            {(so.status === 'confirmed' || so.status === 'partially_shipped') && canDispatch && (
              <Button onClick={() => setShowDispatch(true)}>
                <Truck size={18} /> Dispatch
              </Button>
            )}
            {(so.status === 'shipped' || so.status === 'partially_shipped') && canWrite && (
              <Button variant="outline" onClick={() => setShowClose(true)}>
                <CheckCircle size={18} /> Close
              </Button>
            )}
            {(so.status === 'draft' || so.status === 'confirmed') && canWrite && (
              <Button variant="danger" onClick={() => setShowCancel(true)}>
                <Ban size={18} /> Cancel
              </Button>
            )}
          </div>
        }
      />

      {so.status === 'confirmed' && (
        <p className="text-sm text-[var(--ink-muted)] flex items-center gap-1.5 -mt-2 mb-4">
          <AlertTriangle size={16} className="flex-shrink-0" />
          Confirming does not reserve stock -- availability is only checked when dispatch is attempted.
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-min gap-4">
        <Card
          title="Order Details"
          className="lg:col-span-1"
          action={
            so.status === 'draft' && canWrite && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--accent)] hover:bg-[var(--paper-sunken)] transition-colors"
              >
                <Pencil size={18} /> Edit
              </button>
            )
          }
        >
          {editing ? (
            <EditSalesOrderForm so={so} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
          ) : (
            <dl className="space-y-3 text-base">
              <DL label="SO Number"><span className="font-mono font-bold">{so.so_number}</span></DL>
              <DL label="Customer">{so.customer_name || `Customer #${so.customer_id}`}</DL>
              <DL label="Status">
                <Badge variant={soStatusBadge(so.status)}>{SO_STATUS_LABELS[so.status] || so.status}</Badge>
              </DL>
              <DL label="Expected Date">{so.expected_date ? formatDate(so.expected_date) : '—'}</DL>
              <DL label="Created">{formatDateTime(so.created_at)}</DL>
              {so.notes && <DL label="Notes"><span className="text-[var(--ink-muted)]">{so.notes}</span></DL>}
            </dl>
          )}
        </Card>

        <Card title="Lines" className="lg:col-span-2" noPadding fill>
          <Table
            columns={[
              { key: 'sku', header: 'Product', primary: true, render: (l: SalesOrderLine) => l.sku_name || `Product #${l.sku_id}` },
              { key: 'ordered', header: 'Ordered', className: 'text-right font-mono', headerClassName: 'text-right', render: (l: SalesOrderLine) => formatQty(l.ordered_qty) },
              { key: 'shipped', header: 'Shipped', className: 'text-right font-mono', headerClassName: 'text-right', render: (l: SalesOrderLine) => formatQty(l.shipped_qty) },
              { key: 'unit_price', header: 'Unit Price', className: 'text-right font-mono text-[var(--ink-muted)]', headerClassName: 'text-right', hideInCard: true, render: (l: SalesOrderLine) => l.unit_price != null ? l.unit_price.toFixed(2) : '—' },
            ]}
            data={so.lines}
            keyExtractor={(l) => l.id}
            emptyMessage="No lines on this sales order."
          />
          {so.lines.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 text-sm font-bold text-[var(--ink-muted)] border-t border-[var(--border)]">
              <span>Total</span>
              <span className="font-mono">{formatQty(totalShipped)} / {formatQty(totalOrdered)} shipped</span>
            </div>
          )}
        </Card>
      </div>

      {showConfirm && (
        <ConfirmModal
          open
          title="Confirm Sales Order"
          message={`Confirm sales order ${so.so_number}? Lines will be locked once confirmed. Stock is not reserved by confirming -- availability is checked at dispatch.`}
          confirmLabel="Confirm"
          danger={false}
          loading={busy}
          onConfirm={() => handleAction(() => salesOrdersApi.confirm(so.id), 'Sales order confirmed')}
          onCancel={() => setShowConfirm(false)}
        />
      )}
      {showDispatch && (
        <DispatchModal
          so={so}
          onClose={() => setShowDispatch(false)}
          onDone={() => { setShowDispatch(false); reload(); }}
        />
      )}
      {showClose && (
        <ConfirmModal
          open
          title="Close Sales Order"
          message={`Close sales order ${so.so_number}? This marks it as complete.`}
          confirmLabel="Close"
          danger={false}
          loading={busy}
          onConfirm={() => handleAction(() => salesOrdersApi.close(so.id), 'Sales order closed')}
          onCancel={() => setShowClose(false)}
        />
      )}
      {showCancel && (
        <ConfirmModal
          open
          title="Cancel Sales Order"
          message={`Cancel sales order ${so.so_number}? This cannot be undone.`}
          confirmLabel="Cancel Order"
          loading={busy}
          onConfirm={() => handleAction(() => salesOrdersApi.cancel(so.id), 'Sales order cancelled')}
          onCancel={() => setShowCancel(false)}
        />
      )}
    </AppShell>
  );
}

function DL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="text-sm font-bold uppercase tracking-wide text-[var(--ink-muted)] flex-shrink-0">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function EditSalesOrderForm({ so, onCancel, onSaved }: { so: SalesOrderDetail; onCancel: () => void; onSaved: () => void }) {
  const [expectedDate, setExpectedDate] = useState(so.expected_date || '');
  const [notes, setNotes] = useState(so.notes || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErrors({});
    try {
      // Header-only edit -- lines are left untouched by omitting `lines` from the body (see
      // UI_GUIDE.md §7 Step 5: passing `lines` replaces the full set).
      await salesOrdersApi.update(so.id, { expected_date: expectedDate || undefined, notes: notes || undefined });
      toast.success('Sales order updated');
      onSaved();
    } catch (err) {
      const info = parseApiError(err);
      toast.error(info.message);
      if (info.fieldErrors) setErrors(info.fieldErrors);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide block mb-1.5">SO Number</label>
        <p className="font-mono font-bold text-base">{so.so_number}</p>
      </div>
      <Input label="Expected Date" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} error={errors.expected_date} />
      <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} error={errors.notes} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
          <XCircle size={18} /> Cancel
        </Button>
        <Button type="submit" size="sm" loading={loading} disabled={loading}>
          <Save size={18} /> Save
        </Button>
      </div>
    </form>
  );
}

interface DispatchRow { line_id: number; qty: string }

function DispatchModal({ so, onClose, onDone }: { so: SalesOrderDetail; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<DispatchRow[]>(so.lines.map((l) => ({ line_id: l.id, qty: '' })));
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Insufficient-stock 409 is actionable and shown inline next to the line being dispatched, not
  // as a toast alone -- see UI_GUIDE.md §7 Step 6.
  const [stockError, setStockError] = useState<string | null>(null);

  const updateRow = (i: number, qty: string) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, qty } : row)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setStockError(null);

    const payload = {
      lines: rows
        .filter((r) => r.qty !== '')
        .map((r) => ({ line_id: r.line_id, qty: toNumber(r.qty) })),
    };

    const result = validate(fulfillLinesSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Enter a quantity for at least one line.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      await salesOrdersApi.dispatch(so.id, result.data.lines);
      toast.success('Sales order dispatched');
      onDone();
    } catch (err) {
      const info = parseApiError(err);
      if (info.isConflict) {
        // "insufficient stock: sku 1 has 10.000 available, cannot dispatch 15.000" -- shown inline
        // rather than only as a toast, and earlier lines in this same call may have already
        // committed, so resync from the server rather than assuming nothing happened.
        setStockError(info.message);
        onDone();
      } else {
        toast.error(info.message);
        if (info.isNotFound) onDone();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Dispatch" subtitle={so.so_number} size="lg"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>Dispatch</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-[var(--ink-muted)]">
          Enter what to ship for each line. Partial dispatch is fine -- you can ship the rest later.
        </p>
        {stockError && (
          <p className="text-sm font-semibold text-[var(--danger)] bg-[var(--danger-tint)] border-2 border-[var(--danger)] rounded-lg px-3 py-2.5 flex items-center gap-2">
            <AlertTriangle size={18} className="flex-shrink-0" /> {stockError}
          </p>
        )}
        <div className="space-y-2">
          {so.lines.map((l, i) => {
            const remaining = Math.max(0, l.ordered_qty - l.shipped_qty);
            return (
              <div key={l.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-base">{l.sku_name || `Product #${l.sku_id}`}</span>
                  <span className="block text-sm text-[var(--ink-muted)]">
                    {formatQty(l.shipped_qty)} / {formatQty(l.ordered_qty)} shipped{remaining > 0 ? ` · ${formatQty(remaining)} remaining` : ''}
                  </span>
                </div>
                <Input
                  type="number" step="0.001" min="0"
                  value={rows[i].qty}
                  onChange={(e) => updateRow(i, e.target.value)}
                  className="w-32"
                  placeholder="Qty to ship"
                />
              </div>
            );
          })}
        </div>
        {errors.lines && <p className="text-sm font-semibold text-[var(--danger)]">{errors.lines}</p>}
      </form>
    </Modal>
  );
}
