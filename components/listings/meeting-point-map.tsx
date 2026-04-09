"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin } from "lucide-react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export function MeetingPointMap({
  lat,
  lng,
  note,
}: {
  lat: number;
  lng: number;
  note?: string;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [lng, lat],
      zoom: 14,
      attributionControl: false,
      interactive: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    // Gold marker
    const el = document.createElement("div");
    el.className = "vakaygo-meeting-marker";
    el.innerHTML = `
      <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.164 0 0 7.164 0 16c0 12 16 24 16 24s16-12 16-24C32 7.164 24.836 0 16 0z" fill="#C8912E"/>
        <circle cx="16" cy="15" r="6" fill="white"/>
      </svg>
    `;

    new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng]);

  if (!MAPBOX_TOKEN) return null;

  return (
    <div className="mt-8">
      <h2
        className="text-xl font-bold text-navy-700 mb-4"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Meeting Point
      </h2>
      <div
        ref={mapContainer}
        className="w-full rounded-2xl overflow-hidden shadow-[var(--shadow-card)]"
        style={{ height: 200 }}
      />
      {note && (
        <div className="flex items-start gap-2 mt-3 text-sm text-navy-500">
          <MapPin size={14} className="text-gold-500 shrink-0 mt-0.5" />
          <span>{note}</span>
        </div>
      )}
    </div>
  );
}
