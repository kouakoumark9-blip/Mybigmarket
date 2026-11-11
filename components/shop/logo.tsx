import Link from "next/link";
import { FlagCI } from "./flag-ci";

export function Logo() {
  return <Link href="/" className="mb-logo" aria-label="MyBigMarket, accueil">
    <span className="mb-logo-top"><span className="mb-logo-name"><b>M</b>ybigmarket</span><FlagCI width={30}/></span>
    <small>Abidjan · Côte d&apos;Ivoire</small>
  </Link>;
}
