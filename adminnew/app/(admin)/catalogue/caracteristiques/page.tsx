import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Field, Notice, PageHeader } from "@/components/admin/page";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import type { Feature } from "@/lib/api-types";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";

export default async function FeaturesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("catalog.features.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Catalogue", "Caractéristiques"]} title="Caractéristiques" subtitle="Fiche technique des produits (puissance, matière, garantie…), avec des valeurs prédéfinies réutilisables."/>;
  let features: Feature[];
  try {
    features = await adminApi<Feature[]>("GET", "/admin/features");
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <div className="grid gap-4 lg:grid-cols-2">
      {features.map((feature) => <Card key={feature.id} className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-950">{feature.name}</h2><p className="text-xs text-slate-500">{feature.code}</p></div>
          <form action={actions.deleteFeatureAction}><input type="hidden" name="featureId" value={feature.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form></div>
        <div className="mb-3 flex flex-wrap gap-2">{feature.values.length ? feature.values.map((value) => <span key={value.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 py-1 pl-2.5 pr-1 text-xs font-semibold text-slate-700">{value.value}
          <form action={actions.deleteFeatureValueAction}><input type="hidden" name="featureId" value={feature.id}/><input type="hidden" name="valueId" value={value.id}/><button className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Supprimer ${value.value}`}><X size={12}/></button></form></span>) : <span className="text-sm text-slate-500">Valeur libre sur chaque produit.</span>}</div>
        <form action={actions.addFeatureValueAction} className="flex gap-2"><input type="hidden" name="featureId" value={feature.id}/><input name="value" required maxLength={190} placeholder="Nouvelle valeur" className="ui-input !h-9 flex-1"/><button className="ui-button ui-button-outline">Ajouter</button></form>
      </Card>)}
      <Card className="p-5">
        <h2 className="mb-3 font-bold text-slate-950">Nouvelle caractéristique</h2>
        <form action={actions.createFeatureAction} className="grid gap-3">
          <Field label="Nom"><input name="name" required maxLength={120} placeholder="Puissance" className="ui-input"/></Field>
          <Field label="Valeurs prédéfinies" hint="Facultatif, séparées par des virgules : 500 W, 750 W"><input name="values" className="ui-input"/></Field>
          <div><button className="ui-button ui-button-primary">Créer la caractéristique</button></div>
        </form>
      </Card>
    </div>
  </>;
}
