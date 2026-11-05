/**
 * Module « Service client » (étape 8) : transforme chaque message du formulaire de contact en
 * ticket (paramètre support.tickets_from_contact_form), sans jamais créer deux tickets pour un envoi.
 * Les e-mails liés aux tickets sont envoyés par le module « Notifications clients ».
 */
import { DEFAULT_SHOP_ID } from "@/lib/db/schema";
import type { DomainEvent } from "@/server/core/events";
import type { ModuleDefinition } from "@/server/core/modules";
import { getSetting } from "@/server/core/settings";
import type { Db } from "@/server/core/db";
import { createTicketFromSubmission } from "@/server/modules/support/service";

async function onFormSubmitted(event: DomainEvent<"form.submitted">, { db }: { db: Db }) {
  if (event.payload.code !== "contact") return;
  if (!(await getSetting(db, event.shopId ?? DEFAULT_SHOP_ID, "support.tickets_from_contact_form"))) return;
  await createTicketFromSubmission(db, event.payload.submissionId);
}

export const supportModule: ModuleDefinition = {
  code: "customer-service",
  name: "Service client",
  version: "1.0.0",
  description: "Tickets du service client : un ticket par message du formulaire de contact, suivi, assignation et modèles de réponse.",
  defaultActive: true,
  subscribes: { "form.submitted": onFormSubmitted } as unknown as ModuleDefinition["subscribes"],
};
