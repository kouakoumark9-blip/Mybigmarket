import "server-only";
import { cookies } from "next/headers";
import { destinationByCode, resolveCountryLanguage, type SiteLanguage } from "@/lib/west-africa";
import { translator, LANGUAGE_COOKIE, type Translate } from "./index";

/** Langue du visiteur côté serveur : pays choisi, puis langue facultative mémorisée si le pays la propose. */
export async function getLanguage(): Promise<SiteLanguage> {
  const store = await cookies();
  const country = destinationByCode(store.get("mybigmarket-country")?.value);
  return resolveCountryLanguage(country, store.get(LANGUAGE_COOKIE)?.value);
}

export async function getTr(): Promise<Translate> {
  return translator(await getLanguage());
}
