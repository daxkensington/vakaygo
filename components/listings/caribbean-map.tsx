"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Link from "next/link";
import {
  MapPin, X, Maximize2, Minimize2, Compass, Play, Pause,
  Search, Navigation, Layers, Star, ChevronRight,
} from "lucide-react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// ─── Types ──────────────────────────────────────────────────────
export type MapListing = {
  id: string;
  title: string;
  slug: string;
  type: string;
  priceAmount: string | null;
  priceUnit: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  parish: string | null;
  islandSlug: string;
  islandName: string;
  image: string | null;
  isFeatured: boolean | null;
  latitude: string | null;
  longitude: string | null;
};

// ─── Category styling ───────────────────────────────────────────
const categoryConfig: Record<string, { color: string; emoji: string; label: string }> = {
  stay:       { color: "#D4A017", emoji: "🏨", label: "Stays" },
  tour:       { color: "#14B8A6", emoji: "🗺️", label: "Tours" },
  excursion:  { color: "#0EA5E9", emoji: "🚤", label: "Excursions" },
  dining:     { color: "#F97316", emoji: "🍽️", label: "Dining" },
  event:      { color: "#EC4899", emoji: "🎉", label: "Events" },
  transport:  { color: "#6366F1", emoji: "🚗", label: "Transport" },
  transfer:   { color: "#6366F1", emoji: "✈️", label: "Transfers" },
  vip:        { color: "#A855F7", emoji: "💎", label: "VIP" },
  guide:      { color: "#22C55E", emoji: "🧭", label: "Guides" },
};

// ─── Island coordinates & flyover waypoints ─────────────────────
const islandCoords: Record<string, { center: [number, number]; zoom: number; name: string }> = {
  grenada:                { center: [-61.679, 12.1165], zoom: 11, name: "Grenada" },
  "trinidad-and-tobago":  { center: [-61.3, 10.5], zoom: 9, name: "Trinidad & Tobago" },
  barbados:               { center: [-59.5432, 13.1939], zoom: 11, name: "Barbados" },
  "st-lucia":             { center: [-60.9789, 13.9094], zoom: 11, name: "St. Lucia" },
  jamaica:                { center: [-77.2975, 18.1096], zoom: 9, name: "Jamaica" },
  bahamas:                { center: [-77.3963, 25.034], zoom: 8, name: "Bahamas" },
  antigua:                { center: [-61.7964, 17.0608], zoom: 11, name: "Antigua" },
  dominica:               { center: [-61.371, 15.415], zoom: 11, name: "Dominica" },
  "st-vincent":           { center: [-61.1971, 13.2528], zoom: 11, name: "St. Vincent" },
  aruba:                  { center: [-69.9683, 12.5211], zoom: 12, name: "Aruba" },
  curacao:                { center: [-68.99, 12.1696], zoom: 11, name: "Curaçao" },
  "cayman-islands":       { center: [-81.2546, 19.3133], zoom: 10, name: "Cayman Islands" },
  "puerto-rico":          { center: [-66.5901, 18.2208], zoom: 9, name: "Puerto Rico" },
  "dominican-republic":   { center: [-70.1627, 18.7357], zoom: 8, name: "Dominican Republic" },
  "turks-and-caicos":     { center: [-71.7979, 21.694], zoom: 10, name: "Turks & Caicos" },
  "us-virgin-islands":    { center: [-64.8963, 18.3358], zoom: 11, name: "USVI" },
  "british-virgin-islands": { center: [-64.64, 18.4207], zoom: 11, name: "BVI" },
  "st-kitts":             { center: [-62.783, 17.3578], zoom: 11, name: "St. Kitts" },
  martinique:             { center: [-61.0242, 14.6415], zoom: 11, name: "Martinique" },
  guadeloupe:             { center: [-61.551, 16.265], zoom: 10, name: "Guadeloupe" },
  bonaire:                { center: [-68.2655, 12.1443], zoom: 12, name: "Bonaire" },
};

// Flyover waypoint type
type FlyoverWaypoint = {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  label: string;
  listing?: MapListing;
};

// Flyover waypoints — hit the highlights across the Caribbean
const FLYOVER_WAYPOINTS: FlyoverWaypoint[] = [
  { center: [-66, 18] as [number, number], zoom: 5, pitch: 30, bearing: 0, label: "The Caribbean" },
  { center: [-61.75, 12.05] as [number, number], zoom: 11, pitch: 55, bearing: -20, label: "Grenada" },
  { center: [-60.98, 13.91] as [number, number], zoom: 11, pitch: 50, bearing: 15, label: "St. Lucia" },
  { center: [-59.55, 13.19] as [number, number], zoom: 11, pitch: 45, bearing: -10, label: "Barbados" },
  { center: [-61.80, 17.06] as [number, number], zoom: 11, pitch: 50, bearing: 20, label: "Antigua" },
  { center: [-77.30, 18.11] as [number, number], zoom: 9, pitch: 45, bearing: -15, label: "Jamaica" },
  { center: [-69.97, 12.52] as [number, number], zoom: 12, pitch: 50, bearing: 30, label: "Aruba" },
  { center: [-77.40, 25.03] as [number, number], zoom: 9, pitch: 40, bearing: 0, label: "Bahamas" },
  { center: [-66, 18] as [number, number], zoom: 5, pitch: 30, bearing: 0, label: "Explore All Islands" },
];

// Caribbean overview
const CARIBBEAN_CENTER: [number, number] = [-66, 18];
const CARIBBEAN_ZOOM = 5;

// Type priority for flyover — real attractions first, generic services last
const TYPE_PRIORITY: Record<string, number> = {
  stay: 30, dining: 28, excursion: 25, event: 22,
  tour: 15, guide: 12, vip: 10, transfer: 3, transport: 2,
};

// Taxi/generic service title patterns to deprioritize
const GENERIC_PATTERNS = /taxi|car rental|auto rental|transport|shuttle|transfer|security|cleaning/i;

function buildIslandFlyover(slug: string, listings: MapListing[]): FlyoverWaypoint[] {
  const island = islandCoords[slug];
  if (!island) return FLYOVER_WAYPOINTS;

  const islandListings = listings.filter(
    (l) => l.islandSlug === slug && l.latitude && l.longitude && !isNaN(parseFloat(l.latitude!))
  );

  // Smart scoring: type priority + rating + reviews - generic penalty
  const scored = islandListings.map((l) => {
    const typePriority = TYPE_PRIORITY[l.type] || 5;
    const rating = l.avgRating ? parseFloat(l.avgRating) : 0;
    const reviews = Math.min(l.reviewCount || 0, 30);
    const genericPenalty = GENERIC_PATTERNS.test(l.title) ? -40 : 0;
    const featuredBonus = l.isFeatured ? 20 : 0;
    const hasImage = l.image ? 5 : 0;

    return {
      ...l,
      score: typePriority + (rating * 8) + (reviews * 0.3) + genericPenalty + featuredBonus + hasImage,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick up to 8, one per type first for variety
  const picked: typeof scored = [];
  const usedTypes = new Set<string>();

  // First pass: best of each interesting type
  const priorityTypes = ["stay", "dining", "excursion", "event", "tour", "guide", "vip"];
  for (const type of priorityTypes) {
    if (picked.length >= 8) break;
    const best = scored.find((l) => l.type === type && !GENERIC_PATTERNS.test(l.title));
    if (best && !picked.find((p) => p.id === best.id)) {
      usedTypes.add(type);
      picked.push(best);
    }
  }

  // Second pass: fill with top remaining
  for (const l of scored) {
    if (picked.length >= 8) break;
    if (!picked.find((p) => p.id === l.id) && !GENERIC_PATTERNS.test(l.title)) {
      picked.push(l);
    }
  }

  if (picked.length === 0) {
    return [{ center: island.center, zoom: island.zoom, pitch: 40, bearing: 0, label: island.name }];
  }

  // Build waypoints
  const waypoints: FlyoverWaypoint[] = [
    { center: island.center, zoom: island.zoom, pitch: 35, bearing: 0, label: `Welcome to ${island.name}` },
  ];

  picked.forEach((l, i) => {
    const bearing = [-25, 35, -45, 20, -15, 50, -35, 25][i % 8];
    const pitch = [55, 60, 50, 58, 52, 62, 48, 56][i % 8];

    waypoints.push({
      center: [parseFloat(l.longitude!), parseFloat(l.latitude!)] as [number, number],
      zoom: 15.5,
      pitch,
      bearing,
      label: l.title,
      listing: l,
    });
  });

  waypoints.push({
    center: island.center,
    zoom: island.zoom,
    pitch: 40,
    bearing: 0,
    label: `${island.name} — ${islandListings.length} listings to explore`,
  });

  return waypoints;
}

// ─── Create listing marker ──────────────────────────────────────
function createListingMarker(listing: MapListing): { wrapper: HTMLDivElement; pin: HTMLDivElement } {
  const config = categoryConfig[listing.type] || categoryConfig.stay;
  const price = listing.priceAmount && parseFloat(listing.priceAmount) > 0
    ? `$${parseFloat(listing.priceAmount).toFixed(0)}`
    : null;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position: relative; display: flex; flex-direction: column; align-items: center;";

  // Tooltip
  const tooltip = document.createElement("div");
  tooltip.style.cssText = `
    position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
    margin-bottom: 8px; padding: 6px 12px; border-radius: 10px;
    background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
    color: white; font-size: 12px; font-weight: 600;
    white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.15s;
    max-width: 200px; overflow: hidden; text-overflow: ellipsis;
  `;
  tooltip.textContent = listing.title;

  // Pin
  const pin = document.createElement("div");

  if (price) {
    pin.style.cssText = `
      background: ${config.color}; color: white;
      padding: 4px 10px; border-radius: 20px;
      font-size: 12px; font-weight: 700; white-space: nowrap;
      box-shadow: 0 2px 10px rgba(0,0,0,0.35); border: 2px solid white;
      cursor: pointer; transition: all 0.2s ease;
    `;
    pin.textContent = price;
  } else {
    pin.style.cssText = `
      width: 36px; height: 36px; border-radius: 50%;
      background: ${config.color}; border: 2.5px solid white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; cursor: pointer; transition: all 0.2s ease;
    `;
    pin.textContent = config.emoji;
  }

  wrapper.appendChild(tooltip);
  wrapper.appendChild(pin);

  wrapper.addEventListener("mouseenter", () => { tooltip.style.opacity = "1"; });
  wrapper.addEventListener("mouseleave", () => { tooltip.style.opacity = "0"; });

  return { wrapper, pin };
}

// ─── Main Component ─────────────────────────────────────────────
export default function CaribbeanMap({
  listings,
  activeIsland,
  onIslandChange,
}: {
  listings: MapListing[];
  activeIsland: string;
  onIslandChange?: (island: string) => void;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: mapboxgl.Marker; element: HTMLDivElement }>>(new Map());
  const selectedRef = useRef<MapListing | null>(null);

  const [selected, setSelected] = useState<MapListing | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(Object.keys(categoryConfig)));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFlyover, setIsFlyover] = useState(false);
  const [flyoverLabel, setFlyoverLabel] = useState("");
  const [flyoverListing, setFlyoverListing] = useState<MapListing | null>(null);
  const [mapStyle, setMapStyle] = useState<"satellite" | "outdoors" | "dark">("satellite");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const flyoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flyoverIndexRef = useRef(0);
  const activeIslandRef = useRef(activeIsland);

  const styleUrls: Record<string, string> = {
    satellite: "mapbox://styles/mapbox/satellite-streets-v12",
    outdoors: "mapbox://styles/mapbox/outdoors-v12",
    dark: "mapbox://styles/mapbox/dark-v11",
  };

  // ── Initialize Map ──
  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const startCenter = activeIsland && islandCoords[activeIsland]
      ? islandCoords[activeIsland].center
      : CARIBBEAN_CENTER;
    const startZoom = activeIsland && islandCoords[activeIsland]
      ? islandCoords[activeIsland].zoom
      : CARIBBEAN_ZOOM;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: styleUrls[mapStyle],
      center: startCenter,
      zoom: startZoom,
      pitch: 40,
      bearing: 0,
      antialias: true,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 150 }), "bottom-left");

    map.on("style.load", () => {
      // 3D terrain
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      }

      // Sky atmosphere
      if (!map.getLayer("sky")) {
        map.addLayer({
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [0.0, 0.0],
            "sky-atmosphere-sun-intensity": 15,
          },
        });
      }

      // 3D buildings at close zoom
      const layers = map.getStyle().layers;
      const labelLayerId = layers?.find(
        (layer) => layer.type === "symbol" && layer.layout && "text-field" in layer.layout
      )?.id;

      if (!map.getLayer("3d-buildings")) {
        map.addLayer(
          {
            id: "3d-buildings",
            source: "composite",
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 14,
            paint: {
              "fill-extrusion-color": "#aaa",
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-base": ["get", "min_height"],
              "fill-extrusion-opacity": 0.6,
            },
          },
          labelLayerId
        );
      }

      setMapReady(true);
    });

    // Cinematic intro — only if no island is selected (check ref for current value)
    map.on("load", () => {
      setTimeout(() => {
        if (!activeIslandRef.current) {
          map.flyTo({
            center: CARIBBEAN_CENTER,
            zoom: 5.5,
            pitch: 35,
            bearing: 0,
            duration: 3000,
            essential: true,
          });
        }
      }, 500);
    });

    mapRef.current = map;

    return () => {
      if (flyoverTimeoutRef.current) clearTimeout(flyoverTimeoutRef.current);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update style ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Reset layer init flag so layers get re-created after style load
    layersInitRef.current = false;
    setMapReady(false);
    map.setStyle(styleUrls[mapStyle]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle]);

  // Keep refs in sync
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { activeIslandRef.current = activeIsland; }, [activeIsland]);

  // ── Fly to island on change ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (activeIsland && islandCoords[activeIsland]) {
      const { center, zoom } = islandCoords[activeIsland];
      map.flyTo({ center, zoom, pitch: 45, bearing: 0, duration: 1500 });
    } else {
      map.flyTo({ center: CARIBBEAN_CENTER, zoom: CARIBBEAN_ZOOM, pitch: 35, bearing: 0, duration: 1500 });
    }
  }, [activeIsland, mapReady]);

  // Store listings as a lookup for click events
  const listingsMapRef = useRef<Map<string, MapListing>>(new Map());
  const layersInitRef = useRef(false);

  // ── Initialize clustering layers & event listeners ONCE ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || layersInitRef.current) return;
    layersInitRef.current = true;

    // Add empty clustered source
    map.addSource("listings", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 60,
    });

    // Cluster circles
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "listings",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step", ["get", "point_count"],
          "#D4A017", 20, "#14B8A6", 100, "#1E3A5F",
        ],
        "circle-radius": [
          "step", ["get", "point_count"],
          22, 20, 28, 100, 36,
        ],
        "circle-stroke-width": 3,
        "circle-stroke-color": "#fff",
        "circle-opacity": 0.9,
      },
    });

    // Cluster count labels
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "listings",
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 13,
      },
      paint: { "text-color": "#ffffff" },
    });

    // Individual unclustered points
    map.addLayer({
      id: "unclustered-point",
      type: "circle",
      source: "listings",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 8,
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#fff",
      },
    });

    // Price labels on unclustered points (zoom 12+)
    map.addLayer({
      id: "unclustered-label",
      type: "symbol",
      source: "listings",
      filter: ["all", ["!", ["has", "point_count"]], ["has", "price"]],
      minzoom: 12,
      layout: {
        "text-field": ["concat", "$", ["to-string", ["round", ["get", "price"]]]],
        "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
        "text-size": 11,
        "text-offset": [0, -1.8],
        "text-anchor": "bottom",
      },
      paint: {
        "text-color": "#1E3A5F",
        "text-halo-color": "#fff",
        "text-halo-width": 2,
      },
    });

    // Click on cluster → zoom in
    map.on("click", "clusters", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
      if (!features.length) return;
      const clusterId = features[0].properties?.cluster_id;
      const source = map.getSource("listings") as mapboxgl.GeoJSONSource;
      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        map.flyTo({ center: coords, zoom: zoom!, pitch: 45, duration: 800 });
      });
    });

    // Click on unclustered point → select listing
    map.on("click", "unclustered-point", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["unclustered-point"] });
      if (!features.length) return;
      const id = features[0].properties?.id;
      const listing = listingsMapRef.current.get(id);
      if (listing) {
        setSelected(listing);
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 14), pitch: 50, duration: 1000 });
      }
    });

    // Pointer cursors
    map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });
    map.on("mouseenter", "unclustered-point", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "unclustered-point", () => { map.getCanvas().style.cursor = ""; });
  }, [mapReady]);

  // ── Update GeoJSON data when filters/listings change ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !layersInitRef.current) return;

    const source = map.getSource("listings") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const mappable = listings.filter(
      (l) => l.latitude && l.longitude && !isNaN(parseFloat(l.latitude!)) && !isNaN(parseFloat(l.longitude!)) && activeCategories.has(l.type)
    );

    const filtered = searchQuery
      ? mappable.filter((l) =>
          l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.islandName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (l.parish && l.parish.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : mappable;

    // Update lookup
    const lMap = new Map<string, MapListing>();
    filtered.forEach((l) => lMap.set(l.id, l));
    listingsMapRef.current = lMap;

    // Update the source data (no layer recreation needed)
    source.setData({
      type: "FeatureCollection",
      features: filtered.map((l) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [parseFloat(l.longitude!), parseFloat(l.latitude!)],
        },
        properties: {
          id: l.id,
          title: l.title,
          type: l.type,
          price: l.priceAmount ? parseFloat(l.priceAmount) : null,
          color: categoryConfig[l.type]?.color || "#D4A017",
        },
      })),
    });
  }, [listings, activeCategories, searchQuery, mapReady]);

  // ── Flyover ──
  const startFlyover = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setIsFlyover(true);
    setSelected(null);
    flyoverIndexRef.current = 0;

    // Build waypoints from actual top listings for this island
    const island = activeIslandRef.current;
    const waypoints = island
      ? buildIslandFlyover(island, listings)
      : FLYOVER_WAYPOINTS;

    const flyNext = () => {
      const idx = flyoverIndexRef.current;
      if (idx >= waypoints.length) {
        setIsFlyover(false);
        setFlyoverLabel("");
        setFlyoverListing(null);
        return;
      }
      const wp = waypoints[idx];
      setFlyoverLabel(wp.label);
      setFlyoverListing(wp.listing || null);

      const isOverview = idx === 0 || idx === waypoints.length - 1;
      map.flyTo({
        center: wp.center,
        zoom: wp.zoom,
        pitch: wp.pitch,
        bearing: wp.bearing,
        duration: isOverview ? 2500 : 4000,
        essential: true,
      });

      flyoverIndexRef.current++;
      flyoverTimeoutRef.current = setTimeout(flyNext, isOverview ? 3000 : 5500);
    };

    flyNext();
  }, [listings]);

  const stopFlyover = useCallback(() => {
    if (flyoverTimeoutRef.current) clearTimeout(flyoverTimeoutRef.current);
    setIsFlyover(false);
    setFlyoverLabel("");
    setFlyoverListing(null);
  }, []);

  // ── GPS Location ──
  const locateUser = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setUserLocation(coords);

        if (userMarkerRef.current) userMarkerRef.current.remove();

        const el = document.createElement("div");
        el.style.cssText = `
          width: 20px; height: 20px; border-radius: 50%;
          background: #3B82F6; border: 3px solid white;
          box-shadow: 0 0 0 6px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.3);
          animation: pulse 2s ease-in-out infinite;
        `;

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(coords)
          .addTo(mapRef.current!);
        userMarkerRef.current = marker;

        mapRef.current?.flyTo({ center: coords, zoom: 12, pitch: 45, duration: 1500 });
      },
      () => alert("Could not get your location"),
      { enableHighAccuracy: true }
    );
  }, []);

  // ── Toggle category ──
  const toggleCategory = (cat: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleAllCategories = () => {
    if (activeCategories.size === Object.keys(categoryConfig).length) {
      setActiveCategories(new Set());
    } else {
      setActiveCategories(new Set(Object.keys(categoryConfig)));
    }
  };

  // ── Fullscreen ──
  const toggleFullscreen = () => {
    const el = mapContainer.current?.parentElement;
    if (!el) return;
    if (!isFullscreen) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  // ── Reset view ──
  const resetView = () => {
    setSelected(null);
    const map = mapRef.current;
    if (!map) return;
    if (activeIsland && islandCoords[activeIsland]) {
      const { center, zoom } = islandCoords[activeIsland];
      map.flyTo({ center, zoom, pitch: 40, bearing: 0, duration: 1200 });
    } else {
      map.flyTo({ center: CARIBBEAN_CENTER, zoom: CARIBBEAN_ZOOM, pitch: 35, bearing: 0, duration: 1200 });
    }
  };

  // ── Search results dropdown ──
  const searchResults = searchQuery.length >= 2
    ? listings
        .filter((l) =>
          l.latitude && l.longitude &&
          (l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
           l.islandName.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        .slice(0, 8)
    : [];

  if (!MAPBOX_TOKEN) {
    return (
      <div className="w-full h-full bg-navy-900 rounded-2xl flex items-center justify-center">
        <p className="text-white/60">Map requires configuration.</p>
      </div>
    );
  }

  const rating = selected?.avgRating ? parseFloat(selected.avgRating) : 0;

  return (
    <div className="relative w-full h-full">
      {/* Map */}
      <div ref={mapContainer} className="w-full h-full rounded-2xl overflow-hidden" />

      {/* ── Controls overlay ── */}
      <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
        {/* Search */}
        <div className="relative">
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-lg shadow-lg flex items-center justify-center hover:bg-white transition-colors"
          >
            <Search size={16} className="text-navy-700" />
          </button>
          {searchOpen && (
            <div className="absolute top-0 left-11 w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search listings..."
                className="w-full px-3 py-2 text-sm bg-white/95 backdrop-blur-md rounded-lg shadow-lg outline-none focus:ring-2 focus:ring-gold-400 text-navy-700 placeholder:text-navy-300"
                autoFocus
              />
              {searchResults.length > 0 && (
                <div className="mt-1 bg-white/95 backdrop-blur-md rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {searchResults.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        setSelected(l);
                        setSearchOpen(false);
                        setSearchQuery("");
                        mapRef.current?.flyTo({
                          center: [parseFloat(l.longitude!), parseFloat(l.latitude!)],
                          zoom: 14,
                          pitch: 50,
                          duration: 1200,
                        });
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gold-50 text-sm border-b border-cream-100 last:border-0"
                    >
                      <span className="font-medium text-navy-700">{l.title}</span>
                      <span className="block text-[11px] text-navy-400">{categoryConfig[l.type]?.emoji} {l.islandName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Style switcher */}
        <div className="flex flex-col gap-1 bg-white/90 backdrop-blur-md rounded-lg shadow-lg p-1">
          {(["satellite", "outdoors", "dark"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setMapStyle(s)}
              className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                mapStyle === s ? "bg-gold-500 text-white" : "text-navy-600 hover:bg-cream-100"
              }`}
            >
              {s === "satellite" ? "Satellite" : s === "outdoors" ? "Terrain" : "Dark"}
            </button>
          ))}
        </div>
      </div>

      {/* Right controls */}
      <div className="absolute top-20 right-3 flex flex-col gap-2 z-10">
        <button onClick={locateUser} className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-lg shadow-lg flex items-center justify-center hover:bg-white transition-colors" title="My location">
          <Navigation size={16} className="text-navy-700" />
        </button>
        <button onClick={isFlyover ? stopFlyover : startFlyover} className={`w-9 h-9 rounded-lg shadow-lg flex items-center justify-center transition-colors ${isFlyover ? "bg-gold-500 text-white" : "bg-white/90 backdrop-blur-md hover:bg-white text-navy-700"}`} title="Cinematic tour">
          {isFlyover ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button onClick={resetView} className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-lg shadow-lg flex items-center justify-center hover:bg-white transition-colors" title="Reset view">
          <Compass size={16} className="text-navy-700" />
        </button>
        <button onClick={toggleFullscreen} className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-lg shadow-lg flex items-center justify-center hover:bg-white transition-colors" title="Fullscreen">
          {isFullscreen ? <Minimize2 size={16} className="text-navy-700" /> : <Maximize2 size={16} className="text-navy-700" />}
        </button>
      </div>

      {/* Category filters */}
      <div className="absolute bottom-3 left-3 right-3 z-10">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={toggleAllCategories}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg transition-colors ${
              activeCategories.size === Object.keys(categoryConfig).length
                ? "bg-navy-700 text-white"
                : "bg-white/90 backdrop-blur-md text-navy-600 hover:bg-white"
            }`}
          >
            All
          </button>
          {Object.entries(categoryConfig).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => toggleCategory(key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg transition-colors flex items-center gap-1 ${
                activeCategories.has(key)
                  ? "text-white"
                  : "bg-white/90 backdrop-blur-md text-navy-500 hover:bg-white"
              }`}
              style={activeCategories.has(key) ? { background: cfg.color } : {}}
            >
              <span>{cfg.emoji}</span>
              <span className="hidden sm:inline">{cfg.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Flyover card */}
      {isFlyover && flyoverLabel && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 transition-all duration-500">
          {flyoverListing ? (
            // Listing card during attraction flyover
            <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.2)] overflow-hidden flex w-[360px] max-w-[90vw]">
              {flyoverListing.image && (
                <div
                  className="w-28 h-28 bg-cover bg-center flex-shrink-0"
                  style={{ backgroundImage: `url(${flyoverListing.image})` }}
                />
              )}
              <div className="flex-1 p-3 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: categoryConfig[flyoverListing.type]?.color || "#D4A017" }}
                  >
                    {categoryConfig[flyoverListing.type]?.emoji} {categoryConfig[flyoverListing.type]?.label}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-navy-700 line-clamp-2 leading-snug">
                  {flyoverListing.title}
                </h3>
                <div className="flex items-center gap-2 mt-1.5">
                  {flyoverListing.avgRating && parseFloat(flyoverListing.avgRating) > 0 && (
                    <span className="flex items-center gap-0.5 text-xs">
                      <Star size={11} className="text-gold-500 fill-gold-500" />
                      <span className="font-semibold text-navy-700">{parseFloat(flyoverListing.avgRating).toFixed(1)}</span>
                      {flyoverListing.reviewCount ? <span className="text-navy-400">({flyoverListing.reviewCount})</span> : null}
                    </span>
                  )}
                  {flyoverListing.priceAmount && parseFloat(flyoverListing.priceAmount) > 0 && (
                    <span className="text-xs font-bold text-navy-700">
                      ${parseFloat(flyoverListing.priceAmount).toFixed(0)}
                      {flyoverListing.priceUnit && <span className="font-normal text-navy-400">/{flyoverListing.priceUnit}</span>}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-navy-400 mt-1 flex items-center gap-0.5">
                  <MapPin size={9} />
                  {flyoverListing.parish ? `${flyoverListing.parish}, ` : ""}{flyoverListing.islandName}
                </p>
              </div>
            </div>
          ) : (
            // Simple label for overview waypoints
            <div className="bg-black/70 backdrop-blur-md text-white px-6 py-2.5 rounded-full text-sm font-semibold shadow-xl">
              {flyoverLabel}
            </div>
          )}
        </div>
      )}

      {/* ── Selected listing panel ── */}
      {selected && (
        <div className="absolute top-3 right-14 z-20 w-72 bg-white/95 backdrop-blur-md rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.15)] overflow-hidden">
          <button
            onClick={() => setSelected(null)}
            className="absolute top-2 right-2 z-10 w-7 h-7 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/50 transition-colors"
          >
            <X size={14} />
          </button>

          {selected.image && (
            <div
              className="h-36 w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${selected.image})` }}
            />
          )}

          <div className="p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className="text-white text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: categoryConfig[selected.type]?.color || "#1E3A5F" }}
              >
                {categoryConfig[selected.type]?.emoji} {categoryConfig[selected.type]?.label || selected.type}
              </span>
              {selected.isFeatured && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gold-100 text-gold-700">Featured</span>
              )}
            </div>

            <h3 className="font-semibold text-sm text-navy-700 leading-snug line-clamp-2 mb-1">
              {selected.title}
            </h3>

            <p className="text-[11px] text-navy-400 flex items-center gap-1 mb-2">
              <MapPin size={10} />
              {selected.parish ? `${selected.parish}, ` : ""}
              {selected.islandName}
            </p>

            <div className="flex items-center justify-between mb-3">
              {selected.priceAmount && parseFloat(selected.priceAmount) > 0 && (
                <span className="font-bold text-navy-700">
                  ${parseFloat(selected.priceAmount).toFixed(0)}
                  <span className="font-normal text-navy-400 text-xs">
                    {selected.priceUnit ? ` / ${selected.priceUnit}` : ""}
                  </span>
                </span>
              )}
              {rating > 0 && (
                <span className="flex items-center gap-1 text-xs">
                  <Star size={12} className="text-gold-500 fill-gold-500" />
                  <span className="font-semibold text-navy-700">{rating.toFixed(1)}</span>
                  {selected.reviewCount ? <span className="text-navy-300">({selected.reviewCount})</span> : null}
                </span>
              )}
            </div>

            <Link
              href={`/${selected.islandSlug}/${selected.slug}`}
              className="flex items-center justify-center gap-1.5 w-full py-2 bg-gold-500 text-white text-sm font-semibold rounded-lg hover:bg-gold-600 transition-colors"
            >
              View Details <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* Pulse animation for GPS marker */}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 6px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 0 12px rgba(59,130,246,0.1), 0 2px 8px rgba(0,0,0,0.3); }
        }
      `}</style>
    </div>
  );
}
