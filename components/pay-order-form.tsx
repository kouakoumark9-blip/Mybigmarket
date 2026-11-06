import Link from "next/link";
import { CreditCard } from "lucide-react";
import { PaymentLogos } from "@/components/payment-logos";
import { payOrderAction } from "@/actions/payments";

export type PayMethod = { code: string; label: string };

/** Choix du moyen de paiement et bouton « Payer » pour une commande en attente (ou un paiement non abouti). */
export function PayOrderForm({ orderId, methods, defaultMethod, submitLabel = "Payer maintenant" }: { orderId: string; methods: PayMethod[]; defaultMethod?: string; submitLabel?: string }) {
  if (!methods.length) return <p className="pay-form-empty">Le paiement en ligne n’est pas disponible pour cette commande. <Link href="/demande-de-devis">Contactez-nous</Link> : nous vous aidons à la régler.</p>;
  const selected = methods.some((method) => method.code === defaultMethod) ? defaultMethod : methods[0].code;
  return <form action={payOrderAction} className="pay-form">
    <input type="hidden" name="orderId" value={orderId}/>
    <div className="pay-form-options" role="radiogroup" aria-label="Moyen de paiement">
      {methods.map((method) => <label key={method.code} className="payment-choice pay-form-option">
        <input type="radio" name="method" value={method.code} defaultChecked={method.code === selected} required/>
        <PaymentLogos methods={[method.code]} height={24} className="payment-choice-logos"/>
        <span>{method.label}</span>
      </label>)}
    </div>
    <button className="button button-primary pay-form-submit" type="submit"><CreditCard size={16} aria-hidden="true"/> {submitLabel}</button>
    <p className="pay-form-note">Le paiement se valide sur la page sécurisée de votre opérateur : mybigmarket ne reçoit aucune donnée bancaire.</p>
  </form>;
}
