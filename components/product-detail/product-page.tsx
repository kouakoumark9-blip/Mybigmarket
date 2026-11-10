"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-data";
import type { Product, Review, ReviewSummary } from "@/lib/pdp/types";
import { pdpConfig } from "@/lib/pdp/config";
import { useCart } from "@/components/cart-provider";
import { Breadcrumb } from "@/components/product-detail/breadcrumb";
import { ProductGallery } from "@/components/product-detail/product-gallery";
import { ProductInfo } from "@/components/product-detail/product-info";
import { VariantSheet, type VariantState } from "@/components/product-detail/variant-picker";
import { BuyBox } from "@/components/product-detail/buy-box";
import { TabsBar, useScrollSpy } from "@/components/product-detail/tabs-bar";
import { AttributesTable } from "@/components/product-detail/attributes-table";
import { ProductCarousel } from "@/components/product-detail/product-carousel";
import { FaqBlock } from "@/components/product-detail/faq-block";
import { ReviewsSection } from "@/components/product-detail/reviews-section";
import { DescriptionSection } from "@/components/product-detail/description-section";
import { RecapSection } from "@/components/product-detail/recap-section";
import { FloatingActions } from "@/components/product-detail/floating-actions";
import { MobileActionBar } from "@/components/product-detail/mobile-action-bar";

export type PublicReview = { id: string; rating: number; comment: string | null; createdAt: Date | string };

/** Ajoute les avis publiés en base aux avis du produit. */
function mergeReviews(summary: ReviewSummary, published: PublicReview[]): ReviewSummary {
  if (!published.length) return summary;
  const items: Review[] = published.map((review) => ({ id: review.id, author: "Client", rating: review.rating, date: new Date(review.createdAt).toISOString(), text: review.comment || "", verified: true }));
  const distribution = summary.distribution ? [...summary.distribution] as NonNullable<ReviewSummary["distribution"]> : undefined;
  items.forEach((review) => { if (distribution) distribution[5 - Math.min(5, Math.max(1, review.rating))] += 1; });
  const count = summary.count + items.length;
  const average = (summary.average * summary.count + items.reduce((sum, review) => sum + review.rating, 0)) / count;
  return { average: Math.round(average * 10) / 10, count, distribution, items: [...items, ...summary.items] };
}

/** Mesure l'en-tête du site (sticky) pour placer onglets et boîte d'achat juste dessous. */
function useHeaderOffset() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".mb-header");
    if (!header) return;
    const apply = () => document.documentElement.style.setProperty("--pd-header-h", `${Math.round(header.getBoundingClientRect().height)}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--pd-header-h"); };
  }, []);
}

export function ProductDetailPage({ product, cartItem, publishedReviews = [], paymentsOpen = false, paymentMethods = [] }: { product: Product; cartItem: DemoProduct; publishedReviews?: PublicReview[]; paymentsOpen?: boolean; paymentMethods?: string[] }) {
  const router = useRouter();
  const { addItem } = useCart();
  const [color, setColor] = useState(product.colorVariants[0]?.id || "");
  const [design, setDesign] = useState(product.designOptions[0]?.id || "");
  const [activeImage, setActiveImage] = useState(0);
  const [variantImage, setVariantImage] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [compact, setCompact] = useState(false);
  const [floatingTabs, setFloatingTabs] = useState(false);
  const priceRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const inlineTabsRef = useRef<HTMLElement>(null);
  const tabIds = useMemo(() => pdpConfig.tabs.map((tab) => tab.id), []);
  const activeTab = useScrollSpy(tabIds);
  const reviews = useMemo(() => mergeReviews(product.reviews, publishedReviews), [product.reviews, publishedReviews]);
  useHeaderOffset();

  // Image de la variante choisie : si elle n'est pas dans la galerie, elle s'affiche en tête.
  const images = useMemo(() => {
    const variant = product.colorVariants.find((item) => item.image === variantImage);
    if (!variant || product.images.some((image) => image.src === variant.image)) return product.images;
    return [{ src: variant.image, alt: `${product.title} – coloris ${variant.label}` }, ...product.images];
  }, [product, variantImage]);

  const selectColor = useCallback((id: string) => {
    const variant = product.colorVariants.find((item) => item.id === id);
    setColor(id);
    if (!variant) return;
    const index = product.images.findIndex((image) => image.src === variant.image);
    setVariantImage(index >= 0 ? null : variant.image);
    setActiveImage(index >= 0 ? index : 0);
  }, [product]);

  const variants: VariantState = { color, design, onColor: selectColor, onDesign: setDesign, onOpenSheet: () => setSheetOpen(true) };
  const selectedVariant = product.colorVariants.find((item) => item.id === color);
  const unitPrice = selectedVariant?.priceXof ?? product.priceMin;

  const [quantity, setQuantity] = useState(1);
  const order = () => { addItem(cartItem, quantity); router.push("/checkout"); };
  const addToCart = () => { addItem(cartItem, quantity); setFeedback(quantity > 1 ? `${quantity} articles ajoutés au panier.` : "Ajouté au panier."); };

  // Boîte d'achat compacte quand le prix sort de l'écran ; onglets flottants après le bloc principal.
  useEffect(() => {
    const price = priceRef.current;
    const main = mainRef.current;
    const tabs = inlineTabsRef.current;
    if (!price || !main || !tabs) return;
    let mainPassed = false;
    let tabsVisible = false;
    const sync = () => setFloatingTabs(mainPassed && !tabsVisible);
    const observers = [
      new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 }),
      new IntersectionObserver(([entry]) => { mainPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0; sync(); }, { threshold: 0 }),
      new IntersectionObserver(([entry]) => { tabsVisible = entry.isIntersecting; sync(); }, { threshold: 0 }),
    ];
    observers[0].observe(price);
    observers[1].observe(main);
    observers[2].observe(tabs);
    return () => observers.forEach((observer) => observer.disconnect());
  }, []);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return <main className="pd" id="contenu">
    <TabsBar tabs={pdpConfig.tabs} active={activeTab} floating visible={floatingTabs}/>
    <div className="pd-shell">
      <Breadcrumb items={product.breadcrumb} current={product.title}/>
      <div className="pd-layout">
        <div className="pd-left">
          <div className="pd-main" ref={mainRef}>
            <div className="pd-area-gallery">
              <ProductGallery images={images} videoUrl={product.videoUrl} label={product.imageLabel} activeIndex={activeImage} onSelect={setActiveImage} favoriteItem={cartItem}/>
            </div>
            <div className="pd-area-info">
              <ProductInfo ref={priceRef} product={product} variants={variants} unitPrice={unitPrice} quantity={quantity} onQuantity={setQuantity} maxQuantity={cartItem.availability === "on_order" ? 99 : Math.max(1, cartItem.quantity)} orderable={!cartItem.isDemo}/>
              {(product.colorVariants.length > 0 || product.designOptions.length > 0) && <button type="button" className="pd-variant-summary" onClick={() => setSheetOpen(true)}>
                <span><b>Options</b> {[selectedVariant?.label, product.designOptions.find((item) => item.id === design)?.label].filter(Boolean).join(" · ")}</span><ChevronRight size={18} strokeWidth={1.5}/>
              </button>}
            </div>
          </div>

          <div className="pd-lower">
            <ProductCarousel title="Produits similaires" items={product.related} id="pd-related"/>
            <TabsBar ref={inlineTabsRef} tabs={pdpConfig.tabs} active={activeTab}/>
            <RecapSection summary={product.summary ?? ""} specs={product.keySpecs} highlights={product.highlights} id="pdp-recap"/>
            <AttributesTable items={product.attributes} id="pdp-attributes"/>
            <FaqBlock items={product.faq}/>
            <ProductCarousel title="Fréquemment achetés ensemble" items={product.boughtTogether} id="pd-together"/>
            <ProductCarousel title="Autres produits de la boutique" items={product.supplierProducts} id="pd-supplier-products" anchorId="pdp-supplier-section"/>
            <ReviewsSection summary={reviews} id="pdp-reviews"/>
            <DescriptionSection description={product.description} id="pdp-description"/>
          </div>
        </div>

        <div className="pd-right">
          <BuyBox product={product} variants={variants} compact={compact} onOrder={order} onAddToCart={addToCart} feedback={feedback} orderable={!cartItem.isDemo} paymentsOpen={paymentsOpen} paymentMethods={paymentMethods}/>
        </div>
      </div>
    </div>

    <FloatingActions/>
    <MobileActionBar slug={product.slug} onOrder={order} onAddToCart={addToCart} orderable={!cartItem.isDemo} title={product.title}/>
    <VariantSheet product={product} state={variants} open={sheetOpen} onClose={closeSheet}/>
  </main>;
}
