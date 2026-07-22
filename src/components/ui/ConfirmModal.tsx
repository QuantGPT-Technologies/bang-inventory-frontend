'use client';
import { Modal } from './Modal';
import Button from './Button';

/**
 * Reusable yes/no confirmation, extracted from the Webhook-delete pattern so any "this changes
 * something live" action (deactivating a user/customer/vendor, deleting, etc.) gets the same
 * pause-before-acting step instead of firing immediately on a single tap.
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} disabled={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-base text-[var(--ink-muted)]">{message}</p>
    </Modal>
  );
}
