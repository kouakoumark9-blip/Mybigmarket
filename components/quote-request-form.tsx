"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { createQuoteRequestTicketAction, type SupportFormState } from "@/actions/support";

export function QuoteRequestForm({ product = "", signedIn }: { product?: string; signedIn: boolean }) {
  const [state, action, pending] = useActionState<SupportFormState, FormData>(createQuoteRequestTicketAction, {});
  return <form action={action} className="account-panel seller-form quote-form">
    <div className="form-grid">
      <div className="field full"><label htmlFor="quote-product">Produit recherché</label><input id="quote-product" name="product" required minLength={2} maxLength={190} defaultValue={product} placeholder="Ex. : écouteurs Bluetooth avec boîtier de charge"/></div>
      <div className="field"><label htmlFor="quote-quantity">Quantité souhaitée</label><input id="quote-quantity" name="quantity" type="number" required min={1} max={1000000} inputMode="numeric" placeholder="Ex. : 200"/></div>
      <div className="field"><label htmlFor="quote-budget">Budget indicatif (facultatif)</label><input id="quote-budget" name="budget" maxLength={60} placeholder="Ex. : 5 000 FCFA l’unité"/></div>
      <div className="field"><label htmlFor="quote-destination">Ville de livraison</label><input id="quote-destination" name="destination" required minLength={2} maxLength={120} placeholder="Ex. : Abidjan, Côte d’Ivoire"/></div>
      <div className="field"><label htmlFor="quote-phone">Téléphone (WhatsApp)</label><input id="quote-phone" name="phone" type="tel" required minLength={8} maxLength={32} placeholder="+225 07 00 00 00 00"/></div>
      <div className="field full"><label htmlFor="quote-details">Précisions (facultatif)</label><textarea id="quote-details" name="details" maxLength={4000} placeholder="Couleur, taille, matière, emballage, délai souhaité, lien d’un modèle…"/></div>
    </div>
    {state.error && <div className="form-error">{state.error}</div>}
    <button className="button button-primary" disabled={pending}><Send size={15}/> {pending ? "Envoi…" : signedIn ? "Envoyer ma demande de devis" : "Se connecter et envoyer"}</button>
    <p className="field-hint">Vous recevez l’offre par e-mail et dans « Service client » de votre compte, en général sous 48 h ouvrées.</p>
  </form>;
}
