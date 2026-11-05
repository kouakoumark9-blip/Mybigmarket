import { Images } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";
type Banner = { id: number; name: string; imageUrl: string; alt: string; targetUrl: string | null; placement: string; startsAt: string | null; endsAt: string | null; sortOrder: number; isActive: boolean };

export default async function BannersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("appearance.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Boutique", "Bannières"]} title="Bannières" subtitle="Visuels promotionnels par emplacement, avec période d’affichage facultative."/>;
  let banners: Banner[];
  try { banners = await adminApi<Banner[]>("GET", "/admin/banners"); } catch (error) { return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>; }
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <Card className="mb-5">
      {banners.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[900px]"><thead><tr><th>Visuel</th><th>Nom</th><th>Emplacement</th><th>Période</th><th>Statut</th><th></th></tr></thead><tbody>{banners.map((banner) => <tr key={banner.id}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <td><img src={banner.imageUrl} alt={banner.alt} className="h-12 w-24 rounded object-cover"/></td>
        <td className="font-semibold">{banner.name}{banner.targetUrl && <div className="font-mono text-[11px] font-normal text-slate-500">{banner.targetUrl}</div>}</td>
        <td className="font-mono text-xs">{banner.placement}</td>
        <td className="text-xs">{banner.startsAt || banner.endsAt ? `${formatDate(banner.startsAt)} → ${formatDate(banner.endsAt)}` : "Permanente"}</td>
        <td>{banner.isActive ? <Badge tone="orange">Active</Badge> : <Badge>Inactive</Badge>}</td>
        <td><div className="flex gap-3">
          <form action={actions.toggleBannerAction}><input type="hidden" name="bannerId" value={banner.id}/><input type="hidden" name="isActive" value={String(banner.isActive)}/><button className="text-xs font-semibold hover:underline">{banner.isActive ? "Désactiver" : "Activer"}</button></form>
          <form action={actions.deleteBannerAction}><input type="hidden" name="bannerId" value={banner.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form>
        </div></td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><Images size={22} className="mb-2 text-slate-400"/><strong>Aucune bannière</strong>Ajoutez-en une ci-dessous.</div>}
    </Card>
    <Card className="p-5">
      <h2 className="mb-4 font-bold text-slate-950">Nouvelle bannière</h2>
      <form action={actions.createBannerAction} className="grid gap-4 md:grid-cols-3">
        <Field label="Nom"><input name="name" required minLength={2} maxLength={120} className="ui-input"/></Field>
        <Field label="Image (URL https)"><input name="imageUrl" type="url" required className="ui-input"/></Field>
        <Field label="Texte alternatif"><input name="alt" required minLength={2} maxLength={190} className="ui-input"/></Field>
        <Field label="Lien au clic"><input name="targetUrl" placeholder="/produits ou https://…" className="ui-input"/></Field>
        <Field label="Emplacement"><input name="placement" defaultValue="home" pattern="[a-z0-9_-]{2,40}" className="ui-input"/></Field>
        <Field label="Ordre"><input name="sortOrder" type="number" min={0} defaultValue={0} className="ui-input"/></Field>
        <Field label="Début"><input name="startsAt" type="date" className="ui-input"/></Field>
        <Field label="Fin"><input name="endsAt" type="date" className="ui-input"/></Field>
        <div className="flex items-end"><button className="ui-button ui-button-primary">Ajouter la bannière</button></div>
      </form>
    </Card>
  </>;
}
