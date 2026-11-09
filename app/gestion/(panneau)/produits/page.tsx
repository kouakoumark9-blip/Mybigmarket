import Link from "next/link";
import { and, asc, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { categories, products } from "@/lib/db/schema";
import { availabilityLabel } from "@/lib/shop/availability";
import { formatFcfa } from "@/lib/shop/format";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; filtre?: string; supprime?: string }> }) {
  const { q = "", filtre = "", supprime } = await searchParams;
  const term = q.trim().replace(/[%_]/g, " ");
  const rows = await getDb().select({ product: products, category: categories.name }).from(products).innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(isNull(products.deletedAt), term ? or(ilike(products.title, `%${term}%`), ilike(products.slug, `%${term}%`)) : undefined, filtre === "fictifs" ? eq(products.isPlaceholder, true) : undefined, filtre === "brouillons" ? eq(products.status, "draft") : undefined))
    .orderBy(desc(products.updatedAt), asc(products.title)).limit(300);
  return <>
    <h1>Produits</h1>
    {supprime && <div className="gs-msg gs-msg--ok">Produit supprimé.</div>}
    <div className="gs-actions" style={{ marginBottom: 12 }}>
      <Link className="gs-btn" href="/gestion/produits/nouveau">Ajouter un produit</Link>
      <Link className="gs-btn gs-btn--ghost" href="/gestion/import">Importer un fichier CSV</Link>
      <form style={{ marginLeft: "auto", display: "flex", gap: 8 }}><input name="q" defaultValue={q} placeholder="Rechercher" aria-label="Rechercher un produit" style={{ minHeight: 40, padding: "0 10px", border: "1px solid #c4c9d2", borderRadius: 4 }}/><button className="gs-btn gs-btn--ghost" type="submit">Chercher</button></form>
    </div>
    <div className="gs-filter"><Link href="/gestion/produits" aria-current={!filtre}>Tous</Link><Link href="/gestion/produits?filtre=fictifs" aria-current={filtre === "fictifs"}>Fiches fictives</Link><Link href="/gestion/produits?filtre=brouillons" aria-current={filtre === "brouillons"}>Brouillons</Link></div>
    <div className="gs-scroll"><table className="gs-table"><thead><tr><th>Produit</th><th>Catégorie</th><th>Prix</th><th>Disponibilité</th><th>Stock</th><th>État</th></tr></thead><tbody>
      {rows.map(({ product, category }) => <tr key={product.id}>
        <td><Link href={`/gestion/produits/${product.id}`}>{product.title}</Link>{product.isPlaceholder && <> <span className="gs-pill gs-pill--no">Fictif</span></>}</td>
        <td>{category}</td><td>{formatFcfa(product.priceXof)}</td><td>{availabilityLabel(product.availability, product.leadTimeDays)}</td>
        <td>{product.availability === "on_order" ? "n/a" : product.quantity}</td>
        <td><span className={`gs-pill${product.status === "approved" ? " gs-pill--ok" : ""}`}>{product.status === "approved" ? "En ligne" : "Brouillon"}</span></td>
      </tr>)}
      {!rows.length && <tr><td colSpan={6}>Aucun produit.</td></tr>}
    </tbody></table></div>
  </>;
}
