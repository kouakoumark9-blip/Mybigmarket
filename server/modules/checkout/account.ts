/**
 * Espace client : profil, adresses (lib/customer-rules : validation, doublons, adresse par
 * défaut unique), commandes du client et export de ses données (RGPD).
 */
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { addressSignature, isValidPhone, isValidTaxNumber, normalizePhone, validateAddress, type AddressInput } from "@/lib/customer-rules";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-rules";
import { customerAddresses, customerGroups, customers, orderItems, orderStatusHistory, orders, payments, users } from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { ensureCustomer } from "@/server/modules/checkout/customers";

type AddressRow = typeof customerAddresses.$inferSelect;
const addressView = (row: AddressRow) => ({
  id: row.id, label: row.label, firstName: row.firstName, lastName: row.lastName, companyName: row.companyName, phone: row.phone, line1: row.line1, line2: row.line2,
  city: row.city, region: row.region, postalCode: row.postalCode, countryCode: row.countryCode, deliveryInstructions: row.deliveryInstructions,
  isDefaultShipping: row.isDefaultShipping, isDefaultBilling: row.isDefaultBilling,
});

export async function getAccount(database: Db, userId: string) {
  const customer = await ensureCustomer(database, userId);
  const [row] = await database.select({ user: users, customer: customers, groupName: customerGroups.name }).from(customers).innerJoin(users, eq(users.id, customers.userId)).leftJoin(customerGroups, eq(customerGroups.id, customers.customerGroupId)).where(eq(customers.id, customer.customerId)).limit(1);
  return {
    name: row.user.name, email: row.user.email, phone: row.user.phone, companyName: row.customer.companyName, taxNumber: row.customer.taxNumber, segment: row.customer.segment,
    preferredLanguage: row.customer.preferredLanguage, preferredCurrency: row.customer.preferredCurrency, group: row.groupName,
    newsletter: Boolean(row.customer.newsletterConsentAt && !row.customer.newsletterOptOutAt), createdAt: row.customer.createdAt.toISOString(),
  };
}

export async function updateAccount(database: Db, userId: string, input: { name?: string; phone?: string | null; companyName?: string | null; taxNumber?: string | null; preferredLanguage?: "fr" | "en" | "pt" | "ar"; newsletter?: boolean }) {
  const customer = await ensureCustomer(database, userId);
  if (input.phone && !isValidPhone(input.phone)) throw errors.validation([{ path: "phone", message: "Numéro de téléphone invalide." }]);
  if (input.taxNumber && !isValidTaxNumber(input.taxNumber)) throw errors.validation([{ path: "taxNumber", message: "Numéro de compte contribuable invalide." }]);
  await database.transaction(async (tx) => {
    if (input.name !== undefined || input.phone !== undefined) {
      await tx.update(users).set({ ...(input.name !== undefined ? { name: input.name } : {}), ...(input.phone !== undefined ? { phone: input.phone ? normalizePhone(input.phone) : null } : {}), updatedAt: new Date() }).where(eq(users.id, userId));
    }
    const now = new Date();
    await tx.update(customers).set({
      ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
      ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber } : {}),
      ...(input.companyName !== undefined || input.taxNumber !== undefined ? { segment: input.companyName || input.taxNumber ? "business" : "individual" } : {}),
      ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
      // Consentement horodaté et révocable : on garde la trace de chaque choix.
      ...(input.newsletter === true ? { newsletterConsentAt: now, newsletterOptOutAt: null } : input.newsletter === false ? { newsletterOptOutAt: now } : {}),
      updatedAt: now, lastActivityAt: now,
    }).where(eq(customers.id, customer.customerId));
  });
  return getAccount(database, userId);
}

/* ─────────────────────────────  Adresses  ───────────────────────────── */

export async function listAddresses(database: Db, userId: string) {
  const customer = await ensureCustomer(database, userId);
  const rows = await database.select().from(customerAddresses).where(and(eq(customerAddresses.customerId, customer.customerId), isNull(customerAddresses.deletedAt))).orderBy(desc(customerAddresses.isDefaultShipping), asc(customerAddresses.createdAt));
  return rows.map(addressView);
}

async function clearDefaults(executor: Executor, customerId: string, flags: { shipping: boolean; billing: boolean }, exceptId?: string) {
  const scope = (column: AnyPgColumn) => and(eq(customerAddresses.customerId, customerId), eq(column, true), exceptId ? ne(customerAddresses.id, exceptId) : undefined);
  if (flags.shipping) await executor.update(customerAddresses).set({ isDefaultShipping: false }).where(scope(customerAddresses.isDefaultShipping));
  if (flags.billing) await executor.update(customerAddresses).set({ isDefaultBilling: false }).where(scope(customerAddresses.isDefaultBilling));
}

export async function createAddress(database: Db, userId: string, input: AddressInput & { deliveryInstructions?: string | null }) {
  const customer = await ensureCustomer(database, userId);
  const checked = validateAddress(input);
  if (!checked.valid) throw errors.validation(checked.issues.map((issue) => ({ path: issue.field, message: issue.message })));
  return database.transaction(async (tx) => {
    const existing = await tx.select().from(customerAddresses).where(and(eq(customerAddresses.customerId, customer.customerId), isNull(customerAddresses.deletedAt)));
    if (existing.length >= 20) throw errors.rule("20 adresses au maximum par compte.");
    if (existing.some((row) => addressSignature(row) === addressSignature(checked.value))) throw errors.conflict("Cette adresse est déjà enregistrée.");
    const first = existing.length === 0;
    const value = { ...checked.value, isDefaultShipping: checked.value.isDefaultShipping || first, isDefaultBilling: checked.value.isDefaultBilling || first };
    await clearDefaults(tx, customer.customerId, { shipping: value.isDefaultShipping, billing: value.isDefaultBilling });
    const [row] = await tx.insert(customerAddresses).values({ ...value, customerId: customer.customerId, phoneNormalized: value.phone, deliveryInstructions: input.deliveryInstructions ?? null }).returning();
    return addressView(row);
  });
}

export async function updateAddress(database: Db, userId: string, id: string, input: AddressInput & { deliveryInstructions?: string | null }) {
  const customer = await ensureCustomer(database, userId);
  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(customerAddresses).where(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, customer.customerId), isNull(customerAddresses.deletedAt))).limit(1);
    if (!current) throw errors.notFound("Adresse", id);
    const checked = validateAddress({ ...current, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) });
    if (!checked.valid) throw errors.validation(checked.issues.map((issue) => ({ path: issue.field, message: issue.message })));
    await clearDefaults(tx, customer.customerId, { shipping: checked.value.isDefaultShipping, billing: checked.value.isDefaultBilling }, id);
    const [row] = await tx.update(customerAddresses).set({ ...checked.value, phoneNormalized: checked.value.phone, ...(input.deliveryInstructions !== undefined ? { deliveryInstructions: input.deliveryInstructions } : {}), updatedAt: new Date() }).where(eq(customerAddresses.id, id)).returning();
    return addressView(row);
  });
}

export async function deleteAddress(database: Db, userId: string, id: string) {
  const customer = await ensureCustomer(database, userId);
  const [row] = await database.update(customerAddresses).set({ deletedAt: new Date(), isDefaultShipping: false, isDefaultBilling: false }).where(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, customer.customerId), isNull(customerAddresses.deletedAt))).returning({ id: customerAddresses.id });
  if (!row) throw errors.notFound("Adresse", id);
}

/* ─────────────────────────────  Commandes du client  ───────────────────────────── */

const statusLabel = (status: string) => ORDER_STATUS_LABELS[status as OrderStatus] ?? status;

export async function listCustomerOrders(database: Db, userId: string, page: number) {
  const rows = await database.select().from(orders).where(and(eq(orders.buyerId, userId), isNull(orders.deletedAt))).orderBy(desc(orders.createdAt)).limit(20).offset((page - 1) * 20);
  const items = rows.length ? await database.select({ orderId: orderItems.orderId, quantity: orderItems.quantity }).from(orderItems).where(inArray(orderItems.orderId, rows.map((row) => row.id))) : [];
  return rows.map((row) => ({
    id: row.id, reference: row.reference, status: row.status, statusLabel: statusLabel(row.status), totalXof: row.totalXof, discountXof: row.discountXof, itemCount: items.filter((item) => item.orderId === row.id).reduce((sum, item) => sum + item.quantity, 0),
    createdAt: row.createdAt.toISOString(), paymentExpiresAt: row.paymentExpiresAt?.toISOString() ?? null, trackingNumber: row.trackingNumber,
  }));
}

export async function getCustomerOrder(database: Db, userId: string, idOrReference: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrReference);
  const [order] = await database.select().from(orders).where(and(eq(orders.buyerId, userId), isNull(orders.deletedAt), isUuid ? eq(orders.id, idOrReference) : eq(orders.reference, idOrReference))).limit(1);
  if (!order) throw errors.notFound("Commande", idOrReference);
  const [items, history, payment] = await Promise.all([
    database.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id)),
    database.select({ toStatus: orderStatusHistory.toStatus, createdAt: orderStatusHistory.createdAt }).from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id)).orderBy(asc(orderStatusHistory.createdAt)),
    database.select({ status: payments.status, method: payments.method, amountXof: payments.amountXof }).from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)).limit(1),
  ]);
  return {
    id: order.id, reference: order.reference, status: order.status, statusLabel: statusLabel(order.status), createdAt: order.createdAt.toISOString(),
    deliveryMethod: order.deliveryMethod, deliveryAddress: order.deliveryAddress, trackingNumber: order.trackingNumber, paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null,
    totals: { subtotalExclTaxXof: order.subtotalXof, discountXof: order.discountXof, taxXof: order.taxXof, shippingXof: order.shippingCostXof, totalXof: order.totalXof },
    vouchers: order.appliedVouchers,
    items: items.map((item) => ({ productId: item.productId, variantId: item.variantId, title: item.productTitle, sku: item.productSku, variant: item.variantSnapshot?.label ?? null, quantity: item.quantity, unitPriceExclTaxXof: item.unitPriceXof, taxRatePercent: Number(item.taxRatePercent), discountXof: item.discountXof, totalXof: item.lineTotalXof || item.unitPriceXof * item.quantity })),
    history: history.map((entry) => ({ status: entry.toStatus, label: statusLabel(entry.toStatus), at: entry.createdAt.toISOString() })),
    payment: payment[0] ?? null,
  };
}

/** Export des données personnelles du client (droit d'accès et de portabilité). */
export async function exportAccount(database: Db, userId: string) {
  const customer = await ensureCustomer(database, userId);
  const [profile, addresses, orderRows] = await Promise.all([
    getAccount(database, userId),
    listAddresses(database, userId),
    database.select().from(orders).where(eq(orders.buyerId, userId)).orderBy(desc(orders.createdAt)),
  ]);
  return {
    exportedAt: new Date().toISOString(), customerId: customer.customerId, profile, addresses,
    orders: orderRows.map((row) => ({ reference: row.reference, status: row.status, totalXof: row.totalXof, createdAt: row.createdAt.toISOString(), deliveryAddress: row.deliveryAddress })),
  };
}
