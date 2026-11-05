/**
 * Événements métier et hooks.
 *
 * 1. `emitEvent` écrit l'événement dans la table domain_events, dans la transaction de
 *    l'appelant (outbox) : si la transaction échoue, l'événement n'existe pas.
 * 2. Après le commit, `dispatchPendingEvents` le distribue aux modules actifs abonnés
 *    et au registre de hooks historique (lib/hooks.ts). Une erreur de module ne remonte
 *    jamais à l'utilisateur : elle est journalisée et l'événement est retenté
 *    (5 tentatives, attente exponentielle), puis marqué « failed ».
 */
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { domainEvents, moduleEventsLog } from "@/lib/db/schema";
import { runHook, type HookCode } from "@/lib/hooks";
import type { Db, Executor } from "@/server/core/db";
import { logger, errorContext } from "@/server/core/logger";
import { recordError } from "@/server/core/error-log";

/** Catalogue des événements et de leur contenu. */
export type DomainEventMap = {
  "employee.created": { employeeId: string; email: string; roleCode: string };
  "employee.updated": { employeeId: string; changedFields: string[] };
  "employee.deleted": { employeeId: string };
  "employee.password_reset": { employeeId: string };
  "role.created": { roleId: string; code: string };
  "role.updated": { roleId: string; code: string; changedFields: string[] };
  "role.deleted": { roleId: string; code: string };
  "settings.updated": { keys: string[] };
  "module.enabled": { code: string };
  "module.disabled": { code: string };
  "module.configured": { code: string };
  "api_key.created": { apiKeyId: string; label: string };
  "api_key.revoked": { apiKeyId: string };
  // Déclarés pour les modules suivants (catalogue, commandes, paiement…).
  "product.created": { productId: string };
  "product.updated": { productId: string; changedFields: string[] };
  "product.deleted": { productId: string };
  "stock.low": { productId: string; variantId?: number | null; quantity: number; threshold: number };
  "stock.movement": { productId: string; variantId?: number | null; warehouseId?: string; delta: number; reason: string };
  "cart.updated": { cartId: string };
  "customer.created": { customerId: string };
  "order.created": { orderId: string; reference: string; totalXof: number };
  "order.status_changed": { orderId: string; from: string | null; to: string };
  "payment.confirmed": { paymentId: string; orderId: string; amountXof: number };
  "payment.refunded": { paymentId: string; orderId: string; amountXof: number };
  // Paiement et livraison (étape 5).
  "payment.succeeded": { intentId: string; reference: string; amountXof: number; method: string; orders: Array<{ orderId: string; result: string }> };
  "payment.failed": { intentId: string; reference: string; status: string };
  "payment.amount_mismatch": { intentId: string; reference: string; expectedXof: number; announcedXof: number | null };
  "payment.refund_required": { orderId: string; intentId: string; amountXof: number; reason: "late_payment" | "duplicate_payment" };
  "refund.created": { refundId: string; orderId: string; amountXof: number };
  "refund.completed": { refundId: string; orderId: string; amountXof: number };
  "shipment.status_changed": { shipmentId: number; batchRef: string; from: string; to: string; orderIds: string[] };
  // Communication et CMS (étape 6).
  "form.submitted": { formId: string; submissionId: string; code: string };
  "cms.page_published": { pageId: string; slug: string };
  "support.ticket_created": { ticketId: string; reference: string; channel: string };
  "support.customer_replied": { ticketId: string; messageId: string };
  "support.agent_replied": { ticketId: string; messageId: string };
  "ai.proposal_applied": { proposalId: string; kind: string; targetId: string };
};

export type DomainEventName = keyof DomainEventMap;

export type DomainEvent<N extends DomainEventName = DomainEventName> = {
  id: string;
  name: N;
  payload: DomainEventMap[N];
  shopId: string | null;
  occurredAt: Date;
};

export type EventHandler<N extends DomainEventName = DomainEventName> = (event: DomainEvent<N>, context: { db: Db; config: Record<string, unknown> }) => void | Promise<void>;

/** Correspondance avec les hooks historiques de lib/hooks.ts. */
const HOOK_BRIDGE: Partial<Record<DomainEventName, HookCode>> = {
  "order.status_changed": "actionOrderStatusUpdate",
  "product.created": "actionProductSave",
  "product.updated": "actionProductSave",
  "cart.updated": "actionCartSave",
  "payment.confirmed": "actionPaymentConfirmation",
  "customer.created": "actionCustomerCreate",
  "order.created": "actionCheckoutSubmit",
};

export async function emitEvent<N extends DomainEventName>(executor: Executor, name: N, payload: DomainEventMap[N], options: { shopId?: string | null; aggregateType?: string; aggregateId?: string } = {}): Promise<string> {
  const [row] = await executor.insert(domainEvents).values({
    name, payload: payload as Record<string, unknown>, shopId: options.shopId ?? null,
    aggregateType: options.aggregateType ?? name.split(".")[0], aggregateId: options.aggregateId ?? null,
  }).returning({ id: domainEvents.id });
  return row.id;
}

export type Subscriber = { moduleCode: string; handler: EventHandler; config: Record<string, unknown> };
export type SubscriberSource = (database: Db, name: DomainEventName) => Promise<Subscriber[]>;

let subscriberSource: SubscriberSource = async () => [];

/** Branché par le registre de modules (server/core/modules.ts). */
export function setSubscriberSource(source: SubscriberSource) {
  subscriberSource = source;
}

const MAX_ATTEMPTS = 5;

function backoffMs(attempt: number) {
  return Math.min(60, 2 ** attempt) * 60_000;
}

/**
 * Distribue les événements en attente. Plusieurs exécutions concurrentes se partagent la file
 * sans doublon grâce à `FOR UPDATE SKIP LOCKED`.
 */
export async function dispatchPendingEvents(database: Db, options: { limit?: number; now?: Date } = {}): Promise<{ dispatched: number; failed: number }> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50;
  const claimed = await database.execute<{ id: string }>(sql`
    update domain_events set attempts = attempts + 1
    where id in (
      select id from domain_events
      where status = 'pending' and available_at <= ${now.toISOString()}::timestamptz
      order by occurred_at
      limit ${limit}
      for update skip locked
    )
    returning id`);
  const ids = ((claimed as unknown as { rows?: Array<{ id: string }> }).rows ?? (claimed as unknown as Array<{ id: string }>)).map((row) => row.id);
  if (!ids.length) return { dispatched: 0, failed: 0 };
  const rows = await database.select().from(domainEvents).where(inArray(domainEvents.id, ids));
  let dispatched = 0;
  let failed = 0;
  for (const row of rows.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
    const event: DomainEvent = { id: row.id, name: row.name as DomainEventName, payload: row.payload as never, shopId: row.shopId, occurredAt: row.occurredAt };
    const problems: string[] = [];
    for (const subscriber of await subscriberSource(database, event.name)) {
      const started = Date.now();
      try {
        await subscriber.handler(event, { db: database, config: subscriber.config });
        await database.insert(moduleEventsLog).values({ hookCode: event.name, moduleCode: subscriber.moduleCode, status: "ok", durationMs: Date.now() - started });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        problems.push(`${subscriber.moduleCode}: ${message}`);
        await database.insert(moduleEventsLog).values({ hookCode: event.name, moduleCode: subscriber.moduleCode, status: "error", error: message.slice(0, 2000), durationMs: Date.now() - started });
        logger.warn("event.subscriber_failed", { event: event.name, eventId: event.id, module: subscriber.moduleCode, ...errorContext(error) });
      }
    }
    const hook = HOOK_BRIDGE[event.name];
    if (hook) {
      const result = await runHook(hook, { event: event.name, ...(event.payload as Record<string, unknown>) });
      for (const issue of result.errors) problems.push(`${issue.moduleCode}: ${issue.message}`);
    }
    if (!problems.length) {
      await database.update(domainEvents).set({ status: "dispatched", dispatchedAt: new Date(), lastError: null }).where(eq(domainEvents.id, row.id));
      dispatched += 1;
    } else {
      const exhausted = row.attempts >= MAX_ATTEMPTS;
      await database.update(domainEvents).set({
        status: exhausted ? "failed" : "pending",
        lastError: problems.join(" | ").slice(0, 4000),
        availableAt: new Date(now.getTime() + backoffMs(row.attempts)),
      }).where(eq(domainEvents.id, row.id));
      failed += 1;
      // Abandon définitif : l'erreur entre au journal des erreurs pour être traitée par l'équipe.
      if (exhausted) await recordError(database, { source: "event", error: new Error(problems.join(" | ")), code: "EVENT_FAILED", route: event.name, shopId: event.shopId, context: { eventId: event.id, attempts: row.attempts } });
    }
  }
  return { dispatched, failed };
}

/** Traitements lancés après chaque distribution (ex. envoi des notifications mises en file). */
const afterDispatchHooks: Array<{ name: string; run: (database: Db) => Promise<unknown> }> = [];

export function onAfterDispatch(name: string, run: (database: Db) => Promise<unknown>) {
  if (!afterDispatchHooks.some((hook) => hook.name === name)) afterDispatchHooks.push({ name, run });
}

export async function runAfterDispatchHooks(database: Db) {
  for (const hook of afterDispatchHooks) {
    try {
      await hook.run(database);
    } catch (error) {
      logger.warn("event.after_dispatch_failed", { hook: hook.name, ...errorContext(error) });
      await recordError(database, { source: "event", error, code: "AFTER_DISPATCH_FAILED", route: hook.name });
    }
  }
}

/**
 * Distribution juste après la réponse HTTP (fonction `after` de Next.js), avec repli sur
 * la tâche planifiée /api/cron/dispatch-events si l'environnement ne la permet pas.
 */
export async function scheduleDispatch(database: () => Db) {
  try {
    const { after } = await import("next/server");
    after(async () => {
      try {
        await dispatchPendingEvents(database());
        await runAfterDispatchHooks(database());
      } catch (error) {
        logger.warn("event.dispatch_failed", errorContext(error));
      }
    });
  } catch {
    // Hors requête Next (tests, scripts) : la tâche planifiée prendra le relais.
  }
}

export async function pendingEventCount(database: Db, now = new Date()): Promise<number> {
  const [row] = await database.select({ value: sql<number>`count(*)::int` }).from(domainEvents).where(and(eq(domainEvents.status, "pending"), lte(domainEvents.availableAt, now)));
  return Number(row?.value ?? 0);
}
