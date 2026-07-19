import { z } from 'zod';

// --- Shared primitives ---

/** Units that count discrete items and so must be recorded as whole numbers. Mirrors constants.IntegerUnits on the backend. */
export const INTEGER_UNITS = new Set(['pcs']);

function qtySchema(sign: 'gt0' | 'gte0', unit?: string) {
  let schema = z
    .number({ error: 'Quantity is required' })
    .refine((v) => Number.isFinite(v), { message: 'Enter a valid number' });
  schema = sign === 'gt0'
    ? schema.refine((v) => v > 0, { message: 'Must be greater than 0' })
    : schema.refine((v) => v >= 0, { message: 'Cannot be negative' });
  if (unit && INTEGER_UNITS.has(unit)) {
    return schema.refine((v) => Number.isInteger(v), { message: 'Enter a whole number -- this unit is counted in whole pieces, not fractions' });
  }
  return schema.refine((v) => Math.round(v * 1000) === v * 1000, { message: 'Max 3 decimal places' });
}

/** Positive quantity: finite number > 0, matches DECIMAL(*, 3) style backend fields. */
export const positiveQty = qtySchema('gt0');

/** Non-negative quantity (0 is allowed, e.g. spillage/output can legitimately be 0). */
export const nonNegativeQty = qtySchema('gte0');

/** Same as positiveQty, but whole-number-only when unit counts discrete items (e.g. "pcs"). */
export const positiveQtyForUnit = (unit?: string) => qtySchema('gt0', unit);

/** Same as nonNegativeQty, but whole-number-only when unit counts discrete items (e.g. "pcs"). */
export const nonNegativeQtyForUnit = (unit?: string) => qtySchema('gte0', unit);

export const positiveId = z
  .number({ error: 'This field is required' })
  .int('Invalid selection')
  .positive('This field is required');

export const requiredText = (label: string, max = 255) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

export const optionalText = (max = 500) =>
  z.string().trim().max(max, `Must be ${max} characters or fewer`).optional().or(z.literal(''));

export const email = z.string().trim().toLowerCase().email('Enter a valid email address');
export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address')
  .optional()
  .or(z.literal(''));

// --- Helper: parse a raw string form field into a number, or undefined if blank ---
export function toNumber(raw: string): number | undefined {
  if (raw === '' || raw == null) return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

// --- Auth ---

export const loginSchema = z.object({
  email: requiredText('Email', 255).pipe(z.string().email('Enter a valid email address')),
  password: requiredText('Password', 255),
});

export const changePasswordSchema = z
  .object({
    old_password: requiredText('Current password'),
    new_password: requiredText('New password', 100).pipe(z.string().min(6, 'New password must be at least 6 characters')),
    confirm_password: requiredText('Confirm password'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })
  .refine((d) => d.new_password !== d.old_password, {
    message: 'New password must be different from current password',
    path: ['new_password'],
  });

// --- Users ---

export const ROLES = ['admin', 'manager', 'engineer', 'production'] as const;

export const createUserSchema = z.object({
  name: requiredText('Name', 100),
  email: requiredText('Email', 255).pipe(z.string().email('Enter a valid email address')),
  password: requiredText('Password', 100).pipe(z.string().min(6, 'Password must be at least 6 characters')),
  role: z.enum(ROLES, { error: 'Select a role' }),
});

// --- Customers / Vendors ---

export const customerSchema = z.object({
  code: optionalText(50),
  name: requiredText('Name', 150),
  contact_person: optionalText(150),
  email: optionalEmail,
  phone: optionalText(30),
  address: optionalText(500),
});

export const vendorSchema = z.object({
  code: optionalText(50),
  name: requiredText('Name', 150),
  contact_person: optionalText(150),
  email: optionalEmail,
  phone: optionalText(30),
});

// --- SKUs ---

export const skuMaterialRowSchema = z.object({
  raw_material_id: positiveId,
  ratio_percent: z
    .number({ error: 'Ratio is required' })
    .refine((v) => Number.isFinite(v), 'Enter a valid number')
    .gt(0, 'Must be greater than 0')
    .lte(100, 'Cannot exceed 100%'),
});

export const skuSchema = z
  .object({
    code: requiredText('Code', 50),
    name: requiredText('Name', 150),
    description: optionalText(1000),
    customer_id: z.number().int().positive().optional(),
    unit: requiredText('Unit', 20),
    materials: z.array(skuMaterialRowSchema),
  })
  .superRefine((d, ctx) => {
    const ids = d.materials.map((m) => m.raw_material_id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Each raw material can only be listed once',
        path: ['materials'],
      });
    }
    if (d.materials.length > 0) {
      const total = d.materials.reduce((s, m) => s + m.ratio_percent, 0);
      if (Math.abs(total - 100) > 0.01) {
        ctx.addIssue({
          code: 'custom',
          message: `Material ratios must total 100% (currently ${total.toFixed(1)}%)`,
          path: ['materials'],
        });
      }
    }
  });

// --- Raw Materials / Consumables ---

export const rawMaterialSchema = z.object({
  name: requiredText('Name', 150),
  code: optionalText(50),
  vendor_id: z.number().int().positive().optional(),
  unit: requiredText('Unit', 20),
});

export const consumableSchema = z.object({
  name: requiredText('Name', 150),
  code: optionalText(50),
  unit: requiredText('Unit', 20),
});

/**
 * POST /raw-materials/:id/stock and /consumables/:id/stock take { quantity, reason }:
 * positive quantity = receive stock, negative = consume stock. Not an add/remove/set toggle.
 */
export const stockAdjustSchema = z
  .object({
    direction: z.enum(['receive', 'consume'], { error: 'Select a direction' }),
    quantity: z
      .number({ error: 'Quantity is required' })
      .refine((v) => Number.isFinite(v), 'Enter a valid number')
      .gt(0, 'Must be greater than 0'),
    currentStock: z.number(),
    reason: requiredText('Reason', 500),
  })
  .superRefine((d, ctx) => {
    if (d.direction === 'consume' && d.quantity > d.currentStock) {
      ctx.addIssue({
        code: 'custom',
        message: `Cannot consume more than current stock (${d.currentStock})`,
        path: ['quantity'],
      });
    }
  });

// --- Batches ---

export const batchMaterialRowSchema = z.object({
  raw_material_id: positiveId,
  planned_qty: positiveQty,
});

export const createBatchSchema = z
  .object({
    total_blend_qty: positiveQty,
    unit: requiredText('Unit', 20),
    materials: z.array(batchMaterialRowSchema).min(1, 'Add at least one raw material'),
    notes: optionalText(1000),
  })
  .superRefine((d, ctx) => {
    const ids = d.materials.map((m) => m.raw_material_id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length > 0) {
      ctx.addIssue({ code: 'custom', message: 'Each raw material can only be listed once', path: ['materials'] });
    }
  });

// POST /batches/:id/blend takes no body -- it only transitions status to "blending".

const actualMaterialRowSchema = z.object({
  raw_material_id: positiveId,
  actual_qty: nonNegativeQty,
});

const batchScrapRowSchema = z.object({
  scrap_type: z.literal('spillage'),
  quantity: positiveQty,
  unit: optionalText(20),
  notes: optionalText(1000),
});

export const completeBlendSchema = z.object({
  actual_materials: z.array(actualMaterialRowSchema),
  scrap: z.array(batchScrapRowSchema),
});

export const lotSplitRowSchema = z.object({
  sku_id: positiveId,
  quantity: positiveQty,
});

export function splitLotsSchema(batchRemainingQty: number) {
  return z
    .object({
      lots: z.array(lotSplitRowSchema).min(1, 'Add at least one lot'),
    })
    .superRefine((d, ctx) => {
      const total = d.lots.reduce((s, l) => s + l.quantity, 0);
      if (Math.abs(total - batchRemainingQty) > 0.001) {
        ctx.addIssue({
          code: 'custom',
          message: `Lot quantities must sum to ${batchRemainingQty.toFixed(3)} (currently ${total.toFixed(3)})`,
          path: ['lots'],
        });
      }
    });
}

// --- Lot steps ---

export const startStepSchema = z.object({
  machine_name: optionalText(100),
});

/**
 * Output-vs-input qty comparison only makes sense when input and output share a unit
 * (e.g. kg -> kg). Steps like compaction convert kg of powder into a pcs count, where
 * the raw numbers are unrelated, so the check must be skipped in that case.
 */
export function completeStepSchema(inputUnit?: string, outputUnit?: string) {
  const base = z.object({
    actual_input_qty: positiveQtyForUnit(inputUnit),
    actual_output_qty: nonNegativeQtyForUnit(outputUnit),
    machine_name: optionalText(100),
    notes: optionalText(1000),
  });
  if (!inputUnit || !outputUnit || inputUnit !== outputUnit) return base;
  return base.refine((d) => d.actual_output_qty <= d.actual_input_qty, {
    message: 'Output cannot exceed input',
    path: ['actual_output_qty'],
  });
}

/**
 * PUT /lots/:id/steps/:step — manual override of a completed step's recorded qty/notes.
 * `notes` doubles as the mandatory reason for the change, for audit/reconciliation purposes.
 */
export function overrideStepSchema(inputUnit?: string, outputUnit?: string) {
  const base = z.object({
    actual_input_qty: positiveQtyForUnit(inputUnit).optional(),
    actual_output_qty: nonNegativeQtyForUnit(outputUnit).optional(),
    notes: z
      .string({ error: 'Reason is required' })
      .trim()
      .min(3, 'Reason must be at least 3 characters')
      .max(1000, 'Reason must be 1000 characters or fewer'),
  });
  if (!inputUnit || !outputUnit || inputUnit !== outputUnit) return base;
  return base.refine((d) => d.actual_input_qty == null || d.actual_output_qty == null || d.actual_output_qty <= d.actual_input_qty, {
    message: 'Output cannot exceed input',
    path: ['actual_output_qty'],
  });
}

// allowedTypes comes from the workflow node's own config.allowed_scrap_types (the caller
// resolves the STEP_SCRAP_TYPES legacy fallback before calling this, if applicable) -- this
// function has no way to look up a node's config itself, only what it's handed.
export function scrapSchema(allowedTypes: string[], unit?: string) {
  return z.object({
    scrap_type: z.string().refine((v) => allowedTypes.includes(v), {
      message: allowedTypes.length ? `Must be one of: ${allowedTypes.join(', ')}` : 'This step does not allow scrap entries',
    }),
    quantity: positiveQtyForUnit(unit),
    unit: optionalText(20),
    notes: optionalText(1000),
  });
}

export const consumableUsageSchema = z.object({
  consumable_id: positiveId,
  quantity: positiveQty,
  unit: requiredText('Unit', 20),
});

// --- Webhooks ---

export const webhookSchema = z.object({
  name: requiredText('Name', 150),
  url: requiredText('URL', 500).pipe(
    z.string().refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Enter a valid http(s) URL')
  ),
  secret: optionalText(255),
  events: z.array(z.string()).min(1, 'Select at least one event'),
  is_active: z.boolean(),
});

// --- Workflow templates ---

/**
 * name/description limits mirror the backend DTO (models.CreateWorkflowTemplateRequest):
 * `binding:"required,max=150"` / `binding:"omitempty,max=2000"`.
 */
export const workflowTemplateMetaSchema = z.object({
  name: requiredText('Name', 150),
  description: optionalText(2000),
  entity_type: z.enum(['lot', 'batch']).optional(),
});

export const WORKFLOW_NODE_TYPES = ['production_step', 'approval', 'quality_check', 'conditional_branch', 'lot_fanout'] as const;

export const productionStepConfigSchema = z.object({
  input_unit: requiredText('Input unit', 20),
  output_unit: requiredText('Output unit', 20),
  skippable: z.boolean(),
  credits_sku_stock_on_complete: z.boolean(),
  allowed_scrap_types: z.array(z.string().trim().min(1)),
  default_scrap_unit: optionalText(20),
});

export const approvalConfigSchema = z.object({
  required_role: z.enum(ROLES, { error: 'Select a role' }),
});

const measurementFieldSchema = z.object({
  key: requiredText('Key', 100),
  label: requiredText('Label', 150),
  type: z.enum(['number', 'text'], { error: 'Select a type' }),
  required: z.boolean(),
});

export const qualityCheckConfigSchema = z.object({
  measurement_fields: z.array(measurementFieldSchema).min(1, 'Add at least one measurement field'),
});

export const conditionalBranchConfigSchema = z.object({
  source_field: z
    .string({ error: 'Source field is required' })
    .trim()
    .min(1, 'Source field is required')
    .refine(
      (v) => v === 'outcome' || v === 'actual_output_qty' || v.startsWith('data.'),
      "Must be 'outcome', 'actual_output_qty', or a 'data.<field>' path"
    ),
  operator: z.enum(['equals', 'gte', 'lte', 'gt', 'lt'], { error: 'Select an operator' }),
  threshold: z.number().refine((v) => Number.isFinite(v), 'Enter a valid number').optional(),
});

// --- Lot node decisions ---

/**
 * POST /lots/:id/nodes/:nodeKey/approve — backend requires `reason` (min 3 non-whitespace chars)
 * only when decision === 'rejected'; the binding tag alone can't express that, so it's enforced
 * here, mirroring overrideStepSchema's mandatory-reason pattern.
 */
export const decideApprovalSchema = z
  .object({
    decision: z.enum(['approved', 'rejected'], { error: 'Select a decision' }),
    reason: z.string().trim().max(1000, 'Reason must be 1000 characters or fewer').optional(),
  })
  .refine((d) => d.decision !== 'rejected' || (d.reason?.trim().length ?? 0) >= 3, {
    message: 'Reason must be at least 3 characters when rejecting',
    path: ['reason'],
  });

export const qualityResultSchema = z.object({
  result: z.enum(['pass', 'fail'], { error: 'Select a result' }),
  measurements: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  notes: optionalText(1000),
});

// --- Generic helpers for wiring zod into plain useState forms ---

export type FieldErrors = Record<string, string>;

/** Flatten a ZodError into a { path: message } map keyed by top-level (dot-joined) path. */
export function flattenZodError(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_root';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Run a schema; return { data } on success or { errors } keyed by field path on failure. */
export function validate<T>(
  schema: z.ZodType<T>,
  value: unknown
): { success: true; data: T } | { success: false; errors: FieldErrors } {
  const result = schema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: flattenZodError(result.error) };
}
