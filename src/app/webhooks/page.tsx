'use client';
import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
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
import { Plus, Play, Trash2, Edit } from 'lucide-react';

const EVENT_OPTIONS = [
  'batch.created', 'batch.blending_started', 'batch.blending_completed', 'batch.lots_created',
  'lot.step_started', 'lot.step_completed', 'lot.step_skipped', 'lot.scrap_recorded', 'lot.completed',
];

export default function WebhooksPage() {
  const { user } = useAuthStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Webhook | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Webhook | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const canManage = canAccess(user, 'webhooks', 'crud');

  const fetchWebhooks = useCallback(async () => {
    const res = await webhooksApi.list();
    const items = res.data?.data;
    return Array.isArray(items) ? items : [];
  }, []);

  const { data: webhooks, loading, error, reload } = useAsyncQuery<Webhook[]>(fetchWebhooks, [], []);

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

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
    { key: 'name', header: 'Name', render: (w: Webhook) => <span className="font-medium">{w.name}</span> },
    { key: 'url', header: 'URL', render: (w: Webhook) => <span className="font-mono text-xs break-all">{w.url}</span> },
    {
      key: 'events',
      header: 'Events',
      render: (w: Webhook) => (
        <div className="flex flex-wrap gap-1">
          {(w.events || []).slice(0, 3).map((e) => (
            <Badge key={e} variant="muted" className="text-[10px]">{e}</Badge>
          ))}
          {(w.events || []).length > 3 && <span className="text-xs text-[var(--ink-muted)]">+{w.events.length - 3}</span>}
          {(w.events || []).length === 0 && <span className="text-xs text-[var(--ink-muted)] italic">No events</span>}
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
    { key: 'created_at', header: 'Created', render: (w: Webhook) => formatDate(w.created_at) },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            render: (w: Webhook) => (
              <div className="flex items-center gap-1 justify-end">
                <button onClick={(e) => { e.stopPropagation(); handleTest(w); }} disabled={busyId === w.id || !w.is_active} className="p-1 text-[var(--ink-muted)] hover:text-[var(--accent)] disabled:opacity-30" title={w.is_active ? 'Send test event' : 'Webhook is inactive'}>
                  <Play size={12} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowEdit(w); }} className="p-1 text-[var(--ink-muted)] hover:text-blue-600" title="Edit">
                  <Edit size={12} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(w); }} disabled={busyId === w.id} className="p-1 text-[var(--ink-muted)] hover:text-red-600 disabled:opacity-30" title="Delete">
                  <Trash2 size={12} />
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
        subtitle="Outgoing webhook integrations"
        action={
          canManage && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Webhook
            </Button>
          )
        }
      />

      <Card noPadding>
        {error && !loading ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <Table
            columns={columns}
            data={webhooks}
            keyExtractor={(w) => w.id}
            loading={loading}
            emptyMessage="No webhooks configured."
          />
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
          <p className="text-sm text-[var(--ink-muted)]">
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
        <Input label="URL" value={url} onChange={(e) => setUrl(e.target.value)} error={errors.url} placeholder="https://example.com/webhook" />
        <Input label="Secret (optional)" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} error={errors.secret} placeholder={webhook ? 'Leave blank to keep existing secret' : 'For HMAC signature'} />
        <div>
          <label className="text-xs font-medium text-[var(--ink-light)] uppercase tracking-wide block mb-2">Events</label>
          <div className="flex flex-wrap gap-2">
            {EVENT_OPTIONS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.includes(ev)}
                  onChange={() => toggleEvent(ev)}
                  className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                {ev}
              </label>
            ))}
          </div>
          {errors.events && <p className="text-xs text-red-600 mt-1.5">{errors.events}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
          />
          Active
        </label>
      </form>
    </Modal>
  );
}
