/**
 * Frontend permission map. It mirrors backend/app/auth.py so route guards and
 * the backend agree. The backend remains authoritative — these checks only
 * decide which screens to show, never whether an operation is allowed.
 */
export const ROLE_PERMISSIONS = {
  owner: ['*'],
  manager: [
    'dashboard.view', 'inventory.view', 'inventory.manage', 'purchases.view',
    'purchases.manage', 'suppliers.view', 'production.view', 'production.manage',
    'sales.view', 'sales.manage', 'expenses.view', 'expenses.manage', 'reports.basic',
  ],
  staff: [
    'dashboard.view', 'inventory.view', 'production.view', 'production.manage',
    'sales.view', 'sales.manage', 'expenses.view', 'expenses.manage', 'reports.basic',
  ],
}

export function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[role] || []
  return permissions.includes('*') || permissions.includes(permission)
}
