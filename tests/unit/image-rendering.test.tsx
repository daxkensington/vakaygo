import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { ImageWithFallback } from "@/components/shared/image-fallback";
import { PhotoGallery } from "@/components/listings/photo-gallery";
import PhotoUploader from "@/components/operator/photo-uploader";
import VerificationsPage from "@/app/admin/verifications/page";

// Deliberately use the installed next/image implementation: a component mock
// would conceal optimizer URLs, host validation and signed URL disclosure.
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Happy DOM does not fetch/decode image bytes or lay them out. Keep the
  // browser loading state pending so Next does not treat its zero geometry as
  // a completed image load; error events below are dispatched deliberately.
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function render(element: React.ReactNode) {
  await act(async () => root.render(<ImageConfigContext.Provider value={{ ...imageConfigDefault, remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] }}>{element}</ImageConfigContext.Provider>));
}
function direct(image: HTMLImageElement, source: string) {
  const target = image.getAttribute("src");
  expect(target).not.toBeNull();
  expect(new URL(target!, document.baseURI).href).toBe(new URL(source, document.baseURI).href);
  expect(image.getAttribute("srcset")).toBeNull();
  expect(image.getAttribute("src")).not.toContain("/_next/image");
}

it("recovers from an approved image failure when its URL changes and keeps real optimization", async () => {
  await render(<ImageWithFallback src="https://images.unsplash.com/owned-before.jpg" type="tour" alt="Before" className="absolute inset-0" sizes="160px" />);
  const failed = container.querySelector("img")!;
  expect(failed.getAttribute("src")).toContain("/_next/image?");
  expect(failed.getAttribute("srcset")).toContain("owned-before.jpg");
  await act(async () => failed.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBeNull();
  await render(<ImageWithFallback src="https://images.unsplash.com/owned-after.jpg" type="tour" alt="After" className="absolute inset-0" sizes="160px" />);
  const replacement = container.querySelector("img")!;
  expect(replacement.getAttribute("src")).toContain("owned-after.jpg");
  expect(replacement.getAttribute("srcset")).not.toBeNull();
  expect(replacement.parentElement!.classList.contains("absolute")).toBe(true);
  // An event from the detached old element cannot suppress the replacement.
  await act(async () => failed.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBe(replacement);
});

it("recovers native unknown-host images without adding an optimizer request or host rule", async () => {
  const before = "https://operator.fixture.invalid/before.jpg";
  const after = "https://operator.fixture.invalid/after.jpg?signature=synthetic-only";
  await render(<ImageWithFallback src={before} type="stay" alt="Before" />);
  await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBeNull();
  await render(<ImageWithFallback src={after} type="stay" alt="After" />);
  direct(container.querySelector("img")!, after);
});

it.each(["https://private.fixture.invalid/upload.png?token=synthetic-only", "blob:owned-upload-preview", "data:image/png;base64,c3ludGhldGlj"])("keeps an operator upload image direct for %s", async source => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await render(<PhotoUploader listingId="synthetic-listing" existingPhotos={[{ id: "photo", url: source, alt: "Owned preview" }]} />);
  const image = container.querySelector("img")!;
  direct(image, source);
  expect(image.getAttribute("draggable")).toBe("false");
  expect(image.style.position).toBe("absolute");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps private identity thumbnails and their opened preview outside the optimizer", async () => {
  const documentUrl = "https://private.fixture.invalid/document.png?token=synthetic-document";
  const selfieUrl = "/api/private/selfie?token=synthetic-selfie";
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ verifications: [{ id: "review", userId: "user", userName: "Owned user", userEmail: "fixture@example.invalid", documentUrl, selfieUrl, status: "pending", rejectionReason: null, submittedAt: "2026-10-16T00:00:00.000Z" }] })));
  vi.stubGlobal("fetch", fetchMock);
  await render(<VerificationsPage />);
  const documentImage = container.querySelector<HTMLImageElement>('img[alt="ID Document"]')!;
  direct(documentImage, documentUrl);
  direct(container.querySelector<HTMLImageElement>('img[alt="Selfie"]')!, selfieUrl);
  await act(async () => documentImage.dispatchEvent(new Event("error")));
  expect(documentImage.style.display).toBe("none");
  await act(async () => documentImage.closest("button")!.click());
  direct(container.querySelector<HTMLImageElement>('img[alt="Preview"]')!, documentUrl);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("keeps the full-resolution gallery direct while retaining keyboard navigation and focus restoration", async () => {
  const photos = [{ id: "one", url: "https://operator.fixture.invalid/full.png?signature=synthetic", alt: "Full photo" }, { id: "two", url: "data:image/png;base64,c3ludGhldGlj", alt: "Second photo" }];
  await render(<PhotoGallery photos={photos} title="Owned gallery" />);
  const opener = container.querySelector<HTMLElement>('[role="button"]')!; opener.focus();
  await act(async () => opener.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
  direct(dialog.querySelector("img")!, photos[0].url);
  expect(dialog.querySelector("img")!.parentElement!.classList.contains("h-[80vh]")).toBe(true);
  await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  direct(dialog.querySelector("img")!, photos[1].url);
  await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it("keeps protocol-relative external URLs on the native fallback instead of passing them to Next's loader", async () => {
  const source = "//images.unsplash.com/owned-protocol-relative.jpg";
  await render(<ImageWithFallback src={source} type="tour" alt="Protocol relative photo" />);
  const image = container.querySelector("img")!;
  direct(image, source);
  expect(image.getAttribute("data-nimg")).toBeNull();
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
});
