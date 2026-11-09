import { ImportForm } from "@/components/gestion/import-form";
import { CSV_COLUMNS } from "@/lib/gestion/import";

export default function ImportPage() {
  return <>
    <h1>Import de produits (CSV)</h1>
    <div className="gs-card">
      <p>Chaque ligne du fichier crée un produit. Les photos ne sont pas importées : ajoutez-les ensuite fiche par fiche. Aucun texte ni photo n&apos;est récupéré automatiquement sur Alibaba.</p>
      <p><a className="gs-btn gs-btn--ghost" href="/gestion/import/modele" download>Télécharger le modèle CSV</a></p>
      <p><b>Colonnes :</b> {CSV_COLUMNS.join(", ")}.</p>
      <ul>
        <li><b>categorie</b> : adresse de la catégorie, par exemple <code>climatiseurs/split</code> ou <code>electrogene</code>.</li>
        <li><b>disponibilite</b> : <code>stock</code> (en stock à Abidjan) ou <code>commande</code> (avec <b>delai_jours</b>).</li>
        <li><b>caracteristiques</b> : séparées par <code>|</code>, par exemple <code>Puissance : 9 000 BTU|Garantie : 1 an</code>.</li>
        <li><b>publie</b> : <code>oui</code> (par défaut) ou <code>non</code> pour un brouillon.</li>
        <li>Colonnes obligatoires : nom, categorie, prix, description. Séparateur ; ou , (le plus simple : enregistrer depuis Excel en « CSV »).</li>
      </ul>
    </div>
    <ImportForm/>
  </>;
}
