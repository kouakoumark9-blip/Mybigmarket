import type { AttributeRow } from "@/lib/product-detail-data";

/**
 * Bloc « Caractéristiques clés » : grille 3 × 2 séparée par des filets.
 *
 * Les six cases sont choisies dans l'admin (table product_key_attributes) : la
 * fiche affiche ce qui a été sélectionné, dans l'ordre voulu, et complète avec
 * les premières caractéristiques si l'admin en a coché moins de six. Jamais de
 * valeur inventée, jamais de case vide décorative.
 */
export function KeyAttributes({ attributes, keyNames }: { attributes: AttributeRow[]; keyNames: string[] }) {
  const ordered: AttributeRow[] = [];
  for (const name of keyNames) {
    const found = attributes.find((attribute) => attribute.name === name);
    if (found) ordered.push(found);
  }
  for (const attribute of attributes) {
    if (ordered.length >= 6) break;
    if (!ordered.includes(attribute)) ordered.push(attribute);
  }
  const cells = ordered.slice(0, 6);
  if (cells.length === 0) return null;

  return <section className="b2b-key-attrs" aria-label="Caractéristiques clés">
    {cells.map((cell) => <div key={cell.name}>
      <span>{cell.name}</span>
      <b>{cell.value}</b>
    </div>)}
  </section>;
}
