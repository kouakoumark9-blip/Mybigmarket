"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { useCountryPreferences } from "@/components/country-preferences";
import { PayOrderForm, type PayMethod } from "@/components/pay-order-form";

type Props = {
  intent: { reference: string; status: string; methodLabel: string; method: string; amountXof: number; failureReason: string | null; orders?: Array<{ id: string; reference: string | null }> };
  retryMethods: PayMethod[];
  formattedAmount: string;
};

/** Résultat d'un paiement, affiché au retour de la page du prestataire (sur « Mes commandes »). */
export function PaymentStatusBanner({ intent, retryMethods, formattedAmount }: Props) {
  const { tr } = useCountryPreferences();
  const firstOrder = intent.orders?.[0];
  if (intent.status === "succeeded") return <section className="pay-banner is-success" role="status">
    <CheckCircle2 size={26} aria-hidden="true"/>
    <div><h2>{tr("Paiement reçu, merci !")}</h2><p>{tr("{amount} payés avec {method}. Le vendeur prépare maintenant votre commande ; le suivi s’affiche ci-dessous.", { amount: formattedAmount, method: intent.methodLabel })}</p></div>
  </section>;
  if (intent.status === "pending") return <section className="pay-banner is-pending" role="status" aria-live="polite">
    <AutoRefresh/>
    <Clock size={26} aria-hidden="true"/>
    <div>
      <h2>{tr("Paiement en cours de confirmation…")}</h2>
      <p>{tr("Si votre opérateur ({method}) vous demande de valider le paiement sur votre téléphone, faites-le maintenant. Cette page se met à jour toute seule dès que le paiement est confirmé : inutile de payer deux fois.", { method: intent.methodLabel })}</p>
    </div>
  </section>;
  return <section className="pay-banner is-failed" role="alert">
    <AlertTriangle size={26} aria-hidden="true"/>
    <div>
      <h2>{tr("Le paiement n’a pas abouti")}</h2>
      <p>{intent.failureReason ? `${intent.failureReason}. ` : ""}{tr("Votre opérateur n’a pas confirmé ce paiement. Vous pouvez réessayer, avec le même moyen ou un autre.")}</p>
      {firstOrder ? <PayOrderForm orderId={firstOrder.id} methods={retryMethods} defaultMethod={intent.method} submitLabel={tr("Réessayer le paiement")}/> : <Link className="button button-primary" href="/compte/commandes">{tr("Voir mes commandes")}</Link>}
    </div>
  </section>;
}
