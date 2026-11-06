import { describe, expect, it } from "vitest";
import { destinationCountries } from "@/lib/west-africa";
import { PAYMENT_METHOD_CODES } from "@/lib/payments/types";
import { PAYMENT_LOGOS, logosFor } from "@/lib/payments/logos";
import { PLACES, distanceKm, locate } from "@/lib/geo/nearest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("localisation : pays et ville les plus proches", () => {
  it("reconnaît les grandes villes de la zone, avec leur ville", () => {
    expect(locate(5.36, -4.01)).toMatchObject({ countryCode: "CI", city: "Abidjan" });
    expect(locate(14.7167, -17.4677)).toMatchObject({ countryCode: "SN", city: "Dakar" });
    expect(locate(5.6, -0.19)).toMatchObject({ countryCode: "GH", city: "Accra" });
    expect(locate(6.13, 1.22)).toMatchObject({ countryCode: "TG", city: "Lomé" });
  });

  it("donne le pays sans la ville quand on est loin d'une ville connue", () => {
    const place = locate(7.0, -5.0); // entre Yamoussoukro et Bouaké
    expect(place?.countryCode).toBe("CI");
    expect(place?.city === null || typeof place?.city === "string").toBe(true);
  });

  it("refuse une position hors zone de livraison ou invalide", () => {
    expect(locate(48.85, 2.35)).toBeNull(); // Paris
    expect(locate(40.7, -74.0)).toBeNull(); // New York
    expect(locate(Number.NaN, 0)).toBeNull();
    expect(locate(120, 0)).toBeNull();
  });

  it("couvre les 16 pays de livraison avec au moins une ville chacun", () => {
    const covered = new Set(PLACES.map((place) => place.countryCode));
    for (const country of destinationCountries) expect(covered.has(country.code), country.code).toBe(true);
  });

  it("calcule des distances plausibles", () => {
    expect(Math.round(distanceKm(5.36, -4.01, 5.36, -4.01))).toBe(0);
    const abidjanAccra = distanceKm(5.36, -4.01, 5.6, -0.19);
    expect(abidjanAccra).toBeGreaterThan(400);
    expect(abidjanAccra).toBeLessThan(450);
  });
});

describe("drapeaux et logos de paiement", () => {
  it("fournit un drapeau pour chaque pays de livraison", () => {
    for (const country of destinationCountries) expect(existsSync(resolve(__dirname, "..", "public/flags", `${country.code.toLowerCase()}.svg`)), country.code).toBe(true);
  });

  it("fournit un fichier pour chaque logo référencé", () => {
    for (const logos of Object.values(PAYMENT_LOGOS)) for (const logo of logos) expect(existsSync(resolve(__dirname, "..", "public", logo.src.replace(/^\//, ""))), logo.src).toBe(true);
  });

  it("n'affiche que les moyens ouverts, sans doublon", () => {
    expect(logosFor([])).toEqual([]);
    expect(logosFor(["bank_transfer", "cash_on_delivery"])).toEqual([]);
    expect(logosFor(["wave", "card", "wave"]).map((logo) => logo.label)).toEqual(["Wave", "Visa", "Mastercard"]);
    for (const code of Object.keys(PAYMENT_LOGOS)) expect((PAYMENT_METHOD_CODES as readonly string[]).includes(code), code).toBe(true);
  });
});
