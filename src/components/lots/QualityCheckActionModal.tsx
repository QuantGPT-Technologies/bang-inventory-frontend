'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { lotsApi } from '@/lib/api';
import { Lot } from '@/lib/types';
import { getNodeLabel, parseApiError } from '@/lib/utils';
import { qualityResultSchema, validate, type FieldErrors } from '@/lib/validation';
import { Plus, Trash2 } from 'lucide-react';

interface MeasurementRow {
  key: string;
  value: string;
}

/**
 * Standalone modal for submitting a `quality_check` node result (POST
 * /lots/:id/nodes/:nodeKey/quality-result).
 *
 * The node's `config.measurement_fields` (defined on the workflow template) is NOT reachable
 * from GET /lots/:id -- WorkflowNodeInstance (the runtime row the lot endpoint serializes) has no
 * `config` field; only WorkflowNode (the template definition) does, and there is no lot->template
 * lookup exposed to the frontend. So rather than block on a config fetch that has nowhere to come
 * from, this falls back to a free-form add-a-row key/value measurement UI. The backend still
 * enforces its own required-field check server-side (WorkflowService.SubmitQualityResult) and
 * returns a 400 naming the missing field if one is required and omitted.
 *
 * `initialResult` seeds the toggle from which icon (Pass/Fail) the caller clicked to open this
 * modal, but the toggle stays editable here in case the operator wants to change it before
 * submitting.
 */
export function QualityCheckActionModal({
  lot,
  nodeKey,
  initialResult,
  onClose,
  onDone,
}: {
  lot: Lot;
  nodeKey: string;
  initialResult: 'pass' | 'fail';
  onClose: () => void;
  onDone: () => void;
}) {
  const [result, setResult] = useState<'pass' | 'fail'>(initialResult);
  const [rows, setRows] = useState<MeasurementRow[]>([{ key: '', value: '' }]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const label = getNodeLabel(nodeKey);

  const updateRow = (i: number, field: 'key' | 'value', v: string) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, { key: '', value: '' }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const measurements: Record<string, string | number> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) continue;
      const trimmedValue = row.value.trim();
      const numeric = Number(trimmedValue);
      measurements[key] = trimmedValue !== '' && Number.isFinite(numeric) ? numeric : row.value;
    }

    const payload = {
      result,
      measurements: Object.keys(measurements).length ? measurements : undefined,
      notes: notes || undefined,
    };
    const validated = validate(qualityResultSchema, payload);
    if (!validated.success) {
      setErrors(validated.errors);
      toast.error(Object.values(validated.errors)[0] || 'Please correct the highlighted fields.');
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await lotsApi.submitQualityResult(lot.id, nodeKey, validated.data);
      toast.success('Quality result recorded');
      onDone();
    } catch (err) {
      const info = parseApiError(err);
      if (info.isForbidden) {
        toast.error("You don't have permission to submit this quality result.");
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
      title={`Quality Result — ${label}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            variant={result === 'fail' ? 'danger' : 'primary'}
            loading={loading}
            disabled={loading}
            onClick={handleSubmit as unknown as React.MouseEventHandler}
          >
            Submit
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-[var(--ink-muted)]">
          Recording a quality result for <strong>{label}</strong> on lot <strong>{lot.lot_number}</strong>.
        </p>
        <Select
          label="Result"
          options={[{ value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }]}
          value={result}
          onChange={(e) => setResult(e.target.value as 'pass' | 'fail')}
          error={errors.result}
        />
        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--ink-light)] uppercase tracking-wide">Measurements (optional)</label>
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-start">
              <Input placeholder="field" value={row.key} onChange={(e) => updateRow(i, 'key', e.target.value)} />
              <Input placeholder="value" value={row.value} onChange={(e) => updateRow(i, 'value', e.target.value)} />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-[var(--ink-muted)] hover:text-red-600 p-2 flex-shrink-0"
                title="Remove row"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
            <Plus size={12} /> Add measurement
          </button>
          {errors.measurements && <p className="text-xs text-red-600">{errors.measurements}</p>}
        </div>
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} error={errors.notes} />
      </form>
    </Modal>
  );
}
