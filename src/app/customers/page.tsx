'use client';
import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination } from '@/components/ui/Table';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { customersApi } from '@/lib/api';
import { Customer, PaginatedResponse } from '@/lib/types';
import { formatDate, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { customerSchema, validate, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { Plus } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<Customer> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

export default function CustomersPage() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const fetchCustomers = useCallback(async () => {
    const res = await customersApi.list(page, PER_PAGE);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page]);

  const { data, loading, error, reload } = useAsyncQuery(fetchCustomers, [page], EMPTY);
  const customers = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const columns = [
    { key: 'name', header: 'Name', render: (c: Customer) => <span className="font-medium">{c.name}</span> },
    { key: 'code', header: 'Code', render: (c: Customer) => c.code ? <span className="font-mono">{c.code}</span> : '—' },
    { key: 'contact_person', header: 'Contact', render: (c: Customer) => c.contact_person || '—' },
    { key: 'email', header: 'Email', render: (c: Customer) => c.email || '—' },
    { key: 'phone', header: 'Phone', render: (c: Customer) => c.phone || '—' },
    { key: 'created_at', header: 'Created', render: (c: Customer) => formatDate(c.created_at) },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Customers"
        subtitle="External customers for finished products"
        action={
          canAccess(user, 'customers', 'write') && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Customer
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
              data={customers}
              keyExtractor={(c) => c.id}
              loading={loading}
              emptyMessage="No customers found."
            />
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CreateCustomerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setPage(1); reload(); }}
        />
      )}
    </AppShell>
  );
}

function CreateCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
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
      await customersApi.create(result.data);
      toast.success('Customer created');
      onCreated();
    } catch (err) {
      const info = parseApiError(err);
      toast.error(info.message);
      if (info.fieldErrors) setErrors((prev) => ({ ...prev, ...info.fieldErrors }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New Customer" size="md"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>Create</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Acme Industries" maxLength={150} />
          <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} error={errors.code} placeholder="CUST-001" maxLength={50} />
        </div>
        <Input label="Contact Person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} error={errors.contact_person} placeholder="Jane Smith" maxLength={150} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="contact@acme.com" />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} placeholder="+1 234 567 8900" maxLength={30} />
        </div>
        <Textarea label="Address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={500} error={errors.address} placeholder="Full address…" />
      </form>
    </Modal>
  );
}
