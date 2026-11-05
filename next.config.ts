import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Allow the isolated Arena preview origin to load Next.js dev assets/HMR.
  allowedDevOrigins: ["*.e2b.app"],
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com", pathname: "/**" }],
  },
  async headers() {
    const headers = securityHeaders({
      dev: process.env.NODE_ENV === "development",
      preview: process.env.VERCEL_ENV === "preview",
      frameSources: ["https://www.youtube-nocookie.com"],
    });
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
