/**
 * Stocks : entrepôts, niveaux par entrepôt, mouvements tracés, réservations, alertes de stock bas,
 * réapprovisionnement, import et export CSV.
 *
 * Toute écriture de stock passe par le grand livre (lib/stock-ledger.ts), dans la transaction de
 * l'opération : niveaux, compteurs boutique, mouvements, alertes et événements restent cohérents.
 *
 * Règles des entrepôts :
 * - l'entrepôt par défaut reste actif et vendable, et ne peut pas être supprimé ;
 * - activer, désactiver ou rendre (non) vendable un entrepôt recale les compteurs boutique ;
 * - un entrepôt ne se supprime que vide (aucun stock physique, aucune réservation active).
 */
import { and, asc, count, desc, eq, gt, gte, isNull, ne, sql } from "drizzle-orm";
import {
  adjustStock, counterDrifts, reconcileCounters, releaseReservations, setPhysicalStock, StockLedgerError, stockByWarehouse, syncCounters, transferStock, type StockReason,
} from "@/lib/stock-ledger";
import { orderItems, orders, productSuppliers, productVariants, products, stockLevels, stockMovements, stockReservations, suppliers, warehouses } from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { AppError, errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { buildOrderBy, buildWhere, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import { definedEntries, fromLedgerError, type Context } from "@/server/modules/catalog/shared";

/* ─────────────────────────────  Entrepôts  ───────────────────────────── */

type WarehouseRow = typeof warehouses.$inferSelect;
const warehouseView = (row: WarehouseRow) => ({
  id: row.id, code: row.code, name: row.name, countryCode: row.countryCode, city: row.city, address: row.address, managerEmployeeId: row.managerEmployeeId,
  isActive: row.isActive, isDefault: row.isDefault, isSellable: row.isSellable, position: row.position, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export async function listWarehouses(database: Db) {
  const rows = await database.select().from(warehouses).where(isNull(warehouses.deletedAt)).orderBy(asc(warehouses.position), asc(warehouses.code));
  const totals = await database.select({ warehouseId: stockLevels.warehouseId, physical: sql<number>`coalesce(sum(${stockLevels.physicalQuantity}), 0)::int`, reserved: sql<number>`coalesce(sum(${stockLevels.reservedQuantity}), 0)::int`, lines: sql<number>`count(*)::int` })
    .from(stockLevels).groupBy(stockLevels.warehouseId);
  return rows.map((row) => {
    const total = totals.find((entry) => entry.warehouseId === row.id);
    return { ...warehouseView(row), totals: { physical: Number(total?.physical ?? 0), reserved: Number(total?.reserved ?? 0), stockLines: Number(total?.lines ?? 0) } };
  });
}

async function findWarehouse(executor: Executor, id: string, lock = false) {
  const query = executor.select().from(warehouses).where(and(eq(warehouses.id, id), isNull(warehouses.deletedAt))).limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw errors.notFound("Entrepôt", id);
  return row;
}

export async function getWarehouse(database: Db, id: string) {
  return (await listWarehouses(database)).find((entry) => entry.id === id) ?? (() => { throw errors.notFound("Entrepôt", id); })();
}

type WarehouseInput = { code?: string; name?: string; countryCode?: string; city?: string | null; address?: string | null; managerEmployeeId?: string | null; isActive?: boolean; isDefault?: boolean; isSellable?: boolean; position?: number };

export async function createWarehouse(database: Db, input: WarehouseInput & { code: string; name: string }, context: Context) {
  return database.transaction(async (tx) => {
    const shopId = context.actor.shopId;
    if (input.isDefault) {
      if (input.isActive === false || input.isSellable === false) throw errors.rule("L'entrepôt par défaut doit être actif et vendable.");
      await tx.update(warehouses).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(warehouses.shopId, shopId), eq(warehouses.isDefault, true)));
    }
    const [row] = await tx.insert(warehouses).values({ ...input, shopId }).returning();
    await recordAudit(tx, { action: "warehouse.created", entityType: "warehouse", entityId: row.id, after: warehouseView(row), actor: context.actor, meta: context.meta });
    return warehouseView(row);
  });
}

export async function updateWarehouse(database: Db, id: string, input: WarehouseInput, context: Context) {
  return database.transaction(async (tx) => {
    const before = await findWarehouse(tx, id, true);
    const willBeDefault = input.isDefault ?? before.isDefault;
    if (before.isDefault && input.isDefault === false) throw errors.rule("Désignez un autre entrepôt par défaut plutôt que de retirer ce statut.");
    if (willBeDefault && ((input.isActive ?? before.isActive) === false || (input.isSellable ?? before.isSellable) === false)) throw errors.rule("L'entrepôt par défaut doit rester actif et vendable.");
    if (input.isDefault && !before.isDefault) await tx.update(warehouses).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(warehouses.shopId, before.shopId), eq(warehouses.isDefault, true)));
    const countingChanged = (input.isActive !== undefined && input.isActive !== before.isActive) || (input.isSellable !== undefined && input.isSellable !== before.isSellable);
    // Avant de changer ce qui compte dans les compteurs boutique, on fige les écarts éventuels.
    if (countingChanged) {
      const affected = await tx.select({ productId: stockLevels.productId }).from(stockLevels).where(eq(stockLevels.warehouseId, id));
      if (affected.length) await reconcileCounters(tx, { employeeId: context.actor.employeeId, productIds: [...new Set(affected.map((row) => row.productId))] });
    }
    const [after] = await tx.update(warehouses).set({ ...definedEntries(input), updatedAt: new Date() }).where(eq(warehouses.id, id)).returning();
    if (countingChanged) await syncCounters(tx, { warehouseId: id });
    await recordAudit(tx, { action: "warehouse.updated", entityType: "warehouse", entityId: id, before: warehouseView(before), after: warehouseView(after), details: countingChanged ? { countersSynchronized: true } : undefined, actor: context.actor, meta: context.meta });
    return warehouseView(after);
  });
}

export async function deleteWarehouse(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    const before = await findWarehouse(tx, id, true);
    if (before.isDefault) throw errors.rule("L'entrepôt par défaut ne peut pas être supprimé.");
    const [{ physical }] = await tx.select({ physical: sql<number>`coalesce(sum(abs(${stockLevels.physicalQuantity})), 0)::int` }).from(stockLevels).where(eq(stockLevels.warehouseId, id));
    const [{ value: active }] = await tx.select({ value: count() }).from(stockReservations).where(and(eq(stockReservations.warehouseId, id), eq(stockReservations.status, "active")));
    if (Number(physical) > 0 || Number(active) > 0) throw errors.rule("Videz l'entrepôt (transferts) et clôturez ses réservations avant de le supprimer.", { physical: Number(physical), activeReservations: Number(active) });
    await tx.update(warehouses).set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() }).where(eq(warehouses.id, id));
    await recordAudit(tx, { action: "warehouse.deleted", entityType: "warehouse", entityId: id, before: warehouseView(before), actor: context.actor, meta: context.meta });
  });
}

/* ─────────────────────────────  Niveaux et mouvements  ───────────────────────────── */

export const levelListSpec: ListSpec = {
  sortable: { updatedAt: stockLevels.updatedAt, physical: stockLevels.physicalQuantity, reserved: stockLevels.reservedQuantity, title: products.title },
  filterable: { warehouseId: { column: stockLevels.warehouseId, type: "uuid" }, productId: { column: stockLevels.productId, type: "uuid" }, variantId: { column: stockLevels.variantId, type: "number" } },
  searchable: [products.title, products.reference, products.sku],
  defaultSort: "title",
  maxLimit: 200,
};

export async function listLevels(database: Db, query: ListQuery, options: { lowStock?: boolean } = {}) {
  const available = sql`(${stockLevels.physicalQuantity} - ${stockLevels.reservedQuantity})`;
  const threshold = sql`coalesce(${stockLevels.lowStockThreshold}, ${productVariants.lowStockThreshold}, ${products.lowStockThreshold})`;
  const where = buildWhere(query, levelListSpec, [isNull(products.deletedAt), options.lowStock ? sql`${available} <= ${threshold}` : undefined]);
  const base = () => database.select({
    id: stockLevels.id, warehouseId: stockLevels.warehouseId, warehouseCode: warehouses.code, productId: stockLevels.productId, variantId: stockLevels.variantId,
    title: products.title, reference: products.reference, sku: products.sku, variantLabel: productVariants.value, variantSku: productVariants.sku,
    physical: stockLevels.physicalQuantity, reserved: stockLevels.reservedQuantity, threshold: sql<number>`${threshold}::int`, location: stockLevels.location, updatedAt: stockLevels.updatedAt,
  }).from(stockLevels).innerJoin(products, eq(products.id, stockLevels.productId)).innerJoin(warehouses, eq(warehouses.id, stockLevels.warehouseId)).leftJoin(productVariants, eq(productVariants.id, stockLevels.variantId));
  const [rows, [total]] = await Promise.all([
    base().where(where).orderBy(...buildOrderBy(query, levelListSpec, stockLevels.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(stockLevels).innerJoin(products, eq(products.id, stockLevels.productId)).leftJoin(productVariants, eq(productVariants.id, stockLevels.variantId)).where(where),
  ]);
  return {
    data: rows.map((row) => ({ ...row, available: row.physical - row.reserved, lowStock: row.physical - row.reserved <= Number(row.threshold), threshold: Number(row.threshold), updatedAt: row.updatedAt.toISOString() })),
    meta: listMeta(query, Number(total?.value ?? 0)),
  };
}

export async function productStock(database: Db, productId: string) {
  const [product] = await database.select({ id: products.id, title: products.title, quantity: products.quantity, threshold: products.lowStockThreshold }).from(products).where(and(eq(products.id, productId), isNull(products.deletedAt))).limit(1);
  if (!product) throw errors.notFound("Produit", productId);
  const variants = await database.select({ id: productVariants.id, value: productVariants.value, sku: productVariants.sku, stock: productVariants.stock, threshold: productVariants.lowStockThreshold })
    .from(productVariants).where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt))).orderBy(asc(productVariants.position));
  const reservations = await database.select().from(stockReservations).where(and(eq(stockReservations.productId, productId), eq(stockReservations.status, "active"))).orderBy(desc(stockReservations.createdAt)).limit(100);
  return {
    productId, title: product.title, available: product.quantity, lowStockThreshold: product.threshold,
    warehouses: await stockByWarehouse(database, { productId }),
    variants: await Promise.all(variants.map(async (variant) => ({ ...variant, available: variant.stock, warehouses: await stockByWarehouse(database, { productId, variantId: variant.id }) }))),
    activeReservations: reservations.map(reservationView),
  };
}

export const movementListSpec: ListSpec = {
  sortable: { createdAt: stockMovements.createdAt, quantityDelta: stockMovements.quantityDelta },
  filterable: {
    productId: { column: stockMovements.productId, type: "uuid" }, variantId: { column: stockMovements.variantId, type: "number" }, warehouseId: { column: stockMovements.warehouseId, type: "uuid" },
    reason: { column: stockMovements.reason, type: "enum", values: ["purchase", "sale", "return", "adjustment", "loss", "restock", "pack", "cancellation", "transfer", "inventory", "import"] },
    orderId: { column: stockMovements.orderId, type: "uuid" }, employeeId: { column: stockMovements.employeeId, type: "uuid" }, createdAt: { column: stockMovements.createdAt, type: "date" },
    reference: { column: stockMovements.reference, type: "string" },
  },
  searchable: [stockMovements.note, stockMovements.reference],
  defaultSort: "-createdAt",
  maxLimit: 200,
};

export async function listMovements(database: Db, query: ListQuery) {
  const where = buildWhere(query, movementListSpec);
  const [rows, [total]] = await Promise.all([
    database.select({ movement: stockMovements, title: products.title, warehouseCode: warehouses.code }).from(stockMovements).innerJoin(products, eq(products.id, stockMovements.productId)).leftJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
      .where(where).orderBy(...buildOrderBy(query, movementListSpec, stockMovements.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(stockMovements).where(where),
  ]);
  return {
    data: rows.map(({ movement, title, warehouseCode }) => ({
      id: movement.id, productId: movement.productId, title, variantId: movement.variantId, warehouseId: movement.warehouseId, warehouseCode, reason: movement.reason,
      delta: movement.quantityDelta, before: movement.quantityBefore, after: movement.quantityAfter, orderId: movement.orderId, reservationId: movement.reservationId,
      employeeId: movement.employeeId, reference: movement.reference, note: movement.note, createdAt: movement.createdAt.toISOString(),
    })),
    meta: listMeta(query, Number(total?.value ?? 0)),
  };
}

/* ─────────────────────────────  Opérations  ───────────────────────────── */

async function assertProductTarget(executor: Executor, productId: string, variantId?: number | null) {
  const [product] = await executor.select({ id: products.id, productType: products.productType }).from(products).where(and(eq(products.id, productId), isNull(products.deletedAt))).limit(1);
  if (!product) throw errors.notFound("Produit", productId);
  if (product.productType === "pack" && variantId == null) throw errors.rule("Le stock d'un pack se déduit de ses composants : ajustez le stock des composants.");
  if (product.productType === "virtual") throw errors.rule("Un produit virtuel n'a pas de stock physique.");
}

const MANUAL_REASONS = ["purchase", "return", "adjustment", "loss", "restock"] as const satisfies readonly StockReason[];

export async function adjust(database: Db, input: { productId: string; variantId?: number | null; warehouseId?: string | null; delta: number; reason: (typeof MANUAL_REASONS)[number]; note?: string | null; reference?: string | null }, context: Context) {
  return database.transaction(async (tx) => {
    await assertProductTarget(tx, input.productId, input.variantId);
    const state = await adjustStock(tx, { ...input, employeeId: context.actor.employeeId }).catch(fromLedgerError);
    await recordAudit(tx, { action: "stock.adjusted", entityType: "product", entityId: input.productId, before: { physical: state.physicalBefore }, after: { physical: state.physicalAfter, available: state.counterAfter }, details: { ...input, warehouseId: state.warehouseId }, actor: context.actor, meta: context.meta });
    return { ...state, delta: input.delta };
  });
}

export async function inventoryCount(database: Db, input: { warehouseId?: string | null; reference?: string | null; note?: string | null; items: Array<{ productId: string; variantId?: number | null; quantity: number }> }, context: Context) {
  return database.transaction(async (tx) => {
    const results = [];
    for (const item of input.items) {
      await assertProductTarget(tx, item.productId, item.variantId);
      const state = await setPhysicalStock(tx, { ...item, warehouseId: input.warehouseId, reason: "inventory", employeeId: context.actor.employeeId, note: input.note, reference: input.reference }).catch(fromLedgerError);
      results.push({ productId: item.productId, variantId: item.variantId ?? null, before: state.physicalBefore, after: state.physicalAfter, delta: state.delta });
    }
    await recordAudit(tx, { action: "stock.inventory", entityType: "warehouse", entityId: input.warehouseId ?? null, details: { reference: input.reference ?? null, lines: results.length, changed: results.filter((row) => row.delta !== 0).length }, actor: context.actor, meta: context.meta });
    return { lines: results.length, changed: results.filter((row) => row.delta !== 0).length, results };
  });
}

export async function transfer(database: Db, input: { productId: string; variantId?: number | null; fromWarehouseId: string; toWarehouseId: string; quantity: number; note?: string | null; reference?: string | null }, context: Context) {
  return database.transaction(async (tx) => {
    await assertProductTarget(tx, input.productId, input.variantId);
    await findWarehouse(tx, input.fromWarehouseId);
    await findWarehouse(tx, input.toWarehouseId);
    const result = await transferStock(tx, { ...input, employeeId: context.actor.employeeId }).catch(fromLedgerError);
    await recordAudit(tx, { action: "stock.transferred", entityType: "product", entityId: input.productId, details: input, actor: context.actor, meta: context.meta });
    return result;
  });
}

/** Réception fournisseur (bon de livraison) : entrée « purchase » de chaque ligne. */
export async function receive(database: Db, input: { warehouseId?: string | null; supplierId?: string | null; reference: string; note?: string | null; items: Array<{ productId: string; variantId?: number | null; quantity: number; unitCostXof?: number | null }> }, context: Context) {
  return database.transaction(async (tx) => {
    if (input.supplierId) {
      const [supplier] = await tx.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, input.supplierId), isNull(suppliers.deletedAt))).limit(1);
      if (!supplier) throw errors.validation([{ path: "supplierId", message: "Fournisseur introuvable." }]);
    }
    const results = [];
    for (const item of input.items) {
      await assertProductTarget(tx, item.productId, item.variantId);
      const state = await adjustStock(tx, { productId: item.productId, variantId: item.variantId ?? null, warehouseId: input.warehouseId, delta: item.quantity, reason: "purchase", employeeId: context.actor.employeeId, reference: input.reference, note: input.note }).catch(fromLedgerError);
      // Le coût de revient reçu met à jour le prix d'achat chez ce fournisseur.
      if (input.supplierId && item.unitCostXof != null) {
        await tx.insert(productSuppliers).values({ productId: item.productId, supplierId: input.supplierId, purchasePriceXof: item.unitCostXof, currency: "XOF" })
          .onConflictDoUpdate({ target: [productSuppliers.productId, productSuppliers.supplierId], set: { purchasePriceXof: item.unitCostXof } });
      }
      results.push({ productId: item.productId, variantId: item.variantId ?? null, quantity: item.quantity, physicalAfter: state.physicalAfter });
    }
    await recordAudit(tx, { action: "stock.received", entityType: "warehouse", entityId: input.warehouseId ?? null, details: { reference: input.reference, supplierId: input.supplierId ?? null, lines: results.length, units: results.reduce((sum, row) => sum + row.quantity, 0) }, actor: context.actor, meta: context.meta });
    return { reference: input.reference, lines: results.length, units: results.reduce((sum, row) => sum + row.quantity, 0), results };
  });
}

/* ─────────────────────────────  Réservations  ───────────────────────────── */

type ReservationRow = typeof stockReservations.$inferSelect;
function reservationView(row: ReservationRow) {
  return { id: row.id, warehouseId: row.warehouseId, productId: row.productId, variantId: row.variantId, quantity: row.quantity, status: row.status, orderId: row.orderId, cartId: row.cartId, reference: row.reference, expiresAt: row.expiresAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), closedAt: row.closedAt?.toISOString() ?? null };
}

export const reservationListSpec: ListSpec = {
  sortable: { createdAt: stockReservations.createdAt, expiresAt: stockReservations.expiresAt, quantity: stockReservations.quantity },
  filterable: {
    status: { column: stockReservations.status, type: "enum", values: ["active", "consumed", "released", "expired"] }, productId: { column: stockReservations.productId, type: "uuid" },
    orderId: { column: stockReservations.orderId, type: "uuid" }, warehouseId: { column: stockReservations.warehouseId, type: "uuid" }, expiresAt: { column: stockReservations.expiresAt, type: "date" },
  },
  defaultSort: "-createdAt",
  maxLimit: 200,
};

export async function listReservations(database: Db, query: ListQuery) {
  const where = buildWhere(query, reservationListSpec);
  const [rows, [total]] = await Promise.all([
    database.select().from(stockReservations).where(where).orderBy(...buildOrderBy(query, reservationListSpec, stockReservations.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(stockReservations).where(where),
  ]);
  return { data: rows.map(reservationView), meta: listMeta(query, Number(total?.value ?? 0)) };
}

export async function releaseReservation(database: Db, id: string, context: Context) {
  return database.transaction(async (tx) => {
    const [row] = await tx.select().from(stockReservations).where(eq(stockReservations.id, id)).limit(1);
    if (!row) throw errors.notFound("Réservation", id);
    if (row.status !== "active") throw errors.rule("Cette réservation est déjà clôturée.", { status: row.status });
    const released = await releaseReservations(tx, { reservationIds: [id] }).catch(fromLedgerError);
    await recordAudit(tx, { action: "stock.reservation_released", entityType: "stock_reservation", entityId: id, before: reservationView(row), details: { released }, actor: context.actor, meta: context.meta });
    return { released };
  });
}

/* ─────────────────────────────  Alertes, intégrité, réapprovisionnement  ───────────────────────────── */

export async function lowStockAlerts(database: Db) {
  const productsLow = await database.select({ productId: products.id, title: products.title, reference: products.reference, available: products.quantity, threshold: products.lowStockThreshold, supplierId: products.supplierId, restockDate: products.restockDate })
    .from(products).where(and(isNull(products.deletedAt), ne(products.productType, "virtual"), ne(products.productType, "pack"), sql`${products.quantity} <= ${products.lowStockThreshold}`, ne(products.status, "archived"),
      sql`not exists (select 1 from ${productVariants} v where v.product_id = ${products.id} and v.deleted_at is null)`))
    .orderBy(asc(products.quantity)).limit(500);
  const variantsLow = await database.select({ productId: products.id, title: products.title, variantId: productVariants.id, variant: productVariants.value, sku: productVariants.sku, available: productVariants.stock, threshold: productVariants.lowStockThreshold })
    .from(productVariants).innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(isNull(products.deletedAt), isNull(productVariants.deletedAt), eq(productVariants.isActive, true), sql`${productVariants.stock} <= ${productVariants.lowStockThreshold}`))
    .orderBy(asc(productVariants.stock)).limit(500);
  return { products: productsLow.map((row) => ({ ...row, restockDate: row.restockDate?.toISOString() ?? null, outOfStock: row.available <= 0 })), variants: variantsLow.map((row) => ({ ...row, outOfStock: row.available <= 0 })) };
}

export async function drifts(database: Db) {
  const [found, withoutLevels] = await Promise.all([counterDrifts(database), levelsCoverage(database)]);
  return { drifts: found, productsWithoutLevels: withoutLevels };
}

export async function reconcile(database: Db, context: Context) {
  return database.transaction(async (tx) => {
    const fixed = await reconcileCounters(tx, { employeeId: context.actor.employeeId });
    await recordAudit(tx, { action: "stock.reconciled", entityType: "stock", details: { fixed }, actor: context.actor, meta: context.meta });
    return { fixed };
  });
}

/**
 * Suggestions de réapprovisionnement : ventes des N derniers jours → besoin pour couvrir le délai
 * d'approvisionnement + 7 jours de sécurité, jamais sous le seuil d'alerte + 1. Regroupé par fournisseur.
 */
export async function replenishment(database: Db, options: { days: number }) {
  const since = new Date(Date.now() - options.days * 86_400_000);
  const sales = await database.select({ productId: orderItems.productId, sold: sql<number>`sum(${orderItems.quantity})::int` })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(gte(orders.createdAt, since), sql`${orders.status} not in ('cancelled', 'refunded', 'awaiting_payment')`)).groupBy(orderItems.productId);
  const soldById = new Map(sales.map((row) => [row.productId, Number(row.sold)]));
  const candidates = await database.select({ id: products.id, title: products.title, reference: products.reference, available: products.quantity, threshold: products.lowStockThreshold, leadTimeDays: products.leadTimeDays, supplierId: products.supplierId, purchasePriceXof: products.purchasePriceXof, supplierName: suppliers.companyName })
    .from(products).leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .where(and(isNull(products.deletedAt), eq(products.productType, "standard"), ne(products.status, "archived")));
  const lines = candidates.map((product) => {
    const sold = soldById.get(product.id) ?? 0;
    const daily = sold / options.days;
    const target = Math.max(product.threshold + 1, Math.ceil(daily * (product.leadTimeDays + 7)));
    const suggested = Math.max(0, target - product.available);
    return { productId: product.id, title: product.title, reference: product.reference, available: product.available, threshold: product.threshold, soldLastPeriod: sold, dailySales: Math.round(daily * 100) / 100, leadTimeDays: product.leadTimeDays, targetStock: target, suggestedQuantity: suggested, estimatedCostXof: product.purchasePriceXof != null ? product.purchasePriceXof * suggested : null, supplierId: product.supplierId, supplierName: product.supplierName };
  }).filter((line) => line.suggestedQuantity > 0).sort((a, b) => b.suggestedQuantity - a.suggestedQuantity);
  const bySupplier = new Map<string, { supplierId: string | null; supplierName: string | null; lines: typeof lines; estimatedCostXof: number }>();
  for (const line of lines) {
    const key = line.supplierId ?? "";
    const entry = bySupplier.get(key) ?? { supplierId: line.supplierId, supplierName: line.supplierName, lines: [], estimatedCostXof: 0 };
    entry.lines.push(line);
    entry.estimatedCostXof += line.estimatedCostXof ?? 0;
    bySupplier.set(key, entry);
  }
  return { periodDays: options.days, lines: lines.length, suppliers: [...bySupplier.values()] };
}

/* ─────────────────────────────  CSV  ───────────────────────────── */

/** Cellule CSV sûre : guillemets doublés, et neutralisation des formules (injection CSV). */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportStockCsv(database: Db, options: { warehouseId?: string }) {
  const rows = await database.select({
    reference: products.reference, sku: products.sku, ean13: products.ean13, title: products.title, variantSku: productVariants.sku, variant: productVariants.value,
    warehouse: warehouses.code, physical: stockLevels.physicalQuantity, reserved: stockLevels.reservedQuantity, location: stockLevels.location,
  }).from(stockLevels).innerJoin(products, eq(products.id, stockLevels.productId)).innerJoin(warehouses, eq(warehouses.id, stockLevels.warehouseId)).leftJoin(productVariants, eq(productVariants.id, stockLevels.variantId))
    .where(and(isNull(products.deletedAt), options.warehouseId ? eq(stockLevels.warehouseId, options.warehouseId) : undefined)).orderBy(asc(products.title), asc(warehouses.code));
  const header = ["reference", "sku", "ean13", "titre", "sku_declinaison", "declinaison", "entrepot", "physique", "reserve", "disponible", "emplacement"];
  const body = rows.map((row) => [row.reference, row.sku, row.ean13, row.title, row.variantSku, row.variant, row.warehouse, row.physical, row.reserved, row.physical - row.reserved, row.location].map(csvCell).join(";"));
  return `﻿${[header.join(";"), ...body].join("\r\n")}\r\n`;
}

/** Lecture CSV simple (séparateur ; ou , détecté, guillemets gérés). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const separator = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (quoted) {
      if (char === '"' && clean[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

class DryRunRollback extends Error {}

export type ImportLineReport = { line: number; status: "ok" | "error" | "unchanged"; message?: string; productId?: string; variantId?: number | null; warehouse?: string; before?: number; after?: number };

/**
 * Import CSV du stock. Colonnes : reference | sku | ean13 (au moins une), sku_declinaison
 * (facultatif), quantite, entrepot (code, facultatif). Mode « set » (inventaire) ou « add » (entrée).
 * Simulation (`dryRun`) : exécutée réellement puis annulée, le rapport est donc exact.
 * Hors simulation : tout ou rien — la moindre ligne en erreur annule l'import.
 */
export async function importStockCsv(database: Db, input: { csv: string; mode: "set" | "add"; dryRun: boolean; reference?: string }, context: Context) {
  const rows = parseCsv(input.csv);
  if (rows.length < 2) throw errors.validation([{ path: "csv", message: "Le fichier doit contenir une ligne d'en-tête et au moins une ligne de données." }]);
  if (rows.length > 5001) throw errors.validation([{ path: "csv", message: "5 000 lignes au maximum par import." }]);
  const header = rows[0].map((cell) => cell.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const column = (...names: string[]) => header.findIndex((cell) => names.includes(cell));
  const columns = { reference: column("reference", "ref"), sku: column("sku"), ean13: column("ean13", "ean"), variantSku: column("sku_declinaison", "variant_sku"), quantity: column("quantite", "quantity", "qte", "physique"), warehouse: column("entrepot", "warehouse") };
  if (columns.quantity < 0 || (columns.reference < 0 && columns.sku < 0 && columns.ean13 < 0)) {
    throw errors.validation([{ path: "csv", message: "Colonnes requises : quantite, et reference, sku ou ean13." }]);
  }
  const reference = input.reference ?? `import:${new Date().toISOString().slice(0, 19)}`;
  const report: ImportLineReport[] = [];
  const warehouseRows = await database.select({ id: warehouses.id, code: warehouses.code }).from(warehouses).where(isNull(warehouses.deletedAt));

  const run = async (tx: Executor) => {
    for (const [index, row] of rows.slice(1).entries()) {
      const line = index + 2;
      const value = (position: number) => (position >= 0 ? (row[position] ?? "").trim() : "");
      const quantityText = value(columns.quantity).replace(/\s/g, "");
      const quantity = Number(quantityText);
      if (!/^-?\d+$/.test(quantityText) || (input.mode === "set" && quantity < 0)) { report.push({ line, status: "error", message: "Quantité invalide (entier attendu)." }); continue; }
      const warehouseCode = value(columns.warehouse);
      const warehouse = warehouseCode ? warehouseRows.find((entry) => entry.code === warehouseCode) : null;
      if (warehouseCode && !warehouse) { report.push({ line, status: "error", message: `Entrepôt inconnu : ${warehouseCode}.` }); continue; }
      const identifiers = [value(columns.reference) && eq(products.reference, value(columns.reference)), value(columns.sku) && eq(products.sku, value(columns.sku)), value(columns.ean13) && eq(products.ean13, value(columns.ean13))].filter(Boolean);
      if (!identifiers.length) { report.push({ line, status: "error", message: "Aucun identifiant produit (reference, sku ou ean13)." }); continue; }
      const found = await tx.select({ id: products.id, productType: products.productType }).from(products).where(and(isNull(products.deletedAt), ...(identifiers as ReturnType<typeof eq>[]))).limit(2);
      if (found.length !== 1) { report.push({ line, status: "error", message: found.length ? "Identifiant ambigu : plusieurs produits correspondent." : "Produit introuvable." }); continue; }
      let variantId: number | null = null;
      if (value(columns.variantSku)) {
        const [variant] = await tx.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.productId, found[0].id), eq(productVariants.sku, value(columns.variantSku)), isNull(productVariants.deletedAt))).limit(1);
        if (!variant) { report.push({ line, status: "error", productId: found[0].id, message: `Déclinaison introuvable : ${value(columns.variantSku)}.` }); continue; }
        variantId = variant.id;
      }
      if (found[0].productType !== "standard" && variantId == null) { report.push({ line, status: "error", productId: found[0].id, message: "Les packs et produits virtuels n'ont pas de stock propre." }); continue; }
      try {
        if (input.mode === "set") {
          const state = await setPhysicalStock(tx, { productId: found[0].id, variantId, warehouseId: warehouse?.id ?? null, quantity, reason: "import", employeeId: context.actor.employeeId, reference });
          report.push({ line, status: state.delta === 0 ? "unchanged" : "ok", productId: found[0].id, variantId, warehouse: warehouseCode || undefined, before: state.physicalBefore, after: state.physicalAfter });
        } else if (quantity === 0) {
          report.push({ line, status: "unchanged", productId: found[0].id, variantId });
        } else {
          const state = await adjustStock(tx, { productId: found[0].id, variantId, warehouseId: warehouse?.id ?? null, delta: quantity, reason: "import", employeeId: context.actor.employeeId, reference });
          report.push({ line, status: "ok", productId: found[0].id, variantId, warehouse: warehouseCode || undefined, before: state.physicalBefore, after: state.physicalAfter });
        }
      } catch (error) {
        if (!(error instanceof StockLedgerError)) throw error;
        report.push({ line, status: "error", productId: found[0].id, variantId, message: error.message });
      }
    }
    const failed = report.filter((entry) => entry.status === "error").length;
    if (input.dryRun) throw new DryRunRollback();
    if (failed) throw new AppError("BUSINESS_RULE", `${failed} ligne(s) en erreur : aucun stock n'a été modifié. Corrigez le fichier puis relancez.`, { report });
    await recordAudit(tx, { action: "stock.imported", entityType: "stock", details: { reference, mode: input.mode, lines: report.length, changed: report.filter((entry) => entry.status === "ok").length }, actor: context.actor, meta: context.meta });
  };

  try {
    await database.transaction(async (tx) => run(tx));
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }
  return {
    dryRun: input.dryRun, mode: input.mode, reference,
    summary: { lines: report.length, ok: report.filter((entry) => entry.status === "ok").length, unchanged: report.filter((entry) => entry.status === "unchanged").length, errors: report.filter((entry) => entry.status === "error").length },
    report,
  };
}

/** Produits dont le compteur est au-dessus de zéro mais sans aucun niveau de stock (contrôle). */
export async function levelsCoverage(database: Db) {
  const [{ value }] = await database.select({ value: count() }).from(products).where(and(isNull(products.deletedAt), gt(products.quantity, 0), sql`not exists (select 1 from ${stockLevels} l where l.product_id = ${products.id})`));
  return Number(value);
}
