# Bang Inventory — Next.js UI Implementation Guide

**Guide version:** v1.7 &nbsp;·&nbsp; **Last updated:** 2026-07-31

**This revision:** adds Purchase Orders, Sales Orders, and the Stock Ledger -- new resources, RBAC rules, and webhook events. See §7 "Purchase & Sales Order Flow Walkthrough", the new subsections in §8 All Endpoints Reference, the new TS shapes in §9 Response Shapes, and the extended webhook events list.

**API base URL (dev):** `http://localhost:8080/api/v1`  
**Auth:** JWT Bearer token, 24-hour lifetime  
**All responses:** `{ success: boolean, data?: T, error?: string }`  
**All lists:** `{ items: T[], total: number, page: number, per_page: number }`

---

## Table of Contents

1. [Project Setup](#1-project-setup)
2. [Authentication Flow](#2-authentication-flow)
3. [API Client](#3-api-client)
4. [Roles & Access Control](#4-roles--access-control)
5. [Page Structure](#5-page-structure)
6. [Production Flow Walkthrough](#6-production-flow-walkthrough)
7. [Purchase & Sales Order Flow Walkthrough](#7-purchase--sales-order-flow-walkthrough)
8. [All Endpoints Reference](#8-all-endpoints-reference)
9. [Response Shapes](#9-response-shapes)
10. [Error Handling](#10-error-handling)
11. [Suggested Component Architecture](#11-suggested-component-architecture)

---

## 1. Project Setup

```bash
npx create-next-app@latest bang-inventory-ui --typescript --tailwind --app
cd bang-inventory-ui
npm install axios @tanstack/react-query zustand
```

### Environment

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
```

---

## 2. Authentication Flow

### Login

```
POST /auth/login
Body: { email: string, password: string }
Response: { success: true, data: { token: string, user: User } }
```

Store the token in `localStorage` (or a secure cookie if SSR is needed). Attach it to every subsequent request as `Authorization: Bearer <token>`.

```ts
// lib/auth.ts
export const login = async (email: string, password: string) => {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  localStorage.setItem('token', json.data.token);
  localStorage.setItem('user', JSON.stringify(json.data.user));
  return json.data;
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
};

export const getToken = () => localStorage.getItem('token');
export const getUser = (): User | null => {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
};
```

### Token refresh / expiry

The API returns 401 when the token expires. Catch 401 in your API client and redirect to `/login`.

---

## 3. API Client

```ts
// lib/api.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Helper to extract data from the standard envelope
export const unwrap = <T>(res: { data: { data: T } }): T => res.data.data;
```

### React Query setup

```tsx
// app/providers.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

---

## 4. Roles & Access Control

| Role | What they see / can do |
|------|------------------------|
| `admin` | Everything — users, masters, production, webhooks, publishing workflow template versions |
| `manager` | Everything except user management, webhooks, and publishing. Can skip steps, split lots, author workflow templates (create/new draft version/save graph) |
| `engineer` | Read-only on masters + production + workflow templates. Can record scrap, decide approvals/quality results on workflow nodes |
| `production` | Batch/lot operations — start/complete steps, record scrap + consumables, decide approvals/quality results on workflow nodes |

### Role guard hook

```ts
// hooks/useRole.ts
export const useRole = () => {
  const user = getUser();
  return {
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager',
    isEngineer: user?.role === 'engineer',
    isProduction: user?.role === 'production',
    can: (roles: string[]) => roles.includes(user?.role ?? ''),
  };
};
```

### Protected route wrapper

```tsx
// components/RoleGuard.tsx
export function RoleGuard({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { can } = useRole();
  if (!can(roles)) return <p>Access denied.</p>;
  return <>{children}</>;
}
```

**Usage:**
```tsx
<RoleGuard roles={['admin', 'manager']}>
  <CreateBatchButton />
</RoleGuard>
```

**Reports:** `/reports/*` (dashboard/analytics endpoints, see §8) is visible to `admin`, `manager`, and `engineer` only -- `production` has no access and should not see a reports/dashboard nav link.

---

## 5. Page Structure

```
app/
  (auth)/
    login/page.tsx                 # Login form
  (app)/
    layout.tsx                     # Nav sidebar + auth check
    dashboard/page.tsx             # Summary cards
    masters/
      customers/page.tsx           # Customer list + create
      vendors/page.tsx
      skus/page.tsx                # SKU list, materials modal
      raw-materials/page.tsx       # List + stock adjust
      consumables/page.tsx
    production/
      batches/
        page.tsx                   # Batch list, create batch
        [id]/page.tsx              # Batch detail — materials, scrap, lots, actions
      lots/
        page.tsx                   # Lot list with filters
        [id]/page.tsx              # Lot detail — step timeline, scrap/consumables per step
    orders/
      purchase/
        page.tsx                   # PO list, create PO
        [id]/page.tsx              # PO detail — lines, send/receive/close/cancel actions
      sales/
        page.tsx                   # SO list, create SO
        [id]/page.tsx              # SO detail — lines, confirm/dispatch/close/cancel actions
    stock/
      ledger/page.tsx               # Stock ledger browser (filter by item_type + item_id) --
                                     # more commonly embedded as a tab/expander on SKU / raw-material
                                     # detail pages, see §7 below
    admin/
      users/page.tsx               # Admin only
      webhooks/page.tsx            # Admin only
```

---

## 6. Production Flow Walkthrough

This is the golden path a user follows from raw materials to finished lots.

### Step 1 — Create a Batch

**Who:** Admin, Manager, or Production  
**Page:** `/production/batches` → "New Batch" button

```ts
// POST /batches
await api.post('/batches', {
  total_blend_qty: 350,
  unit: 'kg',
  materials: [
    { raw_material_id: 1, planned_qty: 300 },
    { raw_material_id: 2, planned_qty: 30 },
    { raw_material_id: 3, planned_qty: 10 },
    { raw_material_id: 4, planned_qty: 10 },
  ],
  notes: 'Standard Fe-Cu-Sn blend',
});
```

Response includes `batch_number` (e.g. `2629701`), `status: "created"`, `created_at`.

---

### Step 2 — Start Blending

**Who:** Admin or Production  
**Trigger:** "Start Blending" button on batch detail page  
**Prerequisite:** batch status must be `created`

```ts
// POST /batches/:id/blend
await api.post(`/batches/${id}/blend`);
// Batch status → "blending"
```

No request/response shape change here, but this call now also starts the batch's own workflow instance internally (at its `blend` node) -- see `GET /batches/:id/workflow` below if you want to surface that progress.

---

### Step 3 — Complete Blending

**Who:** Admin or Production  
**Trigger:** "Complete Blending" button  
**Prerequisite:** batch status must be `blending`

```ts
// POST /batches/:id/complete-blend
await api.post(`/batches/${id}/complete-blend`, {
  actual_materials: [
    { raw_material_id: 1, actual_qty: 298.5 },  // actual used (may differ from planned)
    { raw_material_id: 2, actual_qty: 29.8 },
  ],
  scrap: [
    { scrap_type: 'spillage', quantity: 1.5, unit: 'kg', notes: 'Floor spillage' },
  ],
});
// Batch status → "blended"
```

Scrap type for blending is always `spillage`. Unit defaults to grams (`g`) if omitted. `scrap_type: "unaccounted"` is rejected with `400` -- that value is reserved for the system's own auto-calculated row (see below); never offer it in the scrap-type picker.

**Auto-calculated batch scrap:** on this same call, after your submitted `scrap` rows are recorded, the backend also reconciles `SUM(planned_qty) - SUM(actual_qty)` across the batch's materials against everything logged (manual + this call's new rows) and inserts/updates a single system-owned `batch_scrap` row (`scrap_type: "unaccounted"`, `is_auto_calculated: true`) for whatever remainder is left over -- so only log *identifiable* spillage in the `scrap` array above; don't try to account for the whole gap yourself, or you'll double-count against what the backend now derives automatically. `GET /batches/:id` reflects this in `scrap_reconciliation` (see §9 below) and in the `scrap` array itself.

---

### Step 4 — Split Into Lots

**Who:** Admin or Manager  
**Trigger:** "Split into Lots" button  
**Prerequisite:** batch status must be `blended`

```ts
// POST /batches/:id/lots
await api.post(`/batches/${id}/lots`, {
  lots: [
    { sku_id: 1, quantity: 200 },
    { sku_id: 2, quantity: 150 },
  ],
});
// Returns array of created lots
// Batch status → "in_production"  (NOT "completed" -- correcting a stale note in earlier
//   revisions of this guide; the batch only reaches "completed" once every spawned lot finishes
//   its own pipeline, via server-side auto-completion)
// Each lot starts at step "compaction", status "created"
```

Each lot gets a number like `2629701-01`, `2629701-02`.  
Six step records are pre-created per lot (pending): compaction → sintering → marking → barreling → sizing → batching.

This call also completes the batch's own `split_into_lots` workflow node and fires the `workflow.batch_split` webhook (`{ batch_id, lot_count }`) -- see Webhooks below. Track the batch's own node history and the fanned-out lots' progress via `GET /batches/:id/workflow`.

---

### Step 5 — Work Through Lot Steps

**Who:** Admin or Production (start/complete); Admin or Manager (skip)

Each lot follows this step order. Steps run one at a time — you cannot start a step until the previous is completed or skipped.

```
compaction → sintering → marking → barreling → sizing → batching
              (skippable)  (skippable)  (skippable)  (skippable)
```

#### Start a step

```ts
// POST /lots/:id/steps/:step/start
await api.post(`/lots/${lotId}/steps/compaction/start`, {
  machine_name: 'Press-A1',  // optional
});
// Step status → "in_progress"
```

#### Complete a step

```ts
// POST /lots/:id/steps/:step/complete
await api.post(`/lots/${lotId}/steps/compaction/complete`, {
  actual_input_qty: 200,    // required, > 0
  actual_output_qty: 185,   // required, >= 0
  machine_name: 'Press-A1', // optional
  notes: 'Normal run',      // optional
});
// Step status → "completed"
// Lot current_step advances to next step automatically
// If batching completes → lot status → "completed"
```

**Whole-number rule:** each step's input/output unit comes from `StepUnitMap` -- compaction is `kg → pcs`, every other step is `pcs → pcs`. Any field whose unit is `pcs` must be a whole number; the API rejects fractional values with `400`:

```json
{ "success": false, "error": "actual_output_qty must be a whole number for unit 'pcs'" }
```

Only compaction's `actual_input_qty` (unit `kg`) may be fractional -- validate this client-side (round or reject non-integer `pcs` inputs) before submitting, so the user sees the error in the form instead of a round-trip toast.

#### Skip an optional step

```ts
// POST /lots/:id/steps/:step/skip
await api.post(`/lots/${lotId}/steps/sintering/skip`);
// Step status → "skipped"
// Lot current_step advances to next step
```

Skippable steps: `sintering`, `marking`, `barreling`, `sizing`. Cannot skip `compaction` or `batching`.

#### Manually correct a step (reconciliation)

**Who:** Admin or Manager only

```ts
// PUT /lots/:id/steps/:step
await api.put(`/lots/${lotId}/steps/compaction`, {
  actual_output_qty: 183,          // optional -- omit fields that don't need correction
  notes: 'Recount after audit',    // REQUIRED -- reason for the override, min 3 non-whitespace chars
});
```

`notes` is now a **required** field on this endpoint (unlike `complete`/`scrap`, where it's optional) -- it is the audit reason for changing an already-recorded value. Submitting it empty, omitted, or whitespace-only (e.g. `"   "`) returns:

```json
{ "success": false, "error": "notes must be at least 3 non-whitespace characters (reason for override)" }
```

Build the override form with a required, trimmed textarea/input for the reason -- disable the submit button until the trimmed value has at least 3 characters, matching the server rule. `actual_input_qty`/`actual_output_qty` are still subject to the same whole-number-for-`pcs` rule described above.

**Never prefill this reason field from the step's existing `notes`.** The two are deliberately unrelated: `notes` on a step is the operator's real operational note from `complete` (e.g. "ran on Press-A1, minor jam") and is left untouched by this endpoint; the override `notes` you submit here is only the audit reason and is stored separately (see `override_history` below). Conflating them in the form would suggest to the user that they're editing the step's notes, when they're actually writing an audit-log entry.

The response echoes the updated step in the same shape as Step 8 below (variance/scrap/consumables/override history included, `override_history` still gated to admin/manager).

---

### Step 6 — Record Scrap (during any active step)

**Who:** Admin, Production, Engineer  
**Note:** Cannot record scrap on a skipped step.

```ts
// POST /lots/:id/steps/:step/scrap
await api.post(`/lots/${lotId}/steps/compaction/scrap`, {
  scrap_type: 'handling',  // see scrap type matrix below
  quantity: 5,
  unit: 'pcs',             // optional — defaults to step's unit (g or pcs)
  notes: 'Cracked during transfer',
});
```

**Scrap type matrix:**

| Step | Allowed scrap_type values |
|------|--------------------------|
| compaction | `handling`, `setting`, `visual` |
| sintering | `testing` |
| marking | `setting` |
| sizing | `testing`, `dimension_rejection` |
| barreling, batching | none (will return 400) |

`scrap_type: "unaccounted"` is always rejected with `400` regardless of step, even though it isn't listed in the matrix above -- that value is reserved for the system's own auto-calculated row (see Step 8's `is_auto_calculated`/`reconciliation_note` notes above) and should never appear in a scrap-type picker.

---

### Step 7 — Record Consumable Usage

**Who:** Admin or Production  
**Note:** Cannot record on a skipped step.

```ts
// POST /lots/:id/steps/:step/consumables
await api.post(`/lots/${lotId}/steps/compaction/consumables`, {
  consumable_id: 3,
  quantity: 0.5,
  unit: 'kg',
});
```

---

### Step 8 — View Step Analytics / Step Detail

Available for **any non-pending step** (not just completed ones -- an `in_progress` step returns everything except `variance`, since variance needs a recorded `actual_output_qty`). This is also the shape of the step-detail modal: overview (status/machine/operator/timestamps/notes), quantities (expected vs actual, `variance`), scrap entries, consumables used, and -- for admin/manager only -- override history.

```ts
// GET /lots/:id/steps/:step/analytics
const { data } = await api.get(`/lots/${lotId}/steps/compaction/analytics`);
```

`GET /lots/:id` (the lot detail / step timeline) attaches the same `scrap_entries` / `consumable_usages` / `override_history` detail onto every non-pending step in `steps[]`, not just the single step this endpoint targets -- use whichever call shape fits the screen (a timeline view can use the lot-detail call once; a single step-detail modal can use this endpoint).

**`variance` object** (`null`/absent until the step has an `actual_output_qty`):
```json
{
  "input_diff": -1.5,
  "input_diff_pct": -0.75,
  "output_diff": -5,
  "output_diff_pct": -2.6,
  "yield_pct": 92.5,
  "total_scrap": 12,
  "scrap_unit": "pcs",
  "reconciliation_note": null
}
```

**`total_scrap` now always reconciles with input/output** when `input_unit == output_unit` for that step: the backend auto-inserts a system-owned scrap row (`scrap_type: "unaccounted"`, `is_auto_calculated: true`) for whatever `actual_input_qty - actual_output_qty - <manually logged scrap>` remainder is left over, every time the step completes, is manually overridden, or new scrap is logged against it -- there's no separate "reconcile" action to trigger from the UI. `reconciliation_note` (new field, nullable) explains the two cases where this *doesn't* happen: a non-null value either means the step's `input_unit`/`output_unit` differ (e.g. compaction's `kg → pcs`, where an auto scrap figure would be meaningless) and no auto row was created, or the remainder came out negative (output plus manually logged scrap exceeds input -- almost always a data-entry error worth flagging to the user, not silently swallowed). Render it as a small muted/warning note near the scrap total when present; render nothing extra when it's `null` (the normal case).

**`override_history`** -- role-gated: present (possibly `[]`) for `admin`/`manager`, omitted entirely for `engineer`/`production`. Each entry captures the pre-change values, the new values, who made the change, and their reason:
```json
{
  "id": 12,
  "lot_step_id": 47,
  "previous_input_qty": null,
  "previous_output_qty": 44,
  "previous_notes": null,
  "new_input_qty": null,
  "new_output_qty": 45,
  "reason": "Recount after scale recalibration found 1 extra unit",
  "changed_by": 2,
  "changed_by_name": "Admin",
  "created_at": "2026-07-19T10:05:00Z"
}
```
A `null` on `previous_input_qty` alongside a populated `previous_output_qty` means that particular override only touched output -- don't render it as "input was cleared." Do not surface this array (or the "Override History" panel) to `engineer`/`production` users even if you have it in hand from another call -- treat its absence from the API response as the source of truth, and gate any client-side panel on the same admin/manager check used for the override form itself.

**`scrap_entries`** and **`consumable_usages`** are visible to all roles that can reach this endpoint. Each scrap entry now includes `recorded_by_name`; each consumable usage includes `consumable_name` -- no separate lookup needed to render either list.

Each scrap entry also now carries `is_auto_calculated` (boolean) -- `true` for the single system-generated "unaccounted" row described above, `false` for everything an operator logged via Step 6. `recorded_by`/`recorded_by_name` are **now nullable** and will be `null` on an auto row (there's no operator to attribute it to) -- guard any "logged by ..." UI accordingly. Render auto rows with a small "Auto" badge to distinguish them from manually-entered scrap; there's no edit/delete UI for scrap today, so nothing needs to be functionally restricted for auto rows, just visually labeled.

---

## 7. Purchase & Sales Order Flow Walkthrough

Purchase orders bring raw material stock in (vendor → PO → receipt → raw material stock increment). Sales orders send SKU stock out (customer → SO → dispatch → SKU stock decrement). Both follow the same shape: create as a draft with lines, lock the lines with a "send"/"confirm" action, then record fulfillment against individual lines (partial fulfillment allowed, repeatable calls). Every stock movement either flow causes is also visible afterward via the stock ledger (Step 7 below).

### Step 1 — Create a Purchase Order

**Who:** Admin or Manager
**Page:** `/orders/purchase` → "New Purchase Order" button

```ts
// POST /purchase-orders
await api.post('/purchase-orders', {
  vendor_id: 4,
  expected_date: '2026-08-10',   // optional, YYYY-MM-DD
  notes: 'Q3 restock',            // optional, max 1000 chars
  lines: [
    { raw_material_id: 1, ordered_qty: 500, unit_price: 42.5 },  // unit_price optional
    { raw_material_id: 2, ordered_qty: 200 },
  ],
});
// Response: PurchaseOrderDetail, status "draft", po_number e.g. "PO-20260731-001"
```

`PUT /purchase-orders/:id` (Admin/Manager) edits header fields and/or the line set while still `draft` -- `409` once the PO has been sent. Passing `lines` in the body **replaces the full set** (delete-then-reinsert, same convention as `PUT /skus/:id/materials`); omit `lines` entirely to edit only `expected_date`/`notes` and leave the lines untouched.

---

### Step 2 — Send the Purchase Order

**Who:** Admin or Manager
**Trigger:** "Send to Vendor" button on PO detail page
**Prerequisite:** PO status must be `draft`

```ts
// POST /purchase-orders/:id/send
await api.post(`/purchase-orders/${id}/send`);
// Status → "sent", lines are now locked (PUT will 409)
```

---

### Step 3 — Receive the Purchase Order (partial or full)

**Who:** Admin, Manager, or Production (floor activity, same reasoning as lot scrap/consumable recording)
**Trigger:** "Receive Goods" modal on PO detail page, one row per line with a qty input
**Prerequisite:** PO status must be `sent` or `partially_received` (receiving against `draft` returns `409`)

```ts
// POST /purchase-orders/:id/receive
await api.post(`/purchase-orders/${id}/receive`, {
  lines: [
    { line_id: 101, qty: 300 },   // partial -- ordered_qty was 500
  ],
});
// Response: PurchaseOrderDetail. Status auto-transitions to "partially_received" or "received"
// depending on whether every line is now fully received. Raw material stock is incremented
// automatically -- no separate stock-adjust call needed.
```

Call it again later with the remaining qty to finish receiving:

```ts
await api.post(`/purchase-orders/${id}/receive`, {
  lines: [{ line_id: 101, qty: 200 }],
});
// received_qty now 500/500 for this line -- status → "received" once ALL lines are fully received
```

**Over-receipt is allowed, not rejected.** If a vendor ships more than was ordered, submitting a qty that pushes `received_qty` above `ordered_qty` succeeds and is reflected honestly on the line -- don't cap the input client-side or treat it as a validation error.

**Partial multi-line failure:** each line in the `lines` array is its own transaction. If line 2 of 3 fails (e.g. bad `line_id`), line 1 has already committed. The error response still carries the current PO state in `data`:

```json
{ "success": false, "error": "line not found", "data": { "id": 55, "po_number": "PO-20260731-001", "status": "partially_received", "lines": [ /* reflects what actually committed */ ] } }
```

Re-render the PO detail page from that `data` rather than assuming nothing happened, then let the user retry just the failed line.

---

### Step 4 — Close or Cancel a Purchase Order

**Who:** Admin or Manager

```ts
// POST /purchase-orders/:id/close   -- requires status "received" or "partially_received"
await api.post(`/purchase-orders/${id}/close`);

// POST /purchase-orders/:id/cancel  -- requires status "draft" or "sent"
await api.post(`/purchase-orders/${id}/cancel`);
```

Both `409` if the PO isn't in an eligible status (e.g. cancelling a `received` PO).

---

### Step 5 — Create and Confirm a Sales Order

**Who:** Admin or Manager
**Page:** `/orders/sales` → "New Sales Order" button

```ts
// POST /sales-orders
await api.post('/sales-orders', {
  customer_id: 7,
  expected_date: '2026-08-15',   // optional
  notes: 'Rush order',            // optional, max 1000 chars
  lines: [
    { sku_id: 3, ordered_qty: 100, unit_price: 89.0 },  // unit_price optional
  ],
});
// Response: SalesOrderDetail, status "draft", so_number e.g. "SO-20260731-001"

// POST /sales-orders/:id/confirm
await api.post(`/sales-orders/${id}/confirm`);
// Status → "confirmed", lines locked
```

**No stock reservation happens at confirm time.** This is deliberate -- confirming an SO does not set aside inventory. Availability is only checked when dispatch is attempted (Step 6). Don't build UI that implies stock is "held" once an SO is confirmed.

`PUT /sales-orders/:id` follows the identical draft-only, replace-all-lines convention as the PO update above.

---

### Step 6 — Dispatch the Sales Order (including insufficient-stock handling)

**Who:** Admin, Manager, or Production (floor activity, same reasoning as PO receive)
**Trigger:** "Dispatch" modal on SO detail page
**Prerequisite:** SO status must be `confirmed` or `partially_shipped`

```ts
// POST /sales-orders/:id/dispatch
await api.post(`/sales-orders/${id}/dispatch`, {
  lines: [{ line_id: 201, qty: 15 }],
});
// On success: SalesOrderDetail, status auto-transitions to "partially_shipped" or "shipped"
// depending on whether every line is now fully shipped. SKU stock is decremented automatically.
```

**Insufficient stock returns `409 Conflict`**, not a generic failure -- the error is actionable and should be shown inline next to the line being dispatched, not as a toast:

```json
{
  "success": false,
  "error": "insufficient stock: sku 1 has 10.000 available, cannot dispatch 15.000",
  "data": { "id": 88, "so_number": "SO-20260731-001", "status": "confirmed", "lines": [ /* current state */ ] }
}
```

As with PO receive, each line is dispatched in its own transaction -- on a multi-line dispatch where a later line fails, earlier lines in the same call have already committed and shipped. Re-render from the error response's `data` field rather than assuming the whole call was a no-op.

```ts
// POST /sales-orders/:id/close   -- requires status "shipped" or "partially_shipped"
// POST /sales-orders/:id/cancel  -- requires status "draft" or "confirmed"
```

---

### Step 7 — View the Stock Ledger

**Who:** All authenticated roles
**Page:** typically not a standalone nav item -- embed as an "Audit Trail" tab/expander on the SKU detail, raw-material detail, and (once shipped) PO/SO detail pages, keyed off that item's `item_type`/`item_id`

```ts
// GET /stock/ledger?item_type=raw_material&item_id=1&page=1&per_page=20
const { data } = await api.get('/stock/ledger', {
  params: { item_type: 'raw_material', item_id: 1, page: 1, per_page: 20 },
});
// Paginated, newest first. Each entry: { id, item_type, item_id, delta, balance_after,
// reason, ref_type?, ref_id?, note?, created_by, created_at }
```

`item_type` must be one of `sku`, `raw_material`, `consumable` (`400` otherwise); `item_id` is required. `reason` is one of `po_receipt`, `so_dispatch`, `production_consume`, `production_output`, `scrap`, `manual_adjust` -- use it to pick an icon/label in the audit trail row. `ref_type`/`ref_id` (e.g. `"purchase_order"` / `55`) let you deep-link a ledger row back to the PO/SO/lot/batch that caused it, when present.

The existing manual stock-adjust endpoints -- `POST /skus/:id/stock`, `POST /raw-materials/:id/stock`, `POST /consumables/:id/stock` (§8 below) -- are unchanged in request/response shape, but every call now also writes a `manual_adjust` row here, so their effect is now visible in this same audit trail alongside PO/SO/production movements.

---

## 8. All Endpoints Reference

### Auth

| Method | Path | Body | Roles |
|--------|------|------|-------|
| POST | `/auth/login` | `{ email, password }` | Public |
| GET | `/auth/me` | — | Any |
| PUT | `/auth/password` | `{ old_password, new_password }` | Any |

### Users

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/users?page=1&per_page=20` | — | Admin |
| POST | `/users` | `{ name, email, password, role }` | Admin |
| GET | `/users/:id` | — | Admin |
| PUT | `/users/:id` | `{ name?, email?, role?, is_active? }` | Admin |

### Customers

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/customers` | — | Admin, Manager, Engineer |
| POST | `/customers` | `{ code, name, contact_person?, email?, phone?, address? }` | Admin, Manager |
| GET | `/customers/:id` | — | Admin, Manager, Engineer |
| PUT | `/customers/:id` | `{ name?, contact_person?, email?, phone?, address?, is_active? }` | Admin, Manager |

### Vendors

Same shape as Customers.

### SKUs

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/skus` | — | Admin, Manager, Engineer |
| POST | `/skus` | `{ code, name, description?, customer_id?, unit?, default_workflow_template_id? }` | Admin, Manager, Engineer |
| GET | `/skus/:id` | — | Admin, Manager, Engineer |
| PUT | `/skus/:id` | `{ name?, description?, customer_id?, unit?, is_active?, default_workflow_template_id? }` | Admin, Manager, Engineer |
| PUT | `/skus/:id/materials` | `{ materials: [{ raw_material_id, ratio_percent }] }` | Admin, Manager, Engineer |

Materials rules: array must have ≥ 1 item; `ratio_percent` must be > 0 and ≤ 100.

`default_workflow_template_id` (this revision): previously accepted by the request body but silently dropped -- now actually persisted, so a SKU's create/update payload can assign or change which workflow template a new lot for that SKU uses. Pass a `workflow-templates` id (see below), or omit/`null` to leave unassigned.

### Raw Materials

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/raw-materials` | — | Admin, Manager, Engineer |
| POST | `/raw-materials` | `{ code, short_code, name, unit, vendor_id? }` | Admin, Manager |
| GET | `/raw-materials/:id` | — | Admin, Manager, Engineer |
| PUT | `/raw-materials/:id` | `{ name?, short_code?, unit?, vendor_id?, is_active? }` | Admin, Manager |
| POST | `/raw-materials/:id/stock` | `{ quantity, reason }` | Admin, Manager |

Stock adjust: positive quantity = receive, negative = consume.

### Consumables

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/consumables` | — | Admin, Manager, Engineer |
| POST | `/consumables` | `{ code, name, unit }` | Admin, Manager |
| GET | `/consumables/:id` | — | Admin, Manager, Engineer |
| PUT | `/consumables/:id` | `{ name?, unit?, is_active? }` | Admin, Manager |
| POST | `/consumables/:id/stock` | `{ quantity, reason }` | Admin, Manager |

### Batches

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/batches?status=created&page=1` | — | All |
| POST | `/batches` | `{ total_blend_qty, unit?, materials[], notes? }` | Admin, Manager, Production |
| GET | `/batches/:id` | — | All |
| POST | `/batches/:id/blend` | — | Admin, Production |
| POST | `/batches/:id/complete-blend` | `{ actual_materials[]?, scrap[]? }` | Admin, Production |
| POST | `/batches/:id/lots` | `{ lots: [{ sku_id, quantity }] }` | Admin, Manager |
| GET | `/batches/:id/workflow` | — | All |

Batch status values: `created` → `blending` → `blended` → `in_production` → `completed` (the last transition is automatic, once every spawned lot completes its own pipeline -- not client-triggered)

### Lots

Every `/steps/:step/...` route below now also works, unchanged, as `/nodes/:nodeKey/...` (same body, same response, same roles) -- pick whichever you like, both are permanently live. Two new actions exist **only** under `/nodes/`.

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/lots?batch_id=1&status=in_progress&step=compaction` | — | All |
| GET | `/lots/:id` | — | All -- `override_history` per step visible to Admin/Manager only |
| POST | `/lots/:id/steps/:step/start` (or `/nodes/:nodeKey/start`) | `{ machine_name? }` | Admin, Production |
| POST | `/lots/:id/steps/:step/complete` (or `/nodes/:nodeKey/complete`) | `{ actual_input_qty, actual_output_qty, machine_name?, notes? }` | Admin, Production |
| POST | `/lots/:id/steps/:step/skip` (or `/nodes/:nodeKey/skip`) | — | Admin, Manager |
| PUT | `/lots/:id/steps/:step` (or `/nodes/:nodeKey`) | `{ actual_input_qty?, actual_output_qty?, notes }` -- `notes` required, min 3 non-whitespace chars | Admin, Manager |
| GET | `/lots/:id/steps/:step/analytics` (or `/nodes/:nodeKey/analytics`) | — | All -- `override_history` visible to Admin/Manager only; available for any non-pending step |
| POST | `/lots/:id/steps/:step/scrap` (or `/nodes/:nodeKey/scrap`) | `{ scrap_type, quantity, unit?, notes? }` | Admin, Production, Engineer |
| POST | `/lots/:id/steps/:step/consumables` (or `/nodes/:nodeKey/consumables`) | `{ consumable_id, quantity, unit }` | Admin, Production |
| POST | `/lots/:id/nodes/:nodeKey/approve` | `{ decision: 'approved' \| 'rejected', reason? }` -- `reason` is required when rejecting (enforced server-side, not in the binding tags) | All (route is coarse-gated; the node's configured approver role is enforced server-side -- a mismatched role gets `403`) |
| POST | `/lots/:id/nodes/:nodeKey/quality-result` | `{ result: 'pass' \| 'fail', measurements?, notes? }` | All |

Valid step names: `compaction`, `sintering`, `marking`, `barreling`, `sizing`, `batching`

**Validation notes:**
- `actual_input_qty`, `actual_output_qty` (complete, PUT override), and `quantity` (scrap, consumables) must be whole numbers whenever the field's resolved unit is `pcs`. Only compaction's `kg`-unit input is exempt. See the "Complete a step" section above for the exact error shape.
- `notes` on `PUT /lots/:id/steps/:step` is required (not optional like on `complete`/`scrap`) and must contain at least 3 non-whitespace characters after trimming.

**Step-detail / audit-trail notes:**
- `GET /lots/:id` and `GET /lots/:id/steps/:step/analytics` now return `operator_name`, `scrap_entries`, `consumable_usages`, and `override_history` for any step that isn't `pending`. See Step 8 above for the full shape and the role gate on `override_history`.
- `expected_input_qty` auto-calculation on `start` now correctly carries forward across a skipped step (previously it could silently stay `null` if the immediately preceding step had been skipped) -- no client change needed, just don't be surprised if a value now appears where it previously didn't.

**Workflow node actions (this revision):**
- `approve`/`quality-result` have no `/steps/` equivalent -- there's no legacy fixed-step concept of an approval gate or quality check, so these only make sense against workflow-engine node keys.
- `POST .../approve` on a `403`: the response `error` string explains the required role; retry is pointless without a different user.
- `POST .../quality-result` and `.../approve` both `409` if the node was already decided/resolved by someone else (`{"success": false, "error": "..."}` , standard error envelope) -- treat as "reload and show the existing decision," not a retryable error.

### Workflow Templates

New resource for authoring the node-based workflow graphs referenced by `SKU.default_workflow_template_id` (see SKUs above). Only Admin/Manager can author; Publish is Admin-only.

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/workflow-templates` | — | All |
| POST | `/workflow-templates` | `{ name, description? }` -- also creates version 1 as a draft | Admin, Manager |
| GET | `/workflow-templates/:id?version=<row_id>` | — | All -- `version` (optional) is the version **row's own id**, not a version number; omit for current published (or latest draft) |
| POST | `/workflow-templates/:id/versions` | `{ clone_from_version_id? }` -- creates a new draft, optionally cloned | Admin, Manager |
| GET | `/workflow-templates/:id/versions` | — | All |
| PUT | `/workflow-templates/:id/versions/:version/graph` | `{ nodes: [...], edges: [...] }` -- full-replace of a draft's graph; `:version` here is the **version number** (1, 2, 3...), not a row id | Admin, Manager |
| POST | `/workflow-templates/:id/versions/:version/publish` | — | Admin only |

`PUT .../graph` node shape (keyed by `node_key`, not DB id, since the canvas assigns its own client-side ids for new nodes): `{ node_key, node_type, name, sequence_hint, is_entry_point, ... }`. Publish validates the graph server-side (entry point present, valid edges, all nodes reachable, no cycles) and returns `400` with a descriptive error if invalid -- surface that message directly, don't re-derive validation client-side.

### Purchase Orders

New (this revision). Vendor → PO → lines → goods receipt → raw material stock increment. See §7 above for the full walkthrough including partial receipt and the over-receipt/partial-failure behaviors.

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/purchase-orders?status=draft&vendor_id=1&q=&page=1` | — | All |
| POST | `/purchase-orders` | `{ vendor_id, expected_date?, notes?, lines: [{ raw_material_id, ordered_qty, unit_price? }] }` | Admin, Manager |
| GET | `/purchase-orders/:id` | — | All |
| PUT | `/purchase-orders/:id` | `{ expected_date?, notes?, lines?: [{ raw_material_id, ordered_qty, unit_price? }] }` -- draft-only (`409` otherwise); passing `lines` replaces the full set, omitting it leaves lines untouched | Admin, Manager |
| POST | `/purchase-orders/:id/send` | — | Admin, Manager |
| POST | `/purchase-orders/:id/receive` | `{ lines: [{ line_id, qty }] }` -- partial allowed, repeatable; over-receipt allowed | Admin, Manager, Production |
| POST | `/purchase-orders/:id/close` | — | Admin, Manager |
| POST | `/purchase-orders/:id/cancel` | — | Admin, Manager |

PO status values: `draft` → `sent` → `partially_received` → `received` → `closed` (or `cancelled` from `draft`/`sent` only). `partially_received`/`received` are set automatically by `receive`, not client-triggered. `q` (list) searches `po_number`; `vendor_id` filters exactly.

### Sales Orders

New (this revision). Customer → SO → lines → dispatch → SKU stock decrement. Same shape as Purchase Orders above, mirrored terminology (`confirm` instead of `send`, `dispatch` instead of `receive`, `shipped_qty` instead of `received_qty`). See §7 above for the full walkthrough including the insufficient-stock error and partial-failure behaviors.

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/sales-orders?status=draft&customer_id=1&q=&page=1` | — | All |
| POST | `/sales-orders` | `{ customer_id, expected_date?, notes?, lines: [{ sku_id, ordered_qty, unit_price? }] }` | Admin, Manager |
| GET | `/sales-orders/:id` | — | All |
| PUT | `/sales-orders/:id` | `{ expected_date?, notes?, lines?: [{ sku_id, ordered_qty, unit_price? }] }` -- draft-only (`409` otherwise); passing `lines` replaces the full set, omitting it leaves lines untouched | Admin, Manager |
| POST | `/sales-orders/:id/confirm` | — | Admin, Manager |
| POST | `/sales-orders/:id/dispatch` | `{ lines: [{ line_id, qty }] }` -- partial allowed, repeatable; `409` with an "insufficient stock" message if a line's SKU doesn't have enough current stock | Admin, Manager, Production |
| POST | `/sales-orders/:id/close` | — | Admin, Manager |
| POST | `/sales-orders/:id/cancel` | — | Admin, Manager |

SO status values: `draft` → `confirmed` → `partially_shipped` → `shipped` → `closed` (or `cancelled` from `draft`/`confirmed` only). `partially_shipped`/`shipped` are set automatically by `dispatch`, not client-triggered. Confirming does **not** reserve stock (see §7 Step 5). `q` (list) searches `so_number`; `customer_id` filters exactly.

### Stock Ledger

New (this revision). Read-only, paginated audit trail of every stock movement for one item -- written to automatically by PO receipt, SO dispatch, production consume/output, scrap, and the existing manual stock-adjust endpoints. See §7 Step 7 above.

| Method | Path | Query Params | Roles |
|--------|------|---------------|-------|
| GET | `/stock/ledger` | `item_type` (`sku` \| `raw_material` \| `consumable`, required), `item_id` (required), `page?`, `per_page?` | All |

`item_type` missing/invalid or `item_id` missing/zero returns `400`. Results are newest-first.

### Webhooks

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/webhooks` | — | Admin |
| POST | `/webhooks` | `{ url, secret?, events[] }` | Admin |
| GET | `/webhooks/:id` | — | Admin |
| PUT | `/webhooks/:id` | `{ url?, secret?, events[]?, is_active? }` | Admin |
| DELETE | `/webhooks/:id` | — | Admin |
| POST | `/webhooks/:id/test` | — | Admin |

Valid webhook events: `batch.created`, `batch.blending_started`, `batch.blending_completed`, `batch.lots_created`, `batch.completed`, `lot.step_started`, `lot.step_completed`, `lot.step_skipped`, `lot.scrap_recorded`, `lot.completed`, `workflow.node_started`, `workflow.node_completed`, `workflow.node_skipped`, `workflow.node_overridden`, `workflow.scrap_recorded`, `workflow.approval_requested`, `workflow.approval_decided`, `workflow.quality_result_recorded`, `workflow.instance_completed`, `workflow.batch_split`, `workflow.auto_scrap_calculated`, `purchase_order.created`, `purchase_order.sent`, `purchase_order.received`, `purchase_order.closed`, `purchase_order.cancelled`, `sales_order.created`, `sales_order.confirmed`, `sales_order.dispatched`, `sales_order.closed`, `sales_order.cancelled`

Note: `batch.completed` was missing from this list in earlier revisions of this guide even though it was already a valid event -- now corrected. The `workflow.*` events dual-fire alongside their `lot.*`/`batch.completed` counterparts where one exists (e.g. `workflow.node_completed` fires alongside `lot.step_completed`) so existing webhook consumers keep working unchanged; `workflow.approval_requested`, `workflow.approval_decided`, and `workflow.quality_result_recorded` have no legacy equivalent. `workflow.batch_split` is also new-with-no-legacy-equivalent: it fires when a batch's `split_into_lots` node completes (right after `POST /batches/:id/lots` succeeds), payload `{ "batch_id": number, "lot_count": number }` -- distinct from `batch.lots_created`, which fires from the same call for the pre-existing, non-workflow-scoped "lots were created" notification. `workflow.auto_scrap_calculated` is new (this revision, see §6 Step 6/Step 3 above): fires only when a lot-step completion/override or a batch blend completion actually inserts a fresh system-generated "unaccounted" scrap row (not on every completion -- a step whose input/output already fully reconcile, or whose units mismatch, fires nothing), payload `{ "lot_id"?, "lot_number"?, "batch_id"?, "batch_number"?, "node_key"?, "quantity": number, "unit": string }` (lot fields for a lot-step event, batch fields for a blend event).

**`purchase_order.*` / `sales_order.*` events (this revision):** fire on the matching lifecycle action (`created` on `POST /purchase-orders`, `sent` on the `send` action, `received` on `receive` once it succeeds, `closed`/`cancelled` on those actions; same pattern for `sales_order.*` with `confirmed`/`dispatched` instead of `sent`/`received`). Payloads are deliberately minimal -- `{ "purchase_order_id": number, "po_number": string }` or `{ "sales_order_id": number, "so_number": string }` -- `unit_price` and `notes` are excluded from the payload for now, so a consumer that needs line-level detail must follow up with a `GET /purchase-orders/:id` or `GET /sales-orders/:id` call.

### Reports

Read-only aggregate endpoints for dashboards/reports pages. All share one role gate -- **Admin, Manager, Engineer only**; `production` gets `403`.

| Method | Path | Query Params | Roles |
|--------|------|---------------|-------|
| GET | `/reports/production-summary` | — | Admin, Manager, Engineer |
| GET | `/reports/scrap-summary` | `date_from?`, `date_to?` (`YYYY-MM-DD`) | Admin, Manager, Engineer |
| GET | `/reports/material-usage` | `date_from?`, `date_to?` (`YYYY-MM-DD`) | Admin, Manager, Engineer |
| GET | `/reports/purchase-orders-summary` | — | Admin, Manager, Engineer |
| GET | `/reports/sales-orders-summary` | — | Admin, Manager, Engineer |

`date_to` is inclusive of the whole day. An invalid date on either param returns `400`: `{"success": false, "error": "invalid date_from, expected YYYY-MM-DD"}` (or `date_to`).

**`purchase-orders-summary` / `sales-orders-summary`** (new, this revision): open (not `closed`/`cancelled`) orders only, with an overdue flag/count. Response shape:

```ts
// GET /reports/purchase-orders-summary
{
  open_count: number;
  overdue_count: number;
  orders: {
    id: number; po_number: string; vendor_id: number; vendor_name: string;
    status: string; expected_date: string | null;
    is_overdue: boolean;  // true when expected_date has passed and the PO isn't fully received yet
  }[];
}

// GET /reports/sales-orders-summary -- identical shape, so_number/customer_id/customer_name instead
```

**Response shapes:**

```ts
// GET /reports/production-summary
{
  total_batches: number; completed_batches: number; active_batches: number;
  total_lots: number; completed_lots: number; active_lots: number;
  completed_today: number; total_scrap_kg: number;
  by_step: Record<string, number>; // e.g. { compaction: 128, sintering: 110, sizing: 96, batching: 96 }
}

// GET /reports/scrap-summary
{
  total_kg: number;
  by_type: Record<string, number>; // e.g. { handling: 12.5, testing: 8.4, blending_spillage: 16 }
}

// GET /reports/material-usage
{
  by_material: { name: string; unit: string; total_qty: number }[];
}
```

**Notes:**
- `scrap-summary` is kg-denominated only -- scrap recorded in `pcs` is excluded entirely from `total_kg`/`by_type`, since a piece count can't convert to a weight.
- `blending_spillage` in `by_type` is blending-level scrap (`batch_scrap`, recorded in grams, converted to kg), distinct from the per-step scrap types (`handling`, `testing`, `dimension_rejection`, etc.).
- `production-summary`'s `completed_today` reflects workflow instances completed today, not a naive count of `lots` with `status='completed'`.

---

## 9. Response Shapes

### User

```ts
interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'engineer' | 'production';
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}
```

### Batch (list item)

```ts
interface Batch {
  id: number;
  batch_number: string;  // e.g. "2629701"
  year: number;
  week: number;
  day_of_week: number;
  sequence: number;
  total_blend_qty: number;
  unit: string;
  status: 'created' | 'blending' | 'blended' | 'in_production' | 'completed';
  notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}
```

### BatchDetail (GET /batches/:id)

```ts
interface BatchDetail extends Batch {
  materials: BatchMaterial[];
  scrap: BatchScrap[];
  lots: Lot[];
  scrap_reconciliation?: BatchScrapReconciliation;  // omitted only if computation failed server-side; expect it once materials exist
}

interface BatchMaterial {
  id: number;
  batch_id: number;
  raw_material_id: number;
  material_name: string;
  planned_qty: number;
  actual_qty: number | null;  // null until blending is completed
  unit: string;
}

interface BatchScrap {
  id: number;
  batch_id: number;
  scrap_type: string;
  quantity: number;
  unit: string;
  notes: string | null;
  recorded_by: number | null;      // null on the system-generated "unaccounted" row
  is_auto_calculated: boolean;     // true for the single system-generated row per batch
  created_at: string;
}

// New: mirrors StepVariance.reconciliation_note's signal at the batch level -- computed by
// GetBatch from the already-loaded materials/scrap, not a separate call.
interface BatchScrapReconciliation {
  planned_total: number;
  actual_total: number;
  manual_scrap: number;
  auto_scrap: number;
  reconciliation_note: string | null;  // non-null only when actual + manual scrap exceeds planned (data-entry error)
}
```

### Lot (list item)

```ts
interface Lot {
  id: number;
  batch_id: number;
  lot_number: string;   // e.g. "2629701-01"
  sequence: number;
  sku_id: number;
  sku_code: string;
  quantity: number;
  unit: string;
  current_step: string;
  status: 'created' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}
```

### LotDetail (GET /lots/:id)

```ts
interface LotDetail extends Lot {
  batch_number: string;
  steps: LotStep[];
}

interface LotStep {
  id: number;
  lot_id: number;
  step_name: string;
  step_sequence: number;
  machine_name: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  skipped: boolean;
  expected_input_qty: number | null;
  expected_output_qty: number | null;
  actual_input_qty: number | null;
  actual_output_qty: number | null;
  input_unit: string;
  output_unit: string;
  operator_id: number | null;
  operator_name?: string;          // joined; omitted if no operator yet (pending step)
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;            // real operational note from `complete` -- NOT the override reason
  variance?: StepVariance;         // only present once status has an actual_output_qty
  scrap_entries?: ScrapEntry[];    // omitted for pending steps
  consumable_usages?: ConsumableUsageDetail[]; // omitted for pending steps
  override_history?: StepOverride[]; // omitted for pending steps AND for engineer/production roles
}

interface StepVariance {
  input_diff: number;
  input_diff_pct: number;
  output_diff: number;
  output_diff_pct: number;
  yield_pct: number;
  total_scrap: number;             // now always reconciles with input/output when reconciliation_note is null
  scrap_unit: string;
  reconciliation_note: string | null;  // non-null: unit mismatch (auto-calc skipped) or negative remainder (data-entry error)
}

interface ScrapEntry {
  id: number;
  lot_step_id: number;
  scrap_type: string;
  quantity: number;
  unit: string;
  notes: string | null;
  recorded_by: number | null;      // null on the system-generated "unaccounted" row
  recorded_by_name?: string;       // joined; omitted/absent on auto rows (no operator)
  is_auto_calculated: boolean;     // true for the single system-generated row per step
  created_at: string;
}

interface ConsumableUsageDetail {
  id: number;
  lot_step_id: number;
  consumable_id: number;
  consumable_name: string;         // joined
  quantity: number;
  unit: string;
  created_at: string;
}

// One row of the manual-override audit trail (PUT /lots/:id/steps/:step).
// Only ever present for admin/manager callers -- see Step 8 above.
interface StepOverride {
  id: number;
  lot_step_id: number;
  previous_input_qty: number | null;   // populated only if this override changed input
  previous_output_qty: number | null;  // populated only if this override changed output
  previous_notes: string | null;
  new_input_qty: number | null;
  new_output_qty: number | null;
  reason: string;                      // the mandatory audit reason submitted with the override
  changed_by: number;
  changed_by_name?: string;            // joined
  created_at: string;
}
```

### BatchWorkflowDetail (GET /batches/:id/workflow)

The batch-level analog of `LotDetail` above: the batch's own workflow instance (its node history -- in v1, always exactly 2 entries once split has happened: a `blend` `production_step` node, then a `split_into_lots` `lot_fanout` node) plus a summary of every lot the split spawned, so the frontend can render the parent/child relationship in one call.

```ts
interface BatchWorkflowDetail {
  instance_id: number;
  status: string;                     // the batch's own workflow instance status, e.g. 'in_progress' | 'completed'
  nodes: WorkflowNodeInstance[];      // see below -- same item shape as LotDetail.steps
  child_lots: BatchWorkflowChildLot[];
}

interface BatchWorkflowChildLot {
  lot_id: number;
  lot_number: string;
  instance_id: number;                // the lot's OWN workflow instance id, not the batch's
  status: string;                     // the lot's own workflow instance status
  current_node_key?: string;          // omitted once the lot's own workflow has fully completed
}
```

**`WorkflowNodeInstance`** is the real, current shape of each entry in both `BatchWorkflowDetail.nodes` above and `LotDetail.steps` above -- this supersedes the `LotStep` interface documented under `LotDetail`, which predates the workflow-engine rewrite and is missing `node_key`/`node_type`/`outcome`/`decision_reason`/`data` (those fields matter here specifically: `node_type` is how you tell the batch's `blend` node apart from its `split_into_lots` node). Defined once here rather than duplicated:

```ts
interface WorkflowNodeInstance {
  id: number;
  workflow_instance_id: number;
  node_id: number;
  node_key: string;                   // e.g. 'blend', 'split_into_lots', 'compaction', 'sintering', ...
  node_type: string;                  // 'production_step' | 'lot_fanout' | 'approval' | 'quality_check' | 'conditional_branch'
  sequence_no: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  skipped: boolean;
  expected_input_qty?: number;
  expected_output_qty?: number;
  actual_input_qty?: number;
  actual_output_qty?: number;
  input_unit?: string;
  output_unit?: string;
  machine_name?: string;
  outcome?: string;                   // approval / quality_check / conditional_branch nodes only
  decision_reason?: string;
  decided_by?: number;
  decided_at?: string;
  data?: object;                      // open-shaped per-node-type payload (e.g. quality measurements)
  operator_id?: number;
  operator_name?: string;             // joined; omitted if no operator yet
  started_at?: string;
  completed_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  variance?: StepVariance;            // production_step nodes only, once completed
  scrap_entries?: ScrapEntry[];       // omitted for pending nodes
  consumable_usages?: ConsumableUsageDetail[]; // omitted for pending nodes
  override_history?: StepOverride[];  // omitted for pending nodes AND for engineer/production roles
}
```

**Example response** -- a batch that has completed `blend` + split into 3 lots, where the batch's own instance is still `in_progress` because none of the 3 lots have finished their own pipelines yet:

```json
{
  "success": true,
  "data": {
    "instance_id": 501,
    "status": "in_progress",
    "nodes": [
      {
        "id": 9001,
        "workflow_instance_id": 501,
        "node_id": 12,
        "node_key": "blend",
        "node_type": "production_step",
        "sequence_no": 1,
        "status": "completed",
        "skipped": false,
        "expected_input_qty": 330,
        "expected_output_qty": 328.5,
        "actual_input_qty": 330,
        "actual_output_qty": 328.5,
        "input_unit": "kg",
        "output_unit": "kg",
        "operator_id": 4,
        "operator_name": "Priya Nair",
        "started_at": "2026-07-19T06:10:00Z",
        "completed_at": "2026-07-19T07:40:00Z",
        "created_at": "2026-07-19T06:00:00Z",
        "updated_at": "2026-07-19T07:40:00Z"
      },
      {
        "id": 9002,
        "workflow_instance_id": 501,
        "node_id": 13,
        "node_key": "split_into_lots",
        "node_type": "lot_fanout",
        "sequence_no": 2,
        "status": "completed",
        "skipped": false,
        "operator_id": 2,
        "operator_name": "Admin",
        "started_at": "2026-07-19T07:41:00Z",
        "completed_at": "2026-07-19T07:42:00Z",
        "created_at": "2026-07-19T07:41:00Z",
        "updated_at": "2026-07-19T07:42:00Z"
      }
    ],
    "child_lots": [
      { "lot_id": 210, "lot_number": "2629701-01", "instance_id": 601, "status": "in_progress", "current_node_key": "sintering" },
      { "lot_id": 211, "lot_number": "2629701-02", "instance_id": 602, "status": "in_progress", "current_node_key": "compaction" },
      { "lot_id": 212, "lot_number": "2629701-03", "instance_id": 603, "status": "in_progress", "current_node_key": "compaction" }
    ]
  }
}
```

### PurchaseOrderDetail (GET /purchase-orders/:id, and the body of create/update/receive responses)

```ts
interface PurchaseOrder {
  id: number;
  po_number: string;          // e.g. "PO-20260731-001"
  vendor_id: number;
  status: 'draft' | 'sent' | 'partially_received' | 'received' | 'closed' | 'cancelled';
  expected_date: string | null;  // YYYY-MM-DD
  notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface PurchaseOrderDetail extends PurchaseOrder {
  lines: PurchaseOrderLine[];
}

interface PurchaseOrderLine {
  id: number;
  purchase_order_id: number;
  raw_material_id: number;
  material_name?: string;     // joined; omitted if not resolvable
  ordered_qty: number;
  received_qty: number;       // starts at 0; can exceed ordered_qty on over-receipt
  unit_price?: number;
}
```

### SalesOrderDetail (GET /sales-orders/:id, and the body of create/update/dispatch responses)

```ts
interface SalesOrder {
  id: number;
  so_number: string;          // e.g. "SO-20260731-001"
  customer_id: number;
  status: 'draft' | 'confirmed' | 'partially_shipped' | 'shipped' | 'closed' | 'cancelled';
  expected_date: string | null;  // YYYY-MM-DD
  notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface SalesOrderDetail extends SalesOrder {
  lines: SalesOrderLine[];
}

interface SalesOrderLine {
  id: number;
  sales_order_id: number;
  sku_id: number;
  sku_name?: string;          // joined; omitted if not resolvable
  ordered_qty: number;
  shipped_qty: number;        // starts at 0; capped at ordered_qty -- dispatch checks current stock, not this field
  unit_price?: number;
}
```

### StockLedgerEntry (GET /stock/ledger, one item of the paginated `items[]`)

```ts
interface StockLedgerEntry {
  id: number;
  item_type: 'sku' | 'raw_material' | 'consumable';
  item_id: number;
  delta: number;               // signed: positive = increase, negative = decrease
  balance_after: number;       // running balance immediately after this entry
  reason: 'po_receipt' | 'so_dispatch' | 'production_consume' | 'production_output' | 'scrap' | 'manual_adjust';
  ref_type?: 'purchase_order' | 'sales_order' | 'lot' | 'batch';  // omitted for manual_adjust (no source doc)
  ref_id?: number;             // id into whichever table ref_type names; pairs with ref_type
  note?: string;
  created_by: number;
  created_at: string;
}
```

### Paginated list envelope

```ts
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}
```

---

## 10. Error Handling

All error responses:

```json
{ "success": false, "error": "human readable message" }
```

| HTTP Status | Meaning | UI action |
|-------------|---------|-----------|
| 400 | Validation failure or business rule violation | Show `error` string as a form/toast error |
| 401 | Token missing or expired | Redirect to `/login` |
| 403 | Insufficient role | Show "You don't have permission to do this" |
| 404 | Resource not found | Show 404 page or empty state |
| 409 | Duplicate code/email on create | Show "already exists" message next to the field |
| 500 | Unexpected server error | Show generic "Something went wrong" toast |

### Axios error helper

```ts
// lib/errors.ts
export const getApiError = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error ?? 'An unexpected error occurred';
  }
  return 'An unexpected error occurred';
};
```

```tsx
// Usage in a component
try {
  await api.post('/batches', payload);
} catch (err) {
  toast.error(getApiError(err));
}
```

---

## 11. Suggested Component Architecture

### Lot Step Timeline

The most complex UI component. Renders all 6 steps as a horizontal or vertical timeline, highlighting the active step and showing actions.

```
[compaction ✓] → [sintering ✓] → [marking →] → [barreling ○] → [sizing ○] → [batching ○]
```

State per step:
- `pending` (○) — show "Start" button if this is the current step AND user has production role
- `in_progress` (→) — show "Complete" + "Record Scrap" + "Record Consumable" buttons
- `completed` (✓) — show analytics summary (yield %, scrap total)
- `skipped` (⊘) — greyed out, no actions

```tsx
// components/LotStepTimeline.tsx
const STEP_ORDER = ['compaction', 'sintering', 'marking', 'barreling', 'sizing', 'batching'];
const SKIPPABLE = ['sintering', 'marking', 'barreling', 'sizing'];

function StepCard({ step, lotId, isCurrentStep }: StepCardProps) {
  const { can } = useRole();
  
  return (
    <div className={`step-card step-${step.status}`}>
      <h3>{step.step_name}</h3>
      <StatusBadge status={step.status} />
      
      {isCurrentStep && step.status === 'pending' && can(['admin', 'production']) && (
        <StartStepButton lotId={lotId} stepName={step.step_name} />
      )}
      {step.status === 'pending' && SKIPPABLE.includes(step.step_name) && can(['admin', 'manager']) && (
        <SkipStepButton lotId={lotId} stepName={step.step_name} />
      )}
      {step.status === 'in_progress' && can(['admin', 'production']) && (
        <CompleteStepButton lotId={lotId} stepName={step.step_name} />
      )}
      {step.status === 'in_progress' && can(['admin', 'production', 'engineer']) && (
        <RecordScrapButton lotId={lotId} stepName={step.step_name} />
      )}
      {step.status === 'completed' && step.variance && (
        <VarianceBadge variance={step.variance} />
      )}
      {step.status !== 'pending' && (
        <StepDetailButton icon="BarChart3" lotId={lotId} stepName={step.step_name} />
      )}
    </div>
  );
}
```

**Step-detail modal** (`StepDetailButton` above): available for any non-pending step, not just completed ones. Fetch via `GET /lots/:id/steps/:step/analytics` (Step 8, §6) and render: overview (status/machine/operator/timestamps/`notes`), quantities (expected vs actual with `variance`), scrap entries, consumables used, and -- gated on `can(['admin', 'manager'])` -- an override history panel. The override-reason input on that panel's "correct this step" form should start blank; never prefill it from `step.notes` (see the warning in §6 Step 5).

### Batch Detail Page

Key sections:
1. **Header** — batch number, status badge, created date, created by
2. **Materials table** — planned qty vs actual qty columns (actual populated after blend completes)
3. **Scrap list** — spillage entries from complete-blend
4. **Action bar** — context-sensitive:
   - `created` → "Start Blending" (production/admin only)
   - `blending` → "Complete Blending" modal with actual quantities + scrap form
   - `blended` → "Split into Lots" modal with SKU/qty entries
   - `completed` → readonly, shows lots list
5. **Lots list** (after splitting) — links to each lot detail page

### Lot List Filters

```tsx
// ?batch_id=&status=&step=
<Select name="status" options={['created','in_progress','completed']} />
<Select name="step" options={STEP_ORDER} />
```

### Dashboard summary cards

Suggested cards for the `/dashboard` page:

| Card | Data source |
|------|-------------|
| Active batches | `GET /batches?status=blending` → total |
| Batches in blended state | `GET /batches?status=blended` → total |
| Lots in progress | `GET /lots?status=in_progress` → total |
| Lots at compaction | `GET /lots?step=compaction&status=in_progress` → total |
| Completed lots (today) | `GET /lots?status=completed` filter client-side by date |

---

## Appendix — Batch Number Format

```
Format: YYWWDSS
  YY  = 2-digit year       (26 = 2026)
  WW  = ISO week number    (29 = week 29)
  D   = day of week        (1=Mon … 7=Sun)
  SS  = daily sequence     (01, 02 …)

Example: 2629701 = 2026, week 29, Sunday, sequence 01
```

Lot numbers append `-NN`: `2629701-01`, `2629701-02`.
