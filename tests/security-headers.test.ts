/**
 * En-têtes de sécurité HTTP : politique de contenu stricte sur notre origine, aucun cadre externe,
 * fonctions sensibles du navigateur coupées, HTTPS imposé hors développement.
 * Le back-office garde une copie identique du module (déploiement séparé).
 */
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";
import storefrontConfig from "@/next.config";

const directive = (policy: string, name: string) => policy.split("; ").find((part) => part.startsWith(`${name} `))?.slice(name.length + 1).split(" ") ?? [];
const asMap = (headers: Array<{ key: string; value: string }>) => Object.fromEntries(headers.map((header) => [header.key.toLowerCase(), header.value]));

describe("en-têtes de sécurité", () => {
  it("limite les ressources à notre origine, sans cadre ni plugin", () => {
    const policy = contentSecurityPolicy({ frameSources: ["https://www.youtube-nocookie.com"] });
    expect(directive(policy, "default-src")).toEqual(["'self'"]);
    expect(directive(policy, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(policy, "script-src").filter((source) => source.startsWith("http"))).toEqual([]);
    expect(directive(policy, "connect-src")).toEqual(["'self'"]);
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "frame-src")).toEqual(["https://www.youtube-nocookie.com"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(policy).toContain("upgrade-insecure-requests");
    // Images : jamais « https: » en vrac, seulement notre origine et le stockage Vercel.
    expect(directive(policy, "img-src")).not.toContain("https:");
    expect(directive(policy, "img-src").filter((source) => source.startsWith("http"))).toEqual(["https://*.public.blob.vercel-storage.com"]);
  });

  it("envoie les en-têtes de transport et d'isolation attendus", () => {
    const headers = asMap(securityHeaders());
    expect(headers["strict-transport-security"]).toContain("max-age=63072000");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["cross-origin-resource-policy"]).toBe("same-site");
    expect(headers["x-permitted-cross-domain-policies"]).toBe("none");
  });

  it("n'assouplit la politique qu'en développement ou en prévisualisation", () => {
    expect(directive(contentSecurityPolicy({ dev: true }), "script-src")).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy({ dev: true })).not.toContain("upgrade-insecure-requests");
    expect(directive(contentSecurityPolicy({ preview: true }), "script-src")).toContain("https://vercel.live");
    expect(directive(contentSecurityPolicy(), "frame-src")).toEqual(["'none'"]);
    expect(asMap(securityHeaders({ dev: true }))["strict-transport-security"]).toBeUndefined();
  });

  it("s'applique à toutes les pages de la boutique", async () => {
    const rules = await storefrontConfig.headers!();
    expect(rules[0].source).toBe("/:path*");
    const headers = asMap(rules[0].headers);
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("https://www.youtube-nocookie.com");
    expect(headers).toMatchObject({ "x-frame-options": "DENY", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "cross-origin-opener-policy": "same-origin" });
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["strict-transport-security"]).toContain("max-age=63072000");
  });
});
