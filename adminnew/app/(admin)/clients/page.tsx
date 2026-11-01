import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { Search, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminCustomers, adminUsers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const statusLabel: Record<string, string> = { active: "Actif", suspended: "Suspendu", locked: "Bloqué", invited: "Invité" };
const dateLabel = (date: Date) => new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date);

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireEmployee("customers.read");
  const params = await searchParams;
  const query = (params.q || "").trim().slice(0, 100);
  const conditions = [eq(adminUsers.role, "buyer"), query ? or(ilike(adminUsers.name, `%${query}%`), ilike(adminUsers.email, `%${query}%`), ilike(adminCustomers.companyName, `%${query}%`)) : undefined].filter(Boolean);
  const db = getAdminDb();
  const [customers, total] = await Promise.all([
    db.select({ id: adminUsers.id, name: adminUsers.name, email: adminUsers.email, phone: adminUsers.phone, status: adminUsers.status, createdAt: adminUsers.createdAt, companyName: adminCustomers.companyName, customerGroup: adminCustomers.customerGroup, preferredLocale: adminCustomers.preferredLocale })
      .from(adminUsers).leftJoin(adminCustomers, eq(adminUsers.id, adminCustomers.userId)).where(and(...conditions)).orderBy(desc(adminUsers.createdAt)).limit(100),
    db.select({ value: count() }).from(adminUsers).where(eq(adminUsers.role, "buyer")),
  ]);

  return <>
    <div className="admin-breadcrumb"><span>Relations clients</span><span>/</span><strong>Clients et adresses</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Clients</h1><p className="admin-page-subtitle">Comptes acheteurs enregistrés dans la base, avec leurs coordonnées de contact.</p></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{Number(total[0]?.value || 0)} compte(s)</span></div>
    <Card className="mb-5 p-4"><form method="get" className="flex items-end gap-3"><label className="grid flex-1 gap-1 text-xs font-semibold text-slate-700">Recherche<span className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input name="q" defaultValue={query} maxLength={100} placeholder="Nom, entreprise ou e-mail" className="ui-input pl-9"/></span></label><button type="submit" className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">Rechercher</button></form></Card>
    <Card>
      {customers.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[900px]"><thead><tr><th>Client</th><th>Entreprise / segment</th><th>Contact</th><th>Langue</th><th>Statut</th><th>Inscription</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><div className="font-semibold text-slate-900">{customer.name}</div><div className="text-[11px] text-slate-500">{customer.email}</div></td><td>{customer.companyName || "Particulier"}<div className="text-[11px] text-slate-500">{customer.customerGroup || "Groupe standard"}</div></td><td>{customer.phone || "—"}</td><td>{customer.preferredLocale || "fr-CI"}</td><td><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${customer.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{statusLabel[customer.status] || customer.status}</span></td><td className="whitespace-nowrap">{dateLabel(customer.createdAt)}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><Users size={22} className="mb-2 text-slate-400"/><strong>Aucun client trouvé</strong>{query ? "Essaie un autre nom ou une autre adresse." : "Les acheteurs inscrits apparaîtront ici."}</div>}
      <div className="border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500">Accès réservé aux employés autorisés. Les données de contact ne sont pas exportées ni modifiées depuis cette vue.</div>
    </Card>
  </>;
}
