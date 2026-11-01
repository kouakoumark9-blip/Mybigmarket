"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Globe, Sparkles, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { startConversationAction } from "@/actions/messages";
import type { ProductDetail, ProductVariantView } from "@/lib/product-detail-data";
import type { ProductShippingOption } from "@/lib/product-shipping";
import { useCart } from "@/components/cart-provider";
import { useFavorites } from "@/components/favorites-provider";
import { useCountryPreferences } from "@/components/country-preferences";
import { ActionBar } from "./ActionBar";
import { AttributesTable, LeadTimeTable, PackagingTable } from "./AttributesTable";
import { CostMarginCalculator } from "./CostMarginCalculator";
import { KeyAttributes } from "./KeyAttributes";
import { MobileOrderBar } from "./MobileOrderBar";
import { PriceTiers } from "./PriceTiers";
import { ProductGallery } from "./ProductGallery";
import { ProductTitleRating } from "./ProductTitleRating";
import { ReviewsSection } from "./ReviewsSection";
import { ShippingPanel, type ShippingState } from "./ShippingPanel";
import { SimilarSearches } from "./SimilarSearches";
import { StickyTabs } from "./StickyTabs";
import { SupplierCard } from "./SupplierCard";
import { VariantSelector, groupVariants } from "./VariantSelector";
import { estimatedDelivery, tierForQuantity } from "./format";

/**
 * Assemblage de la fiche produit B2B.
 *
 * Toute la donnée arrive déjà résolue par le serveur (`ProductDetail`) : ce
 * composant ne fait que gérer l'état d'interaction (variante, quantité, port) et
 * recalculer ce qui en dépend. Le port est recalculé par le serveur à chaque
 * changement de quantité ou de pays, jamais estimé côté navigateur.
 */

const COUNTRIES = [
  { code: "CI", label: "Côte d’Ivoire" },
  { code: "SN", label: "Sénégal" },
  { code: "ML", label: "Mali" },
  { code: "BF", label: "Burkina Faso" },
  { code: "GH", label: "Ghana" },
  { code: "NG", label: "Nigeria" },
];

export function ProductDetailView({
  product,
  initialShipping,
}: {
  product: ProductDetail;
  initialShipping: { options: ProductShippingOption[]; zoneName: string | null; available: boolean };
}) {
  const router = useRouter();
  const { addItem } = useCart();
  const { isFavorite, toggle } = useFavorites();
  const { country } = useCountryPreferences();
  const defaultCountryCode = country?.code ?? "CI";
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(() => groupVariants(product.variants), [product.variants]);
  const [selected, setSelected] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const group of groups) {
      const preferred = group.options.find((option) => option.isDefault) ?? group.options.find((option) => option.stock > 0);
      if (preferred) initial[group.name] = preferred.id;
    }
    return initial;
  });

  const currentVariant: ProductVariantView | null = useMemo(() => {
    const chosen = Object.values(selected);
    return product.variants.find((variant) => chosen.includes(variant.id)) ?? null;
  }, [product.variants, selected]);

  const stock = currentVariant ? currentVariant.stock : product.quantity;
  const minimumQuantity = currentVariant?.minimumQuantity ?? product.minimumQuantity;
  const [quantity, setQuantity] = useState(minimumQuantity);

  const [shipping, setShipping] = useState<ShippingState>({
    ...initialShipping,
    loading: false,
    countryCode: defaultCountryCode,
    countryLabel: COUNTRIES.find((item) => item.code === defaultCountryCode)?.label ?? "Côte d’Ivoire",
  });

  const tier = tierForQuantity(product.priceTiers, quantity);
  const unitPrice = tier?.unitPriceXof ?? product.priceXof;

  /**
   * Recalcule le port côté serveur : seule source de vérité tarifaire.
   * Utilise l'endpoint de devis existant (`/api/transport/devis`) : le client
   * n'envoie que produit + quantité + pays, et le serveur relit poids,
   * dimensions, transporteurs et grilles en base.
   */
  const refreshShipping = useCallback((nextQuantity: number, nextCountry: string) => {
    setShipping((current) => ({ ...current, loading: true, countryCode: nextCountry }));
    startTransition(() => {
      fetch("/api/transport/devis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          countryCode: nextCountry,
          lines: [{ productId: product.id, quantity: nextQuantity }],
          isFragile: product.packaging?.fragile ?? false,
          preference: "automatic",
        }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { options?: ProductShippingOption[]; zone?: { name: string } | null } | null) => {
          const options = payload?.options ?? [];
          setShipping((current) => ({
            ...current,
            loading: false,
            options,
            zoneName: payload?.zone?.name ?? null,
            available: options.length > 0,
            countryLabel: COUNTRIES.find((country) => country.code === nextCountry)?.label ?? nextCountry,
          }));
        })
        .catch(() => setShipping((current) => ({ ...current, loading: false, available: false, options: [] })));
    });
  }, [product.id, product.packaging?.fragile]);

  // Toute variation de quantité ou de variante change le port. Le recalcul est
  // temporisé : taper « 100 » au clavier ne déclenche pas trois devis, et le
  // setState vit dans le callback du minuteur, pas dans le corps de l'effet.
  const countryForShipping = shipping.countryCode;
  useEffect(() => {
    const timer = setTimeout(() => refreshShipping(quantity, countryForShipping), 250);
    return () => clearTimeout(timer);
  }, [quantity, currentVariant?.id, countryForShipping, refreshShipping]);

  const shippingOption = shipping.options.find((option) => option.mode === "air") ?? shipping.options[0] ?? null;
  const shippingXof = shippingOption && !shippingOption.freeShipping ? shippingOption.totalXof : shippingOption ? 0 : null;

  const cartProduct = useMemo(() => ({
    slug: product.slug,
    title: product.title,
    priceXof: unitPrice,
    minimumQuantity,
    leadTimeDays: product.leadTimeDays,
    category: product.categoryName,
    categorySlug: product.categorySlug,
    seller: product.supplier.name,
    sellerSlug: product.supplier.name.toLowerCase().replace(/\s+/g, "-"),
    university: "",
    city: product.supplier.city,
    rating: product.reviewAverage ?? 0,
    reviewCount: product.reviewCount,
    icon: "📦",
    tone: "sand",
    quantity: stock,
    imageUrl: product.images[0]?.url,
    description: product.shortDescription || product.description,
  }), [product, unitPrice, minimumQuantity, stock]);

  const handleAddToCart = () => {
    addItem(cartProduct, quantity);
  };

  const handleOrder = () => {
    addItem(cartProduct, quantity);
    router.push("/panier");
  };

  const handleChat = () => {
    const formData = new FormData();
    formData.set("productSlug", product.slug);
    startTransition(() => { void startConversationAction(formData); });
  };

  const selectVariant = (variant: ProductVariantView) => {
    setSelected((current) => ({ ...current, [variant.name]: variant.id }));
    setQuantity((current) => Math.max(variant.minimumQuantity ?? product.minimumQuantity, Math.min(current, variant.stock || current)));
  };

  const tabs = [
    { id: "attributs", label: "Attribut" },
    { id: "avis", label: "Avis" },
    { id: "fournisseur", label: "Fournisseur" },
    { id: "description", label: "Description" },
  ];

  const [leadTimesOpen, setLeadTimesOpen] = useState(false);
  const favorite = isFavorite(product.slug);

  return <div className="b2b-product">
    <div className="b2b-grid">
      <div className="b2b-col-left">
        <ProductGallery
          images={product.images}
          title={product.title}
          favorite={favorite}
          onToggleFavorite={() => toggle(cartProduct)}
        />
        <SupplierCard supplier={product.supplier} />
      </div>

      <div className="b2b-col-center">
        <ProductTitleRating
          title={product.title}
          reviewAverage={product.reviewAverage}
          reviewCount={product.reviewCount}
          soldCount={product.soldCount > 0 ? product.soldCount : null}
        />

        {product.priceTiers.length > 0 && <>
          <hr className="b2b-rule" />
          <PriceTiers tiers={product.priceTiers} quantity={quantity} />
        </>}

        {groups.length > 0 && <>
          <hr className="b2b-rule" />
          <VariantSelector groups={groups} selected={selected} onSelect={selectVariant} />
        </>}

        <KeyAttributes attributes={product.attributes} keyNames={product.keyAttributeNames} />

        <div className="b2b-analysis">
          <p className="b2b-analysis-title"><Sparkles size={15} aria-hidden="true" /> Autres analyses et recherches sur ce produit</p>
          <CostMarginCalculator unitPriceXof={unitPrice} />
        </div>
      </div>

      <aside className="b2b-col-right">
        <div className="b2b-sticky">
          <ShippingPanel
            shipping={shipping}
            quantity={quantity}
            onCountryChange={(code) => refreshShipping(quantity, code)}
            countries={COUNTRIES}
          />
          <ActionBar
            minimumQuantity={minimumQuantity}
            stock={stock}
            tiers={product.priceTiers}
            quantity={quantity}
            onQuantityChange={setQuantity}
            shippingXof={shippingXof}
            onOrder={handleOrder}
            onAddToCart={handleAddToCart}
            onChat={handleChat}
            submitting={isPending}
          />
        </div>
      </aside>
    </div>

    <StickyTabs tabs={tabs} />

    <section id="attributs" className="b2b-section">
      <h2>Caractéristiques du produit</h2>
      <AttributesTable attributes={product.attributes} />
      {product.packaging && <>
        <h3>Emballage et livraison</h3>
        <PackagingTable packaging={product.packaging} />
      </>}
      <LeadTimeTable leadTimes={product.leadTimes} open={leadTimesOpen} onToggle={() => setLeadTimesOpen((value) => !value)} />
    </section>

    <section id="avis" className="b2b-section">
      <ReviewsSection reviews={product.reviews} average={product.reviewAverage} reviewCount={product.reviewCount} />
    </section>

    <section id="fournisseur" className="b2b-section">
      <h2>Fournisseur</h2>
      <div className="b2b-supplier-detail">
        <div>
          <b>{product.supplier.name}</b>
          <p className="b2b-muted">
            <Globe size={14} aria-hidden="true" /> {product.supplier.countryLabel}
            {product.supplier.yearsActive !== null && <> · {product.supplier.yearsActive} ans d’activité</>}
            {product.supplier.offeringProducts > 0 && <> · {product.supplier.offeringProducts} produits proposés</>}
          </p>
          {product.supplier.description && <p>{product.supplier.description}</p>}
          {product.supplier.certifications.length > 0 && <p className="b2b-muted">Certifications : {product.supplier.certifications.join(", ")}</p>}
          <div className="b2b-supplier-actions">
            <button type="button" className="b2b-btn-outline" onClick={handleChat}>Discuter ici</button>
            <Link className="b2b-btn-outline" href={`/produits?q=${encodeURIComponent(product.supplier.name)}`}>Voir les produits</Link>
          </div>
        </div>
        <div className="b2b-supplier-facts">
          {product.supplier.responseTimeHours !== null && <div><b>≤{Math.round(product.supplier.responseTimeHours)}h</b><span>Temps de réponse</span></div>}
          {product.supplier.onTimeDeliveryRate !== null && <div><b>≥{Math.round(product.supplier.onTimeDeliveryRate)}%</b><span>Livraisons à temps</span></div>}
          {product.supplier.ratingAverage !== null && <div><b>{product.supplier.ratingAverage.toFixed(1)}/5</b><span>Note boutique</span></div>}
          <div><b>{estimatedDelivery(product.leadTimeDays)}</b><span>Préparation estimée</span></div>
        </div>
      </div>
    </section>

    <section id="description" className="b2b-section">
      <h2>Description</h2>
      <div className="b2b-description">
        {product.description
          ? product.description.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)
          : <p className="b2b-muted">Aucune description n’a encore été rédigée pour ce produit.</p>}
        <p className="b2b-muted b2b-description-foot">
          <Truck size={14} aria-hidden="true" /> Livraison estimée le {estimatedDelivery(shippingOption?.transitDaysMax ?? product.leadTimeDays)} · expédition depuis {product.supplier.countryLabel}
        </p>
      </div>
    </section>

    {product.keywords.length > 0 && <SimilarSearches keywords={product.keywords} />}

    <ActionBar
      minimumQuantity={minimumQuantity}
      stock={stock}
      tiers={product.priceTiers}
      quantity={quantity}
      onQuantityChange={setQuantity}
      shippingXof={shippingXof}
      onOrder={handleOrder}
      onAddToCart={handleAddToCart}
      onChat={handleChat}
      submitting={isPending}
      layout="mobile"
    />
    <MobileOrderBar
      totalXof={unitPrice * quantity + (shippingXof ?? 0)}
      onOrder={handleOrder}
      onAddToCart={handleAddToCart}
      onChat={handleChat}
      disabled={isPending}
    />

    <p className="b2b-footnote">
      Prix en FCFA, hors droits de douane à l’arrivée. <Link href="/conditions">Conditions de vente</Link>
      <ChevronRight size={13} aria-hidden="true" />
    </p>
  </div>;
}
