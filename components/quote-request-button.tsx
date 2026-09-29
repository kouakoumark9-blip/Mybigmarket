"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, X } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-data";
import { saveDemoInquiry } from "@/lib/demo-commerce";

export function QuoteRequestButton({ product }: { product: DemoProduct }) {
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const entry = saveDemoInquiry({
      kind: "product",
      productSlug: product.slug,
      productTitle: product.title,
      sellerName: product.seller,
      quantity: Number(data.get("quantity") || product.minimumQuantity),
      destination: String(data.get("destination") || "Abidjan"),
      contactPhone: String(data.get("phone") || ""),
      message: String(data.get("message") || ""),
    });
    setRequestId(entry.id);
  }

  return <>
    <button className="button button-outline wholesale-quote-button" type="button" onClick={() => { setRequestId(""); setOpen(true); }}><FileText size={15}/> Demander un devis de gros</button>
    {open && <div className="quote-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="quote-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-title">
        <button type="button" className="quote-dialog-close" aria-label="Fermer" onClick={() => setOpen(false)}><X size={18}/></button>
        {requestId ? <div className="quote-confirmation"><CheckCircle2 size={38}/><span className="eyebrow">DEMANDE ENREGISTRÉE (DÉMO)</span><h2 id="quote-title">Devis demandé</h2><p>Référence <b>{requestId}</b> pour <b>{product.title}</b>. Cette demande est visible dans votre espace local, mais elle n’a pas été transmise au vendeur.</p><Link className="button button-primary" href="/compte/demandes" onClick={() => setOpen(false)}>Voir mes demandes <ArrowRight size={15}/></Link></div> : <>
          <span className="eyebrow">ACHAT DE GROS</span><h2 id="quote-title">Demander un devis</h2><p className="quote-product-name">{product.title} <span>· {product.seller}</span></p>
          <form className="rfq-form quote-form" onSubmit={submit}>
            <div className="form-grid">
              <div className="field"><label htmlFor="quote-quantity">Quantité souhaitée</label><input id="quote-quantity" name="quantity" type="number" min={product.minimumQuantity} required defaultValue={Math.max(product.minimumQuantity * 5, 10)}/></div>
              <div className="field"><label htmlFor="quote-destination">Ville de livraison</label><select id="quote-destination" name="destination" defaultValue="Abidjan"><option>Abidjan</option><option>Bouaké</option><option>Yamoussoukro</option><option>Autre ville</option></select></div>
              <div className="field full"><label htmlFor="quote-phone">Téléphone / WhatsApp</label><input id="quote-phone" name="phone" required inputMode="tel" placeholder="+225 07 00 00 00 00"/></div>
              <div className="field full"><label htmlFor="quote-message">Précisions (facultatif)</label><textarea id="quote-message" name="message" placeholder="Couleurs, variantes, prix cible par quantité…"/></div>
            </div>
            <div className="rfq-demo-warning">Simulation : prix de gros, disponibilité, transport et réponse vendeur restent à confirmer. Aucun message ni paiement n’est transmis.</div>
            <button className="button button-primary" type="submit">Enregistrer la demande <ArrowRight size={15}/></button>
          </form>
        </>}
      </section>
    </div>}
  </>;
}
