"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { LeafletMap } from "@/components/maps/leaflet-map";
import { cn } from "@/lib/cn";

/**
 * Where's the event? Search for the address (Google Places) or drop a pin on the map (Google Maps) — the pin is for
 * places without a street address, like a coffee van in a park. Without a Google key it falls back to a typed address
 * and the free OpenStreetMap pin map, so nothing breaks.
 *
 * Google needs these switched on for the key: Maps JavaScript API, Places API (New) and Geocoding API.
 */
export interface PickedLocation { address: string; lat: number | null; lng: number | null; pinned: boolean }

/* eslint-disable @typescript-eslint/no-explicit-any */
type G = any;
let loading: Promise<G> | null = null;
function loadGoogle(key: string): Promise<G> {
  const w = window as unknown as { google?: G; __eosMaps?: () => void };
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    w.__eosMaps = () => resolve(w.google);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=places,marker,geocoding&region=AU&language=en-AU&callback=__eosMaps`;
    s.async = true;
    s.onerror = () => { loading = null; reject(new Error("The map didn't load.")); };
    document.head.appendChild(s);
  });
  return loading;
}

const AU = { lat: -25.6, lng: 134.4 };
const fmt = (n: number) => n.toFixed(6);

export function AddressPicker({ apiKey, mapId, initial, value, onChange }: {
  apiKey: string | null; mapId?: string | null; initial: string; value: PickedLocation | null; onChange: (v: PickedLocation | null) => void;
}) {
  const [mode, setMode] = useState<"search" | "pin">(value?.pinned ? "pin" : "search");
  const tab = (m: "search" | "pin", label: string, Icon: typeof Search) => (
    <button type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
      className={cn("inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-[0.875rem] font-semibold transition sm:flex-none",
        mode === m ? "bg-[var(--portal-brand)] text-[color:var(--portal-brand-fg)]" : "text-ink-muted hover:text-ink")}>
      <Icon className="h-4 w-4" />{label}
    </button>
  );
  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-surface p-1 ring-1 ring-inset ring-line-strong">
        {tab("search", "Find the address", Search)}
        {tab("pin", "Drop a pin", MapPin)}
      </div>
      {apiKey
        ? <GooglePicker key={mode} apiKey={apiKey} mapId={mapId ?? null} mode={mode} initial={initial} value={value} onChange={onChange} />
        : <FreePicker mode={mode} initial={initial} value={value} onChange={onChange} />}
    </div>
  );
}

function GooglePicker({ apiKey, mapId, mode, initial, value, onChange }: {
  apiKey: string; mapId: string | null; mode: "search" | "pin"; initial: string; value: PickedLocation | null; onChange: (v: PickedLocation | null) => void;
}) {
  const [g, setG] = useState<G>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState(value && !value.pinned ? value.address : initial);
  const [list, setList] = useState<{ id: string; main: string; rest: string; p: G }[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const session = useRef<G>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const map = useRef<G>(null);
  const marker = useRef<G>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => { loadGoogle(apiKey).then(setG).catch((e) => setErr(e instanceof Error ? e.message : "The map didn't load.")); }, [apiKey]);

  // Search: suggestions as they type (one paid session per address picked)
  useEffect(() => {
    if (!g || mode !== "search") return;
    const q = text.trim();
    if (q.length < 3 || (value && !value.pinned && value.address === text)) { setList([]); return; }
    let dead = false;
    const t = setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = await g.maps.importLibrary("places");
        session.current ??= new AutocompleteSessionToken();
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, sessionToken: session.current, includedRegionCodes: ["au"] });
        if (dead) return;
        setList((suggestions ?? []).filter((s: G) => s.placePrediction).slice(0, 5).map((s: G) => ({
          id: s.placePrediction.placeId, main: s.placePrediction.mainText?.toString() ?? s.placePrediction.text.toString(),
          rest: s.placePrediction.secondaryText?.toString() ?? "", p: s.placePrediction,
        })));
      } catch { if (!dead) setErr("Address search isn't working right now — type the address instead, or drop a pin."); }
    }, 250);
    return () => { dead = true; clearTimeout(t); };
  }, [g, mode, text, value]);

  const pick = async (p: G) => {
    setBusy(true);
    try {
      const place = p.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location", "displayName"] });
      session.current = null;
      const name = place.displayName && !String(place.formattedAddress ?? "").startsWith(place.displayName) ? `${place.displayName}, ` : "";
      const address = `${name}${place.formattedAddress ?? p.text.toString()}`;
      setText(address); setList([]);
      changed.current({ address, lat: place.location?.lat() ?? null, lng: place.location?.lng() ?? null, pinned: false });
    } catch { setErr("Couldn't get that address — try again, or drop a pin."); }
    finally { setBusy(false); }
  };

  // Pin: tap the map or drag the pin; the nearest address is looked up to go with it
  const where = async (lat: number, lng: number) => {
    marker.current && (marker.current.position = { lat, lng });
    let near = `${fmt(lat)}, ${fmt(lng)}`;
    try {
      const { Geocoder } = await g.maps.importLibrary("geocoding");
      const { results } = await new Geocoder().geocode({ location: { lat, lng } });
      if (results?.[0]?.formatted_address) near = `Near ${results[0].formatted_address}`;
    } catch { /* coordinates are enough */ }
    changed.current({ address: near, lat, lng, pinned: true });
  };

  useEffect(() => {
    if (!g || mode !== "pin" || !mapEl.current) return;
    let dead = false;
    (async () => {
      const { Map } = await g.maps.importLibrary("maps");
      const { AdvancedMarkerElement } = await g.maps.importLibrary("marker");
      if (dead || !mapEl.current) return;
      const start = value?.lat != null && value?.lng != null ? { lat: value.lat, lng: value.lng } : null;
      map.current = new Map(mapEl.current, { center: start ?? AU, zoom: start ? 17 : 4, mapId: mapId || "DEMO_MAP_ID", gestureHandling: "cooperative",
        streetViewControl: false, mapTypeControl: true, mapTypeControlOptions: { mapTypeIds: ["roadmap", "hybrid"] }, fullscreenControl: false, clickableIcons: false });
      marker.current = new AdvancedMarkerElement({ map: map.current, position: start, gmpDraggable: true, title: "Event location" });
      marker.current.addListener("dragend", () => { const p = marker.current.position; void where(typeof p.lat === "function" ? p.lat() : p.lat, typeof p.lng === "function" ? p.lng() : p.lng); });
      map.current.addListener("click", (e: G) => { if (e.latLng) void where(e.latLng.lat(), e.latLng.lng()); });
      // No spot yet: start from the address they searched, if any
      if (!start && text.trim().length > 3) {
        try {
          const { Geocoder } = await g.maps.importLibrary("geocoding");
          const { results } = await new Geocoder().geocode({ address: text, region: "au" });
          const loc = results?.[0]?.geometry?.location;
          if (loc && !dead) { map.current.setCenter(loc); map.current.setZoom(16); }
        } catch { /* stay on Australia */ }
      }
    })().catch(() => setErr("The map didn't load — search for the address instead."));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, mode]);

  const mine = () => {
    if (!navigator.geolocation) { setErr("Your browser can't share your location — tap the map instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => {
      setLocating(false);
      map.current?.setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }); map.current?.setZoom(18);
      void where(p.coords.latitude, p.coords.longitude);
    }, () => { setLocating(false); setErr("Couldn't get your location — tap the map instead."); }, { enableHighAccuracy: true, timeout: 10000 });
  };

  if (mode === "search") return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input value={text} onChange={(e) => { setText(e.target.value); changed.current(e.target.value.trim() ? { address: e.target.value.trim(), lat: null, lng: null, pinned: false } : null); }}
          placeholder="Start typing the venue or street address" autoComplete="off" aria-label="Event address" maxLength={300}
          className="h-12 w-full rounded-xl bg-surface pl-9 pr-10 text-base text-ink ring-1 ring-inset ring-line-strong placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-[var(--portal-brand)] sm:h-11 sm:text-[0.875rem]" />
        {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-faint" />}
      </div>
      {list.length > 0 && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl bg-surface shadow-lg ring-1 ring-line-strong">
          {list.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => void pick(s.p)} className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-[var(--portal-brand-soft)]">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <span className="min-w-0"><span className="block text-[0.875rem] font-medium text-ink">{s.main}</span>{s.rest && <span className="block truncate text-[0.8125rem] text-ink-muted">{s.rest}</span>}</span>
              </button>
            </li>
          ))}
          <li className="px-3 py-1.5 text-right text-[0.6875rem] text-ink-faint">powered by Google</li>
        </ul>
      )}
      {value && !value.pinned && value.lat != null && <p className="mt-2 flex items-center gap-1.5 text-[0.8125rem] text-emerald-700 dark:text-emerald-400"><MapPin className="h-4 w-4" />Found on the map</p>}
      {err && <p className="mt-2 text-[0.8125rem] text-amber-700 dark:text-amber-400">{err}</p>}
    </div>
  );

  return (
    <div className="space-y-2">
      <div ref={mapEl} className="h-[300px] w-full overflow-hidden rounded-xl bg-surface ring-1 ring-inset ring-line-strong sm:h-[340px]">
        {!g && !err && <div className="grid h-full place-items-center text-[0.875rem] text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" /></div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={mine} disabled={!g || locating} className="inline-flex h-10 items-center gap-2 rounded-lg bg-surface px-3 text-[0.8125rem] font-semibold text-ink ring-1 ring-inset ring-line-strong disabled:opacity-50">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}I&apos;m there now — use my location
        </button>
        <span className="text-[0.8125rem] text-ink-muted">or tap the map, then drag the pin to the exact spot.</span>
      </div>
      {value?.pinned && <p className="text-[0.8125rem] text-ink"><MapPin className="mr-1 inline h-4 w-4 text-[var(--portal-brand)]" />{value.address}</p>}
      {err && <p className="text-[0.8125rem] text-amber-700 dark:text-amber-400">{err}</p>}
    </div>
  );
}

/** No Google key: a typed address, and the free OpenStreetMap map for a pin. */
function FreePicker({ mode, initial, value, onChange }: { mode: "search" | "pin"; initial: string; value: PickedLocation | null; onChange: (v: PickedLocation | null) => void }) {
  const [text, setText] = useState(value && !value.pinned ? value.address : initial);
  if (mode === "search") return (
    <input value={text} onChange={(e) => { setText(e.target.value); onChange(e.target.value.trim() ? { address: e.target.value.trim(), lat: null, lng: null, pinned: false } : null); }}
      placeholder="Venue and street address" aria-label="Event address" maxLength={300}
      className="h-12 w-full rounded-xl bg-surface px-3 text-base text-ink ring-1 ring-inset ring-line-strong placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-[var(--portal-brand)] sm:h-11 sm:text-[0.875rem]" />
  );
  const pin = value?.pinned && value.lat != null && value.lng != null ? { lat: value.lat, lng: value.lng } : null;
  return (
    <div className="space-y-2">
      <LeafletMap height={300} zoom={pin ? 17 : 11} pins={pin ? [{ ...pin, label: "Event location" }] : []}
        onPick={(lat, lng) => onChange({ address: `Pin ${fmt(lat)}, ${fmt(lng)}`, lat, lng, pinned: true })} />
      <p className="text-[0.8125rem] text-ink-muted">{pin ? <>Pinned at {fmt(pin.lat)}, {fmt(pin.lng)} — drag or tap to move it.</> : "Tap the map where the event is."}</p>
    </div>
  );
}
