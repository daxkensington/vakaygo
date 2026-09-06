import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import type { SessionClaims } from "./session-validation";

export type EmailIdentity = Omit<SessionClaims, "name"> & {
  name: string | null; requiresTwoFactor: boolean; credentialsReset: boolean;
};
/** Called only after a verified external provider has proved this user's email. */
export async function establishEmailIdentity(userId: string): Promise<EmailIdentity | null> {
  const query = neon(process.env.DATABASE_URL!);
  const [row] = await query`SELECT vakaygo_establish_email_identity(${userId}::uuid) AS identity`;
  return (row?.identity as EmailIdentity | null) ?? null;
}
export function validNewPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 12 &&
    password.length <= 128 && new TextEncoder().encode(password).length <= 72;
}
export async function consumeEmailIdentityToken(token: string, kind: "magic" | "verification", password?: string): Promise<EmailIdentity | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  if (password !== undefined && (kind !== "verification" || !validNewPassword(password))) return null;
  const hash = password === undefined ? null : await bcrypt.hash(password, 12);
  const query = neon(process.env.DATABASE_URL!);
  const [row] = await query`SELECT vakaygo_consume_email_token(${token}, ${kind}, ${hash}) AS identity`;
  return (row?.identity as EmailIdentity | null) ?? null;
}
