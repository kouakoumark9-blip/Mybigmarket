import { CookingPot, Laptop, Refrigerator, Snowflake, Tv, Zap, Package, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  informatique: Laptop, electrogene: Zap, climatiseurs: Snowflake,
  "petit-electromenager": CookingPot, "gros-electromenager": Refrigerator, televiseurs: Tv,
};

/** Icône de remplacement quand une catégorie n'a pas encore d'image carrée. */
export function CategoryIcon({ slug, size = 40 }: { slug: string; size?: number }) {
  const Icon = ICONS[slug] ?? Package;
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true"/>;
}
