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
import { LocateButton } from "@/components/locate-button";
import { PaymentLogos } from "@/components/payment-logos";

type PickupOption = { id: number; name: string; city: string; address: string };

const PAYMENT_OPTIONS: Array<[string, string]> = [["orange_money", "Orange Money"], ["mtn_momo", "MTN MoMo"], ["wave", "Wave"], ["card", "Carte bancaire"]];

export default function CheckoutForm({ pickupPoints, demoMode = false, paymentsByCountry, defaultName = "", defaultPhone = "" }: { pickupPoints: PickupOption[]; demoMode?: boolean; paymentsByCountry?: Record<string, string[]>; defaultName?: string; defaultPhone?: string }) {
  const { items, total, clearCart } = useCart();
  const { country, countryLabel, selectCountry, formatPrice, text, language } = useCountryPreferences();
  const [payment, setPayment] = useState("orange_money");
  const [delivery, setDelivery] = useState("delivery");
  const [done, setDone] = useState(false);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [pending, startTransition] = useTransition();
  const sellerGroups = [...new Set(items.map((item) => item.seller))];
  const effectiveDelivery = country.code === "CI" ? delivery : "delivery";
  // Seuls les moyens ouverts pour le pays sont proposés (liste complète si la configuration est inconnue).
  const paymentOptions = demoMode || !paymentsByCountry ? PAYMENT_OPTIONS : PAYMENT_OPTIONS.filter(([value]) => paymentsByCountry[country.code]?.includes(value));
  const effectivePayment = paymentOptions.some(([value]) => value === payment) ? payment : paymentOptions[0]?.[0] ?? "";
  const paymentClosed = paymentOptions.length === 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!items.length || (!demoMode && paymentClosed)) return;
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
    formData.set("method", effectivePayment);
    startTransition(async () => {
      const result = await createCheckoutAction(formData);
      if (result.error) { setError(result.error); return; }
      if (result.checkoutUrl) { clearCart(); window.location.assign(result.checkoutUrl); return; }
      setOrderIds(result.orderIds || []); setDone(true); clearCart();
    });
  }

  if (done) return <main className="shell page-space"><div className="auth-card checkout-success"><BadgeCheck size={42} className="text-primary"/><span className="eyebrow">COMMANDE {demoMode ? "SIMULÉE" : "ENREGISTRÉE"}</span><h1>{demoMode ? text("checkoutDemoReady") : text("checkoutSaved")}</h1>{demoMode ? <><p>Référence <b>{orderIds[0]}</b>. Le récapitulatif et les étapes simulées sont consultables dans votre espace commande.</p><p>{text("checkoutNoRealPayment")} {demoMode ? "Cette commande est stockée uniquement dans ce navigateur; la sélection du moyen de paiement n’entraîne aucun débit." : "Aucun compte n’est débité."}</p></> : <><p>{orderIds.length} commande(s) créée(s), une par vendeur. Référence(s) : <b>{orderIds.map((id) => id.slice(0, 8).toUpperCase()).join(", ")}</b></p><p>Votre paiement est en attente : vous pouvez le régler à tout moment depuis « Mes commandes ».</p></>}<Link className="button button-primary" href="/compte/commandes">{text("viewOrders")} <ArrowRight size={15}/></Link></div></main>;

  if (!items.length) return <main className="shell page-space"><div className="cart-panel cart-empty"><h2>{text("emptyCart")}</h2><p>{text("checkoutEmptyMessage")}</p><Link className="button button-primary" href="/produits">{text("viewCatalog")}</Link></div></main>;

  return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><Link href="/panier">Panier</Link><span>›</span><span>Finaliser</span></div><h1 className="page-title">{text("checkoutTitle")}</h1><p className="page-subtitle">{text("checkoutSubtitle")}</p>
    <form onSubmit={submit} className="two-column checkout-layout"><section className="checkout-panel checkout-form-panel"><h2 className="checkout-heading">1. {text("deliveryAddress")}</h2><div className="field checkout-country-field"><label htmlFor="countryCode">{text("checkoutCountry")}</label><select id="countryCode" name="countryCode" value={country.code} onChange={(event) => selectCountry(event.target.value)}>{destinationCountries.map((destination) => <option key={destination.code} value={destination.code}>{countryName(destination.code, language)} · {destination.currency}</option>)}</select><small>{text("deliveryToConfirm")}</small></div><LocateButton onLocated={(place) => { selectCountry(place.countryCode); if (place.city) setCity(place.city); }}/><input type="hidden" name="language" value={language}/><input type="hidden" name="deliveryMethod" value={effectiveDelivery}/><div className="delivery-toggle"><label className={`payment-choice ${effectiveDelivery === "delivery" ? "selected" : ""}`}><input type="radio" name="delivery-choice" checked={effectiveDelivery === "delivery"} onChange={() => setDelivery("delivery")}/> {text("delivery")}</label>{country.code === "CI" && pickupPoints.length > 0 && <label className={`payment-choice ${effectiveDelivery === "pickup" ? "selected" : ""}`}><input type="radio" name="delivery-choice" checked={effectiveDelivery === "pickup"} onChange={() => setDelivery("pickup")}/> {text("pickup")}</label>}</div>{effectiveDelivery === "delivery" ? <div className="form-grid checkout-address-fields"><div className="field"><label htmlFor="name">{text("checkoutName")}</label><input id="name" name="name" required autoComplete="name" defaultValue={defaultName} placeholder={text("checkoutName")}/></div><div className="field"><label htmlFor="phone">{text("checkoutPhone")}</label><input id="phone" name="phone" type="tel" required inputMode="tel" autoComplete="tel" defaultValue={defaultPhone} placeholder={`${country.callingCode} …`}/></div><div className="field full"><label htmlFor="address">{text("checkoutStreet")}</label><input id="address" name="address" required autoComplete="street-address" placeholder={text("checkoutStreet")}/></div><div className="field"><label htmlFor="city">{text("checkoutCity")}</label><input id="city" name="city" required autoComplete="address-level2" value={city} onChange={(event) => setCity(event.target.value)} placeholder={text("checkoutCity")}/></div></div> : <div className="field checkout-pickup-field"><label htmlFor="pickupPointId">{text("pickup")}</label><select id="pickupPointId" name="pickupPointId" required><option value="">{text("pickup")}</option>{pickupPoints.map((point) => <option key={point.id} value={point.id}>{point.name} — {point.city}</option>)}</select></div>}
      <h2 className="checkout-heading checkout-payment-heading">2. {text("checkoutStepPayment")}</h2>{paymentClosed ? <div className="checkout-payment-closed" role="status"><b>Le paiement en ligne n’est pas encore ouvert pour {countryLabel}.</b><span>Envoyez-nous une demande de devis : notre équipe vous recontacte pour confirmer la commande et le mode de paiement.</span><Link className="button button-primary" href={`/demande-de-devis?produit=${encodeURIComponent(items.map((item) => `${item.qty} × ${item.title}`).join(", ").slice(0, 180))}`}>Demander un devis</Link></div> : <><div className="payment-options">{paymentOptions.map(([value, label]) => <label className={`payment-choice ${effectivePayment === value ? "selected" : ""}`} key={value}><input type="radio" name="payment-choice" checked={effectivePayment === value} onChange={() => setPayment(value)}/><PaymentLogos methods={[value]} height={24} className="payment-choice-logos"/><span>{label}</span></label>)}</div><div className="checkout-demo-warning"><LockKeyhole size={15}/>{demoMode ? "Prototype interactif : ce choix sert uniquement à montrer l’étape de paiement. Aucun paiement ne sera lancé." : "Le paiement se valide sur la page sécurisée du prestataire : mybigmarket ne voit jamais vos codes ni vos données bancaires."}</div></>}{error && <div className="form-error" role="alert">{error}{error.includes("Connectez-vous") && <> <Link href="/connexion">Se connecter</Link></>}</div>}</section>
      <aside className="summary-card"><h2>{text("checkoutSummary")}</h2>{sellerGroups.map((seller) => <div key={seller}><div className="seller-cart-group">{text("sellerOrder")} {seller}</div>{items.filter((item) => item.seller === seller).map((item) => <div className="summary-row" key={item.slug}><span>{item.qty} × {item.title}</span><b>{formatPrice(item.qty * item.priceXof)}</b></div>)}</div>)}<div className="summary-row"><span>{text("checkoutDeliveryEstimate")}</span><span>{text("deliveryToConfirm")}</span></div><div className="summary-row total"><span>{text("checkoutProductsTotal")}</span><b>{formatPrice(total)}</b></div><button className="button button-primary" type="submit" disabled={pending || (!demoMode && paymentClosed)}>{pending ? text("checkoutProcessing") : demoMode ? text("checkoutSimulate") : text("checkoutConfirm")} <ArrowRight size={15}/></button><p className="summary-note">{text("fxNote")}</p><p className="summary-note">Transport, douane et livraison ne sont pas calculés. {demoMode ? "Les commandes simulées restent dans ce navigateur." : "Le paiement se valide sur la page sécurisée de votre opérateur : mybigmarket ne reçoit aucune donnée bancaire."}</p></aside>
      <div className="checkout-sticky-bar"><div><small>{text("checkoutProductsTotal")}</small><b>{formatPrice(total)}</b></div><button className="button button-primary" type="submit" disabled={pending || (!demoMode && paymentClosed)}>{pending ? text("checkoutProcessing") : demoMode ? text("checkoutSimulate") : text("checkoutConfirm")} <ArrowRight size={15}/></button></div></form>
  </main>;
}
