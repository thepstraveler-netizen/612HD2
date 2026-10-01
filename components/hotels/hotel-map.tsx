"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  price: string | null;
  href: string;
};

/**
 * Hotels on a map (Leaflet + any XYZ tile server from settings). Each marker
 * is a price pill that links to the hotel. Leaflet touches `window`, so it
 * loads only in the browser.
 */
export function HotelMap({
  points,
  tiles,
  center,
  label,
  className,
}: {
  points: MapPoint[];
  tiles: { url: string; attribution: string };
  /** Shown when no hotel has coordinates (the searched city). */
  center: [number, number];
  label: string;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: LeafletMap | undefined;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false });
      L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: 19 }).addTo(map);
      const bounds = L.latLngBounds([]);
      for (const p of points) {
        const pill = document.createElement("a");
        pill.href = p.href;
        pill.className =
          "block whitespace-nowrap rounded-full bg-brand-navy px-2 py-1 text-xs font-bold text-white shadow ring-2 ring-white";
        pill.textContent = p.price ?? p.label;
        // Leaflet's stylesheet colours links; keep the pill readable.
        pill.style.color = "#fff";
        pill.title = p.label;
        pill.setAttribute("aria-label", p.price ? `${p.label}, ${p.price}` : p.label);
        const icon = L.divIcon({ html: pill, className: "", iconSize: undefined, iconAnchor: [24, 12] });
        L.marker([p.lat, p.lng], { icon, title: p.label, keyboard: false }).addTo(map);
        bounds.extend([p.lat, p.lng]);
      }
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      else map.setView(center, 13);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, tiles, center]);

  return <div ref={container} className={className} role="region" aria-label={label} />;
}
