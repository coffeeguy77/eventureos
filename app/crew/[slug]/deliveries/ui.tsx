"use client";

import { useState } from "react";
import { Check, Loader2, MapPin, MessageSquare, Navigation, Phone, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { directionsTo } from "@/lib/wholesale/deliveries";
import { Card, Pill } from "../parts";
import { btn, useRun } from "../ui";
import { markDelivered, undoDelivered } from "./actions";

export interface Stop {
  id: string; number: string; day: string; delivered: boolean; name: string; contact: string | null; phone: string | null;
  address: string; suburb: string; instructions: string | null; note: string | null; items: string[];
  proof: { at: string; by: string; located: boolean; canUndo: boolean } | null;
}

const GEO_ERR: Record<number, string> = { 1: "Location permission was turned off", 2: "The phone couldn't find its location", 3: "Finding the location took too long" };

/** Where the phone is right now (high accuracy, up to 12 seconds). Never throws. */
function locate(): Promise<{ geo: { lat: number; lng: number; accuracy: number } | null; error: string | null }> {
  return new Promise((res) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return res({ geo: null, error: "This phone doesn't share its location" });
    navigator.geolocation.getCurrentPosition(
      (p) => res({ geo: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }, error: null }),
      (e) => res({ geo: null, error: GEO_ERR[e.code] ?? "No location" }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 },
    );
  });
}

export function DeliveryList({ slug, today, stops, tz }: { slug: string; today: string; stops: Stop[]; tz: string }) {
  const days = [...new Set(stops.map((s) => s.day))];
  return (
    <div className="space-y-6">
      {days.map((d) => {
        const list = stops.filter((s) => s.day === d);
        const left = list.filter((s) => !s.delivered).length;
        return (
          <section key={d}>
            <h2 className="mb-2 flex items-center gap-2 px-1 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">
              {fmtDate(d, "weekday")}{d === today && <Pill tone="brand">Today</Pill>}
              <span className="ml-auto normal-case tracking-normal">{left ? `${left} to go` : "done ✓"}</span>
            </h2>
            <div className="space-y-3">{list.map((s) => <StopCard key={s.id} slug={slug} stop={s} tz={tz} late={!s.delivered && d < today} />)}</div>
          </section>
        );
      })}
    </div>
  );
}

function StopCard({ slug, stop: s, tz, late }: { slug: string; stop: Stop; tz: string; late: boolean }) {
  const { run, pending, toast } = useRun();
  const [locating, setLocating] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const busy = pending || locating;
  const time = (iso: string) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

  const tick = async () => {
    setLocating(true);
    const { geo, error } = await locate();
    setLocating(false);
    run(() => markDelivered(slug, s.id, { geo, geoError: error, deviceTime: new Date().toISOString(), note }), () => { setNote(""); setNoteOpen(false); });
  };

  return (
    <Card className={cn(s.delivered && "opacity-75")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold text-ink">
            {s.name}
            {s.delivered ? <Pill tone="green">Delivered</Pill> : late ? <Pill tone="red">Overdue</Pill> : null}
          </p>
          {s.address
            ? <a href={directionsTo(s.address)} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-start gap-1 text-[0.8125rem] text-ink-muted active:opacity-70"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="underline decoration-line-strong underline-offset-2">{s.address}</span></a>
            : <p className="mt-0.5 text-[0.8125rem] text-rose-700">No address on file — ask the office.</p>}
          {s.contact && <p className="text-[0.75rem] text-ink-faint">Contact: {s.contact}</p>}
        </div>
        <span className="shrink-0 text-[0.6875rem] text-ink-faint">{s.number}</span>
      </div>

      {(s.instructions || s.note) && (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-200">
          {s.instructions && <p>{s.instructions}</p>}
          {s.note && <p className={cn(s.instructions && "mt-1")}>Order note: {s.note}</p>}
        </div>
      )}

      <ul className="mt-2 space-y-0.5 text-[0.8125rem] text-ink">{s.items.map((it, i) => <li key={i}>{it}</li>)}</ul>

      {s.delivered ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <p className="flex-1 text-[0.8125rem] text-emerald-700">
            <Check className="mr-1 inline h-4 w-4" />
            {s.proof ? `${time(s.proof.at)} by ${s.proof.by}${s.proof.located ? "" : " · no location"}` : "Marked delivered by the office"}
          </p>
          {s.proof?.canUndo && <button type="button" disabled={busy} onClick={() => run(() => undoDelivered(slug, s.id))} className={btn("ghost", "h-9 px-3 text-[0.8125rem]")}><Undo2 className="h-4 w-4" />Undo</button>}
        </div>
      ) : (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {noteOpen && (
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Left at the back door with Sam"
              className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[0.9375rem] text-ink" aria-label="Delivery note" />
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={tick} className={btn("primary", "flex-1 basis-40")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" />}{locating ? "Getting location…" : pending ? "Saving…" : "Delivered"}
            </button>
            {!noteOpen && <button type="button" onClick={() => setNoteOpen(true)} className={btn("secondary", "px-3")} aria-label="Add a note"><MessageSquare className="h-4 w-4" /></button>}
            {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className={btn("secondary", "px-3")} aria-label={`Call ${s.name}`}><Phone className="h-4 w-4" /></a>}
            {s.address && <a href={directionsTo(s.address)} target="_blank" rel="noopener noreferrer" className={btn("secondary", "px-3")} aria-label="Directions"><Navigation className="h-4 w-4" /></a>}
          </div>
        </div>
      )}
      {toast}
    </Card>
  );
}
