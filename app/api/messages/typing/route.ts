import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

// Volatile in-memory typing state: key = "senderId:receiverId", value = expiry timestamp
const typingState = new Map<string, number>();

// Clean expired entries periodically
function cleanExpired() {
  const now = Date.now();
  for (const [key, expiry] of typingState) {
    if (expiry < now) typingState.delete(key);
  }
}

/**
 * POST — Set typing indicator for current user toward a receiver
 * Body: { receiverId: string }
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const senderId = payload.id as string;

    const { receiverId } = await request.json();
    if (!receiverId) {
      return NextResponse.json({ error: "receiverId required" }, { status: 400 });
    }

    // Store typing state with 5-second expiry
    const key = `${senderId}:${receiverId}`;
    typingState.set(key, Date.now() + 5000);

    // Lazy cleanup
    cleanExpired();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Typing POST error:", error);
    return NextResponse.json({ error: "Failed to set typing state" }, { status: 500 });
  }
}

/**
 * GET — Check if someone is typing to the current user
 * Query: ?senderId=xxx
 */
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const receiverId = payload.id as string;

    const { searchParams } = new URL(request.url);
    const senderId = searchParams.get("senderId");

    if (!senderId) {
      return NextResponse.json({ error: "senderId required" }, { status: 400 });
    }

    const key = `${senderId}:${receiverId}`;
    const expiry = typingState.get(key);
    const isTyping = expiry !== undefined && expiry > Date.now();

    // Clean up if expired
    if (expiry !== undefined && expiry <= Date.now()) {
      typingState.delete(key);
    }

    return NextResponse.json({ isTyping });
  } catch (error) {
    console.error("Typing GET error:", error);
    return NextResponse.json({ error: "Failed to check typing state" }, { status: 500 });
  }
}
