"use client";

import { useState, useTransition } from "react";
import { ArrowRight, CalendarHeart, Check, Gift, Heart, Loader2, Lock, Mail, MessageCircle, Printer, Send, ShieldCheck, UserRound } from "lucide-react";
import { startGiftAction } from "@/app/book/actions";
import { goTop } from "./embed-bridge";

interface Option { key: string; courseId: string | null; amount: number; label: string; hint: string }

const MAX_MESSAGE = 200;
const field = "h-[46px] w-full rounded-lg border border-[#E2D8D2] bg-[#FCFAF8] pl-12 pr-3.5 text-[0.875rem] text-[#1E1A18] placeholder:text-[#8C8480] transition focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_22%,transparent)]";
const label = "mb-2 block text-[0.875rem] font-medium text-[#1E1A18]";
const icon = "pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8C8480]";

/** A cup for the shorter class, an espresso machine for the longer one, a gift box for dollar amounts. */
function OptionIcon({ i, amount }: { i: number; amount: boolean }) {
  if (amount) return <Gift className="h-9 w-9" strokeWidth={1.4} />;
  if (i === 0) return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 13h26v11c0 7.2-5.8 13-13 13s-13-5.8-13-13z" /><path d="M34 17h3.5a5 5 0 0 1 0 10H33.5" /><path d="M5 42h32" /><path d="M8 13l1-3h24l1 3" />
    </svg>
  );
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="6" width="30" height="9" rx="1.5" /><circle cx="17" cy="10.5" r="1.6" /><circle cx="24" cy="10.5" r="1.6" /><path d="M11 15v27h26V15" />
      <path d="M18 21h12v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z" /><path d="M24 28c-2.5 3-2.5 5 0 7 2.5-2 2.5-4 0-7z" /><path d="M9 42h30" />
    </svg>
  );
}

export function GiftForm({ orgSlug, currency, options, minDate, years, business, badge }: {
  orgSlug: string; currency: string; options: Option[]; minDate: string; years?: number; business?: string;
  /** Small badge beside "Choose a gift" (e.g. "Popular gift") */
  badge?: string | null;
}) {
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

  const choice = (on: boolean) => `relative flex w-full items-center gap-5 rounded-[10px] text-left transition ${on ? "border-2 border-[var(--b)] bg-[color-mix(in_srgb,var(--b)_13%,#FFF8F9)]" : "border border-[#E5DBD6] bg-[#FBF7F5] hover:border-[#D6CAC3]"}`;
  const trust = [
    { i: ShieldCheck, t: "Secure payment", s: "Powered by Stripe" },
    { i: Mail, t: "Instant delivery", s: "PDF certificate" },
    ...(years ? [{ i: CalendarHeart, t: `Valid for ${years} year${years === 1 ? "" : "s"}`, s: "They choose the date" }] : []),
    ...(business ? [{ i: Heart, t: "Support local", s: business }] : []),
  ];

  return (
    <form onSubmit={submit} className="rounded-[22px] bg-[#F8F1EE]/[0.97] px-5 py-6 shadow-[0_40px_90px_-40px_rgba(40,20,10,0.6)] backdrop-blur sm:px-7 sm:pb-[34px] sm:pt-[30px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.1875rem] font-semibold text-[#1E1A18]">Choose a gift</h2>
        {badge && <span className="rounded-md border border-[var(--b)] px-4 py-[3px] text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-[var(--b)]">{badge}</span>}
      </div>
      <div className="mt-4 grid gap-[15px] sm:grid-cols-2" role="radiogroup" aria-label="Choose a gift">
        {options.map((o, i) => {
          const on = pick === o.key;
          return (
            <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => setPick(o.key)} className={`${choice(on)} min-h-[106px] gap-[22px] py-3.5 pl-[26px] pr-3`}>
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--b)] [&_svg]:h-10 [&_svg]:w-10 ${on ? "" : "bg-[color-mix(in_srgb,var(--b)_9%,white)]"}`}><OptionIcon i={i} amount={!o.courseId} /></span>
              <span className="min-w-0 flex-1 pr-4">
                <span className="block text-[0.9375rem] font-semibold leading-snug tracking-[-0.005em] text-[#1E1A18]">{o.label}</span>
                <span className="mt-1 block text-[0.875rem] text-[#6E6560]">{o.hint}</span>
                <span className="mt-2 block text-[1.125rem] font-bold text-[#1E1A18]">{$(o.amount)}</span>
              </span>
              <span className="absolute right-3.5 top-3">
                {on ? <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--b)] text-white"><Check className="h-3 w-3" strokeWidth={3.5} /></span>
                  : <span className="block h-5 w-5 rounded-full border-[1.5px] border-[#B9B0AB]" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="my-[26px] h-px bg-[#E6DCD6]" />
      <h2 className="text-[1.1875rem] font-semibold text-[#1E1A18]">Who&apos;s it for?</h2>
      <div className="mt-3 grid gap-[13px] sm:grid-cols-[1.1fr_1fr]">
        <div><label className={label} htmlFor="g-rn">Recipient&apos;s name</label>
          <div className="relative"><Gift className={icon} strokeWidth={1.7} /><input id="g-rn" className={field} value={f.recipientName} onChange={set("recipientName")} maxLength={160} placeholder="Shown on the certificate" /></div></div>
        <div><label className={label} htmlFor="g-pn">Your name</label>
          <div className="relative"><UserRound className={icon} strokeWidth={1.7} /><input id="g-pn" className={field} value={f.purchaserName} onChange={set("purchaserName")} required maxLength={160} autoComplete="name" placeholder="Your name" /></div></div>
      </div>
      <div className="mt-3.5"><label className={label} htmlFor="g-pe">Your email</label>
        <div className="relative"><Mail className={icon} strokeWidth={1.7} /><input id="g-pe" type="email" inputMode="email" className={field} value={f.purchaserEmail} onChange={set("purchaserEmail")} required maxLength={254} autoComplete="email" placeholder="The certificate will be sent to this email" /></div>
        <p className="mt-2.5 text-[0.7813rem] text-[#6E6560]">The certificate comes to you (or directly to them), ready to print or forward.</p></div>
      <div className="mt-3.5"><label className={label} htmlFor="g-m">Personal message (optional)</label>
        <div className="relative"><MessageCircle className="pointer-events-none absolute left-4 top-[15px] h-[18px] w-[18px] text-[#8C8480]" strokeWidth={1.7} />
          <textarea id="g-m" rows={3} className={`${field} h-[84px] resize-y py-3 leading-relaxed`} value={f.message} onChange={set("message")} maxLength={MAX_MESSAGE} placeholder="Happy Father's Day! Love, …" /></div>
        <p className="mt-1 text-right text-[0.875rem] text-[#6E6560]" aria-live="polite">{f.message.length}/{MAX_MESSAGE}</p></div>

      <h3 className="text-[0.875rem] font-medium text-[#1E1A18]">Delivery method</h3>
      <div className="mt-2.5 grid gap-[13px] sm:grid-cols-2" role="radiogroup" aria-label="Delivery method">
        <button type="button" role="radio" aria-checked={!direct} onClick={() => setDirect(false)} className={`${choice(!direct)} min-h-[72px] px-6 py-3`}>
          <Send className={`h-[26px] w-[26px] shrink-0 ${!direct ? "text-[var(--b)]" : "text-[#6E6560]"}`} strokeWidth={1.6} />
          <span className="min-w-0"><span className="block text-[0.9375rem] font-semibold text-[#1E1A18]">Email to me</span><span className="block text-[0.8125rem] text-[#6E6560]">I&apos;ll print or forward it</span></span>
        </button>
        <button type="button" role="radio" aria-checked={direct} onClick={() => setDirect(true)} className={`${choice(direct)} min-h-[72px] px-6 py-3`}>
          <Printer className={`h-[26px] w-[26px] shrink-0 ${direct ? "text-[var(--b)]" : "text-[#6E6560]"}`} strokeWidth={1.6} />
          <span className="min-w-0"><span className="block text-[0.9375rem] font-semibold text-[#1E1A18]">Email directly to them</span><span className="block text-[0.8125rem] text-[#6E6560]">They&apos;ll receive it as a surprise</span></span>
        </button>
      </div>
      {direct && (
        <div className="mt-[18px] grid gap-[13px] sm:grid-cols-2">
          <div><label className={label} htmlFor="g-re">Their email</label>
            <div className="relative"><Mail className={icon} strokeWidth={1.7} /><input id="g-re" type="email" inputMode="email" className={field} value={f.recipientEmail} onChange={set("recipientEmail")} required maxLength={254} /></div></div>
          <div><label className={label} htmlFor="g-d">Send on <span className="font-normal text-[#6E6560]">(blank = now)</span></label>
            <input id="g-d" type="date" min={minDate} className={`${field} pl-3.5`} value={f.sendOn} onChange={set("sendOn")} /></div>
          <p className="text-[0.8125rem] text-[#6E6560] sm:col-span-2">You&apos;ll get a copy too.</p>
        </div>
      )}

      {err && <p role="alert" className="mt-5 rounded-lg bg-rose-50 px-4 py-3 text-[0.875rem] font-medium text-rose-800">{err}</p>}
      {fallback ? (
        <a href={fallback} target="_top" className="mt-[18px] flex h-[68px] w-full items-center justify-center rounded-xl bg-[var(--b)] text-[1.125rem] font-medium text-white">Continue to secure payment →</a>
      ) : (
        <button type="submit" disabled={pending || !opt} className="group relative mt-[18px] flex h-[68px] w-full items-center justify-center gap-3 rounded-xl bg-[var(--b)] px-6 text-[1.125rem] font-medium text-white shadow-[0_14px_30px_-16px_var(--b)] transition hover:brightness-105 disabled:opacity-50">
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" strokeWidth={2} />}{opt ? `Pay ${$(opt.amount)} securely` : "Choose a gift"}
          <ArrowRight className="absolute right-7 h-6 w-6 transition-transform group-hover:translate-x-1" strokeWidth={1.6} />
        </button>
      )}

      <ul className="mt-11 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
        {trust.map((x) => (
          <li key={x.t} className="flex items-center gap-3">
            <x.i className="h-7 w-7 shrink-0 text-[var(--b)]" strokeWidth={1.5} />
            <span className="min-w-0"><span className="block text-[0.7813rem] font-semibold leading-tight text-[#1E1A18]">{x.t}</span><span className="mt-0.5 block text-[0.7188rem] leading-tight text-[#6E6560]">{x.s}</span></span>
          </li>
        ))}
      </ul>
    </form>
  );
}
