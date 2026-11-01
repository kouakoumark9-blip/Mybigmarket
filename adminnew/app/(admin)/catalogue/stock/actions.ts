"use server";

import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import { adminInventoryMovements, adminProducts, employeeAuditLogs } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

const stockSchema = z.object({
  productId: z.string().uuid(),
  direction: z.enum(["in", "out"]),
  amount: z.coerce.number().int().min(1).max(100000),
  reason: z.string().trim().min(5).max(300),
});

export async function adjustStockAction(formData: FormData) {
  const { employeeId } = await requireEmployee("catalog.stock.update");
  const parsed = stockSchema.safeParse({
    productId: formData.get("productId"),
    direction: formData.get("direction"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) redirect("/catalogue/stock?notice=invalid");
  const delta = parsed.data.direction === "in" ? parsed.data.amount : -parsed.data.amount;
  let newQuantity: number | undefined;
  try {
    await getAdminDb().transaction(async (tx) => {
      const [updated] = await tx.update(adminProducts).set({
        quantity: sql`${adminProducts.quantity} + ${delta}`,
        updatedAt: new Date(),
      }).where(and(
        eq(adminProducts.id, parsed.data.productId),
        sql`${adminProducts.quantity} + ${delta} >= 0`,
      )).returning({ id: adminProducts.id, quantity: adminProducts.quantity });
      if (!updated) return;
      newQuantity = updated.quantity;
      await tx.insert(adminInventoryMovements).values({
        id: randomUUID(),
        productId: parsed.data.productId,
        quantityDelta: delta,
        movementType: parsed.data.direction === "in" ? "admin_increase" : "admin_decrease",
        reason: parsed.data.reason,
        employeeId,
        createdAt: new Date(),
      });
      await tx.insert(employeeAuditLogs).values({
        actorEmployeeId: employeeId,
        action: "stock.adjusted",
        entityType: "product",
        entityId: parsed.data.productId,
        details: { delta, newQuantity: updated.quantity, reason: parsed.data.reason },
      });
    });
  } catch {
    redirect("/catalogue/stock?notice=error");
  }
  if (newQuantity === undefined) redirect("/catalogue/stock?notice=missing-or-negative");
  revalidatePath("/catalogue/stock");
  revalidatePath("/catalogue/produits");
  redirect("/catalogue/stock?notice=updated");
}
