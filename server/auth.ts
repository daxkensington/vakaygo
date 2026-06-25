import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { users } from "@/drizzle/schema";
import bcrypt from "bcryptjs";

function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql);
}

export async function createUser(
  email: string,
  password: string,
  name: string,
  role: "traveler" | "operator" = "traveler"
) {
  const db = getDb();
  const passwordHash = await bcrypt.hash(password, 12);

  // SECURITY: defense-in-depth — never persist a privileged role from a
  // self-registration path. Only "operator" or "traveler" are ever accepted;
  // anything else (e.g. an injected "admin") collapses to "traveler".
  const safeRole: "traveler" | "operator" =
    role === "operator" ? "operator" : "traveler";

  const [user] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      name,
      role: safeRole,
      passwordHash,
      emailVerified: false,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    });

  return user;
}

export async function verifyCredentials(email: string, password: string) {
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user || !user.passwordHash) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    businessName: user.businessName,
    // Returned so the sign-in route can enforce a 2FA challenge before
    // minting a session. totpSecret never leaves the server.
    totpEnabled: user.totpEnabled ?? false,
    totpSecret: user.totpSecret ?? null,
  };
}

export async function getUserById(id: string) {
  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      avatarUrl: users.avatarUrl,
      businessName: users.businessName,
      islandId: users.islandId,
      onboardingComplete: users.onboardingComplete,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user || null;
}
