import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { getStoreSellers } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Profils de vendeurs",
  description: "Profils de démonstration associés aux offres mybigmarket. Informations, disponibilité et conditions à confirmer.",
};

export default async function SellersPage() {
  const sellers = await getStoreSellers();
  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Profils de vendeurs</span></div>
    <span className="eyebrow">PROFILS DE DÉMONSTRATION</span>
    <h1 className="page-title">Profils de vendeurs</h1>
    <p className="page-subtitle">Les profils et évaluations affichés sont fictifs; ils ne constituent pas une vérification indépendante.</p>
    <div className="seller-grid seller-directory">{sellers.map((seller, index) => <Link className="seller-card seller-card-large" key={seller.slug} href={`/vendeurs/${seller.slug}`}><div className={`seller-avatar avatar-${index}`}>{seller.initials}</div><div><b>{seller.name}</b><small>{seller.university}</small><span><Star size={11} fill="currentColor"/> {seller.rating.toFixed(1)} · {seller.city}</span></div></Link>)}</div>
  </main>;
}
