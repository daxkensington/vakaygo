import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATOR_SESSION_EXPIRED, invalidateOperatorRequests, operatorFetch, operatorSignInHref } from "@/lib/operator-session";

let fetchMock: ReturnType<typeof vi.fn>;
let expired: ReturnType<typeof vi.fn<(event: Event) => void>>;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expired = vi.fn<(event: Event) => void>();
  window.addEventListener(OPERATOR_SESSION_EXPIRED, expired);
});

afterEach(() => {
  window.removeEventListener(OPERATOR_SESSION_EXPIRED, expired);
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("operator sign-in continuation", () => {
  it("preserves the current operator path, filters and fragment", () => {
    const destination = "/operator/bookings?status=pending&listing=synthetic-cafe#booking-123";
    window.history.replaceState(null, "", destination);
    expect(operatorSignInHref()).toBe(`/auth/signin?next=${encodeURIComponent(destination)}`);
  });

  it("preserves a claim destination while authentication is being recovered", () => {
    const destination = "/operator/claim/20000000-0000-4000-8000-000000000009?channel=sms#verify";
    window.history.replaceState(null, "", destination);
    expect(operatorSignInHref("/operator")).toBe(`/auth/signin?next=${encodeURIComponent(destination)}`);
  });

  it.each(["/", "/explore?island=grenada", "/operator-fake?next=//example.invalid", "/operators"])("uses the supplied fallback outside operator routes: %s", location => {
    window.history.replaceState(null, "", location);
    expect(operatorSignInHref("/operator/settings")).toBe(`/auth/signin?next=${encodeURIComponent("/operator/settings")}`);
  });

  it.each(["//example.invalid", "https://example.invalid", "/operator/../admin", "/operator//bookings", "/api/operator/listings", "/auth/signin"])("rejects an unsafe fallback: %s", fallback => {
    expect(operatorSignInHref(fallback)).toBe(`/auth/signin?next=${encodeURIComponent("/operator")}`);
  });

  it("rejects an unsafe current path and returns to the operator dashboard", () => {
    window.history.replaceState(null, "", "/operator//bookings?status=pending");
    expect(operatorSignInHref("/operator/bookings")).toBe(`/auth/signin?next=${encodeURIComponent("/operator")}`);
  });
});

describe("operator HTTP session recovery", () => {
  it("forwards the original request and returns an unauthorized response without consuming or retrying it", async () => {
    const controller = new AbortController();
    const options = { method: "POST", body: JSON.stringify({ title: "Cafe" }), headers: { "Content-Type": "application/json" }, signal: controller.signal };
    const response = new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
    fetchMock.mockResolvedValue(response);

    expect(await operatorFetch("/api/operator/listings", options)).toBe(response);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/operator/listings", options);
    expect(response.bodyUsed).toBe(false);
    expect(expired).toHaveBeenCalledOnce();
    expect(expired.mock.calls[0][0]).toBeInstanceOf(Event);
    expect(await response.json()).toEqual({ error: "Authentication required" });
  });

  it.each([200, 400, 403, 404, 429, 500, 503])("leaves HTTP %s to the caller without expiring the session", async status => {
    const response = new Response("response", { status });
    fetchMock.mockResolvedValue(response);
    expect(await operatorFetch("/api/operator/bookings")).toBe(response);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(expired).not.toHaveBeenCalled();
  });

  it("preserves network failures without broadcasting session expiry or retrying", async () => {
    const error = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValue(error);
    await expect(operatorFetch("/api/operator/settings")).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(expired).not.toHaveBeenCalled();
  });

  it("expires an explicitly signed-out session response while leaving its original body readable", async () => {
    const response = new Response(JSON.stringify({ user: null }), { status: 200 });
    fetchMock.mockResolvedValueOnce(response);
    expect(await operatorFetch("/api/auth/session")).toBe(response);
    expect(response.bodyUsed).toBe(false);
    expect(expired).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ user: null });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/session", undefined);
  });

  it.each([
    ["authenticated", JSON.stringify({ user: { id: "synthetic-owner", role: "operator" } })],
    ["missing user", "{}"],
    ["null body", "null"],
    ["malformed JSON", "not-json"],
  ])("does not infer expiry from a %s session response", async (_description, body) => {
    const response = new Response(body, { status: 200 });
    fetchMock.mockResolvedValueOnce(response);
    expect(await operatorFetch("/api/auth/session")).toBe(response);
    expect(expired).not.toHaveBeenCalled();
    expect(response.bodyUsed).toBe(false);
    expect(await response.text()).toBe(body);
  });

  it("does not interpret other successful endpoint payloads as session results", async () => {
    const response = new Response(JSON.stringify({ user: null }), { status: 200 });
    fetchMock.mockResolvedValueOnce(response);
    expect(await operatorFetch("/api/operator/settings")).toBe(response);
    expect(expired).not.toHaveBeenCalled();
    expect(response.bodyUsed).toBe(false);
  });

  it("ignores a delayed signed-out session result after requests are invalidated", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(accept => { resolve = accept; }));
    const pending = operatorFetch("/api/auth/session");
    invalidateOperatorRequests();
    const response = new Response(JSON.stringify({ user: null }), { status: 200 });
    resolve(response);
    expect(await pending).toBe(response);
    expect(expired).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ user: null });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("ignores a signed-out session result after its request was aborted", async () => {
    const controller = new AbortController();
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(accept => { resolve = accept; }));
    const pending = operatorFetch("/api/auth/session", { signal: controller.signal });
    controller.abort();
    const response = new Response(JSON.stringify({ user: null }), { status: 200 });
    resolve(response);
    expect(await pending).toBe(response);
    expect(expired).not.toHaveBeenCalled();
    expect(response.bodyUsed).toBe(false);
  });

  it("discards an old request's unauthorized response after invalidation while still detecting current expiry", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(accept => { resolve = accept; }));
    const pending = operatorFetch("/api/operator/bookings");
    invalidateOperatorRequests();
    const stale = new Response("Unauthorized", { status: 401 });
    resolve(stale);
    expect(await pending).toBe(stale);
    expect(expired).not.toHaveBeenCalled();

    const current = new Response("Unauthorized", { status: 401 });
    fetchMock.mockResolvedValueOnce(current);
    expect(await operatorFetch("/api/operator/bookings")).toBe(current);
    expect(expired).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["init", "request"] as const)("ignores a late unauthorized response after its %s signal was aborted", async source => {
    const controller = new AbortController();
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>(accept => { resolve = accept; }));
    const request = source === "request"
      ? operatorFetch(new Request("https://vakaygo.com/api/operator/bookings", { signal: controller.signal }))
      : operatorFetch("/api/operator/bookings", { signal: controller.signal });
    controller.abort();
    const response = new Response("Unauthorized", { status: 401 });
    resolve(response);
    expect(await request).toBe(response);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(expired).not.toHaveBeenCalled();
  });
});
