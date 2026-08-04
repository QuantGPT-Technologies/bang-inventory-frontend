'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Badge, poStatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ErrorState } from '@/components/ui/ErrorState';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { purchaseOrdersApi } from '@/lib/api';
import { PurchaseOrderDetail, PurchaseOrderLine } from '@/lib/types';
import { formatDate, formatDateTime, formatQty, parseApiError, PO_STATUS_LABELS } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { fulfillLinesSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { Send, PackageCheck, CheckCircle, Ban, Pencil, Save, XCircle } from 'lucide-react';

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const idParam = params?.id;
  const poId = Number(idParam);
  const idIsValid = idParam != null && idParam !== '' && Number.isInteger(poId) && poId > 0;

  const fetchPO = useCallback(async () => {
    if (!idIsValid) return null;
    const res = await purchaseOrdersApi.get(poId);
    return res.data?.data ?? null;
  }, [poId, idIsValid]);

  const { data: po, loading, error, reload } = useAsyncQuery<PurchaseOrderDetail | null>(fetchPO, [poId, idIsValid], null);

  useEffect(() => {
    if (error && !error.isNotFound) toast.error(error.message);
  }, [error]);

  if (!idIsValid) {
    return (
      <AppShell>
        <ErrorState error={{ message: 'Invalid purchase order reference.', isNetworkError: false, isValidationError: false, isAuthError: false, isForbidden: false, isNotFound: true, isConflict: false, isServerError: false }} />
      </AppShell>
    );
  }

  if (loading && !po) return <AppShell><div className="p-8 text-center text-base text-[var(--ink-muted)]">Loading…</div></AppShell>;
  if (error && !po) return <AppShell><ErrorState error={error} onRetry={error.isNotFound ? undefined : reload} /></AppShell>;
  if (!po) return <AppShell><div className="p-8 text-center text-base text-[var(--ink-muted)]">Purchase order not found.</div></AppShell>;

  const canWrite = canAccess(user, 'purchase_orders', 'write');
  const canReceive = canAccess(user, 'purchase_orders', 'receive');

  const handleAction = async (action: () => Promise<unknown>, successMsg: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(successMsg);
      reload();
      setShowSend(false);
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

  const totalOrdered = po.lines.reduce((s, l) => s + l.ordered_qty, 0);
  const totalReceived = po.lines.reduce((s, l) => s + l.received_qty, 0);

  return (
    <AppShell>
      <PageHeader
        title={`Purchase Order ${po.po_number}`}
        breadcrumb={[{ label: 'Purchase Orders', href: '/orders/purchase' }, { label: po.po_number }]}
        action={
          <div className="flex gap-2">
            {po.status === 'draft' && canWrite && (
              <Button onClick={() => setShowSend(true)}>
                <Send size={18} /> Send to Vendor
              </Button>
            )}
            {(po.status === 'sent' || po.status === 'partially_received') && canReceive && (
              <Button onClick={() => setShowReceive(true)}>
                <PackageCheck size={18} /> Receive Goods
              </Button>
            )}
            {(po.status === 'received' || po.status === 'partially_received') && canWrite && (
              <Button variant="outline" onClick={() => setShowClose(true)}>
                <CheckCircle size={18} /> Close
              </Button>
            )}
            {(po.status === 'draft' || po.status === 'sent') && canWrite && (
              <Button variant="danger" onClick={() => setShowCancel(true)}>
                <Ban size={18} /> Cancel
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-min gap-4">
        <Card
          title="Order Details"
          className="lg:col-span-1"
          action={
            po.status === 'draft' && canWrite && !editing && (
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
            <EditPurchaseOrderForm po={po} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
          ) : (
            <dl className="space-y-3 text-base">
              <DL label="PO Number"><span className="font-mono font-bold">{po.po_number}</span></DL>
              <DL label="Vendor">{po.vendor_name || `Vendor #${po.vendor_id}`}</DL>
              <DL label="Status">
                <Badge variant={poStatusBadge(po.status)}>{PO_STATUS_LABELS[po.status] || po.status}</Badge>
              </DL>
              <DL label="Expected Date">{po.expected_date ? formatDate(po.expected_date) : '—'}</DL>
              <DL label="Created">{formatDateTime(po.created_at)}</DL>
              {po.notes && <DL label="Notes"><span className="text-[var(--ink-muted)]">{po.notes}</span></DL>}
            </dl>
          )}
        </Card>

        <Card title="Lines" className="lg:col-span-2" noPadding fill>
          <Table
            columns={[
              { key: 'material', header: 'Material', primary: true, render: (l: PurchaseOrderLine) => l.material_name || `Material #${l.raw_material_id}` },
              { key: 'ordered', header: 'Ordered', className: 'text-right font-mono', headerClassName: 'text-right', render: (l: PurchaseOrderLine) => formatQty(l.ordered_qty) },
              { key: 'received', header: 'Received', className: 'text-right font-mono', headerClassName: 'text-right', render: (l: PurchaseOrderLine) => (
                <span className={l.received_qty > l.ordered_qty ? 'text-[var(--warning)] font-semibold' : ''}>{formatQty(l.received_qty)}</span>
              ) },
              { key: 'unit_price', header: 'Unit Price', className: 'text-right font-mono text-[var(--ink-muted)]', headerClassName: 'text-right', hideInCard: true, render: (l: PurchaseOrderLine) => l.unit_price != null ? l.unit_price.toFixed(2) : '—' },
            ]}
            data={po.lines}
            keyExtractor={(l) => l.id}
            emptyMessage="No lines on this purchase order."
          />
          {po.lines.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 text-sm font-bold text-[var(--ink-muted)] border-t border-[var(--border)]">
              <span>Total</span>
              <span className="font-mono">{formatQty(totalReceived)} / {formatQty(totalOrdered)} received</span>
            </div>
          )}
        </Card>
      </div>

      {showSend && (
        <ConfirmModal
          open
          title="Send to Vendor"
          message={`Send purchase order ${po.po_number} to the vendor? Lines will be locked once sent.`}
          confirmLabel="Send"
          danger={false}
          loading={busy}
          onConfirm={() => handleAction(() => purchaseOrdersApi.send(po.id), 'Purchase order sent')}
          onCancel={() => setShowSend(false)}
        />
      )}
      {showReceive && (
        <ReceiveGoodsModal
          po={po}
          onClose={() => setShowReceive(false)}
          onDone={() => { setShowReceive(false); reload(); }}
        />
      )}
      {showClose && (
        <ConfirmModal
          open
          title="Close Purchase Order"
          message={`Close purchase order ${po.po_number}? This marks it as complete.`}
          confirmLabel="Close"
          danger={false}
          loading={busy}
          onConfirm={() => handleAction(() => purchaseOrdersApi.close(po.id), 'Purchase order closed')}
          onCancel={() => setShowClose(false)}
        />
      )}
      {showCancel && (
        <ConfirmModal
          open
          title="Cancel Purchase Order"
          message={`Cancel purchase order ${po.po_number}? This cannot be undone.`}
          confirmLabel="Cancel Order"
          loading={busy}
          onConfirm={() => handleAction(() => purchaseOrdersApi.cancel(po.id), 'Purchase order cancelled')}
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

function EditPurchaseOrderForm({ po, onCancel, onSaved }: { po: PurchaseOrderDetail; onCancel: () => void; onSaved: () => void }) {
  const [expectedDate, setExpectedDate] = useState(po.expected_date || '');
  const [notes, setNotes] = useState(po.notes || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErrors({});
    try {
      // Header-only edit -- lines are left untouched by omitting `lines` from the body (see
      // UI_GUIDE.md §7 Step 1: passing `lines` replaces the full set).
      await purchaseOrdersApi.update(po.id, { expected_date: expectedDate || undefined, notes: notes || undefined });
      toast.success('Purchase order updated');
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
        <label className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide block mb-1.5">PO Number</label>
        <p className="font-mono font-bold text-base">{po.po_number}</p>
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

interface ReceiveRow { line_id: number; qty: string }

function ReceiveGoodsModal({ po, onClose, onDone }: { po: PurchaseOrderDetail; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<ReceiveRow[]>(po.lines.map((l) => ({ line_id: l.id, qty: '' })));
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const updateRow = (i: number, qty: string) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, qty } : row)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

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
      await purchaseOrdersApi.receive(po.id, result.data.lines);
      toast.success('Goods received');
      onDone();
    } catch (err) {
      const info = parseApiError(err);
      toast.error(info.message);
      // Partial multi-line failure: earlier lines may have already committed -- resync from the
      // error response rather than assuming nothing happened (see UI_GUIDE.md §7 Step 3).
      if (info.isConflict || info.isNotFound || info.isValidationError) onDone();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Receive Goods" subtitle={po.po_number} size="lg"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>Receive</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-[var(--ink-muted)]">
          Enter what actually arrived for each line. Partial receipt is fine -- you can receive the rest later. Receiving more than was ordered is also allowed.
        </p>
        <div className="space-y-2">
          {po.lines.map((l, i) => {
            const remaining = Math.max(0, l.ordered_qty - l.received_qty);
            return (
              <div key={l.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-base">{l.material_name || `Material #${l.raw_material_id}`}</span>
                  <span className="block text-sm text-[var(--ink-muted)]">
                    {formatQty(l.received_qty)} / {formatQty(l.ordered_qty)} received{remaining > 0 ? ` · ${formatQty(remaining)} remaining` : ''}
                  </span>
                </div>
                <Input
                  type="number" step="0.001" min="0"
                  value={rows[i].qty}
                  onChange={(e) => updateRow(i, e.target.value)}
                  className="w-32"
                  placeholder="Qty received"
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
