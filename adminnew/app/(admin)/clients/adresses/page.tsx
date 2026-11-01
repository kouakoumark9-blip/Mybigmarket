import { and, asc, eq, isNull } from "drizzle-orm";
import { MapPin, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminAddresses, adminCustomers, adminUsers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { saveAddressAction, trashAddressAction } from "../actions";

export const dynamic = "force-dynamic";

const noticeText: Record<string, { tone: string; text: string }> = {
  saved: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Adresse enregistrée." },
  duplicate: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Cette adresse existe déjà pour ce client (même destinataire, même rue, même pays)." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Adresse incomplète ou invalide : vérifie les champs signalés (prénom, nom, téléphone, rue, ville, pays)." },
  "customer-missing": { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Le client n'existe plus ou est dans la corbeille." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Adresse introuvable ou déjà supprimée." },
  trashed: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Adresse supprimée : elle n'est plus proposée lors d'une commande." },
};

export default async function AddressesPage({ searchParams }: { searchParams: Promise<{ customer?: string; notice?: string; edit?: string; fields?: string }> }) {
  await requireEmployee("customers.read");
  const params = await searchParams;
  const notice = params.notice ? noticeText[params.notice] : undefined;
  const db = getAdminDb();
  const customerId = params.customer;

  const [customerRow] = customerId
    ? await db.select({
        id: adminCustomers.id, name: adminUsers.name, email: adminUsers.email,
        companyName: adminCustomers.companyName, group: adminCustomers.customerGroup,
      }).from(adminCustomers).innerJoin(adminUsers, eq(adminCustomers.userId, adminUsers.id))
        .where(eq(adminCustomers.id, customerId)).limit(1)
    : [];

  const addresses = customerRow
    ? await db.select().from(adminAddresses)
        .where(and(eq(adminAddresses.customerId, customerRow.id), isNull(adminAddresses.deletedAt)))
        .orderBy(asc(adminAddresses.createdAt))
    : [];
  const editing = params.edit ? addresses.find((address) => address.id === params.edit) : undefined;
  const fields = (params.fields || "").split(",").filter(Boolean);

  if (!customerRow) {
    return <>
      <div className="admin-breadcrumb"><span>Relations clients</span><span>/</span><span>Clients</span><span>/</span><strong>Adresses</strong></div>
      <Card><div className="admin-empty"><MapPin size={24} className="mb-2 text-slate-400"/><strong>Choisis un client</strong>Ouvre ce carnet depuis la liste des clients pour afficher ses adresses.<div className="mt-3"><a href="/clients" className="text-sm font-semibold text-orange-700 hover:underline">Retour aux clients</a></div></div></Card>
    </>;
  }

  return <>
    <div className="admin-breadcrumb"><span>Relations clients</span><span>/</span><a href="/clients" className="hover:underline">Clients</a><span>/</span><strong>Adresses</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Carnet d&apos;adresses</h1><p className="admin-page-subtitle">{customerRow.name} · {customerRow.email}{customerRow.companyName ? ` · ${customerRow.companyName}` : ""}</p></div>
      <a href="/clients" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Retour aux clients</a>
    </div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`} role="status">{notice.text}</p>}
    {fields.length > 0 && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Champs à corriger : <strong>{fields.join(", ")}</strong></p>}

    <Card className="mb-5 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><MapPin size={19}/></div>
        <div><h2 className="font-bold text-slate-950">{editing ? "Modifier l&apos;adresse" : "Nouvelle adresse"}</h2><p className="text-xs text-slate-500">Une seule adresse par défaut par usage : cocher une nouvelle case retire l&apos;ancienne.</p></div>
      </div>
      <form action={saveAddressAction} className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="customerId" value={customerRow.id}/>
        {editing && <input type="hidden" name="id" value={editing.id}/>}
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Libellé<input name="label" maxLength={80} defaultValue={editing?.label} className="ui-input" placeholder="Bureau, Entrepôt…"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Prénom<input name="firstName" required maxLength={100} defaultValue={editing?.firstName} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Nom<input name="lastName" required maxLength={100} defaultValue={editing?.lastName} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Société (facultatif)<input name="companyName" maxLength={190} defaultValue={editing?.companyName ?? ""} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Téléphone<input name="phone" required maxLength={32} defaultValue={editing?.phone} className="ui-input" placeholder="+225 07 12 34 56 78"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-3">Adresse (rue, quartier)<input name="line1" required maxLength={190} defaultValue={editing?.line1} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2">Complément<input name="line2" maxLength={190} defaultValue={editing?.line2 ?? ""} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Ville<input name="city" required maxLength={120} defaultValue={editing?.city} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Région<input name="region" maxLength={120} defaultValue={editing?.region ?? ""} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Code postal<input name="postalCode" maxLength={24} defaultValue={editing?.postalCode ?? ""} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Pays (ISO-2)<input name="countryCode" required maxLength={2} defaultValue={editing?.countryCode ?? "CI"} className="ui-input uppercase"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-4">Repère de livraison<input name="deliveryInstructions" maxLength={240} defaultValue={editing?.deliveryInstructions ?? ""} className="ui-input" placeholder="Portail vert, 3e étage, appeler avant d&apos;arriver"/></label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" name="isDefaultShipping" defaultChecked={editing?.isDefaultShipping} className="size-4 rounded border-slate-300"/> Livraison par défaut</label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" name="isDefaultBilling" defaultChecked={editing?.isDefaultBilling} className="size-4 rounded border-slate-300"/> Facturation par défaut</label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800" type="submit">{editing ? "Enregistrer" : "Ajouter l&apos;adresse"}</button>
          {editing && <a href={`/clients/adresses?customer=${customerRow.id}`} className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</a>}
        </div>
      </form>
    </Card>

    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Adresses enregistrées</h2><p className="text-xs text-slate-500">{addresses.length} adresse(s) · {addresses.filter((address) => address.isDefaultShipping).length} par défaut en livraison</p></div>
      {addresses.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[900px]">
        <thead><tr><th>Destinataire</th><th>Adresse</th><th>Téléphone</th><th>Par défaut</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{addresses.map((address) => <tr key={address.id}>
          <td><div className="font-semibold text-slate-900">{address.firstName} {address.lastName}</div><div className="text-[11px] text-slate-500">{address.label}{address.companyName ? ` · ${address.companyName}` : ""}</div></td>
          <td className="text-xs">{address.line1}{address.line2 ? `, ${address.line2}` : ""}<div className="text-slate-500">{address.city}{address.region ? `, ${address.region}` : ""} · {address.countryCode}</div>{address.deliveryInstructions && <div className="text-[11px] italic text-slate-500">{address.deliveryInstructions}</div>}</td>
          <td className="whitespace-nowrap text-xs">{address.phone}</td>
          <td className="text-xs">{[address.isDefaultShipping ? "Livraison" : null, address.isDefaultBilling ? "Facturation" : null].filter(Boolean).join(" + ") || "—"}</td>
          <td><div className="flex justify-end gap-2">
            <a href={`/clients/adresses?customer=${customerRow.id}&edit=${address.id}`} className="text-xs font-semibold text-orange-700 hover:underline">Modifier</a>
            <form action={trashAddressAction}><input type="hidden" name="id" value={address.id}/><input type="hidden" name="customerId" value={customerRow.id}/><button type="submit" className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><MapPin size={24} className="mb-2 text-slate-400"/><strong>Aucune adresse</strong>Sans adresse, le client ne peut pas finaliser une commande livrée.</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Une adresse supprimée reste en base pour justifier les commandes passées. Les commandes déjà expédiées conservent l&apos;adresse recopiée au moment de l&apos;achat.</span></div>
    </Card>
  </>;
}
