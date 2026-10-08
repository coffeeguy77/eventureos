"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Minus, Plus, RefreshCw } from "lucide-react";
import { cafeCaptcha, reserveCafeTable } from "@/app/cafe/[org]/actions";
import { dateLabel, slotsFor, type Closure, type Weekly } from "@/lib/cafe/core";

const field = "h-[52px] w-full rounded-[14px] border border-[#E6DCD4] bg-white px-4 text-[0.9688rem] text-[#151312] outline-none transition placeholder:text-[#A39A93] focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]";
const lbl = "mb-1.5 block text-[0.8125rem] font-semibold text-[#3A3431]";
const SEATS = [["indoor", "Indoor"], ["outdoor", "Outdoor"], ["any", "Don't mind"]] as const;

/** Table booking form — sent to the café app's bookings (same as booking in the app). */
export function ReserveForm({ slug, dates, weekly, closures, now, phone }: { slug: string; dates: string[]; weekly: Weekly | null; closures: Closure[]; now: { date: string; minutes: number }; phone: string | null }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", notes: "", seating: "", answer: "", company: "" });
  const [party, setParty] = useState(2);
  const [date, setDate] = useState(dates[0] ?? "");
  const slots = useMemo(() => (date ? slotsFor(date, weekly, closures, now, 30, 30) : []), [date, weekly, closures, now]);
  const [time, setTime] = useState("");
  useEffect(() => { if (!slots.some((s) => s.value === time)) setTime(slots[0]?.value ?? ""); }, [slots, time]);
  const [cap, setCap] = useState<{ token: string; question: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const loadCap = () => cafeCaptcha(slug).then((r) => setCap(r.ok ? { token: r.token, question: r.question } : null)).catch(() => setCap(null));
  useEffect(() => { void loadCap(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  if (done) {
    return (
      <div className="rounded-[28px] bg-white p-8 text-center shadow-[0_30px_60px_-40px_rgba(80,45,40,.35)] ring-1 ring-[#EDE3DB] sm:p-12" role="status">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-7 w-7" /></span>
        <p className="shop-serif mt-5 text-[1.875rem] font-semibold">Booking request received</p>
        <p className="mt-2 text-[#5E5853]">Table for {party} · {done}. We&apos;ll confirm shortly on {f.phone}.</p>
      </div>
    );
  }

  return (
    <form data-track="Reserve a table" aria-label="Reserve a table" className="rounded-[28px] bg-white p-6 shadow-[0_30px_60px_-40px_rgba(80,45,40,.35)] ring-1 ring-[#EDE3DB] sm:p-9"
      onSubmit={async (e) => {
        e.preventDefault(); setErr(null);
        if (!f.seating) return setErr("Please choose a seating preference.");
        if (!date || !time) return setErr("Please choose a day and time.");
        setBusy(true);
        const r = await reserveCafeTable(slug, { ...f, party, date, time, captchaToken: cap?.token ?? "", captchaAnswer: f.answer });
        setBusy(false);
        if (r.ok) setDone(`${dateLabel(date, now.date)} at ${slots.find((s) => s.value === time)?.label ?? time}`);
        else { setErr(r.error); setF((x) => ({ ...x, answer: "" })); void loadCap(); }
      }}>
      <p className="shop-serif text-[1.875rem] font-semibold leading-tight">Your booking</p>
      <div className="mt-6 space-y-5">
        <div>
          <span className={lbl}>Day</span>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {dates.map((d) => <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={date === d} className={`shrink-0 rounded-full px-4 py-2 text-[0.875rem] font-medium ring-1 ${date === d ? "bg-[#151312] text-white ring-[#151312]" : "bg-white ring-[#E6DCD4] hover:ring-[#151312]"}`}>{dateLabel(d, now.date)}</button>)}
          </div>
          {!dates.length && <p className="text-[0.9375rem] text-[#5E5853]">No times are open for booking right now{phone ? ` — call us on ${phone}` : ""}.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={lbl} htmlFor="rs-time">Time</label><select id="rs-time" value={time} onChange={(e) => setTime(e.target.value)} className={field}>{slots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
          <div><span className={lbl}>Guests</span>
            <div className="flex h-[52px] items-center justify-between rounded-[14px] border border-[#E6DCD4] bg-white px-2">
              <button type="button" aria-label="Fewer guests" onClick={() => setParty(Math.max(1, party - 1))} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#F4ECE6]"><Minus className="h-4 w-4" /></button>
              <span className="font-semibold tabular-nums">{party} {party === 1 ? "guest" : "guests"}</span>
              <button type="button" aria-label="More guests" onClick={() => setParty(Math.min(50, party + 1))} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#F4ECE6]"><Plus className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
        <div><span className={lbl}>Seating</span>
          <div className="grid grid-cols-3 gap-2">{SEATS.map(([k, t]) => <button key={k} type="button" onClick={() => setF({ ...f, seating: k })} aria-pressed={f.seating === k} className={`h-[48px] rounded-[14px] text-[0.9063rem] font-medium ring-1 ${f.seating === k ? "bg-[color-mix(in_srgb,var(--pk)_8%,white)] ring-2 ring-[var(--pk)]" : "ring-[#E6DCD4] hover:ring-[#151312]"}`}>{t}</button>)}</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={lbl} htmlFor="rs-name">Name</label><input id="rs-name" className={field} autoComplete="name" required value={f.name} onChange={set("name")} /></div>
          <div><label className={lbl} htmlFor="rs-phone">Mobile</label><input id="rs-phone" type="tel" className={field} autoComplete="tel" required value={f.phone} onChange={set("phone")} /></div>
          <div className="sm:col-span-2"><label className={lbl} htmlFor="rs-email">Email <span className="font-normal text-[#8C847D]">(optional — for a confirmation email)</span></label><input id="rs-email" type="email" className={field} autoComplete="email" value={f.email} onChange={set("email")} /></div>
          <div className="sm:col-span-2"><label className={lbl} htmlFor="rs-notes">Anything we should know? <span className="font-normal text-[#8C847D]">(optional)</span></label><textarea id="rs-notes" rows={3} className={`${field} h-auto py-3`} placeholder="High chair, birthday, accessibility…" value={f.notes} onChange={set("notes")} /></div>
        </div>
        <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.company} onChange={set("company")} />
        <div className="max-w-xs"><label className={lbl} htmlFor="rs-cap">Quick check: what is {cap ? cap.question : "…"}? <button type="button" onClick={() => void loadCap()} aria-label="New question" className="ml-1 inline-grid h-6 w-6 place-items-center rounded-full align-middle hover:bg-[#F4ECE6]"><RefreshCw className="h-3.5 w-3.5" /></button></label>
          <input id="rs-cap" inputMode="numeric" className={field} value={f.answer} onChange={set("answer")} required /></div>
      </div>
      {err && <p className="mt-5 rounded-xl bg-[#FFF1F1] px-4 py-3 text-[0.875rem] text-[#B42318]" role="alert">{err}</p>}
      <button type="submit" disabled={busy || !dates.length} className="shop-btn mt-6 inline-flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--pk)] font-semibold text-white shadow-[0_16px_30px_-16px_var(--pk)] disabled:opacity-60">
        {busy ? <><Loader2 className="h-5 w-5 animate-spin" />Sending…</> : "Request booking"}
      </button>
    </form>
  );
}
