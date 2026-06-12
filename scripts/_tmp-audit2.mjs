import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT m.url, m.is_primary FROM media m JOIN listings l ON l.id=m.listing_id WHERE l.slug='the-coco-caf-aruba' ORDER BY m.sort_order LIMIT 5`;
console.log(JSON.stringify(rows.map(r => ({u: r.url.slice(0,80), p: r.is_primary}))));
