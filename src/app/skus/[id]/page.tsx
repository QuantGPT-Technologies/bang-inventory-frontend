'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { skusApi, customersApi, rawMaterialsApi, workflowTemplatesApi } from '@/lib/api';
import { SKU, Customer, RawMaterial, WorkflowTemplate } from '@/lib/types';
import { formatDate, formatQty, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { skuSchema, skuMaterialRowSchema, validate, toNumber, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { Pencil, Plus, X, Save, XCircle } from 'lucide-react';
import { z } from 'zod';

interface MaterialRow { raw_material_id: number; ratio_percent: string }

export default function SKUDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([]);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingMaterials, setEditingMaterials] = useState(false);

  const idParam = params?.id;
  const skuId = Number(idParam);
  const idIsValid = idParam != null && idParam !== '' && Number.isInteger(skuId) && skuId > 0;

  const fetchSku = useCallback(async () => {
    if (!idIsValid) return null;
    const res = await skusApi.get(skuId);
    return res.data?.data ?? null;
  }, [skuId, idIsValid]);

  const { data: sku, loading, error, reload } = useAsyncQuery<SKU | null>(fetchSku, [skuId, idIsValid], null);

  useEffect(() => {
    if (error && !error.isNotFound) toast.error(error.message);
  }, [error]);

  useEffect(() => {
    customersApi.list(1, 100).then((r) => setCustomers(r.data.data?.items || [])).catch(() => {});
    rawMaterialsApi.list(1, 100).then((r) => setRawMaterials(r.data.data?.items || [])).catch(() => {
      toast.error('Failed to load raw materials list. Editing what this product is made of may be unavailable.');
    });
    workflowTemplatesApi.list({ per_page: 100 }).then((r) => setWorkflowTemplates(r.data.data?.items || [])).catch(() => {
      toast.error('Failed to load workflow templates. Default workflow template editing may be unavailable.');
    });
  }, []);

  // The list endpoint doesn't return a distinct draft/published flag -- the workflow-templates
  // list page itself treats "has a current_version_id" as the published signal (see
  // src/app/workflow-templates/page.tsx's status column), so mirror that rule here: only
  // templates with a published version are valid choices for a SKU's default.
  const publishedWorkflowTemplates = workflowTemplates.filter((t) => t.current_version_id != null);

  if (!idIsValid) {
    return (
      <AppShell>
        <ErrorState error={{ message: 'Invalid SKU reference.', isNetworkError: false, isValidationError: false, isAuthError: false, isForbidden: false, isNotFound: true, isConflict: false, isServerError: false }} />
      </AppShell>
    );
  }

  if (loading) return <AppShell><div className="p-8 text-center text-base text-[var(--ink-muted)]">Loading…</div></AppShell>;
  if (error) return <AppShell><ErrorState error={error} onRetry={error.isNotFound ? undefined : reload} /></AppShell>;
  if (!sku) return <AppShell><div className="p-8 text-center text-base text-[var(--ink-muted)]">SKU not found.</div></AppShell>;

  const canWrite = canAccess(user, 'skus', 'write');

  return (
    <AppShell>
      <PageHeader
        title={sku.name}
        subtitle={sku.code}
        breadcrumb={[{ label: 'Products', href: '/skus' }, { label: sku.code }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          title="Details"
          className="lg:col-span-1"
          action={
            canWrite && !editingDetails && (
              <button
                onClick={() => setEditingDetails(true)}
                className="flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--accent)] hover:bg-[var(--paper-sunken)] transition-colors"
              >
                <Pencil size={18} /> Edit
              </button>
            )
          }
        >
          {editingDetails ? (
            <SkuDetailsForm
              sku={sku}
              customers={customers}
              workflowTemplates={publishedWorkflowTemplates}
              onCancel={() => setEditingDetails(false)}
              onSaved={() => { reload(); setEditingDetails(false); }}
            />
          ) : (
            <dl className="space-y-3 text-base">
              <DL label="SKU Code"><span className="font-mono font-bold">{sku.code}</span></DL>
              <DL label="Name">{sku.name}</DL>
              <DL label="Customer">{sku.customer_name || 'Internal / No customer'}</DL>
              <DL label="Unit">{sku.unit}</DL>
              <DL label="Stock"><span className="font-mono">{formatQty(sku.current_stock, sku.unit)}</span></DL>
              <DL label="Status">
                <Badge variant={sku.is_active ? 'success' : 'muted'}>{sku.is_active ? 'Active' : 'Inactive'}</Badge>
              </DL>
              <DL label="Default Workflow Template">
                {sku.default_workflow_template_id
                  ? workflowTemplates.find((t) => t.id === sku.default_workflow_template_id)?.name
                    || `Template #${sku.default_workflow_template_id}`
                  : <span className="text-[var(--ink-muted)]">System Default</span>}
              </DL>
              {sku.description && <DL label="Description"><span className="text-[var(--ink-muted)]">{sku.description}</span></DL>}
              <DL label="Created">{formatDate(sku.created_at)}</DL>
            </dl>
          )}
        </Card>

        <Card
          title="What It's Made Of"
          subtitle="Recipe used when making this product"
          className="lg:col-span-2"
          action={
            canWrite && !editingMaterials && (
              <Button variant="ghost" size="sm" onClick={() => setEditingMaterials(true)}>
                <Pencil size={18} /> Edit
              </Button>
            )
          }
        >
          {editingMaterials ? (
            <MaterialsForm
              sku={sku}
              rawMaterials={rawMaterials}
              onCancel={() => setEditingMaterials(false)}
              onSaved={() => { reload(); setEditingMaterials(false); }}
            />
          ) : !sku.materials?.length ? (
            <p className="text-base text-[var(--ink-muted)] italic">Not set yet — nothing added to show what this product is made from.</p>
          ) : (
            <div className="-mx-5">
              <Table
                columns={[
                  { key: 'material', header: 'Raw Material', primary: true, render: (m) => m.raw_material_name || `Material #${m.raw_material_id}` },
                  { key: 'ratio', header: 'Ratio', className: 'text-right font-mono', headerClassName: 'text-right', render: (m) => `${m.ratio_percent.toFixed(1)}%` },
                ]}
                data={sku.materials}
                keyExtractor={(m) => m.raw_material_id}
              />
              <div className="flex items-center justify-between px-4 py-2.5 text-sm font-bold text-[var(--ink-muted)]">
                <span>Total</span>
                <span className="font-mono">{sku.materials.reduce((s, m) => s + m.ratio_percent, 0).toFixed(1)}%</span>
              </div>
            </div>
          )}
        </Card>
      </div>
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

const skuDetailsSchema = z.object({
  code: skuSchema.shape.code,
  name: skuSchema.shape.name,
  description: skuSchema.shape.description,
  customer_id: skuSchema.shape.customer_id,
  unit: skuSchema.shape.unit,
  default_workflow_template_id: z.number().int().positive().nullable().optional(),
});

function SkuDetailsForm({
  sku,
  customers,
  workflowTemplates,
  onCancel,
  onSaved,
}: {
  sku: SKU;
  customers: Customer[];
  workflowTemplates: WorkflowTemplate[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(sku.code);
  const [name, setName] = useState(sku.name);
  const [description, setDescription] = useState(sku.description || '');
  const [customerId, setCustomerId] = useState<number | undefined>(sku.customer_id);
  const [unit, setUnit] = useState(sku.unit);
  const [defaultWorkflowTemplateId, setDefaultWorkflowTemplateId] = useState<number | null>(
    sku.default_workflow_template_id ?? null
  );
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = {
      code,
      name,
      description,
      customer_id: customerId,
      unit,
      default_workflow_template_id: defaultWorkflowTemplateId,
    };
    const result = validate(skuDetailsSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await skusApi.update(sku.id, result.data);
      toast.success('Product updated');
      onSaved();
    } catch (err) {
      const info = parseApiError(err);
      toast.error(info.message);
      if (info.fieldErrors) setErrors((prev) => ({ ...prev, ...info.fieldErrors }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input label="SKU Code" value={code} onChange={(e) => setCode(e.target.value)} error={errors.code} />
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
      <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} error={errors.description} />
      <Select
        label="Customer"
        options={customers.map((c) => ({ value: c.id, label: c.name }))}
        value={customerId || ''}
        onChange={(e) => setCustomerId(Number(e.target.value) || undefined)}
        placeholder="Internal / No customer"
      />
      <Select
        label="Unit"
        options={[{ value: 'pcs', label: 'pcs' }, { value: 'kg', label: 'kg' }, { value: 'g', label: 'g' }]}
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        placeholder=""
      />
      <Select
        label="Default Workflow Template"
        options={workflowTemplates.map((t) => ({ value: t.id, label: t.name }))}
        value={defaultWorkflowTemplateId || ''}
        onChange={(e) => setDefaultWorkflowTemplateId(Number(e.target.value) || null)}
        placeholder="System Default"
        hint={!errors.default_workflow_template_id ? 'Used when a lot for this SKU is created without an explicit workflow.' : undefined}
        error={errors.default_workflow_template_id}
      />
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

const materialsFormSchema = z.object({ materials: z.array(skuMaterialRowSchema) }).superRefine((d, ctx) => {
  const ids = d.materials.map((m) => m.raw_material_id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    ctx.addIssue({ code: 'custom', message: 'Each raw material can only be listed once', path: ['materials'] });
  }
  if (d.materials.length > 0) {
    const total = d.materials.reduce((s, m) => s + m.ratio_percent, 0);
    if (Math.abs(total - 100) > 0.01) {
      ctx.addIssue({ code: 'custom', message: `Must add up to 100% (currently ${total.toFixed(1)}%)`, path: ['materials'] });
    }
  } else {
    ctx.addIssue({ code: 'custom', message: 'Add at least one raw material', path: ['materials'] });
  }
});

function MaterialsForm({
  sku,
  rawMaterials,
  onCancel,
  onSaved,
}: {
  sku: SKU;
  rawMaterials: RawMaterial[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [materials, setMaterials] = useState<MaterialRow[]>(
    sku.materials?.length
      ? sku.materials.map((m) => ({ raw_material_id: m.raw_material_id, ratio_percent: String(m.ratio_percent) }))
      : [{ raw_material_id: 0, ratio_percent: '' }]
  );
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const noMaterialsAvailable = rawMaterials.length === 0;

  const addMaterial = () => setMaterials((m) => [...m, { raw_material_id: 0, ratio_percent: '' }]);
  const removeMaterial = (i: number) => setMaterials((m) => (m.length > 1 ? m.filter((_, idx) => idx !== i) : m));
  const updateMaterial = (i: number, field: keyof MaterialRow, value: string | number) =>
    setMaterials((m) => m.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const total = useMemo(
    () => materials.reduce((s, m) => s + (toNumber(m.ratio_percent) || 0), 0),
    [materials]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = {
      materials: materials
        .filter((m) => m.raw_material_id > 0 || m.ratio_percent !== '')
        .map((m) => ({ raw_material_id: m.raw_material_id, ratio_percent: toNumber(m.ratio_percent) })),
    };
    const result = validate(materialsFormSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await skusApi.setMaterials(sku.id, result.data.materials);
      toast.success('Updated what this product is made of');
      onSaved();
    } catch (err) {
      const info = parseApiError(err);
      toast.error(info.message);
      if (info.fieldErrors) setErrors((prev) => ({ ...prev, ...info.fieldErrors }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {noMaterialsAvailable && (
        <p className="text-sm font-semibold text-[var(--warning)] bg-[var(--warning-tint)] border-2 border-[var(--warning)] rounded-lg px-3 py-2">
          No raw materials yet. Add one under Raw Materials first.
        </p>
      )}
      <div className="space-y-2">
        {materials.map((m, i) => (
          <div key={i} className="flex gap-2 items-end">
            <div className="flex-1">
              <Select
                options={rawMaterials.map((r) => ({ value: r.id, label: `${r.name} (${r.unit}) — ${r.current_stock} in stock` }))}
                value={m.raw_material_id || ''}
                onChange={(e) => updateMaterial(i, 'raw_material_id', Number(e.target.value))}
                placeholder="Select material…"
              />
            </div>
            <div className="w-24">
              <Input
                type="number" step="0.1" min="0" max="100"
                value={m.ratio_percent}
                onChange={(e) => updateMaterial(i, 'ratio_percent', e.target.value)}
                placeholder="%"
              />
            </div>
            <button
              type="button"
              onClick={() => removeMaterial(i)}
              disabled={materials.length === 1}
              className="flex items-center gap-1.5 text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--danger)] min-h-11 px-2 disabled:opacity-30"
            >
              <X size={18} /> Remove
            </button>
          </div>
        ))}
      </div>
      {errors.materials && <p className="text-sm font-semibold text-[var(--danger)]">{errors.materials}</p>}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addMaterial} disabled={noMaterialsAvailable}>
          <Plus size={18} /> Add
        </Button>
        <span className={`text-sm font-bold ${Math.abs(total - 100) < 0.01 ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
          Adds up to: {total.toFixed(1)}%
        </span>
      </div>
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
