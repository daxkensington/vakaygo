/**
 * Aggressive menu discovery for dining listings
 *
 * Strategies (in order):
 * 1. Crawl homepage for ANY link containing "menu" in text or href
 * 2. Try common menu paths (expanded list including French/Spanish)
 * 3. Detect PDF menu links and store the URL
 * 4. Google search "[restaurant name] [island] menu" for third-party sources
 * 5. Parse text-based menus (item + price patterns)
 * 6. Extract JSON-LD Menu schema
 * 7. Google Places serves_* fields for cuisine metadata
 *
 * Usage: DATABASE_URL=... GOOGLE_PLACES_API_KEY=... npx tsx scripts/discover-menus.ts
 * Options:
 *   --limit=500       Process N listings (default 500)
 *   --dry-run          Report only
 *   --concurrency=3    Parallel requests (default 3)
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const a = args.find((a) => a.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
};
const limit = parseInt(getArg("limit") || "500");
const dryRun = args.includes("--dry-run");
const concurrency = parseInt(getArg("concurrency") || "3");

type MenuItem = { name: string; description?: string; price?: string };
type MenuSection = { section: string; items: MenuItem[] };

interface MenuResult {
  menu: MenuSection[];
  menuPdfUrl?: string;
  cuisineType?: string;
  source: string;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("pdf")) return null; // Don't read PDF body
    return await res.text();
  } catch {
    return null;
  }
}

// ── Strategy 1: Crawl homepage for menu links ─────────────────────────

function findMenuLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  // Find all <a> tags
  const linkPattern = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").trim().toLowerCase();
    const hrefLower = href.toLowerCase();

    // Check if link text or URL suggests a menu
    const isMenuLink =
      text.includes("menu") ||
      text.includes("carte") ||
      text.includes("food") ||
      text.includes("our dishes") ||
      text.includes("what we serve") ||
      text.includes("eat & drink") ||
      text.includes("food & drink") ||
      text.includes("dine") ||
      hrefLower.includes("menu") ||
      hrefLower.includes("carte") ||
      hrefLower.includes("/food") ||
      hrefLower.includes("/dine") ||
      hrefLower.includes("/eat") ||
      hrefLower.includes("/dishes") ||
      hrefLower.includes("/cuisine");

    if (!isMenuLink) continue;

    // Resolve URL
    let fullUrl: string;
    try {
      if (href.startsWith("http")) {
        fullUrl = href;
      } else if (href.startsWith("/")) {
        fullUrl = `${baseUrl}${href}`;
      } else {
        fullUrl = `${baseUrl}/${href}`;
      }
    } catch {
      continue;
    }

    if (!seen.has(fullUrl)) {
      seen.add(fullUrl);
      links.push(fullUrl);
    }
  }

  return links;
}

// ── Strategy 2: Find PDF menu links ───────────────────────────────────

function findPdfMenuLinks(html: string, baseUrl: string): string[] {
  const pdfs: string[] = [];

  // Find .pdf links
  const pdfPattern = /href=["']([^"']+\.pdf[^"']*)["']/gi;
  for (const match of html.matchAll(pdfPattern)) {
    const href = match[1];
    const hrefLower = href.toLowerCase();

    // Only include if it looks menu-related
    if (
      hrefLower.includes("menu") ||
      hrefLower.includes("carte") ||
      hrefLower.includes("food") ||
      hrefLower.includes("drink") ||
      hrefLower.includes("prix") ||
      hrefLower.includes("dine") ||
      hrefLower.includes("brunch") ||
      hrefLower.includes("lunch") ||
      hrefLower.includes("dinner") ||
      hrefLower.includes("breakfast")
    ) {
      try {
        const fullUrl = href.startsWith("http")
          ? href
          : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
        pdfs.push(fullUrl);
      } catch {}
    }
  }

  // Broader: any PDF linked near "menu" text
  const menuContextPdf =
    /<[^>]*menu[^>]*>[\s\S]{0,200}?href=["']([^"']+\.pdf[^"']*)["']/gi;
  for (const match of html.matchAll(menuContextPdf)) {
    try {
      const href = match[1];
      const fullUrl = href.startsWith("http")
        ? href
        : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
      if (!pdfs.includes(fullUrl)) pdfs.push(fullUrl);
    } catch {}
  }

  return pdfs;
}

// ── Strategy 3: Extract JSON-LD menu ──────────────────────────────────

function extractJsonLdMenu(html: string): MenuResult | null {
  const jsonLdMatches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const m of jsonLdMatches) {
    try {
      const ld = JSON.parse(m[1]);
      const type = ld["@type"];

      const cuisineType =
        typeof ld.servesCuisine === "string"
          ? ld.servesCuisine
          : Array.isArray(ld.servesCuisine)
            ? ld.servesCuisine.join(", ")
            : undefined;

      if (
        type === "Restaurant" ||
        type === "FoodEstablishment" ||
        type === "CafeOrCoffeeShop" ||
        type === "BarOrPub"
      ) {
        if (ld.hasMenu) {
          const menu = parseJsonLdMenuObj(ld.hasMenu);
          if (menu.length > 0) {
            return { menu, cuisineType, source: "jsonld" };
          }
          // Menu might be a URL
          if (typeof ld.hasMenu === "string") {
            return { menu: [], menuPdfUrl: ld.hasMenu, cuisineType, source: "jsonld-menu-url" };
          }
        }
        if (cuisineType) {
          return { menu: [], cuisineType, source: "jsonld-cuisine" };
        }
      }

      if (type === "Menu" || type === "MenuSection") {
        const menu = parseJsonLdMenuObj(ld);
        if (menu.length > 0) {
          return { menu, cuisineType, source: "jsonld" };
        }
      }
    } catch {}
  }
  return null;
}

function parseJsonLdMenuObj(obj: any): MenuSection[] {
  if (!obj || typeof obj === "string") return [];

  const sections: MenuSection[] = [];
  const sectionArray = obj.hasMenuSection || obj.menuSection || [];
  const sArr = Array.isArray(sectionArray) ? sectionArray : [sectionArray];

  for (const s of sArr) {
    const items: MenuItem[] = [];
    const iArr = s.hasMenuItem || s.menuItem || s.itemListElement || [];
    const itemArr = Array.isArray(iArr) ? iArr : [iArr];

    for (const item of itemArr) {
      if (item.name) {
        items.push({
          name: item.name,
          description: item.description || undefined,
          price: item.offers?.price
            ? `$${item.offers.price}`
            : item.price
              ? `$${item.price}`
              : undefined,
        });
      }
    }
    if (items.length > 0) {
      sections.push({ section: s.name || "Menu", items });
    }
  }

  // Items directly on menu object
  if (sections.length === 0) {
    const items: MenuItem[] = [];
    const dArr = obj.hasMenuItem || obj.menuItem || obj.itemListElement || [];
    const directArr = Array.isArray(dArr) ? dArr : [dArr];
    for (const item of directArr) {
      if (item.name) {
        items.push({
          name: item.name,
          description: item.description || undefined,
          price: item.offers?.price
            ? `$${item.offers.price}`
            : item.price
              ? `$${item.price}`
              : undefined,
        });
      }
    }
    if (items.length > 0) sections.push({ section: "Menu", items });
  }

  return sections;
}

// ── Strategy 4: Parse menu items from page text ───────────────────────

function extractMenuFromText(html: string): MenuSection[] {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "");

  // Try to find sections by headers
  const sections: MenuSection[] = [];

  // Split by h2/h3 headers to find sections
  const sectionPattern = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  const headers: { name: string; index: number }[] = [];
  for (const m of stripped.matchAll(sectionPattern)) {
    const name = m[1].replace(/<[^>]+>/g, "").trim();
    if (name.length > 1 && name.length < 60) {
      headers.push({ name, index: m.index! });
    }
  }

  // Extract items from full text
  const text = stripped.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  const itemPattern =
    /([A-Z][A-Za-zÀ-ÿ\s&',.\-()\/]+?)\s*(?:[.·…—–\-]{2,}\s*)?(?:\$|USD\s*|US\$|€|EC\$|XCD\s*|BBD\s*|JMD\s*|TTD\s*|BSD\s*|KYD\s*|AWG\s*|ANG\s*|BMD\s*)\s*(\d+(?:[.,]\d{2})?)/g;

  const items: MenuItem[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(itemPattern)) {
    let name = match[1].trim().replace(/\s+/g, " ");
    const price = `$${match[2].replace(",", ".")}`;

    if (name.length < 3 || name.length > 80) continue;
    if (/^\d/.test(name)) continue;
    const lower = name.toLowerCase();
    if (
      lower.includes("copyright") || lower.includes("shipping") ||
      lower.includes("delivery fee") || lower.includes("tax") ||
      lower.includes("total") || lower.includes("subtotal") ||
      lower.includes("default title") || lower.includes("gift card") ||
      lower.includes("add to cart") || lower.includes("checkout") ||
      lower.includes("service charge") || lower.includes("gratuity") ||
      lower.includes("tip") || lower.includes("vat")
    ) continue;

    const key = lower;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({ name, price });
  }

  if (items.length >= 3 && items.length <= 200) {
    return [{ section: "Menu", items: items.slice(0, 60) }];
  }

  return [];
}

// ── Strategy 5: Google Search for menus ───────────────────────────────

async function searchForMenu(
  restaurantName: string,
  island: string
): Promise<MenuResult | null> {
  try {
    const query = encodeURIComponent(`${restaurantName} ${island} menu`);
    const res = await fetch(
      `https://www.google.com/search?q=${query}&num=5`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      }
    );
    if (!res.ok) return null;
    const html = await res.text();

    // Look for TripAdvisor menu links
    const taMatch = html.match(
      /https:\/\/(?:www\.)?tripadvisor\.com\/Restaurant_Review[^"'\s]+/
    );
    if (taMatch) {
      const taPage = await fetchPage(taMatch[0]);
      if (taPage) {
        const taMenu = extractMenuFromText(taPage);
        if (taMenu.length > 0) {
          return { menu: taMenu, source: "tripadvisor" };
        }
      }
    }

    // Look for direct menu page results
    const menuUrls = html.matchAll(
      /https?:\/\/[^"'\s<>]+(?:menu|carte|food-menu)[^"'\s<>]*/gi
    );
    for (const m of menuUrls) {
      const menuPage = await fetchPage(m[0]);
      if (menuPage) {
        const menu = extractMenuFromText(menuPage);
        if (menu.length > 0) {
          return { menu, source: "google-search" };
        }
        const jsonLd = extractJsonLdMenu(menuPage);
        if (jsonLd && jsonLd.menu.length > 0) {
          return { ...jsonLd, source: "google-search-jsonld" };
        }
      }
    }
  } catch {}
  return null;
}

// ── Strategy 6: Google Places serves_* fields ─────────────────────────

async function fetchGoogleCuisineData(
  placeId: string
): Promise<{ cuisineType?: string; servesInfo: string[] } | null> {
  if (!GOOGLE_API_KEY) return null;
  try {
    const fields = [
      "serves_beer", "serves_breakfast", "serves_brunch",
      "serves_dinner", "serves_lunch", "serves_wine",
      "serves_vegetarian_food", "editorial_summary",
    ].join(",");

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`
    );
    const data = await res.json();
    if (data.status !== "OK") return null;

    const r = data.result;
    const servesInfo: string[] = [];
    if (r.serves_breakfast) servesInfo.push("Breakfast");
    if (r.serves_brunch) servesInfo.push("Brunch");
    if (r.serves_lunch) servesInfo.push("Lunch");
    if (r.serves_dinner) servesInfo.push("Dinner");
    if (r.serves_beer) servesInfo.push("Beer");
    if (r.serves_wine) servesInfo.push("Wine");
    if (r.serves_vegetarian_food) servesInfo.push("Vegetarian options");

    return { servesInfo };
  } catch {
    return null;
  }
}

// Extract cuisine from meta/text
function extractCuisineType(html: string): string | undefined {
  const patterns = [
    /servesCuisine[":\s]*["']([^"']+)["']/i,
    /cuisine[:\s]*["']?([A-Za-z\s,&]+)["']?\s*[<"]/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1] && m[1].length > 2 && m[1].length < 50) return m[1].trim();
  }
  return undefined;
}

// ── Main orchestrator ─────────────────────────────────────────────────

async function discoverMenu(
  listing: any
): Promise<MenuResult | null> {
  const td = listing.typeData || {};
  const website = td.website;
  const placeId = td.googlePlaceId;
  let bestResult: MenuResult | null = null;

  if (website) {
    const baseUrl = new URL(website).origin;
    const mainHtml = await fetchPage(website);

    if (mainHtml) {
      // Strategy A: JSON-LD on main page
      const jsonLd = extractJsonLdMenu(mainHtml);
      if (jsonLd?.menu && jsonLd.menu.length > 0) {
        return jsonLd;
      }
      if (jsonLd?.cuisineType) {
        bestResult = jsonLd;
      }

      const mainCuisine = extractCuisineType(mainHtml);

      // Strategy B: Find menu links on the page and follow them
      const menuLinks = findMenuLinks(mainHtml, baseUrl);
      for (const link of menuLinks.slice(0, 5)) {
        const menuHtml = await fetchPage(link);
        if (!menuHtml) continue;

        const jsonLdMenu = extractJsonLdMenu(menuHtml);
        if (jsonLdMenu?.menu && jsonLdMenu.menu.length > 0) {
          return { ...jsonLdMenu, cuisineType: jsonLdMenu.cuisineType || mainCuisine };
        }

        const textMenu = extractMenuFromText(menuHtml);
        if (textMenu.length > 0) {
          return { menu: textMenu, cuisineType: mainCuisine, source: "crawl-text" };
        }
      }

      // Strategy C: Check for PDF menus
      const pdfLinks = findPdfMenuLinks(mainHtml, baseUrl);
      if (pdfLinks.length > 0) {
        return {
          menu: [],
          menuPdfUrl: pdfLinks[0],
          cuisineType: mainCuisine || bestResult?.cuisineType,
          source: "pdf-menu",
        };
      }

      // Strategy D: Try hardcoded paths
      const PATHS = [
        "/menu", "/menus", "/our-menu", "/the-menu", "/food-menu",
        "/restaurant-menu", "/carte", "/la-carte", "/a-la-carte",
        "/dining", "/eat", "/food", "/food-and-drink", "/food-drink",
        "/food-and-beverage", "/eat-and-drink", "/dine", "/dishes",
        "/what-we-serve", "/our-food", "/restaurant", "/bar-menu",
        "/drink-menu", "/drinks", "/lunch-menu", "/dinner-menu",
        "/brunch-menu", "/specials",
      ];

      for (const path of PATHS) {
        const menuHtml = await fetchPage(`${baseUrl}${path}`);
        if (!menuHtml) continue;

        const jsonLdMenu = extractJsonLdMenu(menuHtml);
        if (jsonLdMenu?.menu && jsonLdMenu.menu.length > 0) {
          return { ...jsonLdMenu, cuisineType: jsonLdMenu.cuisineType || mainCuisine };
        }

        const textMenu = extractMenuFromText(menuHtml);
        if (textMenu.length > 0) {
          return { menu: textMenu, cuisineType: mainCuisine, source: "path-text" };
        }
      }

      // Strategy E: Text extraction on main page
      const mainMenu = extractMenuFromText(mainHtml);
      if (mainMenu.length > 0) {
        return { menu: mainMenu, cuisineType: mainCuisine, source: "main-text" };
      }

      if (mainCuisine && !bestResult) {
        bestResult = { menu: [], cuisineType: mainCuisine, source: "cuisine-only" };
      }
    }
  }

  // Strategy F: Google search
  if (!bestResult || bestResult.menu.length === 0) {
    const searchResult = await searchForMenu(listing.title, listing.island);
    if (searchResult && searchResult.menu.length > 0) {
      return {
        ...searchResult,
        cuisineType: searchResult.cuisineType || bestResult?.cuisineType,
      };
    }
  }

  // Strategy G: Google Places serves_* data
  if (placeId && GOOGLE_API_KEY) {
    const googleData = await fetchGoogleCuisineData(placeId);
    if (googleData?.servesInfo && googleData.servesInfo.length > 0) {
      const typeDataUpdate = {
        serves: googleData.servesInfo,
      };
      if (!bestResult) {
        bestResult = { menu: [], source: "google-serves" };
      }
      (bestResult as any).servesInfo = googleData.servesInfo;
    }
  }

  return bestResult;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const db = drizzle(neon(DATABASE_URL));

  const result = await db.execute(sql`
    SELECT l.id, l.title, l.type_data as "typeData",
      i.name as island
    FROM listings l
    JOIN islands i ON i.id = l.island_id
    WHERE l.status = 'active'
      AND l.type = 'dining'
      AND (l.type_data->>'menu' IS NULL OR l.type_data->>'menu' = 'null')
    ORDER BY l.avg_rating DESC NULLS LAST
    LIMIT ${limit}
  `);

  const listings = result.rows as any[];
  console.log(`Found ${listings.length} dining listings without menus\n`);
  if (dryRun) console.log("=== DRY RUN ===\n");

  const stats: Record<string, number> = {};
  let menuItems = 0;
  let pdfMenus = 0;

  for (let i = 0; i < listings.length; i += concurrency) {
    const batch = listings.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (listing: any) => {
        const result = await discoverMenu(listing);

        if (!result) {
          stats.skipped = (stats.skipped || 0) + 1;
          process.stdout.write("-");
          return;
        }

        stats[result.source] = (stats[result.source] || 0) + 1;

        const td = listing.typeData || {};
        const newTd = { ...td };

        if (result.menu.length > 0) {
          newTd.menu = result.menu;
          const count = result.menu.reduce((n, s) => n + s.items.length, 0);
          menuItems += count;
        }
        if (result.menuPdfUrl) {
          newTd.menuPdfUrl = result.menuPdfUrl;
          pdfMenus++;
        }
        if (result.cuisineType) {
          newTd.cuisineType = result.cuisineType;
        }
        if ((result as any).servesInfo) {
          newTd.serves = (result as any).servesInfo;
        }

        if (dryRun) {
          const parts: string[] = [];
          if (result.menu.length > 0) {
            const count = result.menu.reduce((n, s) => n + s.items.length, 0);
            parts.push(`${count} items`);
          }
          if (result.menuPdfUrl) parts.push("PDF");
          if (result.cuisineType) parts.push(`[${result.cuisineType}]`);
          if ((result as any).servesInfo) parts.push(`serves: ${(result as any).servesInfo.join(", ")}`);

          console.log(`  [${result.source}] ${listing.title}: ${parts.join(" | ")}`);
          if (result.menu.length > 0) {
            for (const s of result.menu.slice(0, 1)) {
              for (const item of s.items.slice(0, 3)) {
                console.log(`    - ${item.name}${item.price ? ` ${item.price}` : ""}`);
              }
              if (s.items.length > 3) console.log(`    ... +${s.items.length - 3} more`);
            }
          }
          return;
        }

        await db.execute(sql`
          UPDATE listings
          SET type_data = ${JSON.stringify(newTd)}::jsonb
            ${result.cuisineType ? sql`, cuisine_type = ${result.cuisineType}` : sql``}
          WHERE id = ${listing.id}::uuid
        `);

        process.stdout.write(
          result.menu.length > 0 ? "M" : result.menuPdfUrl ? "P" : result.cuisineType ? "c" : "s"
        );
      })
    );

    await new Promise((r) => setTimeout(r, 500));

    if ((i + concurrency) % 30 < concurrency) {
      const menuCount = Object.entries(stats)
        .filter(([k]) => !["skipped", "cuisine-only", "google-serves", "jsonld-cuisine"].includes(k))
        .reduce((n, [, v]) => n + v, 0);
      console.log(
        `\n[${Math.min(i + concurrency, listings.length)}/${listings.length}] ` +
          `Menus:${menuCount} (${menuItems} items) PDFs:${pdfMenus} Skip:${stats.skipped || 0}`
      );
    }
  }

  console.log(`\n\n=== MENU DISCOVERY COMPLETE ===`);
  console.log(`Total menu items found: ${menuItems}`);
  console.log(`PDF menus found: ${pdfMenus}`);
  console.log(`\nBy source:`);
  for (const [source, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source}: ${count}`);
  }
}

main().catch(console.error);
