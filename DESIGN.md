# Bang Inventory -- Manufacturing Production Line Tracking System

## Design Document v1.1

**System**: Powder Metallurgy Factory Production Tracker
**Stack**: Go 1.24 / Gin / MySQL / sqlx / JWT Auth
**Date**: 2026-07-17

---

## TABLE OF CONTENTS

1. [High-Level Design](#1-high-level-design)
2. [Low-Level Design](#2-low-level-design)
3. [Implementation Plan](#3-implementation-plan)

---

# 1. HIGH-LEVEL DESIGN

## 1.1 System Overview

```
                        +-------------------+
                        |   Gin HTTP Server  |
                        +--------+----------+
                                 |
              +------------------+------------------+
              |                  |                   |
     +--------v------+  +-------v-------+  +--------v--------+
     | Auth Middleware|  | RBAC Middleware|  | Request Logger  |
     +--------+------+  +-------+-------+  +--------+--------+
              |                  |                   |
              +------------------+------------------+
                                 |
              +------------------+------------------+
              |                  |                   |
     +--------v------+  +-------v-------+  +--------v--------+
     |  Controllers  |  |  Controllers  |  |  Controllers    |
     |  (Auth)       |  |  (Masters)    |  |  (Production)   |
     +--------+------+  +-------+-------+  +--------+--------+
              |                  |                   |
     +--------v------+  +-------v-------+  +--------v--------+
     |   Services    |  |   Services    |  |   Services      |
     +--------+------+  +-------+-------+  +--------+--------+
              |                  |                   |
              +------------------+------------------+
                                 |
                        +--------v----------+
                        |   Repositories    |
                        |   (sqlx + MySQL)  |
                        +--------+----------+
                                 |
                        +--------v----------+
                        |      MySQL        |
                        +-------------------+

     Side-channel:
     +-------------------+
     | Webhook Dispatcher| ----> External consumers (one-way push)
     +-------------------+
```

### Components

| Component | Responsibility |
|-----------|---------------|
| **Controllers** | HTTP request parsing, validation, response formatting |
| **Services** | Business logic, batch number generation, step state machine, webhook triggering |
| **Repositories** | Database access via sqlx, prepared statements only |
| **Middleware** | JWT auth, RBAC enforcement, request logging |
| **Webhook Dispatcher** | Async fire-and-forget HTTP POST to registered webhook URLs |

## 1.2 Data Flow Through the Production Pipeline

```
  BLENDING (Batch-level)
     |
     |  Batch 2618701 created: 350kg total
     |  Raw materials: Iron=300kg, Copper=30kg, Tin=10kg, Bond=10kg
     |  Spillage scrap recorded
     |
     v
  SPLIT INTO LOTS
     |
     +--- Lot 2618701-01 (SKU 034, 200kg) --+
     +--- Lot 2618701-02 (SKU 048, 50kg)  --+-- Each lot proceeds
     +--- Lot 2618701-03 (SKU 003, 100kg) --+   independently
     |
     v  (per lot)
  COMPACTION --> SINTERING --> [MARKING] --> BARRELING --> SIZING --> BATCHING
     |              |             |                          |
     |  scrap:      | scrap:      | scrap:                   | scrap:
     |  handling,   | testing     | setting                  | testing
     |  setting,    |             |                          | (dim reject)
     |  visual      |             |                          |
```

**Key rules:**
- Blending operates at the Batch level; steps 2-7 operate at the Lot level.
- Sintering, marking, barreling, and sizing are optional (can be skipped).
- Each step must complete before the next can begin (linear state machine).
- Scrap is recorded per step, except Barreling and Batching which produce no scrap.
- Scrap and consumable usage cannot be recorded on a skipped step.

## 1.3 API Design Philosophy

- **REST for all writes and reads.** Standard CRUD on resources plus action endpoints for step transitions.
- **One-way webhooks for live tracking.** The server POSTs events to registered URLs. No response processing; fire-and-forget with retry (3 attempts, exponential backoff).
- **JSON throughout.** All request/response bodies are `application/json`.
- **Consistent envelope.** Every response uses the existing `responses.Response` struct: `{ success, data, message, error }`.
- **Pagination via query params:** `?page=1&per_page=20` on all list endpoints. Response includes `{ items, total, page, per_page }`.
- **Filtering via query params:** e.g. `?status=in_progress&sku_id=5`.

## 1.4 Auth and RBAC Approach

**Authentication:** JWT tokens issued on login. Token contains `user_id`, `role`, `exp`. Passed as `Authorization: Bearer <token>`. Token lifetime: 24 hours (configurable).

**Roles (predefined, not granular):**

| Role | Description |
|------|-------------|
| `admin` | Full system access, user management, webhook management |
| `manager` | Read all, create/edit masters, view production, manage lots |
| `engineer` | Manage SKUs, view production, record quality data |
| `production` | Record step completions, log scrap, log consumable usage |

**Enforcement:** Gin middleware checks `role` claim from JWT against a per-route permission map. No database lookup on every request -- the role is in the token.

---

# 2. LOW-LEVEL DESIGN

## 2.1 Database Schema

### 2.1.1 Review of Existing Migrations

The existing migrations (001-004) are a solid foundation. Below are specific improvements needed:

**Migration 001 (users) -- Improvements:**
- Add `last_login_at TIMESTAMP NULL` for audit.
- The seed admin password hash is a placeholder -- the app should hash on first boot or via a CLI command.

**Migration 002 (masters) -- Improvements:**
- `skus` table: Add `customer_id` FK (SKUs are typically customer-specific in contract manufacturing).
- `skus` table: Add `blend_recipe_id` or inline material ratios per SKU (needed so blending knows the formula).
- `raw_materials`: Add `vendor_id` FK for default supplier.
- Add `sku_materials` join table for the bill-of-materials (recipe) per SKU.

**Migration 003 (production) -- Improvements:**
- `batches.status` should be ENUM-like: `created`, `blending`, `blended`, `splitting`, `completed`.
- `lots.current_step` and `lot_steps.step_name` should use a constrained set: `compaction`, `sintering`, `marking`, `barreling`, `sizing`, `batching`.
- `lot_steps`: Add `skipped BOOLEAN DEFAULT FALSE` for optional marking step.
- `scrap_entries`: The `scrap_type` should be constrained per step (see scrap type matrix below).
- Add `lot_steps.machine_id` or `machine_name` for tracking which press/furnace was used.

**Migration 004 (webhooks) -- Good as-is.**

### 2.1.2 New/Modified Tables (Migration 005)

```sql
-- 005_schema_enhancements.sql
-- +migrate Up

-- Bill of materials: which raw materials (and ratios) make up an SKU's blend
CREATE TABLE sku_materials (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sku_id BIGINT UNSIGNED NOT NULL,
    raw_material_id BIGINT UNSIGNED NOT NULL,
    ratio_percent DECIMAL(6,3) NOT NULL,  -- e.g. 95.000 for 95%
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sku_id) REFERENCES skus(id),
    FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    UNIQUE KEY uk_sku_material (sku_id, raw_material_id)
);

-- Link SKUs to customers
ALTER TABLE skus ADD COLUMN customer_id BIGINT UNSIGNED NULL AFTER description;
ALTER TABLE skus ADD FOREIGN KEY fk_skus_customer (customer_id) REFERENCES customers(id);

-- Add default vendor to raw materials
ALTER TABLE raw_materials ADD COLUMN vendor_id BIGINT UNSIGNED NULL AFTER unit;
ALTER TABLE raw_materials ADD FOREIGN KEY fk_rawmats_vendor (vendor_id) REFERENCES vendors(id);

-- Add machine tracking to lot steps
ALTER TABLE lot_steps ADD COLUMN machine_name VARCHAR(100) NULL AFTER step_sequence;
ALTER TABLE lot_steps ADD COLUMN skipped BOOLEAN NOT NULL DEFAULT FALSE AFTER status;

-- Batch sequence counter table (for safe auto-increment per day)
CREATE TABLE batch_sequence (
    date_key DATE NOT NULL PRIMARY KEY,
    last_sequence INT NOT NULL DEFAULT 0
);

-- Add last_login_at to users
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL AFTER is_active;

-- Webhook delivery log for debugging
CREATE TABLE webhook_deliveries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    webhook_id BIGINT UNSIGNED NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload JSON NOT NULL,
    http_status INT,
    response_body TEXT,
    attempt INT NOT NULL DEFAULT 1,
    delivered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE,
    INDEX idx_deliveries_webhook (webhook_id),
    INDEX idx_deliveries_event (event_type)
);

-- +migrate Down
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS batch_sequence;
ALTER TABLE lot_steps DROP COLUMN machine_name;
ALTER TABLE lot_steps DROP COLUMN skipped;
ALTER TABLE skus DROP FOREIGN KEY fk_skus_customer;
ALTER TABLE skus DROP COLUMN customer_id;
ALTER TABLE raw_materials DROP FOREIGN KEY fk_rawmats_vendor;
ALTER TABLE raw_materials DROP COLUMN vendor_id;
ALTER TABLE users DROP COLUMN last_login_at;
DROP TABLE IF EXISTS sku_materials;
```

### 2.1.3 Complete Entity Relationship Summary

```
users (1) ---< batches (created_by)
users (1) ---< batch_scrap (recorded_by)
users (1) ---< lot_steps (operator_id)
users (1) ---< scrap_entries (recorded_by)
users (1) ---< webhooks (created_by)

customers (1) ---< skus (customer_id)
vendors (1) ---< raw_materials (vendor_id)

skus (1) ---< sku_materials >--- raw_materials (many-to-many via join)
skus (1) ---< lots (sku_id)

batches (1) ---< batch_materials >--- raw_materials
batches (1) ---< batch_scrap
batches (1) ---< lots

lots (1) ---< lot_steps
lot_steps (1) ---< scrap_entries
lot_steps (1) ---< consumable_usage >--- consumables

webhooks (1) ---< webhook_deliveries
```

### 2.1.4 Scrap Type Matrix

| Step | Allowed Scrap Types |
|------|-------------------|
| Blending (batch-level) | `spillage` |
| Compaction | `handling`, `setting`, `visual` |
| Sintering | `testing` |
| Marking | `setting` |
| Barreling | (none) |
| Sizing | `testing`, `dimension_rejection` |
| Batching | (none) |

This is enforced at the service layer, not the database.

**Note on skipped steps:** Scrap and consumable usage cannot be recorded against a step that has been skipped. Attempting to do so returns `400 cannot record scrap on a skipped step` or `400 cannot record consumable usage on a skipped step` respectively.

## 2.2 Full API Endpoint List

### 2.2.1 Auth Module

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| POST | `/api/v1/auth/login` | Login, get JWT | Public |
| POST | `/api/v1/auth/logout` | Invalidate token (optional) | Any |
| GET | `/api/v1/auth/me` | Get current user profile | Any |
| PUT | `/api/v1/auth/password` | Change own password | Any |

### 2.2.2 User Management

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/api/v1/users` | List users | Admin |
| POST | `/api/v1/users` | Create user | Admin |
| GET | `/api/v1/users/:id` | Get user | Admin |
| PUT | `/api/v1/users/:id` | Update user | Admin |
| DELETE | `/api/v1/users/:id` | Soft-delete (deactivate) | Admin |

### 2.2.3 Customer Management

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/api/v1/customers` | List customers | Admin, Manager |
| POST | `/api/v1/customers` | Create customer | Admin, Manager |
| GET | `/api/v1/customers/:id` | Get customer | Admin, Manager, Engineer |
| PUT | `/api/v1/customers/:id` | Update customer | Admin, Manager |

### 2.2.4 Vendor Management

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/api/v1/vendors` | List vendors | Admin, Manager |
| POST | `/api/v1/vendors` | Create vendor | Admin, Manager |
| GET | `/api/v1/vendors/:id` | Get vendor | Admin, Manager, Engineer |
| PUT | `/api/v1/vendors/:id` | Update vendor | Admin, Manager |

### 2.2.5 SKU Management

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/api/v1/skus` | List SKUs | Admin, Manager, Engineer |
| POST | `/api/v1/skus` | Create SKU | Admin, Manager, Engineer |
| GET | `/api/v1/skus/:id` | Get SKU (with materials) | Admin, Manager, Engineer |
| PUT | `/api/v1/skus/:id` | Update SKU | Admin, Manager, Engineer |
| PUT | `/api/v1/skus/:id/materials` | Set SKU bill of materials | Admin, Manager, Engineer |

### 2.2.6 Raw Materials

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/api/v1/raw-materials` | List raw materials | Admin, Manager, Engineer |
| POST | `/api/v1/raw-materials` | Create raw material | Admin, Manager |
| GET | `/api/v1/raw-materials/:id` | Get raw material | Admin, Manager, Engineer |
| PUT | `/api/v1/raw-materials/:id` | Update raw material | Admin, Manager |
| POST | `/api/v1/raw-materials/:id/stock` | Adjust stock (receive/consume) | Admin, Manager |

### 2.2.7 Consumables

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/api/v1/consumables` | List consumables | Admin, Manager, Engineer |
| POST | `/api/v1/consumables` | Create consumable | Admin, Manager |
| GET | `/api/v1/consumables/:id` | Get consumable | Admin, Manager, Engineer |
| PUT | `/api/v1/consumables/:id` | Update consumable | Admin, Manager |
| POST | `/api/v1/consumables/:id/stock` | Adjust stock | Admin, Manager |

### 2.2.8 Batch (Blending) Management

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/api/v1/batches` | List batches (paginated, filterable) | Admin, Manager, Engineer, Production |
| POST | `/api/v1/batches` | Create batch (auto-generates batch number) | Admin, Manager, Production |
| GET | `/api/v1/batches/:id` | Get batch with materials and lots | Admin, Manager, Engineer, Production |
| PUT | `/api/v1/batches/:id` | Update batch details | Admin, Manager |
| POST | `/api/v1/batches/:id/blend` | Start blending (records actual material quantities) | Admin, Production |
| POST | `/api/v1/batches/:id/complete-blend` | Complete blending, record spillage scrap | Admin, Production |
| POST | `/api/v1/batches/:id/lots` | Split batch into lots (provide SKU + qty for each) | Admin, Manager |

### 2.2.9 Lot Management

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/api/v1/lots` | List lots (filterable by batch, SKU, status, step) | Admin, Manager, Engineer, Production |
| GET | `/api/v1/lots/:id` | Get lot with all steps | Admin, Manager, Engineer, Production |
| POST | `/api/v1/lots/:id/steps/:step/start` | Start a step | Admin, Production |
| POST | `/api/v1/lots/:id/steps/:step/complete` | Complete a step (input/output qty) | Admin, Production |
| POST | `/api/v1/lots/:id/steps/:step/skip` | Skip optional step | Admin, Manager |
| PUT | `/api/v1/lots/:id/steps/:step` | Manual override of step qty/notes | Admin, Manager |
| GET | `/api/v1/lots/:id/steps/:step/analytics` | Get step variance analytics | Admin, Manager, Engineer, Production |
| POST | `/api/v1/lots/:id/steps/:step/scrap` | Record scrap for a step | Admin, Production, Engineer |
| POST | `/api/v1/lots/:id/steps/:step/consumables` | Record consumable usage | Admin, Production |

### 2.2.10 Webhook Management

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/api/v1/webhooks` | List registered webhooks | Admin |
| POST | `/api/v1/webhooks` | Register webhook | Admin |
| GET | `/api/v1/webhooks/:id` | Get webhook with delivery log | Admin |
| PUT | `/api/v1/webhooks/:id` | Update webhook | Admin |
| DELETE | `/api/v1/webhooks/:id` | Delete webhook | Admin |
| POST | `/api/v1/webhooks/:id/test` | Send test event | Admin |

### 2.2.11 Reports / Dashboard

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/api/v1/reports/production-summary` | Active batches/lots summary | Admin, Manager |
| GET | `/api/v1/reports/scrap-summary` | Scrap by type/step/date range | Admin, Manager, Engineer |
| GET | `/api/v1/reports/material-usage` | Raw material consumption report | Admin, Manager |

## 2.3 Request/Response Structures for Key Endpoints

### POST /api/v1/auth/login

```json
// Request
{
  "email": "admin@bang.com",
  "password": "secret123"
}

// Response 200
{
  "success": true,
  "data": {
    "token": "eyJhbGci...",
    "user": {
      "id": 1,
      "name": "Admin",
      "email": "admin@bang.com",
      "role": "admin"
    }
  }
}
```

### POST /api/v1/batches (Create Batch)

```json
// Request
{
  "total_blend_qty": 350.000,
  "unit": "kg",
  "materials": [
    { "raw_material_id": 1, "planned_qty": 300.000 },
    { "raw_material_id": 2, "planned_qty": 30.000 },
    { "raw_material_id": 3, "planned_qty": 10.000 },
    { "raw_material_id": 6, "planned_qty": 10.000 }
  ],
  "notes": "Standard Fe-Cu-Sn blend"
}

// Response 201
{
  "success": true,
  "data": {
    "id": 42,
    "batch_number": "2618701",
    "year": 26,
    "week": 18,
    "day_of_week": 7,
    "sequence": 1,
    "total_blend_qty": 350.000,
    "status": "created",
    "materials": [
      { "raw_material_id": 1, "name": "Iron", "planned_qty": 300.000 }
    ],
    "created_at": "2026-04-24T10:30:00Z"
  }
}
```

### POST /api/v1/batches/:id/lots (Split into Lots)

```json
// Request
{
  "lots": [
    { "sku_id": 34, "quantity": 200.000 },
    { "sku_id": 48, "quantity": 50.000 },
    { "sku_id": 3,  "quantity": 100.000 }
  ]
}

// Validation: sum of lot quantities must equal batch total_blend_qty minus recorded spillage scrap

// Response 201
{
  "success": true,
  "data": {
    "lots": [
      { "id": 101, "lot_number": "2618701-01", "sku_id": 34, "quantity": 200.000, "current_step": "compaction" },
      { "id": 102, "lot_number": "2618701-02", "sku_id": 48, "quantity": 50.000,  "current_step": "compaction" },
      { "id": 103, "lot_number": "2618701-03", "sku_id": 3,  "quantity": 100.000, "current_step": "compaction" }
    ]
  }
}
```

### POST /api/v1/lots/:id/steps/:step/complete

```json
// Request
{
  "input_qty": 200.000,
  "output_qty": 190.000,
  "machine_name": "Press-A1",
  "notes": "Normal run"
}

// Response 200
{
  "success": true,
  "data": {
    "lot_id": 101,
    "step_name": "compaction",
    "status": "completed",
    "input_qty": 200.000,
    "output_qty": 190.000,
    "completed_at": "2026-04-24T14:00:00Z",
    "next_step": "sintering"
  }
}
```

### POST /api/v1/lots/:id/steps/:step/scrap

```json
// Request
{
  "scrap_type": "handling",
  "quantity": 5.000,
  "unit": "pcs",
  "notes": "Cracked during transfer"
}

// Response 201
{
  "success": true,
  "data": {
    "id": 501,
    "lot_step_id": 201,
    "scrap_type": "handling",
    "quantity": 5.000
  }
}
```

## 2.4 Webhook Event Types and Payloads

### Event Types

| Event | Trigger |
|-------|---------|
| `batch.created` | New batch created |
| `batch.blending_started` | Blending step started |
| `batch.blending_completed` | Blending finished, scrap recorded |
| `batch.lots_created` | Batch split into lots |
| `lot.step_started` | Any lot step started |
| `lot.step_completed` | Any lot step completed |
| `lot.step_skipped` | Marking step skipped |
| `lot.scrap_recorded` | Scrap entry added |
| `lot.completed` | Lot finished all steps (batching complete) |

### Payload Structure

All webhooks POST with:

```
POST <webhook_url>
Content-Type: application/json
X-Webhook-Secret: <shared_secret>
X-Event-Type: lot.step_completed
X-Delivery-Id: <uuid>

{
  "event": "lot.step_completed",
  "timestamp": "2026-04-24T14:00:00Z",
  "data": {
    "lot_id": 101,
    "lot_number": "2618701-01",
    "batch_number": "2618701",
    "sku_code": "034",
    "step": "compaction",
    "status": "completed",
    "input_qty": 200.000,
    "output_qty": 190.000,
    "operator": "John Doe",
    "completed_at": "2026-04-24T14:00:00Z",
    "next_step": "sintering"
  }
}
```

**Delivery policy:** 3 attempts with exponential backoff (1s, 5s, 25s). Delivery status logged in `webhook_deliveries` table. No response parsing -- fire and forget.

## 2.5 RBAC Permission Matrix

| Resource / Action | Admin | Manager | Engineer | Production |
|-------------------|-------|---------|----------|------------|
| **Users** CRUD | Yes | No | No | No |
| **Customers** Read | Yes | Yes | Yes | No |
| **Customers** Write | Yes | Yes | No | No |
| **Vendors** Read | Yes | Yes | Yes | No |
| **Vendors** Write | Yes | Yes | No | No |
| **SKUs** Read | Yes | Yes | Yes | No |
| **SKUs** Write | Yes | Yes | Yes | No |
| **Raw Materials** Read | Yes | Yes | Yes | No |
| **Raw Materials** Write | Yes | Yes | No | No |
| **Raw Materials** Stock Adjust | Yes | Yes | No | No |
| **Consumables** Read | Yes | Yes | Yes | No |
| **Consumables** Write | Yes | Yes | No | No |
| **Consumables** Stock Adjust | Yes | Yes | No | No |
| **Batches** Read | Yes | Yes | Yes | Yes |
| **Batches** Create | Yes | Yes | No | Yes |
| **Batches** Update | Yes | Yes | No | No |
| **Batches** Start/Complete Blend | Yes | No | No | Yes |
| **Batches** Split into Lots | Yes | Yes | No | No |
| **Lots** Read | Yes | Yes | Yes | Yes |
| **Lots** Start/Complete Step | Yes | No | No | Yes |
| **Lots** Skip Step (sintering, marking, barreling, sizing) | Yes | Yes | No | No |
| **Lots** Manual Override Step qty/notes | Yes | Yes | No | No |
| **Lots** Step Analytics | Yes | Yes | Yes | Yes |
| **Lots** Record Scrap | Yes | No | Yes | Yes |
| **Lots** Record Consumable Usage | Yes | No | No | Yes |
| **Webhooks** CRUD | Yes | No | No | No |
| **Reports** View | Yes | Yes | Yes | No |

## 2.6 Validation System

The API uses `go-playground/validator/v10` wired into gin's binding engine. All request bodies are validated automatically when `c.ShouldBindJSON(&req)` is called; validation failures are formatted by `internal/validator/validator.go` and returned as a `400 Bad Request`.

### Custom Tags

| Tag | Validates |
|-----|-----------|
| `valid_role` | String must be one of `admin`, `manager`, `engineer`, `production` |
| `valid_event` | String must be a recognised webhook event name (see Section 2.4) |

`dive` is applied to slice fields so per-element validation fires on each item (e.g. `binding:"required,min=1,dive,valid_event"` on `events []string`).

### Tag Name Override

`RegisterTagNameFunc` is registered at startup to use JSON tag names in error messages. This means error output says `short_code is required` instead of Go field name `ShortCode`.

### Centralized Error Formatter

`internal/validator/validator.go` exports `FormatError(err error) string`. All handlers call this to convert `validator.ValidationErrors` into a human-readable semicolon-separated string:

```
short_code is required; ratio_percent must be 100 or less
```

### Key Validation Rules by Resource

| Resource | Field | Rule |
|----------|-------|------|
| **Users** | `name` | required, max 100 chars |
| **Users** | `email` | required, valid email format, max 255 chars |
| **Users** | `password` | required, min 6 chars, max 100 chars |
| **Users** | `role` | required, `valid_role` |
| **SKU materials** | `materials` | required, min 1 item; each entry validated via `dive` |
| **SKU materials** | `ratio_percent` | required, gt=0, lte=100 |
| **SKU materials** | `raw_material_id` | required |
| **Webhooks** | `url` | required, valid URL |
| **Webhooks** | `events` | required, min 1 item; each entry validated via `dive` using `valid_event` |
| **Batches** | `total_blend_qty` | required, gt=0 |
| **Batches** | `materials` | required, min 1 item; each entry validated via `dive` |

## 2.7 Error Response Format

All error responses use a consistent envelope:

```json
{"success": false, "error": "description of what went wrong"}
```

All success responses use:

```json
{"success": true, "data": { ... }}
```

### HTTP Status Codes

| Status | Meaning |
|--------|---------|
| `400 Bad Request` | Validation failures (missing/invalid fields) or business rule violations (e.g. wrong state machine state, scrap on skipped step) |
| `401 Unauthorized` | Missing or invalid JWT token |
| `403 Forbidden` | Valid token but insufficient role for the requested action |
| `404 Not Found` | Resource with the given ID does not exist |
| `409 Conflict` | Duplicate unique value on create (e.g. duplicate code or email) |
| `500 Internal Server Error` | Unexpected failures; the `error` field carries a safe message |

### Example: Validation Error (400)

```json
{
  "success": false,
  "error": "email must be a valid email address; password must be at least 6 characters"
}
```

### Example: Business Rule Error (400)

```json
{
  "success": false,
  "error": "cannot record scrap on a skipped step"
}
```

### Example: Forbidden (403)

```json
{
  "success": false,
  "error": "forbidden"
}
```

## 2.8 Batch Number Generation Algorithm

```
Format: YYWWDS[S]
  YY = 2-digit year
  WW = ISO week number (01-53), zero-padded
  D  = ISO day of week (1=Monday, 7=Sunday)
  S  = sequence number (1-99, NOT zero-padded for single digit)

Example: 2618701 = Year 2026, Week 18, Sunday, sequence 01
         2618712 = same day, sequence 12
```

### Algorithm (in service layer):

```go
func GenerateBatchNumber(db *sqlx.DB, now time.Time) (string, error) {
    year, week := now.ISOWeek()
    yy := year % 100
    day := int(now.Weekday())
    if day == 0 { day = 7 } // Sunday = 7

    dateKey := now.Format("2006-01-02")

    // Atomic increment using INSERT ... ON DUPLICATE KEY UPDATE
    _, err := db.Exec(`
        INSERT INTO batch_sequence (date_key, last_sequence)
        VALUES (?, 1)
        ON DUPLICATE KEY UPDATE last_sequence = last_sequence + 1
    `, dateKey)
    if err != nil { return "", err }

    var seq int
    err = db.Get(&seq, "SELECT last_sequence FROM batch_sequence WHERE date_key = ?", dateKey)
    if err != nil { return "", err }

    // Format: YYWWDSS (sequence zero-padded to 2 digits)
    return fmt.Sprintf("%02d%02d%d%02d", yy, week, day, seq), nil
}
```

**Lot numbers** append `-XX` suffix: `batchNumber + "-" + fmt.Sprintf("%02d", lotSequence)`

## 2.9 Step Progression State Machine

```
              Batch Level                    Lot Level
              ----------                     ---------

              +----------+
              | created  |
              +----+-----+
                   |  POST /batches/:id/blend
                   v
              +----------+
              | blending |
              +----+-----+
                   |  POST /batches/:id/complete-blend
                   v
              +----------+
              | blended  |
              +----+-----+
                   |  POST /batches/:id/lots
                   v
              +-----------+
              | completed |     (batch done, lots take over)
              +-----------+

   For each lot:

   compaction --> sintering --> marking --> barreling --> sizing --> batching
       |              |           |            |            |          |
    pending       pending     pending      pending      pending    pending
       |            / |        / |  \        / |  \       / |  \       |
    in_progress  skip  in_p  skip  in_p   skip  in_p  skip  in_p  in_progress
       |         /    |    /    |    /        |    /      |    |         |
    completed skipped comp skipped comp    skipped comp  skipped comp completed

   (* sintering, marking, barreling, sizing are skippable; compaction and batching are not)
```

### Step Transition Rules (enforced in service layer):

1. A step can only be started if the **previous step** is `completed` or `skipped`.
2. Steps must follow the defined order. No jumping.
3. The `sintering`, `marking`, `barreling`, and `sizing` steps can be skipped (via the `/skip` endpoint). `compaction` and `batching` are mandatory.
4. When the `batching` step is completed, the lot's `status` is set to `completed`.
5. Step order array: `["compaction", "sintering", "marking", "barreling", "sizing", "batching"]`

```go
var StepOrder = []string{
    "compaction", "sintering", "marking", "barreling", "sizing", "batching",
}

var SkippableSteps = map[string]bool{
    "sintering": true,
    "marking":   true,
    "barreling": true,
    "sizing":    true,
}

var StepScrapTypes = map[string][]string{
    "compaction": {"handling", "setting", "visual"},
    "sintering":  {"testing"},
    "marking":    {"setting"},
    "sizing":     {"testing", "dimension_rejection"},
}
```

---

# 3. IMPLEMENTATION STATUS

> **All phases are complete as of 2026-07-17.** The sections below are preserved for historical reference and to document the directory structure and architectural decisions that were followed during implementation.

## 3.1 Project Directory Structure

```
bang-inventory/
  cmd/
    server/
      main.go                    # Entry point, wires everything
  config/
    config.go                    # (exists)
  database/
    database.go                  # (exists)
  migrations/
    001_users.sql                # (exists)
    002_masters.sql              # (exists)
    003_production.sql           # (exists)
    004_webhooks.sql             # (exists)
    005_schema_enhancements.sql  # NEW
  internal/
    models/
      user.go
      customer.go
      vendor.go
      sku.go
      raw_material.go
      consumable.go
      batch.go
      lot.go
      webhook.go
    repository/
      user_repo.go
      customer_repo.go
      vendor_repo.go
      sku_repo.go
      raw_material_repo.go
      consumable_repo.go
      batch_repo.go
      lot_repo.go
      webhook_repo.go
    service/
      auth_service.go
      user_service.go
      customer_service.go
      vendor_service.go
      sku_service.go
      raw_material_service.go
      consumable_service.go
      batch_service.go           # Batch number generation, blend workflow
      lot_service.go             # Step state machine, scrap validation
      webhook_service.go         # Dispatcher + delivery logging
    handler/
      auth_handler.go
      user_handler.go
      customer_handler.go
      vendor_handler.go
      sku_handler.go
      raw_material_handler.go
      consumable_handler.go
      batch_handler.go
      lot_handler.go
      webhook_handler.go
      report_handler.go
    middleware/
      auth.go                    # JWT extraction + validation
      rbac.go                    # Role-based route guard
      logger.go                  # Request logging
    router/
      router.go                  # Route registration, middleware binding
    webhook/
      dispatcher.go              # Async webhook delivery engine
      events.go                  # Event type constants + payload structs
  responses/
    responses.go                 # (exists)
  docs/
    DESIGN.md                    # This file
```

## 3.2 Ordered Implementation Steps (COMPLETE)

### Phase 1: Foundation (COMPLETE)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 1 | Migration 005 | `migrations/005_schema_enhancements.sql` | Schema improvements |
| 2 | Models | `internal/models/*.go` | All struct definitions with JSON/DB tags |
| 3 | Auth middleware | `internal/middleware/auth.go` | JWT parsing, context injection |
| 4 | RBAC middleware | `internal/middleware/rbac.go` | Role checking with permission map |
| 5 | Logger middleware | `internal/middleware/logger.go` | Request/response logging |
| 6 | Auth service + handler | `internal/service/auth_service.go`, `internal/handler/auth_handler.go` | Login, password change |
| 7 | User CRUD | `internal/repository/user_repo.go`, `internal/service/user_service.go`, `internal/handler/user_handler.go` | Admin user management |
| 8 | Router setup | `internal/router/router.go` | Wire middleware + routes |
| 9 | Main entry point | `cmd/server/main.go` | Boot server with DI |

**Review checkpoint:** Run `review-pipeline` agent. `db-architect` reviews migration 005. `code-reviewer` reviews all code. `perf-safety-reviewer` reviews auth/middleware.

### Phase 2: Master Data (COMPLETE)

| # | Task | Files |
|---|------|-------|
| 10 | Customer CRUD | repo, service, handler |
| 11 | Vendor CRUD | repo, service, handler |
| 12 | SKU CRUD + bill of materials | repo, service, handler |
| 13 | Raw Material CRUD + stock adjust | repo, service, handler |
| 14 | Consumable CRUD + stock adjust | repo, service, handler |

**Review checkpoint:** Run `review-pipeline`. Focus: SQL injection, prepared statements, pagination.

### Phase 3: Production Core (COMPLETE)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 15 | Batch number generation | `internal/service/batch_service.go` | Atomic sequence logic |
| 16 | Batch creation + blend workflow | repo, service, handler | Create -> blend -> complete |
| 17 | Lot splitting | service, handler | Validate qty, generate lot numbers |
| 18 | Step state machine | `internal/service/lot_service.go` | Transition validation |
| 19 | Step start/complete/skip | repo, service, handler | Full workflow |
| 20 | Scrap recording | repo, service, handler | Type validation per step |
| 21 | Consumable usage recording | repo, service, handler | Linked to lot_steps |

**Review checkpoint:** Run `review-pipeline`. Critical review by `perf-safety-reviewer` for race conditions in batch number generation and step transitions. `db-architect` reviews all production queries.

### Phase 4: Webhooks (COMPLETE)

| # | Task | Files |
|---|------|-------|
| 22 | Webhook CRUD | repo, service, handler |
| 23 | Webhook dispatcher | `internal/webhook/dispatcher.go`, `events.go` |
| 24 | Integrate webhooks into batch/lot services | Modify batch_service, lot_service |
| 25 | Webhook delivery logging | Part of dispatcher |

**Review checkpoint:** `perf-safety-reviewer` for goroutine leaks, `code-reviewer` for error handling.

### Phase 5: Reports and Polish (COMPLETE)

| # | Task | Files |
|---|------|-------|
| 26 | Report endpoints | `internal/handler/report_handler.go` |
| 27 | Production summary query | `internal/repository/report_repo.go` |
| 28 | Scrap summary query | Same repo |
| 29 | Material usage query | Same repo |

### Phase 6: Testing (COMPLETE)

| # | Task | Notes |
|---|------|-------|
| 30 | Unit tests for services | Step state machine, batch number generation, scrap validation |
| 31 | Integration tests for handlers | Full request/response testing |
| 32 | Run `api-regression-tester` agent | End-to-end flow: create batch -> blend -> split -> step through -> complete |

## 3.3 Agent Review Assignments

| Agent | When to Invoke | What to Check |
|-------|---------------|---------------|
| `db-architect` | After migrations, after any repo code | Prepared statements, index usage, query efficiency, N+1 patterns |
| `code-reviewer` | After every implementation phase | Code guidelines, error handling, dead code, naming consistency |
| `perf-safety-reviewer` | After batch number gen, step transitions, webhook dispatcher | Race conditions in concurrent batch creation, goroutine lifecycle in webhook dispatcher, state machine atomicity |
| `observability-reviewer` | After middleware and error handling | Logging of sensitive data, log levels, structured logging |
| `doc-guider` | After all handlers are written | API documentation completeness |
| `api-regression-tester` | After Phase 5 | Full end-to-end production flow |

## 3.4 What to Build First vs What Can Wait

### Build First (MVP)
- Auth + RBAC (gates everything)
- Batch creation + number generation (core domain)
- Lot splitting + step state machine (core domain)
- Scrap recording (key business requirement)
- Master data CRUD (needed for FK references)

### Can Wait
- Webhook system (nice-to-have for v1, UI team not ready yet)
- Report endpoints (can query DB directly initially)
- Consumable stock tracking (can be manual initially)
- `last_login_at` tracking (cosmetic)
- Webhook delivery logging (only after webhooks are built)

---

## APPENDIX A: Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | MySQL | Already chosen; team familiarity |
| ORM | sqlx (raw SQL) | Already chosen; full query control, no magic |
| Auth | JWT in header | Stateless, simple, already in go.mod |
| RBAC | Middleware with role claim | Simple predefined roles, no need for permission tables |
| Batch number atomicity | `INSERT ON DUPLICATE KEY UPDATE` | MySQL-native, no distributed locks needed for single-server |
| Webhook delivery | Goroutine per event, buffered channel | Simple, sufficient for expected volume (<100 events/day) |
| Step state machine | Service-layer enforcement | Business logic, not DB constraint; easier to evolve |
| Soft deletes | `is_active` flag | Already established pattern in existing migrations |
| Pagination | Offset-based (`?page=&per_page=`) | Simpler than cursor-based; data volume is low |
