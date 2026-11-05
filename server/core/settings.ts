/**
 * Paramètres typés, par boutique, mis en cache.
 *
 * Chaque clé est déclarée une fois (groupe, schéma Zod, valeur par défaut, visibilité).
 * Une clé inconnue ou une valeur invalide est refusée. Les valeurs secrètes ne sont jamais
 * renvoyées en clair par l'API.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z, type ZodType } from "zod";
import { settings as settingsTable } from "@/lib/db/schema";
import type { Db } from "@/server/core/db";
import { errors, zodIssues } from "@/server/core/errors";
import { recordAudit, type AuditActor } from "@/server/core/audit";
import { emitEvent } from "@/server/core/events";
import type { RequestMeta } from "@/server/core/http/request-context";

export type SettingGroup = "store" | "orders" | "catalog" | "customers" | "email" | "seo" | "security" | "payments" | "shipping";

export type SettingDefinition<T = unknown> = {
  group: SettingGroup;
  label: string;
  schema: ZodType<T>;
  defaultValue: T;
  /** Exposé sur l'API boutique (ex. nom, devise). */
  public?: boolean;
  secret?: boolean;
};

const define = <T,>(definition: SettingDefinition<T>) => definition;
const text = (max: number) => z.string().trim().max(max);
const optionalUrl = z.union([z.literal(""), z.string().url().max(500)]);

export const SETTING_DEFINITIONS = {
  // Boutique
  "store.name": define({ group: "store", label: "Nom de la boutique", schema: text(120).min(1), defaultValue: "mybigmarket", public: true }),
  "store.logo_url": define({ group: "store", label: "URL du logo", schema: optionalUrl, defaultValue: "", public: true }),
  "store.email": define({ group: "store", label: "E-mail de contact", schema: z.union([z.literal(""), z.string().email().max(190)]), defaultValue: "", public: true }),
  "store.phone": define({ group: "store", label: "Téléphone de contact", schema: text(32), defaultValue: "", public: true }),
  "store.address": define({ group: "store", label: "Adresse", schema: text(400), defaultValue: "", public: true }),
  "store.time_zone": define({ group: "store", label: "Fuseau horaire", schema: z.string().refine((value) => { try { new Intl.DateTimeFormat("fr", { timeZone: value }); return true; } catch { return false; } }, "Fuseau horaire inconnu."), defaultValue: "Africa/Abidjan", public: true }),
  "store.currency": define({ group: "store", label: "Devise par défaut", schema: z.string().regex(/^[A-Z]{3}$/), defaultValue: "XOF", public: true }),
  "store.currency_label": define({ group: "store", label: "Libellé de la devise", schema: text(12).min(1), defaultValue: "FCFA", public: true }),
  "store.locale": define({ group: "store", label: "Langue et région", schema: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/), defaultValue: "fr-CI", public: true }),
  "store.customs_legal_notice": define({ group: "store", label: "Mention légale douane", schema: text(1000), defaultValue: "Les frais de douane restent à la charge du client selon la réglementation du pays de livraison.", public: true }),
  "store.maintenance_mode": define({ group: "store", label: "Boutique en maintenance", schema: z.boolean(), defaultValue: false, public: true }),
  // Commandes
  "orders.minimum_amount_xof": define({ group: "orders", label: "Montant minimum de commande (FCFA)", schema: z.number().int().min(0).max(100_000_000), defaultValue: 0, public: true }),
  "orders.payment_expiry_minutes": define({ group: "orders", label: "Délai de paiement avant annulation (minutes)", schema: z.number().int().min(5).max(10_080), defaultValue: 60 }),
  "orders.allow_guest_checkout": define({ group: "orders", label: "Commande sans compte", schema: z.boolean(), defaultValue: false, public: true }),
  "orders.reference_prefix": define({ group: "orders", label: "Préfixe des références de commande", schema: z.string().regex(/^[A-Z]{2,6}$/), defaultValue: "MBM" }),
  "orders.return_window_days": define({ group: "orders", label: "Délai de retour (jours)", schema: z.number().int().min(0).max(365), defaultValue: 14, public: true }),
  "orders.free_shipping_threshold_xof": define({ group: "orders", label: "Livraison gratuite à partir de (FCFA, 0 = jamais)", schema: z.number().int().min(0), defaultValue: 0, public: true }),
  // Paiement (étape 5). Les coordonnées bancaires ne sont pas des secrets : elles sont communiquées au client.
  "payments.bank_transfer.account_holder": define({ group: "payments", label: "Virement : titulaire du compte", schema: text(160), defaultValue: "" }),
  "payments.bank_transfer.bank_name": define({ group: "payments", label: "Virement : banque", schema: text(160), defaultValue: "" }),
  "payments.bank_transfer.iban": define({ group: "payments", label: "Virement : IBAN ou RIB", schema: text(64), defaultValue: "" }),
  "payments.bank_transfer.bic": define({ group: "payments", label: "Virement : code BIC/SWIFT", schema: text(20), defaultValue: "" }),
  "payments.bank_transfer.instructions": define({ group: "payments", label: "Virement : consignes complémentaires", schema: text(600), defaultValue: "Indiquez la référence du paiement dans le libellé du virement." }),
  "payments.bank_transfer.expiry_hours": define({ group: "payments", label: "Virement : délai de réception avant annulation (heures)", schema: z.number().int().min(1).max(720), defaultValue: 72 }),
  "payments.cash_on_delivery.max_amount_xof": define({ group: "payments", label: "Paiement à la livraison : montant maximum (FCFA)", schema: z.number().int().min(0).max(100_000_000), defaultValue: 300_000 }),
  "payments.cash_on_delivery.countries": define({ group: "payments", label: "Paiement à la livraison : pays autorisés", schema: z.array(z.string().regex(/^[A-Z]{2}$/)).max(30), defaultValue: ["CI"] }),
  // Livraison (étape 5)
  "shipping.require_billable_method": define({ group: "shipping", label: "Exiger un transporteur facturable quand il en existe un", schema: z.boolean(), defaultValue: true }),
  "shipping.tracking_lookup_enabled": define({ group: "shipping", label: "Suivi de commande sans compte (référence + e-mail)", schema: z.boolean(), defaultValue: true, public: true }),
  // Catalogue
  "catalog.default_status": define({ group: "catalog", label: "Statut par défaut d'un nouveau produit", schema: z.enum(["draft", "pending_review"]), defaultValue: "draft" }),
  "catalog.low_stock_threshold": define({ group: "catalog", label: "Seuil d'alerte stock bas par défaut", schema: z.number().int().min(0).max(1_000_000), defaultValue: 5 }),
  "catalog.allow_out_of_stock_orders": define({ group: "catalog", label: "Autoriser les commandes en rupture", schema: z.boolean(), defaultValue: false }),
  "catalog.products_per_page": define({ group: "catalog", label: "Produits par page", schema: z.number().int().min(6).max(120), defaultValue: 24, public: true }),
  "catalog.show_prices_tax_included": define({ group: "catalog", label: "Afficher les prix TTC", schema: z.boolean(), defaultValue: true, public: true }),
  // Clients
  "customers.require_email_verification": define({ group: "customers", label: "Vérification de l'e-mail obligatoire", schema: z.boolean(), defaultValue: false }),
  "customers.default_group": define({ group: "customers", label: "Groupe client par défaut", schema: z.string().regex(/^[a-z0-9_-]{2,40}$/), defaultValue: "default" }),
  "customers.data_retention_months": define({ group: "customers", label: "Conservation des comptes inactifs (mois)", schema: z.number().int().min(6).max(120), defaultValue: 36 }),
  // E-mail
  "email.sender_name": define({ group: "email", label: "Nom de l'expéditeur", schema: text(120), defaultValue: "mybigmarket" }),
  "email.sender_address": define({ group: "email", label: "Adresse d'expédition", schema: z.union([z.literal(""), z.string().email().max(190)]), defaultValue: "" }),
  "email.reply_to": define({ group: "email", label: "Adresse de réponse", schema: z.union([z.literal(""), z.string().email().max(190)]), defaultValue: "" }),
  "email.admin_notification_address": define({ group: "email", label: "Adresse des notifications internes", schema: z.union([z.literal(""), z.string().email().max(190)]), defaultValue: "" }),
  // SEO
  "seo.title_suffix": define({ group: "seo", label: "Suffixe des titres de page", schema: text(60), defaultValue: " | mybigmarket", public: true }),
  "seo.default_meta_description": define({ group: "seo", label: "Meta description par défaut", schema: text(320), defaultValue: "Précommandes et achats entre la Chine et l'Afrique de l'Ouest.", public: true }),
  "seo.index_catalog": define({ group: "seo", label: "Autoriser l'indexation du catalogue", schema: z.boolean(), defaultValue: true, public: true }),
  // Sécurité
  "admin.session_idle_minutes": define({ group: "security", label: "Déconnexion après inactivité (minutes)", schema: z.number().int().min(5).max(480), defaultValue: 30 }),
  "security.require_admin_2fa": define({ group: "security", label: "Double authentification obligatoire pour l'équipe", schema: z.boolean(), defaultValue: false }),
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export type SettingValues = { [K in SettingKey]: (typeof SETTING_DEFINITIONS)[K]["defaultValue"] };
export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return key in SETTING_DEFINITIONS;
}

const cache = new Map<string, { at: number; values: SettingValues }>();
const CACHE_MS = 30_000;

export function clearSettingsCache() {
  cache.clear();
}

function defaults(): SettingValues {
  return Object.fromEntries(SETTING_KEYS.map((key) => [key, SETTING_DEFINITIONS[key].defaultValue])) as SettingValues;
}

/** Valeurs effectives d'une boutique : défauts écrasés par les valeurs enregistrées valides. */
export async function loadSettings(database: Db, shopId: string): Promise<SettingValues> {
  const hit = cache.get(shopId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.values;
  const values = defaults() as Record<string, unknown>;
  const rows = await database.select({ key: settingsTable.key, value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.shopId, shopId));
  for (const row of rows) {
    if (!isSettingKey(row.key)) continue;
    const parsed = SETTING_DEFINITIONS[row.key].schema.safeParse(row.value);
    if (parsed.success) values[row.key] = parsed.data;
  }
  cache.set(shopId, { at: Date.now(), values: values as SettingValues });
  return values as SettingValues;
}

export async function getSetting<K extends SettingKey>(database: Db, shopId: string, key: K): Promise<SettingValues[K]> {
  return (await loadSettings(database, shopId))[key];
}

export type SettingView = { key: SettingKey; group: SettingGroup; label: string; value: unknown; defaultValue: unknown; isDefault: boolean; public: boolean; secret: boolean };

export async function describeSettings(database: Db, shopId: string, group?: SettingGroup): Promise<SettingView[]> {
  const values = await loadSettings(database, shopId);
  return SETTING_KEYS.filter((key) => !group || SETTING_DEFINITIONS[key].group === group).map((key) => {
    const definition = SETTING_DEFINITIONS[key] as SettingDefinition;
    const value = values[key];
    return {
      key, group: definition.group, label: definition.label,
      value: definition.secret ? (value ? "••••••" : "") : value,
      defaultValue: definition.secret ? "" : definition.defaultValue,
      isDefault: JSON.stringify(value) === JSON.stringify(definition.defaultValue),
      public: Boolean(definition.public), secret: Boolean(definition.secret),
    };
  });
}

export async function publicSettings(database: Db, shopId: string): Promise<Record<string, unknown>> {
  const values = await loadSettings(database, shopId);
  return Object.fromEntries(SETTING_KEYS.filter((key) => (SETTING_DEFINITIONS[key] as SettingDefinition).public).map((key) => [key, values[key]]));
}

/** Validation de toutes les valeurs avant écriture : tout ou rien. */
export function validateSettingValues(input: Record<string, unknown>): Partial<SettingValues> {
  const issues: Array<{ path: string; message: string }> = [];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isSettingKey(key)) {
      issues.push({ path: key, message: "Paramètre inconnu." });
      continue;
    }
    const parsed = SETTING_DEFINITIONS[key].schema.safeParse(value);
    if (!parsed.success) issues.push(...zodIssues(parsed.error.issues).map((issue) => ({ path: key, message: issue.message })));
    else out[key] = parsed.data;
  }
  if (issues.length) throw errors.validation(issues);
  if (!Object.keys(out).length) throw errors.validation([{ path: "values", message: "Aucun paramètre à modifier." }]);
  return out as Partial<SettingValues>;
}

export async function updateSettings(database: Db, input: { shopId: string; values: Record<string, unknown>; actor: AuditActor; meta?: RequestMeta }): Promise<SettingView[]> {
  const values = validateSettingValues(input.values);
  const keys = Object.keys(values) as SettingKey[];
  const employeeId = input.actor.kind === "system" ? null : input.actor.employeeId;
  await database.transaction(async (tx) => {
    const existing = await tx.select({ key: settingsTable.key, value: settingsTable.value }).from(settingsTable)
      .where(and(eq(settingsTable.shopId, input.shopId), inArray(settingsTable.key, keys))).for("update");
    const before = Object.fromEntries(existing.map((row) => [row.key, row.value]));
    for (const key of keys) {
      const value = values[key];
      await tx.insert(settingsTable).values({ shopId: input.shopId, key, value: value as never, isSecret: Boolean((SETTING_DEFINITIONS[key] as SettingDefinition).secret), updatedByEmployeeId: employeeId, updatedAt: new Date() })
        .onConflictDoUpdate({ target: [settingsTable.shopId, settingsTable.key], set: { value: value as never, updatedByEmployeeId: employeeId, updatedAt: new Date() } });
    }
    await recordAudit(tx, { action: "settings.updated", entityType: "settings", entityId: input.shopId, before, after: values as Record<string, unknown>, actor: input.actor, meta: input.meta, shopId: input.shopId });
    await emitEvent(tx, "settings.updated", { keys }, { shopId: input.shopId, aggregateType: "settings", aggregateId: input.shopId });
  });
  cache.delete(input.shopId);
  return (await describeSettings(database, input.shopId)).filter((view) => keys.includes(view.key));
}
