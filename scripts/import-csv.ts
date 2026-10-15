/**
 * CSV Import Script
 * Import businesses from CSV files (tourism board lists, chamber of commerce, etc.)
 *
 * CSV format:
 * name,type,address,parish,phone,website,description,category
 *
 * Types: stay, tour, dining, event, transport, guide
 *
 * Usage: DATABASE_URL=... npx tsx scripts/import-csv.ts data/grenada-businesses.csv
 */

import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 200);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let value = "";
  let inQuotes = false;
  let quoted = false;
  let closed = false;

  const finishField = () => {
    fields.push(quoted ? value : value.trim());
    value = "";
    quoted = false;
    closed = false;
  };

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          inQuotes = false;
          closed = true;
        }
      } else {
        value += char;
      }
    } else if (char === ",") {
      finishField();
    } else if (closed) {
      if (char.trim() !== "") {
        throw new Error("Unexpected character after closing quote");
      }
    } else if (char === '"') {
      if (value.trim() !== "") {
        throw new Error("Unexpected quote in unquoted field");
      }
      value = "";
      quoted = true;
      inQuotes = true;
    } else {
      value += char;
    }
  }

  if (inQuotes) {
    throw new Error("Unterminated quoted field (quoted newlines are unsupported)");
  }
  finishField();
  return fields;
}

function parseCsv(content: string): { rows: Record<string, string>[]; rejected: number } {
  const lines = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  const headerIndex = lines.findIndex((line) => line.trim() !== "");
  const rows: Record<string, string>[] = [];
  let rejected = 0;

  if (headerIndex === -1) {
    return { rows, rejected };
  }

  const headers = parseCsvLine(lines[headerIndex]).map((h) => h.trim().toLowerCase());
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      continue;
    }

    let values: string[];
    try {
      values = parseCsvLine(line);
    } catch (err) {
      rejected++;
      console.warn(`Rejected CSV line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (values.length !== headers.length) {
      rejected++;
      console.warn(`Rejected CSV line ${i + 1}: expected ${headers.length} columns, got ${values.length}`);
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((h, index) => {
      row[h] = values[index] || "";
    });
    rows.push(row);
  }
  return { rows, rejected };
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-csv.ts <path-to-csv>");
    console.error("\nCSV format: name,type,address,parish,phone,website,description,category");
    process.exit(1);
  }

  const content = readFileSync(csvPath, "utf-8");
  const { rows, rejected } = parseCsv(content);
  console.log(`Found ${rows.length} businesses in CSV`);

  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  // Get Grenada
  const [grenada] = await db
    .select({ id: islands.id })
    .from(islands)
    .where(eq(islands.slug, "grenada"))
    .limit(1);

  if (!grenada) {
    console.error("Grenada island not found. Run seed script first.");
    process.exit(1);
  }

  // Get unclaimed operator
  let [unclaimedOperator] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "unclaimed@vakaygo.com"))
    .limit(1);

  if (!unclaimedOperator) {
    [unclaimedOperator] = await db
      .insert(users)
      .values({
        email: "unclaimed@vakaygo.com",
        name: "Unclaimed Listing",
        role: "operator",
        businessName: "Unclaimed — Claim Your Business",
        islandId: grenada.id,
      })
      .returning({ id: users.id });
  }

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.name) {
      skipped++;
      continue;
    }

    const validTypes = ["stay", "tour", "dining", "event", "transport", "guide"];
    const type = validTypes.includes(row.type) ? row.type : "tour";
    const slug = slugify(row.name);

    // Skip duplicates
    const existing = await db
      .select({ id: listings.id })
      .from(listings)
      .where(eq(listings.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    try {
      await db.insert(listings).values({
        operatorId: unclaimedOperator.id,
        islandId: grenada.id,
        type: type as "stay" | "tour" | "dining" | "event" | "transport" | "guide",
        status: "active",
        title: row.name,
        slug,
        headline: `Discover ${row.name} in Grenada`,
        description:
          row.description ||
          `${row.name} is a ${row.category || type} located in ${row.parish || "Grenada"}. This listing was created from public records — the owner can claim it for free.`,
        address: row.address || null,
        parish: row.parish || null,
        typeData: {
          unclaimed: true,
          phone: row.phone || null,
          website: row.website || null,
          category: row.category || null,
          source: "csv-import",
        },
        isFeatured: false,
        isInstantBook: false,
      });
      imported++;
      console.log(`✓ ${row.name} (${type})`);
    } catch (err) {
      console.error(`✗ Failed: ${row.name}`, err);
    }
  }

  console.log(`\n=== Import Complete ===`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Rejected (malformed): ${rejected}`);
}

main().catch(console.error);
