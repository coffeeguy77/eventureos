"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Delete, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { kioskClock } from "./actions";

type P = { id: string; name: string; state: "off" | "on" | "break"; shift: string | null };

export function Kiosk({ slug, token, business, people }: { slug: string; token: string; business: string; people: P[] }) {
  const router = useRouter();
  const [who, setWho] = useState<P | null>(null);
  const [pin, setPin] = useState("");
  const [state, setState] = useState<"off" | "on" | "break" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => { setNow(new Date()); router.refresh(); }, 60000); return () => clearInterval(t); }, [router]);
  const reset = () => { setWho(null); setPin(""); setState(null); };
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
    const r = await kioskClock(slug, token, who.id, pin, what);
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {people.map((p) => (
          <button key={p.id} onClick={() => { setWho(p); setPin(""); setState(null); }} className="rounded-2xl bg-surface p-4 text-left shadow-card ring-1 ring-line active:scale-[0.98]">
            <p className="text-[1.0625rem] font-semibold text-ink">{p.name}</p>
            <p className="text-[0.8125rem] text-ink-muted">{p.shift ? `Today ${p.shift}` : "Not rostered today"}</p>
            <p className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-[0.75rem] font-semibold", p.state === "on" ? "bg-emerald-100 text-emerald-800" : p.state === "break" ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-ink-muted")}>
              {p.state === "on" ? "On now" : p.state === "break" ? "On a break" : "Off"}
            </p>
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
                {state === "off" && <button disabled={pending} onClick={() => doIt("on")} className="h-16 rounded-2xl bg-emerald-600 text-[1.125rem] font-semibold text-white">Clock on</button>}
                {state === "on" && <button disabled={pending} onClick={() => doIt("break")} className="h-16 rounded-2xl bg-amber-500 text-[1.125rem] font-semibold text-white">Start break</button>}
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
