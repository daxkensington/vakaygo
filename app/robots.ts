import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/operator", "/api", "/auth"],
      },
    ],
    sitemap: "https://vakaygo.com/sitemap.xml",
  };
}
