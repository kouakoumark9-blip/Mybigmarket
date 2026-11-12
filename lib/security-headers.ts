/**
 * En-têtes de sécurité HTTP de la boutique (appliqués à toutes les réponses par next.config.ts).
 *
 * - Content-Security-Policy : ressources limitées à notre origine. Exceptions :
 *   - images du stockage de fichiers Vercel (https://*.public.blob.vercel-storage.com) ;
 *   - vidéos YouTube sans cookie (blocs CMS) ;
 *   - barre d'outils Vercel, sur les déploiements de prévisualisation seulement.
 *   Les scripts en ligne restent permis : Next.js les utilise pour hydrater les pages statiques.
 * - Aucun cadre externe (frame-ancestors 'none' + X-Frame-Options), pas de détection de type MIME,
 *   référent réduit, fonctions sensibles du navigateur coupées, HTTPS imposé en production.
 */
export type SecurityHeaderOptions = {
  /** Développement local : évaluation de scripts et WebSocket de rechargement à chaud. */
  dev?: boolean;
  /** Déploiement de prévisualisation Vercel : barre d'outils de commentaires. */
  preview?: boolean;
  /** Origines supplémentaires pour les cadres (ex. vidéos). */
  frameSources?: string[];
};

const VERCEL_TOOLBAR = { script: ["https://vercel.live"], connect: ["https://vercel.live", "wss://ws-us3.pusher.com"], img: ["https://vercel.live", "https://vercel.com"], frame: ["https://vercel.live"], font: ["https://vercel.live", "https://assets.vercel.com"] };

export function contentSecurityPolicy(options: SecurityHeaderOptions = {}): string {
  const toolbar = options.preview ? VERCEL_TOOLBAR : { script: [], connect: [], img: [], frame: [], font: [] };
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(options.dev ? ["'unsafe-eval'"] : []), ...toolbar.script],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Images : notre origine et le stockage de fichiers Vercel seulement (plus « tout https : » : une image tierce ne peut plus servir à exfiltrer des données).
    "img-src": ["'self'", "data:", "blob:", "https://*.public.blob.vercel-storage.com", ...toolbar.img],
    "font-src": ["'self'", "data:", ...toolbar.font],
    "connect-src": ["'self'", ...(options.dev ? ["ws:", "wss:"] : []), ...toolbar.connect],
    "media-src": ["'self'", "blob:"],
    "frame-src": [...(options.frameSources ?? []), ...toolbar.frame],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };
  const parts = Object.entries(directives).map(([name, sources]) => `${name} ${sources.length ? sources.join(" ") : "'none'"}`);
  if (!options.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), browsing-topics=()";

export function securityHeaders(options: SecurityHeaderOptions = {}): Array<{ key: string; value: string }> {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-site" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    ...(options.dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
