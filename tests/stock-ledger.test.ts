/**
 * Grand livre de stock sur PostgreSQL réel (PGlite) : réservation, libération, consommation,
 * entrepôts multiples, réconciliation des écritures historiques, alertes et mode historique.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  adjustStock, consumeOrderReservations, counterDrifts, LEDGER_DEFAULT_WAREHOUSE_ID, releaseOrderStock, releaseReservations,
  reserveOrderStock, reserveStock, resetLedgerReadiness, setPhysicalStock, StockLedgerError, stockByWarehouse, syncCounters, transferStock,
} from "@/lib/stock-ledger";

const migrationsDir = join(process.cwd(), "drizzle");
const SELLER = "10000000-0000-4000-8000-000000000001";
const PRODUCT = "20000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";

type Database = ReturnType<typeof drizzle>;

async function rows<T>(database: Database, query: ReturnType<typeof sql>): Promise<T[]> {
  return ((await database.execute(query)) as unknown as { rows: T[] }).rows;
}

async function seed(database: Database) {
  await database.execute(sql`insert into users (id, name, email, password_hash, role) values (${SELLER}, 'Vendeur', 'vendeur@exemple.ci', 'x', 'seller')`);
  await database.execute(sql`insert into categories (id, name, slug) values (1, 'Outillage', 'outillage')`);
  // Produits créés « à l'ancienne » (compteur seul, sans niveau de stock), comme le formulaire vendeur.
  await database.execute(sql`insert into products (id, seller_id, category_id, title, slug, description, price_xof, quantity, low_stock_threshold)
    values (${PRODUCT}, ${SELLER}, 1, 'Perceuse', 'perceuse', 'Perceuse', 25000, 10, 5), (${OTHER}, ${SELLER}, 1, 'Visseuse', 'visseuse', 'Visseuse', 18000, 3, 1)`);
}

async function createOrder(database: Database): Promise<string> {
  const [order] = await rows<{ id: string }>(database, sql`insert into orders (buyer_id, total_xof) values (${SELLER}, 1000) returning id`);
  return order.id;
}

async function productQuantity(database: Database, id = PRODUCT) {
  const [row] = await rows<{ quantity: number }>(database, sql`select quantity from products where id = ${id}`);
  return row.quantity;
}

describe("grand livre de stock", () => {
  let database: Database;

  beforeAll(async () => {
    resetLedgerReadiness();
    const client = new PGlite({ extensions: { unaccent, pg_trgm } });
    database = drizzle(client);
    await migrate(database, { migrationsFolder: migrationsDir });
    await seed(database);
  });

  it("réconcilie un produit créé hors grand livre puis trace l'entrée de stock", async () => {
    const state = await database.transaction((tx) => adjustStock(tx, { productId: PRODUCT, delta: 5, reason: "purchase", reference: "BR-001" }));
    expect(state).toMatchObject({ warehouseId: LEDGER_DEFAULT_WAREHOUSE_ID, physicalBefore: 10, physicalAfter: 15, counterAfter: 15 });
    expect(await productQuantity(database)).toBe(15);
    const movements = await rows<{ reason: string; quantity_delta: number; quantity_before: number; quantity_after: number }>(
      database, sql`select reason, quantity_delta, quantity_before, quantity_after from stock_movements where product_id = ${PRODUCT} order by id`,
    );
    expect(movements).toEqual([
      { reason: "inventory", quantity_delta: 10, quantity_before: 0, quantity_after: 10 },
      { reason: "purchase", quantity_delta: 5, quantity_before: 10, quantity_after: 15 },
    ]);
  });

  it("réserve à la commande, refuse la survente, puis libère à l'annulation", async () => {
    const orderId = await createOrder(database);
    await database.transaction((tx) => reserveOrderStock(tx, { orderId, lines: [{ productId: PRODUCT, quantity: 4 }] }));
    expect(await productQuantity(database)).toBe(11);
    const [level] = await stockByWarehouse(database, { productId: PRODUCT });
    expect(level).toMatchObject({ physical: 15, reserved: 4, available: 11 });

    await expect(database.transaction((tx) => reserveStock(tx, { productId: PRODUCT, quantity: 12 }))).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await productQuantity(database)).toBe(11);

    const released = await database.transaction((tx) => releaseOrderStock(tx, { orderId, lines: [{ productId: PRODUCT, quantity: 4 }] }));
    expect(released).toEqual({ released: 4, restocked: 0 });
    expect(await productQuantity(database)).toBe(15);
    // Une seconde annulation ne restitue rien de plus.
    expect(await database.transaction((tx) => releaseOrderStock(tx, { orderId, lines: [{ productId: PRODUCT, quantity: 4 }] }))).toEqual({ released: 0, restocked: 0 });
    expect(await productQuantity(database)).toBe(15);
  });

  it("l'expédition consomme la réservation : le stock physique baisse, le disponible ne bouge pas", async () => {
    const orderId = await createOrder(database);
    await database.transaction((tx) => reserveOrderStock(tx, { orderId, lines: [{ productId: PRODUCT, quantity: 3 }] }));
    expect(await productQuantity(database)).toBe(12);
    expect(await database.transaction((tx) => consumeOrderReservations(tx, { orderId }))).toBe(3);
    expect(await productQuantity(database)).toBe(12);
    const [level] = await stockByWarehouse(database, { productId: PRODUCT });
    expect(level).toMatchObject({ physical: 12, reserved: 0 });
    const [sale] = await rows<{ reason: string; order_id: string; reservation_id: string | null }>(database, sql`select reason, order_id, reservation_id from stock_movements where reason = 'sale'`);
    expect(sale).toMatchObject({ reason: "sale", order_id: orderId });
    expect(sale.reservation_id).not.toBeNull();
    // Annuler après expédition ne remet rien en stock (ce serait un retour).
    expect(await database.transaction((tx) => releaseOrderStock(tx, { orderId, lines: [{ productId: PRODUCT, quantity: 3 }] }))).toEqual({ released: 0, restocked: 0 });
  });

  it("une commande antérieure au grand livre est restituée ligne par ligne", async () => {
    const orderId = await createOrder(database);
    const result = await database.transaction((tx) => releaseOrderStock(tx, { orderId, lines: [{ productId: OTHER, quantity: 2 }] }));
    expect(result).toEqual({ released: 0, restocked: 2 });
    expect(await productQuantity(database, OTHER)).toBe(5);
    const [movement] = await rows<{ reason: string }>(database, sql`select reason from stock_movements where product_id = ${OTHER} and order_id = ${orderId}`);
    expect(movement.reason).toBe("cancellation");
  });

  it("répartit une réservation sur plusieurs entrepôts et ignore les entrepôts non vendables", async () => {
    await database.execute(sql`insert into warehouses (id, code, name, position) values ('00000000-0000-4000-8000-0000000000aa', 'bouake', 'Bouaké', 1)`);
    await database.execute(sql`insert into warehouses (id, code, name, is_sellable, position) values ('00000000-0000-4000-8000-0000000000bb', 'transit', 'Transit Guangzhou', false, 2)`);
    await database.transaction((tx) => adjustStock(tx, { productId: PRODUCT, warehouseId: "00000000-0000-4000-8000-0000000000aa", delta: 4, reason: "purchase" }));
    expect(await productQuantity(database)).toBe(16);
    await database.transaction((tx) => adjustStock(tx, { productId: PRODUCT, warehouseId: "00000000-0000-4000-8000-0000000000bb", delta: 50, reason: "purchase" }));
    expect(await productQuantity(database)).toBe(16);

    const reservations = await database.transaction((tx) => reserveStock(tx, { productId: PRODUCT, quantity: 14 }));
    expect(reservations.map((r) => r.quantity).sort((a, b) => a - b)).toEqual([2, 12]);
    expect(await productQuantity(database)).toBe(2);
    await database.transaction((tx) => releaseReservations(tx, { reservationIds: reservations.map((r) => r.id!) }));
    expect(await productQuantity(database)).toBe(16);

    // Le transit arrive à Abidjan : transfert vers l'entrepôt principal, le disponible augmente.
    await database.transaction((tx) => transferStock(tx, { productId: PRODUCT, fromWarehouseId: "00000000-0000-4000-8000-0000000000bb", toWarehouseId: LEDGER_DEFAULT_WAREHOUSE_ID, quantity: 20 }));
    expect(await productQuantity(database)).toBe(36);
    await expect(database.transaction((tx) => transferStock(tx, { productId: PRODUCT, fromWarehouseId: "00000000-0000-4000-8000-0000000000aa", toWarehouseId: LEDGER_DEFAULT_WAREHOUSE_ID, quantity: 99 }))).rejects.toBeInstanceOf(StockLedgerError);
  });

  it("inventaire, alerte de stock bas et cohérence finale des compteurs", async () => {
    const counted = await database.transaction((tx) => setPhysicalStock(tx, { productId: PRODUCT, quantity: 8, reference: "INV-2026-11" }));
    expect(counted.delta).toBe(8 - counted.physicalBefore);
    const quantity = await productQuantity(database);
    await database.execute(sql`delete from domain_events where name = 'stock.low'`);
    // Passage sous le seuil (5) : un seul événement stock.low.
    await database.transaction((tx) => reserveStock(tx, { productId: PRODUCT, quantity: quantity - 4 }));
    await database.transaction((tx) => reserveStock(tx, { productId: PRODUCT, quantity: 1 }));
    const events = await rows<{ name: string; payload: { quantity: number; threshold: number } }>(database, sql`select name, payload from domain_events where name = 'stock.low'`);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ quantity: 4, threshold: 5 });

    // Un entrepôt désactivé ne compte plus : recalage explicite des compteurs.
    await database.execute(sql`update warehouses set is_active = false where code = 'bouake'`);
    await database.transaction((tx) => syncCounters(tx, { warehouseId: "00000000-0000-4000-8000-0000000000aa" }));
    await database.execute(sql`update warehouses set is_active = true where code = 'bouake'`);
    await database.transaction((tx) => syncCounters(tx, { warehouseId: "00000000-0000-4000-8000-0000000000aa" }));
    expect(await counterDrifts(database)).toEqual([]);
  });
});

describe("grand livre de stock avant la migration 0015", () => {
  it("applique le comportement historique (compteur produit seul)", async () => {
    resetLedgerReadiness();
    const dir = mkdtempSync(join(tmpdir(), "mbm-ledger-"));
    mkdirSync(join(dir, "meta"));
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql") && Number(name.slice(0, 4)) <= 14)) copyFileSync(join(migrationsDir, file), join(dir, file));
    const journal = JSON.parse(readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf8"));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 14);
    writeFileSync(join(dir, "meta", "_journal.json"), JSON.stringify(journal));

    const database = drizzle(new PGlite({ extensions: { unaccent, pg_trgm } }));
    await migrate(database, { migrationsFolder: dir });
    await seed(database);
    const orderId = await createOrder(database);
    await database.transaction((tx) => reserveOrderStock(tx, { orderId, lines: [{ productId: PRODUCT, quantity: 4 }] }));
    expect(await productQuantity(database)).toBe(6);
    await expect(database.transaction((tx) => reserveStock(tx, { productId: PRODUCT, quantity: 7 }))).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await database.transaction((tx) => releaseOrderStock(tx, { orderId, lines: [{ productId: PRODUCT, quantity: 4 }] }))).toEqual({ released: 0, restocked: 4 });
    expect(await productQuantity(database)).toBe(10);
    resetLedgerReadiness();
  });
});
