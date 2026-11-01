import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { PackageSearch, Search, Trash2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminCategories, adminProducts } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { moveToTrashAction } from "../corbeille/actions";

export const dynamic = "force-dynamic";

const statuses = ["draft", "pending_review", "approved", "published", "rejected", "archived"] as const;
const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  pending_review: "À vérifier",
  approved: "Approuvé",
  published: "Publié",
  rejected: "Refusé",
  archived: "Archivé",
};
const statusClasses: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_review: "bg-amber-50 text-amber-800",
  approved: "bg-blue-50 text-blue-800",
  published: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-800",
  archived: "bg-slate-100 text-slate-500",
};
const formatMoney = (amount: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} FCFA`;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; notice?: string }> }) {
  await requireEmployee("catalog.products.read");
  const params = await searchParams;
  const query = (params.q || "").trim().slice(0, 80);
  const status = statuses.find((candidate) => candidate === params.status);
  const filters = [
    isNull(adminProducts.deletedAt),
    query ? or(ilike(adminProducts.title, `%${query}%`), ilike(adminProducts.sku, `%${query}%`)) : undefined,
    status ? eq(adminProducts.status, status) : undefined,
  ].filter(Boolean);
  const where = and(...filters);
  const db = getAdminDb();
  const [products, totalResult, trashResult] = await Promise.all([
    db.select({
      id: adminProducts.id,
      title: adminProducts.title,
      sku: adminProducts.sku,
      status: adminProducts.status,
      priceXof: adminProducts.priceXof,
      quantity: adminProducts.quantity,
      minimumQuantity: adminProducts.minimumQuantity,
      leadTimeDays: adminProducts.leadTimeDays,
      updatedAt: adminProducts.updatedAt,
      categoryName: adminCategories.name,
    })
      .from(adminProducts)
      .leftJoin(adminCategories, eq(adminProducts.categoryId, adminCategories.id))
      .where(where)
      .orderBy(desc(adminProducts.updatedAt))
      .limit(50),
    db.select({ value: count() }).from(adminProducts).where(where),
    db.select({ value: count() }).from(adminProducts).where(sql`${adminProducts.deletedAt} is not null`),
  ]);
  const trashCount = Number(trashResult[0]?.value || 0);

  return <>
    <div className="admin-breadcrumb"><span>Catalogue</span><span>/</span><strong>Produits</strong></div>
    {params.notice === "trashed" && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">Produit déplacé dans la corbeille. Il peut être restauré à tout moment.</p>}
    {params.notice === "missing" && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">Ce produit est introuvable ou déjà dans la corbeille.</p>}
    {params.notice === "invalid" && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">Demande invalide : identifiant produit incomplet.</p>}
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Produits</h1><p className="admin-page-subtitle">Catalogue enregistré dans la base Neon. Les articles de démonstration restent en brouillon.</p></div>
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{Number(totalResult[0]?.value || 0)} résultat(s)</span>
        <a href="/catalogue/corbeille" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Trash2 size={14}/>Corbeille ({trashCount})</a>
      </div>
    </div>

    <Card className="mb-5 p-4 sm:p-5">
      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1.5 text-xs font-semibold text-slate-700">
          Recherche
          <span className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input name="q" defaultValue={query} maxLength={80} placeholder="Nom ou SKU" className="ui-input pl-9"/></span>
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
          Statut
          <select name="status" defaultValue={status || ""} className="ui-input min-w-44">
            <option value="">Tous les statuts</option>
            {statuses.map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}
          </select>
        </label>
        <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Search size={15}/>Filtrer</button>
        {(query || status) && <a href="/catalogue/produits" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Effacer</a>}
      </form>
    </Card>

    <Card>
      {products.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[900px]">
        <thead><tr><th>Produit</th><th>Catégorie</th><th>Prix affiché</th><th>Stock / MOQ</th><th>Délai</th><th>Statut</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{products.map((product) => <tr key={product.id}>
          <td><div className="flex items-center gap-2"><PackageSearch size={16} className="shrink-0 text-slate-400"/><div><div className="font-semibold text-slate-900">{product.title}</div><div className="text-[11px] text-slate-500">SKU : {product.sku || "non défini"}</div></div></div></td>
          <td>{product.categoryName || "Sans catégorie"}</td>
          <td className="whitespace-nowrap font-semibold">{formatMoney(product.priceXof)}</td>
          <td className="whitespace-nowrap">{product.quantity.toLocaleString("fr-FR")} / MOQ {product.minimumQuantity.toLocaleString("fr-FR")}</td>
          <td className="whitespace-nowrap">{product.leadTimeDays} j</td>
          <td><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses[product.status] || "bg-slate-100 text-slate-700"}`}>{statusLabels[product.status] || product.status}</span></td>
          <td className="text-right"><form action={moveToTrashAction}><input type="hidden" name="productId" value={product.id}/><button type="submit" title="Mettre à la corbeille" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Trash2 size={13}/>Corbeille</button></form></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><PackageSearch size={24} className="mb-2 text-slate-400"/><strong>Aucun produit trouvé</strong>{query || status ? "Modifie les filtres puis réessaie." : "Les produits créés ou importés apparaîtront ici."}</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Les lignes affichées sont des données catalogue; aucun article de démonstration n’est présenté comme vérifié ou disponible à la vente.</span></div>
    </Card>
    {products.length === 50 && <p className="mt-3 text-xs text-slate-500">Affichage limité aux 50 premières lignes; affine la recherche pour trouver un article.</p>}
  </>;
}
