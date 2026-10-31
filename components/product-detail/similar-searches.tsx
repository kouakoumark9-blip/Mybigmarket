import Link from "next/link";
import { Search } from "lucide-react";
import type { DetailedProduct } from "@/lib/product";

export function SimilarSearches({ product }: { product: DetailedProduct }) {
  return <section className="pdp-similar-searches" aria-labelledby="pdp-similar-title"><h2 id="pdp-similar-title">Recherches similaires</h2><div>{product.similarSearches.map((query) => <Link key={query} href={`/produits?q=${encodeURIComponent(query)}`}><Search size={13}/>{query}</Link>)}</div></section>;
}
