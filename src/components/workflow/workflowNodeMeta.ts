import { Factory, CheckSquare, ClipboardCheck, GitBranch, Split, type LucideIcon } from 'lucide-react';
import { WorkflowNodeType } from '@/lib/types';

/**
 * Shared per-node-type visual identity (accent color + icon), used by BaseNodeShell for all five
 * node types so every node component (and the palette) imports the same lookup instead of
 * re-deriving colors.
 *
 * Colors are drawn from the existing CSS var palette in globals.css (no new colors invented).
 */
export const NODE_TYPE_COLORS: Record<WorkflowNodeType, string> = {
  production_step: 'var(--green)',
  approval: 'var(--gold)',
  quality_check: 'var(--accent)',
  conditional_branch: 'var(--ink-light)',
  lot_fanout: 'var(--accent-light)',
};

export const NODE_TYPE_ICONS: Record<WorkflowNodeType, LucideIcon> = {
  production_step: Factory,
  approval: CheckSquare,
  quality_check: ClipboardCheck,
  conditional_branch: GitBranch,
  lot_fanout: Split,
};

export const NODE_TYPE_LABELS: Record<WorkflowNodeType, string> = {
  production_step: 'Production Step',
  approval: 'Approval',
  quality_check: 'Quality Check',
  conditional_branch: 'Conditional Branch',
  lot_fanout: 'Split into Lots',
};

/**
 * NODE_TYPE_COLORS above holds `var(--x)` references, not hex/rgb literals -- appending a hex
 * alpha suffix directly to one (e.g. `${accentColor}22`) produces invalid CSS like
 * `var(--green)22`, silently dropping the declaration. Use `color-mix` instead, which works on
 * any valid CSS color value including custom-property references. `alphaPct` is 0-100.
 */
export function withAlpha(cssColor: string, alphaPct: number): string {
  return `color-mix(in srgb, ${cssColor} ${alphaPct}%, transparent)`;
}
