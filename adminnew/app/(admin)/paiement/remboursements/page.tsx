import Link from "next/link";
import { Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Notice, PageHeader, formatDate, formatXof } from "@/components/admin/page";
import { adminApiList, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import { can, isPermissionCode } from "@/lib/permission-matrix";
import * as actions from "./actions";

export const dynamic = "force-dynamic";

type Refund = { id: string; reference: string | null; orderId: string; amountXof: number; status: string; method: string; providerReference: string | null; reason: string | null; processedAt: string | null; createdAt: string };
const STATUS: Record<string, [string, "orange" | "warning" | "danger" | "neutral"]> = { pending: ["À verser", "warning"], processing: ["En cours", "warning"], succeeded: ["Versé", "orange"], failed: ["Échec", "danger"], cancelled: ["Annulé", "neutral"] };

export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; statut?: string }> }) {
  const employee = await requireEmployee("payments.read");
  const params = await searchParams;
  const canRefund = isPermissionCode("orders.refund") && can(employee.permissions, "orders.refund");
  const status = params.statut ?? "";
  const header = <PageHeader trail={["Opérations", "Remboursements"]} title="Remboursements" subtitle="Remboursements demandés depuis une commande. Un remboursement manuel (virement, mobile money) se marque comme versé une fois effectué."/>;
  let refunds;
  try {
    refunds = await adminApiList<Refund>("/admin/refunds", { limit: 50, sort: "-createdAt", ...(status ? { "filter[status]": status } : {}) });
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  return <>
    {header}
    <Notice ok={params.ok} error={params.error}/>
    <div className="mb-4 flex flex-wrap gap-2">{[["Tous", ""], ["À verser", "pending"], ["En cours", "processing"], ["Versés", "succeeded"], ["Échecs", "failed"]].map(([label, value]) => <Link key={value} href={`/paiement/remboursements?statut=${value}`} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${status === value ? "border-orange-500 bg-orange-50 text-orange-900" : "border-slate-200 text-slate-700"}`}>{label}</Link>)}</div>
    <Card>
      {refunds.data.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[960px]"><thead><tr><th>Référence</th><th>Commande</th><th>Montant</th><th>Mode</th><th>Motif</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{refunds.data.map((refund) => <tr key={refund.id}>
        <td className="font-mono text-xs">{refund.reference ?? refund.id.slice(0, 8)}<div className="font-sans text-[11px] text-slate-500">{formatDate(refund.createdAt)}</div></td>
        <td><Link href={`/commandes/${refund.orderId}`} className="text-sm font-semibold hover:underline">Voir la commande</Link></td>
        <td className="font-semibold">{formatXof(refund.amountXof)}</td>
        <td className="text-sm">{refund.method === "original" ? "Moyen d’origine" : "Manuel"}</td>
        <td className="max-w-[240px] text-xs text-slate-600">{refund.reason ?? "—"}</td>
        <td><Badge tone={STATUS[refund.status]?.[1] ?? "neutral"}>{STATUS[refund.status]?.[0] ?? refund.status}</Badge>{refund.providerReference && <div className="mt-1 font-mono text-[11px] text-slate-500">{refund.providerReference}</div>}</td>
        <td className="min-w-[260px]">{canRefund && (refund.status === "pending" || refund.status === "processing") ? <div className="grid gap-2">
          <form action={actions.completeRefundAction} className="grid gap-1.5"><input type="hidden" name="refundId" value={refund.id}/><input name="providerReference" placeholder="Réf. du versement (facultatif)" className="ui-input h-8 text-xs"/><button className="ui-button ui-button-primary h-8 text-xs">Marquer versé</button></form>
          <form action={actions.failRefundAction} className="flex items-center gap-2"><input type="hidden" name="refundId" value={refund.id}/><input name="reason" placeholder="Motif de l’échec" className="ui-input h-8 flex-1 text-xs"/><button className="shrink-0 text-xs font-semibold text-red-700 hover:underline">Échec</button></form>
        </div> : <span className="text-xs text-slate-400">—</span>}</td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><Undo2 size={22} className="mb-2 text-slate-400"/><strong>Aucun remboursement</strong>Les remboursements se demandent depuis la fiche d’une commande.</div>}
    </Card>
  </>;
}
