/**
 * Squelette de la fiche produit.
 *
 * Les dimensions reprennent celles du rendu final (mêmes hauteurs de blocs, même
 * grille à trois colonnes) : l'arrivée du contenu ne déplace donc rien. C'est la
 * condition pour rester sous un CLS de 0,1 — un squelette plus court que le
 * contenu réel provoquerait exactement le saut qu'on cherche à éviter.
 */
export function ProductDetailSkeleton() {
  return <div className="b2b-product" aria-busy="true" aria-live="polite">
    <span className="sr-only">Chargement de la fiche produit…</span>
    <div className="b2b-grid">
      <div className="b2b-col-left">
        <div className="b2b-gallery">
          <div className="b2b-gallery-main b2b-skeleton" />
        </div>
        <div className="b2b-supplier b2b-skeleton" style={{ height: 148 }} />
      </div>
      <div className="b2b-col-center">
        <div className="b2b-skeleton" style={{ height: 30, width: "85%" }} />
        <div className="b2b-skeleton" style={{ height: 18, width: "40%", marginTop: 12 }} />
        <div className="b2b-skeleton" style={{ height: 76, marginTop: 20 }} />
        <div className="b2b-skeleton" style={{ height: 96, marginTop: 24 }} />
        <div className="b2b-skeleton" style={{ height: 132, marginTop: 24 }} />
      </div>
      <aside className="b2b-col-right">
        <div className="b2b-sticky">
          <div className="b2b-skeleton" style={{ height: 260 }} />
          <div className="b2b-skeleton" style={{ height: 196, marginTop: 16 }} />
        </div>
      </aside>
    </div>
  </div>;
}
