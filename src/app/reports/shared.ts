import { STEP_LABELS } from '@/lib/utils';

// Step keys are data-driven (workflow templates can define arbitrary node_keys), so this is a
// display-only fallback to the raw key -- not a validation list. Shared by the Insights
// dashboard and the detailed reports page.
export function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? step;
}

export function groupByUnit<T extends { unit: string }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.unit) ?? [];
    list.push(row);
    groups.set(row.unit, list);
  }
  return Array.from(groups.entries());
}
