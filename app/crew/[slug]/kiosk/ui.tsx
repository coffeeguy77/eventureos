"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Delete, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { kioskClock, kioskTick } from "./actions";
import { ChecklistTicker } from "@/components/roster/checklist-ticker";
import type { TodayChecklist } from "@/lib/roster/checklists";

type P = { id: string; name: string; state: "off" | "on" | "break"; shift: string | null; breakSince?: string | null };

export function Kiosk({ slug, token, business, people, photo = true, breakMin = 30, breakMax = 60, checklists = [] }: { slug: string; token: string; business: string; people: P[]; photo?: boolean; breakMin?: number; breakMax?: number; checklists?: TodayChecklist[] }) {
  const router = useRouter();
  const [who, setWho] = useState<P | null>(null);
  const [pin, setPin] = useState("");
  const [state, setState] = useState<"off" | "on" | "break" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => { setNow(new Date()); router.refresh(); }, 60000); return () => clearInterval(t); }, [router]);
  // the break timer on each name: minutes since they started their break
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 15000); return () => clearInterval(t); }, []);
  const breakMins = (p: P) => (p.breakSince ? Math.max(0, Math.floor((Date.now() - Date.parse(p.breakSince)) / 60000)) : 0);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopCam = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  const reset = () => { setWho(null); setPin(""); setState(null); stopCam(); };
  // once the PIN is right, the front camera turns on so a photo can be taken as they clock on / off
  useEffect(() => {
    if (!photo || !state || !navigator.mediaDevices?.getUserMedia) return;
    let live = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } }, audio: false })
      .then((st) => { if (!live) { st.getTracks().forEach((t) => t.stop()); return; } stream.current = st; if (video.current) { video.current.srcObject = st; void video.current.play().catch(() => undefined); } })
      .catch(() => undefined); // no camera / not allowed: clocking still works
    return () => { live = false; stopCam(); };
  }, [photo, state]);
  const snap = (): string | null => {
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    const side = Math.min(v.videoWidth, v.videoHeight), c = document.createElement("canvas");
    c.width = 320; c.height = 320;
    c.getContext("2d")!.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, 320, 320);
    return c.toDataURL("image/jpeg", 0.7);
  };
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 5000); return () => clearTimeout(t); }, [msg]);
  useEffect(() => { if (!who) return; const t = setTimeout(reset, 45000); return () => clearTimeout(t); }, [who, pin, state]);

  const press = (d: string) => {
    if (!who || pending) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) start(async () => {
      const r = await kioskClock(slug, token, who.id, next, "check");
      if (r.ok) setState(r.state ?? "off"); else { setMsg({ ok: false, text: r.error }); setPin(""); }
    });
  };
  const doIt = (what: "on" | "break" | "back" | "off") => who && start(async () => {
    const pic = what === "on" || what === "off" ? snap() : null;
    const r = await kioskClock(slug, token, who.id, pin, what, pic);
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    reset();
    router.refresh();
  });

  return (
    <div className="mx-auto max-w-3xl py-4">
      <div className="mb-6 text-center">
        <p className="text-[0.875rem] font-medium text-ink-muted">{business}</p>
        <p className="text-[2.5rem] font-bold tabular-nums text-ink">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
        <p className="text-[0.9375rem] text-ink-muted">Tap your name to clock on, take a break or clock off.</p>
      </div>
      {msg && <p className={cn("mb-4 rounded-xl px-4 py-3 text-center text-[1rem] font-semibold", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{msg.text}</p>}
      {checklists.length > 0 && <div className="mb-5"><ChecklistTicker big lists={checklists} onTick={(c, i, d) => kioskTick(slug, token, c, i, d)} /></div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {people.map((p) => (
          <button key={p.id} onClick={() => { setWho(p); setPin(""); setState(null); }} className="rounded-2xl bg-surface p-4 text-left shadow-card ring-1 ring-line active:scale-[0.98]">
            <p className="text-[1.0625rem] font-semibold text-ink">{p.name}</p>
            <p className="text-[0.8125rem] text-ink-muted">{p.shift ? `Today ${p.shift}` : "Not rostered today"}</p>
            <p className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-[0.75rem] font-semibold", p.state === "on" ? "bg-emerald-100 text-emerald-800" : p.state === "break" ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-ink-muted")}>
              {p.state === "on" ? "On now" : p.state === "break" ? `On break · ${breakMins(p)} min` : "Off"}
            </p>
            {p.state === "break" && <p className={cn("mt-1 text-[0.75rem] font-semibold", breakMins(p) >= breakMax ? "text-rose-700" : breakMins(p) >= breakMin ? "text-amber-700" : "text-ink-muted")}>
              {breakMins(p) < breakMin ? `${breakMin - breakMins(p)} min of your ${breakMin} min break left` : breakMins(p) < breakMax ? "Break time's up — tap to end your break" : `Over the ${breakMax} min break limit`}
            </p>}
          </button>
        ))}
      </div>

      {who && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={reset}>
          <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-[1.25rem] font-bold text-ink">{who.name}</p>
            {!state ? (
              <>
                <p className="mt-1 text-center text-[0.9375rem] text-ink-muted">Enter your PIN</p>
                <div className="my-4 flex justify-center gap-3">{[0, 1, 2, 3].map((i) => <span key={i} className={cn("h-4 w-4 rounded-full", i < pin.length ? "bg-ink" : "bg-zinc-200")} />)}</div>
                <div className="grid grid-cols-3 gap-3">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} onClick={() => press(d)} className="h-16 rounded-2xl bg-zinc-100 text-[1.5rem] font-semibold text-ink active:bg-zinc-200">{d}</button>)}
                  <button onClick={reset} className="h-16 rounded-2xl text-[0.9375rem] font-medium text-ink-muted">Cancel</button>
                  <button onClick={() => press("0")} className="h-16 rounded-2xl bg-zinc-100 text-[1.5rem] font-semibold text-ink active:bg-zinc-200">0</button>
                  <button onClick={() => setPin(pin.slice(0, -1))} className="flex h-16 items-center justify-center rounded-2xl text-ink-muted" aria-label="Delete"><Delete className="h-6 w-6" /></button>
                </div>
                {pending && <p className="mt-3 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-ink-muted" /></p>}
              </>
            ) : (
              <div className="mt-4 grid gap-3">
                {photo && <video ref={video} playsInline muted className="mx-auto aspect-square w-40 rounded-2xl bg-zinc-100 object-cover [transform:scaleX(-1)]" aria-label="Camera — your photo is taken as you clock on or off" />}
                {state === "off" && <button disabled={pending} onClick={() => doIt("on")} className="h-16 rounded-2xl bg-emerald-600 text-[1.125rem] font-semibold text-white">Clock on</button>}
                {state === "on" && <button disabled={pending} onClick={() => doIt("break")} className="h-16 rounded-2xl bg-amber-500 text-[1.125rem] font-semibold text-white">Start break</button>}
                {state === "break" && who.breakSince && <p className="text-center text-[0.9375rem] text-ink-muted">On break for <b className="text-ink">{breakMins(who)} min</b> — breaks under {breakMin} min still count as {breakMin}; longer ones count as taken.</p>}
                {state === "on" && <p className="text-center text-[0.8125rem] text-ink-muted">Your break is at least {breakMin} min (up to {breakMax}).</p>}
                {state === "break" && <button disabled={pending} onClick={() => doIt("back")} className="h-16 rounded-2xl bg-amber-500 text-[1.125rem] font-semibold text-white">End break</button>}
                {state !== "off" && <button disabled={pending} onClick={() => doIt("off")} className="h-16 rounded-2xl bg-ink text-[1.125rem] font-semibold text-surface">Clock off</button>}
                <button onClick={reset} className="h-12 rounded-2xl text-[0.9375rem] font-medium text-ink-muted">Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
