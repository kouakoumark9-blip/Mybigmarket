"use client";

import { BadgeCheck, ChevronRight, ShieldCheck, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { estimatedDelivery, formatXof } from "./format";
import type { ProductShippingOption } from "@/lib/product-shipping";

/**
 * Panneau Livraison & Commande.
 *
 * Le coût affiché vient EXCLUSIVEMENT du moteur de devis (module 4), recalculé
 * par le serveur à chaque changement de quantité, de mode ou de pays. Ce
 * composant ne fait aucun calcul tarifaire : il présente et sélectionne.
 *
 * Si aucun transporteur n'est configuré, le panneau le dit clairement au lieu
 * d'afficher un port gratuit fictif.
 */

const METHODS = [
  { code: "wave", label: "Wave" },
  { code: "orange_money", label: "Orange Money" },
  { code: "mtn", label: "MTN" },
  { code: "visa", label: "Visa" },
  { code: "mastercard", label: "Mastercard" },
];

export type ShippingState = {
  options: ProductShippingOption[];
  zoneName: string | null;
  available: boolean;
  loading: boolean;
  countryCode: string;
  countryLabel: string;
};

export function ShippingPanel({
  shipping,
  quantity,
  onCountryChange,
  countries,
  compact = false,
}: {
  shipping: ShippingState;
  quantity: number;
  onCountryChange: (code: string) => void;
  countries: Array<{ code: string; label: string }>;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<"air" | "sea" | null>(null);
  const [editing, setEditing] = useState(false);

  const usable = useMemo(() => shipping.options.filter((option) => option.mode !== undefined), [shipping.options]);
  const air = usable.find((option) => option.mode === "air") ?? null;
  const sea = usable.find((option) => option.mode === "sea") ?? null;
  const effectiveMode = mode ?? (air ? "air" : sea ? "sea" : null);
  const current = effectiveMode === "sea" ? sea : air;

  return <div className={`b2b-shipping${compact ? " is-compact" : ""}`}>
    <div className="b2b-shipping-head">
      <b>Livraison</b>
      <button type="button" className="b2b-link" onClick={() => setEditing((value) => !value)}>
        Modifier <ChevronRight size={14} aria-hidden="true" />
      </button>
    </div>

    {editing && <div className="b2b-country-picker">
      <label htmlFor="b2b-country">Destination</label>
      <select id="b2b-country" value={shipping.countryCode} onChange={(event) => onCountryChange(event.target.value)}>
        {countries.map((country) => <option key={country.code} value={country.code}>{country.label}</option>)}
      </select>
    </div>}

    <div className="b2b-shipping-card">
      <p className="b2b-shipping-badge"><Truck size={14} aria-hidden="true" /> Premium <span aria-hidden="true">|</span> mybigmarket Logistics</p>

      {shipping.loading && <p className="b2b-muted b2b-shipping-loading">Calcul du port…</p>}

      {!shipping.loading && !shipping.available && <p className="b2b-shipping-empty">
        Aucun transporteur n’est configuré pour {shipping.countryLabel}. Le port sera confirmé par notre équipe à la commande.
      </p>}

      {!shipping.loading && current && <>
        <p className="b2b-shipping-line">
          Frais de port : <b>{current.freeShipping ? "offerts" : formatXof(current.totalXof)}</b> pour {quantity} pièce{quantity > 1 ? "s" : ""}
        </p>
        {!current.billable && <p className="b2b-shipping-sample">Tarif indicatif : à confirmer avant paiement.</p>}
        <p className="b2b-shipping-line muted">
          Livraison prévue le {estimatedDelivery(current.transitDaysMax || current.transitDaysMin)}
        </p>
        <p className="b2b-shipping-zone">{shipping.zoneName ?? shipping.countryLabel}</p>
      </>}

      <div className="b2b-mode-radios" role="radiogroup" aria-label="Mode de transport">
        {[air, sea].filter((option): option is ProductShippingOption => option !== null).map((option) => <label key={option.methodCode} className={`b2b-mode-radio${effectiveMode === option.mode ? " is-selected" : ""}`}>
          <input
            type="radio"
            name="b2b-shipping-mode"
            value={option.mode}
            checked={effectiveMode === option.mode}
            onChange={() => setMode(option.mode)}
          />
          <span>
            <b>{option.mode === "air" ? "Avion" : "Bateau"}</b>
            <small>{option.freeShipping ? "offert" : formatXof(option.totalXof)} · {option.transitDaysMin}–{option.transitDaysMax} j</small>
          </span>
        </label>)}
      </div>
    </div>

    {!compact && <>
      <button type="button" className="b2b-protection">
        <ShieldCheck size={16} aria-hidden="true" />
        Protection des commandes mybigmarket
        <ChevronRight size={15} aria-hidden="true" />
      </button>

      <p className="b2b-secure"><BadgeCheck size={15} aria-hidden="true" /> Paiements sécurisés</p>
      <ul className="b2b-payments" aria-label="Moyens de paiement acceptés">
        {METHODS.map((method) => <li key={method.code}>{method.label}</li>)}
      </ul>
      <p className="b2b-payments-note">Paiement sécurisé par un cryptage SSL strict et PCI DSS</p>
    </>}
  </div>;
}
