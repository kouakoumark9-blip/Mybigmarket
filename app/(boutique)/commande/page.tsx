import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/shop/breadcrumbs";
import { CheckoutForm } from "@/components/shop/checkout-form";

export const metadata: Metadata = { title: "Finaliser ma commande", robots: { index: false } };

export default function CheckoutPage() {
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Panier", href: "/panier" }, { label: "Commande" }]}/>
    <h1 className="mb-title">Finaliser ma commande</h1>
    <p className="mb-intro">Une seule page, sans compte à créer. Vous payez par mobile money.</p>
    <CheckoutForm/>
  </div>;
}
