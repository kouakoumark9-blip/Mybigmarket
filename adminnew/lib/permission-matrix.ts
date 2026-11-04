/**
 * Matrice des permissions : ressource × action.
 *
 * Code d'une permission : `${ressource}.${action}` (ex. `catalog.products.update`).
 * Les 36 codes historiques du back-office sont conservés tels quels ; la matrice ajoute
 * les actions standard (read, create, update, delete) des nouveaux modules.
 *
 * Règle d'héritage : `${ressource}.manage` accorde toutes les actions de la ressource.
 * C'est ce qui permet aux anciens rôles (qui ont souvent `xxx.manage`) de fonctionner
 * sans migration de leurs droits.
 */

export type ResourceSpec = { label: string; actions: Record<string, string> };

const CRUD = (noun: string) => ({ read: `Consulter ${noun}`, create: `Créer ${noun}`, update: `Modifier ${noun}`, delete: `Supprimer ${noun}` });

export const PERMISSION_MATRIX = {
  dashboard: { label: "Tableau de bord", actions: { read: "Consulter le tableau de bord" } },
  orders: { label: "Commandes", actions: { read: "Consulter les commandes", create: "Créer une commande pour un client", update: "Modifier les commandes", delete: "Supprimer les commandes", "status.update": "Changer les statuts", "documents.manage": "Gérer factures et avoirs", export: "Exporter les commandes (CSV)", refund: "Rembourser" } },
  "orders.returns": { label: "Retours (RMA)", actions: { ...CRUD("les retours"), manage: "Gérer les retours" } },
  "catalog.products": { label: "Produits", actions: { ...CRUD("les produits"), publish: "Publier les produits" } },
  "catalog.categories": { label: "Catégories", actions: { ...CRUD("les catégories"), manage: "Gérer les catégories" } },
  "catalog.brands": { label: "Marques", actions: { ...CRUD("les marques"), manage: "Gérer les marques" } },
  "catalog.suppliers": { label: "Fournisseurs", actions: { ...CRUD("les fournisseurs"), manage: "Gérer les fournisseurs" } },
  "catalog.attributes": { label: "Attributs", actions: { ...CRUD("les attributs"), manage: "Gérer les attributs" } },
  "catalog.features": { label: "Caractéristiques", actions: { ...CRUD("les caractéristiques"), manage: "Gérer les caractéristiques" } },
  "catalog.stock": { label: "Stocks", actions: { read: "Consulter le stock", update: "Modifier le stock", manage: "Gérer entrepôts et réapprovisionnement" } },
  "catalog.reviews": { label: "Avis", actions: { read: "Consulter les avis", moderate: "Modérer les avis" } },
  "catalog.trash": { label: "Corbeille du catalogue", actions: { manage: "Gérer la corbeille du catalogue" } },
  catalog: { label: "Catalogue (import/export)", actions: { import: "Importer des données (CSV)", export: "Exporter des données (CSV)" } },
  pricing: { label: "Prix et promotions", actions: { ...CRUD("les règles de prix et bons de réduction"), manage: "Gérer les promotions" } },
  customers: { label: "Clients", actions: { ...CRUD("les clients"), manage: "Gérer groupes, corbeille et anonymisation", export: "Exporter les clients" } },
  support: { label: "Service client", actions: { ...CRUD("les tickets"), assign: "Assigner un ticket" } },
  "support.messages": { label: "Conversations", actions: { read: "Consulter les conversations", reply: "Répondre aux conversations" } },
  "support.disputes": { label: "Litiges", actions: { manage: "Gérer les litiges et retours" } },
  shipping: { label: "Transport", actions: { ...CRUD("les transporteurs et zones"), manage: "Configurer le transport" } },
  payments: { label: "Paiements", actions: { read: "Consulter les paiements", update: "Modifier les paiements", manage: "Configurer les paiements" } },
  localization: { label: "Taxes, devises, pays", actions: { ...CRUD("les taxes, devises et pays"), manage: "Gérer la localisation" } },
  "localization.translations": { label: "Traductions", actions: { manage: "Gérer les traductions" } },
  appearance: { label: "Apparence et CMS", actions: { ...CRUD("les pages, menus et bannières"), manage: "Gérer l'apparence et le CMS" } },
  marketing: { label: "Marketing", actions: { manage: "Gérer les promotions" } },
  seo: { label: "SEO et URLs", actions: { read: "Consulter le SEO", update: "Modifier le SEO et les redirections" } },
  communication: { label: "E-mails et notifications", actions: { read: "Consulter les envois", update: "Modifier les modèles d'e-mails" } },
  analytics: { label: "Statistiques", actions: { read: "Consulter les statistiques" } },
  settings: { label: "Paramètres", actions: { read: "Consulter les paramètres", update: "Modifier les paramètres", manage: "Modifier les paramètres" } },
  employees: { label: "Employés", actions: { ...CRUD("les employés"), manage: "Gérer les employés" } },
  roles: { label: "Rôles et permissions", actions: { ...CRUD("les rôles"), manage: "Gérer les rôles et permissions" } },
  logs: { label: "Journaux", actions: { read: "Consulter les journaux" } },
  system: { label: "Système", actions: { read: "Consulter les informations système", manage: "Lancer les tâches système" } },
  modules: { label: "Modules", actions: { read: "Consulter les modules", update: "Activer et configurer les modules", manage: "Activer et configurer les modules" } },
  apiKeys: { label: "Clés d'API", actions: { read: "Consulter les clés d'API", create: "Créer une clé d'API", delete: "Révoquer une clé d'API", manage: "Gérer les clés du webservice" } },
  shops: { label: "Boutiques", actions: { read: "Consulter les boutiques", manage: "Gérer les boutiques" } },
  ai: { label: "Assistant IA", actions: { use: "Utiliser l'assistant", manage: "Gérer les quotas de l'assistant" } },
} as const satisfies Record<string, ResourceSpec>;

type Matrix = typeof PERMISSION_MATRIX;
export type PermissionCode = { [R in keyof Matrix]: `${R & string}.${keyof Matrix[R]["actions"] & string}` }[keyof Matrix];

export type PermissionEntry = { code: PermissionCode; resource: string; action: string; label: string };

export const ALL_PERMISSIONS: PermissionEntry[] = Object.entries(PERMISSION_MATRIX).flatMap(([resource, spec]) =>
  Object.entries(spec.actions).map(([action, label]) => ({ code: `${resource}.${action}` as PermissionCode, resource, action, label })),
);

const KNOWN = new Set<string>(ALL_PERMISSIONS.map((entry) => entry.code));

export function isPermissionCode(code: string): code is PermissionCode {
  return KNOWN.has(code);
}

/** Ressource et action d'un code, en tenant compte des ressources à points (`catalog.products`). */
export function splitPermission(code: string): { resource: string; action: string } | null {
  const entry = ALL_PERMISSIONS.find((permission) => permission.code === code);
  return entry ? { resource: entry.resource, action: entry.action } : null;
}

/**
 * Vérifie une permission. Accordée si le code exact est présent ou si `${ressource}.manage`
 * est présent. La lecture est aussi accordée par n'importe quelle action d'écriture sur la
 * même ressource (on ne peut pas modifier ce qu'on ne voit pas).
 */
export function can(granted: ReadonlySet<string> | readonly string[], code: PermissionCode): boolean {
  const set = granted instanceof Set ? granted : new Set(granted as readonly string[]);
  if (set.has("*") || set.has(code)) return true;
  const parts = splitPermission(code);
  if (!parts) return false;
  if (set.has(`${parts.resource}.manage`)) return true;
  if (parts.action === "read") {
    for (const action of Object.keys(PERMISSION_MATRIX[parts.resource as keyof Matrix].actions)) if (set.has(`${parts.resource}.${action}`)) return true;
  }
  return false;
}

/** Profils de rôle système. `super_admin` reçoit toujours toutes les permissions. */
export const ROLE_PROFILES: Record<string, { name: string; description: string; permissions: "all" | PermissionCode[] | ((entry: PermissionEntry) => boolean) }> = {
  super_admin: { name: "SuperAdmin", description: "Accès complet à l'administration.", permissions: "all" },
  manager: {
    name: "Gestionnaire",
    description: "Catalogue, prix, stocks, commandes, clients, marketing et statistiques. Pas d'accès à l'équipe ni aux paramètres système.",
    permissions: (entry) => /^(dashboard|orders|catalog|pricing|customers|marketing|analytics|seo|appearance|support|communication)(\.|$)/.test(entry.resource) || entry.code === "shipping.read" || entry.code === "payments.read" || entry.code === "settings.read" || entry.code === "ai.use",
  },
  catalog_manager: {
    name: "Gestionnaire catalogue",
    description: "Gestion du catalogue, des médias, des attributs et du stock.",
    permissions: ["dashboard.read", "catalog.products.read", "catalog.products.create", "catalog.products.update", "catalog.products.publish", "catalog.categories.manage", "catalog.brands.manage", "catalog.suppliers.manage", "catalog.attributes.manage", "catalog.features.manage", "catalog.import", "catalog.export", "catalog.trash.manage", "catalog.stock.read", "catalog.stock.update", "catalog.reviews.moderate", "analytics.read", "pricing.read", "seo.read", "seo.update", "ai.use"],
  },
  orders_manager: {
    name: "Gestionnaire commandes",
    description: "Gestion des commandes, factures, clients et statuts.",
    permissions: ["dashboard.read", "orders.read", "orders.update", "orders.status.update", "orders.documents.manage", "orders.export", "orders.create", "orders.refund", "orders.returns.manage", "customers.read", "customers.update", "customers.manage", "payments.read", "analytics.read"],
  },
  logistician: {
    name: "Logisticien",
    description: "Gestion des expéditions, transporteurs, stocks et règles logistiques.",
    permissions: ["dashboard.read", "orders.read", "orders.status.update", "catalog.stock.read", "catalog.stock.update", "catalog.stock.manage", "shipping.read", "shipping.manage", "orders.returns.read", "orders.returns.update", "analytics.read"],
  },
  customer_service: {
    name: "Support",
    description: "Service client : conversations, tickets, clients, retours et litiges.",
    permissions: ["dashboard.read", "orders.read", "customers.read", "customers.update", "customers.manage", "support.messages.read", "support.messages.reply", "support.disputes.manage", "support.read", "support.create", "support.update", "support.assign", "orders.returns.read", "orders.returns.update", "ai.use"],
  },
  read_only: {
    name: "Lecture seule",
    description: "Consultation de toute l'administration, sans aucune modification.",
    permissions: (entry) => entry.action === "read" && entry.resource !== "apiKeys",
  },
};

export function profilePermissions(roleCode: string): PermissionCode[] {
  const profile = ROLE_PROFILES[roleCode];
  if (!profile) return [];
  if (profile.permissions === "all") return ALL_PERMISSIONS.map((entry) => entry.code);
  if (typeof profile.permissions === "function") return ALL_PERMISSIONS.filter(profile.permissions).map((entry) => entry.code);
  return profile.permissions;
}
