"use client";

import { useActionState } from "react";
import { Send, Star } from "lucide-react";
import { createSupportTicketAction, rateSupportTicketAction, replySupportTicketAction, type SupportFormState } from "@/actions/support";

const CATEGORIES: Array<[string, string]> = [
  ["order", "Commande"], ["payment", "Paiement"], ["delivery", "Livraison"], ["product", "Produit"], ["return", "Retour ou remboursement"], ["account", "Mon compte"], ["seller", "Devenir vendeur"], ["other", "Autre"],
];

export function NewSupportTicketForm({ orderReferences }: { orderReferences: string[] }) {
  const [state, action, pending] = useActionState<SupportFormState, FormData>(createSupportTicketAction, {});
  return <form action={action} className="account-panel seller-form">
    <h2>Nouvelle demande</h2>
    <p>Notre équipe vous répond par e-mail et dans cet espace.</p>
    <div className="form-grid">
      <div className="field full"><label htmlFor="support-subject">Sujet</label><input id="support-subject" name="subject" required minLength={3} maxLength={200} placeholder="Ex. : délai de livraison de ma commande"/></div>
      <div className="field"><label htmlFor="support-category">Catégorie</label><select id="support-category" name="category" defaultValue="order">{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="field"><label htmlFor="support-order">Commande concernée (facultatif)</label><select id="support-order" name="orderReference" defaultValue=""><option value="">Aucune</option>{orderReferences.map((reference) => <option key={reference} value={reference}>{reference}</option>)}</select></div>
      <div className="field full"><label htmlFor="support-message">Message</label><textarea id="support-message" name="message" required minLength={10} maxLength={8000} placeholder="Décrivez votre demande"/></div>
    </div>
    {state.error && <div className="form-error">{state.error}</div>}
    <button className="button button-primary" disabled={pending}>{pending ? "Envoi…" : "Envoyer ma demande"}</button>
  </form>;
}

export function SupportReplyForm({ reference, accessKey }: { reference: string; accessKey: string | null }) {
  const [state, action, pending] = useActionState<SupportFormState, FormData>(replySupportTicketAction, {});
  return <form action={action} className="message-compose">
    <input type="hidden" name="reference" value={reference}/>
    {accessKey && <input type="hidden" name="cle" value={accessKey}/>}
    <label htmlFor="support-reply">Répondre au service client</label>
    <textarea id="support-reply" name="body" maxLength={8000} minLength={2} required placeholder="Votre message"/>
    {state.error && <div className="form-error">{state.error}</div>}
    <div><small>Maximum 8 000 caractères</small><button className="button button-primary" type="submit" disabled={pending}><Send size={15}/> {pending ? "Envoi…" : "Envoyer"}</button></div>
  </form>;
}

export function SupportRatingForm({ reference, accessKey }: { reference: string; accessKey: string | null }) {
  const [state, action, pending] = useActionState<SupportFormState, FormData>(rateSupportTicketAction, {});
  return <form action={action} className="account-panel seller-form">
    <h2>Votre avis sur notre réponse</h2>
    <input type="hidden" name="reference" value={reference}/>
    {accessKey && <input type="hidden" name="cle" value={accessKey}/>}
    <fieldset className="field full"><legend>Note</legend><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{[1, 2, 3, 4, 5].map((score) => <label key={score} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><input type="radio" name="score" value={score} required/>{score} <Star size={14} aria-hidden/></label>)}</div></fieldset>
    <div className="field full"><label htmlFor="support-comment">Commentaire (facultatif)</label><textarea id="support-comment" name="comment" maxLength={1000}/></div>
    {state.error && <div className="form-error">{state.error}</div>}
    <button className="button button-primary" disabled={pending}>{pending ? "Envoi…" : "Envoyer mon avis"}</button>
  </form>;
}
