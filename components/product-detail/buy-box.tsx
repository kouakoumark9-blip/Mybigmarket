"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, MessageCircle, RotateCcw, ShieldCheck, ShoppingCart } from "lucide-react";
import type { Product } from "@/lib/pdp/types";
import { pdpConfig } from "@/lib/pdp/config";
import { startConversationAction } from "@/actions/messages";
import { PaymentLogos } from "@/components/payment-logos";
import { useCountryPreferences } from "@/components/country-preferences";
import { countryName } from "@/lib/west-africa";
import { PriceBlock } from "@/components/product-detail/product-info";
import { VariantPicker, type VariantState } from "@/components/product-detail/variant-picker";
import { ShippingModal, type ShippingChoice } from "@/components/product-detail/shipping-modal";

type Props = {
  product: Product;
  variants: VariantState;
  compact: boolean;
  onOrder: () => void;
  onAddToCart: () => void;
  feedback: string;
  /** Faux pour un produit d'exemple : ni commande ni discussion, seulement une demande de devis. */
  orderable?: boolean;
  /** Un moyen de paiement est ouvert : on peut alors afficher les garanties de paiement. */
  paymentsOpen?: boolean;
  /** Codes des moyens de paiement ouverts (logos affichés dans « Protection des commandes »). */
  paymentMethods?: string[];
};

/** Boîte d'achat. En mode compact (au défilement), elle reprend prix, MOQ et variantes. */
export function BuyBox({ product, variants, compact, onOrder, onAddToCart, feedback, orderable = true, paymentsOpen = false, paymentMethods = [] }: Props) {
  const { language, formatPrice, tr } = useCountryPreferences();
  const [shippingOpen, setShippingOpen] = useState(false);
  const [shipping, setShipping] = useState<ShippingChoice | null>(null);
  const [protectionOpen, setProtectionOpen] = useState(true);
  const [compactProtectionOpen, setCompactProtectionOpen] = useState(false);
  const carrier = product.shipping.carriers.find((item) => item.id === shipping?.carrierId);
  const showProtection = compact ? compactProtectionOpen : protectionOpen;
  const toggleProtection = () => (compact ? setCompactProtectionOpen : setProtectionOpen)((value) => !value);

  return <aside className={`pd-buybox${compact ? " is-compact" : ""}`} aria-label={tr("Commande")}>
    {compact && <div className="pd-buybox-summary">
      <PriceBlock product={product} compact/>
      <VariantPicker product={product} state={variants} compact idPrefix="pd-box"/>
    </div>}

    <section className="pd-buybox-row">
      <div className="pd-buybox-row-head">
        <h2>{tr("Livraison")}</h2>
        <button type="button" className="pd-link-button" onClick={() => setShippingOpen(true)}>{tr("Modifier")} <ChevronRight size={14} strokeWidth={1.5}/></button>
      </div>
      <p className="pd-muted">{shipping && carrier
        ? <>{countryName(shipping.countryCode, language)} · {tr(carrier.label)} · {tr(carrier.delay)}{carrier.feeXof ? ` · ${formatPrice(carrier.feeXof)} / ${tr("pièce")}` : ""}</>
        : tr(product.shipping.placeholder)}</p>
    </section>

    {paymentsOpen && <>
    <hr className="pd-rule"/>

    <section className="pd-buybox-row">
      <button type="button" className="pd-buybox-row-head pd-toggle" onClick={toggleProtection} aria-expanded={showProtection}>
        <h2>{tr(pdpConfig.protectionProgram)}</h2><ChevronDown size={18} strokeWidth={1.5} className={showProtection ? "is-flipped" : ""}/>
      </button>
      {showProtection && <div className="pd-protection">
        <div className="pd-protection-item">
          <ShieldCheck size={18} strokeWidth={1.75} className="pd-ok" aria-hidden="true"/>
          <div>
            <b>{tr(pdpConfig.securePaymentsTitle)}</b>
            <PaymentLogos methods={paymentMethods} height={24} className="pd-payments" label={tr("Moyens de paiement acceptés")}/>
            <p className="pd-muted">{tr(pdpConfig.securePaymentsText)}</p>
          </div>
        </div>
        <div className="pd-protection-item">
          <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true"/>
          <div><b>{tr(pdpConfig.refundTitle)}</b><p className="pd-muted pd-clamp-1" title={tr(pdpConfig.refundText)}>{tr(pdpConfig.refundText)}</p></div>
        </div>
      </div>}
    </section>
    </>}

    {!orderable ? <div className="pd-actions">
      <p className="pd-demo-note">{tr("Ce produit se commande sur demande : indiquez la quantité souhaitée, notre équipe vous confirme le prix et le délai.")}</p>
      <Link href={`/demande-de-devis?produit=${encodeURIComponent(product.title)}`} className="pd-btn pd-btn-primary pd-btn-block">{tr("Commander")}</Link>
    </div> : <div className="pd-actions">
      <button type="button" className="pd-btn pd-btn-primary pd-btn-block" onClick={onOrder}>{tr("Commander")}</button>
      <div className="pd-actions-row">
        <button type="button" className="pd-btn pd-btn-outline" onClick={onAddToCart}><ShoppingCart size={16} strokeWidth={1.5} aria-hidden="true"/> {tr("Ajouter au panier")}</button>
        <form action={startConversationAction}><input type="hidden" name="productSlug" value={product.slug}/><button type="submit" className="pd-btn pd-btn-outline"><MessageCircle size={16} strokeWidth={1.5} aria-hidden="true"/> {tr("Discuter ici")}</button></form>
      </div>
      <p className="pd-feedback" aria-live="polite">{feedback}</p>
      <p className="pd-muted pd-small">{tr(pdpConfig.guaranteeNote)}</p>
      <Link href={`/demande-de-devis?produit=${encodeURIComponent(product.title)}`} className="pd-quote-link">{tr("Besoin d’une grande quantité ? Demander un devis")}</Link>
    </div>}


    {shippingOpen && <ShippingModal shipping={product.shipping} value={shipping} onChange={setShipping} onClose={() => setShippingOpen(false)}/>}
  </aside>;
}
