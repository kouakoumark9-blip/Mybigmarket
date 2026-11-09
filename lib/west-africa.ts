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
/** Pays acceptés par l'API de commande (inchangé). */
export const allDestinationCountries: DestinationCountry[] = [
  { code: "BJ", currency: "XOF", locale: "fr-BJ", language: "fr", languageName: "Français", callingCode: "+229" },
  { code: "BF", currency: "XOF", locale: "fr-BF", language: "fr", languageName: "Français", callingCode: "+226" },
  { code: "CV", currency: "CVE", locale: "pt-CV", language: "pt", languageName: "Português", callingCode: "+238", languageOptions: ["pt", "en"] },
  { code: "CI", currency: "XOF", locale: "fr-CI", language: "fr", languageName: "Français", callingCode: "+225", languageOptions: ["fr", "en"] },
  { code: "GM", currency: "GMD", locale: "en-GM", language: "en", languageName: "English", callingCode: "+220" },
  { code: "GH", currency: "GHS", locale: "en-GH", language: "en", languageName: "English", callingCode: "+233" },
  { code: "GN", currency: "GNF", locale: "fr-GN", language: "fr", languageName: "Français", callingCode: "+224" },
  { code: "GW", currency: "XOF", locale: "pt-GW", language: "pt", languageName: "Português", callingCode: "+245", languageOptions: ["pt", "fr"] },
  { code: "LR", currency: "LRD", locale: "en-LR", language: "en", languageName: "English", callingCode: "+231" },
  { code: "ML", currency: "XOF", locale: "fr-ML", language: "fr", languageName: "Français", callingCode: "+223" },
  { code: "MR", currency: "MRU", locale: "ar-MR", language: "ar", languageName: "العربية", callingCode: "+222", languageOptions: ["ar", "fr"] },
  { code: "NE", currency: "XOF", locale: "fr-NE", language: "fr", languageName: "Français", callingCode: "+227" },
  { code: "NG", currency: "NGN", locale: "en-NG", language: "en", languageName: "English", callingCode: "+234" },
  { code: "SN", currency: "XOF", locale: "fr-SN", language: "fr", languageName: "Français", callingCode: "+221" },
  { code: "SL", currency: "SLE", locale: "en-SL", language: "en", languageName: "English", callingCode: "+232" },
  { code: "TG", currency: "XOF", locale: "fr-TG", language: "fr", languageName: "Français", callingCode: "+228" },
];

/** La boutique ne livre qu'en Côte d'Ivoire (la fiche produit lit cette liste pour son choix de livraison). */
export const destinationCountries: DestinationCountry[] = allDestinationCountries.filter((country) => country.code === "CI");

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
