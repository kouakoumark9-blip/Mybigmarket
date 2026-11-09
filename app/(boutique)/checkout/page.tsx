import { redirect } from "next/navigation";

/** Ancienne adresse de la commande, encore appelée par la fiche produit. */
export default function LegacyCheckout(): never {
  redirect("/commande");
}
