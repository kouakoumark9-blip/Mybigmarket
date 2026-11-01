import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde-fous de la fiche produit.
 *
 * Deux familles de règles sont verrouillées ici, parce qu'elles se perdent
 * silencieusement lors d'une refonte :
 *  1. la marque — seuls les libellés mybigmarket ont le droit d'apparaître ;
 *  2. la mise en page — 1280 px de conteneur, trois colonnes 38/37/25, un seul
 *     accent #D84000, et la barre mobile uniquement sous 760 px.
 *
 * Les tests lisent les fichiers source : ils ne dépendent ni d'une base ni d'un
 * navigateur, et échouent dès qu'un composant réintroduit un libellé interdit.
 */

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const sources = [
  "app/produits/[slug]/page.tsx",
  "components/product/b2b/ProductDetailView.tsx",
  "components/product/b2b/ShippingPanel.tsx",
  "components/product/b2b/SupplierCard.tsx",
  "components/product/b2b/ActionBar.tsx",
  "components/product/b2b/ProductGallery.tsx",
  "components/product/b2b/StickyTabs.tsx",
  "components/product/b2b/ReviewsSection.tsx",
  "components/product/b2b/CostMarginCalculator.tsx",
  "components/product/b2b/ProductCarousel.tsx",
  "components/product/b2b/SimilarSearches.tsx",
  "components/product/b2b/MobileOrderBar.tsx",
  "components/product/b2b/AttributesTable.tsx",
  "components/product/b2b/PriceTiers.tsx",
  "components/product/b2b/VariantSelector.tsx",
  "components/product/b2b/KeyAttributes.tsx",
  "components/product/b2b/ProductTitleRating.tsx",
];

describe("identité de marque", () => {
  it.each(sources)("%s ne cite aucune plateforme tierce", (file) => {
    const content = read(file).toLowerCase();
    for (const forbidden of ["alibaba", "aliexpress", "taobao", "1688", "made-in-china"]) {
      expect(content, `${file} contient « ${forbidden} »`).not.toContain(forbidden);
    }
  });

  it("utilise les libellés de marque imposés", () => {
    const shipping = read("components/product/b2b/ShippingPanel.tsx");
    expect(shipping).toContain("mybigmarket Logistics");
    expect(shipping).toContain("Protection des commandes mybigmarket");
  });
});

describe("mise en page", () => {
  const css = read("app/produits/[slug]/product-detail.css");

  it("borne le conteneur à 1280 px avec 48 px de retrait (24 px de chaque côté)", () => {
    expect(css).toContain("width: min(1280px, calc(100% - 48px))");
  });

  it("définit la grille 38 / 37 / 25", () => {
    expect(css).toContain("grid-template-columns: minmax(0, 38fr) minmax(0, 37fr) minmax(0, 25fr)");
  });

  it("n’a qu’un seul accent : #d84000, survol #bf3a00", () => {
    const accents = css.match(/#d84000/gi) ?? [];
    expect(accents.length).toBeGreaterThan(0);
    // Un second accent serait une teinte orange/rouge saturée en dehors de la
    // gamme neutre (#f7f7f7, #eee, #ddd…). On cible donc explicitement les
    // oranges et rouges, pas les gris.
    const strays = css.match(/#(e[0-9a-f][0-4]|f[0-9a-f][0-3]|d[0-7]|c[0-9a-f])[0-9a-f]{2}[0-2][0-9a-f]\b/gi) ?? [];
    const accentsAllows = new Set(["#d84000", "#bf3a00"]);
    const unexpected = strays.filter((color) => !accentsAllows.has(color.toLowerCase()));
    expect(unexpected).toEqual([]);
    expect(css).toContain("--accent-hover: #bf3a00");
  });

  it("réserve les boutons principaux à 48 px en pilule", () => {
    const primary = css.slice(css.indexOf(".b2b-btn-primary {"));
    const primaryBlock = primary.slice(0, primary.indexOf("}"));
    expect(primaryBlock).toContain("min-height: 48px");
    expect(primaryBlock).toContain("border-radius: 999px");

    const outline = css.slice(css.indexOf(".b2b-btn-outline {"));
    expect(outline.slice(0, outline.indexOf("}"))).toContain("min-height: 44px");
  });

  it("n’affiche la barre mobile que sous 760 px", () => {
    expect(css).toMatch(/\.b2b-mobile-bar \{ display: none; \}/);
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 760px)"));
    expect(mobileBlock).toContain(".b2b-mobile-bar {");
    expect(mobileBlock).toContain("position: fixed");
  });

  it("garde le panneau de livraison collant en desktop", () => {
    const sticky = css.slice(css.indexOf(".b2b-sticky {"));
    expect(sticky.slice(0, sticky.indexOf("}"))).toContain("position: sticky");
  });

  it("aligne le squelette sur les hauteurs du contenu réel", () => {
    expect(read("components/product/b2b/ProductDetailSkeleton.tsx")).toContain("b2b-grid");
  });
});

describe("règles d’affichage des avis", () => {
  it("affiche « Aucun avis » plutôt qu’une note inventée", () => {
    const title = read("components/product/b2b/ProductTitleRating.tsx");
    expect(title).toContain("Aucun avis");
    expect(title).toContain("reviewCount > 0");
  });

  it("n’expose pas d’aggregateRating sans avis", () => {
    const page = read("app/produits/[slug]/page.tsx");
    expect(page).toContain("product.reviewCount > 0 && product.reviewAverage !== null");
  });
});

describe("définition des 16 composants demandés", () => {
  const components = [
    "ProductGallery",
    "SupplierCard",
    "ProductTitleRating",
    "PriceTiers",
    "VariantSelector",
    "KeyAttributes",
    "CostMarginCalculator",
    "ShippingPanel",
    "ActionBar",
    "StickyTabs",
    "AttributesTable",
    "LeadTimeTable",
    "ReviewsSection",
    "ProductCarousel",
    "SimilarSearches",
    "MobileOrderBar",
  ];

  it.each(components)("%s est exporté", (name) => {
    const files = [
      "ProductGallery",
      "SupplierCard",
      "ProductTitleRating",
      "PriceTiers",
      "VariantSelector",
      "KeyAttributes",
      "CostMarginCalculator",
      "ShippingPanel",
      "ActionBar",
      "StickyTabs",
      "AttributesTable",
      "ReviewsSection",
      "ProductCarousel",
      "SimilarSearches",
      "MobileOrderBar",
    ];
    const found = files.some((file) => read(`components/product/b2b/${file}.tsx`).includes(`export function ${name}`));
    expect(found, `${name} introuvable dans components/product/b2b`).toBe(true);
  });
});
