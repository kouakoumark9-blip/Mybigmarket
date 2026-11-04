import { Percent } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader, formatDate, formatXof } from "@/components/admin/page";
import { adminApiList, apiErrorMessage } from "@/lib/admin-api";
import type { CatalogRule } from "@/lib/api-types";
import { brandOptions, categoryOptions, customerGroupOptions } from "@/lib/catalog-lookups";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";

const reduction = (rule: CatalogRule) => rule.reductionType === "percent" ? `−${rule.reductionValue} %` : rule.reductionType === "amount" ? `−${formatXof(rule.reductionValue)}` : `Prix fixe ${formatXof(rule.reductionValue)}`;

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("pricing.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Boutique", "Règles de prix"]} title="Règles de prix catalogue" subtitle="Promotions appliquées automatiquement aux produits qui remplissent les conditions. Le client obtient toujours la remise la plus favorable, sans jamais passer sous le prix d’achat."/>;
  let data;
  try {
    const [rules, categories, brands, groups] = await Promise.all([adminApiList<CatalogRule>("/admin/catalog-price-rules", { limit: 100 }), categoryOptions(), brandOptions(), customerGroupOptions()]);
    data = { rules: rules.data, categories, brands, groups };
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  const names = (ids: number[] | undefined, options: Array<{ id: number; label?: string; name?: string }>) => (ids ?? []).map((id) => options.find((option) => option.id === id)?.label?.replace(/^(— )+/, "") ?? options.find((option) => option.id === id)?.name ?? `#${id}`).join(", ");
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <Card className="mb-5">
      {data.rules.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[900px]"><thead><tr><th>Règle</th><th>Remise</th><th>Produits visés</th><th>Période</th><th>Statut</th><th></th></tr></thead><tbody>{data.rules.map((rule) => <tr key={rule.id}>
        <td className="font-semibold text-slate-900">{rule.name}{rule.customerGroupId ? <div className="text-[11px] font-normal text-slate-500">Groupe : {data.groups.find((group) => group.id === rule.customerGroupId)?.name}</div> : null}</td>
        <td className="font-semibold">{reduction(rule)}{rule.fromQuantity > 1 ? <div className="text-[11px] font-normal text-slate-500">dès {rule.fromQuantity} unités</div> : null}</td>
        <td className="text-xs leading-5 text-slate-600">{[rule.conditions.categoryIds?.length ? `Catégories : ${names(rule.conditions.categoryIds, data.categories)}` : null, rule.conditions.brandIds?.length ? `Marques : ${names(rule.conditions.brandIds, data.brands)}` : null].filter(Boolean).join(" · ") || "Tout le catalogue"}</td>
        <td className="text-xs">{rule.dateFrom || rule.dateTo ? `${formatDate(rule.dateFrom)} → ${formatDate(rule.dateTo)}` : "Permanente"}</td>
        <td>{rule.isActive ? <Badge tone="orange">Active</Badge> : <Badge>Inactive</Badge>}</td>
        <td><div className="flex gap-3">
          <form action={actions.toggleRuleAction}><input type="hidden" name="ruleId" value={rule.id}/><input type="hidden" name="isActive" value={String(rule.isActive)}/><button className="text-xs font-semibold text-slate-800 hover:underline">{rule.isActive ? "Désactiver" : "Activer"}</button></form>
          <form action={actions.deleteRuleAction}><input type="hidden" name="ruleId" value={rule.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form>
        </div></td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><Percent size={22} className="mb-2 text-slate-400"/><strong>Aucune règle de prix</strong>Créez une promotion ci-dessous.</div>}
    </Card>
    <Card className="p-5">
      <h2 className="mb-4 font-bold text-slate-950">Nouvelle règle de prix</h2>
      <form action={actions.createRuleAction} className="grid gap-4 md:grid-cols-3">
        <Field label="Nom" className="md:col-span-3"><input name="name" required minLength={2} maxLength={120} placeholder="Soldes électroménager −15 %" className="ui-input"/></Field>
        <Field label="Type"><select name="reductionType" className="ui-input"><option value="percent">Remise en %</option><option value="amount">Remise en FCFA</option><option value="fixed_price">Prix fixe HT</option></select></Field>
        <Field label="Valeur"><input name="reductionValue" required inputMode="decimal" className="ui-input"/></Field>
        <Field label="À partir de (unités)"><input name="fromQuantity" type="number" min={1} defaultValue={1} className="ui-input"/></Field>
        <Field label="Catégories" hint="Aucune = toutes. Sous-catégories non incluses."><select name="categoryIds" multiple size={5} className="ui-input !h-auto">{data.categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></Field>
        <Field label="Marques" hint="Aucune = toutes."><select name="brandIds" multiple size={5} className="ui-input !h-auto">{data.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></Field>
        <div className="grid gap-4">
          <Field label="Groupe de clients"><select name="customerGroupId" className="ui-input"><option value="">Tous les clients</option>{data.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
          <Field label="Pays (code ISO)"><input name="countryCode" maxLength={2} placeholder="Tous" className="ui-input"/></Field>
        </div>
        <Field label="Du"><input name="dateFrom" type="date" className="ui-input"/></Field>
        <Field label="Au"><input name="dateTo" type="date" className="ui-input"/></Field>
        <div className="md:col-span-3"><button className="ui-button ui-button-primary">Créer la règle</button></div>
      </form>
    </Card>
  </>;
}
