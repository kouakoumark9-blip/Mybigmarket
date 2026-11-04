import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader } from "@/components/admin/page";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import type { AttributeGroup } from "@/lib/api-types";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";
const displayLabels: Record<string, string> = { select: "Liste déroulante", radio: "Boutons", color: "Couleur", texture: "Texture" };

export default async function AttributesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("catalog.attributes.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Catalogue", "Attributs"]} title="Attributs" subtitle="Groupes (couleur, taille, tension…) et leurs valeurs. Ils servent à générer les déclinaisons des produits."/>;
  let groups: AttributeGroup[];
  try {
    groups = await adminApi<AttributeGroup[]>("GET", "/admin/attribute-groups");
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((group) => <Card key={group.id} className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h2 className="font-bold text-slate-950">{group.name}</h2><p className="text-xs text-slate-500">{group.code} · {displayLabels[group.displayType] ?? group.displayType}</p></div>
          <div className="flex items-center gap-2">
            {group.isActive ? <Badge tone="orange">Actif</Badge> : <Badge>Inactif</Badge>}
            <form action={actions.toggleGroupAction}><input type="hidden" name="groupId" value={group.id}/>{group.isActive && <input type="hidden" name="isActive" value="true"/>}<button className="text-xs font-semibold text-slate-700 hover:underline">{group.isActive ? "Désactiver" : "Activer"}</button></form>
            <form action={actions.deleteGroupAction}><input type="hidden" name="groupId" value={group.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">{group.values.length ? group.values.map((value) => <span key={value.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 py-1 pl-2.5 pr-1 text-xs font-semibold text-slate-700">
          {value.colorHex && <span className="inline-block size-3 rounded-full border border-slate-300" style={{ background: value.colorHex }}/>}{value.name}
          <form action={actions.deleteValueAction}><input type="hidden" name="groupId" value={group.id}/><input type="hidden" name="valueId" value={value.id}/><button className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Supprimer ${value.name}`}><X size={12}/></button></form>
        </span>) : <span className="text-sm text-slate-500">Aucune valeur.</span>}</div>
        <form action={actions.addValueAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="groupId" value={group.id}/>
          <input name="name" required maxLength={120} placeholder="Nouvelle valeur" className="ui-input !h-9 flex-1"/>
          {group.displayType === "color" && <input name="colorHex" type="color" defaultValue="#000000" className="h-9 w-12 rounded border border-slate-200" aria-label="Couleur"/>}
          <button className="ui-button ui-button-outline">Ajouter</button>
        </form>
      </Card>)}
      <Card className="p-5">
        <h2 className="mb-3 font-bold text-slate-950">Nouveau groupe d’attributs</h2>
        <form action={actions.createGroupAction} className="grid gap-3">
          <Field label="Nom"><input name="name" required maxLength={120} placeholder="Couleur" className="ui-input"/></Field>
          <Field label="Affichage"><select name="displayType" className="ui-input"><option value="select">Liste déroulante</option><option value="radio">Boutons</option><option value="color">Couleur</option><option value="texture">Texture</option></select></Field>
          <Field label="Valeurs" hint="Séparées par des virgules : Noir, Orange, Blanc"><input name="values" className="ui-input"/></Field>
          <div><button className="ui-button ui-button-primary">Créer le groupe</button></div>
        </form>
      </Card>
    </div>
  </>;
}
