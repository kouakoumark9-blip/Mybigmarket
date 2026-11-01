import { asc } from "drizzle-orm";
import { BadgePercent, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminPromoCodes } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const dateLabel = (date: Date | null) => date ? new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "Sans limite";

export default async function MarketingPage() {
  await requireEmployee("marketing.manage");
  const promos = await getAdminDb().select().from(adminPromoCodes).orderBy(asc(adminPromoCodes.code)).limit(200);

  return <>
    <div className="admin-breadcrumb"><span>Boutique</span><span>/</span><strong>Marketing</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Marketing et promotions</h1><p className="admin-page-subtitle">Codes promotionnels actuellement enregistrés, avec leur période et leur utilisation.</p></div></div>
    <Card className="mb-5 flex items-start gap-3 border-amber-200 bg-amber-50 p-4"><TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-800"/><p className="text-sm leading-6 text-amber-950">Cette vue n’active ni ne modifie un code promotionnel. Un changement de remise peut affecter les prix du checkout et exige une validation dédiée.</p></Card>
    <Card>
      {promos.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[900px]"><thead><tr><th>Code</th><th>Remise</th><th>Utilisations</th><th>Période</th><th>Statut</th></tr></thead><tbody>{promos.map((promo) => <tr key={promo.id}><td className="font-mono font-bold text-slate-900">{promo.code}</td><td>{promo.discountType === "percent" ? `${promo.discountValue}%` : `${new Intl.NumberFormat("fr-FR").format(promo.discountValue)} FCFA`}</td><td>{promo.usageCount.toLocaleString("fr-FR")}{promo.usageLimit ? ` / ${promo.usageLimit.toLocaleString("fr-FR")}` : " / sans limite"}</td><td>{dateLabel(promo.startsAt)} – {dateLabel(promo.endsAt)}</td><td><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${promo.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{promo.isActive ? "Active" : "Inactive"}</span></td></tr>)}</tbody></table></div> : <div className="admin-empty"><BadgePercent size={22} className="mb-2 text-slate-400"/><strong>Aucune promotion</strong>Les codes promotionnels apparaîtront ici après leur création.</div>}
    </Card>
  </>;
}
