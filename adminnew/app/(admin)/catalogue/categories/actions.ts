"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import { adminBrands, adminCategories, employeeAuditLogs } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.string().trim().regex(/^\d{1,4}$/).optional(),
});
const brandSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().max(120).optional(),
});

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

export async function createCategoryAction(formData: FormData) {
  const { employeeId } = await requireEmployee("catalog.categories.manage");
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    description: formData.get("description") || undefined,
    sortOrder: String(formData.get("sortOrder") || "0"),
  });
  if (!parsed.success) redirect("/catalogue/categories?notice=category-invalid");
  const slug = slugify(parsed.data.slug || parsed.data.name);
  if (slug.length < 2) redirect("/catalogue/categories?notice=category-invalid");
  const db = getAdminDb();
  let createdId: number | undefined;
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx.insert(adminCategories).values({
        name: parsed.data.name,
        slug,
        description: parsed.data.description || null,
        isActive: true,
        sortOrder: Number(parsed.data.sortOrder || 0),
      }).onConflictDoNothing().returning({ id: adminCategories.id });
      if (!created) return;
      createdId = created.id;
      await tx.insert(employeeAuditLogs).values({ actorEmployeeId: employeeId, action: "category.created", entityType: "category", entityId: String(created.id), details: { name: parsed.data.name, slug } });
    });
  } catch {
    redirect("/catalogue/categories?notice=category-error");
  }
  if (!createdId) redirect("/catalogue/categories?notice=category-exists");
  revalidatePath("/catalogue/categories");
  revalidatePath("/catalogue/produits");
  redirect("/catalogue/categories?notice=category-created");
}

export async function setCategoryActiveAction(formData: FormData) {
  const { employeeId } = await requireEmployee("catalog.categories.manage");
  const id = Number(formData.get("id"));
  const isActive = formData.get("isActive") === "true";
  if (!Number.isSafeInteger(id) || id < 1) redirect("/catalogue/categories?notice=category-error");
  const db = getAdminDb();
  try {
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(adminCategories).set({ isActive }).where(eq(adminCategories.id, id)).returning({ id: adminCategories.id });
      if (updated) await tx.insert(employeeAuditLogs).values({ actorEmployeeId: employeeId, action: isActive ? "category.activated" : "category.deactivated", entityType: "category", entityId: String(id), details: { isActive } });
    });
  } catch {
    redirect("/catalogue/categories?notice=category-error");
  }
  revalidatePath("/catalogue/categories");
  revalidatePath("/catalogue/produits");
  redirect("/catalogue/categories?notice=category-updated");
}

export async function createBrandAction(formData: FormData) {
  const { employeeId } = await requireEmployee("catalog.brands.manage");
  const parsed = brandSchema.safeParse({ name: formData.get("name"), slug: formData.get("slug") || undefined });
  if (!parsed.success) redirect("/catalogue/categories?notice=brand-invalid");
  const slug = slugify(parsed.data.slug || parsed.data.name);
  if (slug.length < 2) redirect("/catalogue/categories?notice=brand-invalid");
  const db = getAdminDb();
  let createdId: number | undefined;
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx.insert(adminBrands).values({ name: parsed.data.name, slug, isActive: true }).onConflictDoNothing().returning({ id: adminBrands.id });
      if (!created) return;
      createdId = created.id;
      await tx.insert(employeeAuditLogs).values({ actorEmployeeId: employeeId, action: "brand.created", entityType: "brand", entityId: String(created.id), details: { name: parsed.data.name, slug } });
    });
  } catch {
    redirect("/catalogue/categories?notice=brand-error");
  }
  if (!createdId) redirect("/catalogue/categories?notice=brand-exists");
  revalidatePath("/catalogue/categories");
  redirect("/catalogue/categories?notice=brand-created");
}

export async function setBrandActiveAction(formData: FormData) {
  const { employeeId } = await requireEmployee("catalog.brands.manage");
  const id = Number(formData.get("id"));
  const isActive = formData.get("isActive") === "true";
  if (!Number.isSafeInteger(id) || id < 1) redirect("/catalogue/categories?notice=brand-error");
  try {
    await getAdminDb().transaction(async (tx) => {
      const [updated] = await tx.update(adminBrands).set({ isActive }).where(eq(adminBrands.id, id)).returning({ id: adminBrands.id });
      if (updated) await tx.insert(employeeAuditLogs).values({ actorEmployeeId: employeeId, action: isActive ? "brand.activated" : "brand.deactivated", entityType: "brand", entityId: String(id), details: { isActive } });
    });
  } catch {
    redirect("/catalogue/categories?notice=brand-error");
  }
  revalidatePath("/catalogue/categories");
  redirect("/catalogue/categories?notice=brand-updated");
}
