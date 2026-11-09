import "server-only";
import { getDb } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { normalizeHeader, parseCsvRecords } from "@/server/core/csv";
import { productSchema, saveProduct, slugify } from "./products";

export const CSV_COLUMNS = ["nom", "categorie", "prix", "ancien_prix", "stock", "disponibilite", "delai_jours", "marque", "puissance", "classe_energie", "etiquette", "description_courte", "description", "caracteristiques", "lien_alibaba", "prix_achat", "frais_import", "publie"] as const;

export const CSV_EXAMPLE = [
  CSV_COLUMNS.join(";"),
  ["Climatiseur split 1 CV", "climatiseurs/split", "165000", "185000", "6", "stock", "", "Marque Alpha", "9 000 BTU (1 CV)", "A+", "Promo", "Split mural silencieux pour une pièce de 15 m².", "Climatiseur split de 9 000 BTU. Télécommande fournie. Installation non comprise.", "Puissance : 9 000 BTU|Garantie : 1 an", "", "", "", "oui"].join(";"),
  ["Groupe électrogène 3 kVA", "electrogene/groupes-electrogenes", "420000", "", "0", "commande", "20", "", "3 kVA", "", "", "Groupe essence 3 kVA.", "Groupe électrogène essence 3 kVA, démarrage manuel.", "Carburant : Essence|Garantie : 1 an", "", "", "", "oui"].join(";"),
].join("\n");

export type ImportReport = { created: number; errors: Array<{ line: number; message: string }> };

/** Importe un fichier CSV (séparateur ; ou ,). Chaque ligne est traitée seule : une erreur n'arrête pas les autres. */
export async function importProductsCsv(text: string): Promise<ImportReport> {
  const records = parseCsvRecords(text);
  const report: ImportReport = { created: 0, errors: [] };
  if (records.length < 2) { report.errors.push({ line: 1, message: "Le fichier est vide ou n'a pas de ligne de produit." }); return report; }
  const header = records[0].cells.map(normalizeHeader);
  const missing = ["nom", "categorie", "prix", "description"].filter((name) => !header.includes(name));
  if (missing.length) { report.errors.push({ line: 1, message: `Colonnes manquantes : ${missing.join(", ")}.` }); return report; }
  if (records.length > 501) { report.errors.push({ line: 1, message: "500 produits maximum par fichier." }); return report; }
  const allCategories = await getDb().select({ id: categories.id, slug: categories.slug, name: categories.name }).from(categories);
  const byKey = new Map<string, number>();
  for (const category of allCategories) { byKey.set(category.slug, category.id); byKey.set(slugify(category.name), category.id); }

  for (const record of records.slice(1)) {
    const row = Object.fromEntries(header.map((name, index) => [name, (record.cells[index] ?? "").trim()]));
    const categoryId = byKey.get(row.categorie.toLowerCase()) ?? byKey.get(slugify(row.categorie));
    if (!categoryId) { report.errors.push({ line: record.line, message: `Catégorie inconnue : « ${row.categorie} ». Utilisez l'adresse de la catégorie, par exemple climatiseurs/split.` }); continue; }
    const yes = (value: string) => /^(oui|1|vrai|true|x)$/i.test(value);
    const parsed = productSchema.safeParse({
      title: row.nom, categoryId, brand: row.marque, priceXof: row.prix, comparePriceXof: row.ancien_prix, quantity: row.stock,
      availability: /commande/i.test(row.disponibilite) ? "on_order" : "in_stock_abidjan", leadTimeDays: row.delai_jours,
      powerLabel: row.puissance, energyClass: row.classe_energie, badge: row.etiquette, shortDescription: row.description_courte,
      description: row.description, specs: row.caracteristiques.split("|").map((item) => item.trim()).join("\n"), alibabaUrl: row.lien_alibaba,
      purchasePriceXof: row.prix_achat, importFeesXof: row.frais_import, status: row.publie === "" || yes(row.publie) ? "approved" : "draft",
    });
    if (!parsed.success) { report.errors.push({ line: record.line, message: parsed.error.issues[0]?.message ?? "Ligne invalide." }); continue; }
    try { await saveProduct(null, parsed.data, []); report.created += 1; }
    catch (error) { report.errors.push({ line: record.line, message: error instanceof Error ? error.message : "Enregistrement impossible." }); }
  }
  return report;
}
