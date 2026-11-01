import { Star } from "lucide-react";

/**
 * Cinq étoiles avec demi-étoiles.
 *
 * Remplissage calculé par découpe : une étoile dont la fraction est ≥ 0,75 est
 * pleine, ≥ 0,25 est à moitié, sinon vide. Rendu en dégradé CSS plutôt qu'avec
 * deux icônes superposées : un seul nœud par étoile, et une couleur d'accent
 * unique héritée du thème.
 */
export function RatingStars({ rating, size = 15 }: { rating: number; size?: number }) {
  const clamped = Math.max(0, Math.min(5, rating));
  return <span className="b2b-stars" role="img" aria-label={`Note ${clamped.toFixed(1)} sur 5`}>
    {[0, 1, 2, 3, 4].map((position) => {
      const filled = Math.max(0, Math.min(1, clamped - position));
      const percent = Math.round(filled * 100);
      return <span key={position} className="b2b-star" style={{ width: size, height: size }}>
        <Star size={size} className="b2b-star-empty" aria-hidden="true" />
        <span className="b2b-star-fill" style={{ width: `${percent}%` }} aria-hidden="true">
          <Star size={size} fill="currentColor" />
        </span>
      </span>;
    })}
  </span>;
}
