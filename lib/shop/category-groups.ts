/**
 * Regroupement des sous-catégories sous des intertitres (menu et page de la catégorie).
 * Les adresses restent à deux niveaux (/lits/lits-1-place) : les groupes servent seulement à l'affichage.
 */
export const CATEGORY_GROUPS: Record<string, Array<{ title: string; slugs: string[] }>> = {
  lits: [
    { title: "Par taille", slugs: ["lits/lits-1-place", "lits/lits-2-places", "lits/lits-2-5-places", "lits/lits-3-places"] },
    { title: "Par type", slugs: ["lits/lits-enfants", "lits/lits-superposes", "lits/lits-pliables", "lits/lits-mezzanine", "lits/lits-avec-chevets", "lits/lits-avec-rangement"] },
    { title: "Par matière", slugs: ["lits/lits-en-bois", "lits/lits-metal"] },
    { title: "Packs", slugs: ["lits/pack-lit-matelas"] },
  ],
  matelas: [
    { title: "Par taille", slugs: ["matelas/matelas-1-place", "matelas/matelas-2-places", "matelas/matelas-2-5-places", "matelas/matelas-3-places", "matelas/matelas-bebe"] },
    { title: "Par type", slugs: ["matelas/matelas-orthopedique", "matelas/matelas-mousse", "matelas/matelas-memoire-de-forme", "matelas/matelas-a-ressorts", "matelas/matelas-medical"] },
    { title: "Par budget", slugs: ["matelas/matelas-pas-cher"] },
    { title: "Accessoires", slugs: ["matelas/surmatelas-protege-matelas"] },
  ],
};

/** Découpe les sous-catégories en groupes ; sans regroupement défini, un seul groupe sans titre. */
export function groupChildren<T extends { slug: string }>(parentSlug: string, children: T[]): Array<{ title: string | null; items: T[] }> {
  const groups = CATEGORY_GROUPS[parentSlug];
  if (!groups) return [{ title: null, items: children }];
  const used = new Set<string>();
  const result = groups.map((group) => {
    const items = group.slugs.map((slug) => children.find((child) => child.slug === slug)).filter((child): child is T => Boolean(child));
    items.forEach((item) => used.add(item.slug));
    return { title: group.title as string | null, items };
  }).filter((group) => group.items.length > 0);
  const rest = children.filter((child) => !used.has(child.slug));
  if (rest.length) result.push({ title: null, items: rest });
  return result;
}

/** Page d'aide au choix liée à une catégorie (affichée sous le titre de la catégorie). */
export const CATEGORY_GUIDES: Record<string, { href: string; label: string }> = {
  matelas: { href: "/guide-choix-matelas", label: "Aide au choix : comment choisir son matelas" },
};
