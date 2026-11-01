import type { AttributeRow, LeadTimeRow } from "@/lib/product-detail-data";
import { formatAmount, formatTierRange } from "./format";

/**
 * Tableau des caractéristiques : 4 colonnes, 2 paires libellé/valeur par ligne.
 *
 * Les caractéristiques viennent de `product_attributes` dans l'ordre saisi par
 * l'admin. Le tableau se construit par paires : si le nombre est impair, la
 * dernière ligne est complétée par une cellule vide — jamais par une valeur
 * répétée ou inventée.
 */
export function AttributesTable({ attributes }: { attributes: AttributeRow[] }) {
  if (attributes.length === 0) return null;

  const pairs: Array<[AttributeRow | null, AttributeRow | null]> = [];
  for (let index = 0; index < attributes.length; index += 2) {
    pairs.push([attributes[index] ?? null, attributes[index + 1] ?? null]);
  }

  return <table className="b2b-attrs-table">
    <caption className="sr-only">Caractéristiques du produit</caption>
    <tbody>
      {pairs.map(([left, right], index) => <tr key={index}>
        <th scope="row">{left?.name ?? ""}</th>
        <td>{left?.value ?? ""}</td>
        <th scope="row">{right?.name ?? ""}</th>
        <td>{right?.value ?? ""}</td>
      </tr>)}
    </tbody>
  </table>;
}

/** Emballage : unités de vente, dimensions, poids brut. */
export function PackagingTable({
  packaging,
}: {
  packaging: { unitsPerSale: number; lengthCm: string; widthCm: string; heightCm: string; grossWeightKg: string; fragile: boolean } | null;
}) {
  if (!packaging) return null;
  const dimensions = `${packaging.lengthCm} × ${packaging.widthCm} × ${packaging.heightCm} cm`;
  return <table className="b2b-attrs-table">
    <caption className="sr-only">Emballage et livraison</caption>
    <thead><tr><th scope="col">Unités de vente</th><th scope="col">Taille du paquet</th><th scope="col">Poids brut</th></tr></thead>
    <tbody><tr>
      <td>{formatAmount(packaging.unitsPerSale)} pièce{packaging.unitsPerSale > 1 ? "s" : ""}</td>
      <td>{dimensions}</td>
      <td>{packaging.grossWeightKg} kg{packaging.fragile ? " · fragile" : ""}</td>
    </tr></tbody>
  </table>;
}

/** Délais de préparation : accordéon avec un tableau à deux colonnes. */
export function LeadTimeTable({ leadTimes, open, onToggle }: { leadTimes: LeadTimeRow[]; open: boolean; onToggle: () => void }) {
  if (leadTimes.length === 0) return null;
  return <section className="b2b-accordion">
    <button type="button" aria-expanded={open} onClick={onToggle}>
      Délai de préparation de la commande
      <span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open && <table className="b2b-attrs-table">
      <thead><tr><th scope="col">Quantité (pièce)</th><th scope="col">Durée estimée (jours)</th></tr></thead>
      <tbody>
        {leadTimes.map((row) => <tr key={`${row.minimumQuantity}-${row.maximumQuantity ?? "plus"}`}>
          <td>{formatTierRange(row.minimumQuantity, row.maximumQuantity)}</td>
          <td>{row.negotiable ? "À négocier" : row.preparationDays !== null ? `${row.preparationDays}` : "À confirmer"}</td>
        </tr>)}
      </tbody>
    </table>}
  </section>;
}
