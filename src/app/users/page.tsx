'use client';
import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { usersApi } from '@/lib/api';
import { User, PaginatedResponse } from '@/lib/types';
import { formatDate, ROLE_LABELS, parseApiError } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { createUserSchema, ROLES, validate, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { Plus, Ban, CheckCircle2 } from 'lucide-react';

const PER_PAGE = 20;
const EMPTY: PaginatedResponse<User> = { items: [], total: 0, page: 1, per_page: PER_PAGE };

export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const canManage = canAccess(currentUser, 'users', 'crud');

  const fetchUsers = useCallback(async () => {
    const res = await usersApi.list(page, PER_PAGE);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page, per_page: PER_PAGE };
  }, [page]);

  const { data, loading, error, reload } = useAsyncQuery(fetchUsers, [page], EMPTY);
  const users = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const handleToggleActive = async (u: User) => {
    if (u.id === currentUser?.id) {
      toast.error('You cannot deactivate your own account.');
      return;
    }
    if (togglingId) return;
    setTogglingId(u.id);
    try {
      await usersApi.update(u.id, { is_active: !u.is_active });
      toast.success(u.is_active ? `${u.name} has been deactivated` : `${u.name} has been reactivated`);
      reload();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setTogglingId(null);
    }
  };

  const columns = [
    { key: 'name', header: 'Name', render: (u: User) => <span className="font-medium">{u.name}</span> },
    { key: 'email', header: 'Email', render: (u: User) => u.email },
    {
      key: 'role',
      header: 'Role',
      render: (u: User) => <Badge>{ROLE_LABELS[u.role] || u.role}</Badge>,
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (u: User) => (
        <Badge variant={u.is_active ? 'success' : 'muted'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    { key: 'last_login_at', header: 'Last Login', render: (u: User) => u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never' },
    { key: 'created_at', header: 'Created', render: (u: User) => formatDate(u.created_at) },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            render: (u: User) => (
              <button
                onClick={(e) => { e.stopPropagation(); handleToggleActive(u); }}
                disabled={togglingId === u.id || u.id === currentUser?.id}
                className="p-1 text-[var(--ink-muted)] hover:text-[var(--accent)] disabled:opacity-30"
                title={u.id === currentUser?.id ? 'Cannot modify your own account' : u.is_active ? 'Deactivate' : 'Reactivate'}
              >
                {u.is_active ? <Ban size={13} /> : <CheckCircle2 size={13} />}
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <AppShell>
      <PageHeader
        title="Users"
        subtitle="System users and access control"
        action={
          canManage && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New User
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
              data={users}
              keyExtractor={(u) => u.id}
              loading={loading}
              emptyMessage="No users found."
            />
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setPage(1); reload(); }}
        />
      )}
    </AppShell>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('production');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const result = validate(createUserSchema, { name, email, password, role });
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      await usersApi.create(result.data);
      toast.success('User created');
      onCreated();
    } catch (err) {
      const info = parseApiError(err);
      toast.error(info.isConflict ? 'A user with this email already exists.' : info.message);
      if (info.fieldErrors) setErrors((prev) => ({ ...prev, ...info.fieldErrors }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New User" size="sm"
      footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} disabled={loading} onClick={handleSubmit as unknown as React.MouseEventHandler}>Create</Button></>}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="John Doe" maxLength={100} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="john@example.com" />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} placeholder="At least 6 characters" hint={!errors.password ? 'Minimum 6 characters' : undefined} />
        <Select
          label="Role"
          options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] || r }))}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder=""
        />
      </form>
    </Modal>
  );
}
