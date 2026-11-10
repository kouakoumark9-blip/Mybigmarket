import Link from "next/link";
import { and, count, desc, eq, isNull, lte } from "drizzle-orm";
import { installSeedAction } from "@/app/gestion/actions";
import { getDb } from "@/lib/db";
import { categories, products, shopOrders } from "@/lib/db/schema";
import { formatFcfa } from "@/lib/shop/format";
import { statusLabel } from "@/lib/shop/orders";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ installe?: string }> }) {
  const query = await searchParams;
  const db = getDb();
  const [[fresh], [published], [placeholders], [lowStock], recent, [{ n: categoryCount }]] = await Promise.all([
    db.select({ n: count() }).from(shopOrders).where(eq(shopOrders.status, "new")),
    db.select({ n: count() }).from(products).where(and(eq(products.status, "approved"), isNull(products.deletedAt))),
    db.select({ n: count() }).from(products).where(and(eq(products.isPlaceholder, true), isNull(products.deletedAt))),
    db.select({ n: count() }).from(products).where(and(eq(products.availability, "in_stock_abidjan"), lte(products.quantity, 2), eq(products.status, "approved"), isNull(products.deletedAt), eq(products.isPlaceholder, false))),
    db.select().from(shopOrders).orderBy(desc(shopOrders.createdAt)).limit(8),
    db.select({ n: count() }).from(categories).where(eq(categories.slug, "lits")),
  ]);
  return <>
    <h1>Tableau de bord</h1>
    {query.installe && <div className="gs-msg gs-msg--ok">Catégories et fiches fictives installées.</div>}
    {categoryCount === 0 && <form action={installSeedAction} className="gs-card"><h2>Première installation</h2><p>Crée la catégorie Lits et ses sous-catégories (par taille, par type, par matière, packs lit + matelas). Sans danger si déjà fait.</p><button className="gs-btn" type="submit">Installer les données de départ</button></form>}
    {placeholders.n > 0 && <div className="gs-msg gs-msg--warn">{placeholders.n} fiche(s) fictive(s) sont encore en ligne : remplacez-les par vos vrais produits dans <Link href="/gestion/produits?filtre=fictifs">Produits</Link>.</div>}
    <div className="gs-stats">
      <div className="gs-stat"><b>{fresh.n}</b>Commande(s) nouvelle(s)</div>
      <div className="gs-stat"><b>{published.n}</b>Produit(s) en ligne</div>
      <div className="gs-stat"><b>{lowStock.n}</b>Produit(s) presque épuisé(s)</div>
    </div>
    <div className="gs-actions" style={{ marginBottom: 16 }}><Link className="gs-btn" href="/gestion/produits/nouveau">Ajouter un produit</Link><Link className="gs-btn gs-btn--ghost" href="/gestion/commandes">Voir les commandes</Link></div>
    <div className="gs-card"><h2>Dernières commandes</h2>
      {recent.length ? <div className="gs-scroll"><table className="gs-table"><thead><tr><th>Numéro</th><th>Client</th><th>Commune</th><th>Total</th><th>Statut</th></tr></thead><tbody>
        {recent.map((order) => <tr key={order.id}><td><Link href={`/gestion/commandes/${order.reference}`}>{order.reference}</Link></td><td>{order.customerName}</td><td>{order.commune}</td><td>{formatFcfa(order.totalXof)}</td><td><span className={`gs-pill${order.status === "new" ? " gs-pill--new" : ""}`}>{statusLabel(order.status)}</span></td></tr>)}
      </tbody></table></div> : <p>Aucune commande pour le moment.</p>}
    </div>
  </>;
}
