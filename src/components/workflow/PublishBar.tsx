'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Circle, Save, History, TriangleAlert, FilePlus2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { workflowTemplatesApi } from '@/lib/api';
import { useWorkflowEditorStore, selectIsReadOnly } from '@/store/workflowEditorStore';
import { parseApiError } from '@/lib/utils';
import { VersionHistoryDrawer } from './VersionHistoryDrawer';

export function PublishBar() {
  const router = useRouter();
  const templateId = useWorkflowEditorStore((s) => s.templateId);
  const versionId = useWorkflowEditorStore((s) => s.versionId);
  const versionNumber = useWorkflowEditorStore((s) => s.versionNumber);
  const templateName = useWorkflowEditorStore((s) => s.templateName);
  const versionStatus = useWorkflowEditorStore((s) => s.versionStatus);
  const isDirty = useWorkflowEditorStore((s) => s.isDirty);
  const toGraphPayload = useWorkflowEditorStore((s) => s.toGraphPayload);
  const markClean = useWorkflowEditorStore((s) => s.markClean);
  const setVersionStatus = useWorkflowEditorStore((s) => s.setVersionStatus);
  const isReadOnly = useWorkflowEditorStore(selectIsReadOnly);

  const [saving, setSaving] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);

  // Published versions are frozen by design (see the publish confirmation copy below) -- this is
  // the only way back into an editable graph: clone the published version into a fresh draft and
  // jump straight to editing it.
  const handleCreateDraft = async () => {
    if (templateId == null || creatingDraft) return;
    setCreatingDraft(true);
    try {
      const res = await workflowTemplatesApi.createVersion(templateId, versionId ?? undefined);
      const newVersion = res.data?.data;
      if (!newVersion?.id) throw new Error('Server did not return the new draft version');
      toast.success(`Draft version ${newVersion.version_number} created`);
      router.push(`/workflow-templates/${templateId}/edit?version=${newVersion.id}`);
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setCreatingDraft(false);
    }
  };

  const handleSaveDraft = async () => {
    if (templateId == null || versionNumber == null || saving) return;
    setSaving(true);
    try {
      await workflowTemplatesApi.saveGraph(templateId, versionNumber, toGraphPayload());
      markClean();
      toast.success('Draft saved');
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (templateId == null || versionNumber == null || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      await workflowTemplatesApi.publish(templateId, versionNumber);
      setVersionStatus('published');
      markClean();
      toast.success(`Version ${versionNumber} published`);
      setShowPublishConfirm(false);
    } catch (err) {
      // ValidateGraph rejects with a specific, human-readable 400 (missing entry point,
      // orphaned node, no default edge, branch-into-branch edge, ...) -- surface the raw
      // message inline in the modal rather than a toast, since it can be a full sentence.
      setPublishError(parseApiError(err).message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[var(--border-light)] bg-[var(--paper)] flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-sm font-semibold text-[var(--ink)] truncate">
          {templateName || 'Workflow Template'}
        </h1>
        <Badge variant={versionStatus === 'published' ? 'success' : 'muted'}>
          {versionStatus === 'published' ? 'Published' : 'Draft'}
        </Badge>
        {isDirty && !isReadOnly && (
          <span className="flex items-center gap-1 text-xs text-[var(--ink-muted)]">
            <Circle size={6} fill="currentColor" /> Unsaved changes
          </span>
        )}
        <button
          onClick={() => setShowVersionHistory(true)}
          className="flex items-center gap-1 text-xs text-[var(--ink-muted)] hover:text-[var(--accent)] transition-colors"
        >
          <History size={12} /> Version History
        </button>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isReadOnly ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCreateDraft}
            loading={creatingDraft}
            disabled={creatingDraft || templateId == null}
            title="Clone this published version into a new editable draft"
          >
            <FilePlus2 size={13} /> Create New Draft
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSaveDraft}
              loading={saving}
              disabled={saving || templateId == null}
            >
              <Save size={13} /> Save Draft
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPublishError(null);
                setShowPublishConfirm(true);
              }}
              disabled={templateId == null || versionNumber == null}
            >
              Publish
            </Button>
          </>
        )}
      </div>

      <Modal
        open={showPublishConfirm}
        onClose={() => (publishing ? undefined : setShowPublishConfirm(false))}
        title="Publish this version?"
        subtitle={versionNumber != null ? `Version ${versionNumber}` : undefined}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowPublishConfirm(false)} disabled={publishing}>
              Cancel
            </Button>
            <Button onClick={handlePublish} loading={publishing} disabled={publishing}>
              Publish
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--ink)]">
            Publishing freezes this version&apos;s graph and makes it the live workflow for new lots. You
            won&apos;t be able to edit nodes or edges on it afterwards -- create a new draft version to make
            further changes.
          </p>
          {isDirty && (
            <p className="text-xs text-[var(--ink-muted)]">
              You have unsaved changes. Save the draft first if you want them included in the published version.
            </p>
          )}
          {publishError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <TriangleAlert size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 whitespace-pre-wrap">{publishError}</p>
            </div>
          )}
        </div>
      </Modal>

      {showVersionHistory && templateId != null && (
        <VersionHistoryDrawer templateId={templateId} onClose={() => setShowVersionHistory(false)} />
      )}
    </div>
  );
}
