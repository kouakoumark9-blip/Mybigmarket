import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { getStoreSellers } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Profils de vendeurs",
  description: "Les vendeurs et fournisseurs dont les produits sont proposés sur mybigmarket.",
};

export default async function SellersPage() {
  const sellers = await getStoreSellers();
  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Profils de vendeurs</span></div>
    <span className="eyebrow">VENDEURS</span>
    <h1 className="page-title">Nos vendeurs</h1>
    <p className="page-subtitle">Les vendeurs et fournisseurs dont les produits sont proposés sur mybigmarket.</p>
    <div className="seller-grid seller-directory">{sellers.map((seller, index) => <Link className="seller-card seller-card-large" key={seller.slug} href={`/vendeurs/${seller.slug}`}><div className={`seller-avatar avatar-${index}`}>{seller.initials}</div><div><b>{seller.name}</b>{!seller.isDemo && <small>{seller.university}</small>}<span>{!seller.isDemo && seller.orders > 0 && <><Star size={11} fill="currentColor"/> {seller.rating.toFixed(1)} · </>}{seller.city}{seller.isDemo && " · Profil d’exemple"}</span></div></Link>)}</div>
  </main>;
}
