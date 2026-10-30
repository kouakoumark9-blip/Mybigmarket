import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Eye, Store } from "lucide-react";
import { requireRole } from "@/lib/access";
import { getDb } from "@/lib/db";
import { sellerProfiles, sellerStorefronts } from "@/lib/db/schema";
import { StorefrontSettingsForm } from "@/components/storefront-settings-form";

export const metadata: Metadata = { title: "Ma boutique publique" };
export default async function SellerStorefrontPage() {
  const seller = await requireRole("seller");
  const db = getDb();
  const [[profile], [storefront]] = await Promise.all([
    db.select({ verificationStatus: sellerProfiles.verificationStatus }).from(sellerProfiles).where(eq(sellerProfiles.userId, seller.id)).limit(1),
    db.select().from(sellerStorefronts).where(eq(sellerStorefronts.sellerId, seller.id)).limit(1),
  ]);
  if (!profile || profile.verificationStatus !== "approved") return <main className="shell page-space"><div className="breadcrumbs"><Link href="/vendeur">Espace vendeur</Link><span>›</span><span>Ma boutique</span></div><div className="account-panel"><Store size={25}/><h1>La boutique publique se débloque après vérification</h1><p>Une fois votre profil vendeur approuvé, vous pourrez personnaliser votre page et y présenter les produits validés.</p><Link className="button button-outline" href="/vendeur">Retour à mon espace</Link></div></main>;
  const fallbackSlug = (seller.email.split("@")[0] || seller.name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 120);
  const initial = {
    storeName: storefront?.storeName || seller.name,
    slug: storefront?.slug || fallbackSlug,
    headline: storefront?.headline || "Une sélection pensée pour les acheteurs en Côte d’Ivoire",
    description: storefront?.description || "",
    announcement: storefront?.announcement || "",
    isPublished: storefront?.isPublished || false,
  };
  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/vendeur">Espace vendeur</Link><span>›</span><span>Ma boutique</span></div>
    <div className="dashboard-title-row"><div><span className="eyebrow">VITRINE EN LIGNE</span><h1 className="page-title">Ma boutique mybigmarket</h1><p className="page-subtitle">Configurez une page publique pour présenter vos produits approuvés.</p></div>{storefront?.isPublished && <Link className="button button-outline" href={`/boutiques/${storefront.slug}`} target="_blank"><Eye size={15}/> Voir ma boutique</Link>}</div>
    <StorefrontSettingsForm initial={initial}/>
    <div className="protected-banner" style={{ marginTop: 14 }}><Eye size={16}/> Les produits doivent être validés par mybigmarket avant d’apparaître dans la vitrine. La publication de la page ne vaut ni vérification du stock ni garantie commerciale.</div>
    <Link className="back-link" href="/vendeur"><ArrowLeft size={15}/> Retour à l’espace vendeur</Link>
  </main>;
}
