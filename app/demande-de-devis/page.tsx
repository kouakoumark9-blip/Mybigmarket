import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgePercent, ClipboardList } from "lucide-react";
import { SourcingRequestForm } from "@/components/sourcing-request-form";

export const metadata: Metadata = { title: "Demander un devis d’approvisionnement", description: "Décrivez le produit et le volume recherchés pour préparer une demande de sourcing." };

export default function SourcingPage() {
  return <main className="shell page-space sourcing-page">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Demande de devis</span></div>
    <div className="sourcing-layout">
      <section className="sourcing-intro"><span className="sourcing-icon"><BadgePercent size={22}/></span><span className="eyebrow">ACHAT DE GROS · SOURCING</span><h1 className="page-title">Vous cherchez un produit en volume ?</h1><p>Décrivez ce que vous souhaitez acheter. Pour cette version, la demande est enregistrée localement comme démonstration : elle ne part pas vers des fournisseurs.</p><div className="sourcing-steps"><div><b>01</b><span>Décrivez le produit</span></div><div><b>02</b><span>Indiquez le volume</span></div><div><b>03</b><span>Comparez les offres après retour vendeur</span></div></div><Link className="text-link" href="/produits"><ArrowLeft size={14}/> Ou choisir un produit du catalogue</Link></section>
      <SourcingRequestForm/>
    </div>
    <div className="demo-note"><ClipboardList size={16}/> Prix, disponibilité, transport et conditions de gros sont à confirmer par le vendeur dans une future version connectée.</div>
  </main>;
}
