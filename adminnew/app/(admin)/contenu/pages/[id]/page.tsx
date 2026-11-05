import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Notice, PageHeader } from "@/components/admin/page";
import { adminApi, apiBaseUrl, apiErrorMessage } from "@/lib/admin-api";
import { advancedBlocks, blocksToText, type Block } from "@/lib/cms-text";
import { requireEmployee } from "@/lib/permissions";
import { deletePageAction, updatePageAction } from "../actions";
import { PageForm } from "../page-form";

export const dynamic = "force-dynamic";
type CmsPage = { id: string; slug: string; title: string; excerpt: string | null; status: string; blocks: Block[]; metaTitle: string | null; metaDescription: string | null; url: string };

export default async function EditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("appearance.read");
  const { id } = await params;
  const notice = await searchParams;
  let page: CmsPage;
  try { page = await adminApi<CmsPage>("GET", `/admin/pages/${id}`); } catch (error) { return <><PageHeader trail={["Boutique", "Pages"]} title="Page"/><ApiUnavailable message={apiErrorMessage(error)}/></>; }
  const advanced = advancedBlocks(page.blocks);
  return <>
    <PageHeader trail={["Boutique", "Pages", page.title]} title={page.title} actions={<><Link href="/contenu/pages" className="ui-button ui-button-outline"><ArrowLeft size={15}/> Toutes les pages</Link>{page.status === "published" && <a href={`${apiBaseUrl()}${page.url}`} target="_blank" rel="noreferrer" className="ui-button ui-button-outline"><ExternalLink size={15}/> Voir</a>}</>}/>
    <Notice ok={notice.ok} error={notice.error}/>
    <Card className="mb-5 p-5"><PageForm page={{ ...page, content: blocksToText(page.blocks), advanced: advanced.length ? JSON.stringify(advanced, null, 2) : "" }} action={updatePageAction} submitLabel="Enregistrer"/></Card>
    <form action={deletePageAction}><input type="hidden" name="pageId" value={page.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Supprimer cette page</button></form>
  </>;
}
