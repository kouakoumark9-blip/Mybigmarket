import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { SHOP, whatsappLink } from "@/lib/shop/config";

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

const STEPS = [
  { n: "1", title: "Choisissez", text: "Parcourez les lits et les matelas, et ajoutez votre choix au panier." },
  { n: "2", title: "Commandez", text: "Renseignez votre adresse. Vous payez par mobile money : Orange Money, MTN MoMo, Moov Money ou Wave." },
  { n: "3", title: "Recevez", text: "Livraison à Abidjan en 24 à 72 h pour les produits en stock, et dans les autres villes de Côte d'Ivoire." },
];

/** Bandeau « Comment commander » et appel à écrire sur WhatsApp, en bas de l'accueil. */
export function HomeHowTo() {
  return <>
    <section className="mb-steps" aria-label="Comment commander">
      <h2>Commander en 3 étapes</h2>
      <ol>{STEPS.map((step) => <li key={step.n}><span className="mb-step-n" aria-hidden="true">{step.n}</span><div><b>{step.title}</b><p>{step.text}</p></div></li>)}</ol>
      <Link className="mb-link" href="/comment-commander">Voir le détail pour commander</Link>
    </section>
    <section className="mb-cta" aria-label="Une question ?">
      <div><h2>Une question avant de commander ?</h2><p>Écrivez-nous sur WhatsApp : {SHOP.hours.toLowerCase()}, nous vous aidons à choisir la bonne taille.</p></div>
      <a className="mb-cta-btn" href={whatsappLink()} rel="noopener"><MessageCircle size={20} aria-hidden="true"/> Écrire sur WhatsApp</a>
    </section>
  </>;
}
