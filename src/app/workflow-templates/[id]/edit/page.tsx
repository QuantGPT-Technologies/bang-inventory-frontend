'use client';
import { useCallback, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { toast } from '@/components/ui/Toast';
import { workflowTemplatesApi } from '@/lib/api';
import { WorkflowTemplateDetail } from '@/lib/types';
import { useAsyncQuery } from '@/lib/useAsync';
import { useWorkflowEditorStore } from '@/store/workflowEditorStore';
import { PublishBar } from '@/components/workflow/PublishBar';
import { NodePalette } from '@/components/workflow/NodePalette';
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas';
import { ConfigPanel } from '@/components/workflow/ConfigPanel';

export default function WorkflowTemplateEditPage() {
  const params = useParams<{ id: string }>();
  const idParam = params?.id;
  const templateId = Number(idParam);
  const idIsValid = idParam != null && idParam !== '' && Number.isInteger(templateId) && templateId > 0;

  // ?version=<row id> loads a specific version (e.g. a draft just created from a published one
  // via "Create New Draft" in PublishBar) instead of the template's default (current published
  // version, or its latest draft if nothing's published yet).
  const searchParams = useSearchParams();
  const versionParam = searchParams.get('version');
  const versionId = versionParam != null && versionParam !== '' ? Number(versionParam) : undefined;

  const fetchTemplate = useCallback(async () => {
    if (!idIsValid) return null;
    const res = await workflowTemplatesApi.get(templateId, versionId);
    return res.data?.data ?? null;
  }, [templateId, idIsValid, versionId]);

  const { data: detail, loading, error, reload } = useAsyncQuery<WorkflowTemplateDetail | null>(
    fetchTemplate,
    [templateId, idIsValid, versionId],
    null
  );

  const loadTemplate = useWorkflowEditorStore((s) => s.loadTemplate);
  const reset = useWorkflowEditorStore((s) => s.reset);
  const selectedId = useWorkflowEditorStore((s) => s.selectedId);

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  // Sync fetched data into the editor store once it arrives (matches the useAsyncQuery-then-sync
  // idiom used elsewhere, e.g. src/app/lots/[id]/page.tsx's consumables/analytics effects).
  useEffect(() => {
    if (detail) loadTemplate(detail);
  }, [detail, loadTemplate]);

  // Don't leak this template's graph into the next one if the user navigates to a different
  // template's editor without a full page reload.
  useEffect(() => () => reset(), [reset]);

  if (loading && !detail) {
    return (
      <AppShell fullBleed>
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-[var(--ink-muted)]">Loading…</p>
        </div>
      </AppShell>
    );
  }

  if (error && !detail) {
    return (
      <AppShell fullBleed>
        <div className="h-full flex items-center justify-center p-6">
          <Card className="max-w-md w-full">
            <ErrorState error={error} onRetry={reload} />
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fullBleed>
      <div className="flex flex-col h-full">
        <PublishBar />
        <div className="flex flex-1 min-h-0">
          <NodePalette />
          <div className="flex-1 min-w-0 h-full">
            <WorkflowCanvas />
          </div>
          {selectedId && <ConfigPanel />}
        </div>
      </div>
    </AppShell>
  );
}
