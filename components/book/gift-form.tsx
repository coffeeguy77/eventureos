"use client";

import { useState, useTransition } from "react";
import { Gift, Loader2, Lock } from "lucide-react";
import { startGiftAction } from "@/app/book/actions";
import { goTop } from "./embed-bridge";

interface Option { key: string; courseId: string | null; amount: number; label: string; hint: string }

const input = "h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-ink-faint focus:border-[var(--b)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--b)_25%,transparent)]";
const label = "mb-1.5 block text-[0.8125rem] font-medium text-ink";

export function GiftForm({ orgSlug, currency, options, minDate }: { orgSlug: string; currency: string; options: Option[]; minDate: string }) {
  const $ = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n).replace(/\.00$/, "");
  const [pick, setPick] = useState(options[0]?.key ?? "");
  const [f, setF] = useState({ purchaserName: "", purchaserEmail: "", recipientName: "", recipientEmail: "", message: "", sendOn: "" });
  const [emailIt, setEmailIt] = useState(false);
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
        recipientName: f.recipientName, recipientEmail: emailIt ? f.recipientEmail : null, message: f.message, sendOn: emailIt ? f.sendOn : null })
        .catch(() => ({ ok: false as const, error: "Couldn't reach the booking system — try again." }));
      if (!r.ok) { setErr(r.error); return; }
      if (!goTop(r.redirect)) setFallback(r.redirect);
      setTimeout(() => setFallback(r.redirect), 1500);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <h2 className="mb-3 text-[1.0625rem] font-semibold text-ink">Choose a gift</h2>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
          {options.map((o) => (
            <button key={o.key} type="button" role="radio" aria-checked={pick === o.key} onClick={() => setPick(o.key)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left ${pick === o.key ? "border-[var(--b)] ring-2 ring-[var(--b)]" : "border-line hover:bg-zinc-50"}`}>
              <Gift className="h-5 w-5 shrink-0 text-[var(--b)]" />
              <span className="min-w-0 flex-1"><span className="block text-[0.9688rem] font-semibold text-ink">{o.label}</span><span className="block text-[0.78rem] text-ink-muted">{o.hint}</span></span>
              <span className="text-[1rem] font-bold text-ink">{$(o.amount)}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <h2 className="mb-3 text-[1.0625rem] font-semibold text-ink">Who&apos;s it for?</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={label} htmlFor="g-rn">Their name</label><input id="g-rn" className={input} value={f.recipientName} onChange={set("recipientName")} maxLength={160} placeholder="Shown on the certificate" /></div>
          <div><label className={label} htmlFor="g-pn">Your name</label><input id="g-pn" className={input} value={f.purchaserName} onChange={set("purchaserName")} required maxLength={160} autoComplete="name" /></div>
          <div className="sm:col-span-2"><label className={label} htmlFor="g-pe">Your email</label><input id="g-pe" type="email" inputMode="email" className={input} value={f.purchaserEmail} onChange={set("purchaserEmail")} required maxLength={254} autoComplete="email" />
            <p className="mt-1 text-[0.78rem] text-ink-muted">The certificate comes to you straight away, ready to print or forward.</p></div>
          <div className="sm:col-span-2"><label className={label} htmlFor="g-m">Message <span className="font-normal text-ink-faint">(optional)</span></label><textarea id="g-m" rows={2} className={`${input} h-auto py-3`} value={f.message} onChange={set("message")} maxLength={500} placeholder="Happy Father's Day! Love, …" /></div>
          <label className="flex items-center gap-3 text-[0.9375rem] text-ink sm:col-span-2"><input type="checkbox" className="h-5 w-5 accent-[var(--b)]" checked={emailIt} onChange={(e) => setEmailIt(e.target.checked)} />Also email it to them</label>
          {emailIt && (<>
            <div><label className={label} htmlFor="g-re">Their email</label><input id="g-re" type="email" inputMode="email" className={input} value={f.recipientEmail} onChange={set("recipientEmail")} required maxLength={254} /></div>
            <div><label className={label} htmlFor="g-d">Send on <span className="font-normal text-ink-faint">(blank = now)</span></label><input id="g-d" type="date" min={minDate} className={input} value={f.sendOn} onChange={set("sendOn")} /></div>
          </>)}
        </div>
        {err && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-[0.9063rem] font-medium text-rose-800">{err}</p>}
        {fallback ? (
          <a href={fallback} target="_top" className="mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-[var(--b)] text-[1.0625rem] font-semibold text-[var(--on-b)]">Continue to secure payment →</a>
        ) : (
          <button type="submit" disabled={pending || !opt} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--b)] text-[1.0625rem] font-semibold text-[var(--on-b)] hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}{opt ? `Pay ${$(opt.amount)} securely` : "Choose a gift"}
          </button>
        )}
      </section>
    </form>
  );
}
