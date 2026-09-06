// Temporary live safeguard while verified business onboarding is implemented.
// This is intentionally not a client-controlled flag.
export const DIRECTORY_ONLY = true;

export function blocksNewSale(pathname: string, method: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  return (method === "POST" && path === "/api/bookings")
    || (method === "POST" && path.startsWith("/api/payments/") && path !== "/api/payments/webhook")
    || (method === "GET" && path === "/api/cron/abandoned-bookings");
}
