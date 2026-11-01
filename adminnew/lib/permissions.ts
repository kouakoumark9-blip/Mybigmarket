import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/db";
import { effectiveEmployeeStatus } from "@/lib/employee-status";
import { permissions, employees, rolePermissions } from "@/lib/db/schema";

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
  if (!permissionCode) return { session: session!, employeeId, permissions: session!.user.permissions };
  const [permission] = await db.select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(and(eq(rolePermissions.roleId, employee.roleId), eq(permissions.code, permissionCode)))
    .limit(1);
  if (!permission) redirect("/forbidden");
  return { session: session!, employeeId, permissions: session!.user.permissions };
}
