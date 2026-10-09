"use client";
import { useState, useTransition } from "react";
import { ArrowRight, Check, Send } from "lucide-react";
import { sendEnquiry } from "@/app/hire/[org]/actions";

const field = "h-[52px] w-full rounded-[14px] border border-[#E6DCD4] bg-white px-4 text-[0.9688rem] text-[#151312] outline-none transition placeholder:text-[#A39A93] focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]";
const label = "mb-1.5 block text-[0.8125rem] font-semibold text-[#3A3431]";

/** A short contact form for any public page — lands in the office as an enquiry tagged with the section. */
export function ContactForm({ slug, section, heading, intro, showEvent = true, messageHint, serifClass = "shop-serif", plain = false }: {
  slug: string; section: string; heading: string; intro?: string; showEvent?: boolean; messageHint?: string; serifClass?: string;
  /** No card or heading — just the fields, compact (the page shows its own heading) */ plain?: boolean;
}) {
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  if (done !== null) {
    return (
      <div className="rounded-[28px] bg-white p-8 text-center shadow-[0_30px_60px_-40px_rgba(80,45,40,.35)] ring-1 ring-[#EDE3DB] sm:p-12" role="status">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_14%,white)] text-[var(--pk)]"><Check className="h-7 w-7" /></span>
        <p className={`${serifClass} mt-5 text-[1.875rem] font-semibold`}>Thanks — we&apos;ve got it</p>
        <p className="mt-2 text-[#5E5853]">We&apos;ll be in touch shortly.{done ? <> Your reference is <strong className="text-[#151312]">{done}</strong>.</> : null}</p>
      </div>
    );
  }
  if (plain) {
    const pf = "h-[46px] w-full rounded-[10px] border border-[#E6DCD4] bg-white px-3.5 text-[0.9375rem] text-[#151312] outline-none transition placeholder:text-[#8C847D] focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]";
    return (
      <form data-track={`${heading} (contact)`} aria-label={heading}
        onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => { const r = await sendEnquiry(slug, section, f); if (r.ok) setDone(r.reference); else setErr(r.error); }); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <input aria-label="Name" placeholder="Name *" className={pf} autoComplete="name" required value={f.name ?? ""} onChange={set("name")} />
          <input aria-label="Email" placeholder="Email *" type="email" className={pf} autoComplete="email" required value={f.email ?? ""} onChange={set("email")} />
          <input aria-label="Phone" placeholder="Phone (optional)" type="tel" className={pf} autoComplete="tel" value={f.phone ?? ""} onChange={set("phone")} />
          <input aria-label="Company" placeholder="Company (optional)" className={pf} autoComplete="organization" value={f.company ?? ""} onChange={set("company")} />
          <textarea aria-label="Message" placeholder={`${messageHint ?? "Your message"} *`} required rows={3} className={`${pf} h-auto py-3 sm:col-span-2`} value={f.message ?? ""} onChange={set("message")} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website ?? ""} onChange={set("website")} />
        </div>
        {err && <p className="mt-3 rounded-xl bg-[#FFF1F1] px-4 py-3 text-[0.875rem] text-[#B42318]" role="alert">{err}</p>}
        <button type="submit" disabled={pending} className="shop-btn mt-4 inline-flex h-[48px] items-center justify-center gap-2 rounded-full bg-[var(--pk)] px-8 text-[0.9688rem] font-semibold text-white shadow-[0_14px_26px_-16px_var(--pk)] hover:brightness-105 disabled:opacity-60">
          {pending ? "Sending…" : "Send message"}<ArrowRight className="h-4 w-4" />
        </button>
      </form>
    );
  }
  return (
    <form data-track={`${heading} (contact)`} aria-label={heading}
      onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => { const r = await sendEnquiry(slug, section, f); if (r.ok) setDone(r.reference); else setErr(r.error); }); }}
      className="rounded-[28px] bg-white p-6 shadow-[0_30px_60px_-40px_rgba(80,45,40,.35)] ring-1 ring-[#EDE3DB] sm:p-9">
      <p className={`${serifClass} text-[1.875rem] font-semibold leading-tight`}>{heading}</p>
      {intro && <p className="mt-2 text-[0.9688rem] text-[#5E5853]">{intro}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div><label className={label} htmlFor={`cf-${section}-name`}>Name</label><input id={`cf-${section}-name`} className={field} autoComplete="name" required value={f.name ?? ""} onChange={set("name")} /></div>
        <div><label className={label} htmlFor={`cf-${section}-email`}>Email</label><input id={`cf-${section}-email`} type="email" className={field} autoComplete="email" required value={f.email ?? ""} onChange={set("email")} /></div>
        <div><label className={label} htmlFor={`cf-${section}-phone`}>Phone <span className="font-normal text-[#8C847D]">(optional)</span></label><input id={`cf-${section}-phone`} type="tel" className={field} autoComplete="tel" value={f.phone ?? ""} onChange={set("phone")} /></div>
        <div><label className={label} htmlFor={`cf-${section}-company`}>Company <span className="font-normal text-[#8C847D]">(optional)</span></label><input id={`cf-${section}-company`} className={field} autoComplete="organization" value={f.company ?? ""} onChange={set("company")} /></div>
        {showEvent && <>
          <div><label className={label} htmlFor={`cf-${section}-date`}>Event date <span className="font-normal text-[#8C847D]">(if known)</span></label><input id={`cf-${section}-date`} type="date" className={field} value={f.event_date ?? ""} onChange={set("event_date")} /></div>
          <div><label className={label} htmlFor={`cf-${section}-guests`}>Guests <span className="font-normal text-[#8C847D]">(approx.)</span></label><input id={`cf-${section}-guests`} inputMode="numeric" className={field} value={f.guests ?? ""} onChange={set("guests")} /></div>
        </>}
        <div className="sm:col-span-2"><label className={label} htmlFor={`cf-${section}-msg`}>Message</label>
          <textarea id={`cf-${section}-msg`} rows={4} className={`${field} h-auto py-3.5`} placeholder={messageHint} value={f.message ?? ""} onChange={set("message")} /></div>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website ?? ""} onChange={set("website")} />
      </div>
      {err && <p className="mt-4 rounded-xl bg-[#FFF1F1] px-4 py-3 text-[0.875rem] text-[#B42318]" role="alert">{err}</p>}
      <button type="submit" disabled={pending} className="shop-btn mt-6 inline-flex h-[56px] w-full items-center justify-center gap-2.5 rounded-full bg-[var(--pk)] px-9 font-semibold text-white shadow-[0_16px_30px_-16px_var(--pk)] hover:brightness-105 disabled:opacity-60 sm:w-auto">
        <Send className="h-[18px] w-[18px]" />{pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
