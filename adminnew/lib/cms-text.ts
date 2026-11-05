/**
 * Édition simple des pages : texte ⇄ blocs.
 * « ## Titre » et « ### Sous-titre » deviennent des titres ; les paragraphes séparés par une ligne
 * vide deviennent des blocs de texte. Les autres blocs (images, FAQ, produits…) sont conservés tels quels.
 */
export type Block = { type: string; [key: string]: unknown };

const SIMPLE = new Set(["heading", "text"]);

export function blocksToText(blocks: Block[]): string {
  return blocks.filter((block) => SIMPLE.has(block.type)).map((block) => block.type === "heading" ? `${block.level === 3 ? "###" : "##"} ${block.text}` : String(block.text ?? "")).join("\n\n");
}

export function advancedBlocks(blocks: Block[]): Block[] {
  return blocks.filter((block) => !SIMPLE.has(block.type));
}

export function textToBlocks(text: string): Block[] {
  return text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const heading = /^(#{2,3})\s+(.+)$/.exec(part);
    return heading ? { type: "heading", level: heading[1].length, text: heading[2].trim().slice(0, 200) } : { type: "text", text: part };
  });
}
