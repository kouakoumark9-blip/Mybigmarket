import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou anti-divergence pour le moteur commandes (module 6).
 *
 * adminnew est un projet Next distinct : il duplique `lib/order-rules.ts` et
 * `lib/document-numbers.ts`. Si les copies divergent, le back office
 * accepterait une transition que le storefront refuse (ou l'inverse), ou
 * numéroterait les factures selon une autre règle. Ce test échoue alors.
 */

const root = resolve(__dirname, "..");

/**
 * Retire uniquement l'en-tête de copie (« COPIE SYNCHRONISÉE »), pas les
 * commentaires internes du module : couper à la première fin de commentaire
 * tronquerait le fichier racine au niveau de sa première documentation.
 */
const stripCopyHeader = (content: string) =>
  content.startsWith("/**") && content.includes("COPIE SYNCHRONISÉE")
    ? content.slice(content.indexOf("*/") + 2).trim()
    : content.trim();

const body = (path: string) => stripCopyHeader(readFileSync(resolve(root, path), "utf8"));

/** La copie admin doit être identique, à l'import de son schéma local près. */
const normalize = (content: string) =>
  content.replace(/from "\.\/db\/schema"/, 'from "<schema>"');

describe("synchronisation du moteur commandes", () => {
  it("adminnew/lib/order-rules.ts est identique à lib/order-rules.ts", () => {
    expect(body("adminnew/lib/order-rules.ts")).toBe(body("lib/order-rules.ts"));
  });

  it("adminnew/lib/document-numbers.ts ne diffère que par l'import du schéma admin", () => {
    const rootBody = body("lib/document-numbers.ts");
    // L'alias « adminDocumentSequences as documentSequences » reste interne au projet.
    const adminBody = body("adminnew/lib/document-numbers.ts")
      .replace("adminDocumentSequences as documentSequences", "documentSequences");
    expect(normalize(adminBody)).toBe(normalize(rootBody));
  });

  it("les deux copies documentent leur origine", () => {
    for (const path of ["adminnew/lib/order-rules.ts", "adminnew/lib/document-numbers.ts"]) {
      expect(readFileSync(resolve(root, path), "utf8")).toContain("COPIE SYNCHRONISÉE");
    }
  });

  it("la machine à états n'est pas redéfinie dans l'écran commandes admin", () => {
    const page = readFileSync(resolve(root, "adminnew/app/(admin)/commandes/page.tsx"), "utf8");
    // Une table de transitions locale a déjà existé et divergeait du moteur.
    expect(page).not.toContain("const nextStatuses:");
  });
});

describe("cohérence e-mails / machine à états", () => {
  it("chaque déclencheur de transition a un modèle d'e-mail", async () => {
    const { DEFAULT_EMAIL_TEMPLATES } = await import("../lib/email-render");
    const { ORDER_TRANSITIONS, emailTriggerForTransition } = await import("../lib/order-rules");
    const codes = new Set(DEFAULT_EMAIL_TEMPLATES.map((template) => template.code));
    const triggers = new Set<string>();

    for (const from of Object.keys(ORDER_TRANSITIONS)) {
      for (const to of ORDER_TRANSITIONS[from as keyof typeof ORDER_TRANSITIONS]) {
        const trigger = emailTriggerForTransition(from, to);
        if (trigger) triggers.add(trigger);
      }
    }

    // Un déclencheur sans modèle = client jamais prévenu, silencieusement.
    expect([...triggers].sort()).toEqual(
      ["order_cancelled", "order_delivered", "order_refunded", "order_shipped", "payment_confirmed"],
    );
    for (const trigger of triggers) expect(codes.has(trigger)).toBe(true);
  });
});
