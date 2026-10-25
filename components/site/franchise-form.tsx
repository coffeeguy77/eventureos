"use client";
import { useState, useTransition } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { sendFranchiseEnquiry } from "@/app/site/[org]/franchise-actions";
import { MODEL_LABEL, MODELS } from "@/lib/franchise/core";

const field = "h-[50px] w-full rounded-xl border border-[#E6DCD4] bg-white px-4 text-[1rem] text-[#151312] outline-none transition placeholder:text-[#9A918A] focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]";
const label = "mb-1.5 block text-[0.8438rem] font-semibold text-[#2B2522]";

/** The franchise page's enquiry form → Franchise in the back end. */
export function FranchiseEnquiryForm({ slug }: { slug: string }) {
  const [f, setF] = useState<Record<string, string>>({ model: "" });
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  if (done) return (
    <div className="py-6 text-center" role="status">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_14%,white)] text-[var(--pk)]"><Check className="h-7 w-7" /></span>
      <p className="shop-serif mt-5 text-[1.875rem] font-semibold">Thanks — we&apos;ve got it</p>
      <p className="mx-auto mt-2 max-w-sm text-[#5E5853]">We&apos;ll be in touch to arrange a chat. After that we&apos;ll send you a short application.</p>
    </div>
  );
  return (
    <form className="space-y-4" data-track-form="Franchise enquiry"
      onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => { const r = await sendFranchiseEnquiry(slug, f); if (r.ok) setDone(true); else setErr(r.error); }); }}>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={f.website ?? ""} onChange={set("website")} aria-hidden />
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={label} htmlFor="fr-name">Your name</label><input id="fr-name" required autoComplete="name" className={field} value={f.name ?? ""} onChange={set("name")} /></div>
        <div><label className={label} htmlFor="fr-email">Email</label><input id="fr-email" type="email" required autoComplete="email" className={field} value={f.email ?? ""} onChange={set("email")} /></div>
        <div><label className={label} htmlFor="fr-phone">Phone</label><input id="fr-phone" type="tel" autoComplete="tel" className={field} value={f.phone ?? ""} onChange={set("phone")} /></div>
        <div><label className={label} htmlFor="fr-loc">Where would you open?</label><input id="fr-loc" placeholder="Suburb or town" className={field} value={f.location ?? ""} onChange={set("location")} /></div>
      </div>
      <div>
        <span className={label}>I&apos;m interested in</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODELS.map((m) => (
            <label key={m} className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-3 text-[0.9375rem] ring-1 transition ${f.model === m ? "bg-[color-mix(in_srgb,var(--pk)_8%,white)] font-semibold text-[#151312] ring-2 ring-[var(--pk)]" : "bg-white text-[#3A3431] ring-[#E6DCD4] hover:ring-[#CFC3B9]"}`}>
              <input type="radio" name="model" value={m} checked={f.model === m} onChange={set("model")} className="accent-[var(--pk)]" />{MODEL_LABEL[m]}
            </label>
          ))}
        </div>
      </div>
      <div><label className={label} htmlFor="fr-msg">Tell us a little about you</label><textarea id="fr-msg" rows={4} className={`${field} h-auto py-3`} placeholder="Your background, and what you'd like to build" value={f.message ?? ""} onChange={set("message")} /></div>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.875rem] text-rose-700" role="alert">{err}</p>}
      <button type="submit" disabled={pending} className="shop-btn inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[var(--pk)] text-[1rem] font-semibold text-white shadow-[0_14px_28px_-16px_var(--pk)] disabled:opacity-60">
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}Send my enquiry<ArrowRight className="h-5 w-5" />
      </button>
      <p className="text-center text-[0.8125rem] text-[#8C847D]">No obligation. We&apos;ll only use your details to talk to you about a franchise.</p>
    </form>
  );
}
