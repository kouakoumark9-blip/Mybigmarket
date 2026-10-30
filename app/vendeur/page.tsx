import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { BadgeCheck, BarChart3, Boxes, Clock3, ClipboardList, MessageSquareText, PackagePlus, Store, Wallet } from "lucide-react";
import { requireUser } from "@/lib/access";
import { getDb } from "@/lib/db";
import { products, quoteRequests, sellerProfiles } from "@/lib/db/schema";
import { SellerApplicationForm } from "@/components/seller-forms";

export const metadata: Metadata={title:"Espace vendeur"};
export default async function SellerDashboardPage(){
 const user=await requireUser();
 if(user.role==="admin") return <main className="shell page-space"><h1 className="page-title">Compte administrateur</h1><p className="page-subtitle">Utilisez le tableau d’administration mybigmarket.</p><Link className="button button-primary" href="/admin">Ouvrir l’administration</Link></main>;
 const db=getDb();const [profile]=await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId,user.id)).limit(1);
 if(!profile) return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Vendre sur mybigmarket</span></div><h1 className="page-title">Vendre sur mybigmarket</h1><p className="page-subtitle">Présentez votre profil étudiant. La validation manuelle est obligatoire avant publication.</p><SellerApplicationForm/></main>;
 if(profile.verificationStatus!=="approved") return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Espace vendeur</span></div><div className="account-panel seller-status-panel"><div className={`verification-mark ${profile.verificationStatus}`}>{profile.verificationStatus==="rejected"?"!":"…"}</div><h1>{profile.verificationStatus==="rejected"?"Demande à compléter":"Votre profil est en vérification"}</h1><p>Statut : <b>{profile.verificationStatus==="pending"?"En attente":"Refusé"}</b>. Vous recevrez une mise à jour après le contrôle de l’équipe mybigmarket.</p><p>{profile.university} · {profile.cityChina}</p>{profile.verificationStatus==="rejected"&&<SellerApplicationForm/>}</div></main>;
 const [productCount]=await db.select({value:count()}).from(products).where(eq(products.sellerId,user.id));
 const [pendingCount]=await db.select({value:count()}).from(products).where(and(eq(products.sellerId,user.id),eq(products.status,"pending_review")));
 const [quoteCount]=await db.select({value:count()}).from(quoteRequests).where(and(eq(quoteRequests.sellerId,user.id),eq(quoteRequests.status,"new")));
 return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Espace vendeur</span></div><div className="dashboard-title-row"><div><span className="eyebrow">ESPACE VENDEUR</span><h1 className="page-title">Bonjour, {user.name}</h1><p className="page-subtitle">{profile.university} · {profile.cityChina} <span className="verified-inline"><BadgeCheck size={14}/> Profil vérifié</span></p></div><Link className="button button-primary" href="/vendeur/produits"><PackagePlus size={16}/> Ajouter un produit</Link></div>
 <div className="admin-stats"><div className="stat-card"><small>Produits</small><b>{productCount.value}</b></div><div className="stat-card"><small>En attente de validation</small><b>{pendingCount.value}</b></div><div className="stat-card"><small>Solde disponible</small><b>—</b><small>Brancher ledger payout</small></div><div className="stat-card"><small>Note vendeur</small><b>{Number(profile.ratingAvg).toFixed(1)} ★</b></div></div>
 <div className="dashboard-grid"><Link className="dashboard-link" href="/vendeur/produits"><Boxes size={19}/><b>Mes produits</b><p>Créer, modifier et consulter l’état de validation.</p></Link><Link className="dashboard-link" href="/vendeur/commandes"><ClipboardList size={19}/><b>Mes commandes</b><p>Voir les commandes associées à vos produits.</p></Link><Link className="dashboard-link" href="/vendeur/demandes"><MessageSquareText size={19}/><b>Demandes de devis ({quoteCount.value})</b><p>Consulter les acheteurs intéressés et leur répondre.</p></Link><Link className="dashboard-link" href="/vendeur/boutique"><Store size={19}/><b>Ma boutique</b><p>Personnaliser votre vitrine publique et son adresse.</p></Link><Link className="dashboard-link" href="/vendeur/statistiques"><BarChart3 size={19}/><b>Statistiques</b><p>Suivre le volume, les commandes et les produits en tête.</p></Link><Link className="dashboard-link" href="/vendeur/portefeuille"><Wallet size={19}/><b>Portefeuille</b><p>Consulter le solde et demander un retrait.</p></Link></div>
 <div className="protected-banner" style={{marginTop:14}}><Clock3 size={16}/> Les commandes et les paiements s’affichent après activation du paiement réel et du flux de split par vendeur.</div>
 </main>;
}
