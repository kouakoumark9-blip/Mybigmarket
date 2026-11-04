"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, LockKeyhole } from "lucide-react";
import { createCheckoutAction } from "@/actions/checkout";
import { useCart } from "@/components/cart-provider";
import { saveDemoOrder } from "@/lib/demo-commerce";
import { useCountryPreferences } from "@/components/country-preferences";
import { countryName, destinationCountries } from "@/lib/west-africa";

type PickupOption = { id: number; name: string; city: string; address: string };

export default function CheckoutForm({ pickupPoints, demoMode = false }: { pickupPoints: PickupOption[]; demoMode?: boolean }) {
  const { items, total, clearCart } = useCart();
  const { country, countryLabel, selectCountry, formatPrice, text, language } = useCountryPreferences();
  const [payment, setPayment] = useState("orange_money");
  const [delivery, setDelivery] = useState("delivery");
  const [done, setDone] = useState(false);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const sellerGroups = [...new Set(items.map((item) => item.seller))];
  const effectiveDelivery = country.code === "CI" ? delivery : "delivery";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!items.length) return;
    if (demoMode) {
      const order = saveDemoOrder({
        items: items.map(({ slug, title, seller, qty, priceXof, minimumQuantity, leadTimeDays }) => ({ slug, title, seller, qty, priceXof, minimumQuantity, leadTimeDays })),
        totalXof: total,
        deliveryMethod: effectiveDelivery as "delivery" | "pickup",
        deliveryCountryCode: country.code,
        deliveryCountryName: countryLabel,
      });
      setOrderIds([order.id]); setDone(true); clearCart(); return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("cart", JSON.stringify(items.map((item) => ({ slug: item.slug, qty: item.qty }))));
    formData.set("deliveryMethod", effectiveDelivery);
    formData.set("method", payment);
    startTransition(async () => {
      const result = await createCheckoutAction(formData);
      if (result.error) { setError(result.error); return; }
      setOrderIds(result.orderIds || []); setDone(true); clearCart();
    });
  }

  if (done) return <main className="shell page-space"><div className="auth-card checkout-success"><BadgeCheck size={42} className="text-primary"/><span className="eyebrow">COMMANDE {demoMode ? "SIMULÉE" : "ENREGISTRÉE"}</span><h1>{demoMode ? text("checkoutDemoReady") : text("checkoutSaved")}</h1>{demoMode ? <><p>Référence <b>{orderIds[0]}</b>. Le récapitulatif et les étapes simulées sont consultables dans votre espace commande.</p><p>{text("checkoutNoRealPayment")} {demoMode ? "Cette commande est stockée uniquement dans ce navigateur; la sélection du moyen de paiement n’entraîne aucun débit." : "Le paiement mock ne débite aucun compte."}</p></> : <><p>{orderIds.length} commande(s) créée(s), une par vendeur. Référence(s) : <b>{orderIds.map((id) => id.slice(0, 8).toUpperCase()).join(", ")}</b></p><p>Le paiement est en attente. Aucun fonds n’a été débité par le mode mock.</p></>}<Link className="button button-primary" href="/compte/commandes">{text("viewOrders")} <ArrowRight size={15}/></Link></div></main>;

  if (!items.length) return <main className="shell page-space"><div className="cart-panel cart-empty"><h2>{text("emptyCart")}</h2><p>{text("checkoutEmptyMessage")}</p><Link className="button button-primary" href="/produits">{text("viewCatalog")}</Link></div></main>;

  return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><Link href="/panier">Panier</Link><span>›</span><span>Finaliser</span></div><h1 className="page-title">{text("checkoutTitle")}</h1><p className="page-subtitle">{text("checkoutSubtitle")}</p>
    <form onSubmit={submit} className="two-column"><section className="checkout-panel checkout-form-panel"><h2 className="checkout-heading">1. {text("deliveryAddress")}</h2><div className="field checkout-country-field"><label htmlFor="countryCode">{text("checkoutCountry")}</label><select id="countryCode" name="countryCode" value={country.code} onChange={(event) => selectCountry(event.target.value)}>{destinationCountries.map((destination) => <option key={destination.code} value={destination.code}>{countryName(destination.code, language)} · {destination.currency}</option>)}</select><small>{text("deliveryToConfirm")}</small></div><input type="hidden" name="language" value={language}/><input type="hidden" name="deliveryMethod" value={effectiveDelivery}/><div className="delivery-toggle"><label className={`payment-choice ${effectiveDelivery === "delivery" ? "selected" : ""}`}><input type="radio" name="delivery-choice" checked={effectiveDelivery === "delivery"} onChange={() => setDelivery("delivery")}/> {text("delivery")}</label>{country.code === "CI" && pickupPoints.length > 0 && <label className={`payment-choice ${effectiveDelivery === "pickup" ? "selected" : ""}`}><input type="radio" name="delivery-choice" checked={effectiveDelivery === "pickup"} onChange={() => setDelivery("pickup")}/> {text("pickup")}</label>}</div>{effectiveDelivery === "delivery" ? <div className="form-grid checkout-address-fields"><div className="field"><label htmlFor="name">{text("checkoutName")}</label><input id="name" name="name" required placeholder={text("checkoutName")}/></div><div className="field"><label htmlFor="phone">{text("checkoutPhone")}</label><input id="phone" name="phone" required inputMode="tel" placeholder={`${country.callingCode} …`}/></div><div className="field full"><label htmlFor="address">{text("checkoutStreet")}</label><input id="address" name="address" required placeholder={text("checkoutStreet")}/></div><div className="field"><label htmlFor="city">{text("checkoutCity")}</label><input id="city" name="city" required placeholder={text("checkoutCity")}/></div></div> : <div className="field checkout-pickup-field"><label htmlFor="pickupPointId">{text("pickup")}</label><select id="pickupPointId" name="pickupPointId" required><option value="">{text("pickup")}</option>{pickupPoints.map((point) => <option key={point.id} value={point.id}>{point.name} — {point.city}</option>)}</select></div>}
      <h2 className="checkout-heading checkout-payment-heading">2. {text("checkoutStepPayment")}</h2><div className="payment-options">{[["orange_money", "Orange Money"], ["mtn_momo", "MTN MoMo"], ["wave", "Wave"], ["card", "Carte bancaire"]].map(([value, label]) => <label className={`payment-choice ${payment === value ? "selected" : ""}`} key={value}><input type="radio" name="payment-choice" checked={payment === value} onChange={() => setPayment(value)}/><span>{label}</span></label>)}</div><div className="checkout-demo-warning"><LockKeyhole size={15}/>{demoMode ? "Prototype interactif : ce choix sert uniquement à montrer l’étape de paiement. Aucun paiement ne sera lancé." : "Paiement mock en attente. Aucun débit ni transfert réel n’est effectué."}</div>{error && <div className="form-error" role="alert">{error}{error.includes("Connectez-vous") && <> <Link href="/connexion">Se connecter</Link></>}</div>}</section>
      <aside className="summary-card"><h2>{text("checkoutSummary")}</h2>{sellerGroups.map((seller) => <div key={seller}><div className="seller-cart-group">{text("sellerOrder")} {seller}</div>{items.filter((item) => item.seller === seller).map((item) => <div className="summary-row" key={item.slug}><span>{item.qty} × {item.title}</span><b>{formatPrice(item.qty * item.priceXof)}</b></div>)}</div>)}<div className="summary-row"><span>{text("checkoutDeliveryEstimate")}</span><span>{text("deliveryToConfirm")}</span></div><div className="summary-row total"><span>{text("checkoutProductsTotal")}</span><b>{formatPrice(total)}</b></div><button className="button button-primary" type="submit" disabled={pending}>{pending ? text("checkoutProcessing") : demoMode ? text("checkoutSimulate") : text("checkoutConfirm")} <ArrowRight size={15}/></button><p className="summary-note">{text("fxNote")}</p><p className="summary-note">Transport, douane et livraison ne sont pas calculés. {demoMode ? "Les commandes simulées restent dans ce navigateur." : "Le paiement mock ne collecte aucune donnée bancaire."}</p></aside></form>
  </main>;
}
