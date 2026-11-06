import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, MapPin, Star } from "lucide-react";
import { getCatalogProducts, getPublicStorefrontBySlug, getStoreSellers } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

type Props={params:Promise<{slug:string}>};
export const dynamic="force-dynamic";
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params;const sellers=await getStoreSellers();const seller=sellers.find((item)=>item.slug===slug);return{title:seller?seller.name:"Vendeur introuvable"}}
export default async function SellerPage({params}:Props){const {slug}=await params;const [sellers,products,store]=await Promise.all([getStoreSellers(),getCatalogProducts(),getPublicStorefrontBySlug(slug).catch(()=>undefined)]);const seller=sellers.find((item)=>item.slug===slug);if(!seller)notFound();const rows=products.filter((item)=>item.sellerSlug===slug);return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Profil vendeur</span><span>›</span><span>{seller.name}</span></div><section className="seller-profile-banner"><div className="seller-avatar">{seller.initials}</div><div><span className="eyebrow">{seller.isDemo?"PROFIL D’EXEMPLE":"VENDEUR"}</span><h1>{seller.name}{!seller.isDemo&&<> <BadgeCheck size={18} className="text-primary fill-primary-soft"/></>}</h1><p><MapPin size={14}/> {seller.city}, Chine{!seller.isDemo&&<> · {seller.university}</>}</p>{!seller.isDemo&&seller.orders>0&&<span className="seller-score"><Star size={13} fill="currentColor"/> {seller.rating.toFixed(1)} · {seller.orders} avis</span>}</div>{store&&<Link className="button button-outline" href={`/boutiques/${store.slug}`}>Voir sa boutique</Link>}</section><div className="section-heading seller-products-heading"><div><span className="eyebrow">CATALOGUE DU VENDEUR</span><h2>{rows.length} produit{rows.length>1?"s":""}</h2></div></div><div className="catalog-grid">{rows.map((product)=><ProductCard key={product.slug} product={product}/>)}</div></main>}
