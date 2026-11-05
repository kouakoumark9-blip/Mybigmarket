import { Signpost } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApiList, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";
type Redirect = { id: number; oldPath: string; newPath: string; statusCode: number; hits: number; lastHitAt: string | null; note: string | null; productId: string | null };

export default async function RedirectsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  await requireEmployee("seo.read");
  const params = await searchParams;
  const header = <PageHeader trail={["Boutique", "Redirections"]} title="Redirections" subtitle="Anciennes adresses renvoyées vers les nouvelles (301 permanente, 302 temporaire). Celles des produits renommés sont créées automatiquement."/>;
  let redirects;
  try { redirects = await adminApiList<Redirect>("/admin/redirects", { limit: 100, q: params.q || undefined, sort: "-hits" }); } catch (error) { return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>; }
  return <>
    {header}
    <Notice ok={params.ok} error={params.error}/>
    <form className="mb-4 flex gap-2" action="/contenu/redirections"><input name="q" defaultValue={params.q} placeholder="Rechercher une adresse" className="ui-input h-9 w-72"/><button className="ui-button ui-button-outline h-9">Rechercher</button></form>
    <Card className="mb-5">
      {redirects.data.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Ancienne adresse</th><th>Nouvelle adresse</th><th>Type</th><th>Utilisations</th><th></th></tr></thead><tbody>{redirects.data.map((redirect) => <tr key={redirect.id}>
        <td className="font-mono text-xs">{redirect.oldPath}{redirect.productId && <div className="font-sans text-[11px] text-slate-500">produit renommé</div>}</td>
        <td className="font-mono text-xs">{redirect.newPath}</td>
        <td><Badge>{redirect.statusCode}</Badge></td>
        <td className="text-xs">{redirect.hits}{redirect.lastHitAt ? ` · ${formatDate(redirect.lastHitAt)}` : ""}</td>
        <td><form action={actions.deleteRedirectAction}><input type="hidden" name="redirectId" value={redirect.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form></td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><Signpost size={22} className="mb-2 text-slate-400"/><strong>Aucune redirection</strong></div>}
    </Card>
    <Card className="p-5">
      <h2 className="mb-4 font-bold text-slate-950">Nouvelle redirection</h2>
      <form action={actions.createRedirectAction} className="grid gap-4 md:grid-cols-4">
        <Field label="Ancienne adresse"><input name="oldPath" required placeholder="/ancienne-page" className="ui-input"/></Field>
        <Field label="Nouvelle adresse"><input name="newPath" required placeholder="/nouvelle-page ou https://…" className="ui-input"/></Field>
        <Field label="Type"><select name="statusCode" className="ui-input"><option value="301">301 permanente</option><option value="302">302 temporaire</option></select></Field>
        <div className="flex items-end"><button className="ui-button ui-button-primary">Ajouter</button></div>
      </form>
    </Card>
  </>;
}
