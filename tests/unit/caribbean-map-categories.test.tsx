import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MapListing } from "@/components/listings/caribbean-map";

type Features = { features: Array<{ properties: { id: string; type: string } }> };
const state = vi.hoisted(() => {
  const originalToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "synthetic-no-provider";
  return { originalToken, maps: [] as Array<{ emit: (event: string) => void; getSource: (id: string) => { data: Features } | undefined }> };
});
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("mapbox-gl", () => {
  class FakeMap {
    handlers = new Map<string, Array<() => void>>();
    sources = new Map<string, { data: Features; setData: (data: Features) => void }>();
    layers = new Set<string>();
    constructor() { state.maps.push(this); }
    on(event: string, layerOrHandler: string | (() => void), handler?: () => void) { const callback = handler || layerOrHandler as () => void; if (typeof callback === "function") this.handlers.set(event, [...this.handlers.get(event) || [], callback]); return this; }
    emit(event: string) { for (const handler of this.handlers.get(event) || []) handler(); }
    addControl() {}
    addSource(id: string, config: { data?: Features }) { const source = { data: config.data || { features: [] }, setData(data: Features) { this.data = data; } }; this.sources.set(id, source); }
    getSource(id: string) { return this.sources.get(id); }
    addLayer(layer: { id: string }) { this.layers.add(layer.id); }
    getLayer(id: string) { return this.layers.has(id); }
    getStyle() { return { layers: [] }; }
    setTerrain() {}
    setFog() {}
    setStyle() {}
    setLayoutProperty() {}
    flyTo() {}
    remove() {}
    getZoom() { return 11; }
    getCanvas() { return { style: {} }; }
  }
  class Popup { setLngLat() { return this; } setHTML() { return this; } addTo() { return this; } remove() {} }
  return { default: { Map: FakeMap, Popup, NavigationControl: class {}, ScaleControl: class {}, accessToken: "" } };
});
import CaribbeanMap from "@/components/listings/caribbean-map";

const fixture = (type: string): MapListing => ({ id: `synthetic-${type}`, title: `Synthetic ${type}`, slug: type, type, priceAmount: null, priceUnit: null, avgRating: null, reviewCount: 0, parish: null, islandSlug: "grenada", islandName: "Grenada", image: null, isFeatured: false, latitude: "12.1", longitude: "-61.7" });
let root: Root, container: HTMLDivElement;
beforeEach(() => { state.maps = []; vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
afterAll(() => { if (state.originalToken === undefined) delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN; else process.env.NEXT_PUBLIC_MAPBOX_TOKEN = state.originalToken; });
async function render() { await act(async () => root.render(<CaribbeanMap listings={[fixture("spa"), fixture("tour")]} activeIsland="grenada" />)); await act(async () => state.maps[0].emit("style.load")); }
const visibleTypes = () => state.maps[0].getSource("listings")!.data.features.map(feature => feature.properties.type);
const button = (label: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes(label))!;

it("puts valid Spa locations into the actual map source under default All and exposes its enabled filter", async () => {
  await render(); expect(visibleTypes()).toEqual(["spa", "tour"]);
  expect(button("Spa & Wellness").getAttribute("aria-pressed")).toBe("true");
});

it("removes and restores Spa pins through its filter and All without losing the other category", async () => {
  await render(); await act(async () => button("Spa & Wellness").click());
  expect(visibleTypes()).toEqual(["tour"]); expect(button("Spa & Wellness").getAttribute("aria-pressed")).toBe("false");
  await act(async () => button("Spa & Wellness").click()); expect(visibleTypes()).toEqual(["spa", "tour"]);
  await act(async () => button("Spa & Wellness").click()); await act(async () => button("All").click());
  expect(visibleTypes()).toEqual(["spa", "tour"]); expect(button("Spa & Wellness").getAttribute("aria-pressed")).toBe("true");
});
