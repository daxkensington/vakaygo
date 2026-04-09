import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { operatorTeamMembers, users } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

async function getOperatorId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.id as string;
  } catch {
    return null;
  }
}

/**
 * GET — List operator's team members
 */
export async function GET() {
  try {
    const operatorId = await getOperatorId();
    if (!operatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const members = await db
      .select({
        id: operatorTeamMembers.id,
        memberId: operatorTeamMembers.memberId,
        role: operatorTeamMembers.role,
        permissions: operatorTeamMembers.permissions,
        createdAt: operatorTeamMembers.createdAt,
        memberName: users.name,
        memberEmail: users.email,
        memberAvatar: users.avatarUrl,
      })
      .from(operatorTeamMembers)
      .innerJoin(users, eq(operatorTeamMembers.memberId, users.id))
      .where(eq(operatorTeamMembers.operatorId, operatorId));

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Team GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch team members" },
      { status: 500 }
    );
  }
}

/**
 * POST — Invite a team member by email
 * Body: { email, role?: "cohost"|"staff", permissions?: string[] }
 */
export async function POST(request: Request) {
  try {
    const operatorId = await getOperatorId();
    if (!operatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, role, permissions } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const db = getDb();

    // Find the user by email
    const [member] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!member) {
      return NextResponse.json(
        { error: "No user found with that email. They must sign up first." },
        { status: 404 }
      );
    }

    if (member.id === operatorId) {
      return NextResponse.json(
        { error: "Cannot add yourself as a team member" },
        { status: 400 }
      );
    }

    // Check if already a member
    const existing = await db
      .select()
      .from(operatorTeamMembers)
      .where(
        and(
          eq(operatorTeamMembers.operatorId, operatorId),
          eq(operatorTeamMembers.memberId, member.id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "User is already a team member" },
        { status: 409 }
      );
    }

    const [teamMember] = await db
      .insert(operatorTeamMembers)
      .values({
        operatorId,
        memberId: member.id,
        role: role || "cohost",
        permissions: permissions || [
          "manage_listings",
          "view_bookings",
          "reply_messages",
        ],
      })
      .returning();

    return NextResponse.json({ member: teamMember }, { status: 201 });
  } catch (error) {
    console.error("Team POST error:", error);
    return NextResponse.json(
      { error: "Failed to add team member" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Remove a team member
 * Query: ?id=xxx (team member row id)
 */
export async function DELETE(request: Request) {
  try {
    const operatorId = await getOperatorId();
    if (!operatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getDb();

    const deleted = await db
      .delete(operatorTeamMembers)
      .where(
        and(
          eq(operatorTeamMembers.id, id),
          eq(operatorTeamMembers.operatorId, operatorId)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Team DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to remove team member" },
      { status: 500 }
    );
  }
}
