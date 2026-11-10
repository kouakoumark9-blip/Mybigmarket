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

export type MenuEntry = { key: string; label: string; href: string; children: Array<{ name: string; slug: string }> };

/**
 * Entrées du menu des catégories (accueil, « Toutes les catégories », tiroir mobile).
 * Une catégorie regroupée (ex. Lits) donne une entrée par groupe : « Par taille », « Par type », « Par matière »,
 * chacune ouvrant la liste de ses sous-catégories ; un groupe d'un seul élément devient un lien direct.
 */
export function menuEntries(categories: Array<{ name: string; slug: string; children: Array<{ name: string; slug: string }> }>): MenuEntry[] {
  return categories.flatMap((category): MenuEntry[] => {
    if (!CATEGORY_GROUPS[category.slug]) return [{ key: category.slug, label: category.name, href: `/${category.slug}`, children: category.children }];
    const entries: MenuEntry[] = [{ key: `${category.slug}:tous`, label: `Tous les ${category.name.toLowerCase()}`, href: `/${category.slug}`, children: [] }];
    for (const group of groupChildren(category.slug, category.children)) {
      if (group.items.length === 1) entries.push({ key: group.items[0].slug, label: group.items[0].name, href: `/${group.items[0].slug}`, children: [] });
      else entries.push({ key: `${category.slug}:${group.title ?? "autres"}`, label: group.title ?? "Autres", href: `/${category.slug}`, children: group.items });
    }
    return entries;
  });
}
