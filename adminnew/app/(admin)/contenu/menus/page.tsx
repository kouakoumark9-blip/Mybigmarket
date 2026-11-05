import { Card } from "@/components/ui/card";
import { ApiUnavailable, Field, Notice, PageHeader } from "@/components/admin/page";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import { saveMenuAction } from "./actions";

export const dynamic = "force-dynamic";
type MenuItem = { label: string; target: string; href?: string | null; children: MenuItem[] };
type Menu = { code: string; name: string; isActive: boolean; items: MenuItem[] };
const toText = (items: MenuItem[]) => items.flatMap((item) => [`${item.label} | ${item.href ?? item.target}`, ...item.children.map((child) => `  ${child.label} | ${child.href ?? child.target}`)]).join("\n");

export default async function MenusPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("appearance.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Boutique", "Menus"]} title="Menus du site" subtitle="Une ligne par lien : « Libellé | /adresse ». Deux espaces en début de ligne pour un sous-lien. Les liens externes doivent commencer par https://."/>;
  let menus: Menu[];
  try { menus = await adminApi<Menu[]>("GET", "/admin/menus"); } catch (error) { return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>; }
  const forms = [...menus, ...(menus.some((menu) => menu.code === "footer") ? [] : [{ code: "footer", name: "Pied de page", isActive: true, items: [] }]), ...(menus.some((menu) => menu.code === "header") ? [] : [{ code: "header", name: "En-tête", isActive: true, items: [] }])];
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <div className="grid gap-5 lg:grid-cols-2">{forms.map((menu) => <Card key={menu.code} className="p-5">
      <form action={saveMenuAction} className="grid gap-3">
        <input type="hidden" name="code" value={menu.code}/>
        <div className="flex items-center gap-3"><span className="font-mono text-xs text-slate-500">{menu.code}</span><label className="ml-auto flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="isActive" defaultChecked={menu.isActive}/> Affiché</label></div>
        <Field label="Nom"><input name="name" defaultValue={menu.name} required minLength={2} maxLength={120} className="ui-input"/></Field>
        <Field label="Liens"><textarea name="items" defaultValue={toText(menu.items)} rows={9} placeholder={"Catalogue | /produits\n  Électronique | /produits?categorie=electronique\nConditions | /conditions"} className="ui-input !h-auto py-2 font-mono text-[13px]"/></Field>
        <div><button className="ui-button ui-button-primary">Enregistrer le menu</button></div>
      </form>
    </Card>)}</div>
  </>;
}
