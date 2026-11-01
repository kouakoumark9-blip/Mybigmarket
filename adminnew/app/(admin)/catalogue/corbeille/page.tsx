import { and, count, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { Archive, RotateCcw, Search, Trash2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminCategories, adminProducts } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { archiveFromTrashAction, restoreProductAction } from "./actions";

export const dynamic = "force-dynamic";

const formatMoney = (amount: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} FCFA`;
const formatDate = (value: Date | null) => (value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—");

const notices: Record<string, { tone: string; text: string }> = {
  restored: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Produit restauré dans le catalogue en brouillon : il devra être validé avant publication." },
  archived: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Produit sorti de la corbeille et conservé en archives. Son historique commercial reste intact." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Ce produit n'est plus dans la corbeille : l'action a peut-être déjà été faite." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Demande invalide : identifiant produit incomplet." },
};

export default async function TrashPage({ searchParams }: { searchParams: Promise<{ q?: string; notice?: string }> }) {
  await requireEmployee("catalog.trash.manage");
  const params = await searchParams;
  const query = (params.q || "").trim().slice(0, 80);
  const notice = params.notice ? notices[params.notice] : undefined;

  // La corbeille ne contient que les produits réellement sortis du catalogue.
  const where = and(
    isNotNull(adminProducts.deletedAt),
    query ? or(ilike(adminProducts.title, `%${query}%`), ilike(adminProducts.sku, `%${query}%`)) : undefined,
  );
  const db = getAdminDb();
  const [rows, totalResult] = await Promise.all([
    db.select({
      id: adminProducts.id,
      title: adminProducts.title,
      sku: adminProducts.sku,
      status: adminProducts.status,
      priceXof: adminProducts.priceXof,
      quantity: adminProducts.quantity,
      deletedAt: adminProducts.deletedAt,
      categoryName: adminCategories.name,
    })
      .from(adminProducts)
      .leftJoin(adminCategories, eq(adminProducts.categoryId, adminCategories.id))
      .where(where)
      .orderBy(desc(adminProducts.deletedAt))
      .limit(100),
    db.select({ value: count() }).from(adminProducts).where(where),
  ]);
  const total = Number(totalResult[0]?.value || 0);
  const totalStockValue = rows.reduce((sum, row) => sum + row.priceXof * row.quantity, 0);

  return <>
    <div className="admin-breadcrumb"><span>Catalogue</span><span>/</span><strong>Corbeille</strong></div>
    <div className="admin-page-title-row">
      <div>
        <h1 className="admin-page-title">Corbeille</h1>
        <p className="admin-page-subtitle">Les produits sortis du catalogue ne sont jamais effacés. Restaure-les (retour en brouillon) ou conserve-les en archives.</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{total} produit(s)</span>
        <a href="/catalogue/produits" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Retour aux produits</a>
      </div>
    </div>

    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`}>{notice.text}</p>}

    <Card className="mb-5 p-4 sm:p-5">
      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1.5 text-xs font-semibold text-slate-700">
          Recherche
          <span className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input name="q" defaultValue={query} maxLength={80} placeholder="Nom ou SKU" className="ui-input pl-9"/></span>
        </label>
        <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Search size={15}/>Filtrer</button>
        {query && <a href="/catalogue/corbeille" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Effacer</a>}
      </form>
    </Card>

    <Card>
      {rows.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[960px]">
        <thead><tr><th>Produit</th><th>Catégorie</th><th>Prix</th><th>Stock</th><th>Mis à la corbeille</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td><div className="flex items-center gap-2"><Trash2 size={16} className="shrink-0 text-slate-400"/><div><div className="font-semibold text-slate-900">{row.title}</div><div className="text-[11px] text-slate-500">SKU : {row.sku || "non défini"} · statut précédent : {row.status}</div></div></div></td>
          <td>{row.categoryName || "Sans catégorie"}</td>
          <td className="whitespace-nowrap font-semibold">{formatMoney(row.priceXof)}</td>
          <td className="whitespace-nowrap">{row.quantity.toLocaleString("fr-FR")}</td>
          <td className="whitespace-nowrap text-slate-600">{formatDate(row.deletedAt)}</td>
          <td><div className="flex justify-end gap-2">
            <form action={restoreProductAction}><input type="hidden" name="productId" value={row.id}/><button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"><RotateCcw size={13}/>Restaurer</button></form>
            <form action={archiveFromTrashAction}><input type="hidden" name="productId" value={row.id}/><button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Archive size={13}/>Archiver</button></form>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><Trash2 size={24} className="mb-2 text-slate-400"/><strong>La corbeille est vide</strong>{query ? "Aucun produit supprimé ne correspond à cette recherche." : "Les produits mis à la corbeille apparaîtront ici."}</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Aucune suppression physique n&apos;est possible depuis cet écran : les commandes, factures et mouvements de stock doivent garder leur historique. Valeur du stock en corbeille (prix × quantité) : {formatMoney(totalStockValue)}.</span></div>
    </Card>
    {rows.length === 100 && <p className="mt-3 text-xs text-slate-500">Affichage limité aux 100 produits les plus récemment supprimés; affine la recherche pour retrouver un article ancien.</p>}
  </>;
}
