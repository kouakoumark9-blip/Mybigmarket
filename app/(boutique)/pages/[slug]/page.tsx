import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { PageBlocks, type RenderedBlock } from "@/components/cms/page-blocks";
import { db } from "@/server/core/db";
import { publicPage, resolveRedirect } from "@/server/modules/cms/service";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

/** Page CMS publiée ; base absente ou non migrée : page introuvable classique. */
async function load(slug: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await publicPage(db(), slug, { customerId: null });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) return { title: "Page introuvable", robots: { index: false } };
  return { title: page.metaTitle || page.title, description: page.metaDescription || page.excerpt || undefined, alternates: { canonical: `/pages/${page.slug}` } };
}

export default async function CmsPage({ params }: Props) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) {
    const target = process.env.DATABASE_URL ? await resolveRedirect(db(), `/pages/${slug}`).catch(() => null) : null;
    if (target) (target.permanent ? permanentRedirect : redirect)(target.location);
    notFound();
  }
  return <main className="shell page-space"><h1 className="page-title">{page.title}</h1><article className="legal-panel"><PageBlocks blocks={page.blocks as RenderedBlock[]}/></article></main>;
}
