# QGPT Production Tracker — Next.js UI Implementation Guide

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
7. [All Endpoints Reference](#7-all-endpoints-reference)
8. [Response Shapes](#8-response-shapes)
9. [Error Handling](#9-error-handling)
10. [Suggested Component Architecture](#10-suggested-component-architecture)

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
| `admin` | Everything — users, masters, production, webhooks |
| `manager` | Everything except user management and webhooks. Can skip steps, split lots |
| `engineer` | Read-only on masters + production. Can record scrap |
| `production` | Batch/lot operations — start/complete steps, record scrap + consumables |

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

Scrap type for blending is always `spillage`. Unit defaults to grams (`g`) if omitted.

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
// Batch status → "completed"
// Each lot starts at step "compaction", status "created"
```

Each lot gets a number like `2629701-01`, `2629701-02`.  
Six step records are pre-created per lot (pending): compaction → sintering → marking → barreling → sizing → batching.

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

#### Skip an optional step

```ts
// POST /lots/:id/steps/:step/skip
await api.post(`/lots/${lotId}/steps/sintering/skip`);
// Step status → "skipped"
// Lot current_step advances to next step
```

Skippable steps: `sintering`, `marking`, `barreling`, `sizing`. Cannot skip `compaction` or `batching`.

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

### Step 8 — View Step Analytics

Available for any completed step. Shows variance between expected and actual.

```ts
// GET /lots/:id/steps/:step/analytics
const { data } = await api.get(`/lots/${lotId}/steps/compaction/analytics`);
```

Response includes `variance` object:
```json
{
  "input_diff": -1.5,
  "input_diff_pct": -0.75,
  "output_diff": -5,
  "output_diff_pct": -2.6,
  "yield_pct": 92.5,
  "total_scrap": 12,
  "scrap_unit": "pcs"
}
```

---

## 7. All Endpoints Reference

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
| POST | `/skus` | `{ code, name, description?, customer_id?, unit? }` | Admin, Manager, Engineer |
| GET | `/skus/:id` | — | Admin, Manager, Engineer |
| PUT | `/skus/:id` | `{ name?, description?, customer_id?, unit?, is_active? }` | Admin, Manager, Engineer |
| PUT | `/skus/:id/materials` | `{ materials: [{ raw_material_id, ratio_percent }] }` | Admin, Manager, Engineer |

Materials rules: array must have ≥ 1 item; `ratio_percent` must be > 0 and ≤ 100.

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

Batch status values: `created` → `blending` → `blended` → `completed`

### Lots

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/lots?batch_id=1&status=in_progress&step=compaction` | — | All |
| GET | `/lots/:id` | — | All |
| POST | `/lots/:id/steps/:step/start` | `{ machine_name? }` | Admin, Production |
| POST | `/lots/:id/steps/:step/complete` | `{ actual_input_qty, actual_output_qty, machine_name?, notes? }` | Admin, Production |
| POST | `/lots/:id/steps/:step/skip` | — | Admin, Manager |
| PUT | `/lots/:id/steps/:step` | `{ actual_input_qty?, actual_output_qty?, notes? }` | Admin, Manager |
| GET | `/lots/:id/steps/:step/analytics` | — | All |
| POST | `/lots/:id/steps/:step/scrap` | `{ scrap_type, quantity, unit?, notes? }` | Admin, Production, Engineer |
| POST | `/lots/:id/steps/:step/consumables` | `{ consumable_id, quantity, unit }` | Admin, Production |

Valid step names: `compaction`, `sintering`, `marking`, `barreling`, `sizing`, `batching`

### Webhooks

| Method | Path | Body | Roles |
|--------|------|------|-------|
| GET | `/webhooks` | — | Admin |
| POST | `/webhooks` | `{ url, secret?, events[] }` | Admin |
| GET | `/webhooks/:id` | — | Admin |
| PUT | `/webhooks/:id` | `{ url?, secret?, events[]?, is_active? }` | Admin |
| DELETE | `/webhooks/:id` | — | Admin |
| POST | `/webhooks/:id/test` | — | Admin |

Valid webhook events: `batch.created`, `batch.blending_started`, `batch.blending_completed`, `batch.lots_created`, `lot.step_started`, `lot.step_completed`, `lot.step_skipped`, `lot.scrap_recorded`, `lot.completed`

---

## 8. Response Shapes

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
  status: 'created' | 'blending' | 'blended' | 'completed';
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
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  variance: StepVariance | null;   // only present when status = "completed"
}

interface StepVariance {
  input_diff: number;
  input_diff_pct: number;
  output_diff: number;
  output_diff_pct: number;
  yield_pct: number;
  total_scrap: number;
  scrap_unit: string;
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

## 9. Error Handling

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

## 10. Suggested Component Architecture

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
    </div>
  );
}
```

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
