import { Store } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader } from "@/components/admin/page";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";
type Shop = { id: string; code: string; name: string; domain: string | null; isDefault: boolean; isActive: boolean; assignedEmployees?: number };

export default async function ShopsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("shops.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Configuration", "Boutiques"]} title="Boutiques" subtitle="Chaque boutique a ses paramètres, ses tickets et ses employés attribués ; elle est choisie par son domaine. La boutique par défaut ne peut pas être désactivée."/>;
  let data: { current: string; shops: Shop[] };
  try { data = await adminApi("GET", "/admin/shops"); } catch (error) { return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>; }
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <div className="mb-5 grid gap-4">{data.shops.map((shop) => <Card key={shop.id} className="p-5">
      <form action={actions.updateShopAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="shopId" value={shop.id}/><input type="hidden" name="do" value="save"/>
        <Field label="Nom"><input name="name" defaultValue={shop.name} required minLength={2} maxLength={160} className="ui-input"/></Field>
        <Field label="Domaine"><input name="domain" defaultValue={shop.domain ?? ""} placeholder="boutique.exemple.ci" className="ui-input"/></Field>
        <div className="flex items-end"><button className="ui-button ui-button-outline">Enregistrer</button></div>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="font-mono text-slate-500">{shop.code}</span>
        {shop.isDefault && <Badge tone="orange">Par défaut</Badge>}{shop.isActive ? <Badge>Active</Badge> : <Badge tone="warning">Désactivée</Badge>}
        {shop.assignedEmployees !== undefined && <span className="text-slate-500">{shop.assignedEmployees} employé(s) attribué(s)</span>}
        {!shop.isDefault && <form action={actions.updateShopAction}><input type="hidden" name="shopId" value={shop.id}/><input type="hidden" name="do" value="default"/><button className="font-semibold hover:underline">Définir par défaut</button></form>}
        {!shop.isDefault && <form action={actions.updateShopAction}><input type="hidden" name="shopId" value={shop.id}/><input type="hidden" name="do" value="toggle"/><input type="hidden" name="isActive" value={String(shop.isActive)}/><button className="font-semibold hover:underline">{shop.isActive ? "Désactiver" : "Activer"}</button></form>}
      </div>
    </Card>)}</div>
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-950"><Store size={17}/> Nouvelle boutique</h2>
      <form action={actions.createShopAction} className="grid gap-4 md:grid-cols-4">
        <Field label="Code"><input name="code" required pattern="[a-z0-9-]{2,40}" placeholder="ci-pro" className="ui-input"/></Field>
        <Field label="Nom"><input name="name" required minLength={2} maxLength={160} className="ui-input"/></Field>
        <Field label="Domaine"><input name="domain" placeholder="pro.mybigmarket.ci" className="ui-input"/></Field>
        <Field label="Recopier les paramètres de"><select name="copySettingsFrom" className="ui-input"><option value="">Aucune</option>{data.shops.map((shop) => <option key={shop.code} value={shop.code}>{shop.name}</option>)}</select></Field>
        <div className="md:col-span-4"><button className="ui-button ui-button-primary">Créer la boutique</button></div>
      </form>
    </Card>
  </>;
}
