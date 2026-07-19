/**
 * A single label/value row for a definition-list style detail block. Shared by the lot detail
 * page and its action modals (production/approval/quality-check) so all three render the same
 * "LABEL ......... value" layout.
 */
export function DL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)] flex-shrink-0">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}
