import { NextResponse } from "next/server";
import { verifySession } from "@/server/admin-auth";
import { getUserById } from "@/server/auth";

export async function GET() {
  const session = await verifySession();
  const user = session ? await getUserById(session.userId) : null;
  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
