import { expect, type Page } from "@playwright/test";

/** Échoue sur toute erreur JavaScript ou violation de la politique de sécurité du contenu. */
export function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`erreur JavaScript : ${error.message}`));
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to (load|execute|connect|frame)/i.test(message.text())) problems.push(`politique de sécurité : ${message.text()}`);
  });
  return { assertClean: () => expect(problems, problems.join("\n")).toEqual([]) };
}

export const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@e2e.mybigmarket.test`;
