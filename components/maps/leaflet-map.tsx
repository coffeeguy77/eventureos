"use client";

import { useEffect, useRef } from "react";

/**
 * A small OpenStreetMap map (Leaflet, loaded from a CDN the first time it's needed — no npm package).
 * Shows pins and an optional circle; with onPick, tapping the map (or dragging the first pin) moves it.
 */
type L = {
  map: (el: HTMLElement, o?: Record<string, unknown>) => LMap; tileLayer: (url: string, o: Record<string, unknown>) => { addTo: (m: LMap) => void };
  circleMarker: (ll: [number, number], o: Record<string, unknown>) => LLayer; marker: (ll: [number, number], o?: Record<string, unknown>) => LLayer & { on: (e: string, f: (ev: { target: { getLatLng: () => { lat: number; lng: number } } }) => void) => void };
  circle: (ll: [number, number], o: Record<string, unknown>) => LLayer; featureGroup: (l: LLayer[]) => { getBounds: () => unknown };
};
type LMap = { setView: (ll: [number, number], z: number) => LMap; fitBounds: (b: unknown, o?: Record<string, unknown>) => void; on: (e: string, f: (ev: { latlng: { lat: number; lng: number } }) => void) => void; remove: () => void; removeLayer: (l: LLayer) => void };
type LLayer = { addTo: (m: LMap) => LLayer; bindTooltip?: (t: string) => LLayer };

let loading: Promise<L> | null = null;
function loadLeaflet(): Promise<L> {
  const w = window as unknown as { L?: L };
  if (w.L) return Promise.resolve(w.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; js.async = true;
    js.onload = () => (w.L ? resolve(w.L) : reject(new Error("map didn't load")));
    js.onerror = () => reject(new Error("map didn't load"));
    document.head.appendChild(js);
  });
  return loading;
}

export interface Pin { lat: number; lng: number; label: string; colour?: string }

export function LeafletMap({ pins, circle, onPick, height = 260, zoom = 17 }: { pins: Pin[]; circle?: { lat: number; lng: number; metres: number } | null; onPick?: (lat: number, lng: number) => void; height?: number; zoom?: number }) {
  const el = useRef<HTMLDivElement | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const key = JSON.stringify({ pins, circle });
  useEffect(() => {
    let map: LMap | null = null, dead = false;
    loadLeaflet().then((L) => {
      if (dead || !el.current) return;
      const first = pins[0] ?? (circle ? { lat: circle.lat, lng: circle.lng } : { lat: -35.2809, lng: 149.13 });
      map = L.map(el.current, { scrollWheelZoom: false }).setView([first.lat, first.lng], zoom);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
      const layers: LLayer[] = [];
      if (circle) layers.push(L.circle([circle.lat, circle.lng], { radius: circle.metres, color: "#6028EC", weight: 2, fillOpacity: 0.12 }).addTo(map));
      pins.forEach((p, i) => {
        if (onPick && i === 0) {
          const m = L.marker([p.lat, p.lng], { draggable: true });
          m.addTo(map!); m.bindTooltip?.(p.label);
          m.on("dragend", (ev) => { const ll = ev.target.getLatLng(); pick.current?.(ll.lat, ll.lng); });
          layers.push(m);
        } else {
          const c = L.circleMarker([p.lat, p.lng], { radius: 8, color: "#fff", weight: 2, fillColor: p.colour ?? "#6028EC", fillOpacity: 1 }).addTo(map!);
          c.bindTooltip?.(p.label);
          layers.push(c);
        }
      });
      if (onPick) map.on("click", (ev) => pick.current?.(ev.latlng.lat, ev.latlng.lng));
      else if (layers.length > 1) map.fitBounds(L.featureGroup(layers).getBounds(), { padding: [30, 30], maxZoom: zoom });
    }).catch(() => { if (el.current) el.current.textContent = "The map couldn't load."; });
    return () => { dead = true; map?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, zoom]);
  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-lg bg-canvas text-[0.75rem] text-ink-muted ring-1 ring-line" />;
}
