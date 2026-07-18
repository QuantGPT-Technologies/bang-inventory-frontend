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
import { toast } from '@/components/ui/Toast';
import { vendorsApi } from '@/lib/api';
import { Vendor, PaginatedResponse } from '@/lib/types';
import { formatDate, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { vendorSchema, validate, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { Plus } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<Vendor> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

export default function VendorsPage() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const fetchVendors = useCallback(async () => {
    const res = await vendorsApi.list(page, PER_PAGE);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page]);

  const { data, loading, error, reload } = useAsyncQuery(fetchVendors, [page], EMPTY);
  const vendors = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const columns = [
    { key: 'name', header: 'Name', render: (v: Vendor) => <span className="font-medium">{v.name}</span> },
    { key: 'code', header: 'Code', render: (v: Vendor) => v.code ? <span className="font-mono">{v.code}</span> : '—' },
    { key: 'contact_person', header: 'Contact', render: (v: Vendor) => v.contact_person || '—' },
    { key: 'email', header: 'Email', render: (v: Vendor) => v.email || '—' },
    { key: 'phone', header: 'Phone', render: (v: Vendor) => v.phone || '—' },
    { key: 'created_at', header: 'Created', render: (v: Vendor) => formatDate(v.created_at) },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers for raw materials"
        action={
          canAccess(user, 'vendors', 'write') && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Vendor
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
              data={vendors}
              keyExtractor={(v) => v.id}
              loading={loading}
              emptyMessage="No vendors found."
            />
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CreateVendorModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setPage(1); reload(); }}
        />
      )}
    </AppShell>
  );
}

function CreateVendorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
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
      await vendorsApi.create(result.data);
      toast.success('Vendor created');
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
    <Modal open onClose={onClose} title="New Vendor" size="md"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>Create</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Steel Supplies Inc" maxLength={150} />
          <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} error={errors.code} placeholder="VEND-001" maxLength={50} />
        </div>
        <Input label="Contact Person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} error={errors.contact_person} placeholder="John Doe" maxLength={150} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="sales@steelsupplies.com" />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} placeholder="+1 234 567 8900" maxLength={30} />
        </div>
      </form>
    </Modal>
  );
}
