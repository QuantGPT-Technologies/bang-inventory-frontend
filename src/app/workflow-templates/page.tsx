'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { workflowTemplatesApi } from '@/lib/api';
import { WorkflowTemplate, PaginatedResponse } from '@/lib/types';
import { formatDate, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { workflowTemplateMetaSchema, validate, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { Plus } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<WorkflowTemplate> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

export default function WorkflowTemplatesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const fetchTemplates = useCallback(async () => {
    const res = await workflowTemplatesApi.list({ page, per_page: PER_PAGE });
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page]);

  const { data, loading, error, reload } = useAsyncQuery(fetchTemplates, [page], EMPTY);
  const templates = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const columns = [
    { key: 'name', header: 'Name', render: (row: WorkflowTemplate) => <span className="font-bold">{row.name}</span> },
    { key: 'description', header: 'Description', render: (row: WorkflowTemplate) => row.description || '—' },
    {
      key: 'entity_type',
      header: 'Entity Type',
      render: (row: WorkflowTemplate) => (
        <Badge variant={row.entity_type === 'batch' ? 'info' : 'default'}>
          {row.entity_type === 'batch' ? 'Batch' : 'Lot'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      // The list endpoint returns only current_version_id, not the version number of that
      // version -- showing "Published vN" would require an extra fetch per row, so for now we
      // show a plain "Published" badge. Follow-up: have the list endpoint join in the version
      // number (or embed it on WorkflowTemplate) if the version number needs to show here too.
      render: (row: WorkflowTemplate) => (
        <Badge variant={row.current_version_id ? 'success' : 'muted'}>
          {row.current_version_id ? 'Published' : 'Draft'}
        </Badge>
      ),
    },
    { key: 'created_at', header: 'Created', render: (row: WorkflowTemplate) => formatDate(row.created_at) },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Workflow Templates"
        subtitle="Graph-based production workflow definitions"
        action={
          canAccess(user, 'workflow_templates', 'write') && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New Workflow Template
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
              data={templates}
              keyExtractor={(r) => r.id}
              onRowClick={(r) => router.push(`/workflow-templates/${r.id}/edit`)}
              loading={loading}
              emptyMessage="No workflow templates found. Create one to get started."
            />
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CreateWorkflowTemplateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            router.push(`/workflow-templates/${id}/edit`);
          }}
        />
      )}
    </AppShell>
  );
}

function CreateWorkflowTemplateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Defaults to 'lot' -- matches the backend's own default when entity_type is omitted (see
  // CreateWorkflowTemplateRequest.EntityType).
  const [entityType, setEntityType] = useState<'lot' | 'batch'>('lot');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = { name, description, entity_type: entityType };

    const result = validate(workflowTemplateMetaSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      const res = await workflowTemplatesApi.create(result.data);
      const created = res.data?.data;
      toast.success('Workflow template created successfully');
      if (created?.id) {
        onCreated(created.id);
      } else {
        onClose();
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
    <Modal
      open
      onClose={onClose}
      title="New Workflow Template"
      subtitle="Create a graph-based production workflow"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>
            Create Template
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Standard 6-Step Production Pipeline" maxLength={150} />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} error={errors.description} />
        <div>
          <label className="text-sm font-bold text-[var(--ink-light)] uppercase tracking-wide block mb-2">
            Applies To
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEntityType('lot')}
              className={`flex-1 rounded-xl border-2 px-4 py-3 min-h-[52px] text-left text-base transition-colors ${
                entityType === 'lot'
                  ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink)]'
                  : 'border-[var(--border-strong)] bg-[var(--paper-raised)] text-[var(--ink-muted)] hover:bg-[var(--paper-sunken)]'
              }`}
            >
              <span className="font-bold block">Lots</span>
              <span className="text-sm">Per-SKU production pipeline</span>
            </button>
            <button
              type="button"
              onClick={() => setEntityType('batch')}
              className={`flex-1 rounded-xl border-2 px-4 py-3 min-h-[52px] text-left text-base transition-colors ${
                entityType === 'batch'
                  ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink)]'
                  : 'border-[var(--border-strong)] bg-[var(--paper-raised)] text-[var(--ink-muted)] hover:bg-[var(--paper-sunken)]'
              }`}
            >
              <span className="font-bold block">Batches</span>
              <span className="text-sm">Blend & split flow</span>
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
