"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { useCart } from "@/components/cart-provider";
import { placeOrderAction } from "@/actions/shop-order";
import { DELIVERY_ZONES, findZone } from "@/lib/shop/delivery";
import { PAYMENT_METHODS } from "@/lib/shop/config";
import { formatFcfa } from "@/lib/shop/format";

export function CheckoutForm() {
  const router = useRouter();
  const { items, total, clearCart } = useCart();
  const [commune, setCommune] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const zone = findZone(commune);
  const fee = zone?.feeXof ?? 0;

  if (!items.length) return <div className="mb-box"><div className="mb-box-body" style={{ textAlign: "center", padding: "40px 16px" }}>
    <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Votre panier est vide</h2>
    <p style={{ margin: "0 0 16px", color: "#5b6577" }}>Ajoutez un produit pour passer commande.</p>
    <Link className="mb-btn" href="/produits">Voir les produits</Link>
  </div></div>;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await placeOrderAction({
        name: String(data.get("name") ?? ""), phone: String(data.get("phone") ?? ""), commune: String(data.get("commune") ?? ""),
        address: String(data.get("address") ?? ""), note: String(data.get("note") ?? ""),
        payment: String(data.get("payment") ?? ""),
        cart: items.map((item) => ({ slug: item.slug, qty: item.qty })),
      });
      if (result.error || !result.reference || !result.accessKey) { setError(result.error ?? "La commande n'a pas pu être enregistrée."); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      clearCart();
      router.push(`/commande/confirmation/${result.reference}?k=${result.accessKey}`);
    });
  }

  const groups: Array<"Abidjan" | "Autres villes"> = ["Abidjan", "Autres villes"];
  return <form className="mb-two" onSubmit={submit} noValidate={false}>
    <div style={{ display: "grid", gap: 16 }}>
      {error && <div className="mb-notice mb-notice--error" role="alert">{error}</div>}
      <section className="mb-box" aria-label="Livraison">
        <h2>1. Où livrer ?</h2>
        <div className="mb-box-body mb-form">
          <div className="mb-grid2">
            <div className="mb-field"><label htmlFor="c-name">Nom et prénom</label><input id="c-name" name="name" className="mb-input" required minLength={2} autoComplete="name"/></div>
            <div className="mb-field"><label htmlFor="c-phone">Téléphone</label><input id="c-phone" name="phone" className="mb-input" type="tel" inputMode="tel" required autoComplete="tel" placeholder="07 12 34 56 78"/><small>Le livreur vous appellera à ce numéro.</small></div>
          </div>
          <div className="mb-field"><label htmlFor="c-commune">Commune ou ville</label>
            <select id="c-commune" name="commune" required value={commune} onChange={(event) => setCommune(event.target.value)}>
              <option value="">Choisissez…</option>
              {groups.map((group) => <optgroup key={group} label={group === "Abidjan" ? "Abidjan" : "Autres villes de Côte d'Ivoire"}>{DELIVERY_ZONES.filter((item) => item.group === group).map((item) => <option key={item.commune} value={item.commune}>{item.commune}</option>)}</optgroup>)}
            </select>
            {zone && <small>Délai de livraison : {zone.delay}.</small>}
          </div>
          <div className="mb-field"><label htmlFor="c-address">Adresse précise</label><textarea id="c-address" name="address" className="mb-input" required minLength={5} autoComplete="street-address" placeholder="Quartier, rue, immeuble, repère connu…"/></div>
          <div className="mb-field"><label htmlFor="c-note">Message (facultatif)</label><input id="c-note" name="note" className="mb-input" maxLength={500} placeholder="Étage, horaires de livraison…"/></div>
        </div>
      </section>
      <section className="mb-box" aria-label="Paiement">
        <h2>2. Paiement</h2>
        <div className="mb-box-body">
          <p className="mb-pay-intro">Choisissez votre opérateur mobile money.</p>
          {PAYMENT_METHODS.map((method) => <label key={method.code} className="mb-pay">
            <input type="radio" name="payment" value={method.code} required/>
            <span><b>{method.label}</b><span>Paiement par mobile money.</span></span>
          </label>)}
        </div>
      </section>
    </div>
    <aside className="mb-box" aria-label="Votre commande">
      <h2>Votre commande</h2>
      <div className="mb-box-body">
        {items.map((item) => <div key={item.slug} className="mb-summary-row"><span>{item.qty} × {item.title}</span><b>{formatFcfa(item.qty * item.priceXof)}</b></div>)}
        <div className="mb-summary-row" style={{ borderTop: "1px solid var(--color-border)", marginTop: 6, paddingTop: 10 }}><span>Sous-total</span><b>{formatFcfa(total)}</b></div>
        <div className="mb-summary-row"><span>Livraison</span><b>{zone ? formatFcfa(fee) : "Choisissez votre commune"}</b></div>
        <div className="mb-summary-row mb-summary-row--total"><span>Total à payer</span><span>{formatFcfa(total + fee)}</span></div>
        <ul style={{ margin: "12px 0 0", padding: "0 0 0 18px", fontSize: 12.5, color: "#5b6577" }}>{items.map((item) => <li key={item.slug}>{item.title} : {item.availabilityLabel}</li>)}</ul>
        <button type="submit" className="mb-btn mb-btn--block" disabled={pending} style={{ marginTop: 14 }}>{pending ? "Envoi…" : "Confirmer la commande"}</button>
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#5b6577" }}>Après validation, je vous envoie sur WhatsApp les instructions pour régler par mobile money.</p>
      </div>
    </aside>
  </form>;
}
