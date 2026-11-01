"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import { adminSuppliers, employeeAuditLogs } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

const supplierSchema = z.object({
  companyName: z.string().trim().min(2).max(190),
  slug: z.string().trim().max(180).optional(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  city: z.string().trim().max(120).optional(),
});

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180);
}

export async function createSupplierAction(formData: FormData) {
  const { employeeId } = await requireEmployee("catalog.suppliers.manage");
  const parsed = supplierSchema.safeParse({
    companyName: formData.get("companyName"),
    slug: formData.get("slug") || undefined,
    countryCode: formData.get("countryCode"),
    city: formData.get("city") || undefined,
  });
  if (!parsed.success) redirect("/catalogue/fournisseurs?notice=invalid");
  const slug = slugify(parsed.data.slug || parsed.data.companyName);
  if (slug.length < 2) redirect("/catalogue/fournisseurs?notice=invalid");
  const db = getAdminDb();
  let createdId: string | undefined;
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx.insert(adminSuppliers).values({
        id: randomUUID(),
        companyName: parsed.data.companyName,
        slug,
        countryCode: parsed.data.countryCode,
        city: parsed.data.city || null,
        profileStatus: "unverified",
        isActive: true,
        createdAt: new Date(),
      }).onConflictDoNothing().returning({ id: adminSuppliers.id });
      if (!created) return;
      createdId = created.id;
      await tx.insert(employeeAuditLogs).values({ actorEmployeeId: employeeId, action: "supplier.created", entityType: "supplier", entityId: created.id, details: { companyName: parsed.data.companyName, countryCode: parsed.data.countryCode, profileStatus: "unverified" } });
    });
  } catch {
    redirect("/catalogue/fournisseurs?notice=error");
  }
  if (!createdId) redirect("/catalogue/fournisseurs?notice=exists");
  revalidatePath("/catalogue/fournisseurs");
  redirect("/catalogue/fournisseurs?notice=created");
}

export async function setSupplierActiveAction(formData: FormData) {
  const { employeeId } = await requireEmployee("catalog.suppliers.manage");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const isActive = formData.get("isActive") === "true";
  if (!id.success) redirect("/catalogue/fournisseurs?notice=error");
  try {
    await getAdminDb().transaction(async (tx) => {
      const [updated] = await tx.update(adminSuppliers).set({ isActive }).where(eq(adminSuppliers.id, id.data)).returning({ id: adminSuppliers.id });
      if (updated) await tx.insert(employeeAuditLogs).values({ actorEmployeeId: employeeId, action: isActive ? "supplier.activated" : "supplier.deactivated", entityType: "supplier", entityId: id.data, details: { isActive } });
    });
  } catch {
    redirect("/catalogue/fournisseurs?notice=error");
  }
  revalidatePath("/catalogue/fournisseurs");
  redirect("/catalogue/fournisseurs?notice=updated");
}
