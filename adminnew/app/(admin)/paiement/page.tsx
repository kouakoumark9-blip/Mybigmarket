import { asc, eq } from "drizzle-orm";
import { CreditCard, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminPaymentCountryRules, adminPaymentMethods } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await requireEmployee("payments.read");
  const db = getAdminDb();
  const [methods, allowedRules] = await Promise.all([
    db.select().from(adminPaymentMethods).orderBy(asc(adminPaymentMethods.name)),
    db.select({ methodId: adminPaymentCountryRules.paymentMethodId, countryCode: adminPaymentCountryRules.countryCode })
      .from(adminPaymentCountryRules).where(eq(adminPaymentCountryRules.isAllowed, true)),
  ]);
  const allowedByMethod = new Map<string, string[]>();
  for (const rule of allowedRules) allowedByMethod.set(rule.methodId, [...(allowedByMethod.get(rule.methodId) || []), rule.countryCode]);

  return <>
    <div className="admin-breadcrumb"><span>Opérations</span><span>/</span><strong>Paiement</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Paiements</h1><p className="admin-page-subtitle">Méthodes configurées et pays autorisés, sans accès aux secrets de prestataires.</p></div></div>
    <Card className="mb-5 flex items-start gap-3 border-amber-200 bg-amber-50 p-4"><ShieldAlert size={19} className="mt-0.5 shrink-0 text-amber-800"/><div><h2 className="font-bold text-amber-950">Aucun paiement réel activé</h2><p className="mt-1 text-sm leading-6 text-amber-900">Les méthodes présentes sont des configurations de démonstration. N’active pas un prestataire avant l’intégration, les clés sécurisées, les webhooks et les tests de rapprochement.</p></div></Card>
    <div className="grid gap-4 xl:grid-cols-2">{methods.map((method) => <Card key={method.id} className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-lg bg-slate-100 p-2.5 text-slate-700"><CreditCard size={18}/></div><div><h2 className="font-bold text-slate-950">{method.name}</h2><p className="text-xs text-slate-500">{method.provider} · {method.code}</p></div></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${method.isActive ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{method.isActive ? "Activée — vérification requise" : "Désactivée"}</span></div><div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2"><div><span className="text-xs text-slate-500">Mode</span><div className="font-semibold text-slate-800">{method.mode === "test" ? "Test" : method.mode}</div></div><div><span className="text-xs text-slate-500">Pays autorisés</span><div className="font-semibold text-slate-800">{(allowedByMethod.get(method.id) || []).join(", ") || "Aucun"}</div></div></div></Card>)}</div>
    {!methods.length && <Card className="admin-empty"><CreditCard size={22} className="mb-2 text-slate-400"/><strong>Aucune méthode de paiement</strong>Les prestataires seront ajoutés après leur intégration sécurisée.</Card>}
    <p className="mt-4 text-xs text-slate-500">Les tableaux de bord et le ledger ne constituent ni un séquestre ni un transfert de fonds. Les changements restent bloqués tant qu’aucun PSP n’est réellement intégré.</p>
  </>;
}
