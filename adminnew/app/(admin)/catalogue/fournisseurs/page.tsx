import { asc, count, ilike, or } from "drizzle-orm";
import { Search, Store, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminSuppliers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { createSupplierAction, setSupplierActiveAction } from "./actions";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = { unverified: "Non vérifié", pending: "À examiner", verified: "Vérifié dans le système source" };
const notices: Record<string, string> = { created: "Fournisseur ajouté au répertoire.", updated: "Statut d’activité mis à jour.", exists: "Un fournisseur utilise déjà ce slug.", invalid: "Vérifie le nom, le slug, le pays et la ville.", error: "L’opération n’a pas abouti. Réessaie." };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; notice?: string }> }) {
  await requireEmployee("catalog.suppliers.manage");
  const params = await searchParams;
  const query = (params.q || "").trim().slice(0, 80);
  const where = query ? or(ilike(adminSuppliers.companyName, `%${query}%`), ilike(adminSuppliers.city, `%${query}%`), ilike(adminSuppliers.slug, `%${query}%`)) : undefined;
  const db = getAdminDb();
  const [suppliers, total] = await Promise.all([
    db.select().from(adminSuppliers).where(where).orderBy(asc(adminSuppliers.companyName)).limit(100),
    db.select({ value: count() }).from(adminSuppliers).where(where),
  ]);
  const notice = params.notice ? notices[params.notice] : undefined;

  return <>
    <div className="admin-breadcrumb"><span>Catalogue</span><span>/</span><strong>Fournisseurs</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Fournisseurs</h1><p className="admin-page-subtitle">Répertoire des partenaires de la marketplace; aucun statut n’est présenté comme une certification externe.</p></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{Number(total[0]?.value || 0)} fournisseur(s)</span></div>
    {notice && <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700" role="status">{notice}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3"><div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><Store size={18}/></div><div><h2 className="font-bold text-slate-950">Ajouter un fournisseur</h2><p className="text-xs text-slate-500">Le nouveau profil est marqué « Non vérifié ».</p></div></div>
        <form action={createSupplierAction} className="grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-700">Nom de l’entreprise<input name="companyName" required minLength={2} maxLength={190} className="ui-input"/></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-700">Slug (facultatif)<input name="slug" maxLength={180} className="ui-input" placeholder="généré depuis le nom"/></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-semibold text-slate-700">Pays<input name="countryCode" required minLength={2} maxLength={2} defaultValue="CN" className="ui-input uppercase"/></label><label className="grid gap-1 text-xs font-semibold text-slate-700">Ville<input name="city" maxLength={120} className="ui-input" placeholder="Ex. Shenzhen"/></label></div>
          <button type="submit" className="mt-1 inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">Ajouter au répertoire</button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <form method="get" className="flex items-end gap-3 border-b border-slate-100 p-4"><label className="grid flex-1 gap-1 text-xs font-semibold text-slate-700">Recherche<span className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input name="q" defaultValue={query} maxLength={80} placeholder="Entreprise, ville ou slug" className="ui-input pl-9"/></span></label><button type="submit" className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">Rechercher</button></form>
        {suppliers.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[700px]"><thead><tr><th>Entreprise</th><th>Pays / ville</th><th>Profil</th><th>Actif</th><th></th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.id}><td><div className="font-semibold text-slate-900">{supplier.companyName}</div><div className="text-[11px] text-slate-500">/{supplier.slug}</div></td><td>{supplier.countryCode}{supplier.city ? ` · ${supplier.city}` : ""}</td><td><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">{statusLabels[supplier.profileStatus] || supplier.profileStatus}</span></td><td><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${supplier.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{supplier.isActive ? "Actif" : "Inactif"}</span></td><td><form action={setSupplierActiveAction}><input type="hidden" name="id" value={supplier.id}/><input type="hidden" name="isActive" value={String(!supplier.isActive)}/><button className="text-xs font-semibold text-orange-700 hover:underline" type="submit">{supplier.isActive ? "Désactiver" : "Activer"}</button></form></td></tr>)}</tbody></table></div> : <div className="admin-empty"><Store size={22} className="mb-2 text-slate-400"/><strong>Aucun fournisseur</strong>Les profils ajoutés apparaîtront ici.</div>}
        <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Un profil actif n’est pas une garantie de qualité ou une certification; vérifie les informations avant toute publication.</span></div>
      </Card>
    </div>
  </>;
}
