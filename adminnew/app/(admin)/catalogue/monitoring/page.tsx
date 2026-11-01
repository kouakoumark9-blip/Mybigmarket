import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { AlertTriangle, ImageOff, PackageMinus, CircleSlash, Tag, FolderX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminCategories, adminProducts } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Catalogue > Monitoring.
 * Listes automatiques des produits à problèmes, comme dans PrestaShop.
 * Chaque compteur est calculé en base, jamais en mémoire sur un échantillon.
 */

const LIMIT = 20;

type Check = {
  key: string;
  label: string;
  description: string;
  icon: typeof AlertTriangle;
  tone: string;
};

const CHECKS: Check[] = [
  { key: "no_stock", label: "Sans stock", description: "Quantité à zéro : rupture immédiate.", icon: PackageMinus, tone: "text-amber-700" },
  { key: "disabled", label: "Désactivés", description: "Présents en base mais non commandables.", icon: CircleSlash, tone: "text-slate-600" },
  { key: "no_image", label: "Sans image", description: "Aucune photo : fiche produit non publiable.", icon: ImageOff, tone: "text-rose-700" },
  { key: "no_description", label: "Sans description", description: "Description vide ou trop courte.", icon: AlertTriangle, tone: "text-amber-700" },
  { key: "no_price", label: "Sans prix", description: "Prix à zéro : vente impossible.", icon: Tag, tone: "text-rose-700" },
  { key: "no_category", label: "Sans catégorie", description: "Catégorie absente ou supprimée.", icon: FolderX, tone: "text-rose-700" },
];

export default async function CatalogMonitoringPage() {
  await requireEmployee("catalog.products.read");
  const db = getAdminDb();

  // Le filtre `deleted_at IS NULL` est appliqué partout : la corbeille n'est pas du monitoring.
  const active = isNull(adminProducts.deletedAt);

  // « Désactivé » = ni publié ni approuvé : un brouillon n'est pas une anomalie
  // de production, mais un produit archivé ou refusé qui traîne en est une.
  const disabledOrArchived = sql`${adminProducts.status} IN ('archived', 'rejected')`;
  const [noStock, disabled, noImage, noDescription, noPrice, noCategory] = await Promise.all([
    db.select({ value: count() }).from(adminProducts).where(and(active, sql`${adminProducts.quantity} <= 0`)),
    db.select({ value: count() }).from(adminProducts).where(and(active, disabledOrArchived)),
    db.select({ value: count() }).from(adminProducts).where(and(active, isNull(adminProducts.imageUrl))),
    db.select({ value: count() }).from(adminProducts).where(and(active, sql`length(trim(${adminProducts.description})) < 20`)),
    db.select({ value: count() }).from(adminProducts).where(and(active, sql`${adminProducts.priceXof} <= 0`)),
    db.select({ value: count() }).from(adminProducts).leftJoin(adminCategories, eq(adminProducts.categoryId, adminCategories.id)).where(and(active, isNull(adminCategories.id))),
  ]);

  const counts: Record<string, number> = {
    no_stock: Number(noStock[0]?.value || 0),
    disabled: Number(disabled[0]?.value || 0),
    no_image: Number(noImage[0]?.value || 0),
    no_description: Number(noDescription[0]?.value || 0),
    no_price: Number(noPrice[0]?.value || 0),
    no_category: Number(noCategory[0]?.value || 0),
  };

  const rows = await db
    .select({
      id: adminProducts.id,
      title: adminProducts.title,
      reference: adminProducts.reference,
      status: adminProducts.status,
      priceXof: adminProducts.priceXof,
      quantity: adminProducts.quantity,
      categoryName: adminCategories.name,
      updatedAt: adminProducts.updatedAt,
    })
    .from(adminProducts)
    .leftJoin(adminCategories, eq(adminProducts.categoryId, adminCategories.id))
    .where(and(active, or(
      sql`${adminProducts.quantity} <= 0`,
      sql`${adminProducts.priceXof} <= 0`,
      isNull(adminProducts.imageUrl),
      sql`length(trim(${adminProducts.description})) < 20`,
      disabledOrArchived,
    )))
    .orderBy(desc(adminProducts.updatedAt))
    .limit(LIMIT);

  const totalProblems = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return <>
    <div className="admin-breadcrumb"><span>Catalogue</span><span>/</span><strong>Monitoring</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Monitoring du catalogue</h1><p className="admin-page-subtitle">Contrôles automatiques exécutés à chaque affichage, directement en base.</p></div>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{totalProblems} anomalie(s)</span>
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {CHECKS.map((check) => {
        const Icon = check.icon;
        const value = counts[check.key] ?? 0;
        return <Card key={check.key} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-semibold text-slate-500">{check.label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></div>
            <Icon size={20} className={value > 0 ? check.tone : "text-slate-300"}/>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">{check.description}</p>
        </Card>;
      })}
    </div>

    <Card>
      <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Produits à traiter en priorité</div>
      {rows.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[820px]">
        <thead><tr><th>Produit</th><th>Référence</th><th>Catégorie</th><th>Prix</th><th>Stock</th><th>État</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td className="font-semibold text-slate-900">{row.title}</td>
          <td className="text-slate-500">{row.reference || "—"}</td>
          <td>{row.categoryName || <span className="text-rose-700">Aucune</span>}</td>
          <td className="whitespace-nowrap font-semibold">{row.priceXof > 0 ? `${new Intl.NumberFormat("fr-FR").format(row.priceXof)} FCFA` : <span className="text-rose-700">0 FCFA</span>}</td>
          <td className="whitespace-nowrap">{row.quantity.toLocaleString("fr-FR")}</td>
          <td><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">{row.status}</span></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><AlertTriangle size={22} className="mb-2 text-slate-400"/><strong>Aucun produit à traiter</strong>Le catalogue ne présente aucune anomalie détectable.</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600"/>
        <span>Les contrôles portent sur les produits hors corbeille uniquement. « Désactivés » compte les produits archivés ou refusés, pas les brouillons en cours de saisie.</span>
      </div>
    </Card>
  </>;
}
