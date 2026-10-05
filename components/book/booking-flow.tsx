"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, ChevronLeft, CreditCard, Gift, Loader2, Lock, Minus, Plus, ShieldCheck, Building2 } from "lucide-react";
import type { PublicSession } from "@/lib/bookings/server";
import type { Question } from "@/lib/bookings/core";
import { checkAgencyAction, checkGiftAction, startBookingAction } from "@/app/book/actions";
import { goTop } from "./embed-bridge";

interface Props {
  org: { slug: string; name: string; currency: string; timezone: string; stripeReady: boolean; showSeatsLeft: boolean; waitlist: boolean; terms: string | null; cancelHours: number };
  course: { id: string; name: string; price: number; maxSeats: number; questions: Question[] };
  sessions: PublicSession[];
  preselect: string | null;
  utm: Record<string, string>;
  embed: boolean;
  source: "website" | "wordpress";
}

type Pay = "card" | "gift" | "agency";

const input = "h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-ink-faint focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_25%,transparent)]";
const label = "mb-1.5 block text-[0.8125rem] font-medium text-ink";

export function BookingFlow({ org, course, sessions, preselect, utm, source }: Props) {
  const fmt = useMemo(() => ({
    month: new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: org.timezone }),
    day: new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: org.timezone }),
    long: new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: org.timezone }),
    time: new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: org.timezone }),
    money: new Intl.NumberFormat("en-AU", { style: "currency", currency: org.currency }),
  }), [org.timezone, org.currency]);
  const t = (iso: string) => fmt.time.format(new Date(iso)).replace(/\s?(am|pm)$/i, (m) => m.trim().toLowerCase());
  const $ = (n: number) => fmt.money.format(n).replace(/\.00$/, "");

  const [sessionId, setSessionId] = useState<string | null>(preselect && sessions.some((s) => s.id === preselect) ? preselect : null);
  const [showAll, setShowAll] = useState(false);
  // After choosing, the date list folds away to the chosen date with a "Change date" button
  const [picking, setPicking] = useState(!(preselect && sessions.some((s) => s.id === preselect)));
  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const waitlist = !!session?.full;
  const maxSeats = session ? Math.max(1, Math.min(course.maxSeats, session.full ? course.maxSeats : session.left)) : course.maxSeats;
  const [seats, setSeats] = useState(1);
  const n = Math.min(seats, maxSeats);

  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [guests, setGuests] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState(""); const [marketing, setMarketing] = useState(false); const [agree, setAgree] = useState(false);
  const [pay, setPay] = useState<Pay>("card");
  const [gift, setGift] = useState(""); const [giftOk, setGiftOk] = useState<{ balance: number; label: string } | null>(null);
  const [agency, setAgency] = useState(""); const [agencyOk, setAgencyOk] = useState<{ name: string; price: number | null; poRequired: boolean } | null>(null);
  const [po, setPo] = useState({ number: "", site: "", contact: "" });
  const [err, setErr] = useState<string | null>(null);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const each = pay === "agency" && agencyOk ? agencyOk.price ?? session?.price ?? course.price : session?.price ?? course.price;
  const total = each * n;
  const giftApplied = pay === "gift" && giftOk ? Math.min(giftOk.balance, total) : 0;
  const due = Math.max(0, total - giftApplied);

  // Sessions grouped by month; the first 8 shown until "more dates"
  const visible = showAll ? sessions : sessions.slice(0, 8);
  const months = useMemo(() => {
    const m = new Map<string, PublicSession[]>();
    for (const s of visible) { const k = fmt.month.format(new Date(s.starts_at)); m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m.entries()];
  }, [visible, fmt]);

  const checkGift = () => start(async () => {
    setCheckMsg(null); setGiftOk(null);
    const r = await checkGiftAction(org.slug, gift, course.id).catch(() => ({ ok: false as const, error: "Couldn't check it — try again." }));
    if (r.ok) setGiftOk({ balance: r.balance, label: r.label }); else setCheckMsg(r.error);
  });
  const checkAgency = () => start(async () => {
    setCheckMsg(null); setAgencyOk(null);
    const r = await checkAgencyAction(org.slug, agency).catch(() => ({ ok: false as const, error: "Couldn't check it — try again." }));
    if (r.ok) setAgencyOk({ name: r.name, price: r.price, poRequired: r.poRequired }); else setCheckMsg(r.error);
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) { setErr("Choose a date first."); return; }
    if (org.terms && !agree) { setErr("Please tick to agree to the booking terms."); return; }
    if (pay === "gift" && !giftOk && !waitlist) { setErr("Check your gift certificate code first (tap Apply)."); return; }
    if (pay === "agency" && !agencyOk && !waitlist) { setErr("Check your agency code first (tap Apply)."); return; }
    setErr(null); setFallback(null);
    start(async () => {
      const r = await startBookingAction({
        orgSlug: org.slug, sessionId: session.id, seats: n, name, email, phone, attendees: [name, ...guests].slice(0, n), answers, notes, marketing,
        giftCode: pay === "gift" ? gift : null, agencyCode: pay === "agency" ? agency : null, po: pay === "agency" ? po : null,
        waitlist, utm, source,
      }).catch(() => ({ ok: false as const, error: "Couldn't reach the booking system — check your connection and try again." }));
      if (!r.ok) { setErr(r.error); return; }
      if (!goTop(r.redirect)) setFallback(r.redirect);
      // If the host page didn't take us there, offer a link (a tap always works)
      setTimeout(() => setFallback(r.redirect), 1500);
    });
  };

  if (!sessions.length) {
    return <div className="rounded-2xl border border-line bg-surface p-6 text-center text-[0.9375rem] text-ink-muted shadow-card">No dates are open for {course.name} right now. Please check back soon or contact {org.name}.</div>;
  }

  const Step = ({ n: num, title, done }: { n: number; title: string; done?: boolean }) => (
    <h2 className="mb-3 flex items-center gap-2.5 text-[1.0625rem] font-semibold text-ink">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.8125rem] font-bold ${done ? "bg-[var(--b)] text-[var(--on-b)]" : "bg-zinc-100 text-ink-muted"}`}>{done ? <Check className="h-4 w-4" /> : num}</span>{title}
    </h2>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* 1. Date */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <Step n={1} title="Choose a date" done={!!session} />
        {session && !picking ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_7%,transparent)] px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[1rem] font-semibold text-ink">{fmt.long.format(new Date(session.starts_at))}</span>
              <span className="block text-[0.875rem] text-ink-muted">{t(session.starts_at)} – {t(session.ends_at)} · {session.full ? "Full — waitlist" : `${session.left} seat${session.left === 1 ? "" : "s"} left`}</span>
            </span>
            <button type="button" onClick={() => setPicking(true)} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-surface px-4 text-[0.875rem] font-semibold text-ink ring-1 ring-line-strong hover:bg-zinc-50">
              <ChevronLeft className="h-4 w-4" />Change date
            </button>
          </div>
        ) : (<>
        {session && <button type="button" onClick={() => setPicking(false)} className="mb-3 inline-flex items-center gap-1 text-[0.875rem] font-semibold text-[var(--b)]"><ChevronLeft className="h-4 w-4" />Keep {fmt.day.format(new Date(session.starts_at))}</button>}
        <div className="space-y-4">
          {months.map(([month, list]) => (
            <div key={month}>
              <p className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wider text-ink-faint">{month}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((s) => {
                  const on = s.id === sessionId;
                  const few = !s.full && s.left <= 2;
                  return (
                    <button key={s.id} type="button" onClick={() => { setSessionId(s.id); setErr(null); if (!s.full || org.waitlist) setPicking(false); }} aria-pressed={on}
                      className={`flex min-h-[64px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${on ? "border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_7%,transparent)] ring-2 ring-[var(--b)]" : "border-line hover:border-line-strong hover:bg-zinc-50"}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9688rem] font-semibold text-ink">{fmt.day.format(new Date(s.starts_at))}</span>
                        <span className="block text-[0.8438rem] text-ink-muted">{t(s.starts_at)} – {t(s.ends_at)}{s.price !== course.price ? ` · ${$(s.price)}` : ""}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${s.full ? "bg-zinc-100 text-ink-muted" : few ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
                        {s.full ? (org.waitlist ? "Full · waitlist" : "Full") : org.showSeatsLeft || few ? `${s.left} left` : "Available"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {sessions.length > visible.length && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-3 inline-flex items-center gap-1 text-[0.875rem] font-semibold text-[var(--b)]">
            Show {sessions.length - visible.length} more dates<ChevronDown className="h-4 w-4" />
          </button>
        )}
        </>)}
        {session?.full && !org.waitlist && <p className="mt-3 text-[0.875rem] text-rose-700">That date is full — please choose another.</p>}
      </section>

      {session && (!session.full || org.waitlist) && (
        <>
          {/* 2. People */}
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
            <Step n={2} title="Who's coming?" done={name.length > 1 && /@/.test(email)} />
            {waitlist && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[0.875rem] text-amber-900">This date is full. Join the waitlist and we&apos;ll email you if a seat opens up — nothing to pay now.</p>}
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="text-[0.9375rem] font-medium text-ink">Number of people</span>
              <span className="flex items-center gap-1 rounded-xl border border-line p-1">
                <button type="button" onClick={() => setSeats(Math.max(1, n - 1))} disabled={n <= 1} aria-label="One fewer" className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-zinc-100 disabled:opacity-30"><Minus className="h-4 w-4" /></button>
                <span className="w-8 text-center text-[1.0625rem] font-semibold tabular-nums text-ink" aria-live="polite">{n}</span>
                <button type="button" onClick={() => setSeats(Math.min(maxSeats, n + 1))} disabled={n >= maxSeats} aria-label="One more" className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-zinc-100 disabled:opacity-30"><Plus className="h-4 w-4" /></button>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className={label} htmlFor="bk-name">Your name</label><input id="bk-name" className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={160} /></div>
              <div><label className={label} htmlFor="bk-email">Email</label><input id="bk-email" type="email" inputMode="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={254} /></div>
              <div><label className={label} htmlFor="bk-phone">Mobile</label><input id="bk-phone" type="tel" inputMode="tel" className={input} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={40} /></div>
              {Array.from({ length: n - 1 }, (_, i) => (
                <div key={i}><label className={label} htmlFor={`bk-g${i}`}>Person {i + 2} name <span className="font-normal text-ink-faint">(optional)</span></label>
                  <input id={`bk-g${i}`} className={input} value={guests[i] ?? ""} maxLength={160} onChange={(e) => { const g = [...guests]; g[i] = e.target.value; setGuests(g); }} /></div>
              ))}
              {course.questions.map((q) => (
                <div key={q.id} className="sm:col-span-2">
                  {q.type === "checkbox" ? (
                    <label className="flex items-start gap-3 text-[0.9375rem] text-ink"><input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--b)]" checked={answers[q.id] === "yes"} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.checked ? "yes" : "" })} />{q.label}{q.required ? " *" : ""}</label>
                  ) : (
                    <>
                      <label className={label} htmlFor={`q-${q.id}`}>{q.label}{q.required ? "" : <span className="font-normal text-ink-faint"> (optional)</span>}</label>
                      {q.type === "select" ? (
                        <select id={`q-${q.id}`} className={input} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} required={q.required}>
                          <option value="">Choose…</option>{(q.options ?? []).map((o) => <option key={o}>{o}</option>)}
                        </select>
                      ) : q.type === "textarea" ? (
                        <textarea id={`q-${q.id}`} rows={3} className={`${input} h-auto py-3`} value={answers[q.id] ?? ""} maxLength={1000} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} required={q.required} />
                      ) : (
                        <input id={`q-${q.id}`} className={input} value={answers[q.id] ?? ""} maxLength={300} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} required={q.required} />
                      )}
                    </>
                  )}
                </div>
              ))}
              <div className="sm:col-span-2"><label className={label} htmlFor="bk-notes">Anything we should know? <span className="font-normal text-ink-faint">(optional)</span></label>
                <textarea id="bk-notes" rows={2} className={`${input} h-auto py-3`} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. it's a birthday present, dietary needs" /></div>
            </div>
          </section>

          {/* 3. Pay */}
          {!waitlist && (
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
              <Step n={3} title="Payment" />
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="How are you paying?">
                {([["card", "Card", CreditCard, "Apple Pay, Google Pay & cards"], ["gift", "Gift certificate", Gift, "Use a code"], ["agency", "Employment agency", Building2, "Purchase order"]] as const).map(([k, l, Icon, hint]) => (
                  <button key={k} type="button" role="radio" aria-checked={pay === k} onClick={() => { setPay(k); setCheckMsg(null); setErr(null); }}
                    className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left ${pay === k ? "border-[var(--b)] ring-2 ring-[var(--b)]" : "border-line hover:bg-zinc-50"}`}>
                    <Icon className="h-5 w-5 shrink-0 text-ink-muted" />
                    <span><span className="block text-[0.9063rem] font-semibold text-ink">{l}</span><span className="block text-[0.75rem] text-ink-muted">{hint}</span></span>
                  </button>
                ))}
              </div>
              {pay === "gift" && (
                <div className="mt-4">
                  <label className={label} htmlFor="bk-gift">Gift certificate code</label>
                  <div className="flex gap-2">
                    <input id="bk-gift" className={`${input} uppercase tracking-wider`} value={gift} onChange={(e) => { setGift(e.target.value); setGiftOk(null); }} placeholder="GIFT-XXXX-XXXX" autoCapitalize="characters" maxLength={30} />
                    <button type="button" onClick={checkGift} disabled={pending || gift.trim().length < 6} className="h-12 shrink-0 rounded-xl border border-line-strong px-4 text-[0.9375rem] font-semibold text-ink hover:bg-zinc-50 disabled:opacity-40">Apply</button>
                  </div>
                  {giftOk && <p className="mt-2 text-[0.875rem] font-medium text-emerald-700">✓ {giftOk.label} — {$(giftOk.balance)} available</p>}
                </div>
              )}
              {pay === "agency" && (
                <div className="mt-4 space-y-3">
                  <p className="text-[0.8438rem] text-ink-muted">Booked through an employment services provider? Enter the code and purchase order from your case manager — we&apos;ll invoice them, nothing to pay today.</p>
                  <div>
                    <label className={label} htmlFor="bk-agency">Agency code</label>
                    <div className="flex gap-2">
                      <input id="bk-agency" className={`${input} uppercase tracking-wider`} value={agency} onChange={(e) => { setAgency(e.target.value); setAgencyOk(null); }} autoCapitalize="characters" maxLength={40} />
                      <button type="button" onClick={checkAgency} disabled={pending || agency.trim().length < 3} className="h-12 shrink-0 rounded-xl border border-line-strong px-4 text-[0.9375rem] font-semibold text-ink hover:bg-zinc-50 disabled:opacity-40">Apply</button>
                    </div>
                    {agencyOk && <p className="mt-2 text-[0.875rem] font-medium text-emerald-700">✓ {agencyOk.name}</p>}
                  </div>
                  {agencyOk && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div><label className={label} htmlFor="po-n">Purchase order no.{agencyOk.poRequired ? "" : " (optional)"}</label><input id="po-n" className={input} value={po.number} onChange={(e) => setPo({ ...po, number: e.target.value })} required={agencyOk.poRequired} maxLength={60} placeholder="e.g. E0668613" /></div>
                      <div><label className={label} htmlFor="po-s">Office / site</label><input id="po-s" className={input} value={po.site} onChange={(e) => setPo({ ...po, site: e.target.value })} maxLength={160} placeholder="e.g. Belconnen" /></div>
                      <div><label className={label} htmlFor="po-c">Case manager</label><input id="po-c" className={input} value={po.contact} onChange={(e) => setPo({ ...po, contact: e.target.value })} maxLength={160} /></div>
                    </div>
                  )}
                </div>
              )}
              {checkMsg && <p className="mt-2 text-[0.875rem] font-medium text-rose-700">{checkMsg}</p>}
            </section>
          )}

          {/* Summary */}
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
            <div className="space-y-1.5 text-[0.9375rem]">
              <div className="flex justify-between gap-3"><span className="text-ink-muted">{course.name}</span><span className="text-ink">{n} × {$(each)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-ink-muted">{fmt.long.format(new Date(session.starts_at))}</span><span className="text-ink">{t(session.starts_at)}</span></div>
              {giftApplied > 0 && <div className="flex justify-between gap-3 text-emerald-700"><span>Gift certificate</span><span>−{$(giftApplied)}</span></div>}
              <div className="flex justify-between gap-3 border-t border-line pt-2.5 text-[1.125rem] font-bold text-ink">
                <span>{waitlist ? "Waitlist" : pay === "agency" ? "Invoiced to your agency" : "Total to pay"}</span><span>{waitlist ? "No charge" : $(pay === "agency" ? total : due)}</span>
              </div>
            </div>
            <label className="mt-4 flex items-start gap-3 text-[0.875rem] text-ink-muted"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--b)]" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />Email me about new classes and offers (unsubscribe any time).</label>
            {org.terms && (
              <details className="mt-3 text-[0.875rem] text-ink-muted">
                <summary className="cursor-pointer select-none">
                  <label className="inline-flex items-start gap-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--b)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I agree to the booking terms</label>
                  <span className="ml-1 underline">read</span>
                </summary>
                <p className="mt-2 whitespace-pre-line rounded-xl bg-zinc-50 p-3">{org.terms}</p>
              </details>
            )}
            {err && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-[0.9063rem] font-medium text-rose-800">{err}</p>}
            {fallback ? (
              <a href={fallback} target="_top" className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--b)] text-[1.0625rem] font-semibold text-[var(--on-b)]">Continue to secure payment →</a>
            ) : (
              <button type="submit" disabled={pending || (!org.stripeReady && pay === "card" && !waitlist && due > 0)}
                className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--b)] text-[1.0625rem] font-semibold text-[var(--on-b)] transition hover:opacity-90 disabled:opacity-50">
                {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : waitlist ? null : pay === "agency" || due === 0 ? <Check className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                {waitlist ? "Join the waitlist" : pay === "agency" ? "Confirm booking" : due === 0 ? "Confirm booking" : `Pay ${$(due)} securely`}
              </button>
            )}
            {!org.stripeReady && pay === "card" && !waitlist && <p className="mt-2 text-center text-[0.8125rem] text-ink-muted">Card payments aren&apos;t switched on yet — please contact {org.name}.</p>}
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[0.75rem] text-ink-faint"><ShieldCheck className="h-3.5 w-3.5" />Payments by Stripe. {org.cancelHours > 0 ? `Change or cancel online up to ${org.cancelHours} hours before.` : ""}</p>
          </section>
        </>
      )}
    </form>
  );
}
