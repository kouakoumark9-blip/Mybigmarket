"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, MessageSquareText } from "lucide-react";
import { getDemoInquiriesSnapshot, subscribeDemoCommerce, type DemoInquiry } from "@/lib/demo-commerce";

function parseInquiries(snapshot: string): DemoInquiry[] {
  try { return JSON.parse(snapshot) as DemoInquiry[]; } catch { return []; }
}

export function DemoInquiriesView() {
  const snapshot = useSyncExternalStore(subscribeDemoCommerce, getDemoInquiriesSnapshot, () => "[]");
  const items = parseInquiries(snapshot);
  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Mes demandes de devis</span></div>
    <span className="eyebrow">SOURCING & ACHAT DE GROS</span><h1 className="page-title">Mes demandes de devis</h1>
    <p className="page-subtitle">Historique de démonstration enregistré sur cet appareil uniquement. Les fournisseurs ne reçoivent pas encore ces demandes.</p>
    <div className="quote-dashboard-actions"><Link className="button button-primary" href="/demande-de-devis">Créer une demande de sourcing <ArrowRight size={15}/></Link><Link className="button button-outline" href="/produits">Parcourir les produits</Link></div>
    {!items.length ? <div className="cart-panel cart-empty"><MessageSquareText size={34}/><h2>Aucune demande enregistrée</h2><p>Demandez un devis depuis une fiche produit ou décrivez le produit que vous recherchez.</p><Link className="button button-primary" href="/demande-de-devis">Créer ma première demande</Link></div> : <div className="quote-request-list">{items.map((item) => <article className="quote-request-card" key={item.id}>
      <div className="quote-request-head"><span className="quote-kind">{item.kind === "product" ? "DEVIS PRODUIT" : "SOURCING"}</span><span className="quote-status">{item.status}</span></div>
      <h2>{item.productTitle}</h2><div className="quote-request-meta"><span>Quantité : <b>{item.quantity}</b></span><span>Destination : <b>{item.destination}</b></span>{item.sellerName&&<span>Vendeur : <b>{item.sellerName}</b></span>}</div>
      {item.message&&<p className="quote-request-message">{item.message}</p>}
      <div className="quote-request-foot"><small>Réf. {item.id} · {new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.createdAt))}</small><span><ClipboardList size={14}/> Stockage local de démonstration</span></div>
    </article>)}</div>}
  </main>;
}
