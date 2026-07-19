'use client';
import { useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/Toast';
import { workflowTemplatesApi } from '@/lib/api';
import { WorkflowTemplateVersion, PaginatedResponse } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { useAsyncQuery } from '@/lib/useAsync';

const EMPTY: PaginatedResponse<WorkflowTemplateVersion> = { items: [], total: 0, page: 1, per_page: 50 };

/**
 * Read-only slide-over listing every version of this template (version number, status, published
 * date if published). No "restore" action in v1 -- visibility only, triggered from PublishBar's
 * "Version History" link.
 */
export function VersionHistoryDrawer({ templateId, onClose }: { templateId: number; onClose: () => void }) {
  const fetchVersions = useCallback(async () => {
    const res = await workflowTemplatesApi.listVersions(templateId, { per_page: 50 });
    const data = res.data?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    return { items, total: typeof data?.total === 'number' ? data.total : items.length, page: 1, per_page: 50 };
  }, [templateId]);

  const { data, loading, error } = useAsyncQuery<PaginatedResponse<WorkflowTemplateVersion>>(fetchVersions, [templateId], EMPTY);
  const versions = [...data.items].sort((a, b) => b.version_number - a.version_number);

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  // Close on Escape, matching Modal's convention.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-[var(--ink)]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[var(--paper)] border-l border-[var(--border)] shadow-xl flex flex-col h-full">
        <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-[var(--border-light)] flex-shrink-0">
          <h3 className="text-sm font-semibold text-[var(--ink)]" style={{ fontFamily: 'Playfair Display, serif' }}>
            Version History
          </h3>
          <button onClick={onClose} className="text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && versions.length === 0 && (
            <p className="text-sm text-[var(--ink-muted)]">Loading…</p>
          )}
          {!loading && versions.length === 0 && !error && (
            <p className="text-sm text-[var(--ink-muted)]">No versions yet.</p>
          )}
          <div className="flex flex-col gap-2">
            {versions.map((v) => (
              <div key={v.id} className="rounded-md border border-[var(--border-light)] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-[var(--ink)]">Version {v.version_number}</span>
                  <Badge variant={v.status === 'published' ? 'success' : 'muted'}>
                    {v.status === 'published' ? 'Published' : 'Draft'}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--ink-muted)]">
                  {v.status === 'published' && v.published_at
                    ? `Published ${formatDateTime(v.published_at)}`
                    : `Created ${formatDateTime(v.created_at)}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
