"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, LockKeyhole } from "lucide-react";
import { createCheckoutAction } from "@/actions/checkout";
import { useCart } from "@/components/cart-provider";
import { formatXof } from "@/lib/demo-data";
import { saveDemoOrder } from "@/lib/demo-commerce";

type PickupOption = { id: number; name: string; city: string; address: string };

export default function CheckoutForm({ pickupPoints, demoMode = false }: { pickupPoints: PickupOption[]; demoMode?: boolean }) {
  const { items, total, clearCart } = useCart();
  const [payment, setPayment] = useState("orange_money");
  const [delivery, setDelivery] = useState("delivery");
  const [done, setDone] = useState(false);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const sellerGroups = [...new Set(items.map((item) => item.seller))];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!items.length) return;
    if (demoMode) {
      const order = saveDemoOrder({
        items: items.map(({ slug, title, seller, qty, priceXof, minimumQuantity, leadTimeDays }) => ({ slug, title, seller, qty, priceXof, minimumQuantity, leadTimeDays })),
        totalXof: total,
        deliveryMethod: delivery as "delivery" | "pickup",
      });
      setOrderIds([order.id]); setDone(true); clearCart(); return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("cart", JSON.stringify(items.map((item) => ({ slug: item.slug, qty: item.qty }))));
    formData.set("deliveryMethod", delivery);
    formData.set("method", payment);
    startTransition(async () => {
      const result = await createCheckoutAction(formData);
      if (result.error) { setError(result.error); return; }
      setOrderIds(result.orderIds || []); setDone(true); clearCart();
    });
  }

  if (done) return <main className="shell page-space"><div className="auth-card checkout-success"><BadgeCheck size={42} color="#ff8000"/><span className="eyebrow">COMMANDE {demoMode ? "SIMULÉE" : "ENREGISTRÉE"}</span><h1>{demoMode ? "Votre commande de démonstration est prête" : "Commande enregistrée"}</h1>{demoMode ? <><p>Référence <b>{orderIds[0]}</b>. Le récapitulatif et les étapes simulées sont consultables dans votre espace commande.</p><p>Aucun paiement réel n’a été effectué. Cette commande est stockée uniquement dans ce navigateur; la sélection du moyen de paiement n’entraîne aucun débit.</p></> : <><p>{orderIds.length} commande(s) créée(s), une par vendeur. Référence(s) : <b>{orderIds.map((id) => id.slice(0, 8).toUpperCase()).join(", ")}</b></p><p>Le paiement est en attente. Aucun fonds n’a été débité par le mode mock.</p></>}<Link className="button button-primary" href="/compte/commandes">Voir mes commandes <ArrowRight size={15}/></Link></div></main>;

  if (!items.length) return <main className="shell page-space"><div className="cart-panel cart-empty"><h2>Votre panier est vide</h2><p>Ajoutez des produits avant de passer commande.</p><Link className="button button-primary" href="/produits">Voir le catalogue</Link></div></main>;

  return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><Link href="/panier">Panier</Link><span>›</span><span>Finaliser</span></div><h1 className="page-title">Finaliser ma commande</h1><p className="page-subtitle">Une commande indépendante sera préparée pour chaque vendeur.</p>
    <form onSubmit={submit} className="two-column"><section className="checkout-panel checkout-form-panel"><h2 className="checkout-heading">1. Adresse de réception</h2><input type="hidden" name="deliveryMethod" value={delivery}/><div className="delivery-toggle"><label className={`payment-choice ${delivery === "delivery" ? "selected" : ""}`}><input type="radio" name="delivery-choice" checked={delivery === "delivery"} onChange={() => setDelivery("delivery")}/> Livraison à une adresse</label><label className={`payment-choice ${delivery === "pickup" ? "selected" : ""}`}><input type="radio" name="delivery-choice" checked={delivery === "pickup"} onChange={() => setDelivery("pickup")}/> Point relais</label></div>{delivery === "delivery" ? <div className="form-grid checkout-address-fields"><div className="field"><label htmlFor="name">Nom complet</label><input id="name" name="name" required placeholder="Votre nom"/></div><div className="field"><label htmlFor="phone">Téléphone</label><input id="phone" name="phone" required inputMode="tel" placeholder="+225 07 00 00 00 00"/></div><div className="field full"><label htmlFor="address">Adresse à Abidjan</label><input id="address" name="address" required placeholder="Commune, quartier, rue, repère"/></div><div className="field"><label htmlFor="city">Ville</label><input id="city" name="city" defaultValue="Abidjan" required/></div></div> : <div className="field checkout-pickup-field"><label htmlFor="pickupPointId">Point relais</label><select id="pickupPointId" name="pickupPointId" required><option value="">Choisir un point relais</option>{pickupPoints.map((point) => <option key={point.id} value={point.id}>{point.name} — {point.city}</option>)}</select></div>}
      <h2 className="checkout-heading checkout-payment-heading">2. Moyen de paiement</h2><div className="payment-options">{[["orange_money", "Orange Money"], ["mtn_momo", "MTN MoMo"], ["wave", "Wave"], ["card", "Carte bancaire"]].map(([value, label]) => <label className={`payment-choice ${payment === value ? "selected" : ""}`} key={value}><input type="radio" name="payment-choice" checked={payment === value} onChange={() => setPayment(value)}/><span>{label}</span></label>)}</div><div className="checkout-demo-warning"><LockKeyhole size={15}/>{demoMode ? "Prototype interactif : ce choix sert uniquement à montrer l’étape de paiement. Aucun paiement ne sera lancé." : "Paiement mock en attente. Aucun débit ni transfert réel n’est effectué."}</div>{error && <div className="form-error" role="alert">{error}{error.includes("Connectez-vous") && <> <Link href="/connexion">Se connecter</Link></>}</div>}</section>
      <aside className="summary-card"><h2>Votre commande</h2>{sellerGroups.map((seller) => <div key={seller}><div className="seller-cart-group">Commande vendeur : {seller}</div>{items.filter((item) => item.seller === seller).map((item) => <div className="summary-row" key={item.slug}><span>{item.qty} × {item.title}</span><b>{formatXof(item.qty * item.priceXof)}</b></div>)}</div>)}<div className="summary-row"><span>Livraison estimée</span><span>À confirmer</span></div><div className="summary-row total"><span>Total produits</span><b>{formatXof(total)}</b></div><button className="button button-primary" type="submit" disabled={pending}>{pending ? "Création…" : demoMode ? "Simuler ma commande" : "Confirmer la commande"} <ArrowRight size={15}/></button><p className="summary-note">Transport, douane et livraison ne sont pas calculés. {demoMode ? "Les commandes simulées restent dans ce navigateur." : "Le paiement mock ne collecte aucune donnée bancaire."}</p></aside></form>
  </main>;
}
