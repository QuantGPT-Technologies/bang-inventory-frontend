import { ErrorState } from 'bang-inventory-ui';

const networkError = {
  message: 'Unable to reach the server. Check your connection and try again.',
  isNetworkError: true,
  isValidationError: false,
  isAuthError: false,
  isForbidden: false,
  isNotFound: false,
  isConflict: false,
};

const forbiddenError = {
  message: "You don't have permission to view this batch.",
  isNetworkError: false,
  isValidationError: false,
  isAuthError: false,
  isForbidden: true,
  isNotFound: false,
  isConflict: false,
};

export function NetworkError() {
  return <ErrorState error={networkError} onRetry={() => {}} />;
}

export function Forbidden() {
  return <ErrorState error={forbiddenError} />;
}
