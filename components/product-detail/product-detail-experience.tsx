"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, MessageCircle, ShieldAlert, ShoppingCart } from "lucide-react";
import type { DetailedProduct } from "@/lib/product";
import { priceTierForQuantity } from "@/lib/product";
import { ProductGallery } from "@/components/product-detail/product-gallery";
import { ProductInfo } from "@/components/product-detail/product-info";
import { SupplierCard } from "@/components/product-detail/supplier-card";
import { ShippingPanel } from "@/components/product-detail/shipping-panel";
import { StickyTabs } from "@/components/product-detail/sticky-tabs";
import { AttributesTable } from "@/components/product-detail/attributes-table";
import { ProductCarousel } from "@/components/product-detail/product-carousel";
import { SimilarSearches } from "@/components/product-detail/similar-searches";
import { useCart } from "@/components/cart-provider";
import { useCountryPreferences } from "@/components/country-preferences";

export function ProductDetailExperience({ product }: { product: DetailedProduct }) {
  const router = useRouter();
  const { addItem } = useCart();
  const { formatPrice } = useCountryPreferences();
  const [quantity, setQuantity] = useState(product.minimumQuantity);
  const [selectedColor, setSelectedColor] = useState(product.colorVariants[0]?.id || "");
  const [selectedPlug, setSelectedPlug] = useState(product.plugVariants[0] || "");
  const [activeImage, setActiveImage] = useState(0);
  const selectedTier = priceTierForQuantity(product, quantity);
  const colorLabel = product.colorVariants.find((item) => item.id === selectedColor)?.label || "—";

  const changeColor = (id: string) => {
    const variant = product.colorVariants.find((item) => item.id === id);
    setSelectedColor(id);
    if (variant) setActiveImage(variant.imageIndex);
  };
  const orderNow = () => { addItem(product, quantity); router.push("/checkout"); };

  return <main className="pdp-page">
    <div className="pdp-breadcrumb shell">{product.breadcrumb.map((part, index) => <span key={`${part}-${index}`}>{index > 0 && <ChevronRight size={13}/>}<Link href={index === product.breadcrumb.length - 1 ? `/produits?categorie=${product.categorySlug}` : "/produits"}>{part}</Link></span>)}<ChevronRight size={13}/><strong>{product.title}</strong></div>
    <div className="pdp-shell shell">
      <section className="pdp-main-layout" aria-label="Informations sur le produit">
        <div className="pdp-left-column"><ProductGallery product={product} activeIndex={activeImage} onSelect={setActiveImage}/><SupplierCard product={product}/></div>
        <ProductInfo product={product} selectedTier={selectedTier} onQuantityChange={setQuantity} selectedColor={selectedColor} selectedPlug={selectedPlug} onColorChange={changeColor} onPlugChange={setSelectedPlug}/>
        <ShippingPanel product={product} quantity={quantity} selectedTier={selectedTier} onQuantityChange={setQuantity} selectedColorLabel={colorLabel} selectedPlug={selectedPlug}/>
      </section>
      <StickyTabs/>
      <div className="pdp-lower-layout">
        <div className="pdp-lower-main">
          <AttributesTable product={product}/>
          <section className="pdp-reviews-section" id="pdp-reviews" aria-labelledby="pdp-reviews-title">
            <div className="pdp-section-heading"><div><span className="pdp-eyebrow">RETOURS CLIENTS · EXEMPLE</span><h2 id="pdp-reviews-title">Donnez votre avis</h2></div><span className="pdp-demo-tag">Avis non vérifiés</span></div>
            <div className="pdp-review-tabs"><button type="button" className="is-active">Avis sur le produit ({product.reviewCount})</button><button type="button">Avis sur le profil fournisseur ({product.supplier.reviewCount})</button></div>
            <div className="pdp-review-placeholder"><MessageCircle size={20}/><p>Les avis affichés sur cette fiche sont des données de démonstration; aucune évaluation client vérifiée n’est publiée.</p></div>
          </section>
          <section className="pdp-description-section" id="pdp-description" aria-labelledby="pdp-description-title">
            <div className="pdp-section-heading"><div><span className="pdp-eyebrow">DESCRIPTION</span><h2 id="pdp-description-title">Description du produit</h2></div></div>
            <div className="pdp-description-copy"><h3>Informations fournies à titre illustratif</h3><p>{product.description}</p></div>
            <div className="pdp-description-warning"><ShieldAlert size={17}/><span>Demandez au fournisseur de confirmer les variantes, caractéristiques, quantités, prix, disponibilité et conditions de livraison avant tout engagement.</span></div>
          </section>
        </div>
        <aside className="pdp-lower-aside"><div className="pdp-aside-note"><b>Avant de commander</b><p>Les prix sont affichés à titre indicatif et convertis depuis XOF. Les frais de transport, douane et livraison restent à confirmer.</p><Link href="#pdp-shipping">Voir les options de commande <ChevronRight size={14}/></Link></div></aside>
      </div>
      <ProductCarousel title="Autres recommandations pour votre entreprise" items={product.recommendations} visibleCount={5} id="business-recommendations"/>
      <ProductCarousel title="Fréquemment achetés ensemble" items={product.frequentlyBought} visibleCount={7} id="frequently-bought"/>
      <SimilarSearches product={product}/>
      <div className="pdp-mobile-buybar"><div><span>Total indicatif · {quantity} pièce{quantity > 1 ? "s" : ""}</span><strong>{formatPrice(selectedTier.unitPriceXof * quantity)}</strong></div><button type="button" className="pdp-mobile-cart" onClick={() => addItem(product, quantity)} aria-label="Ajouter au panier"><ShoppingCart size={18}/></button><button type="button" className="pdp-mobile-order" onClick={orderNow}>Commander <ArrowRight size={16}/></button></div>
    </div>
  </main>;
}
