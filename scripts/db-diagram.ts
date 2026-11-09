/**
 * Diagramme de la base de données (Mermaid), généré depuis lib/db/schema.ts.
 *
 *   npm run docs:db   → écrit docs/backend/schema-base-de-donnees.md
 *
 * Un diagramme par domaine (lisible et sous les limites d'affichage de GitHub). Chaque table
 * liste ses colonnes (type, PK, FK) ; chaque clé étrangère devient une relation. Une table
 * reliée à un autre domaine est rappelée dans le diagramme, sans ses colonnes.
 * tests/db-diagram-sync.test.ts vérifie que le fichier versionné est à jour.
 */
import { writeFileSync } from "node:fs";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../lib/db/schema";

export const DIAGRAM_PATH = "docs/backend/schema-base-de-donnees.md";

const DOMAINS: Array<{ title: string; description: string; match: RegExp }> = [
  { title: "Équipe, sécurité et boutiques", description: "employés, rôles et permissions, sessions, journal d'audit, clés d'API, boutiques et leur attribution.", match: /^(employee|employees|roles|permissions|role_permissions|api_keys|admin_audit_log|activity_logs|shops|rate_limit_buckets|idempotency_keys)/ },
  { title: "Catalogue", description: "produits, déclinaisons, attributs, caractéristiques, catégories, marques, fournisseurs, images, packs, redirections.", match: /^(categories|brands|suppliers|product|attribute|feature|pack_items|related_products|price_tiers|lead_times|slug_redirects|translations)/ },
  { title: "Prix et stock", description: "prix spécifiques, règles de prix, bons de réduction, entrepôts, niveaux, mouvements et réservations de stock.", match: /^(specific_prices|catalog_price_rules|promo_code|warehouses|stock_|inventory_movements)/ },
  { title: "Clients, paniers et commandes", description: "comptes, clients, adresses, groupes, paniers, commandes, historique, retours, factures et avoirs.", match: /^(shop_order|users|customer|customers|addresses|carts|cart_items|orders|order_|return_request|invoices|credit_notes|document_sequences|reviews|disputes|conversations|messages|quote_requests|seller_)/ },
  { title: "Paiement et livraison", description: "intentions de paiement, transactions, webhooks, remboursements, séquestre, transporteurs, zones, tarifs, expéditions, points relais.", match: /^(payment|payments|refunds|escrow_entries|wallets|payouts|shipping_|shipment|shipments|pickup_points)/ },
  { title: "Communication, CMS et localisation", description: "modèles et file d'e-mails, messages sortants, pages, menus, formulaires, bannières, pays, devises, langues, taxes.", match: /^(email_|outbound_messages|cms_pages|menus|menu_items|forms|form_submissions|banners|countries|states|currencies|languages|exchange_rates|tax_)/ },
  { title: "Service client et assistant IA", description: "tickets, messages, modèles de réponse, propositions et consommation de l'assistant.", match: /^(support_|ai_)/ },
  { title: "Système", description: "paramètres, modules et événements, imports, statistiques, journal d'erreurs, tâches planifiées.", match: /^(settings|platform_settings|modules|hooks|module_|domain_events|import_job|stats_|error_logs|scheduled_task)/ },
];

type Column = { name: string; type: string; pk: boolean; fk: boolean; nullable: boolean };
type Relation = { from: string; to: string; columns: string[]; nullable: boolean };

function collect() {
  const tables = (Object.values(schema) as unknown[]).filter((value): value is PgTable => value instanceof PgTable).map((table) => getTableConfig(table));
  const relations: Relation[] = [];
  const columns = new Map<string, Column[]>();
  for (const config of tables) {
    const fkColumns = new Set<string>();
    for (const fk of config.foreignKeys) {
      const reference = fk.reference();
      const names = reference.columns.map((column) => column.name);
      names.forEach((name) => fkColumns.add(name));
      relations.push({ from: config.name, to: getTableConfig(reference.foreignTable).name, columns: names, nullable: reference.columns.some((column) => !column.notNull) });
    }
    const pk = new Set([...config.columns.filter((column) => column.primary).map((column) => column.name), ...config.primaryKeys.flatMap((key) => key.columns.map((column) => column.name))]);
    columns.set(config.name, config.columns.map((column) => ({ name: column.name, type: column.getSQLType().replace(/\(.*\)/, "").replace(/\s+/g, "_"), pk: pk.has(column.name), fk: fkColumns.has(column.name), nullable: !column.notNull })));
  }
  return { names: tables.map((config) => config.name).sort(), columns, relations };
}

const domainOf = (table: string) => DOMAINS.find((domain) => domain.match.test(table))?.title ?? "Autres";
const entity = (name: string) => name.toUpperCase();

export function renderDatabaseDiagram(): string {
  const { names, columns, relations } = collect();
  const groups = new Map<string, string[]>();
  for (const name of names) groups.set(domainOf(name), [...(groups.get(domainOf(name)) ?? []), name]);
  const ordered = [...DOMAINS.map((domain) => domain.title), "Autres"].filter((title) => groups.has(title));
  const out: string[] = [
    "# Schéma de la base de données",
    "",
    "> Fichier généré par `npm run docs:db` depuis `lib/db/schema.ts` (source unique). Ne pas modifier à la main : `tests/db-diagram-sync.test.ts` échoue s'il n'est plus à jour.",
    "",
    `**${names.length} tables, ${relations.length} clés étrangères.** Un diagramme par domaine ; une table d'un autre domaine reliée à celui-ci y figure sans ses colonnes. Notation : \`PK\` clé primaire, \`FK\` clé étrangère ; \`||--o{\` « un à plusieurs », \`|o--o{\` lien facultatif.`,
    "",
    "## Sommaire",
    "",
    ...ordered.map((title) => `- [${title}](#${title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-")}) (${groups.get(title)!.length} tables)`),
    "",
  ];
  for (const title of ordered) {
    const tables = groups.get(title)!;
    const own = new Set(tables);
    const domainRelations = relations.filter((relation) => own.has(relation.from) || own.has(relation.to));
    const foreign = [...new Set(domainRelations.flatMap((relation) => [relation.from, relation.to]).filter((name) => !own.has(name)))].sort();
    const description = DOMAINS.find((domain) => domain.title === title)?.description ?? "tables non classées.";
    out.push(`## ${title}`, "", `${description.charAt(0).toUpperCase()}${description.slice(1)}`, "", "```mermaid", "erDiagram");
    for (const name of tables) {
      out.push(`  ${entity(name)} {`);
      for (const column of columns.get(name)!) out.push(`    ${column.type} ${column.name}${column.pk ? " PK" : column.fk ? " FK" : ""}`);
      out.push("  }");
    }
    for (const name of foreign) out.push(`  ${entity(name)} {`, "  }");
    const seen = new Set<string>();
    for (const relation of domainRelations.sort((a, b) => `${a.to}${a.from}${a.columns}`.localeCompare(`${b.to}${b.from}${b.columns}`))) {
      const line = `  ${entity(relation.to)} ${relation.nullable ? "|o--o{" : "||--o{"} ${entity(relation.from)} : "${relation.columns.join(", ")}"`;
      if (!seen.has(line)) out.push(line);
      seen.add(line);
    }
    out.push("```", "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

if (process.argv[1]?.endsWith("db-diagram.ts")) {
  writeFileSync(DIAGRAM_PATH, renderDatabaseDiagram());
  console.log(`${DIAGRAM_PATH} écrit.`);
}
