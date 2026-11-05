/**
 * Statistiques (étape 7). Les agrégats quotidiens (`stats_daily`, `stats_daily_products`) sont
 * calculés par quelques requêtes ensemblistes, recalculables à tout moment sans risque : un jour
 * recalculé remplace l'ancien. Les écrans lisent ces agrégats (rapide, même sur des années).
 *
 * Jour = date UTC, qui est aussi l'heure d'Abidjan. Une commande est « valide » quand elle est payée
 * ou confirmée (paiement à la livraison), jusqu'au versement au vendeur ; les commandes annulées,
 * remboursées ou en attente de paiement ne comptent pas dans le chiffre d'affaires.
 */
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { DEFAULT_SHOP_ID, statsDaily } from "@/lib/db/schema";
import type { Db } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { toCsv } from "@/server/core/csv";

export const VALID_ORDER_STATUSES = ["paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "seller_paid"] as const;
export const MAX_RANGE_DAYS = 400;
/** Au-delà, les chiffres du jour sont recalculés à la lecture. */
const TODAY_STALE_MS = 10 * 60_000;

const VALID = sql.join(VALID_ORDER_STATUSES.map((status) => sql`${status}`), sql`, `);
const rowsOf = <T>(result: unknown) => (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (day: string, delta: number) => isoDay(new Date(Date.parse(`${day}T00:00:00.000Z`) + delta * 86_400_000));
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export type DayRange = { from: string; to: string };

/** Période demandée, par défaut les 30 derniers jours ; bornée à 400 jours. */
export function resolveRange(input: { from?: string; to?: string }, now = new Date()): DayRange {
  const to = input.to ?? isoDay(now);
  const from = input.from ?? addDays(to, -29);
  if (from > to) throw errors.validation([{ path: "from", message: "La date de début doit précéder la date de fin." }]);
  if (daysBetween(from, to) > MAX_RANGE_DAYS) throw errors.validation([{ path: "from", message: `${MAX_RANGE_DAYS} jours au plus par période.` }]);
  return { from, to };
}

/* ─────────────────────────────  Calcul  ───────────────────────────── */

/** Recalcule les agrégats de la période (remplace les jours existants). */
export async function refreshDailyStats(database: Db, range: DayRange, shopId = DEFAULT_SHOP_ID) {
  const { from, to } = resolveRange(range);
  const start = sql`(${from}::date::timestamp at time zone 'UTC')`;
  const end = sql`((${to}::date + 1)::timestamp at time zone 'UTC')`;
  const started = Date.now();
  await database.transaction(async (tx) => {
    await tx.execute(sql`delete from stats_daily where shop_id = ${shopId}::uuid and day between ${from}::date and ${to}::date`);
    await tx.execute(sql`delete from stats_daily_products where shop_id = ${shopId}::uuid and day between ${from}::date and ${to}::date`);
    await tx.execute(sql`
      insert into stats_daily (shop_id, day, orders_count, valid_orders_count, revenue_xof, shipping_xof, items_sold, cancelled_count, refunded_xof, new_customers, buyers_count, carts_created, computed_at)
      select ${shopId}::uuid, d.day::date,
        coalesce(o.orders_count, 0), coalesce(o.valid_orders, 0), coalesce(o.revenue, 0), coalesce(o.shipping, 0), coalesce(i.items, 0),
        coalesce(o.cancelled, 0), coalesce(r.refunded, 0), coalesce(c.customers, 0), coalesce(o.buyers, 0), coalesce(k.carts, 0), now()
      from generate_series(${from}::date, ${to}::date, interval '1 day') as d(day)
      left join (
        select (created_at at time zone 'UTC')::date as day, count(*)::int as orders_count,
          count(*) filter (where status in (${VALID}))::int as valid_orders,
          coalesce(sum(total_xof) filter (where status in (${VALID})), 0)::bigint as revenue,
          coalesce(sum(shipping_cost_xof) filter (where status in (${VALID})), 0)::bigint as shipping,
          count(*) filter (where status = 'cancelled')::int as cancelled,
          count(distinct buyer_id) filter (where status in (${VALID}))::int as buyers
        from orders where deleted_at is null and created_at >= ${start} and created_at < ${end} group by 1
      ) o on o.day = d.day::date
      left join (
        select (o.created_at at time zone 'UTC')::date as day, coalesce(sum(oi.quantity - oi.returned_quantity), 0)::int as items
        from order_items oi join orders o on o.id = oi.order_id
        where o.deleted_at is null and o.status in (${VALID}) and o.created_at >= ${start} and o.created_at < ${end} group by 1
      ) i on i.day = d.day::date
      left join (
        select (coalesce(processed_at, created_at) at time zone 'UTC')::date as day, coalesce(sum(amount_xof), 0)::bigint as refunded
        from refunds where status = 'succeeded' and coalesce(processed_at, created_at) >= ${start} and coalesce(processed_at, created_at) < ${end} group by 1
      ) r on r.day = d.day::date
      left join (
        select (created_at at time zone 'UTC')::date as day, count(*)::int as customers from customers where created_at >= ${start} and created_at < ${end} group by 1
      ) c on c.day = d.day::date
      left join (
        select (created_at at time zone 'UTC')::date as day, count(*)::int as carts from carts where created_at >= ${start} and created_at < ${end} group by 1
      ) k on k.day = d.day::date`);
    await tx.execute(sql`
      insert into stats_daily_products (shop_id, day, product_id, seller_id, category_id, units, revenue_xof, orders_count)
      select ${shopId}::uuid, (o.created_at at time zone 'UTC')::date, oi.product_id, (array_agg(oi.seller_id))[1], p.category_id,
        coalesce(sum(oi.quantity - oi.returned_quantity), 0)::int,
        coalesce(sum(coalesce(nullif(oi.line_total_xof, 0), oi.quantity * oi.unit_price_xof)), 0)::bigint,
        count(distinct oi.order_id)::int
      from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
      where o.deleted_at is null and o.status in (${VALID}) and o.created_at >= ${start} and o.created_at < ${end}
      group by 2, oi.product_id, p.category_id`);
  });
  return { from, to, days: daysBetween(from, to), ms: Date.now() - started };
}

/** Calcule les jours absents de la période, et le jour courant s'il date de plus de 10 minutes. */
async function ensureComputed(database: Db, range: DayRange, shopId: string, now = new Date()) {
  const rows = await database.select({ day: statsDaily.day, computedAt: statsDaily.computedAt }).from(statsDaily)
    .where(and(eq(statsDaily.shopId, shopId), gte(statsDaily.day, range.from), lte(statsDaily.day, range.to)));
  const today = isoDay(now);
  const known = new Map(rows.map((row) => [row.day, row.computedAt]));
  const expected = daysBetween(range.from, range.to);
  if (known.size < expected) {
    // Seule la partie manquante est recalculée (bornes min/max des jours absents).
    const missing: string[] = [];
    for (let index = 0; index < expected; index += 1) { const day = addDays(range.from, index); if (!known.has(day)) missing.push(day); }
    await refreshDailyStats(database, { from: missing[0], to: missing[missing.length - 1] }, shopId);
  }
  const todayComputed = known.get(today);
  if (range.from <= today && today <= range.to && todayComputed && now.getTime() - todayComputed.getTime() > TODAY_STALE_MS) {
    await refreshDailyStats(database, { from: today, to: today }, shopId);
  }
}

/* ─────────────────────────────  Lecture  ───────────────────────────── */

type Totals = { ordersCount: number; validOrdersCount: number; revenueXof: number; shippingXof: number; itemsSold: number; cancelledCount: number; refundedXof: number; newCustomers: number; cartsCreated: number };
const ZERO: Totals = { ordersCount: 0, validOrdersCount: 0, revenueXof: 0, shippingXof: 0, itemsSold: 0, cancelledCount: 0, refundedXof: 0, newCustomers: 0, cartsCreated: 0 };

async function dailyRows(database: Db, range: DayRange, shopId: string) {
  await ensureComputed(database, range, shopId);
  return database.select().from(statsDaily).where(and(eq(statsDaily.shopId, shopId), gte(statsDaily.day, range.from), lte(statsDaily.day, range.to))).orderBy(asc(statsDaily.day));
}

function sum(rows: Array<typeof statsDaily.$inferSelect>): Totals {
  const totals = { ...ZERO };
  for (const row of rows) for (const key of Object.keys(ZERO) as Array<keyof Totals>) totals[key] += Number(row[key]);
  return totals;
}

const withRatios = (totals: Totals, buyers: number) => ({
  ...totals, buyers,
  averageOrderXof: totals.validOrdersCount ? Math.round(totals.revenueXof / totals.validOrdersCount) : 0,
  /** Paniers transformés en commande valide (taux de conversion du panier). */
  cartConversionPercent: totals.cartsCreated ? Math.round((totals.validOrdersCount / totals.cartsCreated) * 1000) / 10 : null,
});

/** Acheteurs distincts de la période (un client qui commande deux jours ne compte qu'une fois). */
async function distinctBuyers(database: Db, range: DayRange) {
  const result = await database.execute(sql`select count(distinct buyer_id)::int as n from orders
    where deleted_at is null and status in (${VALID}) and created_at >= (${range.from}::date::timestamp at time zone 'UTC') and created_at < ((${range.to}::date + 1)::timestamp at time zone 'UTC')`);
  return Number(rowsOf<{ n: number }>(result)[0]?.n ?? 0);
}

const change = (current: number, previous: number) => (previous ? Math.round(((current - previous) / previous) * 1000) / 10 : null);

/** Tableau de bord : totaux, période précédente de même durée, évolution, série quotidienne. */
export async function statsOverview(database: Db, input: { from?: string; to?: string }, shopId = DEFAULT_SHOP_ID) {
  const range = resolveRange(input);
  const length = daysBetween(range.from, range.to);
  const previousRange = { from: addDays(range.from, -length), to: addDays(range.from, -1) };
  const [rows, previousRows, buyers, previousBuyers] = await Promise.all([
    dailyRows(database, range, shopId), dailyRows(database, previousRange, shopId), distinctBuyers(database, range), distinctBuyers(database, previousRange),
  ]);
  const totals = withRatios(sum(rows), buyers);
  const previous = withRatios(sum(previousRows), previousBuyers);
  return {
    from: range.from, to: range.to, days: length,
    totals, previous: { from: previousRange.from, to: previousRange.to, ...previous },
    changes: { revenueXof: change(totals.revenueXof, previous.revenueXof), validOrdersCount: change(totals.validOrdersCount, previous.validOrdersCount), averageOrderXof: change(totals.averageOrderXof, previous.averageOrderXof), newCustomers: change(totals.newCustomers, previous.newCustomers), itemsSold: change(totals.itemsSold, previous.itemsSold) },
    series: rows.map((row) => ({ day: row.day, ordersCount: row.ordersCount, validOrdersCount: row.validOrdersCount, revenueXof: Number(row.revenueXof), itemsSold: row.itemsSold, newCustomers: row.newCustomers, cartsCreated: row.cartsCreated, refundedXof: Number(row.refundedXof) })),
    computedAt: rows.reduce<Date | null>((oldest, row) => (!oldest || row.computedAt < oldest ? row.computedAt : oldest), null),
  };
}

export type RankingQuery = { from?: string; to?: string; limit: number; sort: "revenue" | "units" };

async function ranking(database: Db, query: RankingQuery, shopId: string, dimension: "product" | "category" | "seller") {
  const range = resolveRange(query);
  await ensureComputed(database, range, shopId);
  const order = query.sort === "units" ? sql`units desc, revenue desc` : sql`revenue desc, units desc`;
  const where = sql`s.shop_id = ${shopId}::uuid and s.day between ${range.from}::date and ${range.to}::date`;
  const result = dimension === "product"
    ? await database.execute(sql`select p.id, p.title, p.reference, p.slug, sum(s.units)::int as units, sum(s.revenue_xof)::bigint as revenue, sum(s.orders_count)::int as orders
        from stats_daily_products s join products p on p.id = s.product_id where ${where} group by p.id order by ${order} limit ${query.limit}`)
    : dimension === "category"
      ? await database.execute(sql`select c.id, c.name, c.slug, sum(s.units)::int as units, sum(s.revenue_xof)::bigint as revenue, sum(s.orders_count)::int as orders, count(distinct s.product_id)::int as products
          from stats_daily_products s join categories c on c.id = s.category_id where ${where} group by c.id order by ${order} limit ${query.limit}`)
      : await database.execute(sql`select u.id, u.name, u.email, sum(s.units)::int as units, sum(s.revenue_xof)::bigint as revenue, sum(s.orders_count)::int as orders, count(distinct s.product_id)::int as products
          from stats_daily_products s join users u on u.id = s.seller_id where ${where} group by u.id order by ${order} limit ${query.limit}`);
  const rows = rowsOf<Record<string, unknown>>(result);
  return { from: range.from, to: range.to, data: rows.map(({ revenue, ...row }) => ({ ...row, units: Number(row.units), orders: Number(row.orders), revenueXof: Number(revenue) })) };
}

export const bestProducts = (database: Db, query: RankingQuery, shopId = DEFAULT_SHOP_ID) => ranking(database, query, shopId, "product");
export const bestCategories = (database: Db, query: RankingQuery, shopId = DEFAULT_SHOP_ID) => ranking(database, query, shopId, "category");
export const bestSellers = (database: Db, query: RankingQuery, shopId = DEFAULT_SHOP_ID) => ranking(database, query, shopId, "seller");

/** Meilleurs clients de la période (calcul direct : commandes valides par acheteur). */
export async function bestCustomers(database: Db, query: { from?: string; to?: string; limit: number }) {
  const range = resolveRange(query);
  const result = await database.execute(sql`select u.id, u.name, u.email, count(*)::int as orders, sum(o.total_xof)::bigint as revenue, max(o.created_at) as last_order_at
    from orders o join users u on u.id = o.buyer_id
    where o.deleted_at is null and o.status in (${VALID}) and o.created_at >= (${range.from}::date::timestamp at time zone 'UTC') and o.created_at < ((${range.to}::date + 1)::timestamp at time zone 'UTC')
    group by u.id order by revenue desc, orders desc limit ${query.limit}`);
  return {
    from: range.from, to: range.to,
    data: rowsOf<{ id: string; name: string; email: string; orders: number; revenue: number; last_order_at: Date | string }>(result).map((row) => ({
      id: row.id, name: row.name, email: row.email, orders: Number(row.orders), revenueXof: Number(row.revenue), lastOrderAt: new Date(row.last_order_at).toISOString(),
    })),
  };
}

/** Série quotidienne au format CSV (tableur). */
export async function dailyStatsCsv(database: Db, input: { from?: string; to?: string }, shopId = DEFAULT_SHOP_ID) {
  const rows = await dailyRows(database, resolveRange(input), shopId);
  return toCsv(["jour", "commandes", "commandes_valides", "chiffre_affaires_xof", "livraison_xof", "articles_vendus", "annulations", "rembourse_xof", "nouveaux_clients", "acheteurs", "paniers_crees"],
    rows.map((row) => [row.day, row.ordersCount, row.validOrdersCount, Number(row.revenueXof), Number(row.shippingXof), row.itemsSold, row.cancelledCount, Number(row.refundedXof), row.newCustomers, row.buyersCount, row.cartsCreated]));
}
