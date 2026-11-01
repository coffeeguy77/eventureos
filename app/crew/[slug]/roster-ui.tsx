"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Coffee, Loader2, LogIn, LogOut, Megaphone, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { btn, useRun } from "./ui";
import { cancelLeave, cancelOffer, claimOffer, clock, offerShift, requestLeave, saveAvailability, takeOpenRosterShift } from "./roster-actions";

const field = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[0.9375rem]";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function since(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
function getWhere(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  });
}

/** Square-crop and shrink to a small JPEG (about 20–40 KB). */
function shrink(src: CanvasImageSource, w: number, h: number): string {
  const side = Math.min(w, h), c = document.createElement("canvas");
  c.width = 320; c.height = 320;
  c.getContext("2d")!.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 320, 320);
  return c.toDataURL("image/jpeg", 0.7);
}

/**
 * The selfie step before clocking on / off: the front camera in the app; if the phone won't share the camera there,
 * its own camera opens instead. Nothing is sent until they take the photo.
 */
function Selfie({ label, busy, onShot, onCancel }: { label: string; busy: boolean; onShot: (photo: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const [live, setLive] = useState<"starting" | "on" | "off">("starting");
  useEffect(() => {
    let st: MediaStream | null = null, dead = false;
    if (!navigator.mediaDevices?.getUserMedia) { setLive("off"); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } }, audio: false })
      .then((s) => { if (dead) { s.getTracks().forEach((t) => t.stop()); return; } st = s; if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => undefined); } setLive("on"); })
      .catch(() => setLive("off"));
    return () => { dead = true; st?.getTracks().forEach((t) => t.stop()); };
  }, []);
  const snap = () => { const v = video.current; if (v?.videoWidth) onShot(shrink(v, v.videoWidth, v.videoHeight)); };
  const picked = (f: File | undefined) => {
    if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => { onShot(shrink(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
    img.src = url;
  };
  return (
    <div className="space-y-3">
      <p className="text-[0.9375rem] font-semibold text-ink">Photo to {label.toLowerCase()}</p>
      {live !== "off" ? (
        <video ref={video} playsInline muted className="mx-auto aspect-square w-56 rounded-2xl bg-canvas object-cover ring-1 ring-line [transform:scaleX(-1)]" aria-label="Your camera" />
      ) : (
        <p className="text-[0.8125rem] text-ink-muted">Your phone didn&apos;t share the camera here — tap below to open your camera and take a selfie.</p>
      )}
      <input ref={file} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => picked(e.target.files?.[0])} />
      <button className={btn("primary", "h-14 w-full text-[1rem]")} disabled={busy || live === "starting"}
        onClick={() => (live === "on" ? snap() : file.current?.click())}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}{live === "on" ? `Take photo & ${label.toLowerCase()}` : "Open camera"}
      </button>
      <button className={btn("ghost", "w-full")} disabled={busy} onClick={onCancel}><X className="h-4 w-4" />Cancel</button>
    </div>
  );
}

/** Clock on / break / clock off — with a selfie when the business has photos switched on. */
export function ClockPanel({ slug, open, needsPlace, cafePhone = true, cafeIpad = false, events = [], photo = false }: {
  slug: string; open: { clock_in: string; break_started_at: string | null; break_minutes: number } | null; needsPlace: boolean;
  cafePhone?: boolean; cafeIpad?: boolean; events?: { id: string; name: string; start: string | null }[]; photo?: boolean;
}) {
  const { run, pending, toast } = useRun();
  const [, tick] = useState(0);
  const [cam, setCam] = useState<{ what: "on" | "off"; eventId: string | null } | null>(null);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  // the location is saved when the phone gives it (and checked against the café pin for café shifts); off = not saved
  const send = (what: "on" | "break" | "back" | "off", eventId: string | null, pic: string | null) =>
    run(async () => { const r = await clock(slug, what, what === "on" || what === "off" ? await getWhere() : null, eventId, pic); if (r.ok) setCam(null); return r; });
  const go = (what: "on" | "break" | "back" | "off", eventId: string | null = null) =>
    photo && (what === "on" || what === "off") ? setCam({ what, eventId }) : send(what, eventId, null);
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-5 text-center shadow-card ring-1 ring-line">
      {cam ? (
        <Selfie label={cam.what === "on" ? "Clock on" : "Clock off"} busy={pending} onCancel={() => setCam(null)} onShot={(pic) => send(cam.what, cam.eventId, pic)} />
      ) : !open ? (
        <>
          <p className="text-[0.9375rem] text-ink-muted">You&apos;re not clocked on.</p>
          {cafePhone && <button className={btn("primary", "h-14 w-full text-[1rem]")} disabled={pending} onClick={() => go("on")}>{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}Clock on{events.length ? " — café shift" : ""}</button>}
          {events.map((e) => (
            <button key={e.id} className={btn(cafePhone ? "secondary" : "primary", "h-14 w-full text-[1rem]")} disabled={pending} onClick={() => go("on", e.id)}>
              <LogIn className="h-5 w-5" />Clock on — {e.name}{e.start ? ` (${e.start.slice(0, 5)})` : ""}
            </button>
          ))}
          {!cafePhone && !events.length && <p className="text-[0.875rem] text-ink-muted">{cafeIpad ? "Café shifts are clocked on at the café iPad." : "No shift to clock on for today."}</p>}
          {(cafePhone || events.length > 0) && <p className="text-[0.75rem] text-ink-faint">{photo ? "You'll take a quick selfie. " : ""}{needsPlace ? "Your phone will ask for your location to check you're at work." : "Your phone may ask for your location — it's saved with your clock-on if you allow it."}</p>}
        </>
      ) : (
        <>
          <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{open.break_started_at ? "On a break" : "Clocked on"}</p>
          <p className="text-[1.75rem] font-bold text-ink">{since(open.break_started_at ?? open.clock_in)}</p>
          <p className="text-[0.8125rem] text-ink-muted">since {new Date(open.break_started_at ?? open.clock_in).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{open.break_minutes ? ` · ${open.break_minutes} min break so far` : ""}</p>
          <div className="grid grid-cols-2 gap-2">
            {open.break_started_at
              ? <button className={btn("secondary", "h-14")} disabled={pending} onClick={() => go("back")}><Coffee className="h-5 w-5" />End break</button>
              : <button className={btn("secondary", "h-14")} disabled={pending} onClick={() => go("break")}><Coffee className="h-5 w-5" />Start break</button>}
            <button className={btn("primary", "h-14")} disabled={pending} onClick={() => go("off")}>{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}Clock off</button>
          </div>
        </>
      )}
      {toast}
    </div>
  );
}

type AvailRow = { weekday: number; available: boolean; start: string | null; finish: string | null };
/** My regular weekly availability: each day all day, only some hours, or not at all. */
export function AvailabilityEditor({ slug, rows }: { slug: string; rows: AvailRow[] }) {
  const { run, pending, toast } = useRun();
  const init = (d: number) => {
    const r = rows.find((x) => x.weekday === d);
    return { mode: !r ? "any" : !r.available ? (r.start ? "except" : "no") : "only", start: r?.start ?? "", finish: r?.finish ?? "" };
  };
  const [v, setV] = useState(() => [1, 2, 3, 4, 5, 6, 0].map((d) => ({ d, ...init(d) })));
  const set = (d: number, p: Partial<(typeof v)[number]>) => setV(v.map((x) => (x.d === d ? { ...x, ...p } : x)));
  const out = (): AvailRow[] => v.filter((x) => x.mode !== "any").map((x) => ({ weekday: x.d, available: x.mode === "only", start: x.mode === "no" ? null : x.start || null, finish: x.mode === "no" ? null : x.finish || null }));
  return (
    <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
      {v.map((x) => (
        <div key={x.d} className="grid grid-cols-[3rem_1fr] items-center gap-2">
          <span className="text-[0.875rem] font-semibold text-ink">{DAYS[x.d]}</span>
          <div className="space-y-1.5">
            <select value={x.mode} onChange={(e) => set(x.d, { mode: e.target.value })} className={field}>
              <option value="any">Any time</option><option value="only">Only between…</option><option value="except">Not between…</option><option value="no">Can&apos;t work</option>
            </select>
            {(x.mode === "only" || x.mode === "except") && (
              <div className="grid grid-cols-2 gap-2">
                <input type="time" value={x.start} onChange={(e) => set(x.d, { start: e.target.value })} className={field} aria-label="From" />
                <input type="time" value={x.finish} onChange={(e) => set(x.d, { finish: e.target.value })} className={field} aria-label="Until" />
              </div>
            )}
          </div>
        </div>
      ))}
      <button className={btn("primary", "w-full")} disabled={pending} onClick={() => run(() => saveAvailability(slug, out()))}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save availability</button>
      {toast}
    </div>
  );
}

const TYPES: [string, string][] = [["annual", "Annual leave"], ["personal", "Personal / sick leave"], ["unpaid", "Unpaid leave"], ["long_service", "Long service leave"], ["other", "Other"]];
export function LeaveForm({ slug, today }: { slug: string; today: string }) {
  const { run, pending, toast } = useRun();
  const [r, setR] = useState({ from: "", to: "", type: "annual", hours: "", note: "" });
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
      <select value={r.type} onChange={(e) => setR({ ...r, type: e.target.value })} className={field}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[0.75rem] font-medium text-ink-muted">From<input type="date" min={r.type === "personal" ? undefined : today} value={r.from} onChange={(e) => setR({ ...r, from: e.target.value, to: !r.to || r.to < e.target.value ? e.target.value : r.to })} className={cn(field, "mt-1")} /></label>
        <label className="text-[0.75rem] font-medium text-ink-muted">To<input type="date" min={r.from || undefined} value={r.to} onChange={(e) => setR({ ...r, to: e.target.value })} className={cn(field, "mt-1")} /></label>
      </div>
      <input inputMode="decimal" value={r.hours} onChange={(e) => setR({ ...r, hours: e.target.value })} placeholder="Hours (optional) e.g. 7.6" className={field} />
      <input value={r.note} onChange={(e) => setR({ ...r, note: e.target.value })} maxLength={300} placeholder="Note (optional)" className={field} />
      <button className={btn("primary", "w-full")} disabled={pending || !r.from} onClick={() => run(() => requestLeave(slug, { ...r, hours: r.hours ? Number(r.hours) : null }), () => setR({ from: "", to: "", type: "annual", hours: "", note: "" }))}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}Ask for leave
      </button>
      {toast}
    </div>
  );
}
export function CancelLeaveButton({ slug, id }: { slug: string; id: string }) {
  const { run, pending, toast } = useRun();
  return (<><button className={btn("ghost", "h-9 px-2 text-[0.8125rem]")} disabled={pending} onClick={() => run(() => cancelLeave(slug, id))}>Withdraw</button>{toast}</>);
}

/** On a roster shift: ask for cover (or take it back). */
export function CoverControls({ slug, shiftId, offer }: { slug: string; shiftId: string; offer: { id: string; status: string; to: string | null } | null }) {
  const { run, pending, toast } = useRun();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (offer) return (
    <div className="space-y-2">
      <p className="text-[0.8125rem] text-ink-muted">{offer.status === "claimed" ? `${offer.to ?? "Someone"} will cover it once the office approves.` : "Up for grabs — it's still yours until someone picks it up and the office approves."}</p>
      <button className={btn("secondary", "w-full")} disabled={pending} onClick={() => run(() => cancelOffer(slug, offer.id))}>I can work it after all</button>
      {toast}
    </div>
  );
  return (
    <div>
      {!open ? <button className={btn("secondary", "w-full")} onClick={() => setOpen(true)}><Megaphone className="h-4 w-4" />Can&apos;t make it? Ask for cover</button> : (
        <div className="space-y-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-line">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the team (optional)" maxLength={300} className={field} />
          <div className="grid grid-cols-2 gap-2">
            <button className={btn("ghost")} onClick={() => setOpen(false)}>Cancel</button>
            <button className={btn("primary")} disabled={pending} onClick={() => run(() => offerShift(slug, shiftId, note), () => setOpen(false))}>Post it</button>
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}
export function ClaimOfferButton({ slug, offerId }: { slug: string; offerId: string }) {
  const { run, pending, toast } = useRun();
  return (<><button className={btn("primary", "w-full")} disabled={pending} onClick={() => run(() => claimOffer(slug, offerId))}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}I&apos;ll take it</button>{toast}</>);
}
export function TakeOpenRosterButton({ slug, shiftId }: { slug: string; shiftId: string }) {
  const { run, pending, toast } = useRun();
  return (<><button className={btn("primary", "w-full")} disabled={pending} onClick={() => run(() => takeOpenRosterShift(slug, shiftId))}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Take this shift</button>{toast}</>);
}
