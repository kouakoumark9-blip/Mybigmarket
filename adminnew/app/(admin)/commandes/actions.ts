"use server";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import { adminEscrowEntries, adminOrderStatusHistory, adminOrders, employeeAuditLogs } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

const transitions: Record<string, string[]> = {
  paid_escrow: ["seller_confirmed"],
  seller_confirmed: ["received_collection_point"],
  received_collection_point: ["shipped"],
  shipped: ["arrived_abidjan"],
  arrived_abidjan: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
};
const statusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "delivered"]),
  note: z.string().trim().min(5).max(300),
});

export async function changeOrderStatusAction(formData: FormData) {
  const { employeeId } = await requireEmployee("orders.status.update");
  const parsed = statusSchema.safeParse({ orderId: formData.get("orderId"), status: formData.get("status"), note: formData.get("note") });
  if (!parsed.success) redirect("/commandes?notice=invalid");
  let changed = false;
  try {
    await getAdminDb().transaction(async (tx) => {
      const [order] = await tx.select({ id: adminOrders.id, status: adminOrders.status }).from(adminOrders).where(eq(adminOrders.id, parsed.data.orderId)).limit(1);
      if (!order || !transitions[order.status]?.includes(parsed.data.status)) return;
      const now = new Date();
      const [updated] = await tx.update(adminOrders).set({ status: parsed.data.status, updatedAt: now })
        .where(and(eq(adminOrders.id, order.id), eq(adminOrders.status, order.status))).returning({ id: adminOrders.id });
      if (!updated) return;
      await tx.insert(adminOrderStatusHistory).values({ id: randomUUID(), orderId: order.id, fromStatus: order.status, toStatus: parsed.data.status, employeeId, note: parsed.data.note, createdAt: now });
      if (parsed.data.status === "delivered") {
        await tx.update(adminEscrowEntries).set({ status: "eligible" }).where(and(eq(adminEscrowEntries.orderId, order.id), eq(adminEscrowEntries.status, "blocked")));
      }
      await tx.insert(employeeAuditLogs).values({ actorEmployeeId: employeeId, action: "order.status_changed", entityType: "order", entityId: order.id, details: { from: order.status, to: parsed.data.status, note: parsed.data.note } });
      changed = true;
    });
  } catch {
    redirect("/commandes?notice=error");
  }
  if (!changed) redirect("/commandes?notice=transition");
  revalidatePath("/commandes");
  revalidatePath("/");
  redirect("/commandes?notice=updated");
}
