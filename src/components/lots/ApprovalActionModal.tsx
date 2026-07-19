'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { lotsApi } from '@/lib/api';
import { Lot } from '@/lib/types';
import { getNodeLabel, parseApiError } from '@/lib/utils';
import { decideApprovalSchema, validate, type FieldErrors } from '@/lib/validation';

/**
 * Standalone modal for deciding an `approval` node (POST /lots/:id/nodes/:nodeKey/approve).
 * Deliberately NOT folded into ProductionStepActionModal: rejecting requires a mandatory reason
 * (enforced client-side by decideApprovalSchema, mirroring the backend's trimmed-length check in
 * WorkflowService.DecideApproval) and uses distinct danger styling/button semantics that don't
 * fit the generic "Confirm" button the production modal uses for every action type.
 *
 * `decision` is fixed by which icon (Check/X) the caller clicked to open this modal — the
 * decision itself isn't re-editable inside the form, only the optional/required reason is.
 */
export function ApprovalActionModal({
  lot,
  nodeKey,
  decision,
  onClose,
  onDone,
}: {
  lot: Lot;
  nodeKey: string;
  decision: 'approved' | 'rejected';
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const isReject = decision === 'rejected';
  const label = getNodeLabel(nodeKey);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const payload = { decision, reason: reason.trim() || undefined };
    const result = validate(decideApprovalSchema, payload);
    if (!result.success) {
      setErrors(result.errors);
      toast.error(Object.values(result.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await lotsApi.decideApproval(lot.id, nodeKey, result.data);
      toast.success(isReject ? 'Approval rejected' : 'Approval recorded');
      onDone();
    } catch (err) {
      const info = parseApiError(err);
      // Distinct messages per the operator-facing UX this modal owns -- a generic "forbidden"/
      // "conflict" toast wouldn't explain *why* (someone else decided this node first, or this
      // role isn't the node's configured approver) the way these do.
      if (info.isForbidden) {
        toast.error("You don't have permission to approve this step.");
      } else if (info.isConflict) {
        toast.error('Someone else already decided this step.');
      } else {
        toast.error(info.message);
      }
      if (info.isConflict || info.isNotFound) onDone();
      if (info.fieldErrors) setErrors((prev) => ({ ...prev, ...info.fieldErrors }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${isReject ? 'Reject' : 'Approve'} — ${label}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            variant={isReject ? 'danger' : 'primary'}
            loading={loading}
            disabled={loading}
            onClick={handleSubmit as unknown as React.MouseEventHandler}
          >
            {isReject ? 'Reject' : 'Approve'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-[var(--ink-muted)]">
          {isReject ? (
            <>Reject the <strong>{label}</strong> approval for lot <strong>{lot.lot_number}</strong>? This cannot be undone.</>
          ) : (
            <>Approve the <strong>{label}</strong> step for lot <strong>{lot.lot_number}</strong>?</>
          )}
        </p>
        <Textarea
          label={isReject ? 'Reason for Rejection' : 'Reason (optional)'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          rows={2}
          maxLength={1000}
          placeholder={isReject ? 'e.g. Dimensions out of spec' : undefined}
        />
      </form>
    </Modal>
  );
}
