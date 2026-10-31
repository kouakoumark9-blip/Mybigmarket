"use client";

import { useCountryPreferences } from "@/components/country-preferences";
import { localizedCategoryName } from "@/lib/site-locale";

export function DestinationCountrySummary() {
  const { countryLabel, currency } = useCountryPreferences();
  return <>{countryLabel} · {currency === "XOF" ? "XOF / FCFA" : currency}</>;
}

export function LocalizedCategoryName({ slug, fallback }: { slug: string; fallback: string }) {
  const { language } = useCountryPreferences();
  return <>{localizedCategoryName(slug, language, fallback)}</>;
}

export function DestinationPriceLabel() {
  const { currency, text } = useCountryPreferences();
  return <>{text("priceIn")} {currency} · {text("deliveryToConfirm")}</>;
}
