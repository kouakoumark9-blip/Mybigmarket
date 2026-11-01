"use client";

import type { ProductVariantView } from "@/lib/product-detail-data";

/**
 * Sélecteurs de variantes (« Couleur », « Fiche », …).
 *
 * Le nom du groupe vient de la base : la fiche n'impose pas « Couleur », elle
 * affiche les groupes réellement saisis. Une variante sans stock est barrée et
 * désactivée — jamais cliquable silencieusement.
 */

export type VariantGroup = { name: string; options: ProductVariantView[] };

/** Regroupe les variantes à plat par nom d'attribut, en conservant l'ordre. */
export function groupVariants(variants: ProductVariantView[]): VariantGroup[] {
  const groups = new Map<string, ProductVariantView[]>();
  for (const variant of variants) {
    const list = groups.get(variant.name) ?? [];
    list.push(variant);
    groups.set(variant.name, list);
  }
  return [...groups.entries()].map(([name, options]) => ({ name, options }));
}

export function VariantSelector({
  groups,
  selected,
  onSelect,
  onOpenPicker,
}: {
  groups: VariantGroup[];
  selected: Record<string, number>;
  onSelect: (variant: ProductVariantView) => void;
  onOpenPicker?: () => void;
}) {
  if (groups.length === 0) return null;

  return <div className="b2b-variants">
    {groups.map((group) => {
      const currentId = selected[group.name];
      const current = group.options.find((option) => option.id === currentId);
      const isColor = /couleur|color/i.test(group.name);

      return <section key={group.name} className="b2b-variant-group">
        <div className="b2b-variant-head">
          <b>{group.name}</b>
          {onOpenPicker && <button type="button" className="b2b-pill-outline b2b-pill-sm" onClick={onOpenPicker}>
            {current ? current.value : "Sélectionner"}
          </button>}
        </div>

        <div className={isColor ? "b2b-swatches" : "b2b-chips"}>
          {group.options.map((option) => {
            const outOfStock = option.stock <= 0;
            const isSelected = option.id === currentId;
            return <button
              key={option.id}
              type="button"
              disabled={outOfStock}
              aria-pressed={isSelected}
              title={option.value}
              className={`${isColor ? "b2b-swatch" : "b2b-chip"}${isSelected ? " is-selected" : ""}${outOfStock ? " is-disabled" : ""}`}
              onClick={() => onSelect(option)}
            >
              {isColor && option.imageUrl
                // eslint-disable-next-line @next/next/no-img-element -- vignette de variante, URL en base
                ? <img src={option.imageUrl} alt={option.value} />
                : <span>{option.value}</span>}
              {outOfStock && <span className="sr-only"> (rupture)</span>}
            </button>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
