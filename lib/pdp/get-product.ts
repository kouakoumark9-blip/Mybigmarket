import { getCatalogProduct, getCatalogProducts } from "@/lib/catalog";
import { getProductDescription, type DemoProduct } from "@/lib/demo-data";
import { smartphoneCamon50Pro } from "@/lib/product";
import { catalogToProduct, detailedToProduct, productToCartItem } from "@/lib/pdp/adapters";
import { sampleWatchProduct } from "@/lib/pdp/sample-product";
import type { Product } from "@/lib/pdp/types";

export type PdpPayload = { product: Product; cartItem: DemoProduct };

/** Charge la fiche produit à partir du schéma existant (Neon ou démo). */
export async function getPdpProduct(slug: string): Promise<PdpPayload | null> {
  if (slug === sampleWatchProduct.slug) return { product: sampleWatchProduct, cartItem: productToCartItem(sampleWatchProduct) };
  const all = await getCatalogProducts();
  if (!process.env.DATABASE_URL && slug === smartphoneCamon50Pro.slug) {
    return { product: detailedToProduct(smartphoneCamon50Pro, all), cartItem: smartphoneCamon50Pro };
  }
  const catalogProduct = await getCatalogProduct(slug);
  if (!catalogProduct) return null;
  return { product: catalogToProduct(catalogProduct, all, getProductDescription(catalogProduct)), cartItem: catalogProduct };
}
