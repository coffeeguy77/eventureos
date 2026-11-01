"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, Loader2, MapPin, Phone, Video, X } from "lucide-react";
import type { ApptKind, DaySlots } from "@/lib/appointments/core";
import { clientRespond, freeTimes } from "@/app/meet/[slug]/actions";
import { SlotPicker } from "./slot-picker";

const ICON: Record<ApptKind, typeof Video> = { video: Video, phone: Phone, in_person: MapPin };
const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Waiting for confirmation", tone: "bg-amber-500/15 text-amber-600" },
  proposed: { label: "Please confirm", tone: "bg-amber-500/15 text-amber-600" },
  confirmed: { label: "Confirmed", tone: "bg-emerald-500/15 text-emerald-600" },
  reschedule_requested: { label: "New time requested", tone: "bg-sky-500/15 text-sky-600" },
  cancelled: { label: "Cancelled", tone: "bg-rose-500/15 text-rose-600" },
  declined: { label: "Not going ahead", tone: "bg-rose-500/15 text-rose-600" },
  completed: { label: "Done", tone: "bg-ink/10 text-ink-muted" },
};

/** The client's private page for one meeting: confirm, suggest another time, or cancel. */
export function ManageMeeting({ slug, token, business, accent, title, when, kind, how, status, proposed, portal, durationMin, needsConfirm }: {
  slug: string; token: string; business: string; accent: string; title: string; when: string; kind: ApptKind; how: string; status: string; proposed: string | null; portal: string; durationMin: number; needsConfirm: boolean;
}) {
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [days, setDays] = useState<DaySlots[] | null>(null);
  const [slot, setSlot] = useState<{ date: string; time: string } | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const closed = ["cancelled", "declined", "completed"].includes(status);
  const I = ICON[kind];
  const run = (what: "confirm" | "suggest" | "cancel") => start(async () => {
    setError(null);
    const r = await clientRespond(slug, token, what, what === "suggest" && slot ? { ...slot, note } : { date: "", time: "", note });
    if (r.ok) { setMsg(r.message); setMode("view"); } else setError(r.error);
  });
  const openMove = () => { setMode("move"); if (!days) start(async () => { const r = await freeTimes(slug, durationMin, token); if (r.ok) setDays(r.days); else setError(r.error); }); };
  const st = STATUS[needsConfirm ? "proposed" : status] ?? STATUS.pending;
  return (
    <div className="min-h-[100dvh] bg-canvas">
      <div className="h-40 w-full" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }} />
      <div className="mx-auto -mt-24 max-w-xl px-4 pb-16">
        <div className="rounded-3xl bg-surface p-6 shadow-2xl ring-1 ring-line sm:p-8">
          <p className="text-[0.875rem] font-medium text-ink-muted">{business}</p>
          <h1 className="mt-1 text-[1.625rem] font-bold leading-tight text-ink">{title}</h1>
          {!msg && <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-[0.8125rem] font-semibold ${st.tone}`}>{st.label}</span>}
          <div className="mt-5 space-y-3 rounded-2xl bg-canvas p-4 ring-1 ring-line">
            <p className="flex items-start gap-3 text-[1rem] font-semibold text-ink"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />{when}</p>
            <p className="flex items-start gap-3 text-[0.9375rem] text-ink-muted"><I className="mt-0.5 h-5 w-5 shrink-0" />{how}</p>
            {proposed && status === "reschedule_requested" && <p className="text-[0.875rem] text-sky-600">You asked for: {proposed} — we&apos;ll confirm shortly.</p>}
          </div>

          {msg && <p className="mt-5 flex items-start gap-2 rounded-2xl bg-emerald-500/10 px-4 py-3 text-[0.9375rem] font-medium text-emerald-600"><Check className="mt-0.5 h-5 w-5 shrink-0" />{msg}</p>}
          {error && <p className="mt-5 rounded-2xl bg-rose-500/10 px-4 py-3 text-[0.9375rem] font-medium text-rose-600">{error}</p>}

          {!closed && !msg && mode === "view" && (
            <div className="mt-6 grid gap-3">
              {needsConfirm && <button disabled={pending} onClick={() => run("confirm")} className="flex h-14 items-center justify-center gap-2 rounded-2xl text-[1.0625rem] font-semibold text-white shadow-lg" style={{ background: accent }}>{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}Yes, that works</button>}
              <button onClick={openMove} className="h-12 rounded-2xl text-[0.9375rem] font-semibold text-ink ring-1 ring-line">Suggest another time</button>
              <button onClick={() => setMode("cancel")} className="h-12 rounded-2xl text-[0.9375rem] font-semibold text-rose-600 ring-1 ring-line">Cancel the meeting</button>
            </div>
          )}

          {mode === "move" && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between"><p className="text-[1.0625rem] font-semibold text-ink">Pick a new time</p><button onClick={() => setMode("view")} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-line"><X className="h-4 w-4" /></button></div>
              {!days ? <p className="flex items-center gap-2 text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" />Finding free times…</p> : <SlotPicker days={days} value={slot} onChange={setSlot} accent={accent} />}
              <textarea className="min-h-[80px] w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-ink" placeholder="Anything we should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button disabled={!slot || pending} onClick={() => run("suggest")} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[1.0625rem] font-semibold text-white disabled:opacity-40" style={{ background: accent }}>{pending && <Loader2 className="h-5 w-5 animate-spin" />}Send this time to {business}</button>
            </div>
          )}

          {mode === "cancel" && (
            <div className="mt-6 space-y-3">
              <p className="font-semibold text-ink">Cancel this meeting?</p>
              <textarea className="min-h-[80px] w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-ink" placeholder="Reason (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setMode("view")} className="h-12 rounded-2xl font-semibold text-ink ring-1 ring-line">Keep it</button>
                <button disabled={pending} onClick={() => run("cancel")} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-600 font-semibold text-white">{pending && <Loader2 className="h-4 w-4 animate-spin" />}Yes, cancel</button>
              </div>
            </div>
          )}

          <a href={portal} className="mt-8 block rounded-2xl p-4 text-center ring-1 ring-line transition hover:ring-2">
            <span className="block font-semibold text-ink">Your client portal</span>
            <span className="block text-[0.875rem] text-ink-muted">Quotes, invoices and support tickets — all in one place</span>
          </a>
        </div>
      </div>
    </div>
  );
}
