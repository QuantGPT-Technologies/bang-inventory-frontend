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
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { customersApi } from '@/lib/api';
import { Customer, PaginatedResponse } from '@/lib/types';
import { formatDate, parseApiError, suggestCode } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { customerSchema, validate, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { useUrlState } from '@/lib/useUrlState';
import { Plus, Pencil, Ban, CheckCircle2, Search } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<Customer> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

export default function CustomersPage() {
  return (
    <Suspense fallback={<AppShell><div className="text-base text-[var(--ink-muted)]">Loading…</div></AppShell>}>
      <CustomersPageInner />
    </Suspense>
  );
}

function CustomersPageInner() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useUrlState('q', '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Customer | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Customer | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const canWrite = canAccess(user, 'customers', 'write');

  // Debounced so typing doesn't fire a request per keystroke -- page reset lives in this same
  // callback so it fires once, together with the debounced value.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCustomers = useCallback(async () => {
    const res = await customersApi.list(page, PER_PAGE, debouncedSearch || undefined);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page, debouncedSearch]);

  const { data, loading, error, reload } = useAsyncQuery(fetchCustomers, [page, debouncedSearch], EMPTY);
  const customers = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  // The hosted backend has no DELETE route for customers -- deactivating (is_active: false) is
  // the real mechanism, hiding the customer from pickers elsewhere without destroying history.
  const applyToggle = async (c: Customer) => {
    if (busyId) return;
    setBusyId(c.id);
    try {
      await customersApi.update(c.id, { is_active: !c.is_active });
      toast.success(c.is_active ? `${c.name} deactivated` : `${c.name} reactivated`);
      setConfirmDeactivate(null);
      reload();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  // Deactivating hides the customer from pickers elsewhere (e.g. new SKUs) -- confirm first.
  // Reactivating is the safe/reversible direction, so it skips the confirm step.
  const handleToggleActive = (c: Customer) => {
    if (c.is_active === false) {
      applyToggle(c);
    } else {
      setConfirmDeactivate(c);
    }
  };

  const columns = [
    { key: 'name', header: 'Name', primary: true, render: (c: Customer) => <span className="font-medium">{c.name}</span> },
    { key: 'code', header: 'Code', hideInCard: true, render: (c: Customer) => c.code ? <span className="font-mono">{c.code}</span> : '—' },
    { key: 'contact_person', header: 'Contact', render: (c: Customer) => c.contact_person || '—' },
    { key: 'email', header: 'Email', render: (c: Customer) => c.email || '—' },
    { key: 'phone', header: 'Phone', render: (c: Customer) => c.phone || '—' },
    {
      key: 'is_active',
      header: 'Status',
      render: (c: Customer) => <Badge variant={c.is_active === false ? 'muted' : 'success'}>{c.is_active === false ? 'Inactive' : 'Active'}</Badge>,
    },
    { key: 'created_at', header: 'Created', hideInCard: true, render: (c: Customer) => formatDate(c.created_at) },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            isActions: true,
            render: (c: Customer) => (
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShowEdit(c); }}
                  className="flex items-center gap-1.5 px-3 min-h-11 rounded-lg text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--info)] hover:bg-[var(--info-tint)] transition-colors"
                >
                  <Pencil size={18} /> Edit
                </button>
                <button
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleToggleActive(c); }}
                  disabled={busyId === c.id}
                  className={`flex items-center gap-1.5 px-3 min-h-11 rounded-lg text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    c.is_active === false
                      ? 'text-[var(--ink-muted)] hover:text-[var(--success)] hover:bg-[var(--success-tint)]'
                      : 'text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-tint)]'
                  }`}
                >
                  {c.is_active === false ? <CheckCircle2 size={18} /> : <Ban size={18} />}
                  {c.is_active === false ? 'Reactivate' : 'Deactivate'}
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
        title="Customers"
        subtitle="Customers who buy finished products"
        action={
          canWrite && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New Customer
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
              data={customers}
              keyExtractor={(c) => c.id}
              loading={loading}
              emptyMessage={search ? 'No customers match your search.' : 'No customers found.'}
            />
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CustomerModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); setPage(1); reload(); }}
        />
      )}
      {showEdit && (
        <CustomerModal
          customer={showEdit}
          onClose={() => setShowEdit(null)}
          onSaved={() => { setShowEdit(null); reload(); }}
        />
      )}
      <ConfirmModal
        open={!!confirmDeactivate}
        title="Deactivate Customer"
        message={confirmDeactivate ? <>Deactivate <strong>{confirmDeactivate.name}</strong>? They&apos;ll no longer appear in places that pick a customer, like new products.</> : ''}
        confirmLabel="Deactivate"
        loading={busyId === confirmDeactivate?.id}
        onConfirm={() => confirmDeactivate && applyToggle(confirmDeactivate)}
        onCancel={() => setConfirmDeactivate(null)}
      />
    </AppShell>
  );
}

function CustomerModal({
  customer,
  onClose,
  onSaved,
}: {
  customer?: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer?.name || '');
  const [code, setCode] = useState(customer?.code || '');
  // While false (create mode only), typing Name auto-derives Code via suggestCode; stops the
  // moment the user edits Code directly. Editing an existing customer never auto-rewrites Code.
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(!!customer);
  const [contactPerson, setContactPerson] = useState(customer?.contact_person || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [address, setAddress] = useState(customer?.address || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = { name, code, contact_person: contactPerson, email, phone, address };
    const result = validate(customerSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      if (customer) {
        await customersApi.update(customer.id, result.data);
        toast.success('Customer updated');
      } else {
        await customersApi.create(result.data);
        toast.success('Customer created');
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
    <Modal open onClose={onClose} title={customer ? 'Edit Customer' : 'New Customer'} size="md"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>{customer ? 'Update' : 'Create'}</Button></>}
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
            placeholder="Acme Industries"
            maxLength={150}
          />
          <Input
            label="Code"
            value={code}
            onChange={(e) => { setCode(e.target.value); setCodeManuallyEdited(true); }}
            error={errors.code}
            placeholder="CUST-001"
            maxLength={50}
          />
        </div>
        <Input label="Contact Person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} error={errors.contact_person} placeholder="Jane Smith" maxLength={150} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="contact@acme.com" />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} placeholder="+91 98765 43210" maxLength={30} />
        </div>
        <Textarea label="Address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={500} error={errors.address} placeholder="Full address…" />
      </form>
    </Modal>
  );
}
