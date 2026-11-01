import { asc, eq } from "drizzle-orm";
import { Shield, ShieldCheck, UserRoundCog } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminEmployees, roles } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { setEmployeeStatusAction } from "./actions";

export const dynamic = "force-dynamic";
const roleLabels: Record<string, string> = { super_admin: "SuperAdmin", catalog_manager: "Gestionnaire catalogue", orders_manager: "Gestionnaire commandes", logistician: "Logisticien", customer_service: "Service client" };
const notices: Record<string, string> = { updated: "Accès employé mis à jour et journalisé.", self: "Tu ne peux pas verrouiller ta propre session ici.", "last-admin": "Il faut conserver au moins un SuperAdmin actif.", invalid: "Demande invalide.", missing: "Employé introuvable.", unchanged: "Aucun changement à effectuer.", error: "La modification n’a pas abouti. Réessaie." };
const dateLabel = (date: Date | null) => date ? new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "Jamais";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireEmployee("employees.manage");
  const params = await searchParams;
  const db = getAdminDb();
  const employees = await db.select({ id: adminEmployees.id, firstName: adminEmployees.firstName, lastName: adminEmployees.lastName, email: adminEmployees.email, status: adminEmployees.status, totpEnabled: adminEmployees.totpEnabled, lastLoginAt: adminEmployees.lastLoginAt, createdAt: adminEmployees.createdAt, roleCode: roles.code, roleName: roles.name })
    .from(adminEmployees).innerJoin(roles, eq(adminEmployees.roleId, roles.id)).orderBy(asc(adminEmployees.email));
  const notice = params.notice ? notices[params.notice] : undefined;

  return <>
    <div className="admin-breadcrumb"><span>Configuration</span><span>/</span><strong>Employés et rôles</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Employés et rôles</h1><p className="admin-page-subtitle">Comptes internes, rôles d’accès et protections de connexion.</p></div></div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${params.notice === "updated" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`} role="status">{notice}</p>}
    <Card>
      {employees.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[980px]"><thead><tr><th>Employé</th><th>Rôle</th><th>Statut</th><th>TOTP</th><th>Dernière connexion</th><th>Accès</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}><td><div className="font-semibold text-slate-900">{employee.firstName} {employee.lastName}</div><div className="text-[11px] text-slate-500">{employee.email}</div></td><td>{roleLabels[employee.roleCode] || employee.roleName}</td><td><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${employee.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{employee.status === "active" ? "Actif" : employee.status}</span></td><td><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${employee.totpEnabled ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-500"}`}>{employee.totpEnabled ? <ShieldCheck size={12}/> : <Shield size={12}/>} {employee.totpEnabled ? "Activé" : "Désactivé"}</span></td><td>{dateLabel(employee.lastLoginAt)}</td><td><form action={setEmployeeStatusAction}><input type="hidden" name="id" value={employee.id}/><input type="hidden" name="status" value={employee.status === "active" ? "locked" : "active"}/><button type="submit" className="text-xs font-semibold text-orange-700 hover:underline">{employee.status === "active" ? "Verrouiller" : "Réactiver"}</button></form></td></tr>)}</tbody></table></div> : <div className="admin-empty"><UserRoundCog size={22} className="mb-2 text-slate-400"/><strong>Aucun employé</strong>Les comptes internes apparaîtront ici.</div>}
      <div className="border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500">Le changement de rôle et l’invitation de nouveaux employés sont réservés à une étape sécurisée ultérieure. Les verrouillages sont journalisés.</div>
    </Card>
  </>;
}
