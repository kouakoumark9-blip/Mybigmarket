import { asc, count, isNull } from "drizzle-orm";
import { BadgePercent, Star, TriangleAlert, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminCustomerGroups, adminCustomers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { saveGroupAction, setDefaultGroupAction, toggleGroupAction } from "../actions";

export const dynamic = "force-dynamic";

const noticeText: Record<string, { tone: string; text: string }> = {
  saved: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Groupe enregistré." },
  "duplicate-code": { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Ce code de groupe est déjà utilisé." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Formulaire invalide : le code doit être en minuscules, sans espace." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Groupe introuvable." },
  toggled: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Statut du groupe mis à jour. Un groupe désactivé n'applique plus sa remise." },
  default: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Groupe par défaut mis à jour : il s'applique aux nouveaux comptes clients." },
};

const formatPercent = (basisPoints: number) => `${(basisPoints / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ notice?: string; edit?: string }> }) {
  await requireEmployee("customers.manage");
  const params = await searchParams;
  const notice = params.notice ? noticeText[params.notice] : undefined;
  const db = getAdminDb();
  const [groups, usage] = await Promise.all([
    db.select().from(adminCustomerGroups).where(isNull(adminCustomerGroups.deletedAt)).orderBy(asc(adminCustomerGroups.sortOrder), asc(adminCustomerGroups.name)),
    db.select({ groupId: adminCustomers.customerGroupId, value: count() }).from(adminCustomers)
      .where(isNull(adminCustomers.deletedAt)).groupBy(adminCustomers.customerGroupId),
  ]);
  const usageByGroup = new Map(usage.map((row) => [row.groupId ?? 0, Number(row.value)]));
  const editing = params.edit ? groups.find((group) => String(group.id) === params.edit) : undefined;
  const defaults = groups.filter((group) => group.isDefault).length;

  return <>
    <div className="admin-breadcrumb"><span>Relations clients</span><span>/</span><span>Clients</span><span>/</span><strong>Groupes</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Groupes de clients</h1><p className="admin-page-subtitle">Un groupe porte une remise et un mode d&apos;affichage des prix. Les remises ne se cumulent pas : la plus forte s&apos;applique.</p></div>
      <a href="/clients" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Retour aux clients</a>
    </div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`} role="status">{notice.text}</p>}
    {defaults > 1 && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">Plusieurs groupes sont marqués par défaut : l&apos;attribution automatique deviendrait ambiguë.</p>}

    <Card className="mb-5 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><BadgePercent size={19}/></div>
        <div><h2 className="font-bold text-slate-950">{editing ? "Modifier le groupe" : "Nouveau groupe"}</h2><p className="text-xs text-slate-500">La remise s&apos;applique au prix catalogue HT, jamais sur un prix déjà remisé.</p></div>
      </div>
      <form action={saveGroupAction} className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {editing && <input type="hidden" name="id" value={editing.id}/>}
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Code<input name="code" required defaultValue={editing?.code} pattern="[a-z0-9_-]{2,60}" maxLength={60} className="ui-input" placeholder="grossiste"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Nom<input name="name" required defaultValue={editing?.name} minLength={2} maxLength={100} className="ui-input" placeholder="Grossistes"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Remise (%)<input name="discountPercent" type="number" step="0.01" min={0} max={100} defaultValue={((editing?.discountBasisPoints ?? 0) / 100)} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Ordre<input name="sortOrder" type="number" min={0} max={9999} defaultValue={editing?.sortOrder ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Affichage des prix<select name="priceDisplayMethod" defaultValue={editing?.priceDisplayMethod || "tax_excluded"} className="ui-input"><option value="tax_excluded">Hors taxes</option><option value="tax_included">Toutes taxes comprises</option></select></label>
        <label className="flex items-center gap-2 pt-5 text-xs font-semibold text-slate-700"><input type="checkbox" name="showPrices" defaultChecked={editing ? editing.showPrices : true} className="size-4 rounded border-slate-300"/> Afficher les prix</label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-4">Description<input name="description" maxLength={500} defaultValue={editing?.description} className="ui-input" placeholder="Conditions commerciales, cible du groupe…"/></label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800" type="submit">{editing ? "Enregistrer" : "Créer le groupe"}</button>
          {editing && <a href="/clients/groupes" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</a>}
        </div>
      </form>
    </Card>

    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Groupes enregistrés</h2><p className="text-xs text-slate-500">{groups.filter((group) => group.isActive).length} actif(s) sur {groups.length}</p></div>
      {groups.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[900px]">
        <thead><tr><th>Groupe</th><th>Remise</th><th>Affichage</th><th>Clients</th><th>Statut</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{groups.map((group) => <tr key={group.id}>
          <td><div className="font-semibold text-slate-900">{group.name}{group.isDefault && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800"><Star size={10}/>Défaut</span>}</div><div className="text-[11px] text-slate-500">{group.code}{group.description ? ` · ${group.description}` : ""}</div></td>
          <td className="font-semibold">{formatPercent(group.discountBasisPoints)}</td>
          <td className="text-xs">{group.priceDisplayMethod === "tax_included" ? "TTC" : "HT"}{group.showPrices ? "" : " · prix masqués"}</td>
          <td><span className="inline-flex items-center gap-1 text-xs"><Users size={13} className="text-slate-400"/>{usageByGroup.get(group.id) ?? 0}</span></td>
          <td><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${group.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{group.isActive ? "Actif" : "Inactif"}</span></td>
          <td><div className="flex justify-end gap-2">
            <a href={`/clients/groupes?edit=${group.id}`} className="text-xs font-semibold text-orange-700 hover:underline">Modifier</a>
            {!group.isDefault && (usageByGroup.get(group.id) ?? 0) >= 0 && <form action={setDefaultGroupAction}><input type="hidden" name="id" value={group.id}/><button type="submit" className="text-xs font-semibold text-blue-700 hover:underline">Par défaut</button></form>}
            <form action={toggleGroupAction}><input type="hidden" name="id" value={group.id}/><button type="submit" className="text-xs font-semibold text-slate-700 hover:underline">{group.isActive ? "Désactiver" : "Activer"}</button></form>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><Users size={22} className="mb-2 text-slate-400"/><strong>Aucun groupe</strong>Crée un groupe pour appliquer une remise à une catégorie de clients.</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Désactiver un groupe suspend sa remise sans toucher aux clients rattachés. Le groupe par défaut est attribué aux nouveaux comptes créés depuis le back office.</span></div>
    </Card>
  </>;
}
