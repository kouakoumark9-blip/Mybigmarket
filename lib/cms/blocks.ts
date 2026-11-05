/**
 * Blocs de contenu des pages (étape 6). Aucun HTML libre : chaque bloc est validé, et le texte utilise
 * un balisage minimal (paragraphes séparés par une ligne vide, listes « - », **gras**, *italique*,
 * [lien](https://… ou /chemin)) transformé en nœuds, puis rendu en éléments React. Sûr par construction.
 */
import { z } from "zod";

/** Lien autorisé : chemin interne, https, mailto ou tel. Jamais javascript:, data:, ni //hôte. */
export function isSafeHref(value: string): boolean {
  const href = value.trim();
  if (href.startsWith("/")) return !href.startsWith("//") && !/[\s<>"]/.test(href);
  return /^https:\/\/[^\s<>"]+$/i.test(href) || /^mailto:[^\s<>"]+@[^\s<>"]+$/i.test(href) || /^tel:\+?[\d\s.-]{6,20}$/i.test(href);
}

const href = z.string().trim().min(1).max(500).refine(isSafeHref, "Lien invalide : chemin interne (/…), https://, mailto: ou tel:.");
const imageUrl = z.string().trim().min(1).max(1000).refine((value) => (value.startsWith("/") && !value.startsWith("//")) || /^https:\/\/[^\s<>"]+$/i.test(value), "Image : chemin interne ou URL https.");
const shortText = (max: number) => z.string().trim().max(max);

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: shortText(200).min(1), level: z.union([z.literal(2), z.literal(3)]).default(2) }).strict(),
  z.object({ type: z.literal("text"), text: z.string().max(20_000) }).strict(),
  z.object({ type: z.literal("image"), url: imageUrl, alt: shortText(200), caption: shortText(300).optional(), href: href.optional() }).strict(),
  z.object({ type: z.literal("cta"), title: shortText(160).min(1), text: shortText(600).optional(), label: shortText(60).min(1), href }).strict(),
  z.object({ type: z.literal("faq"), title: shortText(160).optional(), items: z.array(z.object({ question: shortText(300).min(1), answer: z.string().max(4000) }).strict()).min(1).max(50) }).strict(),
  z.object({ type: z.literal("columns"), columns: z.array(z.object({ title: shortText(120).min(1), text: z.string().max(2000) }).strict()).min(2).max(4) }).strict(),
  z.object({ type: z.literal("products"), title: shortText(160).optional(), productIds: z.array(z.string().uuid()).max(24).optional(), categorySlug: shortText(120).optional(), limit: z.number().int().min(1).max(24).default(8) }).strict()
    .refine((block) => Boolean(block.productIds?.length) !== Boolean(block.categorySlug), "Choisissez soit des produits, soit une catégorie."),
  z.object({ type: z.literal("banners"), placement: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/) }).strict(),
  z.object({ type: z.literal("video"), provider: z.literal("youtube"), videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/), title: shortText(160).min(1) }).strict(),
  z.object({ type: z.literal("form"), code: z.string().trim().regex(/^[a-z0-9_-]{2,60}$/) }).strict(),
]);

export type Block = z.infer<typeof blockSchema>;
export const blocksSchema = z.array(blockSchema).max(80);

/* ─────────────────────────────  Balisage minimal  ───────────────────────────── */

export type InlineNode = { text: string; bold?: boolean; italic?: boolean; href?: string };
export type TextNode = { kind: "paragraph"; content: InlineNode[] } | { kind: "list"; items: InlineNode[][] };

/** Le lien tolère un niveau de parenthèses dans l'URL, pour qu'un lien refusé ne laisse pas de « ) » orpheline. */
const INLINE = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index! > last) nodes.push({ text: text.slice(last, match.index) });
    if (match[1] !== undefined) nodes.push({ text: match[1], bold: true });
    else if (match[2] !== undefined) nodes.push({ text: match[2], italic: true });
    else if (isSafeHref(match[4])) nodes.push({ text: match[3], href: match[4] });
    else nodes.push({ text: match[3] });
    last = match.index! + match[0].length;
  }
  if (last < text.length) nodes.push({ text: text.slice(last) });
  return nodes.filter((node) => node.text.length > 0);
}

/** Texte → paragraphes et listes. */
export function parseText(text: string): TextNode[] {
  return text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean).map((chunk): TextNode => {
    const lines = chunk.split("\n");
    if (lines.every((line) => /^\s*[-•]\s+/.test(line))) return { kind: "list", items: lines.map((line) => parseInline(line.replace(/^\s*[-•]\s+/, ""))) };
    return { kind: "paragraph", content: parseInline(lines.join(" ")) };
  });
}

/** Texte brut d'un ensemble de blocs (résumé, recherche, aperçu). */
export function blocksPlainText(blocks: Block[]): string {
  return blocks.map((block) => {
    switch (block.type) {
      case "heading": return block.text;
      case "text": return block.text.replace(/\*\*|\*|\[([^\]]+)\]\((?:[^()\s]|\([^()\s]*\))+\)/g, "$1");
      case "cta": return `${block.title} ${block.text ?? ""}`;
      case "faq": return block.items.map((item) => `${item.question} ${item.answer}`).join(" ");
      case "columns": return block.columns.map((column) => `${column.title} ${column.text}`).join(" ");
      default: return "";
    }
  }).join(" ").replace(/\s+/g, " ").trim();
}
