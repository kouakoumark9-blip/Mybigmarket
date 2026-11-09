import Link from "next/link";

export function Logo() {
  return <Link href="/" className="mb-logo" aria-label="MyBigMarket, accueil">
    <span className="mb-logo-name"><b>M</b>ybigmarket</span>
    <small>Abidjan · Côte d&apos;Ivoire</small>
  </Link>;
}
