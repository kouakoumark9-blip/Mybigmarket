"use client";

import { useActionState, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, CheckCircle2 } from "lucide-react";
import { saveDemoInquiry } from "@/lib/demo-commerce";
import { createQuoteRequestAction } from "@/actions/quotes";

export function SourcingRequestForm({ backendConfigured = false }: { backendConfigured?: boolean }) {
  const [sentId, setSentId] = useState("");
  const [state, serverAction, pending] = useActionState(createQuoteRequestAction, {});
  function submitLocally(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const inquiry = saveDemoInquiry({
      kind: "sourcing", productTitle: String(form.get("productTitle") || "Produit à sourcer"),
      quantity: Number(form.get("quantity") || 1), destination: String(form.get("destination") || "Abidjan"),
      contactPhone: String(form.get("contactPhone") || ""), message: String(form.get("message") || ""),
    });
    setSentId(inquiry.id);
    event.currentTarget.reset();
  }

  const completedId = backendConfigured ? state.requestId : sentId;
  if (completedId) return <div className="rfq-success">
    <CheckCircle2 size={38}/><span className="eyebrow">{backendConfigured ? "DEMANDE ENREGISTRÉE" : "DEMANDE ENREGISTRÉE (DÉMO)"}</span><h2>Votre demande est prête.</h2>
    <p>Référence <b>{completedId}</b>. {backendConfigured ? "Elle est enregistrée dans votre compte et visible dans l’administration pour traitement par l’équipe sourcing." : "Elle est conservée uniquement dans ce navigateur; aucun fournisseur ne la reçoit."}</p>
    <div className="rfq-success-actions"><Link className="button button-primary" href="/compte/demandes">Voir mes demandes <ArrowRight size={15}/></Link><button className="button button-outline" onClick={() => backendConfigured ? window.location.reload() : setSentId("")}>Créer une autre demande</button></div>
  </div>;

  return <form className="rfq-form" action={backendConfigured ? serverAction : undefined} onSubmit={backendConfigured ? undefined : submitLocally}>
    {backendConfigured && <input type="hidden" name="kind" value="sourcing"/>}
    <div className="rfq-form-intro"><span className="rfq-form-icon"><ClipboardList size={20}/></span><div><b>Décrivez votre besoin d’approvisionnement</b><small>{backendConfigured ? "Votre demande sera enregistrée dans votre compte et visible par l’équipe sourcing." : "Aperçu local : la demande n’est pas transmise aux vendeurs."}</small></div></div>
    <div className="form-grid">
      <div className="field full"><label htmlFor="rfq-title">Produit recherché</label><input id="rfq-title" name="productTitle" required minLength={2} maxLength={190} placeholder="Ex. lots de sacs à dos pour étudiants"/></div>
      <div className="field"><label htmlFor="rfq-qty">Quantité souhaitée</label><input id="rfq-qty" name="quantity" type="number" min="1" max="1000000" required defaultValue="20"/></div>
      <div className="field"><label htmlFor="rfq-destination">Ville de livraison</label><select id="rfq-destination" name="destination" defaultValue="Abidjan"><option>Abidjan</option><option>Bouaké</option><option>Yamoussoukro</option><option>San-Pédro</option><option>Autre ville (à préciser)</option></select></div>
      <div className="field full"><label htmlFor="rfq-phone">Téléphone de contact</label><input id="rfq-phone" name="contactPhone" required minLength={8} maxLength={32} inputMode="tel" placeholder="+225 07 00 00 00 00"/></div>
      <div className="field full"><label htmlFor="rfq-message">Spécifications ou budget indicatif</label><textarea id="rfq-message" name="message" maxLength={2000} placeholder="Taille, couleur, qualité, budget par unité, délai souhaité…"/></div>
    </div>
    {!backendConfigured && <div className="rfq-demo-warning">Simulation uniquement : la demande reste sur cet appareil et n’est pas envoyée à un fournisseur.</div>}
    {state.error && <div className="form-error" role="alert">{state.error}</div>}
    <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Envoi…" : backendConfigured ? "Envoyer la demande" : "Enregistrer ma demande"} <ArrowRight size={15}/></button>
  </form>;
}
