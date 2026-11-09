export type SiteLanguage = "fr" | "en" | "pt" | "ar";

export type DestinationCountry = {
  code: string;
  currency: string;
  locale: string;
  language: SiteLanguage;
  languageName: string;
  callingCode: string;
  languageOptions?: SiteLanguage[];
};

// West African destinations are selectable; shipping availability and charges must still be confirmed.
/** La boutique ne livre qu'en Côte d'Ivoire (la fiche produit lit cette liste pour son choix de livraison). */
export const destinationCountries: DestinationCountry[] = [
  { code: "CI", currency: "XOF", locale: "fr-CI", language: "fr", languageName: "Français", callingCode: "+225" },
];

const regionNames = new Map<string, Intl.DisplayNames>();

export function countryName(code: string, language: SiteLanguage = "fr"): string {
  try {
    let names = regionNames.get(language);
    if (!names) {
      names = new Intl.DisplayNames([language], { type: "region" });
      regionNames.set(language, names);
    }
    return names.of(code) || code;
  } catch {
    return code;
  }
}

export function destinationByCode(code: string | undefined | null): DestinationCountry {
  return destinationCountries.find((country) => country.code === code) || destinationCountries.find((country) => country.code === "CI")!;
}

export const languageLabels: Record<SiteLanguage, string> = { fr: "Français", en: "English", pt: "Português", ar: "العربية" };

export function resolveCountryLanguage(country: DestinationCountry, browserLocale?: string): SiteLanguage {
  const browserLanguage = browserLocale?.split("-")[0]?.toLowerCase() as SiteLanguage | undefined;
  const supported = country.languageOptions || [country.language];
  return browserLanguage && supported.includes(browserLanguage) ? browserLanguage : country.language;
}

export function localeForCountry(country: DestinationCountry, language: SiteLanguage): string {
  return `${language}-${country.code}`;
}
