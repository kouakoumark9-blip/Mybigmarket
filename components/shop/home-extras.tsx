import Image from "next/image";
import Link from "next/link";

export type CategoryTile = { name: string; href: string; image: string; count: number };

/** « Acheter par catégorie » : une vignette photo par grande catégorie, cliquable. */
export function HomeCategoryTiles({ tiles }: { tiles: CategoryTile[] }) {
  if (tiles.length < 3) return null;
  return <section className="mb-tiles" aria-label="Acheter par catégorie">
    <div className="mb-tiles-head"><h2>Acheter par catégorie</h2></div>
    <ul style={{ "--tiles": Math.min(6, tiles.length) } as React.CSSProperties}>
      {tiles.slice(0, 6).map((tile) => <li key={tile.href}>
        <Link href={tile.href}>
          <span className="mb-tile-img"><Image src={tile.image} alt="" fill sizes="(max-width: 700px) 46vw, (max-width: 1100px) 30vw, 200px" style={{ objectFit: "cover" }}/></span>
          <span className="mb-tile-name">{tile.name}</span>
          <span className="mb-tile-count">{tile.count} produit{tile.count > 1 ? "s" : ""}</span>
        </Link>
      </li>)}
    </ul>
  </section>;
}
