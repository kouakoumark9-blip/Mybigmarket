import { asc, desc } from "drizzle-orm";
import { Image as ImageIcon, PanelsTopLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminBanners, adminCmsPages } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const pageStatus: Record<string, string> = { draft: "Brouillon", published: "Publié", archived: "Archivé" };
const dateLabel = (date: Date | null) => date ? new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "—";

export default async function AppearancePage() {
  await requireEmployee("appearance.manage");
  const db = getAdminDb();
  const [pages, banners] = await Promise.all([
    db.select().from(adminCmsPages).orderBy(desc(adminCmsPages.updatedAt)).limit(100),
    db.select().from(adminBanners).orderBy(asc(adminBanners.isActive), asc(adminBanners.name)).limit(100),
  ]);

  return <>
    <div className="admin-breadcrumb"><span>Boutique</span><span>/</span><strong>Apparence et pages</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Apparence et pages</h1><p className="admin-page-subtitle">Pages éditoriales et bannières actuellement enregistrées.</p></div></div>
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card className="overflow-hidden"><div className="flex items-center gap-3 border-b border-slate-100 p-5"><PanelsTopLeft size={18} className="text-slate-600"/><div><h2 className="font-bold text-slate-950">Pages CMS</h2><p className="text-xs text-slate-500">{pages.length} page(s)</p></div></div>{pages.length ? <div className="divide-y divide-slate-100">{pages.map((page) => <div key={page.id} className="p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">{page.title}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${page.status === "published" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{pageStatus[page.status] || page.status}</span></div><p className="mt-1 text-xs text-slate-500">/{page.slug} · modifiée {dateLabel(page.updatedAt)}</p></div>)}</div> : <div className="admin-empty"><PanelsTopLeft size={21} className="mb-2 text-slate-400"/><strong>Aucune page CMS</strong>Les pages éditoriales créées apparaîtront ici.</div>}</Card>
      <Card className="overflow-hidden"><div className="flex items-center gap-3 border-b border-slate-100 p-5"><ImageIcon size={18} className="text-slate-600"/><div><h2 className="font-bold text-slate-950">Bannières</h2><p className="text-xs text-slate-500">{banners.length} élément(s)</p></div></div>{banners.length ? <div className="divide-y divide-slate-100">{banners.map((banner) => <div key={banner.id} className="flex items-start justify-between gap-3 p-4"><div><h3 className="font-semibold text-slate-900">{banner.name}</h3><p className="mt-1 text-xs text-slate-500">Texte alternatif : {banner.alt}</p><p className="mt-1 break-all text-[11px] text-slate-400">Cible : {banner.targetUrl || "aucune"}</p><p className="mt-1 text-[11px] text-slate-500">Période : {dateLabel(banner.startsAt)} – {dateLabel(banner.endsAt)}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${banner.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{banner.isActive ? "Active" : "Inactive"}</span></div>)}</div> : <div className="admin-empty"><ImageIcon size={21} className="mb-2 text-slate-400"/><strong>Aucune bannière</strong>Les bannières apparaîtront ici après leur création.</div>}</Card>
    </div>
    <p className="mt-4 text-xs text-slate-500">Cette vue est en lecture seule : la publication d’un contenu ou d’une bannière nécessite une validation dédiée avant sa mise en ligne.</p>
  </>;
}
