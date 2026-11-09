import { getCatalogProduct, getCatalogProducts } from "@/lib/catalog";
import { getProductDescription, type DemoProduct } from "@/lib/demo-data";
import { catalogToProduct } from "@/lib/pdp/adapters";
import type { Product } from "@/lib/pdp/types";
import { getQuantityPrices } from "@/lib/pdp/quantity-prices";

export type PdpPayload = { product: Product; cartItem: DemoProduct };

/** Charge la fiche produit à partir de la base (produits publiés uniquement). */
export async function getPdpProduct(slug: string): Promise<PdpPayload | null> {
  const catalogProduct = await getCatalogProduct(slug);
  if (!catalogProduct) return null;
  const all = await getCatalogProducts();
  const product = catalogToProduct(catalogProduct, all, getProductDescription(catalogProduct));
  product.quantityPrices = await getQuantityPrices(slug);
  return { product, cartItem: catalogProduct };
}
