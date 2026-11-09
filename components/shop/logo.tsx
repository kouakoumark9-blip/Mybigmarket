import Link from "next/link";

export function Logo() {
  return <Link href="/" className="mb-logo" aria-label="MyBigMarket, accueil">
    <span className="mb-logo-mark" aria-hidden="true">M</span>
    <span>My<b>Big</b>Market</span>
  </Link>;
}
