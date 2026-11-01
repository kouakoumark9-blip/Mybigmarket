import Link from "next/link";

/**
 * « Recherches similaires » : pilules menant vers la recherche filtrée.
 *
 * Les mots-clés viennent de `product_keywords` (saisis dans l'admin). Aucun
 * n'est généré automatiquement : une recherche suggérée qui ne renvoie rien est
 * une mauvaise expérience, donc on n'affiche que ce qui a été décidé.
 */
export function SimilarSearches({ keywords }: { keywords: string[] }) {
  const unique = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))];
  if (unique.length === 0) return null;

  return <section className="b2b-similar" aria-label="Recherches similaires">
    <h2>Recherches similaires</h2>
    <ul>
      {unique.map((keyword) => <li key={keyword}>
        <Link href={`/produits?q=${encodeURIComponent(keyword)}`}>{keyword}</Link>
      </li>)}
    </ul>
  </section>;
}
