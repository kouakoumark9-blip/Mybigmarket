import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/access";
import { getDb } from "@/lib/db";
import { categories, products } from "@/lib/db/schema";
import { SellerProductForm } from "@/components/seller-forms";
import { ArchiveProductButton } from "@/components/archive-product-button";
import { formatXof } from "@/lib/demo-data";

export const metadata: Metadata={title:"Mes produits vendeur"};
const statusLabels:Record<string,string>={draft:"Brouillon",pending_review:"À valider",approved:"En ligne",rejected:"Refusé",archived:"Archivé"};
export default async function SellerProductsPage(){
 const user=await requireRole("seller");const db=getDb();
 const categoryRows=await db.select().from(categories).where(eq(categories.isActive,true)).orderBy(categories.sortOrder);
 const productRows=await db.select().from(products).where(eq(products.sellerId,user.id)).orderBy(desc(products.createdAt));
 return <main className="shell page-space"><div className="breadcrumbs"><Link href="/vendeur">Espace vendeur</Link><span>›</span><span>Mes produits</span></div><h1 className="page-title">Gestion de mes produits</h1><p className="page-subtitle">Un nouveau produit reste invisible tant que l’équipe ne l’a pas validé.</p><div className="seller-products-layout"><section className="account-panel" style={{padding:14}}><h2 className="panel-title">Mes annonces ({productRows.length})</h2>{productRows.length===0?<div className="empty-state"><p>Aucun produit pour le moment.</p></div>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Produit</th><th>Prix</th><th>Minimum</th><th>Statut</th><th></th></tr></thead><tbody>{productRows.map((product)=><tr key={product.id}><td><b>{product.title}</b><small className="table-secondary">{product.leadTimeDays} jours estimés</small></td><td>{formatXof(product.priceXof)}</td><td>{product.minimumQuantity}</td><td><span className={`status-pill status-${product.status}`}>{statusLabels[product.status]||product.status}</span></td><td>{product.status!=="archived"&&<ArchiveProductButton productId={product.id}/>}</td></tr>)}</tbody></table></div>}</section><SellerProductForm categoryRows={categoryRows}/></div></main>;
}
