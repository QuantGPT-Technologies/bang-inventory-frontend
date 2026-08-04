'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination, TABLE_ROW_HEIGHT_PX, TABLE_CARD_ROW_HEIGHT_PX } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { webhooksApi } from '@/lib/api';
import { Webhook } from '@/lib/types';
import { formatDate, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { webhookSchema, validate, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { useFitRowCount } from '@/lib/useFitRowCount';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Plus, Play, Trash2, Edit } from 'lucide-react';

const EVENT_OPTIONS = [
  'batch.created', 'batch.blending_started', 'batch.blending_completed', 'batch.lots_created', 'batch.completed',
  'lot.step_started', 'lot.step_completed', 'lot.step_skipped', 'lot.scrap_recorded', 'lot.completed',
  'workflow.node_started', 'workflow.node_completed', 'workflow.node_skipped', 'workflow.node_overridden',
  'workflow.scrap_recorded', 'workflow.approval_requested', 'workflow.approval_decided',
  'workflow.quality_result_recorded', 'workflow.instance_completed', 'workflow.batch_split',
  'workflow.auto_scrap_calculated',
  'purchase_order.created', 'purchase_order.sent', 'purchase_order.received', 'purchase_order.closed', 'purchase_order.cancelled',
  'sales_order.created', 'sales_order.confirmed', 'sales_order.dispatched', 'sales_order.closed', 'sales_order.cancelled',
];

// GET /webhooks has no page/per_page params -- it returns the full list in one response. Paged
// here on the client instead of guessing at query params the backend may not support.
const INITIAL_PER_PAGE = 20;

export default function WebhooksPage() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Webhook | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Webhook | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const canManage = canAccess(user, 'webhooks', 'crud');

  const tableBodyRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const perPage = useFitRowCount(tableBodyRef, isMobile ? TABLE_CARD_ROW_HEIGHT_PX : TABLE_ROW_HEIGHT_PX, 5, 100, INITIAL_PER_PAGE);

  // A window resize can change how many rows fit -- reset to page 1 so `page` never points past
  // the new `totalPages` (skips the very first render so it doesn't fight the initial fetch).
  const isFirstPerPage = useRef(true);
  useEffect(() => {
    if (isFirstPerPage.current) { isFirstPerPage.current = false; return; }
    setPage(1);
  }, [perPage]);

  const fetchWebhooks = useCallback(async () => {
    const res = await webhooksApi.list();
    const items = res.data?.data;
    const list = Array.isArray(items) ? items : [];
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  }, []);

  const { data: allWebhooks, loading, error, reload } = useAsyncQuery<Webhook[]>(fetchWebhooks, [], []);
  const total = allWebhooks.length;
  const webhooks = allWebhooks.slice((page - 1) * perPage, page * perPage);

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  // If a delete (or the list itself) shrinks below the current page's range, snap back rather
  // than showing an empty page with working-looking Prev/Next above it.
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / perPage));
    if (page > maxPage) setPage(maxPage);
  }, [total, page, perPage]);

  const handleTest = async (w: Webhook) => {
    if (busyId) return;
    setBusyId(w.id);
    try {
      await webhooksApi.test(w.id);
      toast.success(`Test event sent to ${w.name}`);
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (w: Webhook) => {
    if (busyId) return;
    setBusyId(w.id);
    try {
      await webhooksApi.delete(w.id);
      toast.success('Webhook deleted');
      setConfirmDelete(null);
      reload();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    { key: 'name', header: 'Name', primary: true, render: (w: Webhook) => <span className="font-bold">{w.name || <span className="italic text-[var(--ink-muted)]">Unnamed</span>}</span> },
    { key: 'url', header: 'URL', render: (w: Webhook) => <span className="font-mono text-sm break-all">{w.url}</span> },
    {
      key: 'events',
      header: 'Events',
      render: (w: Webhook) => (
        <div className="flex flex-wrap gap-1.5">
          {(w.events || []).slice(0, 3).map((e) => (
            <Badge key={e} variant="muted" className="text-xs">{e}</Badge>
          ))}
          {(w.events || []).length > 3 && <span className="text-sm text-[var(--ink-muted)]">+{w.events.length - 3}</span>}
          {(w.events || []).length === 0 && <span className="text-sm text-[var(--ink-muted)] italic">No events</span>}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (w: Webhook) => (
        <Badge variant={w.is_active ? 'success' : 'muted'}>{w.is_active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    { key: 'created_at', header: 'Created', hideInCard: true, render: (w: Webhook) => formatDate(w.created_at) },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            isActions: true,
            render: (w: Webhook) => (
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={(e) => { e.stopPropagation(); handleTest(w); }}
                  disabled={busyId === w.id || !w.is_active}
                  className="flex items-center gap-1.5 px-3 min-h-11 rounded-lg text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-tint)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={w.is_active ? 'Send test event' : 'Webhook is inactive'}
                  aria-label={w.is_active ? 'Send test event' : 'Webhook is inactive'}
                >
                  <Play size={18} /> Test
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowEdit(w); }}
                  className="flex items-center gap-1.5 px-3 min-h-11 rounded-lg text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--info)] hover:bg-[var(--info-tint)] transition-colors"
                  title="Edit"
                  aria-label="Edit webhook"
                >
                  <Edit size={18} /> Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(w); }}
                  disabled={busyId === w.id}
                  className="flex items-center gap-1.5 px-3 min-h-11 rounded-lg text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-tint)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Delete"
                  aria-label="Delete webhook"
                >
                  <Trash2 size={18} /> Delete
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <AppShell>
      <PageHeader
        title="Webhooks"
        subtitle="Send events to other systems when things happen"
        action={
          canManage && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New Webhook
            </Button>
          )
        }
      />

      <Card noPadding fill>
        {error && !loading ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <Table
              columns={columns}
              data={webhooks}
              keyExtractor={(w) => w.id}
              loading={loading}
              emptyMessage="No webhooks configured."
              bodyRef={tableBodyRef}
            />
            <Pagination page={page} total={total} perPage={perPage} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <WebhookModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); reload(); }}
        />
      )}
      {showEdit && (
        <WebhookModal
          webhook={showEdit}
          onClose={() => setShowEdit(null)}
          onUpdated={() => { setShowEdit(null); reload(); }}
        />
      )}
      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(null)}
          title="Delete Webhook"
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={busyId === confirmDelete.id}>Cancel</Button>
              <Button variant="danger" loading={busyId === confirmDelete.id} disabled={busyId === confirmDelete.id} onClick={() => handleDelete(confirmDelete)}>Delete</Button>
            </>
          }
        >
          <p className="text-base text-[var(--ink-muted)]">
            Delete <strong>{confirmDelete.name}</strong>? This cannot be undone and will stop all future event deliveries to this URL.
          </p>
        </Modal>
      )}
    </AppShell>
  );
}

function WebhookModal({
  webhook,
  onClose,
  onCreated,
  onUpdated,
}: {
  webhook?: Webhook;
  onClose: () => void;
  onCreated?: () => void;
  onUpdated?: () => void;
}) {
  const [name, setName] = useState(webhook?.name || '');
  const [url, setUrl] = useState(webhook?.url || '');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>(webhook?.events || []);
  const [isActive, setIsActive] = useState(webhook?.is_active ?? true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const toggleEvent = (e: string) => {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  };

  const batchEvents = EVENT_OPTIONS.filter((e) => e.startsWith('batch.'));
  const lotEvents = EVENT_OPTIONS.filter((e) => e.startsWith('lot.'));
  const workflowEvents = EVENT_OPTIONS.filter((e) => e.startsWith('workflow.'));
  const orderEvents = EVENT_OPTIONS.filter((e) => e.startsWith('purchase_order.') || e.startsWith('sales_order.'));

  const handleUrlBlur = () => {
    const trimmed = url.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      setUrl(`https://${trimmed}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const result = validate(webhookSchema, { name, url, secret, events, is_active: isActive });
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    const data: Record<string, unknown> = {
      name: result.data.name,
      url: result.data.url,
      events: result.data.events,
      is_active: result.data.is_active,
    };
    if (result.data.secret) data.secret = result.data.secret;

    setLoading(true);
    try {
      if (webhook) {
        await webhooksApi.update(webhook.id, data);
        toast.success('Webhook updated');
        onUpdated?.();
      } else {
        await webhooksApi.create(data);
        toast.success('Webhook created');
        onCreated?.();
      }
    } catch (err) {
      const info = parseApiError(err);
      toast.error(info.message);
      if (info.fieldErrors) setErrors((prev) => ({ ...prev, ...info.fieldErrors }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={webhook ? 'Edit Webhook' : 'New Webhook'} size="md"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>{webhook ? 'Update' : 'Create'}</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Production Alerts" maxLength={150} />
        <Input label="URL" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={handleUrlBlur} error={errors.url} placeholder="https://example.com/webhook" />
        <Input label="Secret (optional)" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} error={errors.secret} placeholder={webhook ? 'Leave blank to keep existing secret' : 'For HMAC signature'} />
        <div>
          <label className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide block mb-2">Events</label>
          <div className="flex flex-wrap gap-2 mb-2.5">
            <button type="button" onClick={() => setEvents(EVENT_OPTIONS)} className="text-sm font-semibold px-3 min-h-9 rounded-full border-2 border-[var(--border-strong)] text-[var(--ink-light)] hover:bg-[var(--paper-sunken)] transition-colors">All</button>
            <button type="button" onClick={() => setEvents(batchEvents)} className="text-sm font-semibold px-3 min-h-9 rounded-full border-2 border-[var(--border-strong)] text-[var(--ink-light)] hover:bg-[var(--paper-sunken)] transition-colors">Batch events</button>
            <button type="button" onClick={() => setEvents(lotEvents)} className="text-sm font-semibold px-3 min-h-9 rounded-full border-2 border-[var(--border-strong)] text-[var(--ink-light)] hover:bg-[var(--paper-sunken)] transition-colors">Lot events</button>
            <button type="button" onClick={() => setEvents(workflowEvents)} className="text-sm font-semibold px-3 min-h-9 rounded-full border-2 border-[var(--border-strong)] text-[var(--ink-light)] hover:bg-[var(--paper-sunken)] transition-colors">Workflow events</button>
            <button type="button" onClick={() => setEvents(orderEvents)} className="text-sm font-semibold px-3 min-h-9 rounded-full border-2 border-[var(--border-strong)] text-[var(--ink-light)] hover:bg-[var(--paper-sunken)] transition-colors">Order events</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {EVENT_OPTIONS.map((ev) => (
              <label key={ev} className="flex items-center gap-2 text-sm min-h-11 px-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.includes(ev)}
                  onChange={() => toggleEvent(ev)}
                  className="w-5 h-5 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                {ev}
              </label>
            ))}
          </div>
          {errors.events && <p className="text-sm font-semibold text-[var(--danger)] mt-1.5">{errors.events}</p>}
        </div>
        <label className="flex items-center gap-2 text-base min-h-11 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-5 h-5 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)]"
          />
          Active
        </label>
      </form>
    </Modal>
  );
}
