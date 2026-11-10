import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => React.createElement("span", { "data-alt": alt }) }));
import { ReviewModal } from "@/components/listings/review-modal";

let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>, uploads: Response[];
const submitted = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });

beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  uploads = []; submitted.mockReset();
  fetchMock = vi.fn(async (url: string) => (url === "/api/upload" ? uploads.shift() ?? json({ error: "no" }, 500) : json({ review: { id: "r1" } }, 201)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:synthetic", revokeObjectURL: () => undefined }));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

async function open(files: File[]) {
  await act(async () => root.render(<ReviewModal isOpen onClose={() => undefined} bookingId="b1" listingTitle="Synthetic tour" onSubmitted={submitted} />));
  await act(async () => container.querySelectorAll<HTMLButtonElement>('form button[type="button"]')[4].click()); // five stars
  const comment = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(comment, "A thoughtful, long enough review.");
    comment.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: files });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const submit = () => act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
const reviewPosts = () => fetchMock.mock.calls.filter(call => call[0] === "/api/reviews");

it("does not submit the review, and says so, when a photo upload fails", async () => {
  uploads = [json({ url: "https://blob.example/a.jpg" }), json({ error: "too large" }, 413)];
  await open([photo("a.jpg"), photo("b.jpg")]);
  await submit();

  expect(reviewPosts()).toHaveLength(0);
  expect(submitted).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain("Thank you");
  const alert = container.querySelector('[role="alert"]')!;
  expect(alert.textContent).toContain("1 photo could not be uploaded");
  expect(alert.textContent).toContain("has not been submitted");
  expect(container.querySelectorAll('[data-testid="photo-upload-failed"]')).toHaveLength(1);
});

it("submits with every photo once the failed one is removed, without uploading the good one twice", async () => {
  uploads = [json({ url: "https://blob.example/a.jpg" }), json({ error: "too large" }, 413)];
  await open([photo("a.jpg"), photo("b.jpg")]);
  await submit();
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Remove photo 2"]')!.click());
  await submit();

  expect(fetchMock.mock.calls.filter(call => call[0] === "/api/upload")).toHaveLength(2);
  const posts = reviewPosts();
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0][1].body).photoUrls).toEqual([{ url: "https://blob.example/a.jpg" }]);
  expect(container.textContent).toContain("Thank you");
  expect(submitted).toHaveBeenCalledTimes(1);
});

it("retries a failed photo on the next attempt", async () => {
  uploads = [json({ error: "busy" }, 503), json({ url: "https://blob.example/a.jpg" })];
  await open([photo("a.jpg")]);
  await submit();
  expect(reviewPosts()).toHaveLength(0);
  await submit();
  expect(JSON.parse(reviewPosts()[0][1].body).photoUrls).toEqual([{ url: "https://blob.example/a.jpg" }]);
});
