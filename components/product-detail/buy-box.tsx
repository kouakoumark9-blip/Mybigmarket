"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Code2, Globe, MessageCircle, RotateCcw, ShieldCheck, ShoppingBag, ShoppingCart, Store } from "lucide-react";

const integrationIcons = { bag: ShoppingBag, cart: ShoppingCart, globe: Globe, store: Store, code: Code2 } as const;
import type { Product } from "@/lib/pdp/types";
import { pdpConfig } from "@/lib/pdp/config";
import { startConversationAction } from "@/actions/messages";
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
};

/** Boîte d'achat. En mode compact (au défilement), elle reprend prix, MOQ et variantes. */
export function BuyBox({ product, variants, compact, onOrder, onAddToCart, feedback }: Props) {
  const { language, formatPrice } = useCountryPreferences();
  const [shippingOpen, setShippingOpen] = useState(false);
  const [shipping, setShipping] = useState<ShippingChoice | null>(null);
  const [protectionOpen, setProtectionOpen] = useState(true);
  const [compactProtectionOpen, setCompactProtectionOpen] = useState(false);
  const carrier = product.shipping.carriers.find((item) => item.id === shipping?.carrierId);
  const showProtection = compact ? compactProtectionOpen : protectionOpen;
  const toggleProtection = () => (compact ? setCompactProtectionOpen : setProtectionOpen)((value) => !value);

  return <aside className={`pd-buybox${compact ? " is-compact" : ""}`} aria-label="Commande">
    {compact && <div className="pd-buybox-summary">
      <PriceBlock product={product} compact/>
      <VariantPicker product={product} state={variants} compact idPrefix="pd-box"/>
    </div>}

    <section className="pd-buybox-row">
      <div className="pd-buybox-row-head">
        <h2>Livraison</h2>
        <button type="button" className="pd-link-button" onClick={() => setShippingOpen(true)}>Modifier <ChevronRight size={14} strokeWidth={1.5}/></button>
      </div>
      <p className="pd-muted">{shipping && carrier
        ? <>{countryName(shipping.countryCode, language)} · {carrier.label} · {carrier.delay}{carrier.feeXof ? ` · ${formatPrice(carrier.feeXof)} / pièce` : ""}</>
        : product.shipping.placeholder}</p>
    </section>

    <hr className="pd-rule"/>

    <section className="pd-buybox-row">
      <button type="button" className="pd-buybox-row-head pd-toggle" onClick={toggleProtection} aria-expanded={showProtection}>
        <h2>{pdpConfig.protectionProgram}</h2><ChevronDown size={18} strokeWidth={1.5} className={showProtection ? "is-flipped" : ""}/>
      </button>
      {showProtection && <div className="pd-protection">
        <div className="pd-protection-item">
          <ShieldCheck size={18} strokeWidth={1.75} className="pd-ok" aria-hidden="true"/>
          <div>
            <b>{pdpConfig.securePaymentsTitle}</b>
            <ul className="pd-payments" aria-label="Moyens de paiement acceptés">{pdpConfig.paymentMethods.map((method) => <li key={method}>{method}</li>)}</ul>
            <p className="pd-muted">{pdpConfig.securePaymentsText}</p>
          </div>
        </div>
        <div className="pd-protection-item">
          <RotateCcw size={18} strokeWidth={1.75} aria-hidden="true"/>
          <div><b>{pdpConfig.refundTitle}</b><p className="pd-muted pd-clamp-1" title={pdpConfig.refundText}>{pdpConfig.refundText}</p></div>
        </div>
      </div>}
    </section>

    <div className="pd-actions">
      <button type="button" className="pd-btn pd-btn-primary pd-btn-block" onClick={onOrder}>Commander</button>
      <div className="pd-actions-row">
        <button type="button" className="pd-btn pd-btn-outline" onClick={onAddToCart}><ShoppingCart size={16} strokeWidth={1.5} aria-hidden="true"/> Ajouter au panier</button>
        <form action={startConversationAction}><input type="hidden" name="productSlug" value={product.slug}/><button type="submit" className="pd-btn pd-btn-outline"><MessageCircle size={16} strokeWidth={1.5} aria-hidden="true"/> Discuter ici</button></form>
      </div>
      <p className="pd-feedback" aria-live="polite">{feedback}</p>
      <p className="pd-muted pd-small">{pdpConfig.guaranteeNote}</p>
    </div>

    {!compact && <>
      <hr className="pd-rule"/>
      <section className="pd-dropship" aria-labelledby="pd-dropship-title">
        <h2 id="pd-dropship-title">{pdpConfig.dropshipping.title}</h2>
        <ul className="pd-integrations" aria-label="Intégrations disponibles">{pdpConfig.dropshipping.integrations.map((item) => { const Icon = integrationIcons[item.icon]; return <li key={item.label} title={item.label}><Icon size={15} strokeWidth={1.5} aria-hidden="true"/><span className="sr-only">{item.label}</span></li>; })}</ul>
        <Link href={pdpConfig.dropshipping.href} className="pd-btn pd-btn-outline pd-btn-block">{pdpConfig.dropshipping.cta}</Link>
      </section>
    </>}

    {shippingOpen && <ShippingModal shipping={product.shipping} value={shipping} onChange={setShipping} onClose={() => setShippingOpen(false)}/>}
  </aside>;
}
