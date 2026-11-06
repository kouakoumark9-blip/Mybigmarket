"use client";

import Link from "next/link";
import { CreditCard } from "lucide-react";
import { PaymentLogos } from "@/components/payment-logos";
import { payOrderAction } from "@/actions/payments";
import { useCountryPreferences } from "@/components/country-preferences";

export type PayMethod = { code: string; label: string };

/** Choix du moyen de paiement et bouton « Payer » pour une commande en attente (ou un paiement non abouti). */
export function PayOrderForm({ orderId, methods, defaultMethod, submitLabel }: { orderId: string; methods: PayMethod[]; defaultMethod?: string; submitLabel?: string }) {
  const { tr } = useCountryPreferences();
  if (!methods.length) return <p className="pay-form-empty">{tr("Le paiement en ligne n’est pas disponible pour cette commande.")} <Link href="/demande-de-devis">{tr("Contactez-nous")}</Link> : {tr("nous vous aidons à la régler.")}</p>;
  const selected = methods.some((method) => method.code === defaultMethod) ? defaultMethod : methods[0].code;
  return <form action={payOrderAction} className="pay-form">
    <input type="hidden" name="orderId" value={orderId}/>
    <div className="pay-form-options" role="radiogroup" aria-label={tr("Moyen de paiement")}>
      {methods.map((method) => <label key={method.code} className="payment-choice pay-form-option">
        <input type="radio" name="method" value={method.code} defaultChecked={method.code === selected} required/>
        <PaymentLogos methods={[method.code]} height={24} className="payment-choice-logos" label={tr("Moyens de paiement acceptés")}/>
        <span>{tr(method.label)}</span>
      </label>)}
    </div>
    <button className="button button-primary pay-form-submit" type="submit"><CreditCard size={16} aria-hidden="true"/> {submitLabel ?? tr("Payer maintenant")}</button>
    <p className="pay-form-note">{tr("Le paiement se valide sur la page sécurisée de votre opérateur : mybigmarket ne reçoit aucune donnée bancaire.")}</p>
  </form>;
}
