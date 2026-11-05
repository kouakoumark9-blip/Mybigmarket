import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  // Photos produit : réduites dans le navigateur (2 000 px) puis envoyées une par une.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async headers() {
    const headers = securityHeaders({ dev: process.env.NODE_ENV === "development", preview: process.env.VERCEL_ENV === "preview" }).map((header) => (header.key === "Referrer-Policy" ? { ...header, value: "same-origin" } : header));
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" }, ...headers] }];
  },
};

export default nextConfig;
