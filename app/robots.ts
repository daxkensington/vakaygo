import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /auth/signin and /auth/signup are intentionally crawlable —
        // they're public landing pages, not sensitive endpoints. All
        // sensitive auth routes (token links, OAuth callbacks) are
        // under /api/auth and are already blocked via /api.
        disallow: ["/admin", "/operator", "/api", "/dashboard"],
      },
    ],
    sitemap: "https://vakaygo.com/sitemap.xml",
  };
}
