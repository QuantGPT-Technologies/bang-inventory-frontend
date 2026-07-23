---
name: project-auto-scrap-reconciliation
description: Cross-repo "auto-calculated scrap" feature (bang-inventory backend + bang-inventory-frontend) and where its frontend implementation had gaps
metadata:
  type: project
---

The bang-inventory (backend) and bang-inventory-frontend repos are sibling repos on disk
(`/Users/vikasraj/project/theBH/bang-inventory` and `.../bang-inventory-frontend`). Full plan for
this feature: `/Users/vikasraj/.claude/plans/i-want-to-fix-binary-pixel.md`.

Feature: backend auto-reconciles scrap on lot-step completion/override (input − output − manual
scrap, gated on `input_unit == output_unit`) and on batch blend completion (SUM(planned_qty) −
SUM(actual_qty) − manual scrap, converted to batch unit via `ConvertScrapUnit` which only handles
g<->kg). Auto rows get `is_auto_calculated = true`, `recorded_by = NULL`. Backend also computes a
`reconciliation_note` string (unit-mismatch skip / negative-remainder warning / excluded-unit
warning) — `StepVariance.ReconciliationNote` for lots, `BatchDetail.ScrapReconciliation.ReconciliationNote`
for batches (`/Users/vikasraj/project/theBH/bang-inventory/internal/models/lot.go` and `batch.go`).

**Reviewed 2026-07-23** (frontend diff: `src/lib/types.ts`, `ProductionStepActionModal.tsx`,
`lots/[id]/page.tsx`, `batches/[id]/page.tsx`). Verified formulas against the actual backend Go
code (not just the plan — the plan and implementation diverged in places, e.g. plan said "no shape
change to StepVariance" but the backend actually added a real `reconciliation_note` JSON field).
Two real gaps found by reading backend + frontend side by side:

1. **Batch page conditional-hiding bug**: `batches/[id]/page.tsx` nests the
   `scrap_reconciliation.reconciliation_note` warning *inside* `{batch.scrap && batch.scrap.length > 0 && (...)}`.
   Backend's `computeBatchScrapReconciliation` runs unconditionally and can set a negative-remainder
   note precisely when there's no scrap logged at all (no auto row inserted for negative remainder,
   no manual rows) — exactly the case where `batch.scrap` is empty/omitted and the whole Card
   (including the warning) never renders. The warning needs to be hoisted outside that gate.

2. **Lot step `reconciliation_note` is dead**: `StepVariance.reconciliation_note` was added to
   `src/lib/types.ts` (matching the real backend field) but is never rendered anywhere — not in
   `lots/[id]/page.tsx`'s variance chips, not in `ProductionStepActionModal.tsx`'s analytics
   "Amounts" section. The batch side got the warning UI, the lot side didn't, despite symmetric
   backend support.

3. Minor: the "implied blend scrap" preview in `CompleteBlendModal` (batches page) sums manually
   entered scrap-row quantities raw, ignoring each row's (user-editable, free-text) `unit` field —
   the backend explicitly converts each manual row via `ConvertScrapUnit` (g<->kg) before summing.
   An operator logging spillage in grams against a kg batch gets a materially wrong live estimate
   (~1000x off) even though the backend handles that exact case correctly server-side.

Useful technique: when a frontend PR claims to "mirror the backend formula," always read the
actual backend Go source (repository/service layer) rather than trusting the plan doc's prose —
plans in this codebase can drift from what was actually implemented.
