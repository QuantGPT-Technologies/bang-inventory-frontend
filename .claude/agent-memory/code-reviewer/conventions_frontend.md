---
name: conventions-frontend
description: bang-inventory-frontend code conventions worth knowing before reviewing diffs in this repo
metadata:
  type: project
---

- `src/lib/validation.ts`'s `toNumber(raw: string): number | undefined` returns `undefined` for
  `''`/NaN, never `null`. Code that checks `parsed != null` is correct (loose `!=` treats
  `undefined` and `null` as equal) — don't flag that as a bug.
- Derived/computed values (implied totals, gating booleans) are consistently computed inline at
  render time, not memoized with `useMemo` — this is the file's existing convention
  (`ProductionStepActionModal.tsx` has zero `useMemo` calls), not an oversight to flag.
- `formatQty(qty?: number, unit?: string)` in `src/lib/utils.ts` returns `'—'` for `qty == null`,
  safe to call with possibly-undefined values.
- `Badge` component (`src/components/ui/Badge.tsx`) variants: default/success/warning/danger/info/muted.
  Always renders a colored dot + `text-sm font-bold px-3 py-1 rounded-full border` — visually
  larger/bolder than this app's common ad-hoc `text-xs ... rounded-full` inline chips (used e.g.
  for scrap/status pills on `lots/[id]/page.tsx`). Dropping a `<Badge>` next to a `text-xs` chip is
  a minor visual-consistency nit worth a light mention, not a blocking issue.
- Epsilon convention: `1e-6` for float reconciliation comparisons, both frontend and backend
  (`constants.ScrapReconciliationEpsilon` in Go). Backend treats `remainder <= epsilon` as fully
  reconciled (silent no-op) and `remainder < -epsilon` as a real negative/warn case; frontend
  mirrors this correctly with `> 1e-6` / `< -1e-6` / else branches.
- This repo (`bang-inventory-frontend`) has a sibling backend repo on disk at
  `/Users/vikasraj/project/theBH/bang-inventory` — when a frontend change claims to mirror backend
  logic, go read the actual Go source there rather than trusting comments/plans alone.
