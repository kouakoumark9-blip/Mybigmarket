import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, MapPin, Star } from "lucide-react";
import { getCatalogProducts, getStoreSellers } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

type Props={params:Promise<{slug:string}>};
export const dynamic="force-dynamic";
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params;const sellers=await getStoreSellers();const seller=sellers.find((item)=>item.slug===slug);return{title:seller?seller.name:"Vendeur introuvable"}}
export default async function SellerPage({params}:Props){const {slug}=await params;const [sellers,products]=await Promise.all([getStoreSellers(),getCatalogProducts()]);const seller=sellers.find((item)=>item.slug===slug);if(!seller)notFound();const rows=products.filter((item)=>item.sellerSlug===slug);return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><Link href="/vendeurs">Vendeurs</Link><span>›</span><span>{seller.name}</span></div><section className="seller-profile-banner"><div className="seller-avatar">{seller.initials}</div><div><span className="eyebrow">PROFIL VENDEUR (DONNÉES DÉMO)</span><h1>{seller.name} <BadgeCheck size={18} fill="#e9f5ec" color="#23834e"/></h1><p><MapPin size={14}/> {seller.city}, Chine · {seller.university}</p><span className="seller-score"><Star size={13} fill="currentColor"/> {seller.rating.toFixed(1)} · {seller.orders} commandes fictives</span></div><Link className="button button-outline" href={`/boutiques/${seller.slug}`}>Voir sa boutique</Link></section><div className="section-heading seller-products-heading"><div><span className="eyebrow">CATALOGUE DU VENDEUR</span><h2>Produits en précommande</h2></div></div><div className="catalog-grid">{rows.map((product)=><ProductCard key={product.slug} product={product}/>)}</div><div className="demo-note">Les notes et commandes sont des exemples pour prévisualiser l’interface. Les évaluations réelles seront liées aux commandes livrées.</div></main>}
