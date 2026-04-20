/**
 * Null out implausibly-low and implausibly-high prices flagged by
 * audit-prices.ts. Wrong price is worse than no price — travelers can
 * contact operators for "Price on request" but booking a $14/night
 * 5-star resort by mistake is a refund nightmare.
 *
 *   DATABASE_URL=... npx tsx scripts/fix-audit-prices.ts
 * Options:
 *   --dry-run        Report what would change, don't write
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL!;
const dryRun = process.argv.includes("--dry-run");

// Mirror audit-prices.ts floors — same thresholds, same exclusions.
const FLOOR: Record<string, number> = {
  stay: 25, tour: 10, excursion: 15, dining: 5, event: 5,
  transport: 10, transfer: 15, vip: 50, guide: 30, spa: 25,
};
const CEIL: Record<string, number> = {
  stay: 5000, tour: 2000, excursion: 2000, dining: 300, event: 1000,
  transport: 1500, transfer: 500, vip: 5000, guide: 1000, spa: 500,
};

async function main() {
  const sql = neon(DATABASE_URL);

  const rows = (await sql`
    SELECT l.id::text as id, l.title, l.type::text as type,
           l.price_amount::text as price, l.price_currency, l.price_unit,
           i.name as island
    FROM listings l JOIN islands i ON i.id = l.island_id
    WHERE l.status = 'active' AND l.price_amount IS NOT NULL AND l.price_amount > 0
  `) as unknown as Array<{
    id: string; title: string; type: string; price: string;
    price_currency: string | null; price_unit: string | null; island: string;
  }>;

  const toNull: Array<{ id: string; title: string; reason: string }> = [];
  for (const r of rows) {
    const p = parseFloat(r.price);
    const floor = FLOOR[r.type];
    const ceil = CEIL[r.type];
    if (floor && p < floor) {
      toNull.push({
        id: r.id,
        title: r.title,
        reason: `$${p} < floor $${floor} for ${r.type} (${r.island})`,
      });
    } else if (ceil && p > ceil) {
      toNull.push({
        id: r.id,
        title: r.title,
        reason: `$${p} > ceiling $${ceil} for ${r.type} (${r.island})`,
      });
    }
  }

  console.log(`Would null ${toNull.length} prices${dryRun ? " (dry-run)" : ""}\n`);
  for (const t of toNull.slice(0, 30)) {
    console.log(`  ${t.title}: ${t.reason}`);
  }
  if (toNull.length > 30) console.log(`  ... ${toNull.length - 30} more`);

  if (dryRun) return;

  // Batch-null the prices
  for (const t of toNull) {
    await sql`
      UPDATE listings
      SET price_amount = NULL, updated_at = NOW()
      WHERE id = ${t.id}::uuid
    `;
  }
  console.log(`\nNulled ${toNull.length} prices.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
