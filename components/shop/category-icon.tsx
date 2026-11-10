import { BedDouble, Layers, ShieldCheck, Tag, type LucideIcon } from "lucide-react";

/** Pictogramme de chaque catégorie principale (menu et tiroir mobile). */
const ICONS: Record<string, LucideIcon> = {
  lits: BedDouble,
  matelas: Layers,
  "surmatelas-protege-matelas": ShieldCheck,
};

export function CategoryIcon({ slug, size = 20 }: { slug: string; size?: number }) {
  const Icon = ICONS[slug] ?? Tag;
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" className="mb-cat-ico"/>;
}
