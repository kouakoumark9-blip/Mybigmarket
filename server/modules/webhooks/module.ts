/**
 * Module « Webhooks sortants » : transmet les événements choisis à des URL externes
 * (ERP, outil de logistique, automatisation), signés HMAC-SHA256.
 *
 * Exemple de module branché sur le bus d'événements sans modifier le cœur.
 * En cas d'échec (réseau, code ≠ 2xx), l'événement est retenté par l'outbox.
 */
import { createHmac } from "node:crypto";
import { z } from "zod";
import type { ModuleDefinition } from "@/server/core/modules";
import type { DomainEvent } from "@/server/core/events";

const endpointSchema = z.object({
  url: z.string().url().refine((value) => value.startsWith("https://"), "L'URL doit être en HTTPS."),
  secret: z.string().min(16, "Le secret de signature doit faire au moins 16 caractères.").max(200),
  events: z.array(z.string().regex(/^[a-z_]+\.([a-z_]+|\*)$|^\*$/, "Événement attendu : « order.created », « order.* » ou « * ».")).min(1).max(50),
});

export const webhooksConfigSchema = z.object({ endpoints: z.array(endpointSchema).max(10) });

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function matchesEvent(patterns: string[], name: string): boolean {
  return patterns.some((pattern) => pattern === "*" || pattern === name || (pattern.endsWith(".*") && name.startsWith(pattern.slice(0, -1))));
}

export async function deliver(event: DomainEvent, config: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  const parsed = webhooksConfigSchema.safeParse(config);
  if (!parsed.success) return;
  const body = JSON.stringify({ id: event.id, name: event.name, occurredAt: event.occurredAt.toISOString(), shopId: event.shopId, payload: event.payload });
  const failures: string[] = [];
  for (const endpoint of parsed.data.endpoints.filter((entry) => matchesEvent(entry.events, event.name))) {
    const timestamp = Math.floor(Date.now() / 1000);
    try {
      const response = await fetcher(endpoint.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-mbm-event": event.name, "x-mbm-event-id": event.id, "x-mbm-timestamp": String(timestamp), "x-mbm-signature": `sha256=${signWebhook(endpoint.secret, timestamp, body)}` },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) failures.push(`${new URL(endpoint.url).host} → ${response.status}`);
    } catch (error) {
      failures.push(`${new URL(endpoint.url).host} → ${error instanceof Error ? error.message : "erreur réseau"}`);
    }
  }
  if (failures.length) throw new Error(`Webhooks en échec : ${failures.join(", ")}`);
}

export const webhooksModule: ModuleDefinition = {
  code: "outgoing-webhooks",
  name: "Webhooks sortants",
  version: "1.0.0",
  description: "Envoie les événements choisis (commande créée, stock bas, paiement confirmé…) à des URL externes, signés HMAC-SHA256 et retentés en cas d'échec.",
  defaultActive: false,
  configSchema: webhooksConfigSchema,
  defaultConfig: { endpoints: [] },
  secretConfigKeys: ["secret"],
  onAnyEvent: (event, context) => deliver(event, context.config),
};
