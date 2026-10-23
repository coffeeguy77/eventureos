"use client";
import { useState, useTransition } from "react";
import { ArrowRight, Check, Mail } from "lucide-react";
import { sendEnquiry } from "@/app/hire/[org]/actions";
import { wholesaleOrderLink } from "@/app/cafe/[org]/actions";

const field = "h-[50px] w-full rounded-[14px] border border-[#E6DCD4] bg-white px-4 text-[0.9688rem] text-[#151312] outline-none transition placeholder:text-[#A39A93] focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]";
const lbl = "mb-1.5 block text-[0.8125rem] font-semibold text-[#3A3431]";
const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-[0.875rem] font-medium ring-1 transition ${on ? "bg-[#151312] text-white ring-[#151312]" : "bg-white text-[#3A3431] ring-[#E6DCD4] hover:ring-[#151312]"}`;

const KINDS = ["Opening a new café", "Existing café", "Office or workplace", "Restaurant or hotel", "Something else"];
const VOLUME = ["Under 5kg", "5–10kg", "10–20kg", "20kg+", "Not sure yet"];
const WHEN = ["Straight away", "In 1–3 months", "Just exploring"];

function Chips({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className={lbl}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(value === o ? "" : o)} className={chip(value === o)}>{o}</button>)}
      </div>
    </fieldset>
  );
}

/** "Get our wholesale rates" — goes to the office as a wholesale enquiry, with everything needed to quote. */
export function WholesaleSignup({ slug }: { slug: string }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const pick = (k: string) => (v: string) => setF({ ...f, [k]: v });

  if (done !== null) {
    return (
      <div className="rounded-[28px] bg-white p-8 text-center shadow-[0_30px_60px_-40px_rgba(80,45,40,.35)] ring-1 ring-[#EDE3DB] sm:p-12" role="status">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_14%,white)] text-[var(--pk)]"><Check className="h-7 w-7" /></span>
        <p className="shop-serif mt-5 text-[1.875rem] font-semibold">Thanks — we&apos;ve got it</p>
        <p className="mt-2 text-[#5E5853]">We&apos;ll be in touch with our wholesale rates.{done ? <> Your reference is <strong className="text-[#151312]">{done}</strong>.</> : null}</p>
      </div>
    );
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!f.company?.trim()) { setErr("Add your business name."); return; }
    const message = [
      f.kind && `About them: ${f.kind}`,
      f.volume && `Coffee a week: ${f.volume}`,
      f.when && `Starting: ${f.when}`,
      f.suburb && `Suburb: ${f.suburb}`,
      f.machine && `Espresso machine: ${f.machine}`,
      f.note && `\n${f.note}`,
    ].filter(Boolean).join("\n") || "Wholesale rates request";
    start(async () => {
      const r = await sendEnquiry(slug, "wholesale", { name: f.name ?? "", email: f.email ?? "", phone: f.phone ?? "", company: f.company ?? "", message, website: f.website ?? "" });
      if (r.ok) setDone(r.reference); else setErr(r.error);
    });
  };
  return (
    <form onSubmit={submit} aria-label="Get our wholesale rates" data-track="Wholesale: rates form"
      className="rounded-[28px] bg-white p-6 shadow-[0_30px_60px_-40px_rgba(80,45,40,.35)] ring-1 ring-[#EDE3DB] sm:p-9">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={lbl} htmlFor="ws-company">Business name</label><input id="ws-company" className={field} autoComplete="organization" required value={f.company ?? ""} onChange={set("company")} /></div>
        <div><label className={lbl} htmlFor="ws-name">Your name</label><input id="ws-name" className={field} autoComplete="name" required value={f.name ?? ""} onChange={set("name")} /></div>
        <div><label className={lbl} htmlFor="ws-email">Email</label><input id="ws-email" type="email" className={field} autoComplete="email" required value={f.email ?? ""} onChange={set("email")} /></div>
        <div><label className={lbl} htmlFor="ws-phone">Phone</label><input id="ws-phone" type="tel" className={field} autoComplete="tel" required value={f.phone ?? ""} onChange={set("phone")} /></div>
        <Chips label="Which best describes you?" options={KINDS} value={f.kind ?? ""} onChange={pick("kind")} />
        <Chips label="Roughly how much coffee a week?" options={VOLUME} value={f.volume ?? ""} onChange={pick("volume")} />
        <Chips label="When would you like to start?" options={WHEN} value={f.when ?? ""} onChange={pick("when")} />
        <div><label className={lbl} htmlFor="ws-suburb">Suburb <span className="font-normal text-[#8C847D]">(optional)</span></label><input id="ws-suburb" className={field} autoComplete="address-level2" value={f.suburb ?? ""} onChange={set("suburb")} /></div>
        <div><label className={lbl} htmlFor="ws-machine">Espresso machine <span className="font-normal text-[#8C847D]">(optional)</span></label><input id="ws-machine" className={field} placeholder="Brand & groups, or none yet" value={f.machine ?? ""} onChange={set("machine")} /></div>
        <div className="sm:col-span-2"><label className={lbl} htmlFor="ws-note">Anything else? <span className="font-normal text-[#8C847D]">(optional)</span></label>
          <textarea id="ws-note" rows={3} className={`${field} h-auto py-3.5`} placeholder="Your menu, the coffee you use now, questions…" value={f.note ?? ""} onChange={set("note")} /></div>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website ?? ""} onChange={set("website")} />
      </div>
      {err && <p className="mt-4 rounded-xl bg-[#FFF1F1] px-4 py-3 text-[0.875rem] text-[#B42318]" role="alert">{err}</p>}
      <button type="submit" disabled={pending} className="shop-btn mt-6 inline-flex h-[56px] w-full items-center justify-center gap-2.5 rounded-full bg-[var(--pk)] px-9 font-semibold text-white shadow-[0_16px_30px_-16px_var(--pk)] hover:brightness-105 disabled:opacity-60 sm:w-auto">
        {pending ? "Sending…" : "Send me your wholesale rates"}<ArrowRight className="h-5 w-5" />
      </button>
    </form>
  );
}

/** Existing customers: their private ordering link, by email. */
export function WholesaleOrderNow({ slug, dark = false }: { slug: string; dark?: boolean }) {
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  if (sent) {
    return (
      <p role="status" className={`flex items-start gap-3 rounded-[18px] px-5 py-4 text-[0.9688rem] ${dark ? "bg-white/10 text-white" : "bg-white ring-1 ring-[#EDE3DB]"}`}>
        <Mail className="mt-0.5 h-5 w-5 shrink-0" />
        <span>If that email is on one of our wholesale accounts, your ordering link is on its way — check your inbox (and spam) in a minute.</span>
      </p>
    );
  }
  return (
    <form data-track="Wholesale: order link" aria-label="Order now"
      onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => { const r = await wholesaleOrderLink(slug, email, hp); if (r.ok) setSent(true); else setErr(r.error); }); }}>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your business email" aria-label="Your business email" autoComplete="email"
          className={`${field} flex-1 ${dark ? "border-white/20 bg-white/10 text-white placeholder:text-white/50" : ""}`} />
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={hp} onChange={(e) => setHp(e.target.value)} />
        <button type="submit" disabled={pending} className={`shop-btn inline-flex h-[50px] shrink-0 items-center justify-center gap-2 rounded-full px-7 font-semibold disabled:opacity-60 ${dark ? "bg-white text-[#151312]" : "bg-[#151312] text-white"}`}>
          {pending ? "Sending…" : "Email my ordering link"}
        </button>
      </div>
      {err && <p className={`mt-3 text-[0.875rem] ${dark ? "text-[#FFC9C3]" : "text-[#B42318]"}`} role="alert">{err}</p>}
    </form>
  );
}
