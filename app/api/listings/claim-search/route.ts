import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 100) return NextResponse.json({ error: "Enter a business name between 2 and 100 characters." }, { status: 400 });
  try {
    const db = neon(process.env.DATABASE_URL!);
    const listings = await db.query(`SELECT l.id,l.title,l.slug,l.address,i.slug "islandSlug",i.name "islandName",
      vakaygo_listing_claim_verified(l.id) "claimVerified"
      FROM listings l JOIN islands i ON i.id=l.island_id
      WHERE l.status='active' AND i.is_active=true AND l.operator_id<>'197d8586-7fd3-4999-91de-a50ad7d70e23'
      AND strpos(lower(l.title),lower($1))>0 ORDER BY l.title,l.id LIMIT 12`, [q]);
    return NextResponse.json({ listings }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch { return NextResponse.json({ error: "Business search is temporarily unavailable. Please try again." }, { status: 503 }); }
}
