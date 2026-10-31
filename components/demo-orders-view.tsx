"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Check, Circle, PackageSearch } from "lucide-react";
import { useCountryPreferences } from "@/components/country-preferences";
import { getDemoOrdersSnapshot, subscribeDemoCommerce, type DemoOrder } from "@/lib/demo-commerce";

const demoStages = ["Commande simulée enregistrée", "Confirmation vendeur à venir", "Préparation indicative en Chine", "Arrivée dans la destination choisie (à confirmer)"];
function parseOrders(snapshot: string): DemoOrder[] {
  try { return JSON.parse(snapshot) as DemoOrder[]; } catch { return []; }
}

export function DemoOrdersView() {
  const { formatPriceForCountry } = useCountryPreferences();
  const snapshot = useSyncExternalStore(subscribeDemoCommerce, getDemoOrdersSnapshot, () => "[]");
  const items = parseOrders(snapshot);
  return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Mes commandes</span></div><span className="eyebrow">ESPACE ACHETEUR · DÉMO</span><h1 className="page-title">Mes commandes</h1><p className="page-subtitle">Vos commandes simulées, conservées uniquement dans le navigateur de cet appareil.</p>
    {!items.length ? <div className="cart-panel cart-empty"><PackageSearch size={34}/><h2>Aucune commande simulée</h2><p>Ajoutez un article au panier, puis suivez les étapes de démonstration.</p><Link className="button button-primary" href="/produits">Découvrir les produits</Link></div> : items.map((order) => <Link href={`/compte/commandes/${encodeURIComponent(order.id)}`} className="order-card order-card-link demo-order-card" key={order.id}>
      <div className="order-card-head"><div><b>Commande #{order.id}</b><small>Créée le {new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(order.createdAt))} · Simulation</small></div><span className="status-pill">À confirmer</span></div>
      <div className="order-card-body"><span>{order.items.length} article(s) · {formatPriceForCountry(order.totalXof, order.deliveryCountryCode || "CI")}</span><span className="text-link">Voir le suivi <ArrowRight size={14}/></span></div>
    </Link>)}
    <div className="checkout-demo-warning demo-storage-note">Aucun paiement n’a été réalisé; les commandes ne sont visibles que dans ce navigateur et ne sont pas envoyées aux vendeurs.</div>
  </main>;
}

export function DemoOrderDetailView({ id }: { id: string }) {
  const { formatPriceForCountry } = useCountryPreferences();
  const snapshot = useSyncExternalStore(subscribeDemoCommerce, getDemoOrdersSnapshot, () => "[]");
  const order = parseOrders(snapshot).find((item) => item.id === id);
  if (!order) return <main className="shell page-space"><div className="cart-panel cart-empty"><PackageSearch size={34}/><h1>Commande introuvable sur cet appareil</h1><p>Les commandes de démonstration sont conservées localement et ne sont pas synchronisées entre navigateurs.</p><Link className="button button-primary" href="/compte/commandes">Retour à mes commandes</Link></div></main>;
  return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><Link href="/compte/commandes">Mes commandes</Link><span>›</span><span>Suivi démo</span></div><span className="eyebrow">SUIVI SIMULÉ</span><h1 className="page-title">Votre commande</h1><p className="page-subtitle">Référence {order.id} · {new Intl.DateTimeFormat("fr-FR",{dateStyle:"long"}).format(new Date(order.createdAt))}</p>
    <div className="two-column"><section className="account-panel demo-timeline-panel"><h2 className="panel-title">Étapes indicatives</h2><ol className="timeline">{demoStages.map((stage,index)=><li key={stage} className={index===0?"done":index===1?"current":""}><span className="timeline-icon">{index===0?<Check size={12}/>:<Circle size={8}/>}</span><div className="timeline-copy"><b>{stage}</b><small>{index===0?"Enregistrée dans ce navigateur":index===1?"En attente — aucun vendeur n’a été notifié":"Étape indicative du parcours"}</small></div></li>)}</ol><div className="checkout-demo-warning">Aucun paiement réel, transport ou mise à jour logistique n’est associé à cette commande démo.</div></section>
      <aside className="summary-card"><h2>Récapitulatif</h2>{order.items.map((item)=><div className="summary-row" key={item.slug}><span>{item.qty} × {item.title}</span><b>{formatPriceForCountry(item.qty*item.priceXof, order.deliveryCountryCode || "CI")}</b></div>)}<div className="summary-row"><span>Destination</span><span>{order.deliveryCountryName || order.deliveryCountryCode || "Côte d’Ivoire"}</span></div><div className="summary-row"><span>Réception choisie</span><span>{order.deliveryMethod === "pickup"?"Point relais":"Livraison"}</span></div><div className="summary-row total"><span>Sous-total indicatif</span><b>{formatPriceForCountry(order.totalXof, order.deliveryCountryCode || "CI")}</b></div><Link className="button button-outline" href="/compte/commandes">Retour à mes commandes</Link></aside>
    </div>
  </main>;
}
