'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, Pagination, TABLE_ROW_HEIGHT_PX, TABLE_CARD_ROW_HEIGHT_PX } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { usersApi } from '@/lib/api';
import { User, PaginatedResponse } from '@/lib/types';
import { cn, formatDate, ROLE_LABELS, parseApiError, resolvePaginationTotal } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { createUserSchema, ROLES, validate, type FieldErrors } from '@/lib/validation';
import { useAsyncQuery } from '@/lib/useAsync';
import { useFitRowCount } from '@/lib/useFitRowCount';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Plus, Ban, CheckCircle2 } from 'lucide-react';

const INITIAL_PER_PAGE = 20;
const EMPTY: PaginatedResponse<User> = { items: [], total: 0, page: 1, per_page: INITIAL_PER_PAGE };

export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<User | null>(null);

  const canManage = canAccess(currentUser, 'users', 'crud');

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

  const fetchUsers = useCallback(async () => {
    const res = await usersApi.list(page, perPage);
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: resolvePaginationTotal(data?.total, items, page, perPage), page, per_page: perPage };
  }, [page, perPage]);

  const { data, loading, error, reload } = useAsyncQuery(fetchUsers, [page, perPage], EMPTY);
  const users = data.items;
  const total = data.total;

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const applyToggle = async (u: User) => {
    if (togglingId) return;
    setTogglingId(u.id);
    try {
      await usersApi.update(u.id, { is_active: !u.is_active });
      toast.success(u.is_active ? `${u.name} has been deactivated` : `${u.name} has been reactivated`);
      setConfirmDeactivate(null);
      reload();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setTogglingId(null);
    }
  };

  // Deactivating a user locks them out mid-shift -- confirm first. Reactivating is the safe/
  // reversible direction, so it skips the confirm step.
  const handleToggleActive = (u: User) => {
    if (u.id === currentUser?.id) {
      toast.error('You cannot deactivate your own account.');
      return;
    }
    if (u.is_active === false) {
      applyToggle(u);
    } else {
      setConfirmDeactivate(u);
    }
  };

  const columns = [
    { key: 'name', header: 'Name', primary: true, render: (u: User) => (
      <div className="flex flex-col">
        <span className="font-bold">{u.name}</span>
        <span className="text-sm text-[var(--ink-muted)] font-normal">{u.email}</span>
      </div>
    ) },
    {
      key: 'role',
      header: 'Role',
      render: (u: User) => <Badge>{ROLE_LABELS[u.role] || u.role}</Badge>,
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (u: User) => (
        <div className="flex flex-col gap-1">
          <Badge variant={u.is_active ? 'success' : 'muted'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
          <span className="text-sm text-[var(--ink-muted)]">{u.last_login_at ? `Last in ${new Date(u.last_login_at).toLocaleDateString()}` : 'Never logged in'}</span>
        </div>
      ),
    },
    { key: 'created_at', header: 'Created', hideInCard: true, render: (u: User) => formatDate(u.created_at) },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            isActions: true,
            render: (u: User) => (
              <button
                onClick={(e) => { e.stopPropagation(); handleToggleActive(u); }}
                disabled={togglingId === u.id || u.id === currentUser?.id}
                className={cn(
                  'flex items-center gap-1.5 px-3 min-h-11 rounded-lg text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
                  u.is_active
                    ? 'text-[var(--danger)] hover:bg-[var(--danger-tint)]'
                    : 'text-[var(--success)] hover:bg-[var(--success-tint)]'
                )}
                title={u.id === currentUser?.id ? 'Cannot modify your own account' : u.is_active ? 'Deactivate' : 'Reactivate'}
                aria-label={u.id === currentUser?.id ? 'Cannot modify your own account' : u.is_active ? 'Deactivate user' : 'Reactivate user'}
              >
                {u.is_active ? <Ban size={18} /> : <CheckCircle2 size={18} />}
                {u.is_active ? 'Deactivate' : 'Reactivate'}
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
        subtitle="People who can log in, and what they can do"
        action={
          canManage && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New User
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
              data={users}
              keyExtractor={(u) => u.id}
              loading={loading}
              emptyMessage="No users found."
              bodyRef={tableBodyRef}
            />
            <Pagination page={page} total={total} perPage={perPage} onChange={setPage} />
          </>
        )}
      </Card>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setPage(1); reload(); }}
        />
      )}
      <ConfirmModal
        open={!!confirmDeactivate}
        title="Deactivate User"
        message={confirmDeactivate ? <>Turn off <strong>{confirmDeactivate.name}</strong>&apos;s account? They won&apos;t be able to log in until you turn it back on.</> : ''}
        confirmLabel="Deactivate"
        loading={togglingId === confirmDeactivate?.id}
        onConfirm={() => confirmDeactivate && applyToggle(confirmDeactivate)}
        onCancel={() => setConfirmDeactivate(null)}
      />
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
