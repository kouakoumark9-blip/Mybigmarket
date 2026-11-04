import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/db";
import { effectiveEmployeeStatus } from "@/lib/employee-status";
import { permissions, employees, rolePermissions } from "@/lib/db/schema";
import { can, isPermissionCode } from "@/lib/permission-matrix";

export async function requireEmployee(permissionCode?: string) {
  const session = await auth();
  const employeeId = session?.user?.id;
  if (!employeeId) redirect("/login");
  const db = getAdminDb();
  const now = new Date();
  const [employee] = await db.select({ id: employees.id, roleId: employees.roleId, status: employees.status, lockedUntil: employees.lockedUntil, passwordChangedAt: employees.passwordChangedAt })
    .from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee || effectiveEmployeeStatus(employee.status, employee.lockedUntil, now) !== "active" || session.user.passwordChangedAt !== employee.passwordChangedAt.toISOString()) redirect("/login?reason=session-invalid");
  await db.update(employees).set({ lastActivityAt: now }).where(eq(employees.id, employeeId));
  const context = { session: session!, employeeId, permissions: session!.user.permissions, passwordChangedAt: employee.passwordChangedAt };
  if (!permissionCode) return context;
  const granted = await db.select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, employee.roleId));
  if (!hasAccess(granted.map((row) => row.code), permissionCode)) redirect("/forbidden");
  return context;
}

/**
 * Même règle que l'API : `ressource.manage` accorde toutes les actions de la ressource, et toute
 * action d'écriture accorde la lecture. Un code inconnu de la matrice exige une correspondance exacte.
 */
export function hasAccess(granted: readonly string[], permissionCode: string): boolean {
  return isPermissionCode(permissionCode) ? can(granted, permissionCode) : granted.includes(permissionCode);
}
