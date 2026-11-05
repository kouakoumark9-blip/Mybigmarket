/**
 * Données de démonstration cohérentes, créées par les services de l'application (mêmes règles,
 * mêmes écritures de stock, mêmes événements et même audit qu'en usage réel) :
 * arbre de catégories, marque, attributs, produit simple en promotion, produit à déclinaisons,
 * pack, taxe, bon de réduction, vendeur, clients, commandes à plusieurs étapes, ticket.
 *
 * Idempotent : chaque élément est retrouvé par son slug, son code ou son e-mail avant d'être créé.
 * Jamais en production sans autorisation explicite (voir lib/db/seed.ts).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/core/db";
import type { AdminPrincipal } from "@/server/core/auth/principal";
import { attributeGroups, brands, paymentCountryRules, paymentMethodConfigs, categories, employees, adminRoles, orders, products, promoCodes, sellerProfiles, supportTickets, taxRuleGroups, taxRules, taxRuleGroupRules, users, DEFAULT_SHOP_ID } from "@/lib/db/schema";
import { createAttributeGroup, createBrand, createCategory } from "@/server/modules/catalog/taxonomy/service";
import { createProduct } from "@/server/modules/catalog/products/service";
import { generateProductCombinations, setPackItems } from "@/server/modules/catalog/products/relations";
import { adjust } from "@/server/modules/stock/service";
import { createSpecificPrice, createVoucher } from "@/server/modules/pricing/service";
import { ensureCustomer } from "@/server/modules/checkout/customers";
import { placeOrder } from "@/server/modules/checkout/checkout";
import { changeStatus } from "@/server/modules/orders/service";
import { confirmIntentManually } from "@/server/modules/payments/service";
import { createTicket } from "@/server/modules/support/service";
import { getSetting, updateSettings } from "@/server/core/settings";
import { syncPermissionCatalog } from "@/server/modules/team/permission-catalog";

export const DEMO_SELLER_EMAIL = "atelier-demo@mybigmarket.local";
export const DEMO_EMPLOYEE_EMAIL = "demo-seed@mybigmarket.local";
export const DEMO_CUSTOMERS = [
  { email: "awa.kone@demo.mybigmarket.local", name: "Awa Koné", phone: "+225 07 00 00 00 01", city: "Abidjan", address: "Rue des Jardins, Cocody" },
  { email: "koffi.yao@demo.mybigmarket.local", name: "Koffi Yao", phone: "+225 05 00 00 00 02", city: "Bouaké", address: "Avenue de la Gare" },
  { email: "fatou.diallo@demo.mybigmarket.local", name: "Fatou Diallo", phone: "+225 01 00 00 00 03", city: "Yamoussoukro", address: "Quartier Habitat" },
] as const;
export const DEMO_PRODUCT_SLUGS = { blender: "mixeur-3-vitesses-demo", tshirt: "t-shirt-coton-bio-demo", pack: "pack-cuisine-demo" } as const;

/** Lignes d'un `execute` : tableau (postgres-js, production) ou `{ rows }` (PGlite, tests). */
async function selectRows<T>(database: Db, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await database.execute(query)) as unknown as { rows?: T[] } | T[];
  return Array.isArray(result) ? result : (result.rows ?? []);
}

export type DemoSeedSummary = { categories: number; products: number; variants: number; customers: number; orders: number; orderStatuses: Record<string, number>; tickets: number };

async function seedActor(database: Db): Promise<AdminPrincipal> {
  // Compte de service désactivé : il ne sert qu'à attribuer les écritures dans le journal d'audit.
  let [employee] = await database.select({ id: employees.id }).from(employees).where(eq(employees.email, DEMO_EMPLOYEE_EMAIL)).limit(1);
  if (!employee) {
    await syncPermissionCatalog(database);
    const [role] = await database.select({ id: adminRoles.id }).from(adminRoles).where(eq(adminRoles.code, "super_admin")).limit(1);
    if (!role) throw new Error("Rôle super_admin absent : vérifiez que les migrations sont appliquées.");
    [employee] = await database.insert(employees).values({ email: DEMO_EMPLOYEE_EMAIL, firstName: "Données", lastName: "de démonstration", roleId: role.id, passwordHash: "!", status: "disabled" }).returning({ id: employees.id });
  }
  return { kind: "employee", actorId: employee.id, employeeId: employee.id, apiKeyId: null, label: "Données de démonstration", roleCode: "super_admin", sessionId: null, shopId: DEFAULT_SHOP_ID, permissions: new Set(["*"]) };
}

async function findOrCreateUser(database: Db, input: { email: string; name: string; role: "buyer" | "seller"; passwordHash: string; phone?: string }) {
  const [existing] = await database.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing) return existing.id;
  const [created] = await database.insert(users).values({ email: input.email, name: input.name, role: input.role, status: "active", passwordHash: input.passwordHash, phone: input.phone ?? null }).returning({ id: users.id });
  return created.id;
}

async function category(database: Db, context: { actor: AdminPrincipal }, name: string, parentId: number | null = null) {
  const [existing] = await database.select({ id: categories.id }).from(categories).where(and(eq(categories.name, name), parentId === null ? sql`${categories.parentId} is null` : eq(categories.parentId, parentId))).limit(1);
  if (existing) return existing.id;
  return (await createCategory(database, { name, parentId, isActive: true }, context)).id as number;
}

async function taxGroup(database: Db) {
  const [existing] = await database.select({ id: taxRuleGroups.id }).from(taxRuleGroups).where(eq(taxRuleGroups.name, "TVA Côte d'Ivoire 18 %")).limit(1);
  if (existing) return existing.id;
  const [group] = await database.insert(taxRuleGroups).values({ name: "TVA Côte d'Ivoire 18 %" }).returning({ id: taxRuleGroups.id });
  let [rule] = await database.select({ id: taxRules.id }).from(taxRules).where(eq(taxRules.code, "tva-ci-18")).limit(1);
  rule ??= (await database.insert(taxRules).values({ code: "tva-ci-18", countryCode: "CI", label: "TVA 18 %", ratePercent: "18", isActive: true }).returning({ id: taxRules.id }))[0];
  await database.insert(taxRuleGroupRules).values({ taxRuleGroupId: group.id, taxRuleId: rule.id });
  return group.id;
}

async function productBySlug(database: Db, slug: string) {
  const [row] = await database.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
  return row?.id ?? null;
}

export async function seedDemoCommerce(database: Db, options: { passwordHash: string }): Promise<DemoSeedSummary> {
  const actor = await seedActor(database);
  const context = { actor };

  // Vendeur vérifié.
  const sellerId = await findOrCreateUser(database, { email: DEMO_SELLER_EMAIL, name: "Atelier démo Yiwu", role: "seller", passwordHash: options.passwordHash });
  await database.insert(sellerProfiles).values({ userId: sellerId, university: "Yiwu Industrial & Commercial College", cityChina: "Yiwu", verificationStatus: "approved" }).onConflictDoNothing();

  // Arbre de catégories (3 racines, 3 sous-catégories), marque, taxe.
  const home = await category(database, context, "Maison et cuisine");
  const appliances = await category(database, context, "Petit électroménager", home);
  const fashion = await category(database, context, "Mode");
  const tshirts = await category(database, context, "T-shirts", fashion);
  const electronics = await category(database, context, "Électronique");
  await category(database, context, "Audio", electronics);
  const [brandRow] = await database.select({ id: brands.id }).from(brands).where(eq(brands.name, "Maison Lumière")).limit(1);
  const brandId = brandRow?.id ?? ((await createBrand(database, { name: "Maison Lumière", isActive: true }, context)).id as number);
  const tax = await taxGroup(database);

  // Attributs Couleur × Taille.
  const groupIds: Record<string, string[]> = {};
  for (const group of [
    { code: "couleur-demo", name: "Couleur", displayType: "color" as const, values: [{ code: "noir", name: "Noir", colorHex: "#111111" }, { code: "orange", name: "Orange", colorHex: "#ff8000" }] },
    { code: "taille-demo", name: "Taille", displayType: "select" as const, values: [{ code: "m", name: "M" }, { code: "l", name: "L" }, { code: "xl", name: "XL" }] },
  ]) {
    const [existing] = await database.select({ id: attributeGroups.id }).from(attributeGroups).where(eq(attributeGroups.code, group.code)).limit(1);
    const created = existing ? null : await createAttributeGroup(database, group, context);
    const id = existing?.id ?? (created as { id: string }).id;
    groupIds[group.code] = (await selectRows<{ id: string }>(database, sql`select id from attribute_values where group_id = ${id} order by position, id`)).map((row) => row.id);
  }

  // Produit simple, en promotion de 15 %.
  let blender = await productBySlug(database, DEMO_PRODUCT_SLUGS.blender);
  if (!blender) {
    blender = (await createProduct(database, { title: "Mixeur 3 vitesses 600 W", slug: DEMO_PRODUCT_SLUGS.blender, sellerId, categoryId: appliances, brandId, taxRuleGroupId: tax, priceXof: 18000, status: "approved", initialQuantity: 40, shortDescription: "Bol en verre 1,5 L, lames inox, 3 vitesses et fonction impulsion.", description: "Mixeur compact pour smoothies, sauces et soupes. Bol en verre de 1,5 L, quatre lames en acier inoxydable, trois vitesses et une fonction impulsion. Garantie un an." }, context)).id as string;
    await createSpecificPrice(database, blender, { reductionType: "percent", reductionValue: 15, priority: 1 }, context);
  }

  // Produit à déclinaisons : 2 couleurs × 3 tailles, stock par déclinaison.
  let tshirt = await productBySlug(database, DEMO_PRODUCT_SLUGS.tshirt);
  let variantCount = 0;
  if (!tshirt) {
    tshirt = (await createProduct(database, { title: "T-shirt coton bio", slug: DEMO_PRODUCT_SLUGS.tshirt, sellerId, categoryId: tshirts, taxRuleGroupId: tax, priceXof: 6500, status: "approved", shortDescription: "Coton biologique 180 g/m², coupe droite.", description: "T-shirt en coton biologique de 180 g/m², coupe droite, col rond renforcé. Lavable à 30 °C." }, context)).id as string;
    const generated = await generateProductCombinations(database, tshirt, { attributeValueIds: [...groupIds["couleur-demo"], ...groupIds["taille-demo"]] }, context);
    for (const combination of generated.combinations) await adjust(database, { productId: tshirt, variantId: combination.id, delta: 25, reason: "purchase", note: "Stock initial de démonstration" }, context);
  }
  variantCount = Number((await selectRows<{ n: number }>(database, sql`select count(*)::int as n from product_variants where product_id = ${tshirt}`))[0]?.n ?? 0);

  // Pack : un mixeur + un T-shirt noir M.
  let pack = await productBySlug(database, DEMO_PRODUCT_SLUGS.pack);
  if (!pack) {
    const [{ id: blackM }] = await selectRows<{ id: number }>(database, sql`select id from product_variants where product_id = ${tshirt} order by id limit 1`);
    pack = (await createProduct(database, { title: "Pack cuisine et style", slug: DEMO_PRODUCT_SLUGS.pack, sellerId, categoryId: home, taxRuleGroupId: tax, priceXof: 22000, status: "approved", productType: "pack", shortDescription: "Le mixeur 3 vitesses et un T-shirt coton bio." }, context)).id as string;
    await setPackItems(database, pack, [{ productId: blender, quantity: 1 }, { productId: tshirt, variantId: blackM, quantity: 1 }], context);
  }

  // Bon de bienvenue.
  const [voucher] = await database.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, "BIENVENUE10")).limit(1);
  if (!voucher) await createVoucher(database, { code: "BIENVENUE10", name: "Bienvenue : 10 % sur la première commande", discountType: "percent", discountValue: 10, perCustomerLimit: 1, isActive: true }, context);

  // Clients et commandes à différents stades (virement confirmé manuellement, puis expédition).
  const customerIds: string[] = [];
  for (const customer of DEMO_CUSTOMERS) {
    const userId = await findOrCreateUser(database, { email: customer.email, name: customer.name, role: "buyer", passwordHash: options.passwordHash, phone: customer.phone });
    await ensureCustomer(database, userId);
    customerIds.push(userId);
  }
  const existingOrders = await database.select({ id: orders.id }).from(orders).where(inArray(orders.buyerId, customerIds));
  if (!existingOrders.length) {
    // Commandes réglées par virement : moyen manuel (confirmation par l'équipe, aucun prestataire externe).
    // Il est réactivé s'il a été désactivé, et ses coordonnées sont signalées comme fictives sur une base vierge.
    await database.update(paymentMethodConfigs).set({ isActive: true }).where(and(eq(paymentMethodConfigs.code, "bank_transfer"), eq(paymentMethodConfigs.isActive, false)));
    const [bankTransfer] = await database.select({ id: paymentMethodConfigs.id }).from(paymentMethodConfigs).where(eq(paymentMethodConfigs.code, "bank_transfer")).limit(1);
    if (bankTransfer) await database.update(paymentCountryRules).set({ isAllowed: true }).where(and(eq(paymentCountryRules.paymentMethodId, bankTransfer.id), eq(paymentCountryRules.countryCode, "CI")));
    if (!(await getSetting(database, DEFAULT_SHOP_ID, "payments.bank_transfer.iban"))) {
      await updateSettings(database, { shopId: DEFAULT_SHOP_ID, actor, values: { "payments.bank_transfer.account_holder": "Compte de démonstration", "payments.bank_transfer.bank_name": "Banque de démonstration (ne pas utiliser)", "payments.bank_transfer.iban": "CI00 DEMO 0000 0000 0000 0000 00" } });
    }
    const variants = await selectRows<{ id: number }>(database, sql`select id from product_variants where product_id = ${tshirt} order by id`);
    const plans: Array<{ customer: number; lines: Array<{ productId: string; variantId?: number; quantity: number }>; steps: string[] }> = [
      { customer: 0, lines: [{ productId: blender, quantity: 1 }, { productId: tshirt, variantId: variants[1].id, quantity: 2 }], steps: ["paid", "seller_confirmed", "shipped", "arrived_abidjan", "delivered"] },
      { customer: 1, lines: [{ productId: tshirt, variantId: variants[3].id, quantity: 1 }], steps: ["paid", "seller_confirmed", "shipped"] },
      { customer: 2, lines: [{ productId: pack, quantity: 1 }], steps: ["paid"] },
      { customer: 0, lines: [{ productId: blender, quantity: 2 }], steps: [] },
    ];
    for (const plan of plans) {
      const customer = DEMO_CUSTOMERS[plan.customer];
      const placed = await placeOrder(database, { userId: customerIds[plan.customer], lines: plan.lines, delivery: { method: "delivery", countryCode: "CI", language: "fr", address: { name: customer.name, phone: customer.phone, address: customer.address, city: customer.city } }, paymentMethod: "bank_transfer" });
      for (const step of plan.steps) {
        if (step === "paid") await confirmIntentManually(database, placed.payment.reference, { note: "Virement reçu (démonstration)" }, context);
        else for (const order of placed.orders) await changeStatus(database, order.id, { status: step as never, ...(step === "shipped" ? { trackingNumber: `DEMO-${order.reference}` } : {}) }, context);
      }
    }
  }

  // Ticket du service client lié à une commande.
  const [ticket] = await database.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.email, DEMO_CUSTOMERS[1].email)).limit(1);
  if (!ticket) {
    const [order] = await database.select({ id: orders.id }).from(orders).where(eq(orders.buyerId, customerIds[1])).limit(1);
    await createTicket(database, { shopId: DEFAULT_SHOP_ID, email: DEMO_CUSTOMERS[1].email, name: DEMO_CUSTOMERS[1].name, subject: "Date de livraison à Bouaké", message: "Bonjour, ma commande est expédiée : quand arrivera-t-elle à Bouaké ?", channel: "web", category: "delivery", userId: customerIds[1], orderId: order?.id ?? null }, { type: "customer", userId: customerIds[1] });
  }

  const statuses = await database.select({ status: orders.status, count: sql<number>`count(*)::int` }).from(orders).where(inArray(orders.buyerId, customerIds)).groupBy(orders.status);
  const [categoryCount] = await database.select({ n: sql<number>`count(*)::int` }).from(categories);
  const [ticketCount] = await database.select({ n: sql<number>`count(*)::int` }).from(supportTickets).where(inArray(supportTickets.userId, customerIds));
  return {
    categories: Number(categoryCount.n),
    products: 3,
    variants: variantCount,
    customers: customerIds.length,
    orders: statuses.reduce((sum, row) => sum + Number(row.count), 0),
    orderStatuses: Object.fromEntries(statuses.map((row) => [row.status, Number(row.count)])),
    tickets: Number(ticketCount.n),
  };
}
