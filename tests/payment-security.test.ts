import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAYMENT_METHODS } from "@/lib/shop/config";
import { cleanText, orderSchema } from "@/lib/shop/orders";

describe("paiement : aucune donnée de carte ne passe par la boutique", () => {
  const form = readFileSync("components/shop/checkout-form.tsx", "utf8");
  it("le formulaire de commande ne demande que des moyens mobile money, jamais de numéro de carte ni de code", () => {
    expect(form).not.toMatch(/cvv|cvc|card[-_ ]?number|numéro de carte|expir/i);
    expect(form).toContain("PAYMENT_METHODS");
    expect(PAYMENT_METHODS.map((method) => method.code).sort()).toEqual(["moov_money", "mtn_momo", "orange_money", "wave"]);
  });
  it("le schéma de commande n'accepte aucun champ de carte", () => {
    const parsed = orderSchema.safeParse({ name: "Awa Koné", phone: "0712345678", commune: "Cocody", address: "Riviera, rue 12", payment: "wave", cart: [{ slug: "lit", qty: 1 }], cardNumber: "4111111111111111", cvv: "123" });
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.success ? parsed.data : {})).not.toMatch(/4111|cvv|cardNumber/);
  });
});

describe("saisies clients : nettoyage côté serveur", () => {
  it("retire les chevrons et les caractères de contrôle", () => {
    expect(cleanText("<script>alert(1)</script>\u0000 Awa")).not.toMatch(/[<>\u0000]/);
    expect(cleanText("  Awa   Koné \n")).toBe("Awa Koné");
  });
  it("applique le nettoyage au nom, à l'adresse et à la note de la commande", () => {
    const parsed = orderSchema.parse({ name: "Awa <b>Koné</b>", phone: "0712345678", commune: "Cocody", address: "Riviera <img src=x onerror=alert(1)> rue 12", note: "Appeler <svg/onload=1>", payment: "wave", cart: [{ slug: "lit", qty: 1 }] });
    for (const value of [parsed.name, parsed.address, parsed.note]) expect(value).not.toMatch(/[<>]/);
  });
});
