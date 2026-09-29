"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, CheckCircle2 } from "lucide-react";
import { saveDemoInquiry } from "@/lib/demo-commerce";

export function SourcingRequestForm() {
  const [sentId, setSentId] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const inquiry = saveDemoInquiry({
      kind: "sourcing",
      productTitle: String(form.get("productTitle") || "Produit à sourcer"),
      quantity: Number(form.get("quantity") || 1),
      destination: String(form.get("destination") || "Abidjan"),
      contactPhone: String(form.get("phone") || ""),
      message: String(form.get("message") || ""),
    });
    setSentId(inquiry.id);
    event.currentTarget.reset();
  }

  if (sentId) return <div className="rfq-success">
    <CheckCircle2 size={38}/><span className="eyebrow">DEMANDE ENREGISTRÉE (DÉMO)</span><h2>Votre demande est prête.</h2>
    <p>Référence <b>{sentId}</b>. Elle est conservée uniquement dans ce navigateur; aucun vendeur n’a encore été contacté.</p>
    <div className="rfq-success-actions"><Link className="button button-primary" href="/compte/demandes">Voir mes demandes <ArrowRight size={15}/></Link><button className="button button-outline" onClick={() => setSentId("")}>Créer une autre demande</button></div>
  </div>;

  return <form className="rfq-form" onSubmit={submit}>
    <div className="rfq-form-intro"><span className="rfq-form-icon"><ClipboardList size={20}/></span><div><b>Décrivez votre besoin d’approvisionnement</b><small>Pour ce prototype, la demande reste dans le stockage local de votre navigateur.</small></div></div>
    <div className="form-grid">
      <div className="field full"><label htmlFor="rfq-title">Produit recherché</label><input id="rfq-title" name="productTitle" required minLength={2} placeholder="Ex. lots de sacs à dos pour étudiants"/></div>
      <div className="field"><label htmlFor="rfq-qty">Quantité souhaitée</label><input id="rfq-qty" name="quantity" type="number" min="1" required defaultValue="20"/></div>
      <div className="field"><label htmlFor="rfq-destination">Ville de livraison</label><select id="rfq-destination" name="destination" defaultValue="Abidjan"><option>Abidjan</option><option>Bouaké</option><option>Yamoussoukro</option><option>San-Pédro</option><option>Autre ville (à préciser)</option></select></div>
      <div className="field full"><label htmlFor="rfq-phone">Téléphone de contact</label><input id="rfq-phone" name="phone" required inputMode="tel" placeholder="+225 07 00 00 00 00"/></div>
      <div className="field full"><label htmlFor="rfq-message">Spécifications ou budget indicatif</label><textarea id="rfq-message" name="message" placeholder="Taille, couleur, qualité, budget par unité, délai souhaité…"/></div>
    </div>
    <div className="rfq-demo-warning">Simulation uniquement : la demande n’est pas envoyée à un fournisseur et aucun paiement n’est demandé.</div>
    <button className="button button-primary" type="submit">Enregistrer ma demande <ArrowRight size={15}/></button>
  </form>;
}
