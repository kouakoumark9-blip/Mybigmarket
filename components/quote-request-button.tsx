"use client";

import { useActionState, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, MessageCircle, X } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-data";
import { saveDemoInquiry } from "@/lib/demo-commerce";
import { createQuoteRequestAction } from "@/actions/quotes";

export function QuoteRequestButton({ product, backendConfigured = false }: { product: DemoProduct; backendConfigured?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="button button-outline wholesale-quote-button" type="button" onClick={() => setOpen(true)}><FileText size={15}/> Demander un devis de gros</button>
    {open && <QuoteDialog product={product} backendConfigured={backendConfigured} onClose={() => setOpen(false)}/>}
  </>;
}

function QuoteDialog({ product, backendConfigured, onClose }: { product: DemoProduct; backendConfigured: boolean; onClose: () => void }) {
  const [requestId, setRequestId] = useState("");
  const [state, serverAction, pending] = useActionState(createQuoteRequestAction, {});
  function submitLocally(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const entry = saveDemoInquiry({
      kind: "product", productSlug: product.slug, productTitle: product.title, sellerName: product.seller,
      quantity: Number(data.get("quantity") || product.minimumQuantity), destination: String(data.get("destination") || "Abidjan"),
      contactPhone: String(data.get("contactPhone") || ""), message: String(data.get("message") || ""),
    });
    setRequestId(entry.id);
  }
  const completedId = backendConfigured ? state.requestId : requestId;
  const conversationHref = backendConfigured && state.conversationId ? `/messages/${state.conversationId}` : "/compte/demandes";
  return <div className="quote-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="quote-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-title">
      <button type="button" className="quote-dialog-close" aria-label="Fermer" onClick={onClose}><X size={18}/></button>
      {completedId ? <div className="quote-confirmation"><CheckCircle2 size={38}/><span className="eyebrow">{backendConfigured ? "DEMANDE ENREGISTRÉE" : "DEMANDE ENREGISTRÉE (DÉMO)"}</span><h2 id="quote-title">Devis demandé</h2><p>Référence <b>{completedId}</b> pour <b>{product.title}</b>. {backendConfigured ? "Le vendeur peut consulter la demande dans son espace et répondre dans la messagerie." : "Elle reste dans ce navigateur et n’a pas été transmise au vendeur."}</p><Link className="button button-primary" href={conversationHref} onClick={onClose}>{backendConfigured && state.conversationId ? <><MessageCircle size={15}/> Ouvrir la conversation</> : <>Voir mes demandes <ArrowRight size={15}/></>}</Link></div> : <>
        <span className="eyebrow">ACHAT DE GROS</span><h2 id="quote-title">Demander un devis</h2><p className="quote-product-name">{product.title} <span>· {product.seller}</span></p>
        <form className="rfq-form quote-form" action={backendConfigured ? serverAction : undefined} onSubmit={backendConfigured ? undefined : submitLocally}>
          {backendConfigured && <><input type="hidden" name="kind" value="product"/><input type="hidden" name="productSlug" value={product.slug}/><input type="hidden" name="productTitle" value={product.title}/></>}
          <div className="form-grid">
            <div className="field"><label htmlFor="quote-quantity">Quantité souhaitée</label><input id="quote-quantity" name="quantity" type="number" min={product.minimumQuantity} max="1000000" required defaultValue={Math.max(product.minimumQuantity * 5, 10)}/></div>
            <div className="field"><label htmlFor="quote-destination">Ville de livraison</label><select id="quote-destination" name="destination" defaultValue="Abidjan"><option>Abidjan</option><option>Bouaké</option><option>Yamoussoukro</option><option>Autre ville</option></select></div>
            <div className="field full"><label htmlFor="quote-phone">Téléphone / WhatsApp</label><input id="quote-phone" name="contactPhone" required minLength={8} maxLength={32} inputMode="tel" placeholder="+225 07 00 00 00 00"/></div>
            <div className="field full"><label htmlFor="quote-message">Précisions (facultatif)</label><textarea id="quote-message" name="message" maxLength={2000} placeholder="Couleurs, variantes, prix cible par quantité…"/></div>
          </div>
          {!backendConfigured && <div className="rfq-demo-warning">Mode aperçu : cette demande reste locale et n’est pas envoyée au vendeur.</div>}
          {state.error && <div className="form-error" role="alert">{state.error}</div>}
          <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Envoi…" : backendConfigured ? "Envoyer au vendeur" : "Enregistrer la demande"} <ArrowRight size={15}/></button>
        </form>
      </>}
    </section>
  </div>;
}
