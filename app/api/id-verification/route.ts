import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { idVerifications, users } from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * POST — Submit ID verification (upload document URL + selfie URL)
 * Body: { documentType, documentUrl, selfieUrl? }
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const { documentType, documentUrl, selfieUrl } = await request.json();

    if (!documentType || !documentUrl) {
      return NextResponse.json(
        { error: "documentType and documentUrl required" },
        { status: 400 }
      );
    }

    const validTypes = ["passport", "drivers_license", "national_id"];
    if (!validTypes.includes(documentType)) {
      return NextResponse.json(
        { error: `documentType must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const db = getDb();

    const [verification] = await db
      .insert(idVerifications)
      .values({
        userId,
        documentType,
        documentUrl,
        selfieUrl: selfieUrl || null,
      })
      .onConflictDoUpdate({
        target: idVerifications.userId,
        set: {
          documentType,
          documentUrl,
          selfieUrl: selfieUrl || null,
          status: "pending",
          reviewedBy: null,
          reviewedAt: null,
          rejectionReason: null,
        },
      })
      .returning();

    return NextResponse.json({ verification }, { status: 201 });
  } catch (error) {
    console.error("ID verification POST error:", error);
    return NextResponse.json(
      { error: "Failed to submit verification" },
      { status: 500 }
    );
  }
}

/**
 * GET — List pending verifications (admin only)
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const db = getDb();

    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const results = await db
      .select({
        id: idVerifications.id,
        userId: idVerifications.userId,
        documentType: idVerifications.documentType,
        documentUrl: idVerifications.documentUrl,
        selfieUrl: idVerifications.selfieUrl,
        status: idVerifications.status,
        createdAt: idVerifications.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(idVerifications)
      .innerJoin(users, eq(idVerifications.userId, users.id))
      .where(eq(idVerifications.status, "pending"))
      .orderBy(desc(idVerifications.createdAt))
      .limit(100);

    return NextResponse.json({ verifications: results });
  } catch (error) {
    console.error("ID verification GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch verifications" },
      { status: 500 }
    );
  }
}

/**
 * PUT — Approve or reject a verification (admin only)
 * Body: { verificationId, action: "approve"|"reject", rejectionReason? }
 */
export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const adminId = payload.id as string;

    const db = getDb();

    const [admin] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, adminId))
      .limit(1);

    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { verificationId, action, rejectionReason } = await request.json();

    if (!verificationId || !action) {
      return NextResponse.json(
        { error: "verificationId and action required" },
        { status: 400 }
      );
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Get the verification to find the userId
    const [verification] = await db
      .select()
      .from(idVerifications)
      .where(eq(idVerifications.id, verificationId))
      .limit(1);

    if (!verification) {
      return NextResponse.json(
        { error: "Verification not found" },
        { status: 404 }
      );
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    await db
      .update(idVerifications)
      .set({
        status: newStatus,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason:
          action === "reject" ? rejectionReason || "Not specified" : null,
      })
      .where(eq(idVerifications.id, verificationId));

    // If approved, mark user as ID verified
    if (action === "approve") {
      await db
        .update(users)
        .set({ idVerified: true })
        .where(eq(users.id, verification.userId));
    }

    return NextResponse.json({ status: newStatus });
  } catch (error) {
    console.error("ID verification PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update verification" },
      { status: 500 }
    );
  }
}
