/* eslint-disable @next/next/no-img-element -- images CMS hébergées sur des domaines quelconques : next/image exige une liste d'hôtes. */
/**
 * Rendu des blocs d'une page CMS (étape 6). Le texte passe par `parseText` : aucun HTML saisi n'est
 * jamais injecté, les liens sont filtrés (chemins internes, https, mailto, tel).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { parseText, type InlineNode } from "@/lib/cms/blocks";

type ProductItem = { id: string; title: string; slug: string; cover: { url: string; alt: string | null } | null; price: { unitPriceInclTaxXof?: number } | null };
type BannerItem = { id: string; imageUrl: string; alt: string; targetUrl: string | null };
type FormDefinition = { code: string; title: string; description: string; fields: Array<{ name: string; label: string; type: string; required: boolean; options?: string[] }> } | null;
export type RenderedBlock = { type: string; [key: string]: unknown };

const formatXof = (value: number) => `${new Intl.NumberFormat("fr-FR").format(value)} FCFA`;

function SmartLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return href.startsWith("/") ? <Link href={href} className={className}>{children}</Link> : <a href={href} className={className} rel="noopener noreferrer" target={href.startsWith("https://") ? "_blank" : undefined}>{children}</a>;
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return <>{nodes.map((node, index) => {
    let content: ReactNode = node.text;
    if (node.bold) content = <strong>{content}</strong>;
    if (node.italic) content = <em>{content}</em>;
    if (node.href) content = <SmartLink href={node.href} className="text-primary underline">{content}</SmartLink>;
    return <span key={index}>{content}</span>;
  })}</>;
}

function RichText({ text }: { text: string }) {
  return <>{parseText(text).map((node, index) => node.kind === "list"
    ? <ul key={index} className="my-3 list-disc space-y-1 pl-6">{node.items.map((item, itemIndex) => <li key={itemIndex}><Inline nodes={item}/></li>)}</ul>
    : <p key={index} className="my-3 leading-relaxed"><Inline nodes={node.content}/></p>)}</>;
}

function priceOf(item: ProductItem) {
  const value = item.price?.unitPriceInclTaxXof;
  return typeof value === "number" ? formatXof(value) : null;
}

export function PageBlocks({ blocks }: { blocks: RenderedBlock[] }) {
  return <>{blocks.map((block, index) => {
    switch (block.type) {
      case "heading":
        return block.level === 3 ? <h3 key={index} className="mt-8 text-lg font-bold">{String(block.text)}</h3> : <h2 key={index} className="mt-10 text-2xl font-bold">{String(block.text)}</h2>;
      case "text":
        return <div key={index}><RichText text={String(block.text)}/></div>;
      case "image": {
        const image = <figure className="my-6"><img src={String(block.url)} alt={String(block.alt ?? "")} className="h-auto w-full rounded-lg" loading="lazy"/>{block.caption ? <figcaption className="mt-2 text-sm opacity-70">{String(block.caption)}</figcaption> : null}</figure>;
        return block.href ? <SmartLink key={index} href={String(block.href)}>{image}</SmartLink> : <div key={index}>{image}</div>;
      }
      case "cta":
        return <section key={index} className="my-8 rounded-lg border border-primary p-6"><h2 className="text-xl font-bold">{String(block.title)}</h2>{block.text ? <p className="my-2">{String(block.text)}</p> : null}<SmartLink href={String(block.href)} className="button button-primary mt-3 inline-block">{String(block.label)}</SmartLink></section>;
      case "faq":
        return <section key={index} className="my-8">{block.title ? <h2 className="mb-3 text-2xl font-bold">{String(block.title)}</h2> : null}{(block.items as Array<{ question: string; answer: string }>).map((item, itemIndex) => <details key={itemIndex} className="border-b py-3"><summary className="cursor-pointer font-semibold">{item.question}</summary><RichText text={item.answer}/></details>)}</section>;
      case "columns":
        return <div key={index} className="my-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{(block.columns as Array<{ title: string; text: string }>).map((column, columnIndex) => <div key={columnIndex}><h3 className="text-lg font-bold">{column.title}</h3><RichText text={column.text}/></div>)}</div>;
      case "products": {
        const items = (block.items as ProductItem[] | undefined) ?? [];
        if (!items.length) return null;
        return <section key={index} className="my-8">{block.title ? <h2 className="mb-4 text-2xl font-bold">{String(block.title)}</h2> : null}<div className="grid grid-cols-2 gap-4 md:grid-cols-4">{items.map((item) => <Link key={item.id} href={`/produits/${item.slug}`} className="block rounded-lg border p-3 hover:border-primary">{item.cover ? <img src={item.cover.url} alt={item.cover.alt ?? item.title} className="mb-2 aspect-square w-full rounded object-cover" loading="lazy"/> : null}<span className="block text-sm font-semibold">{item.title}</span>{priceOf(item) ? <span className="text-sm text-primary">{priceOf(item)}</span> : null}</Link>)}</div></section>;
      }
      case "banners": {
        const items = (block.items as BannerItem[] | undefined) ?? [];
        return <div key={index} className="my-6 grid gap-4">{items.map((banner) => { const image = <img src={banner.imageUrl} alt={banner.alt} className="h-auto w-full rounded-lg" loading="lazy"/>; return banner.targetUrl ? <SmartLink key={banner.id} href={banner.targetUrl}>{image}</SmartLink> : <div key={banner.id}>{image}</div>; })}</div>;
      }
      case "video":
        return <div key={index} className="my-6 aspect-video w-full overflow-hidden rounded-lg"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(String(block.videoId))}`} title={String(block.title)} loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>;
      case "form": {
        const form = block.form as FormDefinition;
        if (!form) return null;
        return <section key={index} className="my-8 rounded-lg border p-6"><h2 className="text-xl font-bold">{form.title}</h2>{form.description ? <p className="my-2">{form.description}</p> : null}<p className="text-sm opacity-70">Formulaire disponible via <code>/api/v1/shop/forms/{form.code}</code> ; contactez-nous aussi par e-mail.</p></section>;
      }
      default:
        return null;
    }
  })}</>;
}
