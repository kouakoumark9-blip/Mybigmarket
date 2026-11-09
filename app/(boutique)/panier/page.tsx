import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shop/breadcrumbs";
import { CartView } from "@/components/shop/cart-view";

export const metadata: Metadata = { title: "Mon panier", robots: { index: false } };

export default function CartPage() {
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Panier" }]}/>
    <h1 className="mb-title">Mon panier</h1>
    <CartView/>
  </div>;
}
