"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock, Delete, ListChecks, Loader2, Lock, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { kioskClock, kioskRefresh, kioskRoster, kioskTick } from "./actions";
import { ManagerAccess } from "./manager";
import { Sheet } from "./sheet";
import { ChecklistTicker } from "@/components/roster/checklist-ticker";
import type { TodayChecklist } from "@/lib/roster/checklists";
import type { KioskPerson } from "@/lib/roster/kiosk-data";

type What = "on" | "break" | "back" | "off";
const AVATAR = ["#bbf7d0", "#fbcfe8", "#fde68a", "#bae6fd", "#ddd6fe", "#fecaca", "#c7d2fe", "#a7f3d0"];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const colourFor = (id: string) => AVATAR[[...id].reduce((t, c) => t + c.charCodeAt(0), 0) % AVATAR.length];
const dur = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

/**
 * The café iPad. Big name cards show who's working, on a break (red once they're late back), starting soon or late.
 * Tap your name, enter your PIN and tap what you're doing — one step, so it's quick. The screen goes back to the names
 * by itself. Shift notes pop up after clocking on. Manager access (PIN + texted code) opens a pay-free roster editor.
 */
export function Kiosk({ slug, token, business, logo, place, tz, people: initial, photo = true, breakMin = 30, breakMax = 60, checklists = [] }: {
  slug: string; token: string; business: string; logo: string | null; place: string | null; tz: string; people: KioskPerson[]; photo?: boolean; breakMin?: number; breakMax?: number; checklists?: TodayChecklist[];
}) {
  const [people, setPeople] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<"today" | "all">("today");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<What | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [note, setNote] = useState<{ name: string; text: string } | null>(null);
  const [modal, setModal] = useState<"roster" | "checklists" | "manager" | null>(null);
  const [online, setOnline] = useState(true);
  const [wide, setWide] = useState(true);
  useEffect(() => { const mq = window.matchMedia("(min-width: 1024px)"); const f = () => setWide(mq.matches); f(); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  const lastTouch = useRef(Date.now());
  const sel = people.find((p) => p.id === selId) ?? null;

  // clock + background refresh (a small server call, not a page reload)
  const refresh = useCallback(async () => {
    const r = await kioskRefresh(slug, token).catch(() => null);
    if (r?.ok) { setPeople(r.people); setOnline(true); } else if (!r) setOnline(false);
  }, [slug, token]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    const r = setInterval(() => void refresh(), 30_000);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { clearInterval(t); clearInterval(r); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [refresh]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  const reset = useCallback(() => { setSelId(null); setPin(""); setBusy(null); }, []);
  // back to the names after 30 seconds without a tap
  useEffect(() => {
    if (!selId) return;
    const t = setInterval(() => { if (Date.now() - lastTouch.current > 30_000) reset(); }, 2000);
    return () => clearInterval(t);
  }, [selId, reset]);
  const touch = () => { lastTouch.current = Date.now(); };

  // camera: warmed up as soon as someone taps their name, so the photo is instant
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  useEffect(() => {
    if (!photo || !selId || !navigator.mediaDevices?.getUserMedia) return;
    let live = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } }, audio: false })
      .then((st) => { if (!live) { st.getTracks().forEach((t) => t.stop()); return; } stream.current = st; if (video.current) { video.current.srcObject = st; void video.current.play().catch(() => undefined); } setCamOn(true); })
      .catch(() => setCamOn(false));
    return () => { live = false; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setCamOn(false); };
  }, [photo, selId]);
  const snap = (): string | null => {
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    const side = Math.min(v.videoWidth, v.videoHeight), c = document.createElement("canvas");
    c.width = 320; c.height = 320;
    c.getContext("2d")!.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, 320, 320);
    return c.toDataURL("image/jpeg", 0.7);
  };

  const act = async (what: What) => {
    if (!sel || pin.length !== 4 || busy) return;
    touch();
    setBusy(what);
    const pic = what === "on" || what === "off" ? snap() : null;
    const r = await kioskClock(slug, token, sel.id, pin, what, pic).catch(() => ({ ok: false as const, error: "No connection — try again." }));
    setBusy(null);
    if (!r.ok) { setToast({ ok: false, text: r.error }); setPin(""); return; }
    // show the change straight away; the list refreshes in the background
    const at = new Date().toISOString();
    setPeople((list) => list.map((p) => p.id !== sel.id ? p : what === "on" ? { ...p, state: "on", since: at, breakSince: null } : what === "break" ? { ...p, state: "break", breakSince: at } : what === "back" ? { ...p, state: "on", breakSince: null } : { ...p, state: "done", doneAt: at, breakSince: null, since: null }));
    setToast({ ok: true, text: r.message });
    if (r.note) setNote({ name: sel.name.split(" ")[0], text: r.note });
    reset();
    void refresh();
  };

  // what each card says
  const status = (p: KioskPerson) => {
    const m = (iso: string) => Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
    const t = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" });
    if (p.state === "on") return { tone: "green", pill: "Working", sub: p.since ? `Started ${t(p.since)}` : "" };
    if (p.state === "break") { const b = p.breakSince ? m(p.breakSince) : 0; return b >= breakMin ? { tone: "red", pill: `Late back · ${b} min`, sub: `Break started ${t(p.breakSince!)}${b >= breakMax ? ` — over ${breakMax} min` : ""}` } : { tone: "amber", pill: `On break · ${b} min`, sub: `Break started ${t(p.breakSince!)}` }; }
    if (p.state === "done") return { tone: "grey", pill: "Finished", sub: p.doneAt ? `Clocked off ${t(p.doneAt)}` : "" };
    if (!p.shift) return { tone: "grey", pill: "Not rostered", sub: "" };
    const start = Date.parse(p.shift.startIso), finish = Date.parse(p.shift.finishIso);
    if (now >= finish) return { tone: "red", pill: "Didn't clock on", sub: `Shift was ${fmt(p.shift.start)} – ${fmt(p.shift.finish)}` };
    if (now >= start) return { tone: "red", pill: "Late", sub: `Late by ${dur(Math.round((now - start) / 60_000))}` };
    const until = Math.round((start - now) / 60_000);
    return until <= 60 ? { tone: "slate", pill: "Starting soon", sub: `Starts in ${dur(until)}` } : { tone: "grey", pill: "Later today", sub: `Starts ${fmt(p.shift.start)}` };
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = people.filter((p) => (view === "all" || p.shift || p.state !== "off") && (!q || p.name.toLowerCase().includes(q)));
    const rank = (p: KioskPerson) => (p.state === "on" || p.state === "break" ? 0 : p.shift && p.state === "off" ? 1 : p.state === "done" ? 2 : 3);
    return list.sort((a, b) => rank(a) - rank(b) || (a.shift?.start ?? "99").localeCompare(b.shift?.start ?? "99") || a.name.localeCompare(b.name));
  }, [people, view, query]);
  const counts = useMemo(() => {
    let working = 0, onBreak = 0, soon = 0, late = 0;
    for (const p of people) {
      if (p.state === "on") working++; else if (p.state === "break") onBreak++;
      else if (p.state === "off" && p.shift) { const s = Date.parse(p.shift.startIso), f = Date.parse(p.shift.finishIso); if (now >= s && now < f) late++; else if (s > now && s - now <= 3_600_000) soon++; }
    }
    return { working, onBreak, soon, late };
  }, [people, now]);
  const ticks = checklists.reduce((t, c) => t + c.items.filter((i) => i.done).length, 0), items = checklists.reduce((t, c) => t + c.items.length, 0);

  const pill = (tone: string) => cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.875rem] font-semibold ring-1",
    tone === "green" && "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30", tone === "amber" && "bg-amber-500/15 text-amber-600 ring-amber-500/30",
    tone === "red" && "bg-rose-500/15 text-rose-600 ring-rose-500/40", tone === "slate" && "bg-sky-500/10 text-sky-600 ring-sky-500/30", tone === "grey" && "bg-canvas text-ink-muted ring-line");
  const dot = (tone: string) => cn("h-2.5 w-2.5 rounded-full", tone === "green" && "bg-emerald-500", tone === "amber" && "bg-amber-500", tone === "red" && "bg-rose-500", tone === "slate" && "bg-sky-500", tone === "grey" && "bg-ink-faint");

  const panel = sel ? (() => {
    const s = status(sel);
    const verbs: { what: What; label: string; tone: string }[] = sel.state === "off" || sel.state === "done" ? [{ what: "on", label: "Clock on", tone: "brand" }]
      : sel.state === "on" ? [{ what: "break", label: "Start break", tone: "amber" }, { what: "off", label: "Clock off", tone: "ink" }]
      : [{ what: "back", label: "End break", tone: "amber" }, { what: "off", label: "Clock off", tone: "ink" }];
    return (
      <div className="flex h-full flex-col" onPointerDown={touch}>
        <div className="flex items-start justify-between">
          <span />
          <button onClick={reset} className="rounded-full p-2 text-ink-muted hover:bg-canvas" aria-label="Back to names"><X className="h-6 w-6" /></button>
        </div>
        <div className="mx-auto -mt-4 h-28 w-28 overflow-hidden rounded-full" style={{ background: colourFor(sel.id) }}>
          {photo && <video ref={video} playsInline muted className={cn("h-full w-full object-cover [transform:scaleX(-1)]", !camOn && "hidden")} aria-label="Camera — your photo is taken as you clock on or off" />}
          {!camOn && <span className="flex h-full w-full items-center justify-center text-[2.25rem] font-bold text-zinc-900">{initials(sel.name)}</span>}
        </div>
        <p className="mt-3 text-center text-[2rem] font-bold leading-tight text-ink">Hi {sel.name.split(" ")[0]}</p>
        <p className="text-center text-[1.0625rem] text-ink-muted">Enter your PIN to {verbs.map((v) => v.label.toLowerCase()).join(" or ")}</p>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3 ring-1 ring-line">
          <CalendarDays className="h-6 w-6 shrink-0 text-ink-muted" />
          <span className="text-[1rem] text-ink">{sel.shift ? <>Today{sel.area ? ` • ${sel.area}` : ""}<span className="block text-ink-muted">{fmt(sel.shift.start)} – {fmt(sel.shift.finish)}</span></> : "Not rostered today"}</span>
          <span className={cn(pill(s.tone), "ml-auto text-[0.8125rem]")}>{s.pill}</span>
        </div>
        <div className="my-5 flex justify-center gap-5">{[0, 1, 2, 3].map((i) => <span key={i} className={cn("h-5 w-5 rounded-full ring-2", i < pin.length ? "bg-ink ring-ink" : "ring-ink-faint")} />)}</div>
        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} onClick={() => { touch(); setPin((x) => (x + d).slice(0, 4)); }} className="h-16 rounded-2xl bg-canvas text-[1.625rem] font-semibold text-ink ring-1 ring-line active:scale-[0.97]">{d}</button>)}
          <span />
          <button onClick={() => { touch(); setPin((x) => (x + "0").slice(0, 4)); }} className="h-16 rounded-2xl bg-canvas text-[1.625rem] font-semibold text-ink ring-1 ring-line active:scale-[0.97]">0</button>
          <button onClick={() => { touch(); setPin((x) => x.slice(0, -1)); }} className="flex h-16 items-center justify-center rounded-2xl bg-canvas text-ink-muted ring-1 ring-line" aria-label="Delete"><Delete className="h-7 w-7" /></button>
        </div>
        <div className={cn("mt-4 grid gap-2.5", verbs.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {verbs.map((v) => (
            <button key={v.what} disabled={pin.length !== 4 || !!busy} onClick={() => void act(v.what)}
              className={cn("flex h-16 items-center justify-center gap-2 rounded-2xl text-[1.1875rem] font-semibold transition disabled:opacity-40",
                v.tone === "brand" && "bg-[var(--crew-brand)] text-white", v.tone === "amber" && "bg-amber-500 text-white", v.tone === "ink" && "bg-ink text-surface")}>
              {busy === v.what && <Loader2 className="h-5 w-5 animate-spin" />}{v.label}
            </button>
          ))}
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[0.8125rem] text-ink-faint"><Lock className="h-4 w-4" />Your PIN keeps your timesheet secure. Forgotten it? Change it in the staff app.</p>
      </div>
    );
  })() : (
    <div className="flex h-full flex-col items-center justify-center text-center text-ink-muted">
      <Clock className="h-12 w-12 text-ink-faint" />
      <p className="mt-3 text-[1.25rem] font-semibold text-ink">Tap your name</p>
      <p className="mt-1 text-[1rem]">to clock on, take a break or clock off.</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-canvas text-ink" onPointerDown={touch}>
      {/* header */}
      <header className="flex items-center gap-4 border-b border-line bg-surface px-5 py-3 sm:px-8">
        {logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logo} alt={business} className="h-12 w-12 rounded-full object-contain" />
          : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--crew-brand)] text-[1.125rem] font-bold text-white">{initials(business)}</span>}
        <div className="min-w-0"><p className="truncate text-[1.375rem] font-bold leading-tight">{business}</p>{place && <p className="truncate text-[1rem] text-ink-muted">{place}</p>}</div>
        <div className="ml-auto text-right">
          <p className="text-[0.9375rem] text-ink-muted">{new Date(now).toLocaleDateString("en-AU", { timeZone: tz, weekday: "long", day: "numeric", month: "long" })}</p>
          <p className="text-[2rem] font-bold tabular-nums leading-none">{new Date(now).toLocaleTimeString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" }).toUpperCase()}</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* names */}
        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <h1 className="text-[2.25rem] font-bold leading-tight sm:text-[2.75rem]">Ready for your day?</h1>
          <p className="text-[1.25rem] text-ink-muted">Tap your name to get started.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex rounded-full bg-surface p-1 ring-1 ring-line">
              {(["today", "all"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={cn("rounded-full px-5 py-2 text-[1rem] font-semibold", view === v ? "bg-[var(--crew-brand)] text-white" : "text-ink-muted")}>{v === "today" ? "Today" : "All staff"}</button>)}
            </div>
            {searching
              ? <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onBlur={() => !query && setSearching(false)} placeholder="Find your name" className="h-11 w-48 rounded-full border border-line-strong bg-surface px-4 text-[1rem] text-ink" />
              : <button onClick={() => setSearching(true)} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface ring-1 ring-line" aria-label="Search"><Search className="h-5 w-5" /></button>}
            <span className="ml-auto flex flex-wrap gap-2">
              <span className={pill("green")}><span className={dot("green")} />{counts.working} working</span>
              <span className={pill("amber")}><span className={dot("amber")} />{counts.onBreak} on break</span>
              {counts.late > 0 && <span className={pill("red")}><span className={dot("red")} />{counts.late} late</span>}
              <span className={pill("grey")}><span className={dot("grey")} />{counts.soon} starting soon</span>
              {items > 0 && <button onClick={() => setModal("checklists")} className={pill(ticks === items ? "green" : "grey")}><ListChecks className="h-4 w-4" />Checklists {ticks}/{items}</button>}
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((p) => {
              const s = status(p);
              return (
                <button key={p.id} onClick={() => { setSelId(p.id); setPin(""); touch(); }}
                  className={cn("rounded-3xl bg-surface p-5 text-left ring-1 transition active:scale-[0.98]", selId === p.id ? "ring-2 ring-[var(--crew-brand)]" : s.tone === "red" ? "ring-rose-500/40" : "ring-line")}>
                  <div className="flex items-start gap-4">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[1.375rem] font-bold text-zinc-900" style={{ background: colourFor(p.id) }}>{initials(p.name)}</span>
                    <span className="min-w-0">
                      <span className="block text-[1.25rem] font-bold leading-tight text-ink">{p.name}</span>
                      {p.area && <span className="block text-[1rem] text-ink-muted">{p.area}</span>}
                      {p.shift && <span className="mt-1.5 flex items-center gap-1.5 text-[0.9375rem] text-ink-muted"><CalendarDays className="h-4 w-4" />{fmt(p.shift.start)} – {fmt(p.shift.finish)}</span>}
                    </span>
                  </div>
                  <span className={cn(pill(s.tone), "mt-4")}><span className={dot(s.tone)} />{s.pill}</span>
                  {s.sub && <span className={cn("mt-2 block text-[1rem]", s.tone === "red" ? "font-semibold text-rose-600" : "text-ink-muted")}>{s.sub}</span>}
                </button>
              );
            })}
            {shown.length === 0 && <p className="text-[1.0625rem] text-ink-muted">{query ? "No one by that name." : "Nobody's rostered today — tap All staff."}</p>}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[1rem]">
            <button onClick={() => setModal("roster")} className="font-semibold text-[var(--crew-brand)]">View full roster →</button>
            {view === "today" && <span className="text-ink-muted">Not rostered today? <button onClick={() => setView("all")} className="font-semibold text-[var(--crew-brand)] underline">Find your name</button></span>}
          </div>
        </main>

        {/* PIN panel: beside the names on a wide screen, over them on a narrow one */}
        {wide && <aside className="w-[420px] shrink-0 overflow-y-auto border-l border-line bg-surface p-6">{panel}</aside>}
        {!wide && sel && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={reset}><div className="max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>{panel}</div></div>}
      </div>

      {/* footer */}
      <footer className="flex items-center gap-4 border-t border-line bg-surface px-5 py-2.5 text-[0.875rem] sm:px-8">
        <span className="font-semibold text-ink">EventureOS</span><span className="text-ink-faint">Powered by EventureOS</span>
        <span className="ml-auto flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-full", online ? "bg-emerald-500" : "bg-rose-500")} /><span className={online ? "text-emerald-600" : "text-rose-600"}>{online ? "Online" : "Offline"}</span></span>
        <button onClick={() => setModal("manager")} className="flex items-center gap-1.5 text-ink-muted"><Lock className="h-4 w-4" />Manager access</button>
      </footer>

      {toast && <p className={cn("fixed left-1/2 top-24 z-[60] w-[min(92vw,640px)] -translate-x-1/2 rounded-2xl px-5 py-4 text-center text-[1.125rem] font-semibold shadow-xl", toast.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white")}>{toast.text}</p>}

      {note && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setNote(null)}>
          <div className="w-full max-w-lg rounded-3xl bg-surface p-6 ring-1 ring-line" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3"><p className="text-[1.375rem] font-bold text-ink">A note for your shift, {note.name}</p><button onClick={() => setNote(null)} className="rounded-full p-2 text-ink-muted hover:bg-canvas" aria-label="Close"><X className="h-6 w-6" /></button></div>
            <p className="mt-3 whitespace-pre-line text-[1.1875rem] text-ink">{note.text}</p>
            <button onClick={() => setNote(null)} className="mt-5 h-14 w-full rounded-2xl bg-ink text-[1.125rem] font-semibold text-surface">Got it</button>
          </div>
        </div>
      )}

      {modal === "roster" && <RosterModal slug={slug} token={token} onClose={() => setModal(null)} />}
      {modal === "checklists" && (
        <Sheet title="Today's checklists" onClose={() => setModal(null)}>
          <ChecklistTicker big lists={checklists} onTick={(c, i, d) => kioskTick(slug, token, c, i, d)} />
        </Sheet>
      )}
      {modal === "manager" && <ManagerAccess slug={slug} token={token} onClose={() => { setModal(null); void refresh(); }} />}
    </div>
  );
}

const fmt = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };

function RosterModal({ slug, token, onClose }: { slug: string; token: string; onClose: () => void }) {
  const [shifts, setShifts] = useState<{ id: string; date: string; start: string; finish: string; name: string; area: string | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void kioskRoster(slug, token).then((r) => (r.ok ? setShifts(r.shifts) : setError(r.error))).catch(() => setError("No connection.")); }, [slug, token]);
  const days = shifts ? [...new Set(shifts.map((s) => s.date))] : [];
  return (
    <Sheet title="This week's roster" onClose={onClose}>
      {error && <p className="text-rose-600">{error}</p>}
      {!shifts && !error && <p className="flex items-center gap-2 text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" />Loading…</p>}
      {shifts && !shifts.length && <p className="text-ink-muted">No shifts published for the week ahead.</p>}
      <div className="space-y-5">
        {days.map((d) => (
          <div key={d}>
            <p className="mb-2 text-[1.0625rem] font-semibold text-ink">{new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {shifts!.filter((s) => s.date === d).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-4 py-3 ring-1 ring-line text-[1rem]">
                  <span className="min-w-0"><span className="block truncate font-semibold text-ink">{s.name}</span>{s.area && <span className="block text-[0.875rem] text-ink-muted">{s.area}</span>}</span>
                  <span className="shrink-0 tabular-nums text-ink">{fmt(s.start)} – {fmt(s.finish)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
