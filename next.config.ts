import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Allow the isolated Arena preview origin to load Next.js dev assets/HMR.
  allowedDevOrigins: ["*.e2b.app"],
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com", pathname: "/**" }],
  },
};

export default nextConfig;
