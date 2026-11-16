import type { Role } from './types'

export type Permission =
  | 'lotissements:read' | 'lotissements:write'
  | 'lots:read' | 'lots:write'
  | 'clients:read' | 'clients:write'
  | 'utilisateurs:manage'
  | 'audit:read'

const READ: Permission[] = ['lotissements:read', 'lots:read', 'clients:read']

export const PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    ...READ, 'lotissements:write', 'lots:write', 'clients:write',
    'utilisateurs:manage', 'audit:read',
  ],
  commercial: [...READ, 'clients:write'],
  caissier: [...READ],
  foncier: [...READ],
}

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission)
}
