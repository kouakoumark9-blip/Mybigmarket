import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Star } from "lucide-react";
import { getStoreSellers } from "@/lib/catalog";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Vendeurs vérifiés",description:"Rencontrez les vendeurs étudiants vérifiés en Chine."};
export default async function SellersPage(){const sellers=await getStoreSellers();return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Vendeurs vérifiés</span></div><span className="eyebrow">COMMUNAUTÉ AFRIMARKETS</span><h1 className="page-title">Vendeurs étudiants en Chine</h1><p className="page-subtitle">Les profils de cette démonstration sont fictifs. En production, leur identité est contrôlée avant la mise en ligne.</p><div className="seller-grid seller-directory">{sellers.map((seller,i)=><Link className="seller-card seller-card-large" key={seller.slug} href={`/vendeurs/${seller.slug}`}><div className={`seller-avatar avatar-${i}`}>{seller.initials}</div><div><b>{seller.name}<BadgeCheck size={14} fill="#fff3e5"/></b><small>{seller.university}</small><span><Star size={11} fill="currentColor"/> {seller.rating.toFixed(1)} · {seller.city}</span></div></Link>)}</div></main>}
