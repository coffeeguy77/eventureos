"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { sendEnquiry } from "@/app/hire/[org]/actions";
import { lodgeSupportTicket } from "@/app/site/[org]/support-actions";
import { BUDGETS, QUOTE_FOR, QUOTE_SERVICES, TIMEFRAMES } from "@/lib/site/agency/content";
import { quoteMessage } from "@/lib/site/agency/support";
import { BTN } from "./ui";

const input = "block h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4 text-[1rem] text-[var(--ink)] outline-none transition placeholder:text-[#8A86A0] hover:border-[#C9C4DA] focus:border-[var(--ac)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--ac)_16%,transparent)]";
const lbl = "mb-1.5 block text-[0.875rem] font-semibold text-[var(--ink)]";
const opt = <span className="font-normal text-[var(--muted)]"> (optional)</span>;

function Done({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="py-6">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--lime)] text-[var(--ink)]"><Check aria-hidden className="h-6 w-6" strokeWidth={2} /></span>
      <p className="mt-5 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">{title}</p>
      <div className="mt-3 space-y-3 text-[1rem] leading-relaxed text-[var(--muted)]">{children}</div>
    </div>
  );
}

function Err({ msg }: { msg: string | null }) {
  return msg ? <p role="alert" className="mt-4 rounded-xl border border-[#F3C2BE] bg-[#FFF3F2] px-4 py-3 text-[0.9375rem] text-[#A12A1E]">{msg}</p> : null;
}

function Submit({ pending, label, busy }: { pending: boolean; label: string; busy: string }) {
  return (
    <button type="submit" disabled={pending} className={`${BTN.primary} mt-6 w-full disabled:opacity-60 sm:w-auto`}>
      {pending ? <><LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />{busy}</> : <>{label}<ArrowRight aria-hidden className="h-4 w-4" /></>}
    </button>
  );
}

/** Quote request → an enquiry in the office. "quick" is the short form at the foot of pages; "full" is the quote page. */
export function QuoteForm({ slug, variant = "full", preselect }: { slug: string; variant?: "quick" | "full"; preselect?: string }) {
  const pre = preselect ? QUOTE_FOR[preselect] ?? (QUOTE_SERVICES.includes(preselect) ? preselect : "") : "";
  const [f, setF] = useState<Record<string, string>>(pre && variant === "quick" ? { service: pre } : {});
  const [services, setServices] = useState<string[]>(pre ? [pre] : []);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const id = (k: string) => `q-${variant}-${k}`;
  const toggle = (s: string) => setServices((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const picked = variant === "quick" ? (f.service ? [f.service] : []) : services;
    if (!(f.message ?? "").trim() && !picked.length) { setErr("Tell us what you need — pick a service or add a short message."); return; }
    start(async () => {
      const r = await sendEnquiry(slug, "contact", {
        name: f.name ?? "", email: f.email ?? "", phone: f.phone ?? "", company: f.company ?? "", website: f.website ?? "",
        message: quoteMessage({ services: picked, budget: f.budget, timeframe: f.timeframe, currentSite: f.currentSite, message: f.message }),
      });
      if (r.ok) setDone(r.reference); else setErr(r.error);
    });
  };

  if (done !== null) return (
    <Done title="Thanks — your quote request is in">
      <p>We&apos;ll look over what you need and get back to you shortly.{done ? <> Your reference is <strong className="text-[var(--ink)]">{done}</strong>.</> : null}</p>
    </Done>
  );

  return (
    <form onSubmit={submit} aria-label="Quote request" data-track="Quote request (agency)" noValidate>
      {variant === "full" && (
        <>
          <fieldset>
            <legend className={lbl}>What can we help with?</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {QUOTE_SERVICES.map((s) => (
                <label key={s} className="cursor-pointer">
                  <input type="checkbox" className="peer sr-only" checked={services.includes(s)} onChange={() => toggle(s)} />
                  <span className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-4 text-[0.9375rem] transition hover:border-[rgba(15,11,30,.4)] peer-checked:border-[var(--ink)] peer-checked:bg-[var(--ink)] peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ac)]">
                    {services.includes(s) && <Check aria-hidden className="h-4 w-4 text-[var(--lime)]" strokeWidth={2} />}{s}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-7">
            <legend className={lbl}>Rough budget{opt}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <label key={b} className="cursor-pointer">
                  <input type="radio" name={id("budget")} value={b} className="peer sr-only" checked={f.budget === b} onChange={set("budget")} />
                  <span className="inline-flex min-h-[42px] items-center rounded-full border border-[var(--line)] bg-white px-4 text-[0.9375rem] transition hover:border-[rgba(15,11,30,.4)] peer-checked:border-[var(--ac)] peer-checked:bg-[color-mix(in_srgb,var(--ac)_10%,white)] peer-checked:font-semibold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ac)]">{b}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <div><label htmlFor={id("time")} className={lbl}>Timeframe{opt}</label>
              <select id={id("time")} className={input} value={f.timeframe ?? ""} onChange={set("timeframe")}><option value="">Choose one</option>{TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><label htmlFor={id("site")} className={lbl}>Current website{opt}</label>
              <input id={id("site")} className={input} inputMode="url" placeholder="yourbusiness.com.au" value={f.currentSite ?? ""} onChange={set("currentSite")} /></div>
          </div>
          <hr className="my-8 border-[var(--line)]" />
        </>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label htmlFor={id("name")} className={lbl}>Your name</label><input id={id("name")} className={input} autoComplete="name" required value={f.name ?? ""} onChange={set("name")} /></div>
        <div><label htmlFor={id("email")} className={lbl}>Email</label><input id={id("email")} type="email" className={input} autoComplete="email" required value={f.email ?? ""} onChange={set("email")} /></div>
        <div><label htmlFor={id("phone")} className={lbl}>Phone{opt}</label><input id={id("phone")} type="tel" className={input} autoComplete="tel" value={f.phone ?? ""} onChange={set("phone")} /></div>
        {variant === "quick"
          ? <div><label htmlFor={id("svc")} className={lbl}>What do you need?</label>
              <select id={id("svc")} className={input} value={f.service ?? ""} onChange={set("service")}><option value="">Choose a service</option>{QUOTE_SERVICES.map((s) => <option key={s}>{s}</option>)}</select></div>
          : <div><label htmlFor={id("co")} className={lbl}>Business name{opt}</label><input id={id("co")} className={input} autoComplete="organization" value={f.company ?? ""} onChange={set("company")} /></div>}
        <div className="sm:col-span-2"><label htmlFor={id("msg")} className={lbl}>{variant === "quick" ? "A few details" : "Tell us about the project"}{variant === "quick" ? opt : null}</label>
          <textarea id={id("msg")} rows={variant === "quick" ? 3 : 5} className={`${input} h-auto py-3 leading-relaxed`} value={f.message ?? ""} onChange={set("message")}
            placeholder={variant === "quick" ? "What's the project, or what's not working?" : "What does your business do, what should the website or app achieve, anything you like or dislike?"} /></div>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website ?? ""} onChange={set("website")} />
      </div>
      <Err msg={err} />
      <Submit pending={pending} label={variant === "quick" ? "Send quote request" : "Request a quote"} busy="Sending…" />
    </form>
  );
}

/** "Lodge a support request" → a support ticket (agencies only). */
export function SupportForm({ slug, portal, phone }: { slug: string; portal: string; phone?: string | null }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: number | null } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  if (done) return (
    <Done title={done.number ? `Ticket #${done.number} lodged` : "Your request is in"}>
      <p>Thanks — we&apos;ve got it, and someone from our team will pick it up. We&apos;ll reply to <strong className="text-[var(--ink)]">{f.email}</strong>.</p>
      <p>To follow progress, sign in to the client portal with the same email address. We&apos;ll email you a one-time code — no password needed.</p>
      <p className="pt-2"><Link href={portal} className={BTN.primary}>Track it in the client portal<ArrowRight aria-hidden className="h-4 w-4" /></Link></p>
    </Done>
  );

  return (
    <form aria-label="Lodge a support request" data-track="Support ticket (agency)" noValidate
      onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => { const r = await lodgeSupportTicket(slug, f); if (r.ok) setDone({ number: r.number }); else setErr(r.error); }); }}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label htmlFor="s-name" className={lbl}>Your name</label><input id="s-name" className={input} autoComplete="name" required value={f.name ?? ""} onChange={set("name")} /></div>
        <div><label htmlFor="s-email" className={lbl}>Email</label><input id="s-email" type="email" className={input} autoComplete="email" required value={f.email ?? ""} onChange={set("email")} aria-describedby="s-email-hint" />
          <p id="s-email-hint" className="mt-1.5 text-[0.8125rem] text-[var(--muted)]">Use the email we know you by, so we can match your account.</p></div>
        <div><label htmlFor="s-phone" className={lbl}>Phone{opt}</label><input id="s-phone" type="tel" className={input} autoComplete="tel" value={f.phone ?? ""} onChange={set("phone")} /></div>
        <div><label htmlFor="s-site" className={lbl}>Website it&apos;s about{opt}</label><input id="s-site" className={input} inputMode="url" placeholder="yourbusiness.com.au" value={f.site ?? ""} onChange={set("site")} /></div>
        <div className="sm:col-span-2"><label htmlFor="s-subject" className={lbl}>Subject</label><input id="s-subject" className={input} required maxLength={200} placeholder="e.g. Contact form not sending" value={f.subject ?? ""} onChange={set("subject")} /></div>
        <div className="sm:col-span-2"><label htmlFor="s-details" className={lbl}>What&apos;s happening?</label>
          <textarea id="s-details" rows={6} required className={`${input} h-auto py-3 leading-relaxed`} value={f.details ?? ""} onChange={set("details")}
            placeholder="What were you trying to do, what happened instead, and which page or email address is affected? Error messages help." /></div>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website ?? ""} onChange={set("website")} />
      </div>
      <Err msg={err} />
      <Submit pending={pending} label="Lodge support ticket" busy="Lodging…" />
      {phone && <p className="mt-4 text-[0.875rem] text-[var(--muted)]">Site down or email completely stopped? Lodge the ticket, then call us on <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-[var(--ink)] underline underline-offset-2">{phone}</a>.</p>}
    </form>
  );
}
