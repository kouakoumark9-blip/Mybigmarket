/**
 * Module « Notifications clients » (étape 6) : abonné aux événements de commande, de paiement, de
 * remboursement et de formulaire, il met en file les e-mails (et messages WhatsApp si activés),
 * envoyés juste après chaque distribution d'événements puis par la tâche planifiée.
 */
import { z } from "zod";
import type { ModuleDefinition } from "@/server/core/modules";
import { onAfterDispatch, type EventHandler } from "@/server/core/events";
import { DEFAULT_NOTIFICATION_CONFIG, notificationSubscriptions, processNotificationQueues } from "@/server/modules/notifications/service";

export const notificationsConfigSchema = z.object({
  email: z.object({ enabled: z.boolean() }).strict(),
  whatsapp: z.object({
    enabled: z.boolean(),
    /** Code de notification → modèle WhatsApp approuvé par Meta et variables transmises, dans l'ordre. */
    templates: z.record(z.string().regex(/^[a-z0-9_]{2,60}$/), z.object({ name: z.string().trim().min(1).max(512), language: z.string().trim().min(2).max(10), parameters: z.array(z.string().regex(/^[a-zA-Z0-9_]+$/)).max(10) }).strict()),
  }).strict(),
  /** Codes de notification à ne pas envoyer. */
  disabled: z.array(z.string().regex(/^[a-z0-9_]{2,60}$/)).max(50),
  /** Alerte « nouvelle commande » à l'adresse des notifications internes. */
  adminAlerts: z.boolean(),
}).strict();

onAfterDispatch("notifications", processNotificationQueues);

export const notificationsModule: ModuleDefinition = {
  code: "customer-notifications",
  name: "Notifications clients",
  version: "1.0.0",
  description: "E-mails (et WhatsApp en option) de confirmation de commande, paiement, expédition, livraison, annulation et remboursement ; alertes internes (nouvelle commande, message reçu).",
  defaultActive: true,
  configSchema: notificationsConfigSchema as unknown as ModuleDefinition["configSchema"],
  defaultConfig: DEFAULT_NOTIFICATION_CONFIG as unknown as Record<string, unknown>,
  subscribes: notificationSubscriptions as unknown as ModuleDefinition["subscribes"],
};

export type { EventHandler };
