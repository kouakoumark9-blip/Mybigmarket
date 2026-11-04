import Link from "next/link";
import { asc, count, desc, lte } from "drizzle-orm";
import { Boxes, PackageCheck, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminProducts } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { adjustStockAction } from "./actions";

export const dynamic = "force-dynamic";
const statusLabels: Record<string, string> = { draft: "Brouillon", pending_review: "À vérifier", approved: "Approuvé", published: "Publié", rejected: "Refusé", archived: "Archivé" };
const notices: Record<string, string> = { updated: "Stock ajusté et mouvement journalisé.", invalid: "Vérifie la quantité et indique un motif d’au moins 5 caractères.", "missing-or-negative": "Produit introuvable ou quantité insuffisante pour cette sortie.", error: "L’ajustement n’a pas abouti. Réessaie." };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireEmployee("catalog.stock.read");
  const params = await searchParams;
  const db = getAdminDb();
  const [products, total, lowStock] = await Promise.all([
    db.select({ id: adminProducts.id, title: adminProducts.title, sku: adminProducts.sku, status: adminProducts.status, quantity: adminProducts.quantity, lowStockThreshold: adminProducts.lowStockThreshold, updatedAt: adminProducts.updatedAt })
      .from(adminProducts).orderBy(asc(adminProducts.quantity), desc(adminProducts.updatedAt)).limit(100),
    db.select({ value: count() }).from(adminProducts),
    db.select({ value: count() }).from(adminProducts).where(lte(adminProducts.quantity, adminProducts.lowStockThreshold)),
  ]);
  const notice = params.notice ? notices[params.notice] : undefined;

  return <>
    <div className="admin-breadcrumb"><span>Catalogue</span><span>/</span><strong>Stock</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Stock</h1><p className="admin-page-subtitle">Suivi des quantités et ajustements manuels avec motif journalisé (entrepôt par défaut).</p></div><div className="flex flex-wrap gap-2"><Link href="/catalogue/stock/operations" className="ui-button ui-button-outline">Opérations</Link><Link href="/catalogue/stock/mouvements" className="ui-button ui-button-outline">Mouvements</Link><Link href="/catalogue/stock/alertes" className="ui-button ui-button-outline">Alertes</Link><Link href="/catalogue/entrepots" className="ui-button ui-button-outline">Entrepôts</Link></div></div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${params.notice === "updated" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`} role="status">{notice}</p>}
    <div className="mb-5 grid gap-4 sm:grid-cols-2"><Card className="flex items-center gap-3 p-4"><div className="rounded-lg bg-slate-100 p-2.5 text-slate-700"><PackageCheck size={19}/></div><div><div className="text-xs font-semibold text-slate-500">Produits suivis</div><div className="text-xl font-bold text-slate-950">{Number(total[0]?.value || 0)}</div></div></Card><Card className="flex items-center gap-3 p-4"><div className="rounded-lg bg-amber-50 p-2.5 text-amber-700"><TriangleAlert size={19}/></div><div><div className="text-xs font-semibold text-slate-500">Sous le seuil d’alerte</div><div className="text-xl font-bold text-slate-950">{Number(lowStock[0]?.value || 0)}</div></div></Card></div>
    <Card>
      {products.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[980px]"><thead><tr><th>Produit</th><th>Statut</th><th>Quantité</th><th>Seuil</th><th>Ajuster le stock</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><div className="font-semibold text-slate-900">{product.title}</div><div className="text-[11px] text-slate-500">SKU : {product.sku || "non défini"}</div></td><td>{statusLabels[product.status] || product.status}</td><td><span className={`font-bold ${product.quantity <= product.lowStockThreshold ? "text-amber-700" : "text-slate-900"}`}>{product.quantity.toLocaleString("fr-FR")}</span></td><td>{product.lowStockThreshold.toLocaleString("fr-FR")}</td><td><form action={adjustStockAction} className="flex min-w-[620px] items-center gap-2"><input type="hidden" name="productId" value={product.id}/><select name="direction" defaultValue="in" aria-label="Type d’ajustement" className="ui-input !h-9 !w-32"><option value="in">Entrée +</option><option value="out">Sortie −</option></select><input type="number" name="amount" min={1} max={100000} defaultValue={1} required aria-label="Quantité à ajuster" className="ui-input !h-9 !w-24"/><input type="text" name="reason" minLength={5} maxLength={300} required aria-label="Motif de l’ajustement" placeholder="Motif obligatoire" className="ui-input !h-9 min-w-40 flex-1"/><button type="submit" className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800">Enregistrer</button></form></td></tr>)}</tbody></table></div> : <div className="admin-empty"><Boxes size={22} className="mb-2 text-slate-400"/><strong>Aucun produit</strong>Les produits apparaîtront ici après leur création.</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Les quantités seedées sont nulles et illustratives. Aucun stock de démonstration n’est annoncé comme réel; ne publie pas ces articles sans vérification.</span></div>
    </Card>
  </>;
}
