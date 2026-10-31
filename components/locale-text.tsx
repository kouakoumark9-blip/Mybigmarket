"use client";

import { useCountryPreferences } from "@/components/country-preferences";
import type { LocaleMessageKey } from "@/lib/site-locale";

export function LocaleText({ messageKey, className }: { messageKey: LocaleMessageKey; className?: string }) {
  const { text } = useCountryPreferences();
  return <span className={className}>{text(messageKey)}</span>;
}
