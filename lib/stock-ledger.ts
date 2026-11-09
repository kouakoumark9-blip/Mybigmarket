/**
 * Grand livre de stock (module 3) — partagé par la boutique, l'API v1 et l'administration.
 *
 * Écrit en SQL paramétré pour ne dépendre d'aucun des deux schémas Drizzle.
 *
 * Chaque fonction s'exécute DANS la transaction de l'appelant. Elle verrouille d'abord la ligne
 * produit (ou déclinaison), puis la ligne de stock : même ordre partout, donc pas d'interblocage
 * avec les écritures historiques qui ne verrouillent que la ligne produit.
 *
 * Modèle
 *   - stock_levels        : par entrepôt, stock physique et stock réservé ; disponible = physique − réservé.
 *   - products.quantity   : disponible total des entrepôts comptés (actifs et vendables), lu par la
 *     product_variants.stock boutique. Tenu à jour ici, dans la même transaction.
 *   - stock_movements     : chaque variation du stock physique, avec les quantités avant/après.
 *   - stock_reservations  : unités bloquées par une commande, puis consommées (expédition) ou
 *                           libérées (annulation, expiration du paiement, paiement refusé).
 *
 * Auto-réconciliation : si un écran historique a modifié le compteur sans passer par ici (création
 * d'un produit par un vendeur, par exemple), l'écart est reporté sur l'entrepôt par défaut avec un
 * mouvement « inventory » tracé, avant d'appliquer l'opération demandée.
 *
 * Compatibilité : tant que la migration 0015 n'est pas appliquée, les fonctions appliquent le
 * comportement historique (compteur produit seul), pour que la boutique continue de fonctionner.
 */
import { sql, type SQL } from "drizzle-orm";

export const LEDGER_DEFAULT_SHOP_ID = "00000000-0000-4000-8000-000000000001";
export const LEDGER_DEFAULT_WAREHOUSE_ID = "00000000-0000-4000-8000-000000000002";

export type StockReason = "purchase" | "sale" | "return" | "adjustment" | "loss" | "restock" | "pack" | "cancellation" | "transfer" | "inventory" | "import";

/** Connexion ou transaction Drizzle (postgres-js en production, PGlite en test). */
export type LedgerExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

export type StockLedgerErrorCode = "INSUFFICIENT_STOCK" | "NOT_FOUND" | "INVALID";

export class StockLedgerError extends Error {
  constructor(
    public readonly code: StockLedgerErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "StockLedgerError";
  }
}

export type StockTarget = { productId: string; variantId?: number | null };

export type StockLine = StockTarget & { quantity: number };

export type LevelState = {
  warehouseId: string;
  physicalBefore: number;
  physicalAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  /** Compteur lu par la boutique après l'opération (products.quantity ou product_variants.stock). */
  counterAfter: number;
};

type Row = Record<string, unknown>;

async function rows<T extends Row>(executor: LedgerExecutor, query: SQL): Promise<T[]> {
  const result = await executor.execute(query);
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}

const toInt = (value: unknown) => Number(value ?? 0);

let ready = false;

/** La migration 0015 est-elle appliquée ? Mémorisé une fois vrai. */
export async function ledgerReady(executor: LedgerExecutor): Promise<boolean> {
  if (ready) return true;
  const [row] = await rows<{ ready: boolean }>(executor, sql`select to_regclass('public.stock_reservations') is not null as ready`);
  ready = Boolean(row?.ready);
  return ready;
}

/** Tests : oublie l'état mémorisé. */
export function resetLedgerReadiness() {
  ready = false;
}

const variantIs = (variantId: number | null | undefined) => (variantId == null ? sql`l.variant_id is null` : sql`l.variant_id = ${variantId}`);

function assertQuantity(value: number, label = "La quantité") {
  if (!Number.isInteger(value) || value <= 0) throw new StockLedgerError("INVALID", `${label} doit être un entier positif.`, { value });
}

/** Verrouille le compteur produit ou déclinaison et renvoie sa valeur et son seuil d'alerte. */
async function lockCounter(executor: LedgerExecutor, target: StockTarget): Promise<{ counter: number; threshold: number }> {
  if (target.variantId == null) {
    const [row] = await rows<{ quantity: number; threshold: number }>(executor, sql`select quantity, low_stock_threshold as threshold from products where id = ${target.productId} for update`);
    if (!row) throw new StockLedgerError("NOT_FOUND", "Produit introuvable.", { productId: target.productId });
    return { counter: toInt(row.quantity), threshold: toInt(row.threshold) };
  }
  const [row] = await rows<{ quantity: number; threshold: number }>(
    executor,
    sql`select stock as quantity, low_stock_threshold as threshold from product_variants where id = ${target.variantId} and product_id = ${target.productId} for update`,
  );
  if (!row) throw new StockLedgerError("NOT_FOUND", "Déclinaison introuvable pour ce produit.", { productId: target.productId, variantId: target.variantId });
  return { counter: toInt(row.quantity), threshold: toInt(row.threshold) };
}

async function writeCounter(executor: LedgerExecutor, target: StockTarget, delta: number) {
  if (delta === 0) return;
  if (target.variantId == null) await executor.execute(sql`update products set quantity = quantity + ${delta}, updated_at = now() where id = ${target.productId}`);
  else await executor.execute(sql`update product_variants set stock = stock + ${delta} where id = ${target.variantId}`);
}

/** Disponible total des entrepôts comptés (actifs, vendables, non supprimés). */
async function countedAvailable(executor: LedgerExecutor, target: StockTarget): Promise<number> {
  const [row] = await rows<{ total: number }>(
    executor,
    sql`select coalesce(sum(l.physical_quantity - l.reserved_quantity), 0)::int as total
        from stock_levels l join warehouses w on w.id = l.warehouse_id
        where l.product_id = ${target.productId} and ${variantIs(target.variantId)}
          and w.is_active = true and w.is_sellable = true and w.deleted_at is null`,
  );
  return toInt(row?.total);
}

/** Entrepôt par défaut : celui marqué par défaut (actif et vendable), sinon l'entrepôt fixe de la migration. */
export async function defaultWarehouseId(executor: LedgerExecutor): Promise<string> {
  const [row] = await rows<{ id: string }>(
    executor,
    sql`select id from warehouses where is_default = true and is_active = true and is_sellable = true and deleted_at is null
        order by (shop_id = ${LEDGER_DEFAULT_SHOP_ID}::uuid) desc, position limit 1`,
  );
  return row?.id ?? LEDGER_DEFAULT_WAREHOUSE_ID;
}

async function warehouseCounted(executor: LedgerExecutor, warehouseId: string): Promise<boolean> {
  const [row] = await rows<{ counted: boolean }>(executor, sql`select (is_active and is_sellable and deleted_at is null) as counted from warehouses where id = ${warehouseId}`);
  if (!row) throw new StockLedgerError("NOT_FOUND", "Entrepôt introuvable.", { warehouseId });
  return Boolean(row.counted);
}

/** Verrouille la ligne de stock (créée à zéro si absente). */
async function lockLevel(executor: LedgerExecutor, warehouseId: string, target: StockTarget): Promise<{ id: number; physical: number; reserved: number }> {
  if (target.variantId == null) {
    await executor.execute(sql`insert into stock_levels (warehouse_id, product_id, variant_id) values (${warehouseId}, ${target.productId}, null)
      on conflict (warehouse_id, product_id) where variant_id is null do nothing`);
  } else {
    await executor.execute(sql`insert into stock_levels (warehouse_id, product_id, variant_id) values (${warehouseId}, ${target.productId}, ${target.variantId})
      on conflict (warehouse_id, product_id, variant_id) where variant_id is not null do nothing`);
  }
  const [row] = await rows<{ id: number; physical: number; reserved: number }>(
    executor,
    sql`select l.id, l.physical_quantity as physical, l.reserved_quantity as reserved from stock_levels l
        where l.warehouse_id = ${warehouseId} and l.product_id = ${target.productId} and ${variantIs(target.variantId)} for update`,
  );
  return { id: toInt(row.id), physical: toInt(row.physical), reserved: toInt(row.reserved) };
}

type MovementInput = {
  target: StockTarget;
  warehouseId: string;
  reason: StockReason;
  delta: number;
  before: number;
  after: number;
  orderId?: string | null;
  employeeId?: string | null;
  reservationId?: string | null;
  note?: string | null;
  reference?: string | null;
};

async function writeMovement(executor: LedgerExecutor, input: MovementInput) {
  await executor.execute(sql`insert into stock_movements
    (product_id, variant_id, reason, quantity_delta, quantity_before, quantity_after, order_id, employee_id, note, warehouse_id, reservation_id, reference)
    values (${input.target.productId}, ${input.target.variantId ?? null}, ${input.reason}, ${input.delta}, ${input.before}, ${input.after},
      ${input.orderId ?? null}, ${input.employeeId ?? null}, ${input.note?.slice(0, 240) ?? null}, ${input.warehouseId}, ${input.reservationId ?? null}, ${input.reference?.slice(0, 120) ?? null})`);
  await emit(executor, "stock.movement", input.target.productId, {
    productId: input.target.productId, variantId: input.target.variantId ?? null, warehouseId: input.warehouseId, delta: input.delta, reason: input.reason,
  });
}

/** Événement métier écrit dans l'outbox (domain_events), distribué après le commit. */
async function emit(executor: LedgerExecutor, name: "stock.low" | "stock.movement", productId: string, payload: Record<string, unknown>) {
  await executor.execute(sql`insert into domain_events (shop_id, name, aggregate_type, aggregate_id, payload)
    values (${LEDGER_DEFAULT_SHOP_ID}, ${name}, 'product', ${productId}, ${JSON.stringify(payload)}::jsonb)`);
}

/** Reporte sur l'entrepôt par défaut l'écart laissé par une écriture historique du compteur. */
async function reconcileLocked(executor: LedgerExecutor, target: StockTarget, counter: number, employeeId?: string | null) {
  const available = await countedAvailable(executor, target);
  const drift = counter - available;
  if (drift === 0) return;
  const warehouseId = await defaultWarehouseId(executor);
  // Sans entrepôt par défaut compté, reporter l'écart ne le corrigerait pas : on s'abstient
  // (les opérations suivantes restent cohérentes, elles appliquent des variations relatives).
  if (!(await warehouseCounted(executor, warehouseId).catch(() => false))) return;
  const level = await lockLevel(executor, warehouseId, target);
  const after = level.physical + drift;
  await executor.execute(sql`update stock_levels set physical_quantity = ${after}, updated_at = now() where id = ${level.id}`);
  await writeMovement(executor, {
    target, warehouseId, reason: "inventory", delta: drift, before: level.physical, after, employeeId,
    note: "Réconciliation automatique avec le compteur produit (écriture hors grand livre).",
  });
}

type ChangeInput = {
  target: StockTarget;
  warehouseId?: string | null;
  /** Variation du stock physique, ou fonction qui la calcule à partir de l'état verrouillé. */
  physicalDelta?: number | ((current: { physical: number; reserved: number }) => number);
  reservedDelta?: number;
  /** Autorise un disponible négatif (vente en rupture, consommation d'une réservation). */
  allowNegative?: boolean;
  employeeId?: string | null;
};

/** Opération élémentaire : verrouille, réconcilie, applique, met à jour le compteur et l'alerte. */
async function applyChange(executor: LedgerExecutor, input: ChangeInput): Promise<LevelState & { counterBefore: number }> {
  const { counter, threshold } = await lockCounter(executor, input.target);
  await reconcileLocked(executor, input.target, counter, input.employeeId);
  const warehouseId = input.warehouseId ?? (await defaultWarehouseId(executor));
  const counted = await warehouseCounted(executor, warehouseId);
  const level = await lockLevel(executor, warehouseId, input.target);

  const physicalDelta = typeof input.physicalDelta === "function" ? input.physicalDelta(level) : (input.physicalDelta ?? 0);
  const reservedDelta = input.reservedDelta ?? 0;
  const physicalAfter = level.physical + physicalDelta;
  const reservedAfter = level.reserved + reservedDelta;
  if (reservedAfter < 0) throw new StockLedgerError("INVALID", "Le stock réservé ne peut pas devenir négatif.", { warehouseId, reserved: level.reserved, reservedDelta });

  const availableBefore = level.physical - level.reserved;
  const availableAfter = physicalAfter - reservedAfter;
  if (!input.allowNegative && availableAfter < 0 && availableAfter < availableBefore) {
    throw new StockLedgerError("INSUFFICIENT_STOCK", `Stock insuffisant : ${Math.max(0, availableBefore)} disponible(s) dans l'entrepôt.`, {
      productId: input.target.productId, variantId: input.target.variantId ?? null, warehouseId, available: Math.max(0, availableBefore), requested: availableBefore - availableAfter,
    });
  }

  if (physicalDelta !== 0 || reservedDelta !== 0) {
    await executor.execute(sql`update stock_levels set physical_quantity = ${physicalAfter}, reserved_quantity = ${reservedAfter}, updated_at = now() where id = ${level.id}`);
  }
  const counterDelta = counted ? availableAfter - availableBefore : 0;
  await writeCounter(executor, input.target, counterDelta);
  const counterAfter = counter + counterDelta;
  if (counterDelta < 0 && counter > threshold && counterAfter <= threshold) {
    await emit(executor, "stock.low", input.target.productId, { productId: input.target.productId, variantId: input.target.variantId ?? null, quantity: counterAfter, threshold });
  }
  return { warehouseId, physicalBefore: level.physical, physicalAfter, reservedBefore: level.reserved, reservedAfter, counterBefore: counter, counterAfter };
}

/* ─────────────────────────────  Mode historique (avant migration)  ───────────────────────────── */

async function legacyCounterChange(executor: LedgerExecutor, target: StockTarget, delta: number, allowNegative: boolean): Promise<number> {
  const { counter } = await lockCounter(executor, target);
  if (!allowNegative && delta < 0 && counter + delta < 0) {
    throw new StockLedgerError("INSUFFICIENT_STOCK", `Stock insuffisant : ${Math.max(0, counter)} disponible(s).`, { productId: target.productId, variantId: target.variantId ?? null, available: Math.max(0, counter), requested: -delta });
  }
  await writeCounter(executor, target, delta);
  return counter + delta;
}

function legacyState(counterBefore: number, counterAfter: number): LevelState {
  return { warehouseId: LEDGER_DEFAULT_WAREHOUSE_ID, physicalBefore: counterBefore, physicalAfter: counterAfter, reservedBefore: 0, reservedAfter: 0, counterAfter };
}

/* ─────────────────────────────  Opérations publiques  ───────────────────────────── */

export type AdjustInput = StockTarget & {
  warehouseId?: string | null;
  /** Variation du stock physique (positive : entrée, négative : sortie). */
  delta: number;
  reason: StockReason;
  employeeId?: string | null;
  orderId?: string | null;
  note?: string | null;
  reference?: string | null;
  allowNegative?: boolean;
};

/** Entrée ou sortie de stock physique (réception, casse, correction, retour…). */
export async function adjustStock(executor: LedgerExecutor, input: AdjustInput): Promise<LevelState> {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new StockLedgerError("INVALID", "La variation de stock doit être un entier non nul.", { delta: input.delta });
  const target = { productId: input.productId, variantId: input.variantId ?? null };
  if (!(await ledgerReady(executor))) {
    const { counter } = await lockCounter(executor, target);
    return legacyState(counter, await legacyCounterChange(executor, target, input.delta, input.allowNegative ?? false));
  }
  const state = await applyChange(executor, { target, warehouseId: input.warehouseId, physicalDelta: input.delta, allowNegative: input.allowNegative, employeeId: input.employeeId });
  await writeMovement(executor, {
    target, warehouseId: state.warehouseId, reason: input.reason, delta: input.delta, before: state.physicalBefore, after: state.physicalAfter,
    orderId: input.orderId, employeeId: input.employeeId, note: input.note, reference: input.reference,
  });
  return state;
}

/** Inventaire : fixe le stock physique d'un entrepôt à une valeur comptée. */
export async function setPhysicalStock(executor: LedgerExecutor, input: StockTarget & { warehouseId?: string | null; quantity: number; reason?: StockReason; employeeId?: string | null; note?: string | null; reference?: string | null }): Promise<LevelState & { delta: number }> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0) throw new StockLedgerError("INVALID", "La quantité comptée doit être un entier positif ou nul.", { quantity: input.quantity });
  const target = { productId: input.productId, variantId: input.variantId ?? null };
  if (!(await ledgerReady(executor))) {
    const { counter } = await lockCounter(executor, target);
    const after = await legacyCounterChange(executor, target, input.quantity - counter, true);
    return { ...legacyState(counter, after), delta: input.quantity - counter };
  }
  let delta = 0;
  const state = await applyChange(executor, {
    target, warehouseId: input.warehouseId, employeeId: input.employeeId, allowNegative: true,
    physicalDelta: (current) => (delta = input.quantity - current.physical),
  });
  if (delta !== 0) {
    await writeMovement(executor, {
      target, warehouseId: state.warehouseId, reason: input.reason ?? "inventory", delta, before: state.physicalBefore, after: state.physicalAfter,
      employeeId: input.employeeId, note: input.note, reference: input.reference,
    });
  }
  return { ...state, delta };
}

/** Transfert entre entrepôts : deux mouvements « transfer », verrouillés dans un ordre stable. */
export async function transferStock(executor: LedgerExecutor, input: StockTarget & { fromWarehouseId: string; toWarehouseId: string; quantity: number; employeeId?: string | null; note?: string | null; reference?: string | null }) {
  assertQuantity(input.quantity);
  if (input.fromWarehouseId === input.toWarehouseId) throw new StockLedgerError("INVALID", "Les entrepôts de départ et d'arrivée doivent être différents.");
  if (!(await ledgerReady(executor))) throw new StockLedgerError("INVALID", "Les entrepôts ne sont pas encore disponibles : appliquez la migration 0015.");
  const target = { productId: input.productId, variantId: input.variantId ?? null };
  const reference = input.reference ?? `transfert:${input.fromWarehouseId.slice(0, 8)}→${input.toWarehouseId.slice(0, 8)}`;
  const steps = [
    { warehouseId: input.fromWarehouseId, delta: -input.quantity },
    { warehouseId: input.toWarehouseId, delta: input.quantity },
  ].sort((a, b) => a.warehouseId.localeCompare(b.warehouseId));
  const results: Record<string, LevelState> = {};
  for (const step of steps) {
    results[step.warehouseId] = await adjustStock(executor, { ...target, warehouseId: step.warehouseId, delta: step.delta, reason: "transfer", employeeId: input.employeeId, note: input.note, reference });
  }
  return { from: results[input.fromWarehouseId], to: results[input.toWarehouseId] };
}

export type ReserveInput = StockLine & {
  orderId?: string | null;
  cartId?: string | null;
  reference?: string | null;
  expiresAt?: Date | null;
  /** Entrepôt imposé ; sinon les entrepôts comptés les mieux fournis d'abord. */
  warehouseId?: string | null;
  /** Vente en rupture autorisée : le reliquat est réservé sur l'entrepôt par défaut. */
  allowBackorder?: boolean;
};

export type Reservation = { id: string | null; warehouseId: string; quantity: number };

/** Réserve des unités (commande ou panier). Peut répartir la quantité sur plusieurs entrepôts. */
export async function reserveStock(executor: LedgerExecutor, input: ReserveInput): Promise<Reservation[]> {
  assertQuantity(input.quantity);
  const target = { productId: input.productId, variantId: input.variantId ?? null };
  if (!(await ledgerReady(executor))) {
    await legacyCounterChange(executor, target, -input.quantity, input.allowBackorder ?? false);
    return [{ id: null, warehouseId: LEDGER_DEFAULT_WAREHOUSE_ID, quantity: input.quantity }];
  }
  // Verrouille et réconcilie avant de lire les disponibilités par entrepôt.
  const { counter } = await lockCounter(executor, target);
  await reconcileLocked(executor, target, counter);

  const plan: Array<{ warehouseId: string; quantity: number; allowNegative: boolean }> = [];
  if (input.warehouseId) {
    plan.push({ warehouseId: input.warehouseId, quantity: input.quantity, allowNegative: input.allowBackorder ?? false });
  } else {
    const fallback = await defaultWarehouseId(executor);
    const candidates = await rows<{ warehouseId: string; available: number }>(
      executor,
      sql`select l.warehouse_id as "warehouseId", (l.physical_quantity - l.reserved_quantity)::int as available
          from stock_levels l join warehouses w on w.id = l.warehouse_id
          where l.product_id = ${target.productId} and ${variantIs(target.variantId)}
            and w.is_active = true and w.is_sellable = true and w.deleted_at is null
            and l.physical_quantity - l.reserved_quantity > 0
          order by available desc, (l.warehouse_id = ${fallback}::uuid) desc, l.warehouse_id`,
    );
    let remaining = input.quantity;
    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, toInt(candidate.available));
      plan.push({ warehouseId: candidate.warehouseId, quantity: take, allowNegative: false });
      remaining -= take;
    }
    if (remaining > 0) {
      if (!input.allowBackorder) {
        const available = input.quantity - remaining;
        throw new StockLedgerError("INSUFFICIENT_STOCK", `Stock insuffisant : ${available} disponible(s), ${input.quantity} demandé(s).`, { productId: target.productId, variantId: target.variantId, available, requested: input.quantity });
      }
      const existing = plan.find((step) => step.warehouseId === fallback);
      if (existing) {
        existing.quantity += remaining;
        existing.allowNegative = true;
      } else plan.push({ warehouseId: fallback, quantity: remaining, allowNegative: true });
    }
  }

  const reservations: Reservation[] = [];
  for (const step of plan.sort((a, b) => a.warehouseId.localeCompare(b.warehouseId))) {
    await applyChange(executor, { target, warehouseId: step.warehouseId, reservedDelta: step.quantity, allowNegative: step.allowNegative });
    const [row] = await rows<{ id: string }>(
      executor,
      sql`insert into stock_reservations (warehouse_id, product_id, variant_id, quantity, status, order_id, cart_id, reference, expires_at)
          values (${step.warehouseId}, ${target.productId}, ${target.variantId}, ${step.quantity}, 'active', ${input.orderId ?? null}, ${input.cartId ?? null},
            ${input.reference?.slice(0, 120) ?? null}, ${input.expiresAt ? input.expiresAt.toISOString() : null})
          returning id`,
    );
    reservations.push({ id: row.id, warehouseId: step.warehouseId, quantity: step.quantity });
  }
  return reservations;
}

type ClaimedReservation = { id: string; warehouseId: string; productId: string; variantId: number | null; quantity: number; orderId: string | null };

async function claimReservations(executor: LedgerExecutor, where: SQL, status: "consumed" | "released" | "expired"): Promise<ClaimedReservation[]> {
  const claimed = await rows<ClaimedReservation>(
    executor,
    sql`update stock_reservations set status = ${status}, closed_at = now()
        where status = 'active' and ${where}
        returning id, warehouse_id as "warehouseId", product_id as "productId", variant_id as "variantId", quantity, order_id as "orderId"`,
  );
  // Ordre stable : produit puis entrepôt, comme partout ailleurs.
  return claimed
    .map((row) => ({ ...row, quantity: toInt(row.quantity), variantId: row.variantId == null ? null : toInt(row.variantId) }))
    .sort((a, b) => a.productId.localeCompare(b.productId) || a.warehouseId.localeCompare(b.warehouseId));
}

/** Libère des réservations actives (annulation, expiration) : le stock redevient disponible. */
export async function releaseReservations(executor: LedgerExecutor, filter: { orderId?: string; cartId?: string; reservationIds?: string[] }, status: "released" | "expired" = "released"): Promise<number> {
  if (!(await ledgerReady(executor))) return 0;
  const where = filter.reservationIds?.length
    ? sql`id in (${sql.join(filter.reservationIds.map((id) => sql`${id}::uuid`), sql`, `)})`
    : filter.orderId ? sql`order_id = ${filter.orderId}::uuid` : filter.cartId ? sql`cart_id = ${filter.cartId}::uuid` : null;
  if (!where) throw new StockLedgerError("INVALID", "Précisez la commande, le panier ou les réservations à libérer.");
  const claimed = await claimReservations(executor, where, status);
  for (const reservation of claimed) {
    await applyChange(executor, { target: reservation, warehouseId: reservation.warehouseId, reservedDelta: -reservation.quantity, allowNegative: true });
  }
  return claimed.reduce((sum, reservation) => sum + reservation.quantity, 0);
}

/** Expédition : les unités réservées sortent du stock physique (mouvement « sale »). */
export async function consumeOrderReservations(executor: LedgerExecutor, input: { orderId: string; employeeId?: string | null; note?: string | null }): Promise<number> {
  if (!(await ledgerReady(executor))) return 0;
  const claimed = await claimReservations(executor, sql`order_id = ${input.orderId}::uuid`, "consumed");
  for (const reservation of claimed) {
    const state = await applyChange(executor, { target: reservation, warehouseId: reservation.warehouseId, physicalDelta: -reservation.quantity, reservedDelta: -reservation.quantity, allowNegative: true, employeeId: input.employeeId });
    await writeMovement(executor, {
      target: reservation, warehouseId: reservation.warehouseId, reason: "sale", delta: -reservation.quantity, before: state.physicalBefore, after: state.physicalAfter,
      orderId: input.orderId, employeeId: input.employeeId, reservationId: reservation.id, note: input.note ?? "Expédition de la commande.",
    });
  }
  return claimed.reduce((sum, reservation) => sum + reservation.quantity, 0);
}

/** Paiement confirmé : la réservation de la commande ne doit plus expirer. */
export async function confirmOrderReservations(executor: LedgerExecutor, orderId: string): Promise<void> {
  if (!(await ledgerReady(executor))) return;
  await executor.execute(sql`update stock_reservations set expires_at = null where order_id = ${orderId}::uuid and status = 'active'`);
}

/** Réserve toutes les lignes d'une commande (dans la transaction qui crée la commande). */
export async function reserveOrderStock(executor: LedgerExecutor, input: { orderId: string; lines: StockLine[]; expiresAt?: Date | null; allowBackorder?: boolean }): Promise<Reservation[]> {
  const sorted = [...input.lines].sort((a, b) => a.productId.localeCompare(b.productId) || (a.variantId ?? 0) - (b.variantId ?? 0));
  const out: Reservation[] = [];
  for (const line of sorted) out.push(...(await reserveStock(executor, { ...line, orderId: input.orderId, expiresAt: input.expiresAt, allowBackorder: input.allowBackorder, reference: `commande:${input.orderId}` })));
  return out;
}

/**
 * Annulation d'une commande : libère ses réservations actives.
 * Commande antérieure au grand livre (aucune réservation enregistrée) : le stock prélevé à la
 * création est restitué ligne par ligne, comme le faisait l'ancien code.
 */
export async function releaseOrderStock(executor: LedgerExecutor, input: { orderId: string; lines: StockLine[]; status?: "released" | "expired"; employeeId?: string | null; note?: string | null }): Promise<{ released: number; restocked: number }> {
  if (!(await ledgerReady(executor))) {
    let restocked = 0;
    for (const line of input.lines) {
      if (line.quantity <= 0) continue;
      await legacyCounterChange(executor, { productId: line.productId, variantId: line.variantId ?? null }, line.quantity, true);
      restocked += line.quantity;
    }
    return { released: 0, restocked };
  }
  const [known] = await rows<{ n: number }>(executor, sql`select count(*)::int as n from stock_reservations where order_id = ${input.orderId}::uuid`);
  if (toInt(known?.n) > 0) return { released: await releaseReservations(executor, { orderId: input.orderId }, input.status ?? "released"), restocked: 0 };
  let restocked = 0;
  for (const line of input.lines) {
    if (line.quantity <= 0) continue;
    await adjustStock(executor, { productId: line.productId, variantId: line.variantId ?? null, delta: line.quantity, reason: "cancellation", orderId: input.orderId, employeeId: input.employeeId, note: input.note ?? "Annulation d'une commande antérieure au grand livre de stock." });
    restocked += line.quantity;
  }
  return { released: 0, restocked };
}

/**
 * Recale les compteurs boutique sur les niveaux de stock (après activation, désactivation ou
 * changement « vendable » d'un entrepôt). À appeler après `reconcileCounters`.
 */
export async function syncCounters(executor: LedgerExecutor, filter: { warehouseId?: string; productIds?: string[] } = {}) {
  if (!(await ledgerReady(executor))) return;
  const scope = filter.warehouseId
    ? sql`select product_id from stock_levels where warehouse_id = ${filter.warehouseId}::uuid`
    : filter.productIds?.length ? sql`select unnest(array[${sql.join(filter.productIds.map((id) => sql`${id}::uuid`), sql`, `)}])` : sql`select id from products`;
  await executor.execute(sql`update products p set quantity = coalesce((
      select sum(l.physical_quantity - l.reserved_quantity) from stock_levels l join warehouses w on w.id = l.warehouse_id
      where l.product_id = p.id and l.variant_id is null and w.is_active and w.is_sellable and w.deleted_at is null), 0), updated_at = now()
    where p.id in (${scope})`);
  await executor.execute(sql`update product_variants v set stock = coalesce((
      select sum(l.physical_quantity - l.reserved_quantity) from stock_levels l join warehouses w on w.id = l.warehouse_id
      where l.variant_id = v.id and w.is_active and w.is_sellable and w.deleted_at is null), 0)
    where v.product_id in (${scope}) and v.deleted_at is null`);
}

/** Écarts entre compteurs boutique et niveaux de stock (contrôle d'intégrité). */
export async function counterDrifts(executor: LedgerExecutor, limit = 200): Promise<Array<{ productId: string; variantId: number | null; counter: number; available: number }>> {
  if (!(await ledgerReady(executor))) return [];
  const found = await rows<{ productId: string; variantId: number | null; counter: number; available: number }>(
    executor,
    sql`select * from (
        select p.id as "productId", null::int as "variantId", p.quantity as counter,
          coalesce((select sum(l.physical_quantity - l.reserved_quantity) from stock_levels l join warehouses w on w.id = l.warehouse_id
            where l.product_id = p.id and l.variant_id is null and w.is_active and w.is_sellable and w.deleted_at is null), 0)::int as available
        from products p
        union all
        select v.product_id, v.id, v.stock,
          coalesce((select sum(l.physical_quantity - l.reserved_quantity) from stock_levels l join warehouses w on w.id = l.warehouse_id
            where l.variant_id = v.id and w.is_active and w.is_sellable and w.deleted_at is null), 0)::int
        from product_variants v where v.deleted_at is null
      ) d where d.counter <> d.available limit ${limit}`,
  );
  return found.map((row) => ({ productId: row.productId, variantId: row.variantId == null ? null : toInt(row.variantId), counter: toInt(row.counter), available: toInt(row.available) }));
}

/** Corrige les écarts trouvés en les reportant sur l'entrepôt par défaut (mouvements « inventory »). */
export async function reconcileCounters(executor: LedgerExecutor, input: { employeeId?: string | null; productIds?: string[] } = {}): Promise<number> {
  const drifts = await counterDrifts(executor, 10_000);
  let fixed = 0;
  for (const drift of drifts) {
    if (input.productIds && !input.productIds.includes(drift.productId)) continue;
    const target = { productId: drift.productId, variantId: drift.variantId };
    const { counter } = await lockCounter(executor, target);
    await reconcileLocked(executor, target, counter, input.employeeId);
    fixed += 1;
  }
  return fixed;
}

/** Disponibilité détaillée par entrepôt (lecture). */
export async function stockByWarehouse(executor: LedgerExecutor, target: StockTarget) {
  if (!(await ledgerReady(executor))) return [];
  const found = await rows<{ warehouseId: string; code: string; name: string; counted: boolean; physical: number; reserved: number }>(
    executor,
    sql`select w.id as "warehouseId", w.code, w.name, (w.is_active and w.is_sellable and w.deleted_at is null) as counted,
          l.physical_quantity as physical, l.reserved_quantity as reserved
        from stock_levels l join warehouses w on w.id = l.warehouse_id
        where l.product_id = ${target.productId} and ${variantIs(target.variantId)}
        order by w.position, w.code`,
  );
  return found.map((row) => ({ ...row, physical: toInt(row.physical), reserved: toInt(row.reserved), available: toInt(row.physical) - toInt(row.reserved) }));
}
