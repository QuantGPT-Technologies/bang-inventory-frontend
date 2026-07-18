---
name: project-lot-qty-validation-review
description: Findings from reviewing the pcs-integer-qty + mandatory-override-reason fix in bang-inventory (2026-07-18) — known gaps to watch for in future related work
metadata:
  type: project
---

On 2026-07-18, reviewed a paired backend (bang-inventory)/frontend (bang-inventory-frontend)
change that (a) rejects fractional quantities for "pcs" units via
`constants.IsIntegerUnit` + `validateQtyUnit` (Go) and `INTEGER_UNITS` + `qtySchema` (TS,
in src/lib/validation.ts, NOT exported/shared with backend — kept in sync manually), and
(b) makes `notes` mandatory (min 3 chars) on PUT /lots/:id/steps/:step overrides.

**Why this matters for future review:** these are pre-existing gaps in the codebase,
surfaced during this review, not part of the diff being reviewed — worth re-checking
if related quantity/validation work comes up again:

1. `RecordConsumable` (internal/service/lot_service.go) does NOT apply the pcs-integer
   check. Its `Unit` field is arbitrary free text (Consumable.Unit, max=20, no enum),
   so a consumable configured with unit "pcs" can still record fractional usage. This
   was correctly out of scope for the specific fix reviewed (StepUnitMap-driven steps
   only) but is a real latent inconsistency if anyone later assumes "pcs" is always
   integer-enforced project-wide.

2. There is NO backend enforcement anywhere that `actual_output_qty <= actual_input_qty`
   for a completed/overridden step — that check only ever existed in the frontend Zod
   schema (`completeStepSchema`/`overrideStepSchema` in src/lib/validation.ts). Direct
   API callers can submit output > input freely. Pre-existing, not introduced by this
   change.

3. `ManualUpdateStepRequest.Notes` binding (`required,min=3,max=1000` on a `*string`)
   is not trimmed server-side, so a request body of `"notes": "   "` (whitespace only)
   passes backend validation even though it defeats the "must state a real reason"
   intent. The frontend's zod schema does `.trim()` first so the UI can't produce this,
   but any other API client could. Minor gap, not fixed as part of this review.

4. `page.tsx` hardcodes `unit === 'pcs'` in local helpers `qtyStepAttr`/`qtyPlaceholder`
   instead of importing the `INTEGER_UNITS` set from `src/lib/validation.ts` (which
   isn't exported). Three places now encode "pcs is the integer unit"
   (constants.go, validation.ts, page.tsx) with no shared source — will silently drift
   if another integer unit is ever added.

5. Also flagged (possibly intentional, needs confirmation from whoever wrote it): the
   same page.tsx diff prefills the complete-step form's input/output qty and machine
   name from `currentStep.expected_*`/`machine_name`, which is unrelated to either
   stated fix (pcs validation, mandatory override reason) and changes operator
   workflow (previously blank, forcing manual entry of observed values).

**How to apply:** if asked to review or extend quantity/unit validation in this repo
again, check whether items 1-4 have been addressed; if not, they're still open.
Item 5 should be confirmed with the author rather than assumed intentional.
