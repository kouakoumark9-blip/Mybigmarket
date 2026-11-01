"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import { adminProducts, employeeAuditLogs } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

/**
 * Corbeille du catalogue.
 *
 * Règle de la maison : aucune ligne produit n'est jamais effacée physiquement.
 * Elle est sortie du catalogue (deleted_at), puis soit restaurée, soit archivée.
 * Les commandes, factures et mouvements de stock gardent ainsi leur historique.
 */

const idSchema = z.object({ productId: z.string().uuid() });

function revalidateCatalog() {
  revalidatePath("/catalogue/corbeille");
  revalidatePath("/catalogue/produits");
  revalidatePath("/catalogue/stock");
  revalidatePath("/catalogue/monitoring");
}

export async function moveToTrashAction(formData: FormData) {
  const { employeeId } = await requireEmployee("catalog.products.delete");
  const parsed = idSchema.safeParse({ productId: formData.get("productId") });
  if (!parsed.success) redirect("/catalogue/produits?notice=invalid");

  const now = new Date();
  let moved = false;
  await getAdminDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(adminProducts)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(adminProducts.id, parsed.data.productId), isNull(adminProducts.deletedAt)))
      .returning({ id: adminProducts.id, title: adminProducts.title, status: adminProducts.status });
    if (!updated) return;
    moved = true;
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId,
      action: "catalog.product.trashed",
      entityType: "product",
      entityId: updated.id,
      details: { title: updated.title, previousStatus: updated.status, trashedAt: now.toISOString() },
    });
  });

  revalidateCatalog();
  redirect(moved ? "/catalogue/produits?notice=trashed" : "/catalogue/produits?notice=missing");
}

export async function restoreProductAction(formData: FormData) {
  const { employeeId } = await requireEmployee("catalog.trash.manage");
  const parsed = idSchema.safeParse({ productId: formData.get("productId") });
  if (!parsed.success) redirect("/catalogue/corbeille?notice=invalid");

  const now = new Date();
  let restored = false;
  await getAdminDb().transaction(async (tx) => {
    // Un produit restauré retourne en brouillon : il ne doit jamais redevenir
    // visible en boutique sans une nouvelle validation.
    const [updated] = await tx
      .update(adminProducts)
      .set({ deletedAt: null, status: sql`case when ${adminProducts.status} = 'published' then 'draft' else ${adminProducts.status} end`, updatedAt: now })
      .where(and(eq(adminProducts.id, parsed.data.productId), sql`${adminProducts.deletedAt} is not null`))
      .returning({ id: adminProducts.id, title: adminProducts.title, status: adminProducts.status });
    if (!updated) return;
    restored = true;
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId,
      action: "catalog.product.restored",
      entityType: "product",
      entityId: updated.id,
      details: { title: updated.title, restoredAs: updated.status, restoredAt: now.toISOString() },
    });
  });

  revalidateCatalog();
  redirect(restored ? "/catalogue/corbeille?notice=restored" : "/catalogue/corbeille?notice=missing");
}

export async function archiveFromTrashAction(formData: FormData) {
  const { employeeId } = await requireEmployee("catalog.trash.manage");
  const parsed = idSchema.safeParse({ productId: formData.get("productId") });
  if (!parsed.success) redirect("/catalogue/corbeille?notice=invalid");

  const now = new Date();
  let archived = false;
  await getAdminDb().transaction(async (tx) => {
    // Sort de la corbeille sans réapparaître en boutique : statut « archivé ».
    const [updated] = await tx
      .update(adminProducts)
      .set({ deletedAt: null, status: "archived", updatedAt: now })
      .where(and(eq(adminProducts.id, parsed.data.productId), sql`${adminProducts.deletedAt} is not null`))
      .returning({ id: adminProducts.id, title: adminProducts.title });
    if (!updated) return;
    archived = true;
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId,
      action: "catalog.product.archived_from_trash",
      entityType: "product",
      entityId: updated.id,
      details: { title: updated.title, archivedAt: now.toISOString() },
    });
  });

  revalidateCatalog();
  redirect(archived ? "/catalogue/corbeille?notice=archived" : "/catalogue/corbeille?notice=missing");
}
