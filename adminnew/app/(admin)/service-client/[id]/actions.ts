"use server";

import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import { adminConversations, adminMessages, employeeAuditLogs } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

const replySchema = z.object({ conversationId: z.string().uuid(), body: z.string().trim().min(1).max(3000) });

export async function sendEmployeeReplyAction(formData: FormData) {
  const { employeeId } = await requireEmployee("support.messages.reply");
  const parsed = replySchema.safeParse({ conversationId: formData.get("conversationId"), body: formData.get("body") });
  if (!parsed.success) redirect("/service-client?notice=invalid");
  const db = getAdminDb();
  const [conversation] = await db.select({ id: adminConversations.id }).from(adminConversations).where(eq(adminConversations.id, parsed.data.conversationId)).limit(1);
  if (!conversation) redirect("/service-client?notice=missing");
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(adminMessages).values({
        id: randomUUID(),
        conversationId: conversation.id,
        senderId: null,
        senderEmployeeId: employeeId,
        authorType: "employee",
        body: parsed.data.body,
        readAt: null,
        createdAt: now,
      });
      await tx.update(adminConversations).set({ lastMessageAt: now }).where(eq(adminConversations.id, conversation.id));
      await tx.insert(employeeAuditLogs).values({ actorEmployeeId: employeeId, action: "support.message_replied", entityType: "conversation", entityId: conversation.id, details: { characterCount: parsed.data.body.length } });
    });
  } catch {
    redirect("/service-client?notice=error");
  }
  revalidatePath(`/service-client/${conversation.id}`);
  revalidatePath("/service-client");
  redirect(`/service-client/${conversation.id}?notice=replied`);
}
