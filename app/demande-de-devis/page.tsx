import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BadgePercent, ClipboardList } from "lucide-react";
import { SourcingRequestForm } from "@/components/sourcing-request-form";

export const metadata: Metadata = { title: "Demander un devis d’approvisionnement", description: "Décrivez le produit et le volume recherchés pour préparer une demande de sourcing." };
export const dynamic = "force-dynamic";

export default function SourcingPage() {
  const backendConfigured = Boolean(process.env.DATABASE_URL);
  return <main className="shell page-space sourcing-page">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Demande de devis</span></div>
    <div className="sourcing-layout">
      <section className="sourcing-intro"><span className="sourcing-icon"><BadgePercent size={22}/></span><span className="eyebrow">ACHAT DE GROS · SOURCING</span><h1 className="page-title">Vous cherchez un produit en volume ?</h1><p>{backendConfigured ? "Décrivez votre besoin pour l’enregistrer dans votre compte et le rendre visible à l’équipe sourcing de mybigmarket." : "Décrivez ce que vous souhaitez acheter. Sans base Neon, cette demande reste une démonstration locale et ne part pas vers les fournisseurs."}</p><div className="sourcing-steps"><div><b>01</b><span>Décrivez le produit</span></div><div><b>02</b><span>Indiquez le volume</span></div><div><b>03</b><span>Comparez les offres après retour vendeur</span></div></div><Link className="text-link" href="/produits"><ArrowLeft size={14}/> Ou choisir un produit du catalogue</Link></section>
      <SourcingRequestForm backendConfigured={backendConfigured}/>
    </div>
    <div className="demo-note"><ClipboardList size={16}/> {backendConfigured ? "La demande sera examinée par l’équipe sourcing; prix, disponibilité, transport et conditions de gros restent à confirmer." : "Sans Neon configuré, cette demande reste locale et n’est pas transmise à un fournisseur."}</div>
    {!backendConfigured && process.env.NODE_ENV !== "production" && <div className="quote-dashboard-actions"><Link className="button button-outline" href="/demo-backend">Ouvrir le back-office fictif <ArrowRight size={15}/></Link></div>}
  </main>;
}
