/**
 * Generate unique, grounded descriptions using Grok (grok-3-mini) for
 * listings that:
 *   - share a description with one or more other listings (duplicates)
 *   - have an empty or near-empty description (<50 chars) after the
 *     standard enrich pass couldn't find a website/editorial source.
 *
 * Each description is written from known facts only (title, type,
 * island, parish, Google types, rating, review count, hours,
 * cuisine). No made-up details, no marketing fluff, no price claims.
 *
 * Usage:
 *   DATABASE_URL=... GROK_API_KEY=... npx tsx scripts/generate-descriptions-llm.ts
 * Options:
 *   --limit=N          Only process N listings (default: all)
 *   --target=dup|empty|both   Which set to target (default: both)
 *   --dry-run          Print generated text, don't write DB
 *   --concurrency=3    Parallel requests (default 3, Grok rate limit)
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL!;
const GROK_KEY = process.env.GROK_API_KEY || "";

const args = process.argv.slice(2);
const getArg = (n: string) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=")[1] : null;
};
const limit = parseInt(getArg("limit") || "0");
const target = (getArg("target") || "both") as "dup" | "empty" | "both";
const dryRun = args.includes("--dry-run");
const concurrency = parseInt(getArg("concurrency") || "3");

type Row = {
  id: string;
  title: string;
  type: string;
  description: string | null;
  parish: string | null;
  avg_rating: string | null;
  review_count: number | null;
  island_name: string;
  address: string | null;
  type_data: Record<string, unknown> | null;
  cuisine_type: string | null;
  operating_hours: unknown;
};

async function grokChat(system: string, user: string): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROK_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-3-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 220,
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    throw new Error(`Grok ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function buildUserPrompt(r: Row): string {
  const td = (r.type_data || {}) as Record<string, unknown>;
  const gTypes = (td.types || td.googleTypes || []) as string[];
  const website = (td.website || td.websiteUri) as string | undefined;
  const phone = (td.phone || td.internationalPhoneNumber) as string | undefined;

  const facts: string[] = [
    `Name: ${r.title}`,
    `Type: ${r.type}`,
    `Island: ${r.island_name}`,
  ];
  if (r.parish) facts.push(`Parish/area: ${r.parish}`);
  if (r.address) facts.push(`Address: ${r.address}`);
  if (r.cuisine_type) facts.push(`Cuisine: ${r.cuisine_type}`);
  if (r.avg_rating && parseFloat(r.avg_rating) > 0) {
    facts.push(
      `Rating: ${parseFloat(r.avg_rating).toFixed(1)} / 5` +
        (r.review_count ? ` (${r.review_count} reviews)` : ""),
    );
  }
  if (gTypes.length)
    facts.push(`Google categories: ${gTypes.slice(0, 6).join(", ")}`);
  if (phone) facts.push("Phone available");
  if (website) facts.push("Website available");
  if (r.description && r.description.trim().length > 20) {
    facts.push(
      `Current text (may be shared with other listings; rewrite to make it specific to THIS one): "${r.description.trim().replace(/\s+/g, " ").slice(0, 400)}"`,
    );
  }
  return facts.join("\n");
}

const SYSTEM_PROMPT = `You write accurate 2-3 sentence descriptions for a Caribbean travel listings database. Rules:

- Use ONLY the facts provided. Do not invent amenities, prices, distances, or history.
- Do NOT start with "Experience", "Discover", "Nestled", "Immerse", or other marketing fluff.
- Do NOT say "perfect for any occasion" or "something for everyone" or "breathtaking views".
- Use the listing name (or a natural abbreviation) in the first sentence.
- Mention the specific island and parish/area if provided.
- Keep it concise (2-3 sentences, 40-90 words total). No headings, no bullet points, no hashtags.
- Write in neutral present tense. Factual and direct.
- Do not include the phone number, website URL, or rating stars in the text.
- Only mention the rating if it's 4.5+, and phrase it as "well-rated" or "highly-rated" rather than quoting the number.`;

async function main() {
  if (!GROK_KEY) {
    console.error("Missing GROK_API_KEY");
    process.exit(1);
  }
  const sql = neon(DATABASE_URL);

  // Build the target set
  const rows: Row[] = [];

  if (target === "dup" || target === "both") {
    const dups = (await sql`
      WITH groups AS (
        SELECT description as shared, COUNT(*) as n
        FROM listings
        WHERE status = 'active'
          AND description IS NOT NULL
          AND LENGTH(description) > 100
        GROUP BY description
        HAVING COUNT(*) > 1
      )
      SELECT l.id::text as id, l.title, l.type::text as type,
             l.description, l.parish,
             l.avg_rating::text as avg_rating, l.review_count,
             l.address, l.type_data, l.cuisine_type, l.operating_hours,
             i.name as island_name
      FROM listings l
      JOIN islands i ON i.id = l.island_id
      JOIN groups g ON g.shared = l.description
      WHERE l.status = 'active'
      ORDER BY l.id
    `) as unknown as Row[];
    rows.push(...dups);
  }

  if (target === "empty" || target === "both") {
    const empty = (await sql`
      SELECT l.id::text as id, l.title, l.type::text as type,
             l.description, l.parish,
             l.avg_rating::text as avg_rating, l.review_count,
             l.address, l.type_data, l.cuisine_type, l.operating_hours,
             i.name as island_name
      FROM listings l
      JOIN islands i ON i.id = l.island_id
      WHERE l.status = 'active'
        AND (l.description IS NULL OR LENGTH(TRIM(l.description)) < 50)
      ORDER BY l.id
    `) as unknown as Row[];
    // Dedupe by id in case there was overlap
    const seen = new Set(rows.map((r) => r.id));
    for (const e of empty) if (!seen.has(e.id)) rows.push(e);
  }

  const targets = limit > 0 ? rows.slice(0, limit) : rows;
  console.log(`Generating ${targets.length} descriptions via Grok...${dryRun ? " (dry-run)" : ""}\n`);

  let ok = 0;
  let fail = 0;

  // Process in parallel waves (simple semaphore)
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const i = cursor++;
      const r = targets[i];
      try {
        const userPrompt = buildUserPrompt(r);
        const text = await grokChat(SYSTEM_PROMPT, userPrompt);
        const cleaned = text
          .replace(/^[""']|[""']$/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (cleaned.length < 40) {
          fail++;
          process.stdout.write("x");
          continue;
        }
        if (dryRun) {
          console.log(`\n[${i + 1}/${targets.length}] ${r.title} (${r.island_name}, ${r.type})`);
          console.log(`  -> ${cleaned}`);
        } else {
          await sql`
            UPDATE listings
            SET description = ${cleaned}, updated_at = NOW()
            WHERE id = ${r.id}::uuid
          `;
        }
        ok++;
        process.stdout.write(".");
      } catch (e) {
        fail++;
        process.stdout.write("X");
        if (fail < 5) console.error(`\n  err ${r.title}: ${(e as Error).message.slice(0, 120)}`);
      }
      // Gentle rate limit
      await new Promise((r) => setTimeout(r, 150));
      if ((i + 1) % 20 === 0) {
        process.stdout.write(`\n[${i + 1}/${targets.length}] ok=${ok} fail=${fail}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`\n\nDone. ok=${ok} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
