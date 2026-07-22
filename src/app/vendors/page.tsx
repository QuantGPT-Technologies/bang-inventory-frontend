'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { vendorsApi } from '@/lib/api';
import { Vendor, PaginatedResponse } from '@/lib/types';
import { formatDate, parseApiError, suggestCode } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { vendorSchema, validate, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { useUrlState } from '@/lib/useUrlState';
import { Plus, Pencil, Ban, CheckCircle2, Search } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<Vendor> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

export default function VendorsPage() {
  return (
    <Suspense fallback={<AppShell><div className="text-base text-[var(--ink-muted)]">Loading…</div></AppShell>}>
      <VendorsPageInner />
    </Suspense>
  );
}

function VendorsPageInner() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useUrlState('q', '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Vendor | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Vendor | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const canWrite = canAccess(user, 'vendors', 'write');

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchVendors = useCallback(async () => {
    const res = await vendorsApi.list(page, PER_PAGE, debouncedSearch || undefined);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page, debouncedSearch]);

  const { data, loading, error, reload } = useAsyncQuery(fetchVendors, [page, debouncedSearch], EMPTY);
  const vendors = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  // The hosted backend has no DELETE route for vendors -- deactivating (is_active: false) hides
  // the supplier from pickers elsewhere without destroying history.
  const applyToggle = async (v: Vendor) => {
    if (busyId) return;
    setBusyId(v.id);
    try {
      await vendorsApi.update(v.id, { is_active: !v.is_active });
      toast.success(v.is_active ? `${v.name} deactivated` : `${v.name} reactivated`);
      setConfirmDeactivate(null);
      reload();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = (v: Vendor) => {
    if (v.is_active === false) {
      applyToggle(v);
    } else {
      setConfirmDeactivate(v);
    }
  };

  const columns = [
    { key: 'name', header: 'Name', primary: true, render: (v: Vendor) => <span className="font-medium">{v.name}</span> },
    { key: 'code', header: 'Code', hideInCard: true, render: (v: Vendor) => v.code ? <span className="font-mono">{v.code}</span> : '—' },
    { key: 'contact_person', header: 'Contact', render: (v: Vendor) => v.contact_person || '—' },
    { key: 'email', header: 'Email', render: (v: Vendor) => v.email || '—' },
    { key: 'phone', header: 'Phone', render: (v: Vendor) => v.phone || '—' },
    {
      key: 'is_active',
      header: 'Status',
      render: (v: Vendor) => <Badge variant={v.is_active === false ? 'muted' : 'success'}>{v.is_active === false ? 'Inactive' : 'Active'}</Badge>,
    },
    { key: 'created_at', header: 'Created', hideInCard: true, render: (v: Vendor) => formatDate(v.created_at) },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            isActions: true,
            render: (v: Vendor) => (
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShowEdit(v); }}
                  className="flex items-center gap-1.5 px-3 min-h-11 rounded-lg text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--info)] hover:bg-[var(--info-tint)] transition-colors"
                >
                  <Pencil size={18} /> Edit
                </button>
                <button
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleToggleActive(v); }}
                  disabled={busyId === v.id}
                  className={`flex items-center gap-1.5 px-3 min-h-11 rounded-lg text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    v.is_active === false
                      ? 'text-[var(--ink-muted)] hover:text-[var(--success)] hover:bg-[var(--success-tint)]'
                      : 'text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-tint)]'
                  }`}
                >
                  {v.is_active === false ? <CheckCircle2 size={18} /> : <Ban size={18} />}
                  {v.is_active === false ? 'Reactivate' : 'Deactivate'}
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
        title="Vendors"
        subtitle="Suppliers who provide raw materials"
        action={
          canWrite && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New Vendor
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
              placeholder="Search name or code"
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
              data={vendors}
              keyExtractor={(v) => v.id}
              loading={loading}
              emptyMessage={search ? 'No suppliers match your search.' : 'No vendors found.'}
            />
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <VendorModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); setPage(1); reload(); }}
        />
      )}
      {showEdit && (
        <VendorModal
          vendor={showEdit}
          onClose={() => setShowEdit(null)}
          onSaved={() => { setShowEdit(null); reload(); }}
        />
      )}
      <ConfirmModal
        open={!!confirmDeactivate}
        title="Deactivate Supplier"
        message={confirmDeactivate ? <>Deactivate <strong>{confirmDeactivate.name}</strong>? They&apos;ll no longer appear in places that pick a supplier, like new raw materials.</> : ''}
        confirmLabel="Deactivate"
        loading={busyId === confirmDeactivate?.id}
        onConfirm={() => confirmDeactivate && applyToggle(confirmDeactivate)}
        onCancel={() => setConfirmDeactivate(null)}
      />
    </AppShell>
  );
}

function VendorModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor?: Vendor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(vendor?.name || '');
  const [code, setCode] = useState(vendor?.code || '');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(!!vendor);
  const [contactPerson, setContactPerson] = useState(vendor?.contact_person || '');
  const [email, setEmail] = useState(vendor?.email || '');
  const [phone, setPhone] = useState(vendor?.phone || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = { name, code, contact_person: contactPerson, email, phone };
    const result = validate(vendorSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      if (vendor) {
        await vendorsApi.update(vendor.id, result.data);
        toast.success('Supplier updated');
      } else {
        await vendorsApi.create(result.data);
        toast.success('Supplier created');
      }
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
    <Modal open onClose={onClose} title={vendor ? 'Edit Supplier' : 'New Vendor'} size="md"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>{vendor ? 'Update' : 'Create'}</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Name"
            value={name}
            onChange={(e) => {
              const next = e.target.value;
              setName(next);
              if (!codeManuallyEdited) setCode(suggestCode(next, 50));
            }}
            error={errors.name}
            placeholder="Steel Supplies Inc"
            maxLength={150}
          />
          <Input
            label="Code"
            value={code}
            onChange={(e) => { setCode(e.target.value); setCodeManuallyEdited(true); }}
            error={errors.code}
            placeholder="VEND-001"
            maxLength={50}
          />
        </div>
        <Input label="Contact Person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} error={errors.contact_person} placeholder="John Doe" maxLength={150} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="sales@steelsupplies.com" />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} placeholder="+91 98765 43210" maxLength={30} />
        </div>
      </form>
    </Modal>
  );
}
