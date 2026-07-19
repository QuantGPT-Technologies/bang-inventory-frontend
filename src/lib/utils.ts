import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatQty(qty?: number, unit?: string): string {
  if (qty == null) return '—';
  const formatted = qty.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return unit ? `${formatted} ${unit}` : formatted;
}

/** Skippable per UI_GUIDE.md section 5: compaction and batching cannot be skipped. */
export const SKIPPABLE_STEPS: Record<string, boolean> = {
  sintering: true,
  marking: true,
  barreling: true,
  sizing: true,
};

export const STEP_LABELS: Record<string, string> = {
  compaction: 'Compaction',
  sintering: 'Sintering',
  marking: 'Marking',
  barreling: 'Barreling',
  sizing: 'Sizing',
  batching: 'Batching',
};

export const STEP_SCRAP_TYPES: Record<string, string[]> = {
  compaction: ['handling', 'setting', 'visual'],
  sintering: ['testing'],
  marking: ['setting'],
  sizing: ['testing', 'dimension_rejection'],
};

/**
 * Human-readable label for a workflow node's `node_key`. The lot detail page's `steps` array
 * (GET /lots/:id) is now backed by WorkflowNodeInstance rows, which only carry `node_key` — the
 * template's node.name is not denormalized onto the runtime instance, so there is no display
 * name to read for custom workflow templates. Falls back to STEP_LABELS for the legacy fixed
 * step names (compaction/sintering/marking/barreling/sizing/batching) so those keep their
 * familiar labels; any other node_key (from a user-authored template, e.g. "step1"/"qc1") is
 * humanized instead (snake/kebab-case -> Title Case).
 */
export function getNodeLabel(nodeKey: string): string {
  if (STEP_LABELS[nodeKey]) return STEP_LABELS[nodeKey];
  return nodeKey
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const BATCH_STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  blending: 'Blending',
  blended: 'Blended',
  completed: 'Completed',
};

export const LOT_STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  in_progress: 'In Progress',
  completed: 'Completed',
};

/** Covers both LotStep.status and WorkflowNodeInstance/LotWorkflowGraph node status. */
export const STEP_STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  engineer: 'Engineer',
  production: 'Production',
};

export interface ApiErrorInfo {
  status?: number;
  message: string;
  isNetworkError: boolean;
  isValidationError: boolean;
  isAuthError: boolean;
  isForbidden: boolean;
  isNotFound: boolean;
  isConflict: boolean;
  isServerError: boolean;
  fieldErrors?: Record<string, string>;
}

/** Classify an axios/unknown error into a structured, UI-friendly shape. */
export function parseApiError(err: unknown): ApiErrorInfo {
  if (err && typeof err === 'object' && 'isAxiosError' in err) {
    const axErr = err as {
      response?: {
        status?: number;
        data?: { error?: string; message?: string; errors?: Record<string, string> };
      };
      request?: unknown;
      message?: string;
      code?: string;
    };

    if (!axErr.response) {
      const timedOut = axErr.code === 'ECONNABORTED';
      return {
        message: timedOut
          ? 'The request timed out. Please check your connection and try again.'
          : 'Unable to reach the server. Please check your connection and try again.',
        isNetworkError: true,
        isValidationError: false,
        isAuthError: false,
        isForbidden: false,
        isNotFound: false,
        isConflict: false,
        isServerError: false,
      };
    }

    const status = axErr.response.status;
    const data = axErr.response.data;
    const message = data?.error || data?.message || defaultMessageForStatus(status);

    return {
      status,
      message,
      isNetworkError: false,
      isValidationError: status === 422 || status === 400,
      isAuthError: status === 401,
      isForbidden: status === 403,
      isNotFound: status === 404,
      isConflict: status === 409,
      isServerError: (status ?? 0) >= 500,
      fieldErrors: data?.errors,
    };
  }

  if (err instanceof Error) {
    return {
      message: err.message || 'An unexpected error occurred',
      isNetworkError: false,
      isValidationError: false,
      isAuthError: false,
      isForbidden: false,
      isNotFound: false,
      isConflict: false,
      isServerError: false,
    };
  }

  return {
    message: 'An unexpected error occurred',
    isNetworkError: false,
    isValidationError: false,
    isAuthError: false,
    isForbidden: false,
    isNotFound: false,
    isConflict: false,
    isServerError: false,
  };
}

function defaultMessageForStatus(status?: number): string {
  switch (status) {
    case 400:
      return 'The request was invalid. Please check the form and try again.';
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return "You don't have permission to perform this action.";
    case 404:
      return 'The requested resource could not be found.';
    case 409:
      return 'This action conflicts with the current state. Please refresh and try again.';
    case 422:
      return 'Some fields are invalid. Please review and try again.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    default:
      if (status && status >= 500) return 'A server error occurred. Please try again shortly.';
      return 'An error occurred';
  }
}

export function getErrorMessage(err: unknown): string {
  return parseApiError(err).message;
}
