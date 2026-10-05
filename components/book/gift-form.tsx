"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check, Gift, Loader2, Lock, Mail, MessageSquare, Printer, Send, UserRound } from "lucide-react";
import { startGiftAction } from "@/app/book/actions";
import { goTop } from "./embed-bridge";

interface Option { key: string; courseId: string | null; amount: number; label: string; hint: string }

const MAX_MESSAGE = 200;
const field = "h-12 w-full rounded-xl border border-[#E6DDD6] bg-white pl-11 pr-3.5 text-base text-ink placeholder:text-[#9A948F] focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_25%,transparent)]";
const label = "mb-1.5 block text-[0.9063rem] font-medium text-ink";

/** A cup for the shorter class, an espresso machine for the longer one, a gift box for amounts. */
function OptionIcon({ i, amount }: { i: number; amount: boolean }) {
  if (amount) return <Gift className="h-7 w-7" strokeWidth={1.6} />;
  if (i === 0) return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 11h17v6a8 8 0 0 1-8 8h-1a8 8 0 0 1-8-8z" /><path d="M22 13h2.5a3.5 3.5 0 0 1 0 7H21" /><path d="M3 28h22" />
    </svg>
  );
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="4" width="22" height="7" rx="1.5" /><path d="M7 11v15h18V11" /><path d="M11 15h8v3a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" /><path d="M15 11v4" /><path d="M5 26h22" /><circle cx="22.5" cy="7.5" r="1" />
      <path d="M11 23h8" />
    </svg>
  );
}

function Radio({ on }: { on: boolean }) {
  return on
    ? <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--b)] text-[var(--on-b)]"><Check className="h-4 w-4" strokeWidth={3} /></span>
    : <span className="block h-7 w-7 shrink-0 rounded-full border-2 border-[#D9D2CC] bg-white" />;
}

export function GiftForm({ orgSlug, currency, options, minDate, years, business }: { orgSlug: string; currency: string; options: Option[]; minDate: string; years?: number; business?: string }) {
  const $ = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n).replace(/\.00$/, "");
  const [pick, setPick] = useState(options[0]?.key ?? "");
  const [f, setF] = useState({ purchaserName: "", purchaserEmail: "", recipientName: "", recipientEmail: "", message: "", sendOn: "" });
  const [direct, setDirect] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const opt = options.find((o) => o.key === pick);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opt) { setErr("Choose a gift."); return; }
    setErr(null);
    start(async () => {
      const r = await startGiftAction({ orgSlug, courseId: opt.courseId, amount: opt.courseId ? null : opt.amount, purchaserName: f.purchaserName, purchaserEmail: f.purchaserEmail,
        recipientName: f.recipientName, recipientEmail: direct ? f.recipientEmail : null, message: f.message, sendOn: direct ? f.sendOn : null })
        .catch(() => ({ ok: false as const, error: "Couldn't reach the booking system — try again." }));
      if (!r.ok) { setErr(r.error); return; }
      if (!goTop(r.redirect)) setFallback(r.redirect);
      setTimeout(() => setFallback(r.redirect), 1500);
    });
  };

  const choice = (on: boolean) => `relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition sm:p-5 ${on ? "border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_7%,white)] ring-1 ring-[var(--b)]" : "border-[#E6DDD6] bg-white hover:border-[#D3C8BF]"}`;

  return (
    <form onSubmit={submit} className="rounded-[28px] bg-[#FFFDFB] p-5 shadow-[0_30px_80px_-30px_rgba(60,35,20,0.45)] ring-1 ring-black/5 sm:p-8">
      <h2 className="text-[1.375rem] font-semibold text-ink">Choose a gift</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Choose a gift">
        {options.map((o, i) => {
          const on = pick === o.key;
          return (
            <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => setPick(o.key)} className={choice(on)}>
              <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-full ${on ? "bg-white text-[var(--b)]" : "bg-[color-mix(in_srgb,var(--b)_8%,white)] text-[var(--b)]"}`}><OptionIcon i={i} amount={!o.courseId} /></span>
              <span className="min-w-0 flex-1 pr-7">
                <span className="block text-[1rem] font-semibold leading-snug text-ink">{o.label}</span>
                <span className="mt-0.5 block text-[0.9063rem] text-ink-muted">{o.hint}</span>
                <span className="mt-2 block text-[1.25rem] font-bold text-ink">{$(o.amount)}</span>
              </span>
              <span className="absolute right-3 top-3"><Radio on={on} /></span>
            </button>
          );
        })}
      </div>

      <div className="my-6 h-px bg-[#EDE6E0]" />
      <h2 className="text-[1.375rem] font-semibold text-ink">Who&apos;s it for?</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><label className={label} htmlFor="g-rn">Recipient&apos;s name</label>
          <div className="relative"><UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8F8984]" /><input id="g-rn" className={field} value={f.recipientName} onChange={set("recipientName")} maxLength={160} placeholder="Shown on the certificate" /></div></div>
        <div><label className={label} htmlFor="g-pn">Your name</label>
          <div className="relative"><UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8F8984]" /><input id="g-pn" className={field} value={f.purchaserName} onChange={set("purchaserName")} required maxLength={160} autoComplete="name" placeholder="Your name" /></div></div>
        <div className="sm:col-span-2"><label className={label} htmlFor="g-pe">Your email</label>
          <div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8F8984]" /><input id="g-pe" type="email" inputMode="email" className={field} value={f.purchaserEmail} onChange={set("purchaserEmail")} required maxLength={254} autoComplete="email" placeholder="The certificate will be sent to this email" /></div>
          <p className="mt-1.5 text-[0.8438rem] text-ink-muted">The certificate comes to you (or directly to them), ready to print or forward.</p></div>
        <div className="sm:col-span-2"><label className={label} htmlFor="g-m">Personal message <span className="font-normal text-ink-muted">(optional)</span></label>
          <div className="relative"><MessageSquare className="pointer-events-none absolute left-3.5 top-4 h-5 w-5 text-[#8F8984]" />
            <textarea id="g-m" rows={3} className={`${field} h-auto py-3`} value={f.message} onChange={set("message")} maxLength={MAX_MESSAGE} placeholder="Happy Father's Day! Love, …" /></div>
          <p className="mt-1 text-right text-[0.8438rem] text-ink-muted" aria-live="polite">{f.message.length}/{MAX_MESSAGE}</p></div>
      </div>

      <h2 className="mt-2 text-[1.125rem] font-semibold text-ink">Delivery method</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Delivery method">
        <button type="button" role="radio" aria-checked={!direct} onClick={() => setDirect(false)} className={choice(!direct)}>
          <Send className={`h-7 w-7 shrink-0 ${!direct ? "text-[var(--b)]" : "text-ink-muted"}`} strokeWidth={1.7} />
          <span className="min-w-0 flex-1"><span className="block text-[1rem] font-semibold text-ink">Email to me</span><span className="block text-[0.9063rem] text-ink-muted">I&apos;ll print or forward it</span></span>
          <Radio on={!direct} />
        </button>
        <button type="button" role="radio" aria-checked={direct} onClick={() => setDirect(true)} className={choice(direct)}>
          <Printer className={`h-7 w-7 shrink-0 ${direct ? "text-[var(--b)]" : "text-ink-muted"}`} strokeWidth={1.7} />
          <span className="min-w-0 flex-1"><span className="block text-[1rem] font-semibold text-ink">Email directly to them</span><span className="block text-[0.9063rem] text-ink-muted">They&apos;ll receive it as a surprise</span></span>
          <Radio on={direct} />
        </button>
      </div>
      {direct && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label className={label} htmlFor="g-re">Their email</label>
            <div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8F8984]" /><input id="g-re" type="email" inputMode="email" className={field} value={f.recipientEmail} onChange={set("recipientEmail")} required maxLength={254} /></div></div>
          <div><label className={label} htmlFor="g-d">Send on <span className="font-normal text-ink-muted">(blank = now)</span></label>
            <input id="g-d" type="date" min={minDate} className={`${field} pl-3.5`} value={f.sendOn} onChange={set("sendOn")} /></div>
          <p className="text-[0.8438rem] text-ink-muted sm:col-span-2">You&apos;ll get a copy too.</p>
        </div>
      )}

      {err && <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-[0.9063rem] font-medium text-rose-800">{err}</p>}
      {fallback ? (
        <a href={fallback} target="_top" className="mt-6 flex h-16 w-full items-center justify-center rounded-2xl bg-[var(--b)] text-[1.125rem] font-semibold text-[var(--on-b)]">Continue to secure payment →</a>
      ) : (
        <button type="submit" disabled={pending || !opt} className="group mt-6 flex h-16 w-full items-center gap-3 rounded-2xl bg-[var(--b)] px-6 text-[1.1875rem] font-semibold text-[var(--on-b)] shadow-[0_14px_30px_-14px_var(--b)] transition hover:brightness-105 disabled:opacity-50">
          <span className="flex flex-1 items-center justify-center gap-3">{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}{opt ? `Pay ${$(opt.amount)} securely` : "Choose a gift"}</span>
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>
      )}

      <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-[#EDE6E0]">
        {[
          { i: <Lock className="h-7 w-7" strokeWidth={1.6} />, t: "Secure payment", s: "Powered by Stripe" },
          { i: <Mail className="h-7 w-7" strokeWidth={1.6} />, t: "Instant delivery", s: "PDF certificate" },
          ...(years ? [{ i: <Gift className="h-7 w-7" strokeWidth={1.6} />, t: `Valid for ${years} year${years === 1 ? "" : "s"}`, s: "They choose the date" }] : []),
          ...(business ? [{ i: <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>, t: "Support local", s: business }] : []),
        ].map((x) => (
          <li key={x.t} className="flex items-center gap-2.5 sm:px-3 sm:first:pl-0">
            <span className="shrink-0 text-[var(--b)]">{x.i}</span>
            <span className="min-w-0"><span className="block text-[0.8438rem] font-semibold leading-tight text-ink">{x.t}</span><span className="block text-[0.75rem] leading-tight text-ink-muted">{x.s}</span></span>
          </li>
        ))}
      </ul>
    </form>
  );
}
