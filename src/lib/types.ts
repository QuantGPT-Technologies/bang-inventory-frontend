export type Role = 'admin' | 'manager' | 'engineer' | 'production';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

export interface Customer {
  id: number;
  code?: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  is_active?: boolean;
  created_at: string;
}

export interface Vendor {
  id: number;
  code?: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  is_active?: boolean;
  created_at: string;
}

export interface SKUMaterial {
  raw_material_id: number;
  raw_material_name?: string;
  ratio_percent: number;
}

export interface SKU {
  id: number;
  code: string;
  name: string;
  description?: string;
  customer_id?: number;
  customer_name?: string;
  unit: string;
  is_active: boolean;
  materials?: SKUMaterial[];
  created_at: string;
}

export interface RawMaterial {
  id: number;
  name: string;
  code?: string;
  unit: string;
  stock_qty: number;
  vendor_id?: number;
  vendor_name?: string;
  created_at: string;
}

export interface Consumable {
  id: number;
  name: string;
  code?: string;
  unit: string;
  stock_qty: number;
  created_at: string;
}

export interface BatchMaterial {
  id?: number;
  raw_material_id: number;
  material_name?: string;
  planned_qty: number;
  actual_qty?: number | null;
  unit?: string;
}

export type BatchStatus = 'created' | 'blending' | 'blended' | 'completed';

export interface BatchScrap {
  id: number;
  scrap_type: string;
  quantity: number;
  unit: string;
  notes?: string | null;
  created_at: string;
}

export interface Batch {
  id: number;
  batch_number: string;
  year?: number;
  week?: number;
  day_of_week?: number;
  sequence?: number;
  total_blend_qty: number;
  unit: string;
  status: BatchStatus;
  notes?: string | null;
  materials?: BatchMaterial[];
  scrap?: BatchScrap[];
  lots?: Lot[];
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  updated_at?: string;
}

export const STEP_ORDER_LIST = ['compaction', 'sintering', 'marking', 'barreling', 'sizing', 'batching'] as const;
export type StepName = (typeof STEP_ORDER_LIST)[number];
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type LotStatus = 'created' | 'in_progress' | 'completed';

export interface ScrapEntry {
  id: number;
  scrap_type: string;
  quantity: number;
  unit: string;
  notes?: string;
  recorded_by_name?: string;
  created_at: string;
}

export interface StepVariance {
  input_diff: number;
  input_diff_pct: number;
  output_diff: number;
  output_diff_pct: number;
  yield_pct: number;
  total_scrap: number;
  scrap_unit: string;
}

export interface LotStep {
  id: number;
  lot_id?: number;
  step_name: StepName;
  step_sequence: number;
  status: StepStatus;
  machine_name?: string | null;
  skipped: boolean;
  expected_input_qty?: number | null;
  expected_output_qty?: number | null;
  actual_input_qty?: number | null;
  actual_output_qty?: number | null;
  input_unit?: string;
  output_unit?: string;
  operator_id?: number;
  operator_name?: string;
  notes?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  scrap_entries?: ScrapEntry[];
  variance?: StepVariance | null;
}

export interface Lot {
  id: number;
  lot_number: string;
  batch_id: number;
  batch_number?: string;
  sequence?: number;
  sku_id: number;
  sku_code?: string;
  sku_name?: string;
  quantity: number;
  unit?: string;
  status: LotStatus;
  current_step?: StepName;
  steps?: LotStep[];
  created_at: string;
  updated_at?: string;
}

export interface Webhook {
  id: number;
  name: string;
  url: string;
  secret?: string;
  events: string[];
  is_active: boolean;
  created_by?: number;
  created_at: string;
  deliveries?: WebhookDelivery[];
}

export interface WebhookDelivery {
  id: number;
  event_type: string;
  http_status?: number;
  attempt: number;
  delivered_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}
