"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import { adminEmployees, employeeAuditLogs, roles } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

const statusSchema = z.object({ id: z.string().uuid(), status: z.enum(["active", "locked"]) });

export async function setEmployeeStatusAction(formData: FormData) {
  const { employeeId: actorId } = await requireEmployee("employees.manage");
  const parsed = statusSchema.safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) redirect("/employes?notice=invalid");
  if (parsed.data.id === actorId) redirect("/employes?notice=self");
  const db = getAdminDb();
  const [target] = await db.select({ id: adminEmployees.id, status: adminEmployees.status, roleCode: roles.code }).from(adminEmployees)
    .innerJoin(roles, eq(adminEmployees.roleId, roles.id)).where(eq(adminEmployees.id, parsed.data.id)).limit(1);
  if (!target) redirect("/employes?notice=missing");
  if (target.status === parsed.data.status) redirect("/employes?notice=unchanged");
  if (parsed.data.status === "locked" && target.roleCode === "super_admin") {
    const [activeAdmins] = await db.select({ value: count() }).from(adminEmployees).innerJoin(roles, eq(adminEmployees.roleId, roles.id))
      .where(and(eq(adminEmployees.status, "active"), eq(roles.code, "super_admin")));
    if (Number(activeAdmins?.value || 0) <= 1) redirect("/employes?notice=last-admin");
  }
  try {
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(adminEmployees).set({ status: parsed.data.status, lockedUntil: null, failedLoginCount: 0 })
        .where(and(eq(adminEmployees.id, parsed.data.id), eq(adminEmployees.status, target.status))).returning({ id: adminEmployees.id });
      if (!updated) throw new Error("Stale employee status");
      await tx.insert(employeeAuditLogs).values({ actorEmployeeId: actorId, action: parsed.data.status === "locked" ? "employee.locked" : "employee.unlocked", entityType: "employee", entityId: target.id, details: { from: target.status, to: parsed.data.status } });
    });
  } catch {
    redirect("/employes?notice=error");
  }
  revalidatePath("/employes");
  redirect("/employes?notice=updated");
}
