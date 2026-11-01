"use client";

import { useState, useTransition } from "react";
import { Building2, CalendarCheck2, Check, Clock, Loader2, MapPin, Phone, Video } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ApptKind, DaySlots } from "@/lib/appointments/core";
import { bookMeeting, freeTimes } from "@/app/meet/[slug]/actions";
import { SlotPicker, dayParts, t12 } from "./slot-picker";

const KIND: Record<ApptKind, { label: string; icon: typeof Video; hint: string }> = {
  video: { label: "Video call", icon: Video, hint: "We'll send the link" },
  phone: { label: "Phone call", icon: Phone, hint: "We'll call you" },
  in_person: { label: "In person", icon: MapPin, hint: "At our office" },
};
const dur = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} hour${m === 60 ? "" : "s"}`);
const field = "h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-[1rem] text-ink focus:outline-none focus:ring-2";

/** The public "Book a meeting" page: how and how long → day and time → your details → booked (with your portal). */
export function BookingFlow({ slug, business, logo, accent, title, intro, kinds, durations, location, days: initialDays, tz, autoConfirm }: {
  slug: string; business: string; logo: string | null; accent: string; title: string; intro: string; kinds: ApptKind[]; durations: number[]; location: string; days: DaySlots[]; tz: string; autoConfirm: boolean;
}) {
  const [kind, setKind] = useState<ApptKind>(kinds[0]);
  const [duration, setDuration] = useState(durations[0]);
  const [days, setDays] = useState(initialDays);
  const [slot, setSlot] = useState<{ date: string; time: string } | null>(null);
  const [step, setStep] = useState<"time" | "details" | "done">("time");
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", topic: "", website: "" });
  const [done, setDone] = useState<{ when: string; status: "pending" | "confirmed"; portal: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const changeDuration = (d: number) => { setDuration(d); setSlot(null); start(async () => { const r = await freeTimes(slug, d); if (r.ok) setDays(r.days); else setError(r.error); }); };
  const submit = () => start(async () => {
    setError(null);
    if (!slot) return;
    const r = await bookMeeting(slug, { kind, duration, date: slot.date, time: slot.time, ...f });
    if (!r.ok) { setError(r.error); if (/taken/.test(r.error)) { const x = await freeTimes(slug, duration); if (x.ok) setDays(x.days); setStep("time"); setSlot(null); } return; }
    setDone(r); setStep("done");
  });
  const style = { ["--accent" as string]: accent };
  return (
    <div className="min-h-[100dvh] bg-canvas" style={style}>
      <div className="h-48 w-full sm:h-56" style={{ background: `radial-gradient(1200px 300px at 20% -20%, ${accent}cc, transparent 60%), linear-gradient(135deg, ${accent}, ${accent}99)` }} />
      <div className="mx-auto -mt-32 max-w-5xl px-4 pb-16 sm:-mt-40">
        <div className="overflow-hidden rounded-3xl bg-surface shadow-2xl ring-1 ring-line lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* who / what */}
          <aside className="border-b border-line p-6 lg:border-b-0 lg:border-r sm:p-8">
            {logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logo} alt={business} className="h-14 max-w-[200px] object-contain" />
              : <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-[1.25rem] font-bold text-white" style={{ background: accent }}>{business.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}</span>}
            <p className="mt-5 text-[0.875rem] font-medium text-ink-muted">{business}</p>
            <h1 className="mt-1 text-[1.75rem] font-bold leading-tight tracking-tight text-ink">{title}</h1>
            {intro && <p className="mt-3 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-muted">{intro}</p>}
            <ul className="mt-6 space-y-3 text-[0.9375rem] text-ink">
              <li className="flex items-center gap-3"><Clock className="h-5 w-5 text-ink-faint" />{dur(duration)}</li>
              <li className="flex items-center gap-3">{(() => { const I = KIND[kind].icon; return <I className="h-5 w-5 text-ink-faint" />; })()}{KIND[kind].label}{kind === "in_person" && location ? ` — ${location}` : ""}</li>
              {slot && <li className="flex items-start gap-3 font-semibold"><CalendarCheck2 className="mt-0.5 h-5 w-5" style={{ color: accent }} /><span>{dayParts(slot.date).long}<span className="block font-normal text-ink-muted">{t12(slot.time)} · {tz.split("/")[1]?.replace("_", " ")} time</span></span></li>}
            </ul>
          </aside>

          <main className="p-6 sm:p-8">
            {step === "time" && (
              <div className="space-y-7">
                {kinds.length > 1 && (
                  <section>
                    <p className="mb-3 text-[0.8125rem] font-semibold uppercase tracking-wide text-ink-faint">How would you like to meet?</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {kinds.map((k) => { const I = KIND[k].icon; const on = kind === k; return (
                        <button key={k} type="button" onClick={() => setKind(k)} className={cn("flex items-center gap-3 rounded-2xl p-4 text-left ring-1 transition", on ? "ring-2" : "ring-line hover:ring-2")} style={on ? { boxShadow: `inset 0 0 0 2px ${accent}`, background: `${accent}12` } : undefined}>
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: on ? accent : "rgb(var(--ink-faint))" }}><I className="h-5 w-5" /></span>
                          <span><span className="block font-semibold text-ink">{KIND[k].label}</span><span className="block text-[0.8125rem] text-ink-muted">{k === "in_person" && location ? location : KIND[k].hint}</span></span>
                        </button>
                      ); })}
                    </div>
                  </section>
                )}
                {durations.length > 1 && (
                  <section>
                    <p className="mb-3 text-[0.8125rem] font-semibold uppercase tracking-wide text-ink-faint">How long?</p>
                    <div className="flex flex-wrap gap-2">{durations.map((d) => <button key={d} type="button" onClick={() => changeDuration(d)} className={cn("rounded-full px-5 py-2.5 text-[0.9375rem] font-semibold ring-1 transition", duration === d ? "text-white ring-transparent" : "text-ink ring-line hover:ring-2")} style={duration === d ? { background: accent } : undefined}>{dur(d)}</button>)}</div>
                  </section>
                )}
                <section>
                  <p className="mb-3 text-[0.8125rem] font-semibold uppercase tracking-wide text-ink-faint">Pick a day and time</p>
                  {pending ? <p className="flex items-center gap-2 text-ink-muted"><Loader2 className="h-5 w-5 animate-spin" />Finding free times…</p> : <SlotPicker days={days} value={slot} onChange={setSlot} accent={accent} />}
                </section>
                <button type="button" disabled={!slot} onClick={() => setStep("details")} className="h-14 w-full rounded-2xl text-[1.0625rem] font-semibold text-white shadow-lg transition disabled:opacity-40" style={{ background: accent }}>{slot ? `Continue — ${dayParts(slot.date).dow} ${dayParts(slot.date).day} ${dayParts(slot.date).month}, ${t12(slot.time)}` : "Choose a time"}</button>
              </div>
            )}

            {step === "details" && (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <button type="button" onClick={() => setStep("time")} className="text-[0.875rem] font-medium" style={{ color: accent }}>← Change the time</button>
                <h2 className="text-[1.375rem] font-bold text-ink">Your details</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className={field} required placeholder="First name" autoComplete="given-name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
                  <input className={field} placeholder="Last name" autoComplete="family-name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
                  <input className={field} required type="email" placeholder="Email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
                  <input className={field} required={kind === "phone"} type="tel" placeholder={kind === "phone" ? "Phone (we'll call you)" : "Phone"} autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                  <div className="relative sm:col-span-2"><Building2 className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-ink-faint" /><input className={cn(field, "pl-11")} placeholder="Business name (optional)" autoComplete="organization" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
                  <textarea className="min-h-[110px] w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-[1rem] text-ink focus:outline-none focus:ring-2 sm:col-span-2" placeholder="What would you like to talk about?" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} />
                  <input className="hidden" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} aria-hidden />
                </div>
                {error && <p className="rounded-xl bg-rose-500/10 px-4 py-3 text-[0.9375rem] font-medium text-rose-600">{error}</p>}
                <button disabled={pending} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[1.0625rem] font-semibold text-white shadow-lg disabled:opacity-60" style={{ background: accent }}>{pending && <Loader2 className="h-5 w-5 animate-spin" />}{autoConfirm ? "Book it" : "Request this time"}</button>
                <p className="text-center text-[0.8125rem] text-ink-faint">You&apos;ll get an email with the details and a calendar invite.</p>
              </form>
            )}

            {step === "done" && done && (
              <div className="py-6 text-center">
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl" style={{ background: accent }}><Check className="h-10 w-10" strokeWidth={3} /></span>
                <h2 className="mt-6 text-[1.75rem] font-bold text-ink">{done.status === "confirmed" ? "You're booked in!" : "Request sent"}</h2>
                <p className="mx-auto mt-2 max-w-md text-[1.0625rem] text-ink-muted">{done.when}</p>
                <p className="mx-auto mt-2 max-w-md text-[0.9375rem] text-ink-muted">{done.status === "confirmed" ? "We've emailed you the details and a calendar invite." : `${business} will confirm shortly — we've emailed you the details.`}</p>
                <div className="mx-auto mt-8 grid max-w-md gap-3">
                  <a href={done.portal} className="flex h-14 items-center justify-center rounded-2xl text-[1.0625rem] font-semibold text-white shadow-lg" style={{ background: accent }}>Open your client portal</a>
                  <a href={`/meet/${slug}/a/${done.token}`} className="flex h-12 items-center justify-center rounded-2xl text-[0.9375rem] font-semibold text-ink ring-1 ring-line">Change or cancel</a>
                </div>
                <p className="mx-auto mt-4 max-w-md text-[0.8125rem] text-ink-faint">Your portal is where you&apos;ll find your quotes, invoices and support — sign in with {f.email}.</p>
              </div>
            )}
          </main>
        </div>
        <p className="mt-6 text-center text-[0.75rem] text-ink-faint">Powered by EventureOS</p>
      </div>
    </div>
  );
}
