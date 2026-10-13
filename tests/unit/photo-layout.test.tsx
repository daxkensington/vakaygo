import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { compile } from "tailwindcss";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

type OptimizedProps = { src: string; alt: string; fill: boolean; sizes: string; priority: boolean; loading: string; fetchPriority: "high" | "auto"; quality: number; onError: React.ReactEventHandler<HTMLImageElement>; className: string };
const imageState = vi.hoisted(() => ({ props: [] as OptimizedProps[] }));
vi.mock("next/image", () => ({
  default: (props: OptimizedProps) => {
    imageState.props.push(props);
    return React.createElement("img", { src: props.src, alt: props.alt, onError: props.onError, className: props.className, fetchPriority: props.fetchPriority, "data-optimized-image": "true", style: props.fill ? { position: "absolute", width: "100%", height: "100%" } : undefined });
  },
}));
import { ImageWithFallback } from "@/components/shared/image-fallback";
import { PhotoGallery } from "@/components/listings/photo-gallery";

let root: Root, container: HTMLDivElement, stylesheet: HTMLStyleElement;
beforeAll(async () => {
  // Compile real Tailwind utilities in their emitted order: absolute precedes
  // relative, so retaining both classes reproduces the actual position defect.
  const compiler = await compile("@theme { --spacing: .25rem; } @tailwind utilities;");
  stylesheet = document.createElement("style");
  stylesheet.textContent = compiler.build(["absolute", "relative", "fixed", "sticky", "static", "inset-0", "w-full", "h-full", "h-[192px]", "w-[310px]", "overflow-hidden", "object-cover"]);
  document.head.appendChild(stylesheet);
});
beforeEach(() => {
  imageState.props = [];
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
afterAll(() => stylesheet.remove());
async function render(element: React.ReactNode) { await act(async () => root.render(element)); }
const nativePhoto = "https://example.invalid/owned-photo.jpg";
const wrapper = () => container.firstElementChild as HTMLDivElement;

it.each(["relative", "absolute", "fixed", "sticky", "static"])("honors the caller's %s position for native image and failed fallback with compiled CSS", async position => {
  const click = vi.fn();
  await render(<ImageWithFallback src={nativePhoto} type="tour" alt="Owned photo" className={`${position} inset-0`} onClick={click}><span>Overlay</span></ImageWithFallback>);
  expect(getComputedStyle(wrapper()).position).toBe(position);
  const image = container.querySelector("img")!;
  expect(image.getAttribute("alt")).toBe("Owned photo");
  expect(getComputedStyle(image).position).toBe("absolute");
  expect(getComputedStyle(image).width).toBe("100%");
  expect(getComputedStyle(image).height).toBe("100%");
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBeNull();
  expect(getComputedStyle(wrapper()).position).toBe(position);
  expect(container.textContent).toContain("Overlay");
  await act(async () => wrapper().click());
  expect(click).toHaveBeenCalledOnce();
});

it("provides one relative containing block by default and keeps explicit dimensions for a missing photo", async () => {
  await render(<ImageWithFallback src={null} type="stay" className="h-[192px] w-[310px]"><span>Badge</span></ImageWithFallback>);
  expect(getComputedStyle(wrapper()).position).toBe("relative");
  expect(getComputedStyle(wrapper()).height).toBe("192px");
  expect(getComputedStyle(wrapper()).width).toBe("310px");
  expect(container.textContent).toContain("Badge");
  expect(container.querySelector("svg")).not.toBeNull();
});

it("preserves absolute positioning and fill/priority/sizes at the optimized image boundary", async () => {
  await render(<ImageWithFallback src="/owned-photo.png" type="tour" alt="Optimized owned photo" className="absolute inset-0" priority sizes="310px" />);
  expect(getComputedStyle(wrapper()).position).toBe("absolute");
  expect(imageState.props.at(-1)).toMatchObject({ src: "/owned-photo.png", alt: "Optimized owned photo", fill: true, priority: true, loading: "eager", fetchPriority: "high", sizes: "310px", quality: 75 });
  await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(getComputedStyle(wrapper()).position).toBe("absolute");
  expect(container.querySelector("svg")).not.toBeNull();
});

it("keeps responsive caller positioning without introducing a competing base relative class", async () => {
  await render(<ImageWithFallback src={nativePhoto} type="tour" className="absolute inset-0 md:relative" />);
  expect(getComputedStyle(wrapper()).position).toBe("absolute");
  expect(wrapper().classList.contains("md:relative")).toBe(true);
  expect(wrapper().classList.contains("relative")).toBe(false);
});

const photos = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `owned-${index}`, url: `/owned-${index}.png`, alt: `Owned photo ${index + 1}` }));
const openers = () => Array.from(container.querySelectorAll<HTMLElement>('[role="button"][aria-label^="Open photo"]'));
it.each([1, 2, 3, 5, 6])("gives all visible images in the %i-photo gallery a positioned fill wrapper, including errors", async count => {
  await render(<PhotoGallery photos={photos(count)} title="Owned tour" />);
  expect(openers()).toHaveLength(Math.min(count, 5));
  for (const opener of openers()) {
    const image = opener.querySelector("img")!;
    const tile = image.parentElement!;
    expect(getComputedStyle(opener).position).toBe("relative");
    expect(getComputedStyle(tile).position).toBe("absolute");
    expect(tile.classList.contains("inset-0")).toBe(true);
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(getComputedStyle(opener.firstElementChild!).position).toBe("absolute");
    expect(opener.querySelector("svg")).not.toBeNull();
  }
  if (count === 6) expect(container.textContent).toContain("+1 more");
});

it("preserves keyboard opening, photo navigation and Escape focus/scroll restoration after tile repair", async () => {
  const priorOverflow = document.body.style.overflow;
  await render(<PhotoGallery photos={photos(3)} title="Owned tour" />);
  const opener = openers()[1]; opener.focus();
  await act(async () => opener.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  let dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.getAttribute("aria-label")).toBe("Photos of Owned tour");
  expect(dialog.querySelector<HTMLImageElement>("img")!.getAttribute("src")).toBe("/owned-1.png");
  expect(document.body.style.overflow).toBe("hidden");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Close photo gallery");
  await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.querySelector<HTMLImageElement>("img")!.getAttribute("src")).toBe("/owned-2.png");
  await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe(priorOverflow);
});
