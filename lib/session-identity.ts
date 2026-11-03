import type { SessionPayload } from "@/server/session-validation";

/** Async personal reads must still belong to the same current account at delivery. */
export function sameSessionIdentity(before: SessionPayload, after: SessionPayload | null): boolean {
  return after !== null && before.userId === after.userId && before.email === after.email
    && before.role === after.role && before.sessionVersion !== undefined
    && before.sessionVersion === after.sessionVersion && before.emailVerified === after.emailVerified;
}
