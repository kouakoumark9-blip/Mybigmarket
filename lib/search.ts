/**
 * Normalisation de recherche partagée par la boutique (filtre côté navigateur) et le serveur
 * (requête plein texte) : minuscules, sans accents ni ligatures, mots séparés.
 * « Téléphone », « telephone » et « TÉLÉPHONE » donnent la même chose.
 */

const LIGATURES: Record<string, string> = { "œ": "oe", "æ": "ae", "ß": "ss", "ø": "o", "ł": "l", "đ": "d" };

/** Texte comparable : décomposition Unicode, suppression des accents, ligatures dépliées, espaces réduits. */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[œæßøłđ]/g, (char) => LIGATURES[char] ?? char)
    .replace(/\s+/g, " ")
    .trim();
}

/** Mots de la requête (lettres et chiffres seulement), sans doublon, au plus 8. */
export function searchTokens(query: string): string[] {
  const words = foldText(query).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0).map((word) => word.slice(0, 40));
  return Array.from(new Set(words)).slice(0, 8);
}

/** Vrai si chaque mot de la requête figure dans le texte (début, milieu ou fin de mot). */
export function matchesSearch(haystack: string, query: string): boolean {
  const tokens = searchTokens(query);
  if (!tokens.length) return true;
  const folded = foldText(haystack);
  return tokens.every((token) => folded.includes(token));
}

/**
 * Expression tsquery préfixée (« chaus:* & sport:* ») construite à partir des seuls mots alphanumériques :
 * aucun opérateur saisi par le client n'arrive à PostgreSQL. Chaîne vide si rien d'exploitable.
 */
export function prefixTsQuery(tokens: string[]): string {
  return tokens.map((token) => `${token}:*`).join(" & ");
}
