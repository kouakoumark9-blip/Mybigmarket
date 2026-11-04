/**
 * Synchronisation idempotente de la matrice de permissions et des rôles système.
 *
 * - Ajoute en base les permissions de la matrice qui manquent.
 * - Crée les rôles système absents (Gestionnaire, Lecture seule…) avec leur profil.
 * - Pour un rôle système existant, n'accorde que les permissions *nouvellement créées*
 *   prévues par son profil : les retraits faits par un administrateur sont respectés.
 */
import { inArray } from "drizzle-orm";
import { adminPermissions, adminRoles, rolePermissions } from "@/lib/db/schema";
import type { Db } from "@/server/core/db";
import { ALL_PERMISSIONS, ROLE_PROFILES, profilePermissions } from "@/server/core/permissions";

let synced: Promise<void> | null = null;

export function resetPermissionCatalogSync() {
  synced = null;
}

export async function syncPermissionCatalog(database: Db): Promise<{ newPermissions: string[]; newRoles: string[] }> {
  const insertedPermissions = await database.insert(adminPermissions)
    .values(ALL_PERMISSIONS.map((entry) => ({ code: entry.code, label: entry.label, resource: entry.resource, action: entry.action })))
    .onConflictDoNothing().returning({ code: adminPermissions.code });
  const insertedRoles = await database.insert(adminRoles)
    .values(Object.entries(ROLE_PROFILES).map(([code, profile]) => ({ code, name: profile.name, description: profile.description, isSystem: true })))
    .onConflictDoNothing().returning({ code: adminRoles.code });

  const newPermissions = new Set(insertedPermissions.map((row) => row.code));
  const newRoles = new Set(insertedRoles.map((row) => row.code));
  if (newPermissions.size || newRoles.size) {
    const roleRows = await database.select({ id: adminRoles.id, code: adminRoles.code }).from(adminRoles).where(inArray(adminRoles.code, Object.keys(ROLE_PROFILES)));
    const permissionRows = await database.select({ id: adminPermissions.id, code: adminPermissions.code }).from(adminPermissions);
    const permissionIds = new Map(permissionRows.map((row) => [row.code, row.id]));
    const links: Array<{ roleId: string; permissionId: string }> = [];
    for (const role of roleRows) {
      const codes = profilePermissions(role.code).filter((code) => newRoles.has(role.code) || newPermissions.has(code));
      for (const code of codes) {
        const permissionId = permissionIds.get(code);
        if (permissionId) links.push({ roleId: role.id, permissionId });
      }
    }
    for (let index = 0; index < links.length; index += 500) await database.insert(rolePermissions).values(links.slice(index, index + 500)).onConflictDoNothing();
  }
  return { newPermissions: [...newPermissions], newRoles: [...newRoles] };
}

/** Une seule synchronisation par instance (appelée au premier appel de l'API d'administration). */
export function ensurePermissionCatalog(database: Db): Promise<void> {
  synced ??= syncPermissionCatalog(database).then(() => undefined).catch((error) => {
    synced = null;
    throw error;
  });
  return synced;
}
