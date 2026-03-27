/**
 * Caribbean Islands Seed Script
 * Creates all target islands in the database
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands } from "../drizzle/schema";

const DATABASE_URL = process.env.DATABASE_URL!;

const caribbeanIslands = [
  { slug: "trinidad-and-tobago", name: "Trinidad & Tobago", country: "Trinidad and Tobago", latitude: "10.6918", longitude: "-61.2225", currency: "TTD", timezone: "America/Port_of_Spain" },
  { slug: "barbados", name: "Barbados", country: "Barbados", latitude: "13.1939", longitude: "-59.5432", currency: "BBD", timezone: "America/Barbados" },
  { slug: "st-lucia", name: "St. Lucia", country: "Saint Lucia", latitude: "13.9094", longitude: "-60.9789", currency: "XCD", timezone: "America/St_Lucia" },
  { slug: "st-vincent", name: "St. Vincent & the Grenadines", country: "Saint Vincent and the Grenadines", latitude: "13.2528", longitude: "-61.1971", currency: "XCD", timezone: "America/St_Vincent" },
  { slug: "antigua", name: "Antigua & Barbuda", country: "Antigua and Barbuda", latitude: "17.0608", longitude: "-61.7964", currency: "XCD", timezone: "America/Antigua" },
  { slug: "dominica", name: "Dominica", country: "Dominica", latitude: "15.4150", longitude: "-61.3710", currency: "XCD", timezone: "America/Dominica" },
  { slug: "jamaica", name: "Jamaica", country: "Jamaica", latitude: "18.1096", longitude: "-77.2975", currency: "JMD", timezone: "America/Jamaica" },
  { slug: "bahamas", name: "The Bahamas", country: "Bahamas", latitude: "25.0343", longitude: "-77.3963", currency: "BSD", timezone: "America/Nassau" },
  { slug: "turks-and-caicos", name: "Turks & Caicos", country: "Turks and Caicos Islands", latitude: "21.6940", longitude: "-71.7979", currency: "USD", timezone: "America/Grand_Turk" },
  { slug: "cayman-islands", name: "Cayman Islands", country: "Cayman Islands", latitude: "19.3133", longitude: "-81.2546", currency: "KYD", timezone: "America/Cayman" },
  { slug: "aruba", name: "Aruba", country: "Aruba", latitude: "12.5211", longitude: "-69.9683", currency: "AWG", timezone: "America/Aruba" },
  { slug: "curacao", name: "Curaçao", country: "Curaçao", latitude: "12.1696", longitude: "-68.9900", currency: "ANG", timezone: "America/Curacao" },
  { slug: "bonaire", name: "Bonaire", country: "Bonaire", latitude: "12.1443", longitude: "-68.2655", currency: "USD", timezone: "America/Kralendijk" },
  { slug: "st-kitts", name: "St. Kitts & Nevis", country: "Saint Kitts and Nevis", latitude: "17.3578", longitude: "-62.7830", currency: "XCD", timezone: "America/St_Kitts" },
  { slug: "martinique", name: "Martinique", country: "Martinique", latitude: "14.6415", longitude: "-61.0242", currency: "EUR", timezone: "America/Martinique" },
  { slug: "guadeloupe", name: "Guadeloupe", country: "Guadeloupe", latitude: "16.2650", longitude: "-61.5510", currency: "EUR", timezone: "America/Guadeloupe" },
  { slug: "us-virgin-islands", name: "US Virgin Islands", country: "US Virgin Islands", latitude: "18.3358", longitude: "-64.8963", currency: "USD", timezone: "America/Virgin" },
  { slug: "british-virgin-islands", name: "British Virgin Islands", country: "British Virgin Islands", latitude: "18.4207", longitude: "-64.6400", currency: "USD", timezone: "America/Tortola" },
  { slug: "puerto-rico", name: "Puerto Rico", country: "Puerto Rico", latitude: "18.2208", longitude: "-66.5901", currency: "USD", timezone: "America/Puerto_Rico" },
  { slug: "dominican-republic", name: "Dominican Republic", country: "Dominican Republic", latitude: "18.7357", longitude: "-70.1627", currency: "DOP", timezone: "America/Santo_Domingo" },
];

async function main() {
  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  let created = 0;
  for (const island of caribbeanIslands) {
    const result = await db
      .insert(islands)
      .values({
        ...island,
        region: "Caribbean",
        isActive: true,
        sortOrder: created + 2,
      })
      .onConflictDoNothing({ target: islands.slug })
      .returning({ id: islands.id });

    if (result.length > 0) {
      created++;
      console.log(`✓ ${island.name}`);
    } else {
      console.log(`  Skip: ${island.name} (exists)`);
    }
  }

  console.log(`\nCreated ${created} Caribbean islands`);
}

main().catch(console.error);
