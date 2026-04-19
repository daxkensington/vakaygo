"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Link from "next/link";
import {
  MapPin, X, Maximize2, Minimize2, Compass, Play, Pause,
  Search, Navigation, Layers, Star, ChevronRight, Flame, Sun, Moon,
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

// Escape HTML before interpolating user-controlled strings into popup HTML.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

// ─── Haversine distance (km) ────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// ─── Timezone offset for auto dark mode ────────────────────────
function isNighttimeAtLng(lng: number): boolean {
  const utcHour = new Date().getUTCHours();
  const tzOffset = Math.round(lng / 15);
  const localHour = (utcHour + tzOffset + 24) % 24;
  return localHour >= 19 || localHour < 6;
}

// Attraction keywords — these are real places tourists visit, not businesses
const ATTRACTION_KEYWORDS = /waterfall|falls|beach|bay|reef|volcano|mountain|peak|hill|lake|spring|cave|fort|castle|ruins|park|garden|botanical|trail|forest|rainforest|museum|temple|church|cathedral|market|harbor|harbour|port|island|plantation|estate|distillery|brewery|chocolate|sculpture|monument|lighthouse|viewpoint|lookout|sanctuary|reserve|lagoon|crater|canyon|gorge|bridge|pier|dock|marina|stadium|arena|zoo|aquarium|gallery|palace|tower|dam|pool|cenote|sinkhole|blowhole|cliff|rock|arch|canyon/i;

// Must-see iconic attractions per island — these always appear in flyover regardless of review count
// Partial title matches (case-insensitive) so "Grand Anse Beach" matches "grand anse beach"
const ICONIC_ATTRACTIONS: Record<string, string[]> = {
  grenada: ["grand anse beach", "annandale waterfall", "grand etang", "underwater sculpture", "concord falls", "seven sisters", "fort george", "river antoine", "magazine beach", "levera beach"],
  barbados: ["crane beach", "bathsheba", "harrison's cave", "animal flower cave", "carlisle bay", "bottom bay", "st. nicholas abbey", "hunte's garden", "bridgetown", "garrison"],
  jamaica: ["dunn's river falls", "blue lagoon", "seven mile beach", "bob marley museum", "blue mountain", "doctor's cave", "rick's cafe", "port royal", "devon house", "mystic mountain"],
  "st-lucia": ["pitons", "sulphur springs", "marigot bay", "reduit beach", "diamond falls", "sugar beach", "anse chastanet", "pigeon island", "toraille waterfall", "tet paul"],
  "trinidad-and-tobago": ["maracas bay", "pigeon point", "nylon pool", "caroni swamp", "argyle waterfall", "fort king george", "buccoo reef", "store bay", "temple in the sea", "asa wright"],
  antigua: ["nelson's dockyard", "shirley heights", "devil's bridge", "half moon bay", "jolly beach", "stingray city", "ffryes beach", "darkwood beach", "pillars of hercules", "fort james"],
  bahamas: ["atlantis paradise", "pig beach", "dean's blue hole", "thunderball grotto", "blue lagoon island", "junkanoo beach", "exuma cays", "nassau straw market", "fort charlotte", "clifton heritage"],
  aruba: ["eagle beach", "natural bridge", "baby beach", "arikok national park", "california lighthouse", "flamingo beach", "natural pool", "alto vista chapel", "casibari rock", "palm beach"],
  "dominican-republic": ["punta cana beach", "los haitises", "27 charcos", "hoyo azul", "saona island", "playa rincon", "bahia de las aguilas", "zona colonial", "el limon waterfall", "lago enriquillo"],
  "puerto-rico": ["el yunque", "flamenco beach", "old san juan", "bioluminescent bay", "condado beach", "castillo san felipe", "cueva ventana", "crash boat beach", "la parguera", "camuy caves"],
  curacao: ["playa kenepa", "shete boka", "hato caves", "queen emma bridge", "playa lagun", "cas abao beach", "christoffel park", "klein curacao", "handelskade", "blue room"],
  "cayman-islands": ["seven mile beach", "stingray city", "rum point", "hell", "starfish point", "smith's cove", "crystal caves", "cayman turtle centre", "pedro st james", "barkers national park"],
  dominica: ["boiling lake", "trafalgar falls", "champagne reef", "emerald pool", "titou gorge", "indian river", "morne trois pitons", "scotts head", "cabrits", "victoria falls"],
  "st-vincent": ["tobago cays", "la soufriere", "dark view falls", "black point tunnel", "fort charlotte", "botanical garden", "bequia", "princess margaret beach", "mustique", "owia salt pond"],
  "st-kitts": ["brimstone hill", "timothy hill", "south friars bay", "romney manor", "black rocks", "frigate bay", "pinneys beach", "nevis peak", "basseterre", "caribelle batik"],
  "turks-and-caicos": ["grace bay", "chalk sound", "sapodilla bay", "smith's reef", "mudjin harbour", "conch bar caves", "northwest point", "grand turk lighthouse", "gibbs cay", "half moon bay"],
  bonaire: ["lac bay", "1000 steps", "pink beach", "donkey sanctuary", "washington slagbaai", "salt flats", "klein bonaire", "goto lake", "rincon", "boca slagbaai"],
  martinique: ["les salines", "mount pelee", "anse couleuvre", "jardin de balata", "diamond rock", "saint-pierre", "anse dufour", "presqu'ile de la caravelle", "habitation clement", "gorges de la falaise"],
  guadeloupe: ["plage de la perle", "chutes du carbet", "la soufriere", "iles de la petite terre", "plage de grande anse", "pointe des chateaux", "parc national", "sainte-anne beach", "terre-de-haut", "porte d'enfer"],
  "us-virgin-islands": ["trunk bay", "magens bay", "cinnamon bay", "coral world", "blackbeard's castle", "annaberg ruins", "sapphire beach", "buck island", "cruz bay", "caneel bay"],
  "british-virgin-islands": ["the baths", "white bay", "smuggler's cove", "savannah bay", "spring bay", "devil's bay", "anegada beach", "loblolly bay", "cane garden bay", "norman island"],
};

// Generic business patterns to exclude from flyover
const BUSINESS_PATTERNS = /taxi|car rental|auto rental|transport|shuttle|transfer|security|cleaning|laundry|insurance|pharmacy|clinic|hospital|dentist|bank|atm|gas station|mechanic|plumber|lawyer|accountant|storage|moving|printing|courier|staffing|consulting/i;

function buildIslandFlyover(slug: string, listings: MapListing[]): FlyoverWaypoint[] {
  const island = islandCoords[slug];
  if (!island) return FLYOVER_WAYPOINTS;

  const islandListings = listings.filter(
    (l) => l.islandSlug === slug && l.latitude && l.longitude && !isNaN(parseFloat(l.latitude!))
  );

  // Check if title matches any iconic attraction for this island
  const iconicList = ICONIC_ATTRACTIONS[slug] || [];
  const isIconic = (title: string) =>
    iconicList.some((keyword) => title.toLowerCase().includes(keyword));

  // Score listings to find real attractions
  const scored = islandListings.map((l) => {
    const iconic = isIconic(l.title);
    const isAttraction = ATTRACTION_KEYWORDS.test(l.title);
    const isBusiness = BUSINESS_PATTERNS.test(l.title);
    const rating = l.avgRating ? parseFloat(l.avgRating) : 0;
    const reviews = l.reviewCount || 0;

    const score =
      (iconic ? 500 : 0) +              // Iconic must-see = always on top
      (isAttraction ? 100 : 0) +         // Real attraction bonus
      (isBusiness ? -200 : 0) +          // Kill generic businesses
      (rating * 5) +                     // Rating matters
      Math.min(reviews, 500) * 0.1 +     // Popular = real attraction
      (l.isFeatured ? 20 : 0) +
      (l.image ? 5 : 0);

    return { ...l, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick top 10, skip businesses
  const picked = scored
    .filter((l) => !BUSINESS_PATTERNS.test(l.title))
    .slice(0, 10);

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
  const [flyoverProgress, setFlyoverProgress] = useState({ current: 0, total: 0 });
  const flyoverWaypointsRef = useRef<FlyoverWaypoint[]>([]);
  const [mapStyle, setMapStyle] = useState<"satellite" | "outdoors" | "dark">("satellite");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [heatmapActive, setHeatmapActive] = useState(false);
  const [mapBearing, setMapBearing] = useState(0);
  const [autoDarkApplied, setAutoDarkApplied] = useState(false);
  const [isNighttime, setIsNighttime] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const userLocationRef = useRef<[number, number] | null>(null);
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

    // ── Bearing tracker for compass rose ──
    map.on("rotate", () => { setMapBearing(map.getBearing()); });

    // ── URL hash sync (shareable map state) ──
    const updateHash = () => {
      const c = map.getCenter();
      const z = map.getZoom().toFixed(2);
      const p = map.getPitch().toFixed(0);
      const b = map.getBearing().toFixed(0);
      window.location.hash = `map=${z}/${c.lat.toFixed(4)}/${c.lng.toFixed(4)}/${p}/${b}`;
    };
    map.on("moveend", updateHash);
    map.on("zoomend", updateHash);

    map.on("style.load", () => {
      // 3D terrain — dramatic mountains
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: "mapbox-dem", exaggeration: 2.2 });
      }

      // Atmospheric sky with golden hour sun
      if (!map.getLayer("sky")) {
        map.addLayer({
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [220, 70],
            "sky-atmosphere-sun-intensity": 8,
            "sky-atmosphere-color": "rgba(135, 206, 235, 1)",
            "sky-atmosphere-halo-color": "rgba(255, 200, 100, 0.4)",
          },
        });
      }

      // Ocean fog for depth
      map.setFog({
        color: "rgba(186, 210, 235, 0.4)",
        "high-color": "rgba(100, 160, 220, 0.3)",
        "horizon-blend": 0.08,
        "space-color": "rgba(15, 23, 42, 1)",
        "star-intensity": 0.15,
      });

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
              "fill-extrusion-color": "#ddd",
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-base": ["get", "min_height"],
              "fill-extrusion-opacity": 0.7,
            },
          },
          labelLayerId
        );
      }

      // Island labels with listing counts (visible at low zoom)
      if (!map.getSource("island-labels")) {
        const islandFeatures = Object.entries(islandCoords).map(([slug, data]) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: data.center },
          properties: { name: data.name, slug, count: 0 },
        }));

        map.addSource("island-labels", {
          type: "geojson",
          data: { type: "FeatureCollection", features: islandFeatures },
        });

        map.addLayer({
          id: "island-labels",
          type: "symbol",
          source: "island-labels",
          maxzoom: 8,
          layout: {
            "text-field": ["case",
              [">", ["get", "count"], 0],
              ["concat", ["get", "name"], " (", ["to-string", ["get", "count"]], ")"],
              ["get", "name"],
            ],
            "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
            "text-size": 13,
            "text-transform": "uppercase",
            "text-letter-spacing": 0.1,
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0,0,0,0.6)",
            "text-halo-width": 2,
          },
        });

        // Click island label to select it
        map.on("click", "island-labels", (e) => {
          const slug = e.features?.[0]?.properties?.slug;
          if (slug && onIslandChange) onIslandChange(slug);
        });
        map.on("mouseenter", "island-labels", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "island-labels", () => { map.getCanvas().style.cursor = ""; });
      }

      setMapReady(true);
    });

    // Cinematic intro — only if no island is selected (check ref for current value)
    map.on("load", () => {
      // Parse URL hash for shared map state
      const hash = window.location.hash;
      const hashMatch = hash.match(/^#map=([\d.]+)\/([-\d.]+)\/([-\d.]+)\/([\d.]+)\/([-\d.]+)/);
      if (hashMatch) {
        const [, z, lat, lng, p, b] = hashMatch.map(Number);
        map.flyTo({
          center: [lng, lat] as [number, number],
          zoom: z,
          pitch: p,
          bearing: b,
          duration: 2000,
          essential: true,
        });
      } else {
        // Auto dark mode check on initial load
        const centerLng = activeIslandRef.current && islandCoords[activeIslandRef.current]
          ? islandCoords[activeIslandRef.current].center[0]
          : CARIBBEAN_CENTER[0];
        const night = isNighttimeAtLng(centerLng);
        setIsNighttime(night);
        if (night && !autoDarkApplied) {
          setAutoDarkApplied(true);
          setMapStyle("dark");
        }

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
      }
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
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);

  // Popup ref
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // ── Show Mapbox popup over pin when listing is selected ──
  useEffect(() => {
    const map = mapRef.current;

    // Remove old popup
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    if (!map || !selected || !selected.latitude || !selected.longitude) return;

    const r = selected.avgRating ? parseFloat(selected.avgRating) : 0;
    const price = selected.priceAmount && parseFloat(selected.priceAmount) > 0
      ? `$${parseFloat(selected.priceAmount).toFixed(0)}${selected.priceUnit ? `<span style="font-weight:400;color:#8896a7">/${selected.priceUnit}</span>` : ""}`
      : "";
    const cfg = categoryConfig[selected.type] || categoryConfig.stay;

    // Distance badge if GPS active
    let distBadge = "";
    if (userLocation && selected.latitude && selected.longitude) {
      const d = haversineKm(userLocation[1], userLocation[0], parseFloat(selected.latitude!), parseFloat(selected.longitude!));
      distBadge = `<span style="display:inline-block;background:#EFF6FF;color:#3B82F6;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:4px;">📍 ${formatDistance(d)}</span>`;
    }

    const safeTitle = escapeHtml(selected.title);
    const safeParish = selected.parish ? escapeHtml(selected.parish) : "";
    const safeIslandName = escapeHtml(selected.islandName);
    const safeImage = selected.image ? escapeHtml(selected.image) : "";
    const safeIslandSlug = encodeURIComponent(selected.islandSlug);
    const safeSlug = encodeURIComponent(selected.slug);

    const html = `
      <div style="width:260px;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;border-radius:12px;">
        ${safeImage ? `<div role="img" aria-label="${safeTitle}" style="height:130px;background:url('${safeImage}') center/cover;"></div>` : ""}
        <div style="padding:12px;">
          <div style="margin-bottom:6px;">
            <span style="background:${cfg.color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;">${cfg.emoji} ${cfg.label}</span>
            ${selected.isFeatured ? '<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:4px;">Featured</span>' : ""}
            ${distBadge}
          </div>
          <h3 style="font-size:14px;font-weight:600;color:#1e293b;line-height:1.3;margin:0 0 4px;">${safeTitle}</h3>
          <p style="font-size:11px;color:#8896a7;margin:0 0 8px;">📍 ${safeParish ? safeParish + ", " : ""}${safeIslandName}</p>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            ${price ? `<span style="font-weight:700;color:#1e293b;font-size:14px;">${price}</span>` : ""}
            ${r > 0 ? `<span style="font-size:12px;color:#1e293b;">⭐ <strong>${r.toFixed(1)}</strong>${selected.reviewCount ? ` <span style="color:#8896a7">(${selected.reviewCount})</span>` : ""}</span>` : ""}
          </div>
          <a href="/${safeIslandSlug}/${safeSlug}" style="display:block;text-align:center;background:#D4A017;color:#fff;padding:8px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">View Details →</a>
        </div>
      </div>
    `;

    const popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: "280px",
      offset: 15,
      className: "vakaygo-popup",
    })
      .setLngLat([parseFloat(selected.longitude!), parseFloat(selected.latitude!)])
      .setHTML(html)
      .addTo(map);

    popup.on("close", () => {
      setSelected(null);
    });

    popupRef.current = popup;
  }, [selected]);

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
        "circle-radius-transition": { duration: 300, delay: 0 },
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#fff",
        "circle-opacity-transition": { duration: 300, delay: 0 },
      },
    });

    // Heatmap layer (hidden by default)
    map.addLayer({
      id: "heatmap-layer",
      type: "heatmap",
      source: "listings",
      maxzoom: 15,
      layout: { visibility: "none" },
      paint: {
        "heatmap-weight": 1,
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 9, 2, 15, 3],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(0,0,0,0)",
          0.2, "rgba(212,160,23,0.4)",
          0.4, "rgba(212,160,23,0.7)",
          0.6, "rgba(249,115,22,0.85)",
          0.8, "rgba(239,68,68,0.9)",
          1, "rgba(220,38,38,1)",
        ],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 15, 9, 30, 15, 40],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.8, 15, 0.3],
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

    // Hover preview popup on unclustered pins
    const hoverPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "vakaygo-hover-popup",
      maxWidth: "240px",
    });

    map.on("mouseenter", "unclustered-point", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties;
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      const listing = listingsMapRef.current.get(props?.id);
      if (!listing) return;

      const cfg = categoryConfig[listing.type] || categoryConfig.stay;
      const r = listing.avgRating ? parseFloat(listing.avgRating).toFixed(1) : "";

      // Distance from user if GPS active
      let distHtml = "";
      const uLoc = userLocationRef.current;
      if (uLoc && listing.latitude && listing.longitude) {
        const d = haversineKm(uLoc[1], uLoc[0], parseFloat(listing.latitude!), parseFloat(listing.longitude!));
        distHtml = `<span style="font-size:10px;color:#3B82F6;font-weight:600;">📍 ${formatDistance(d)}</span>`;
      }

      const safeTitle = escapeHtml(listing.title);
      const safeImage = listing.image ? escapeHtml(listing.image) : "";
      hoverPopup.setLngLat(coords).setHTML(`
        <div style="display:flex;gap:8px;align-items:center;padding:8px;font-family:system-ui,sans-serif;">
          ${safeImage ? `<img src="${safeImage}" alt="${safeTitle}" style="width:56px;height:56px;border-radius:8px;object-fit:cover;flex-shrink:0;" />` : `<div role="img" aria-label="${cfg.label}" style="width:56px;height:56px;border-radius:8px;background:${cfg.color};display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">${cfg.emoji}</div>`}
          <div style="min-width:0;">
            <div style="font-size:12px;font-weight:600;color:#1e293b;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${safeTitle}</div>
            <div style="display:flex;gap:6px;align-items:center;margin-top:3px;">
              ${r ? `<span style="font-size:11px;color:#1e293b;">⭐ ${r}</span>` : ""}
              <span style="font-size:10px;color:${cfg.color};font-weight:600;">${cfg.emoji} ${cfg.label}</span>
              ${distHtml}
            </div>
          </div>
        </div>
      `).addTo(map);
    });

    map.on("mouseleave", "unclustered-point", () => {
      map.getCanvas().style.cursor = "";
      hoverPopup.remove();
    });

    // Pointer cursors for clusters
    map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });
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

  // ── Heatmap toggle: show/hide layers ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !layersInitRef.current) return;

    const pinLayers = ["clusters", "cluster-count", "unclustered-point", "unclustered-label"];

    if (heatmapActive) {
      pinLayers.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none"); });
      if (map.getLayer("heatmap-layer")) map.setLayoutProperty("heatmap-layer", "visibility", "visible");
    } else {
      pinLayers.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible"); });
      if (map.getLayer("heatmap-layer")) map.setLayoutProperty("heatmap-layer", "visibility", "none");
    }
  }, [heatmapActive, mapReady]);

  // ── Update island label counts when listings change ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const source = map.getSource("island-labels") as mapboxgl.GeoJSONSource;
    if (!source) return;

    // Count listings per island
    const counts: Record<string, number> = {};
    listings.forEach((l) => {
      if (l.latitude && l.longitude && l.islandSlug) {
        counts[l.islandSlug] = (counts[l.islandSlug] || 0) + 1;
      }
    });

    const features = Object.entries(islandCoords).map(([slug, data]) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: data.center },
      properties: { name: data.name, slug, count: counts[slug] || 0 },
    }));

    source.setData({ type: "FeatureCollection", features });
  }, [listings, mapReady]);

  // ── Flyover ──
  // Flyover: fly to a specific waypoint index
  const flyToWaypoint = useCallback((waypoints: FlyoverWaypoint[], idx: number) => {
    const map = mapRef.current;
    if (!map || idx >= waypoints.length) {
      setIsFlyover(false);
      setFlyoverLabel("");
      setFlyoverListing(null);
      setFlyoverProgress({ current: 0, total: 0 });
      return;
    }
    const wp = waypoints[idx];
    setFlyoverLabel(wp.label);
    setFlyoverListing(wp.listing || null);
    setFlyoverProgress({ current: idx + 1, total: waypoints.length });

    const isOverview = idx === 0 || idx === waypoints.length - 1;
    map.flyTo({
      center: wp.center,
      zoom: wp.zoom,
      pitch: wp.pitch,
      bearing: wp.bearing,
      duration: isOverview ? 2500 : 4000,
      essential: true,
    });

    flyoverIndexRef.current = idx + 1;
    flyoverTimeoutRef.current = setTimeout(
      () => flyToWaypoint(waypoints, idx + 1),
      isOverview ? 3000 : 5500
    );
  }, []);

  const startFlyover = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const island = activeIslandRef.current;
    const waypoints = island
      ? buildIslandFlyover(island, listings)
      : FLYOVER_WAYPOINTS;

    flyoverWaypointsRef.current = waypoints;
    setIsFlyover(true);
    setSelected(null);
    flyoverIndexRef.current = 0;
    flyToWaypoint(waypoints, 0);
  }, [listings, flyToWaypoint]);

  const stopFlyover = useCallback(() => {
    if (flyoverTimeoutRef.current) clearTimeout(flyoverTimeoutRef.current);
    setIsFlyover(false);
    setFlyoverLabel("");
    setFlyoverListing(null);
    setFlyoverProgress({ current: 0, total: 0 });
  }, []);

  const skipToNext = useCallback(() => {
    if (flyoverTimeoutRef.current) clearTimeout(flyoverTimeoutRef.current);
    const waypoints = flyoverWaypointsRef.current;
    const nextIdx = flyoverIndexRef.current;
    if (nextIdx < waypoints.length) {
      flyToWaypoint(waypoints, nextIdx);
    } else {
      stopFlyover();
    }
  }, [flyToWaypoint, stopFlyover]);

  const skipToPrev = useCallback(() => {
    if (flyoverTimeoutRef.current) clearTimeout(flyoverTimeoutRef.current);
    const waypoints = flyoverWaypointsRef.current;
    const prevIdx = Math.max(0, flyoverIndexRef.current - 2);
    flyToWaypoint(waypoints, prevIdx);
  }, [flyToWaypoint]);

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
  const toggleFullscreen = useCallback(() => {
    const el = mapContainer.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // ── Keyboard navigation ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        e.preventDefault();
        if (isFlyover) { stopFlyover(); return; }
        if (searchOpen) { setSearchOpen(false); setSearchQuery(""); return; }
        if (selected) { setSelected(null); return; }
      }

      // Don't trigger shortcuts if typing in an input
      if (isInput) return;

      if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === "f" || e.key === "F") {
        if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleFullscreen(); }
      } else if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        setHeatmapActive((prev) => !prev);
      } else if (e.key === " ") {
        e.preventDefault();
        if (isFlyover) stopFlyover(); else startFlyover();
      } else if (e.key === "ArrowRight" && isFlyover) {
        e.preventDefault();
        skipToNext();
      } else if (e.key === "ArrowLeft" && isFlyover) {
        e.preventDefault();
        skipToPrev();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFlyover, searchOpen, selected, stopFlyover, startFlyover, skipToNext, skipToPrev, toggleFullscreen]);

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
            aria-label={searchOpen ? "Close search" : "Search the map"}
            aria-expanded={searchOpen}
            className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-lg shadow-lg flex items-center justify-center hover:bg-white transition-colors"
          >
            <Search size={16} className="text-navy-700" />
          </button>
          {searchOpen && (
            <div className="absolute top-0 left-11 w-64">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search listings... (press /)"
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
              onClick={() => { setMapStyle(s); setAutoDarkApplied(true); }}
              className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                mapStyle === s ? "bg-gold-700 text-white" : "text-navy-600 hover:bg-cream-100"
              }`}
            >
              {s === "satellite" ? "Satellite" : s === "outdoors" ? "Terrain" : "Dark"}
            </button>
          ))}
        </div>

        {/* Heatmap / Pins toggle */}
        <div className="flex flex-col gap-1 bg-white/90 backdrop-blur-md rounded-lg shadow-lg p-1">
          <button
            onClick={() => setHeatmapActive(false)}
            className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
              !heatmapActive ? "bg-gold-700 text-white" : "text-navy-600 hover:bg-cream-100"
            }`}
          >
            Pins
          </button>
          <button
            onClick={() => setHeatmapActive(true)}
            className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
              heatmapActive ? "bg-orange-500 text-white" : "text-navy-600 hover:bg-cream-100"
            }`}
          >
            Heat
          </button>
        </div>

        {/* Day/Night indicator */}
        <div className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-lg shadow-lg flex items-center justify-center" title={isNighttime ? "Nighttime at destination" : "Daytime at destination"}>
          {isNighttime ? <Moon size={14} className="text-indigo-400" /> : <Sun size={14} className="text-amber-500" />}
        </div>
      </div>

      {/* Right controls */}
      <div className="absolute top-20 right-3 flex flex-col gap-2 z-10">
        <button onClick={locateUser} className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-lg shadow-lg flex items-center justify-center hover:bg-white transition-colors" title="My location">
          <Navigation size={16} className="text-navy-700" />
        </button>
        <button onClick={isFlyover ? stopFlyover : startFlyover} className={`w-9 h-9 rounded-lg shadow-lg flex items-center justify-center transition-colors ${isFlyover ? "bg-gold-700 text-white" : "bg-white/90 backdrop-blur-md hover:bg-white text-navy-700"}`} title="Cinematic tour">
          {isFlyover ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button onClick={resetView} className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-lg shadow-lg flex items-center justify-center hover:bg-white transition-colors" title={`Reset view (bearing: ${Math.round(mapBearing)}°)`}>
          <Compass size={16} className="text-navy-700 transition-transform duration-200" style={{ transform: `rotate(${-mapBearing}deg)` }} />
        </button>
        <button onClick={toggleFullscreen} className="w-9 h-9 bg-white/90 backdrop-blur-md rounded-lg shadow-lg flex items-center justify-center hover:bg-white transition-colors" title="Fullscreen">
          {isFullscreen ? <Minimize2 size={16} className="text-navy-700" /> : <Maximize2 size={16} className="text-navy-700" />}
        </button>
      </div>

      {/* Listing count & active filter summary */}
      {mapReady && (
        <div className="absolute top-14 left-3 z-10">
          <div className="bg-white/90 backdrop-blur-md rounded-lg shadow-lg px-3 py-2 text-xs max-w-[260px]">
            <div className="font-semibold text-navy-700">
              Showing {listingsMapRef.current.size.toLocaleString()} of {listings.filter(l => l.latitude).length.toLocaleString()} listings
            </div>
            {activeCategories.size < Object.keys(categoryConfig).length && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <span className="text-navy-400">Filters:</span>
                {Array.from(activeCategories).map((cat) => (
                  <span key={cat} className="text-[10px] font-semibold" style={{ color: categoryConfig[cat]?.color }}>
                    {categoryConfig[cat]?.emoji}{categoryConfig[cat]?.label}
                  </span>
                ))}
                <button
                  onClick={() => setActiveCategories(new Set(Object.keys(categoryConfig)))}
                  className="text-[10px] text-red-500 font-semibold hover:text-red-700 ml-1"
                >
                  Clear
                </button>
              </div>
            )}
            {searchQuery && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-navy-400">Search:</span>
                <span className="font-medium text-navy-600">"{searchQuery}"</span>
                <button onClick={() => setSearchQuery("")} className="text-red-500 hover:text-red-700">
                  <X size={10} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Flyover HUD */}
      {isFlyover && flyoverLabel && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
          {/* Listing card or overview label */}
          {flyoverListing ? (
            <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.2)] overflow-hidden flex w-[380px] max-w-[90vw]">
              {flyoverListing.image && (
                <div
                  className="w-32 bg-cover bg-center flex-shrink-0"
                  style={{ backgroundImage: `url(${flyoverListing.image})`, minHeight: "110px" }}
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
                <h3 className="text-[13px] font-semibold text-navy-700 line-clamp-2 leading-snug">
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
            <div className="bg-black/70 backdrop-blur-md text-white px-6 py-2.5 rounded-full text-sm font-semibold shadow-xl">
              {flyoverLabel}
            </div>
          )}

          {/* Progress bar + controls */}
          <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md rounded-full px-4 py-2 shadow-xl">
            <button onClick={skipToPrev} className="text-white/70 hover:text-white transition-colors" title="Previous">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: flyoverProgress.total }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i === flyoverProgress.current - 1
                      ? "w-5 h-2 bg-gold-400"
                      : i < flyoverProgress.current - 1
                      ? "w-2 h-2 bg-white/50"
                      : "w-2 h-2 bg-white/20"
                  }`}
                />
              ))}
            </div>
            <button onClick={skipToNext} className="text-white/70 hover:text-white transition-colors" title="Next">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
            <span className="text-white/50 text-[10px] font-medium ml-1">
              {flyoverProgress.current}/{flyoverProgress.total}
            </span>
            <button onClick={stopFlyover} className="text-white/50 hover:text-red-400 transition-colors ml-1" title="Stop">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Selected listing popup is rendered via Mapbox Popup (see useEffect below) */}

      {/* Popup + animation styles */}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 6px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 0 12px rgba(59,130,246,0.1), 0 2px 8px rgba(0,0,0,0.3); }
        }
        @keyframes popupSlideIn {
          from { opacity: 0; transform: translateY(8px) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes markerAppear {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .vakaygo-popup {
          animation: popupSlideIn 0.2s ease-out;
        }
        .vakaygo-popup .mapboxgl-popup-content {
          padding: 0 !important;
          border-radius: 12px !important;
          overflow: hidden;
          box-shadow: 0 8px 30px rgba(0,0,0,0.18) !important;
          animation: popupSlideIn 0.2s ease-out;
        }
        .vakaygo-popup .mapboxgl-popup-close-button {
          font-size: 18px;
          color: white;
          right: 6px;
          top: 6px;
          background: rgba(0,0,0,0.3);
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          line-height: 1;
          backdrop-filter: blur(4px);
        }
        .vakaygo-popup .mapboxgl-popup-close-button:hover {
          background: rgba(0,0,0,0.5);
        }
        .vakaygo-popup .mapboxgl-popup-tip {
          border-top-color: white !important;
        }
        .vakaygo-hover-popup {
          animation: popupSlideIn 0.15s ease-out;
        }
        .vakaygo-hover-popup .mapboxgl-popup-content {
          padding: 0 !important;
          border-radius: 12px !important;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
          animation: popupSlideIn 0.15s ease-out;
        }
        .vakaygo-hover-popup .mapboxgl-popup-tip {
          border-top-color: white !important;
        }
      `}</style>
    </div>
  );
}
