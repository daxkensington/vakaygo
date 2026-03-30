"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Star, MapPin } from "lucide-react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";

// Import Leaflet CSS
import "leaflet/dist/leaflet.css";

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

// ─── Pin colors by listing type ─────────────────────────────────
const pinColors: Record<string, string> = {
  stay: "#D4A017",       // gold
  tour: "#14B8A6",       // teal
  excursion: "#14B8A6",  // teal
  dining: "#B8860B",     // gold-dark
  event: "#0D9488",      // teal-dark
  transport: "#1E3A5F",  // navy
  transfer: "#1E3A5F",   // navy
  vip: "#D4A017",        // gold
  guide: "#D4A017",      // gold
};

const typeLabels: Record<string, string> = {
  stay: "Stay",
  tour: "Tour",
  excursion: "Excursion",
  dining: "Dining",
  event: "Event",
  transport: "Transport",
  transfer: "Transfer",
  vip: "VIP",
  guide: "Guide",
};

// ─── Create a colored pin icon ──────────────────────────────────
function createPinIcon(type: string, price?: string) {
  const color = pinColors[type] || "#1E3A5F";
  const label = price ? `$${parseFloat(price).toFixed(0)}` : typeLabels[type] || "";

  return L.divIcon({
    className: "vakaygo-map-pin",
    html: `
      <div style="
        background: ${color};
        color: white;
        padding: 4px 8px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        border: 2px solid white;
        cursor: pointer;
        transform: translate(-50%, -100%);
        position: relative;
      ">
        ${label}
        <div style="
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid ${color};
        "></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// ─── Island coordinates for zoom ────────────────────────────────
const islandCoords: Record<string, { lat: number; lng: number; zoom: number }> = {
  grenada: { lat: 12.1165, lng: -61.679, zoom: 11 },
  "trinidad-and-tobago": { lat: 10.5, lng: -61.3, zoom: 9 },
  barbados: { lat: 13.1939, lng: -59.5432, zoom: 11 },
  "st-lucia": { lat: 13.9094, lng: -60.9789, zoom: 11 },
  jamaica: { lat: 18.1096, lng: -77.2975, zoom: 9 },
  bahamas: { lat: 25.034, lng: -77.3963, zoom: 8 },
  antigua: { lat: 17.0608, lng: -61.7964, zoom: 11 },
  dominica: { lat: 15.415, lng: -61.371, zoom: 11 },
  "st-vincent": { lat: 13.2528, lng: -61.1971, zoom: 11 },
  aruba: { lat: 12.5211, lng: -69.9683, zoom: 12 },
  curacao: { lat: 12.1696, lng: -68.99, zoom: 11 },
  "cayman-islands": { lat: 19.3133, lng: -81.2546, zoom: 10 },
  "puerto-rico": { lat: 18.2208, lng: -66.5901, zoom: 9 },
  "dominican-republic": { lat: 18.7357, lng: -70.1627, zoom: 8 },
  "turks-and-caicos": { lat: 21.694, lng: -71.7979, zoom: 10 },
  "us-virgin-islands": { lat: 18.3358, lng: -64.8963, zoom: 11 },
  "british-virgin-islands": { lat: 18.4207, lng: -64.64, zoom: 11 },
  "st-kitts": { lat: 17.3578, lng: -62.783, zoom: 11 },
  martinique: { lat: 14.6415, lng: -61.0242, zoom: 11 },
  guadeloupe: { lat: 16.265, lng: -61.551, zoom: 10 },
  bonaire: { lat: 12.1443, lng: -68.2655, zoom: 12 },
};

// ─── Map controller that responds to island changes ─────────────
function MapController({ activeIsland }: { activeIsland: string }) {
  const map = useMap();

  useEffect(() => {
    if (activeIsland && islandCoords[activeIsland]) {
      const { lat, lng, zoom } = islandCoords[activeIsland];
      map.flyTo([lat, lng], zoom, { duration: 1.2 });
    } else {
      map.flyTo([15, -65], 5, { duration: 1.2 });
    }
  }, [activeIsland, map]);

  return null;
}

// ─── Main Map View Component ────────────────────────────────────
export default function MapView({
  listings,
  activeIsland,
}: {
  listings: MapListing[];
  activeIsland: string;
}) {
  const mapRef = useRef<L.Map | null>(null);

  // Filter to only listings with coordinates
  const mappableListings = listings.filter(
    (l) => l.latitude && l.longitude && parseFloat(l.latitude) !== 0
  );

  const defaultCenter: [number, number] = activeIsland && islandCoords[activeIsland]
    ? [islandCoords[activeIsland].lat, islandCoords[activeIsland].lng]
    : [15, -65];

  const defaultZoom = activeIsland && islandCoords[activeIsland]
    ? islandCoords[activeIsland].zoom
    : 5;

  return (
    <>
      <style>{`
        .vakaygo-map-pin {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 16px !important;
          padding: 0 !important;
          overflow: hidden;
          box-shadow: 0 8px 30px rgba(0,0,0,0.15) !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
          min-width: 240px;
        }
        .leaflet-popup-tip {
          box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
        }
      `}</style>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="w-full h-full rounded-2xl"
        style={{ minHeight: "400px" }}
        ref={mapRef}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController activeIsland={activeIsland} />

        {mappableListings.map((listing) => (
          <Marker
            key={listing.id}
            position={[parseFloat(listing.latitude!), parseFloat(listing.longitude!)]}
            icon={createPinIcon(listing.type, listing.priceAmount || undefined)}
          >
            <Popup>
              <ListingPopup listing={listing} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </>
  );
}

// ─── Popup card for a listing ───────────────────────────────────
function ListingPopup({ listing }: { listing: MapListing }) {
  const rating = listing.avgRating ? parseFloat(listing.avgRating) : 0;
  const typeColor = pinColors[listing.type] || "#1E3A5F";

  return (
    <Link
      href={`/${listing.islandSlug}/${listing.slug}`}
      className="block no-underline"
    >
      {/* Image */}
      {listing.image && (
        <div
          className="h-28 w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${listing.image})` }}
        />
      )}

      {/* Content */}
      <div className="p-3">
        {/* Type badge */}
        <span
          className="inline-block text-white text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5"
          style={{ backgroundColor: typeColor }}
        >
          {typeLabels[listing.type] || listing.type}
        </span>

        <h4 className="font-semibold text-sm text-navy-700 leading-snug line-clamp-2 mb-1">
          {listing.title}
        </h4>

        <p className="text-[11px] text-navy-400 flex items-center gap-1 mb-1.5">
          <MapPin size={10} />
          {listing.parish ? `${listing.parish}, ` : ""}
          {listing.islandName}
        </p>

        <div className="flex items-center justify-between">
          {listing.priceAmount && parseFloat(listing.priceAmount) > 0 && (
            <span className="font-bold text-sm text-navy-700">
              ${parseFloat(listing.priceAmount).toFixed(2)}
              <span className="font-normal text-navy-400 text-xs">
                {listing.priceUnit ? ` / ${listing.priceUnit}` : ""}
              </span>
            </span>
          )}
          {rating > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <Star size={11} className="text-gold-500 fill-gold-500" />
              <span className="font-semibold text-navy-700">{rating.toFixed(1)}</span>
              {listing.reviewCount && listing.reviewCount > 0 && (
                <span className="text-navy-300">({listing.reviewCount})</span>
              )}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
