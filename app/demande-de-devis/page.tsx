import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Handshake, PackageSearch } from "lucide-react";
import { auth } from "@/auth";
import { QuoteRequestForm } from "@/components/quote-request-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demande de devis", description: "Décrivez le produit et la quantité recherchés : notre équipe vous envoie une offre depuis nos fournisseurs en Chine." };

type Props = { searchParams: Promise<{ produit?: string }> };

export default async function QuoteRequestPage({ searchParams }: Props) {
  const [{ produit }, session] = await Promise.all([searchParams, auth().catch(() => null)]);
  return <main className="shell page-space quote-page">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Demande de devis</span></div>
    <div className="quote-layout">
      <section>
        <span className="eyebrow">ACHAT EN QUANTITÉ · SOURCING</span>
        <h1 className="page-title">Demandez un devis</h1>
        <p className="page-subtitle">Un produit introuvable dans le catalogue, une grande quantité ou une personnalisation ? Décrivez votre besoin : nous consultons nos fournisseurs en Chine et vous envoyons une offre.</p>
        <QuoteRequestForm product={produit?.slice(0, 190)} signedIn={Boolean(session?.user?.id)}/>
      </section>
      <aside className="quote-steps" aria-label="Comment ça marche">
        <h2>Comment ça marche</h2>
        <ol>
          <li><ClipboardList size={20}/><span><b>1. Vous décrivez votre besoin</b>Produit, quantité, ville de livraison.</span></li>
          <li><PackageSearch size={20}/><span><b>2. Nous consultons les fournisseurs</b>Prix, délai et frais de transport jusqu’à chez vous.</span></li>
          <li><Handshake size={20}/><span><b>3. Vous recevez une offre</b>Vous l’acceptez ou en discutez avec notre équipe, sans engagement.</span></li>
        </ol>
      </aside>
    </div>
  </main>;
}
