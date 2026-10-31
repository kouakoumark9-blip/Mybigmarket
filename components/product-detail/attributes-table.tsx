import { Fragment } from "react";
import { ChevronDown } from "lucide-react";
import type { DetailedProduct } from "@/lib/product";

export function AttributesTable({ product }: { product: DetailedProduct }) {
  const pairedRows = Array.from({ length: Math.ceil(product.attributes.length / 2) }, (_, index) => [product.attributes[index * 2], product.attributes[index * 2 + 1]].filter((item): item is NonNullable<typeof item> => Boolean(item)));
  return <section className="pdp-attributes-section" id="pdp-attributes" aria-labelledby="pdp-attributes-title">
    <div className="pdp-section-heading"><div><span className="pdp-eyebrow">FICHE TECHNIQUE · EXEMPLE</span><h2 id="pdp-attributes-title">Caractéristiques du produit</h2></div><span className="pdp-demo-tag">Données à confirmer</span></div>
    <div className="pdp-table-scroll"><table className="pdp-attributes-table"><tbody>{pairedRows.map((row, index) => <tr key={index}>{row.map((attribute) => <Fragment key={attribute.label}><th scope="row">{attribute.label}</th><td>{attribute.value}</td></Fragment>)}{row.length === 1 && <td colSpan={2}/>}</tr>)}</tbody></table></div>
    <h3 className="pdp-subsection-title">Emballage et livraison</h3>
    <div className="pdp-table-scroll"><table className="pdp-attributes-table pdp-package-table"><tbody>{product.packageAttributes.map((attribute) => <tr key={attribute.label}><th scope="row">{attribute.label}</th><td>{attribute.value}</td></tr>)}</tbody></table></div>
    <details className="pdp-preparation-accordion">
      <summary><span>Délai de préparation de la commande</span><ChevronDown size={18}/></summary>
      <div className="pdp-table-scroll"><table className="pdp-preparation-table"><thead><tr><th>Quantité (pièces)</th>{product.preparationBands.map((band) => <th key={band.quantity}>{band.quantity}</th>)}</tr></thead><tbody><tr><th scope="row">Durée estimée</th>{product.preparationBands.map((band) => <td key={band.quantity}>{band.days}</td>)}</tr></tbody></table></div>
      <p>Délais illustratifs uniquement; confirmation nécessaire auprès du fournisseur.</p>
    </details>
  </section>;
}
