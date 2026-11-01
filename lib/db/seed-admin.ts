import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import catalog from "@/drizzle/seed/products.json";
import { getDb } from "@/lib/db";
import {
  adminPermissions,
  adminRoles,
  brands,
  categories,
  customerGroups,
  employees,
  exchangeRates,
  orderStatuses,
  paymentCountryRules,
  paymentMethodConfigs,
  productAttributes,
  productImages,
  productKeyAttributes,
  productKeywords,
  productLeadTimes,
  productPackaging,
  productPriceTiers,
  productVariants,
  products,
  relatedProducts,
  rolePermissions,
  sellerProfiles,
  settings,
  shippingMethods,
  shippingRates,
  shippingRules,
  shippingZones,
  suppliers,
  users,
} from "@/lib/db/schema";

const permissionSeeds = [
  ["dashboard.read", "Consulter le tableau de bord", "dashboard", "read"],
  ["orders.read", "Consulter les commandes", "orders", "read"],
  ["orders.update", "Modifier les commandes", "orders", "update"],
  ["orders.status.update", "Changer les statuts", "orders", "status.update"],
  ["orders.documents.manage", "Gérer factures et avoirs", "orders", "documents.manage"],
  ["orders.export", "Exporter les commandes (CSV)", "orders", "export"],
  ["catalog.products.read", "Consulter les produits", "catalog.products", "read"],
  ["catalog.products.create", "Créer des produits", "catalog.products", "create"],
  ["catalog.products.update", "Modifier les produits", "catalog.products", "update"],
  ["catalog.products.publish", "Publier les produits", "catalog.products", "publish"],
  ["catalog.products.delete", "Supprimer les produits", "catalog.products", "delete"],
  ["catalog.categories.manage", "Gérer les catégories", "catalog.categories", "manage"],
  ["catalog.brands.manage", "Gérer les marques", "catalog.brands", "manage"],
  ["catalog.suppliers.manage", "Gérer les fournisseurs", "catalog.suppliers", "manage"],
  ["catalog.attributes.manage", "Gérer les attributs", "catalog.attributes", "manage"],
  ["catalog.stock.read", "Consulter le stock", "catalog.stock", "read"],
  ["catalog.stock.update", "Modifier le stock", "catalog.stock", "update"],
  ["catalog.reviews.moderate", "Modérer les avis", "catalog.reviews", "moderate"],
  ["customers.read", "Consulter les clients", "customers", "read"],
  ["customers.update", "Modifier les clients", "customers", "update"],
  ["support.messages.read", "Consulter les conversations", "support.messages", "read"],
  ["support.messages.reply", "Répondre aux conversations", "support.messages", "reply"],
  ["support.disputes.manage", "Gérer les litiges et retours", "support.disputes", "manage"],
  ["shipping.read", "Consulter le transport", "shipping", "read"],
  ["shipping.manage", "Configurer le transport", "shipping", "manage"],
  ["payments.read", "Consulter les paiements", "payments", "read"],
  ["payments.manage", "Configurer les paiements", "payments", "manage"],
  ["appearance.manage", "Gérer l’apparence et le CMS", "appearance", "manage"],
  ["marketing.manage", "Gérer les promotions", "marketing", "manage"],
  ["analytics.read", "Consulter les statistiques", "analytics", "read"],
  ["settings.read", "Consulter les paramètres", "settings", "read"],
  ["settings.manage", "Modifier les paramètres", "settings", "manage"],
  ["employees.manage", "Gérer les employés", "employees", "manage"],
  ["roles.manage", "Gérer les rôles et permissions", "roles", "manage"],
  ["logs.read", "Consulter les journaux", "logs", "read"],
  ["system.read", "Consulter les informations système", "system", "read"],
] as const;

const roleSeeds = [
  { code: "super_admin", name: "SuperAdmin", description: "Accès complet à l’administration." },
  { code: "catalog_manager", name: "Gestionnaire catalogue", description: "Gestion du catalogue, des médias, des attributs et du stock." },
  { code: "orders_manager", name: "Gestionnaire commandes", description: "Gestion des commandes, factures, clients et statuts." },
  { code: "logistician", name: "Logisticien", description: "Gestion des expéditions, transporteurs et règles logistiques." },
  { code: "customer_service", name: "Service client", description: "Gestion des conversations, clients, retours et litiges." },
] as const;

const rolePermissionCodes: Record<string, string[]> = {
  super_admin: permissionSeeds.map(([code]) => code),
  catalog_manager: ["dashboard.read", "catalog.products.read", "catalog.products.create", "catalog.products.update", "catalog.products.publish", "catalog.categories.manage", "catalog.brands.manage", "catalog.suppliers.manage", "catalog.attributes.manage", "catalog.stock.read", "catalog.stock.update", "catalog.reviews.moderate", "analytics.read"],
  orders_manager: ["dashboard.read", "orders.read", "orders.update", "orders.status.update", "orders.documents.manage", "orders.export", "customers.read", "customers.update", "payments.read", "analytics.read"],
  logistician: ["dashboard.read", "orders.read", "orders.status.update", "catalog.stock.read", "catalog.stock.update", "shipping.read", "shipping.manage", "analytics.read"],
  customer_service: ["dashboard.read", "orders.read", "customers.read", "customers.update", "support.messages.read", "support.messages.reply", "support.disputes.manage"],
};

const orderStatusSeeds = [
  ["awaiting_payment", "En attente de paiement", "#d97706", false],
  ["paid_escrow", "Paiement confirmé", "#2563eb", false],
  ["seller_confirmed", "Confirmée par le vendeur", "#0e7490", false],
  ["shipped", "Expédiée", "#7c3aed", false],
  ["arrived_abidjan", "Arrivée à Abidjan", "#0891b2", false],
  ["delivered", "Livrée", "#15803d", true],
  ["cancelled", "Annulée", "#b91c1c", true],
  ["dispute", "Litige ouvert", "#be123c", false],
] as const;

const westAfricanCountries = ["CI", "BJ", "BF", "CV", "GM", "GH", "GN", "GW", "LR", "ML", "MR", "NE", "NG", "SN", "SL", "TG"];

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variable obligatoire absente : ${name}`);
  return value;
}

async function ensureRoleAndPermissionData(db: ReturnType<typeof getDb>) {
  for (const role of roleSeeds) await db.insert(adminRoles).values(role).onConflictDoNothing();
  for (const [code, label, resource, action] of permissionSeeds) {
    await db.insert(adminPermissions).values({ code, label, resource, action }).onConflictDoNothing();
  }
  const roles = await db.select().from(adminRoles);
  const permissions = await db.select().from(adminPermissions);
  const roleIds = new Map(roles.map((role) => [role.code, role.id]));
  const permissionIds = new Map(permissions.map((permission) => [permission.code, permission.id]));
  const links = Object.entries(rolePermissionCodes).flatMap(([roleCode, codes]) => {
    const roleId = roleIds.get(roleCode);
    if (!roleId) throw new Error(`Rôle manquant après seed : ${roleCode}`);
    return codes.map((code) => {
      const permissionId = permissionIds.get(code);
      if (!permissionId) throw new Error(`Permission manquante après seed : ${code}`);
      return { roleId, permissionId };
    });
  });
  if (links.length) await db.insert(rolePermissions).values(links).onConflictDoNothing();
  return roleIds;
}

async function ensureSuperAdmin(db: ReturnType<typeof getDb>, roleId: string) {
  const email = requiredEnv("SEED_SUPERADMIN_EMAIL").toLowerCase();
  const password = requiredEnv("SEED_SUPERADMIN_PASSWORD");
  if (password.length < 16) throw new Error("SEED_SUPERADMIN_PASSWORD doit contenir au moins 16 caractères.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("SEED_SUPERADMIN_EMAIL n’est pas une adresse valide.");
  const [existing] = await db.select().from(employees).where(eq(employees.email, email)).limit(1);
  if (existing) {
    if (existing.roleId !== roleId) throw new Error("Cette adresse existe déjà pour un autre rôle. Utilisez une adresse dédiée au SuperAdmin.");
    if (existing.status !== "active") throw new Error("Le compte SuperAdmin existe mais n’est pas actif; faites-le réactiver par une procédure contrôlée.");
    return existing.id;
  }
  const fullName = (process.env.SEED_SUPERADMIN_NAME || "Admin").trim().split(/\s+/);
  const firstName = fullName.shift() || "Admin";
  const lastName = fullName.join(" ");
  const passwordHash = await bcrypt.hash(password, 12);
  const [created] = await db.insert(employees).values({
    roleId,
    email,
    firstName,
    lastName,
    passwordHash,
    status: "active",
    mustChangePassword: false,
    passwordChangedAt: new Date(),
    updatedAt: new Date(),
  }).returning({ id: employees.id });
  if (!created) throw new Error("La création du SuperAdmin n’a pas renvoyé d’identifiant.");
  return created.id;
}

async function ensureCatalogSeller(db: ReturnType<typeof getDb>) {
  const email = "catalog-import@mybigmarket.invalid";
  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    const passwordHash = await bcrypt.hash(randomBytes(48).toString("base64url"), 12);
    [user] = await db.insert(users).values({
      name: "Import catalogue interne",
      email,
      passwordHash,
      role: "seller",
      status: "suspended",
    }).onConflictDoNothing().returning();
    if (!user) [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  }
  if (!user) throw new Error("Impossible de créer le compte technique de liaison du catalogue.");
  await db.insert(sellerProfiles).values({
    userId: user.id,
    university: "Profil interne non public",
    cityChina: "Shenzhen",
    verificationStatus: "pending",
    ratingAvg: "0",
    ratingCount: 0,
  }).onConflictDoNothing();
  return user.id;
}

async function seedCatalog(db: ReturnType<typeof getDb>, sellerId: string) {
  const categorySlugs = [...new Set(catalog.map((product) => product.category.slug))];
  for (const slug of categorySlugs) {
    const row = catalog.find((product) => product.category.slug === slug)!;
    await db.insert(categories).values({ name: row.category.name, slug, isActive: true }).onConflictDoNothing();
  }
  await db.insert(brands).values({ name: "Other", slug: "other-generic", isActive: true }).onConflictDoNothing();
  const allCategories = await db.select().from(categories);
  const categoryIds = new Map(allCategories.map((row) => [row.slug, row.id]));
  const [brand] = await db.select().from(brands).where(eq(brands.slug, "other-generic")).limit(1);
  if (!brand) throw new Error("Marque de base absente.");

  const supplierIds = new Map<string, string>();
  for (const product of catalog) {
    if (!product.supplier) continue;
    await db.insert(suppliers).values({ ...product.supplier, isActive: true }).onConflictDoNothing();
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.slug, product.supplier.slug)).limit(1);
    if (!supplier) throw new Error(`Fournisseur introuvable après seed : ${product.supplier.slug}`);
    supplierIds.set(product.supplier.slug, supplier.id);
  }

  const productIds = new Map<string, string>();
  for (const product of catalog) {
    const categoryId = categoryIds.get(product.category.slug);
    if (!categoryId) throw new Error(`Catégorie introuvable : ${product.category.slug}`);
    const supplierId = product.supplier ? supplierIds.get(product.supplier.slug) : undefined;
    const [created] = await db.insert(products).values({
      sellerId,
      supplierId,
      brandId: brand.id,
      categoryId,
      sku: product.sku,
      title: product.title,
      slug: product.slug,
      shortDescription: product.shortDescription,
      description: product.description,
      internalNote: product.internalNote,
      priceXof: product.priceXof,
      purchasePriceXof: null,
      quantity: 0,
      minimumQuantity: product.minimumQuantity,
      leadTimeDays: product.leadTimeDays,
      status: "draft",
      isFeatured: false,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      publishedAt: null,
      updatedAt: new Date(),
    }).onConflictDoNothing().returning({ id: products.id });
    if (!created) {
      const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.slug, product.slug)).limit(1);
      if (!existing) throw new Error(`Produit absent après tentative de seed : ${product.slug}`);
      productIds.set(product.slug, existing.id);
      continue;
    }
    productIds.set(product.slug, created.id);

    if (product.images.length) {
      await db.insert(productImages).values(product.images.map((image, sortOrder) => ({
        productId: created.id,
        url: image.url,
        alt: image.alt,
        sortOrder,
        isPrimary: Boolean(image.isPrimary),
      })));
    }
    if (product.variants.length) {
      await db.insert(productVariants).values(product.variants.map((variant) => ({
        productId: created.id,
        name: variant.name,
        value: variant.value,
        attributes: variant.attributes,
        priceXof: variant.priceXof,
        stock: 0,
        imageUrl: variant.imageUrl,
        isActive: true,
      })));
    }
    if (product.tiers.length) {
      await db.insert(productPriceTiers).values(product.tiers.map((tier, sortOrder) => ({
        productId: created.id,
        minimumQuantity: tier.minimumQuantity,
        maximumQuantity: tier.maximumQuantity,
        unitPriceXof: tier.unitPriceXof,
        sortOrder,
      })));
    }
    const createdAttributes = product.attributes.length
      ? await db.insert(productAttributes).values(product.attributes.map((attribute, sortOrder) => ({ productId: created.id, ...attribute, sortOrder })).map(({ productId, name, value, sortOrder }) => ({ productId, name, value, sortOrder }))).returning({ id: productAttributes.id, name: productAttributes.name })
      : [];
    const keyIds = new Map(createdAttributes.map((attribute) => [attribute.name, attribute.id]));
    const keyRows = product.keyAttributes.flatMap((name, sortOrder) => {
      const attributeId = keyIds.get(name);
      return attributeId ? [{ productId: created.id, attributeId, sortOrder }] : [];
    });
    if (keyRows.length) await db.insert(productKeyAttributes).values(keyRows);
    await db.insert(productPackaging).values({ productId: created.id, ...product.packaging, shippingPreference: product.packaging.shippingPreference as "air_only" | "sea_only" | "both" | "automatic" });
    if (product.leadTimes.length) await db.insert(productLeadTimes).values(product.leadTimes.map((leadTime, sortOrder) => ({ productId: created.id, ...leadTime, sortOrder })));
    if (product.keywords.length) await db.insert(productKeywords).values(product.keywords.map((keyword, sortOrder) => ({ productId: created.id, keyword, sortOrder })));
  }

  const primaryId = productIds.get("smartphone-camon-50-pro");
  if (primaryId) {
    for (const product of catalog.filter((item) => item.slug !== "smartphone-camon-50-pro")) {
      const relatedId = productIds.get(product.slug);
      if (!relatedId) continue;
      await db.insert(relatedProducts).values([
        { productId: primaryId, relatedProductId: relatedId, relationType: "related", sortOrder: 0 },
        { productId: primaryId, relatedProductId: relatedId, relationType: "frequently_bought_together", sortOrder: 0 },
      ]).onConflictDoNothing();
    }
  }
}

async function seedShippingAndPayment(db: ReturnType<typeof getDb>) {
  const zones = [
    { code: "CI_ABIDJAN", name: "Abidjan", countryCodes: ["CI"], isActive: true, sortOrder: 0 },
    { code: "CI_INTERIOR", name: "Intérieur de la Côte d’Ivoire", countryCodes: ["CI"], isActive: true, sortOrder: 1 },
    { code: "WEST_AFRICA", name: "Autres pays d’Afrique de l’Ouest", countryCodes: westAfricanCountries.filter((code) => code !== "CI"), isActive: true, sortOrder: 2 },
  ];
  for (const zone of zones) await db.insert(shippingZones).values(zone).onConflictDoNothing();
  const zoneRows = await db.select().from(shippingZones);
  const zoneIds = new Map(zoneRows.map((zone) => [zone.code, zone.id]));

  const methods = [
    { code: "air", mode: "air" as const, name: "Livraison par avion", isActive: false, sampleRatesOnly: true, volumetricDivisor: 6000, minimumBillableWeightKg: "0.5", maximumRecommendedWeightKg: "150", seaMinimumVolumeM3: "0.1", seaRecommendationWeightKg: "100", seaRecommendationVolumeM3: "0.3", minimumChargeXof: 0, insurancePercent: "0", customsHandlingXof: 0, fragileSurchargeXof: 0, transitDaysMin: 5, transitDaysMax: 10, configurationNote: "Tarifs d’exemple non validés. Désactivé jusqu’à confirmation par un transporteur." },
    { code: "sea", mode: "sea" as const, name: "Livraison par bateau (groupage LCL)", isActive: false, sampleRatesOnly: true, volumetricDivisor: 6000, minimumBillableWeightKg: "0.5", maximumRecommendedWeightKg: "150", seaMinimumVolumeM3: "0.1", seaRecommendationWeightKg: "100", seaRecommendationVolumeM3: "0.3", minimumChargeXof: 0, insurancePercent: "0", customsHandlingXof: 0, fragileSurchargeXof: 0, transitDaysMin: 35, transitDaysMax: 60, configurationNote: "Tarifs d’exemple non validés. Désactivé jusqu’à confirmation par un transporteur." },
  ];
  for (const method of methods) await db.insert(shippingMethods).values(method).onConflictDoNothing();
  const methodRows = await db.select().from(shippingMethods);
  const methodIds = new Map(methodRows.map((method) => [method.code, method.id]));
  const ratePlan: Record<string, Array<{ minimum: string; maximum: string | null; rate: number }>> = {
    CI_ABIDJAN: [{ minimum: "0", maximum: "5", rate: 9000 }, { minimum: "5", maximum: "20", rate: 8500 }, { minimum: "20", maximum: "100", rate: 7800 }, { minimum: "100", maximum: null, rate: 7000 }],
    CI_INTERIOR: [{ minimum: "0", maximum: "5", rate: 10500 }, { minimum: "5", maximum: "20", rate: 10000 }, { minimum: "20", maximum: "100", rate: 9300 }, { minimum: "100", maximum: null, rate: 8500 }],
    WEST_AFRICA: [{ minimum: "0", maximum: "5", rate: 11000 }, { minimum: "5", maximum: "20", rate: 10500 }, { minimum: "20", maximum: "100", rate: 9500 }, { minimum: "100", maximum: null, rate: 9000 }],
  };
  for (const zone of zones) {
    const shippingZoneId = zoneIds.get(zone.code);
    if (!shippingZoneId) continue;
    const airId = methodIds.get("air");
    const seaId = methodIds.get("sea");
    if (airId) {
      const rows = ratePlan[zone.code].map((rate, sortOrder) => ({ shippingMethodId: airId, shippingZoneId, minimumBillableUnits: rate.minimum, maximumBillableUnits: rate.maximum, rateXofPerUnit: rate.rate, minimumChargeXof: 0, sortOrder, sampleOnly: true }));
      await db.insert(shippingRates).values(rows).onConflictDoNothing();
      const ruleConfig = { volumetricDivisor: 6000, chargeableWeight: "max(actualKg, volumetricKg)", minRecommendedKg: 0.5, maxRecommendedKg: 150, sampleOnly: true };
      await db.insert(shippingRules).values({ shippingMethodId: airId, shippingZoneId, code: "air-weight-calculation", label: "Poids taxable et recommandations", configuration: ruleConfig, isEnabled: true, priority: 10 }).onConflictDoNothing();
    }
    if (seaId) {
      await db.insert(shippingRates).values({ shippingMethodId: seaId, shippingZoneId, minimumBillableUnits: "0.1", maximumBillableUnits: null, rateXofPerUnit: zone.code === "CI_ABIDJAN" ? 250000 : zone.code === "CI_INTERIOR" ? 280000 : 320000, minimumChargeXof: 0, sortOrder: 0, sampleOnly: true }).onConflictDoNothing();
      const seaConfig = { billingBasis: "max(volumeM3, weightKg / 1000)", minimumBillableM3: 0.1, recommendFromWeightKg: 100, recommendFromVolumeM3: 0.3, sampleOnly: true };
      await db.insert(shippingRules).values({ shippingMethodId: seaId, shippingZoneId, code: "sea-lcl-measure", label: "Règle de cubage et recommandation LCL", configuration: seaConfig, isEnabled: true, priority: 10 }).onConflictDoNothing();
    }
  }

  const paymentMethodsSeed = [
    { code: "wave", name: "Wave", provider: "wave", isActive: false, mode: "test" },
    { code: "orange_money", name: "Orange Money", provider: "orange-money", isActive: false, mode: "test" },
    { code: "mtn_momo", name: "MTN Mobile Money", provider: "mtn-momo", isActive: false, mode: "test" },
    { code: "card", name: "Carte bancaire", provider: "card-processor", isActive: false, mode: "test" },
    { code: "bank_transfer", name: "Virement bancaire", provider: "bank-transfer", isActive: false, mode: "test" },
  ];
  for (const method of paymentMethodsSeed) await db.insert(paymentMethodConfigs).values(method).onConflictDoNothing();
  const paymentRows = await db.select().from(paymentMethodConfigs);
  for (const method of paymentRows) {
    await db.insert(paymentCountryRules).values(westAfricanCountries.map((countryCode) => ({ paymentMethodId: method.id, countryCode, isAllowed: false }))).onConflictDoNothing();
  }
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_ADMIN_SEED !== "true") {
    throw new Error("Seed de production bloqué. N’autorisez-le que pendant une opération de mise en service contrôlée avec ALLOW_PRODUCTION_ADMIN_SEED=true.");
  }
  requiredEnv("DATABASE_URL");
  const db = getDb();
  const roleIds = await ensureRoleAndPermissionData(db);
  const superAdminRoleId = roleIds.get("super_admin");
  if (!superAdminRoleId) throw new Error("Le rôle SuperAdmin n’a pas été créé.");
  const superAdminId = await ensureSuperAdmin(db, superAdminRoleId);
  const catalogSellerId = await ensureCatalogSeller(db);
  await seedCatalog(db, catalogSellerId);
  await seedShippingAndPayment(db);

  for (const [sortOrder, [code, label, color, terminal]] of orderStatusSeeds.entries()) {
    await db.insert(orderStatuses).values({ code, label, color, sortOrder, isTerminal: terminal, isActive: true }).onConflictDoNothing();
  }
  await db.insert(customerGroups).values({ code: "default", name: "Client standard", discountBasisPoints: 0, isActive: true }).onConflictDoNothing();
  await db.insert(exchangeRates).values({ baseCurrency: "XOF", quoteCurrency: "XOF", rate: "1", source: "fixed", isIndicative: false, updatedByEmployeeId: superAdminId }).onConflictDoNothing();

  const defaults: Array<[string, unknown]> = [
    ["store.currency", "XOF"],
    ["store.currency_label", "FCFA"],
    ["store.locale", "fr-CI"],
    ["store.time_zone", "Africa/Abidjan"],
    ["store.customs_legal_notice", "Les frais de douane restent à la charge du client selon la réglementation du pays de livraison."],
    ["admin.session_idle_minutes", 30],
    ["catalog.default_status", "draft"],
  ];
  for (const [key, value] of defaults) await db.insert(settings).values({ key, value, updatedByEmployeeId: superAdminId }).onConflictDoNothing();

  console.log("Seed d’administration terminé.");
  console.log("Rôles et permissions initiaux : SuperAdmin, Gestionnaire catalogue, Gestionnaire commandes, Logisticien, Service client.");
  console.log(`Compte SuperAdmin prêt : ${process.env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase()}. Aucun mot de passe n’a été affiché.`);
  console.log("4 produits ont été importés en brouillon, avec stock nul; confirmez les données avant publication.");
  console.log("Transport aérien/bateau et modes de paiement restent désactivés; les tarifs de transport seedés sont des exemples non publiables.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
