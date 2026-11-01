import Link from "next/link";
import { RatingStars } from "./RatingStars";
import { formatRating } from "./format";

/**
 * Titre + notation.
 *
 * Règle stricte : aucun avis en base = « Aucun avis », jamais « 0 avis » ni une
 * note inventée. Le nombre de ventes n'est affiché que s'il est réel (il vient
 * des commandes payées), donc l'appelant passe `soldCount: null` s'il ne l'a pas.
 */
export function ProductTitleRating({
  title,
  reviewAverage,
  reviewCount,
  soldCount,
}: {
  title: string;
  reviewAverage: number | null;
  reviewCount: number;
  soldCount: number | null;
}) {
  const rating = formatRating(reviewAverage);

  return <div className="b2b-title-block">
    <h1 className="b2b-title">{title}</h1>
    <div className="b2b-rating-line">
      {reviewCount > 0 && rating !== null ? <>
        <RatingStars rating={reviewAverage ?? 0} />
        <b className="b2b-rating-value">{rating}</b>
        <Link href="#avis" className="b2b-underline">({reviewCount} avis)</Link>
      </> : <span className="b2b-muted">Aucun avis</span>}
      {soldCount !== null && soldCount > 0 && <>
        <span className="b2b-divider" aria-hidden="true">|</span>
        <span className="b2b-muted">{soldCount} vendus</span>
      </>}
    </div>
  </div>;
}
