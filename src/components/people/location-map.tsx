"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n/es-AR";

export const NEUQUEN = { lat: -38.95, lng: -68.06 };

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Leaflet map with a draggable teal marker. Click or drag reports the point; `point` prop moves it. */
export default function LocationMap({
  point,
  onPick,
}: {
  point: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
  });

  // Mount once; initial center comes from the first `point`.
  useEffect(() => {
    if (!el.current || map.current) return;
    const start = point ?? NEUQUEN;
    const m = L.map(el.current, { scrollWheelZoom: false }).setView(
      [start.lat, start.lng],
      point ? 14 : 8,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">${t.locations.picker.attribution}</a>`,
    })
      .on("tileerror", () => setFailed(true))
      .on("tileload", () => setFailed(false))
      .addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) =>
      onPickRef.current(round(e.latlng.lat), round(e.latlng.lng)),
    );
    map.current = m;
    return () => {
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync marker with the point.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!point) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const mk = L.marker([point.lat, point.lng], {
        draggable: true,
        icon: L.divIcon({ className: "vq-map-marker", iconSize: [20, 20], iconAnchor: [10, 10] }),
      }).addTo(m);
      mk.on("dragend", () => {
        const p = mk.getLatLng();
        onPickRef.current(round(p.lat), round(p.lng));
      });
      marker.current = mk;
    } else {
      marker.current.setLatLng([point.lat, point.lng]);
    }
    if (!m.getBounds().contains([point.lat, point.lng])) m.panTo([point.lat, point.lng]);
  }, [point]);

  return (
    <>
      {failed ? <p className="text-muted text-xs">{t.locations.picker.mapError}</p> : null}
      <div
        ref={el}
        role="application"
        aria-label={t.locations.picker.mapLabel}
        className="vq-map border-border h-60 w-full overflow-hidden rounded-[var(--radius-control)] border"
      />
    </>
  );
}
