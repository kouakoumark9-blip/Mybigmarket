import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Notice, PageHeader, formatDate, formatXof } from "@/components/admin/page";
import { adminApiList, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import { can, isPermissionCode } from "@/lib/permission-matrix";
import * as actions from "./actions";

export const dynamic = "force-dynamic";

type Intent = { id: string; reference: string; status: string; method: string; methodLabel: string; provider: string; amountXof: number; expiresAt: string | null; paidAt: string | null; failureReason: string | null; createdAt: string; orders?: Array<{ id: string; reference: string | null; status: string }> };
const STATUS: Record<string, [string, "orange" | "warning" | "danger" | "neutral"]> = { pending: ["En attente", "warning"], succeeded: ["Payé", "orange"], failed: ["Échoué", "danger"], cancelled: ["Annulé", "neutral"], expired: ["Expiré", "neutral"] };
const MANUAL = new Set(["manual"]);

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; statut?: string; q?: string; page?: string }> }) {
  const employee = await requireEmployee("payments.read");
  const params = await searchParams;
  const canUpdate = isPermissionCode("payments.update") && can(employee.permissions, "payments.update");
  const status = params.statut ?? "pending";
  const header = <PageHeader trail={["Opérations", "Paiements"]} title="Paiements reçus et en attente" subtitle="Intentions de paiement des clients (mobile money, carte, virement, paiement à la livraison). Un virement ou un paiement à la livraison se confirme ici à réception." actions={canUpdate ? <form action={actions.reconcileAllAction}><button className="ui-button ui-button-outline">Vérifier les paiements en attente</button></form> : null}/>;
  let intents;
  try {
    intents = await adminApiList<Intent>("/admin/payments", { limit: 30, page: Number(params.page) || 1, sort: "-createdAt", q: params.q || undefined, ...(status ? { "filter[status]": status } : {}) });
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  const tab = (label: string, value: string) => <Link key={value} href={`/paiement/transactions?statut=${value}`} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${status === value ? "border-orange-500 bg-orange-50 text-orange-900" : "border-slate-200 text-slate-700"}`}>{label}</Link>;
  return <>
    {header}
    <Notice ok={params.ok} error={params.error}/>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {[["En attente", "pending"], ["Payés", "succeeded"], ["Échoués", "failed"], ["Expirés", "expired"], ["Annulés", "cancelled"], ["Tous", ""]].map(([label, value]) => tab(label, value))}
      <form className="ml-auto flex gap-2" action="/paiement/transactions"><input type="hidden" name="statut" value={status}/><input name="q" defaultValue={params.q} placeholder="Référence de paiement" className="ui-input h-9 w-56"/><button className="ui-button ui-button-outline h-9">Rechercher</button></form>
    </div>
    <Card>
      {intents.data.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[1180px]"><thead><tr><th>Référence</th><th>Moyen</th><th>Montant</th><th>Statut</th><th>Créé</th><th>Échéance / payé</th><th>Actions</th></tr></thead><tbody>{intents.data.map((intent) => <tr key={intent.id}>
        <td className="font-mono text-xs font-semibold">{intent.reference}{intent.orders?.length ? <div className="font-sans font-normal text-slate-500">{intent.orders.map((order) => <Link key={order.id} href={`/commandes/${order.id}`} className="mr-2 hover:underline">{order.reference ?? order.id.slice(0, 8)}</Link>)}</div> : null}</td>
        <td className="text-sm">{intent.methodLabel}<div className="text-[11px] text-slate-500">{intent.provider}</div></td>
        <td className="font-semibold">{formatXof(intent.amountXof)}</td>
        <td><Badge tone={STATUS[intent.status]?.[1] ?? "neutral"}>{STATUS[intent.status]?.[0] ?? intent.status}</Badge>{intent.failureReason && <div className="mt-1 max-w-[200px] text-[11px] text-red-700">{intent.failureReason}</div>}</td>
        <td className="text-xs">{formatDate(intent.createdAt)}</td>
        <td className="text-xs">{intent.paidAt ? `payé le ${formatDate(intent.paidAt)}` : intent.expiresAt ? `avant le ${formatDate(intent.expiresAt)}` : "—"}</td>
        <td className="min-w-[280px]">{canUpdate && intent.status === "pending" ? <div className="grid gap-2">
          {MANUAL.has(intent.provider) ? <form action={actions.confirmPaymentAction} className="grid gap-1.5"><input type="hidden" name="reference" value={intent.reference}/><input name="providerReference" placeholder="Réf. du virement (facultatif)" className="ui-input h-8 text-xs"/><button className="ui-button ui-button-primary h-8 text-xs">Confirmer la réception</button></form>
            : <form action={actions.reconcilePaymentAction}><input type="hidden" name="reference" value={intent.reference}/><button className="text-xs font-semibold text-slate-800 hover:underline">Vérifier auprès du prestataire</button></form>}
          <form action={actions.cancelPaymentAction} className="flex items-center gap-2"><input type="hidden" name="reference" value={intent.reference}/><input name="reason" placeholder="Motif d’annulation" className="ui-input h-8 flex-1 text-xs"/><button className="shrink-0 text-xs font-semibold text-red-700 hover:underline">Annuler</button></form>
        </div> : <span className="text-xs text-slate-400">—</span>}</td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><CreditCard size={22} className="mb-2 text-slate-400"/><strong>Aucun paiement</strong>Aucun paiement ne correspond à ce filtre.</div>}
      {intents.meta.totalPages > 1 && <div className="flex justify-between border-t border-slate-100 px-4 py-3 text-xs"><span>Page {intents.meta.page} / {intents.meta.totalPages}</span><div className="flex gap-3">{intents.meta.page > 1 && <Link href={`/paiement/transactions?statut=${status}&page=${intents.meta.page - 1}`} className="font-semibold hover:underline">Précédente</Link>}{intents.meta.page < intents.meta.totalPages && <Link href={`/paiement/transactions?statut=${status}&page=${intents.meta.page + 1}`} className="font-semibold hover:underline">Suivante</Link>}</div></div>}
    </Card>
  </>;
}
