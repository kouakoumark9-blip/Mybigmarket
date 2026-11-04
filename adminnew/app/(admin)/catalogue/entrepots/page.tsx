import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader } from "@/components/admin/page";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import type { Warehouse } from "@/lib/api-types";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";

function Toggle({ warehouse, field, value, label }: { warehouse: Warehouse; field: string; value: boolean; label: string }) {
  return <form action={actions.updateWarehouseAction}><input type="hidden" name="warehouseId" value={warehouse.id}/><input type="hidden" name="field" value={field}/><input type="hidden" name="value" value={String(value)}/><button className="text-xs font-semibold text-slate-800 hover:underline">{label}</button></form>;
}

export default async function WarehousesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("catalog.stock.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Catalogue", "Entrepôts"]} title="Entrepôts" subtitle="Le stock d’un entrepôt « vendable » compte pour la boutique. Un entrepôt de transit (en Chine par exemple) se suit sans être vendu."/>;
  let warehouses: Warehouse[];
  try {
    warehouses = await adminApi<Warehouse[]>("GET", "/admin/warehouses");
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <Card className="mb-5"><div className="admin-table-wrap"><table className="admin-table min-w-[900px]"><thead><tr><th>Entrepôt</th><th>Lieu</th><th>Physique</th><th>Réservé</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{warehouses.map((warehouse) => <tr key={warehouse.id}>
      <td><div className="font-semibold text-slate-900">{warehouse.name}</div><div className="text-[11px] text-slate-500">{warehouse.code}</div></td>
      <td>{[warehouse.city, warehouse.countryCode].filter(Boolean).join(", ")}</td>
      <td className="font-semibold">{warehouse.totals?.physical ?? 0}</td>
      <td>{warehouse.totals?.reserved ?? 0}</td>
      <td><div className="flex flex-wrap gap-1.5">{warehouse.isDefault && <Badge tone="dark">Par défaut</Badge>}{warehouse.isActive ? <Badge tone="orange">Actif</Badge> : <Badge>Inactif</Badge>}{warehouse.isSellable ? <Badge tone="orange">Vendable</Badge> : <Badge tone="warning">Transit</Badge>}</div></td>
      <td>{warehouse.isDefault ? <span className="text-xs text-slate-500">Toujours actif et vendable</span> : <div className="flex flex-wrap gap-3">
        <Toggle warehouse={warehouse} field="isSellable" value={!warehouse.isSellable} label={warehouse.isSellable ? "Rendre non vendable" : "Rendre vendable"}/>
        <Toggle warehouse={warehouse} field="isActive" value={!warehouse.isActive} label={warehouse.isActive ? "Désactiver" : "Activer"}/>
        {warehouse.isActive && warehouse.isSellable && <Toggle warehouse={warehouse} field="default" value label="Définir par défaut"/>}
        <form action={actions.deleteWarehouseAction}><input type="hidden" name="warehouseId" value={warehouse.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form>
      </div>}</td>
    </tr>)}</tbody></table></div></Card>
    <Card className="p-5">
      <h2 className="mb-4 font-bold text-slate-950">Nouvel entrepôt</h2>
      <form action={actions.createWarehouseAction} className="grid gap-4 md:grid-cols-3">
        <Field label="Nom"><input name="name" required minLength={2} maxLength={120} placeholder="Entrepôt de Bouaké" className="ui-input"/></Field>
        <Field label="Code" hint="Vide : déduit du nom."><input name="code" maxLength={40} className="ui-input"/></Field>
        <Field label="Pays (code ISO)"><input name="countryCode" maxLength={2} defaultValue="CI" className="ui-input"/></Field>
        <Field label="Ville"><input name="city" maxLength={120} className="ui-input"/></Field>
        <Field label="Adresse" className="md:col-span-2"><input name="address" maxLength={500} className="ui-input"/></Field>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-3"><input type="checkbox" name="isSellable" defaultChecked/> Stock vendable en boutique</label>
        <div className="md:col-span-3"><button className="ui-button ui-button-primary">Créer l’entrepôt</button></div>
      </form>
    </Card>
  </>;
}
