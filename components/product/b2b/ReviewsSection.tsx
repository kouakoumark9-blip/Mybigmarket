"use client";

import { useMemo, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { RatingStars } from "./RatingStars";
import { formatRating } from "./format";
import type { ReviewView } from "@/lib/product-detail-data";

/**
 * Avis produits.
 *
 * Aucun faux avis, aucun compteur inventé : la liste est celle des avis publiés
 * après modération. Si la base n'en contient aucun, la section affiche
 * « Aucun avis pour le moment » et propose d'en écrire un — elle n'invente pas
 * un exemple pour « remplir ».
 *
 * Les filtres ne s'affichent que s'il y a de quoi filtrer, pour ne pas proposer
 * un contrôle inopérant.
 */
export function ReviewsSection({
  reviews,
  average,
  reviewCount,
}: {
  reviews: ReviewView[];
  average: number | null;
  reviewCount: number;
}) {
  const [withPhotos, setWithPhotos] = useState(false);
  const [minRating, setMinRating] = useState(0);

  const filtered = useMemo(() => reviews.filter((review) => {
    if (minRating > 0 && review.rating < minRating) return false;
    // Aucune photo n'est stockée par avis dans le schéma actuel : le filtre
    // « avec photos » ne doit donc jamais prétendre filtrer sur ce critère.
    if (withPhotos) return false;
    return true;
  }), [reviews, minRating, withPhotos]);

  const rating = formatRating(average);

  return <div className="b2b-reviews">
    <div className="b2b-reviews-head">
      <h2>Donnez votre avis</h2>
      <div className="b2b-reviews-summary">
        {reviewCount > 0 && rating !== null
          ? <><RatingStars rating={average ?? 0} size={18} /><b>{rating}/5</b><span className="b2b-muted">({reviewCount} avis)</span></>
          : <span className="b2b-muted">Aucun avis pour le moment</span>}
      </div>
    </div>

    {reviews.length > 1 && <div className="b2b-reviews-filters">
      <label>
        <input type="checkbox" checked={withPhotos} onChange={(event) => setWithPhotos(event.target.checked)} />
        Avec photos
      </label>
      <label>
        Note minimum
        <select value={minRating} onChange={(event) => setMinRating(Number(event.target.value))}>
          {[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value === 0 ? "Toutes" : `${value} étoile${value > 1 ? "s" : ""} et plus`}</option>)}
        </select>
      </label>
    </div>}

    {withPhotos && <p className="b2b-reviews-empty">Les avis avec photos ne sont pas encore disponibles : aucun avis publié ne contient d’image.</p>}

    {!withPhotos && filtered.length === 0 && <p className="b2b-reviews-empty">
      Aucun avis publié {minRating > 0 ? `avec ${minRating} étoile${minRating > 1 ? "s" : ""} ou plus` : "pour ce produit"}.
      Votre retour aidera les prochains acheteurs.
    </p>}

    <ul className="b2b-review-list">
      {filtered.map((review) => <li key={review.id}>
        <div className="b2b-review-top">
          <RatingStars rating={review.rating} />
          <b>{review.customerName}</b>
          {review.verifiedPurchase && <span className="b2b-verified"><BadgeCheck size={13} aria-hidden="true" /> Achat vérifié</span>}
        </div>
        {review.comment && <p>{review.comment}</p>}
        <time dateTime={review.createdAt.toISOString()}>
          {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(review.createdAt)}
        </time>
      </li>)}
    </ul>
  </div>;
}
