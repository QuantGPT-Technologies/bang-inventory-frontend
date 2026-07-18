import { User } from './types';

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try { return JSON.parse(raw) as User; } catch { return null; }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function storeAuth(token: string, user: User) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function hasRole(user: User | null, ...roles: string[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

/**
 * Route -> required (resource, action) for page-level access.
 * Checked against canAccess() on every protected page via AppShell/RouteGuard,
 * not just for hiding buttons -- prevents direct-URL navigation by an
 * unauthorized role from reaching a page whose actions they can't perform.
 */
export const ROUTE_PERMISSIONS: { prefix: string; resource: string; action: string }[] = [
  { prefix: '/users', resource: 'users', action: 'crud' },
  { prefix: '/webhooks', resource: 'webhooks', action: 'crud' },
  { prefix: '/reports', resource: 'reports', action: 'view' },
  { prefix: '/customers', resource: 'customers', action: 'read' },
  { prefix: '/vendors', resource: 'vendors', action: 'read' },
  { prefix: '/skus', resource: 'skus', action: 'read' },
  { prefix: '/raw-materials', resource: 'raw_materials', action: 'read' },
  { prefix: '/consumables', resource: 'consumables', action: 'read' },
  { prefix: '/batches', resource: 'batches', action: 'read' },
  { prefix: '/lots', resource: 'lots', action: 'read' },
];

export function routePermission(pathname: string) {
  return ROUTE_PERMISSIONS.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'));
}

export function canAccessRoute(user: User | null, pathname: string): boolean {
  const perm = routePermission(pathname);
  if (!perm) return true; // unlisted routes (dashboard, etc.) are open to any authenticated user
  return canAccess(user, perm.resource, perm.action);
}

export function canAccess(user: User | null, resource: string, action: string): boolean {
  if (!user) return false;
  const role = user.role;

  const permissions: Record<string, Record<string, string[]>> = {
    users: { crud: ['admin'] },
    customers: { read: ['admin', 'manager', 'engineer'], write: ['admin', 'manager'] },
    vendors: { read: ['admin', 'manager', 'engineer'], write: ['admin', 'manager'] },
    skus: { read: ['admin', 'manager', 'engineer'], write: ['admin', 'manager', 'engineer'] },
    raw_materials: {
      read: ['admin', 'manager', 'engineer'],
      write: ['admin', 'manager'],
      stock: ['admin', 'manager'],
    },
    consumables: {
      read: ['admin', 'manager', 'engineer'],
      write: ['admin', 'manager'],
      stock: ['admin', 'manager'],
    },
    batches: {
      read: ['admin', 'manager', 'engineer', 'production'],
      create: ['admin', 'manager', 'production'],
      update: ['admin', 'manager'],
      blend: ['admin', 'production'],
      split: ['admin', 'manager'],
    },
    lots: {
      read: ['admin', 'manager', 'engineer', 'production'],
      step: ['admin', 'production'],
      skip: ['admin', 'manager'],
      override: ['admin', 'manager'],
      analytics: ['admin', 'manager', 'engineer', 'production'],
      scrap: ['admin', 'engineer', 'production'],
      consumable: ['admin', 'production'],
    },
    webhooks: { crud: ['admin'] },
    reports: { view: ['admin', 'manager', 'engineer'] },
  };

  return permissions[resource]?.[action]?.includes(role) ?? false;
}
