import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { MapPin, Search, ShoppingCart, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminCarts, adminCustomerGroups, adminCustomers, adminUsers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { saveCustomerAction, trashCustomerAction } from "./actions";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = { active: "Actif", suspended: "Suspendu", locked: "Bloqué", invited: "Invité" };
const segmentLabel: Record<string, string> = { individual: "Particulier", business: "Professionnel", reseller: "Revendeur" };
const dateLabel = (date: Date) => new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date);

const noticeText: Record<string, { tone: string; text: string }> = {
  saved: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Fiche client enregistrée." },
  "bad-email": { tone: "border-red-200 bg-red-50 text-red-800", text: "Adresse e-mail invalide : elle sert d'identifiant de connexion." },
  "bad-phone": { tone: "border-red-200 bg-red-50 text-red-800", text: "Numéro de téléphone invalide : 8 à 15 chiffres attendus." },
  "email-taken": { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Cet e-mail est déjà utilisé par un autre compte." },
  "group-missing": { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Le groupe choisi n'existe plus. Recharge la page et réessaie." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Formulaire invalide : vérifie le nom, la langue et la devise." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Client introuvable ou déjà dans la corbeille." },
  trashed: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Client déplacé dans la corbeille et compte suspendu." },
  "open-orders": { tone: "border-red-200 bg-red-50 text-red-800", text: "Suppression refusée : ce client a encore une commande en cours. Termine-la d'abord." },
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string; segment?: string; notice?: string; edit?: string }> }) {
  await requireEmployee("customers.read");
  const params = await searchParams;
  const notice = params.notice ? noticeText[params.notice] : undefined;
  const query = (params.q || "").trim().slice(0, 100);
  const segment = ["individual", "business", "reseller"].includes(params.segment || "") ? params.segment : undefined;
  const groupId = params.group && /^\d+$/.test(params.group) ? Number(params.group) : undefined;

  const db = getAdminDb();
  const filters = [
    isNull(adminCustomers.deletedAt),
    eq(adminUsers.role, "buyer"),
    query ? or(ilike(adminUsers.name, `%${query}%`), ilike(adminUsers.email, `%${query}%`), ilike(adminCustomers.companyName, `%${query}%`)) : undefined,
    segment ? eq(adminCustomers.segment, segment) : undefined,
    groupId ? eq(adminCustomers.customerGroupId, groupId) : undefined,
  ].filter(Boolean);

  const [customers, total, groups, cartsByCustomer] = await Promise.all([
    db.select({
      id: adminCustomers.id,
      userId: adminCustomers.userId,
      name: adminUsers.name,
      email: adminUsers.email,
      phone: adminUsers.phone,
      status: adminUsers.status,
      createdAt: adminCustomers.createdAt,
      companyName: adminCustomers.companyName,
      taxNumber: adminCustomers.taxNumber,
      customerGroup: adminCustomers.customerGroup,
      customerGroupId: adminCustomers.customerGroupId,
      segment: adminCustomers.segment,
      preferredLanguage: adminCustomers.preferredLanguage,
      preferredCurrency: adminCustomers.preferredCurrency,
      internalNote: adminCustomers.internalNote,
      lastActivityAt: adminCustomers.lastActivityAt,
      newsletterConsentAt: adminCustomers.newsletterConsentAt,
      anonymizedAt: adminCustomers.anonymizedAt,
    })
      .from(adminCustomers)
      .innerJoin(adminUsers, eq(adminCustomers.userId, adminUsers.id))
      .where(and(...filters))
      .orderBy(desc(adminCustomers.createdAt))
      .limit(100),
    db.select({ value: count() }).from(adminCustomers).where(isNull(adminCustomers.deletedAt)),
    db.select().from(adminCustomerGroups).where(isNull(adminCustomerGroups.deletedAt)),
    db.select({ id: adminCustomers.id, carts: count() }).from(adminCustomers).leftJoin(adminCarts, eq(adminCarts.customerId, adminCustomers.id)).groupBy(adminCustomers.id),
  ]);
  const cartCount = new Map(cartsByCustomer.map((row) => [row.id, Number(row.carts)]));
  const editing = params.edit ? customers.find((customer) => customer.id === params.edit) : undefined;

  return <>
    <div className="admin-breadcrumb"><span>Relations clients</span><span>/</span><strong>Clients</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Clients</h1><p className="admin-page-subtitle">Comptes acheteurs, segmentation et coordonnées. Un client ne se supprime pas : il part à la corbeille puis peut être anonymisé.</p></div>
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{Number(total[0]?.value || 0)} compte(s)</span>
        <a href="/clients/groupes" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Groupes</a>
        <a href="/clients/corbeille" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Corbeille</a>
      </div>
    </div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`} role="status">{notice.text}</p>}

    <Card className="mb-5 p-4 sm:p-5">
      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700 lg:col-span-2">Recherche<span className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input name="q" defaultValue={query} maxLength={100} placeholder="Nom, entreprise ou e-mail" className="ui-input pl-9"/></span></label>
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Segment<select name="segment" defaultValue={segment || ""} className="ui-input"><option value="">Tous</option><option value="individual">Particulier</option><option value="business">Professionnel</option><option value="reseller">Revendeur</option></select></label>
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Groupe<select name="group" defaultValue={groupId ? String(groupId) : ""} className="ui-input"><option value="">Tous les groupes</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <div className="flex items-end gap-2"><button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Search size={15}/>Filtrer</button>{(query || segment || groupId) && <a href="/clients" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Effacer</a>}</div>
      </form>
    </Card>

    <Card className="mb-5 overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">{editing ? `Modifier ${editing.name}` : "Créer un client"}</h2><p className="text-xs text-slate-500">{editing ? "L'e-mail sert d'identifiant de connexion : le modifier change ses accès." : "Le compte est créé sans mot de passe : le client l'initialise à sa première connexion."}</p></div>
      <form action={saveCustomerAction} className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {editing && <input type="hidden" name="id" value={editing.id}/>}
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Nom complet<input name="name" required minLength={2} maxLength={160} defaultValue={editing?.name} className="ui-input" placeholder="Awa Traoré"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">E-mail<input name="email" type="email" required maxLength={190} defaultValue={editing?.email} className="ui-input" placeholder="awa@example.com"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Téléphone<input name="phone" maxLength={32} defaultValue={editing?.phone ?? ""} className="ui-input" placeholder="+225 07 12 34 56 78"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Segment<select name="segment" defaultValue={editing?.segment || "individual"} className="ui-input"><option value="individual">Particulier</option><option value="business">Professionnel</option><option value="reseller">Revendeur</option></select></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Entreprise<input name="companyName" maxLength={190} defaultValue={editing?.companyName ?? ""} className="ui-input" placeholder="Sahel SARL"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Numéro fiscal<input name="taxNumber" maxLength={80} defaultValue={editing?.taxNumber ?? ""} className="ui-input" placeholder="CI-1234567 A"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Groupe<select name="customerGroupId" defaultValue={editing?.customerGroupId ? String(editing.customerGroupId) : ""} className="ui-input"><option value="">Groupe par défaut</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Langue<select name="preferredLanguage" defaultValue={editing?.preferredLanguage || "fr"} className="ui-input"><option value="fr">Français</option><option value="en">English</option></select></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Devise<select name="preferredCurrency" defaultValue={editing?.preferredCurrency || "XOF"} className="ui-input"><option value="XOF">FCFA</option><option value="EUR">Euro</option><option value="USD">Dollar</option></select></label>
        <label className="flex items-center gap-2 pt-5 text-xs font-semibold text-slate-700"><input type="checkbox" name="newsletter" defaultChecked={Boolean(editing?.newsletterConsentAt)} className="size-4 rounded border-slate-300"/> Consentement newsletter</label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-4">Note interne<input name="internalNote" maxLength={2000} defaultValue={editing?.internalNote} className="ui-input" placeholder="Contexte commercial, historique de contact…"/></label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800" type="submit">{editing ? "Enregistrer" : "Créer le client"}</button>
          {editing && <a href="/clients" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</a>}
        </div>
      </form>
    </Card>

    <Card className="overflow-hidden">
      {customers.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[1050px]">
        <thead><tr><th>Client</th><th>Entreprise / segment</th><th>Groupe</th><th>Contact</th><th>Langue / devise</th><th>Panier</th><th>Statut</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{customers.map((customer) => <tr key={customer.id}>
          <td><div className="flex items-center gap-2"><Users size={16} className="shrink-0 text-slate-400"/><div><div className="font-semibold text-slate-900">{customer.name}</div><div className="text-[11px] text-slate-500">{customer.email}</div>{customer.anonymizedAt && <div className="text-[10px] font-semibold text-amber-700">anonymisé le {dateLabel(customer.anonymizedAt)}</div>}</div></div></td>
          <td>{customer.companyName || "Particulier"}<div className="text-[11px] text-slate-500">{segmentLabel[customer.segment] || customer.segment}{customer.taxNumber ? ` · ${customer.taxNumber}` : ""}</div></td>
          <td className="text-xs">{groups.find((group) => group.id === customer.customerGroupId)?.name || customer.customerGroup}</td>
          <td className="text-xs">{customer.phone || "—"}<div className="text-[11px] text-slate-500">Inscrit le {dateLabel(customer.createdAt)}</div></td>
          <td className="text-xs uppercase">{customer.preferredLanguage} / {customer.preferredCurrency}</td>
          <td className="text-xs"><span className="inline-flex items-center gap-1"><ShoppingCart size={13} className="text-slate-400"/>{cartCount.get(customer.id) ?? 0}</span></td>
          <td><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${customer.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{statusLabel[customer.status] || customer.status}</span></td>
          <td><div className="flex justify-end gap-2">
            <a href={`/clients?edit=${customer.id}`} className="text-xs font-semibold text-orange-700 hover:underline">Modifier</a>
            <a href={`/clients/adresses?customer=${customer.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:underline"><MapPin size={12}/>Adresses</a>
            <form action={trashCustomerAction}><input type="hidden" name="id" value={customer.id}/><button type="submit" className="text-xs font-semibold text-red-700 hover:underline">Corbeille</button></form>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><Users size={22} className="mb-2 text-slate-400"/><strong>Aucun client trouvé</strong>{query || segment || groupId ? "Essaie un autre filtre." : "Les acheteurs inscrits apparaîtront ici."}</div>}
      <div className="border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500">Accès réservé aux employés autorisés. Chaque création et modification est enregistrée dans le journal d&apos;audit ; les données de contact ne sont jamais exportées depuis cet écran.</div>
    </Card>
    {customers.length === 100 && <p className="mt-3 text-xs text-slate-500">Affichage limité aux 100 comptes les plus récents ; affine la recherche pour retrouver un client ancien.</p>}
  </>;
}
