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
      {
        // Allow AI Answer Engines (Perplexity, ChatGPT, Claude) to discover & cite Caribbean travel
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "PerplexityBot",
          "ClaudeBot",
          "Anthropic-AI",
          "Applebot-Extended",
          "Google-Extended",
        ],
        allow: ["/", "/llms.txt"],
        disallow: ["/admin", "/operator", "/api", "/dashboard"],
      },
      {
        // Block aggressive scrapers
        userAgent: ["Bytespider", "CCBot", "SemrushBot", "AhrefsBot", "MJ12bot"],
        disallow: "/",
      },
    ],
    sitemap: "https://vakaygo.com/sitemap.xml",
  };
}
