import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";
import { SHOP } from "./lib/shop/config";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Allow the isolated Arena preview origin to load Next.js dev assets/HMR.
  allowedDevOrigins: ["*.e2b.app"],
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com", pathname: "/**" }],
  },
  async redirects() {
    // Anciennes adresses du site (place de marché) : redirigées vers l'équivalent, ou vers l'accueil.
    return [
      { source: "/comment-ca-marche", destination: "/comment-commander", permanent: true },
      { source: "/conditions", destination: "/conditions-de-vente", permanent: true },
      { source: "/vendeur/:path*", destination: "/", permanent: true },
      { source: "/vendeurs/:path*", destination: "/", permanent: true },
      { source: "/boutiques/:path*", destination: "/", permanent: true },
      { source: "/inscription", destination: "/", permanent: true },
      { source: "/connexion", destination: "/", permanent: true },
      { source: "/compte/:path*", destination: "/suivi-commande", permanent: true },
      { source: "/demo-backend/:path*", destination: "/", permanent: true },
      { source: "/messages/:path*", destination: `https://wa.me/${SHOP.whatsappNumber}`, permanent: false },
      { source: "/demande-de-devis", destination: `https://wa.me/${SHOP.whatsappNumber}?text=Bonjour%20MyBigMarket%2C%20je%20souhaite%20un%20devis.`, permanent: false },
    ];
  },
  async headers() {
    const headers = securityHeaders({
      dev: process.env.NODE_ENV === "development",
      preview: process.env.VERCEL_ENV === "preview",
      frameSources: ["https://www.youtube-nocookie.com"],
    });
    return [
      { source: "/:path*", headers },
      // Administration : jamais indexée par les moteurs de recherche.
      { source: "/gestion/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] },
    ];
  },
};

export default nextConfig;
