"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ShippingInfo } from "@/lib/pdp/types";
import { useCountryPreferences } from "@/components/country-preferences";
import { countryName, destinationCountries } from "@/lib/west-africa";

export type ShippingChoice = { countryCode: string; carrierId: string };

type Props = { shipping: ShippingInfo; value: ShippingChoice | null; onChange: (choice: ShippingChoice) => void; onClose: () => void };

export function ShippingModal({ shipping, value, onChange, onClose }: Props) {
  const { country, selectCountry, language, formatPrice } = useCountryPreferences();
  const [countryCode, setCountryCode] = useState(value?.countryCode || country.code);
  const [carrierId, setCarrierId] = useState(value?.carrierId || shipping.carriers[0]?.id || "");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confirm = () => {
    if (countryCode !== country.code) selectCountry(countryCode);
    onChange({ countryCode, carrierId });
    onClose();
  };

  return <div className="pd-modal-backdrop is-sheet" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="pd-modal pd-sheet" role="dialog" aria-modal="true" aria-labelledby="pd-ship-title">
      <header className="pd-modal-head"><h2 id="pd-ship-title">Livraison</h2><button type="button" onClick={onClose} aria-label="Fermer" autoFocus><X size={20} strokeWidth={1.5}/></button></header>
      <div className="pd-calc-field">
        <label htmlFor="pd-ship-country">Pays de livraison</label>
        <select id="pd-ship-country" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
          {destinationCountries.map((item) => <option key={item.code} value={item.code}>{countryName(item.code, language)}</option>)}
        </select>
      </div>
      <fieldset className="pd-carriers">
        <legend className="pd-block-title">Mode de transport</legend>
        {shipping.carriers.map((carrier) => <label key={carrier.id} className={`pd-carrier${carrierId === carrier.id ? " is-selected" : ""}`}>
          <input type="radio" name="pd-carrier" value={carrier.id} checked={carrierId === carrier.id} onChange={() => setCarrierId(carrier.id)}/>
          <span><b>{carrier.label}</b><small>{carrier.delay}</small></span>
          <strong>{carrier.feeXof ? `${formatPrice(carrier.feeXof)} / pièce` : "Sur devis"}</strong>
        </label>)}
      </fieldset>
      <p className="pd-modal-note">Frais et délais indicatifs, confirmés au moment de la commande selon la destination.</p>
      <button type="button" className="pd-btn pd-btn-primary pd-btn-block" onClick={confirm}>Confirmer</button>
    </div>
  </div>;
}
