import type { MetadataRoute } from "next";

export const AI_ANSWER_ENGINE_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-Web",
  "ClaudeBot",
  "Anthropic-AI",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "DuckAssistBot",
  "YouBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Share images for hubs and landings are generated under /api/og; card
        // crawlers that honour robots.txt must be able to fetch them.
        allow: ["/", "/llms.txt", "/llms-full.txt", "/api/og"],
        // /auth/signin and /auth/signup are intentionally crawlable —
        // they're public landing pages, not sensitive endpoints. All
        // sensitive auth routes (token links, OAuth callbacks) are
        // under /api/auth and are already blocked via /api.
        disallow: ["/admin", "/operator", "/api", "/dashboard"],
      },
      {
        // Allow AI Answer Engines (OpenAI, Claude, Perplexity, Google, Apple, DuckDuckGo, You.com)
        // to crawl and cite destination guides, hubs, and llms indexes.
        userAgent: AI_ANSWER_ENGINE_BOTS,
        allow: ["/", "/llms.txt", "/llms-full.txt", "/api/og"],
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
