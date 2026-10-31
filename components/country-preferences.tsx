"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { countryName, destinationByCode, languageLabels, localeForCountry, resolveCountryLanguage } from "@/lib/west-africa";
import type { DestinationCountry, SiteLanguage } from "@/lib/west-africa";
import { t } from "@/lib/site-locale";
import type { LocaleMessageKey } from "@/lib/site-locale";

type CountryPreferencesValue = {
  country: DestinationCountry;
  countryLabel: string;
  selectCountry: (code: string) => void;
  formatPrice: (amountXof: number) => string;
  formatPriceForCountry: (amountXof: number, code: string, language?: SiteLanguage) => string;
  convertXofToLocal: (amountXof: number) => number;
  languageName: string;
  language: SiteLanguage;
  currency: string;
  locale: string;
  exchangeRateReady: boolean;
  exchangeRateUpdatedAt: string | null;
  text: (key: LocaleMessageKey) => string;
};

const CountryPreferencesContext = createContext<CountryPreferencesValue | null>(null);
const COUNTRY_COOKIE = "mybigmarket-country";

type ExchangePayload = { rates?: Record<string, number>; updatedAt?: string | null; unavailable?: boolean };

export function CountryPreferencesProvider({ children, initialCountryCode = "CI" }: { children: React.ReactNode; initialCountryCode?: string }) {
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [language, setLanguage] = useState<SiteLanguage>(() => destinationByCode(initialCountryCode).language);
  const [rates, setRates] = useState<Record<string, number>>({ XOF: 1 });
  const [exchangeRateUpdatedAt, setExchangeRateUpdatedAt] = useState<string | null>(null);
  const country = destinationByCode(countryCode);
  const locale = localeForCountry(country, language);

  useEffect(() => {
    const timer = window.setTimeout(() => setLanguage(resolveCountryLanguage(destinationByCode(initialCountryCode), navigator.language)), 0);
    fetch("/api/exchange-rates", { cache: "no-store" })
      .then((response) => response.json() as Promise<ExchangePayload>)
      .then((payload) => {
        if (payload.rates && Object.keys(payload.rates).length > 1) setRates(payload.rates);
        setExchangeRateUpdatedAt(payload.updatedAt || null);
      })
      .catch(() => undefined);
    return () => window.clearTimeout(timer);
  }, [initialCountryCode]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [locale, language]);

  const selectCountry = useCallback((code: string) => {
    const nextCountry = destinationByCode(code);
    const nextLanguage = resolveCountryLanguage(nextCountry, navigator.language);
    setCountryCode(nextCountry.code);
    setLanguage(nextLanguage);
    window.localStorage.setItem(COUNTRY_COOKIE, nextCountry.code);
    document.cookie = `${COUNTRY_COOKIE}=${nextCountry.code}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    document.documentElement.lang = localeForCountry(nextCountry, nextLanguage);
    document.documentElement.dir = nextLanguage === "ar" ? "rtl" : "ltr";
  }, []);

  const formatPriceForCountry = useCallback((amountXof: number, code: string, languageOverride?: SiteLanguage) => {
    const target = destinationByCode(code);
    const targetLocale = localeForCountry(target, languageOverride || target.language);
    if (target.currency === "XOF") return `${new Intl.NumberFormat(targetLocale, { maximumFractionDigits: 0 }).format(amountXof)} FCFA`;
    const rate = rates[target.currency];
    if (!rate) return `${new Intl.NumberFormat(targetLocale, { maximumFractionDigits: 0 }).format(amountXof)} XOF`;
    return new Intl.NumberFormat(targetLocale, { style: "currency", currency: target.currency, maximumFractionDigits: 2 }).format(amountXof * rate);
  }, [rates]);
  const formatPrice = useCallback((amountXof: number) => formatPriceForCountry(amountXof, country.code, language), [formatPriceForCountry, country.code, language]);
  const convertXofToLocal = useCallback((amountXof: number) => amountXof * (country.currency === "XOF" ? 1 : rates[country.currency] || 1), [country.currency, rates]);

  const value = useMemo<CountryPreferencesValue>(() => ({
    country,
    countryLabel: countryName(country.code, language),
    selectCountry,
    formatPrice,
    formatPriceForCountry,
    convertXofToLocal,
    languageName: languageLabels[language],
    language,
    currency: country.currency,
    locale,
    exchangeRateReady: country.currency === "XOF" || Boolean(rates[country.currency]),
    exchangeRateUpdatedAt,
    text: (key) => t(language, key),
  }), [country, language, locale, selectCountry, formatPrice, formatPriceForCountry, convertXofToLocal, rates, exchangeRateUpdatedAt]);

  return <CountryPreferencesContext.Provider value={value}>{children}</CountryPreferencesContext.Provider>;
}

export function useCountryPreferences() {
  const context = useContext(CountryPreferencesContext);
  if (!context) throw new Error("useCountryPreferences doit être utilisé dans CountryPreferencesProvider");
  return context;
}

export function LocalPrice({ amountXof, className = "" }: { amountXof: number; className?: string }) {
  const { formatPrice } = useCountryPreferences();
  return <span className={className}>{formatPrice(amountXof)}</span>;
}

export function DestinationPrice({ amountXof, countryCode, className = "" }: { amountXof: number; countryCode?: string; className?: string }) {
  const { formatPriceForCountry } = useCountryPreferences();
  return <span className={className}>{formatPriceForCountry(amountXof, countryCode || "CI")}</span>;
}
