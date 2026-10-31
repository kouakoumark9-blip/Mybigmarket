"use client";

import { useCountryPreferences } from "@/components/country-preferences";

export function LocaleCurrencyLabel() {
  const { currency, text } = useCountryPreferences();
  return <span>{text("currencyLabel")} {currency}</span>;
}
