import type { SiteLanguage } from "@/lib/west-africa";
import { common } from "./dict/common";
import { product } from "./dict/product";
import { shopping } from "./dict/shopping";
import { account } from "./dict/account";

/**
 * Traduction de l'interface. Le texte français sert de clé : il reste lisible dans le code, et un
 * texte sans traduction s'affiche en français plutôt que de laisser un trou.
 * Variables : « {n} » dans le texte, valeurs passées en second argument.
 */
export type Dictionary = Record<string, string>;
type Translations = { en: Dictionary; pt: Dictionary; ar: Dictionary };

const parts: Translations[] = [common, product, shopping, account];
const dictionaries: Record<Exclude<SiteLanguage, "fr">, Dictionary> = {
  en: Object.assign({}, ...parts.map((part) => part.en)),
  pt: Object.assign({}, ...parts.map((part) => part.pt)),
  ar: Object.assign({}, ...parts.map((part) => part.ar)),
};

export type Translate = (fr: string, vars?: Record<string, string | number>) => string;

export function translate(language: SiteLanguage, fr: string, vars?: Record<string, string | number>): string {
  const text = language === "fr" ? fr : dictionaries[language][fr] ?? fr;
  return vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;
}

export const translator = (language: SiteLanguage): Translate => (fr, vars) => translate(language, fr, vars);

export const LANGUAGE_COOKIE = "mybigmarket-lang";
