import Link from "next/link";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApiList, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import { createPageAction } from "./actions";
import { PageForm } from "./page-form";

export const dynamic = "force-dynamic";
type CmsPage = { id: string; slug: string; title: string; status: string; url: string; updatedAt: string; publishedAt: string | null };

export default async function PagesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("appearance.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Boutique", "Pages"]} title="Pages du site" subtitle="Pages d’information (à propos, livraison, FAQ…) composées de blocs : aucun HTML libre, rendu sûr sur la boutique."/>;
  let pages;
  try { pages = await adminApiList<CmsPage>("/admin/pages", { limit: 100, sort: "-updatedAt" }); } catch (error) { return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>; }
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <Card className="mb-5">
      {pages.data.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Page</th><th>Adresse</th><th>Statut</th><th>Modifiée</th></tr></thead><tbody>{pages.data.map((page) => <tr key={page.id}>
        <td><Link href={`/contenu/pages/${page.id}`} className="font-semibold hover:underline">{page.title}</Link></td>
        <td className="font-mono text-xs">{page.url}</td>
        <td>{page.status === "published" ? <Badge tone="orange">Publiée</Badge> : <Badge>Brouillon</Badge>}</td>
        <td className="text-xs">{formatDate(page.updatedAt)}</td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><FileText size={22} className="mb-2 text-slate-400"/><strong>Aucune page</strong>Créez la première ci-dessous.</div>}
    </Card>
    <Card className="p-5"><h2 className="mb-4 font-bold text-slate-950">Nouvelle page</h2><PageForm page={{ slug: "", title: "", excerpt: "", status: "draft", metaTitle: "", metaDescription: "", content: "", advanced: "" }} action={createPageAction} submitLabel="Créer la page"/></Card>
  </>;
}
