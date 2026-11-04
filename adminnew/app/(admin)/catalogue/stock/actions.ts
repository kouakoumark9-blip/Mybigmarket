"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import { employeeAuditLogs } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { adjustStock, StockLedgerError } from "@/lib/stock-ledger";

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
      // Grand livre partagé : niveau de stock de l'entrepôt par défaut, compteur produit,
      // mouvement tracé avant/après et alerte de stock bas, dans la même transaction.
      const state = await adjustStock(tx, {
        productId: parsed.data.productId,
        delta,
        reason: "adjustment",
        employeeId,
        note: parsed.data.reason,
      });
      newQuantity = state.counterAfter;
      await tx.insert(employeeAuditLogs).values({
        actorEmployeeId: employeeId,
        action: "stock.adjusted",
        entityType: "product",
        entityId: parsed.data.productId,
        details: { delta, newQuantity: state.counterAfter, warehouseId: state.warehouseId, reason: parsed.data.reason },
      });
    });
  } catch (error) {
    if (!(error instanceof StockLedgerError)) redirect("/catalogue/stock?notice=error");
  }
  if (newQuantity === undefined) redirect("/catalogue/stock?notice=missing-or-negative");
  revalidatePath("/catalogue/stock");
  revalidatePath("/catalogue/produits");
  redirect("/catalogue/stock?notice=updated");
}
