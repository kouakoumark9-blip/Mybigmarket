"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import { adminReviews, employeeAuditLogs } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

const actionSchema = z.object({ id: z.string().uuid(), visibility: z.enum(["publish", "hide"]) });

export async function moderateReviewAction(formData: FormData) {
  const { employeeId } = await requireEmployee("catalog.reviews.moderate");
  const parsed = actionSchema.safeParse({ id: formData.get("id"), visibility: formData.get("visibility") });
  if (!parsed.success) redirect("/catalogue/avis?notice=error");
  const isPublished = parsed.data.visibility === "publish";
  try {
    await getAdminDb().transaction(async (tx) => {
      const [updated] = await tx.update(adminReviews).set({ isPublished, moderatedByEmployeeId: employeeId, moderatedAt: new Date() })
        .where(eq(adminReviews.id, parsed.data.id)).returning({ id: adminReviews.id });
      if (!updated) return;
      await tx.insert(employeeAuditLogs).values({ actorEmployeeId: employeeId, action: isPublished ? "review.published" : "review.hidden", entityType: "review", entityId: parsed.data.id, details: { isPublished } });
    });
  } catch {
    redirect("/catalogue/avis?notice=error");
  }
  revalidatePath("/catalogue/avis");
  redirect("/catalogue/avis?notice=updated");
}
