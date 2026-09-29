import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  const base=process.env.NEXT_PUBLIC_SITE_URL||"https://mybigmarket.example";
  return {rules:{userAgent:"*",allow:"/",disallow:["/admin","/vendeur","/compte","/checkout"]},sitemap:`${base}/sitemap.xml`};
}
