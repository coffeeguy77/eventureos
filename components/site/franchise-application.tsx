"use client";
import { useState, useTransition } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { sendFranchiseApplication } from "@/app/site/[org]/franchise-actions";
import { QUESTIONS, qText } from "@/lib/franchise/core";

const field = "w-full rounded-xl border border-[#E6DCD4] bg-white px-4 text-[1rem] text-[#151312] outline-none transition placeholder:text-[#9A918A] focus:border-[var(--pk)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--pk)_14%,transparent)]";

/** The franchise application, opened from the emailed link. Answers can be updated until a decision is made. */
export function FranchiseApplication({ slug, token, business, initial, phone, again }: { slug: string; token: string; business: string; initial: Record<string, string>; phone: string; again: boolean }) {
  const [a, setA] = useState<Record<string, string>>({ ...initial, phone });
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => setA((x) => ({ ...x, [k]: v }));
  const sections = [...new Set(QUESTIONS.map((q) => q.section))];
  if (done) return (
    <div className="rounded-[28px] bg-white p-8 text-center ring-1 ring-[#EDE3DB] sm:p-12" role="status">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--pk)_14%,white)] text-[var(--pk)]"><Check className="h-7 w-7" /></span>
      <p className="shop-serif mt-5 text-[2rem] font-semibold">Application received</p>
      <p className="mx-auto mt-2 max-w-md text-[#5E5853]">Thank you. We&apos;ll read it carefully and be in touch about next steps. You can come back to this link to change your answers until we&apos;ve made a decision.</p>
    </div>
  );
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); setErr(null); start(async () => { const r = await sendFranchiseApplication(slug, token, a); if (r.ok) { setDone(true); window.scrollTo({ top: 0, behavior: "smooth" }); } else setErr(r.error); }); }}>
      {again && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[0.9375rem] text-emerald-800">We have your application. Change anything below and send it again.</p>}
      {sections.map((sec, n) => (
        <fieldset key={sec} className="rounded-[24px] bg-white p-6 ring-1 ring-[#EDE3DB] sm:p-8">
          <legend className="sr-only">{qText(sec, business)}</legend>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[var(--pk)]">Step {n + 1} of {sections.length}</p>
          <p className="shop-serif mt-1 text-[1.75rem] font-semibold">{qText(sec, business)}</p>
          {n === 0 && (
            <div className="mt-5"><label htmlFor="q-phone" className="mb-1.5 block text-[0.9375rem] font-semibold">Best phone number</label>
              <input id="q-phone" type="tel" autoComplete="tel" className={`${field} h-[50px]`} value={a.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
          )}
          <div className="mt-5 space-y-5">
            {QUESTIONS.filter((q) => q.section === sec).map((q) => {
              const id = `q-${q.key}`;
              const lab = <span className="text-[0.9375rem] font-semibold">{qText(q.label, business)}{q.required && q.kind !== "yesno" ? <span className="text-[var(--pk)]"> *</span> : null}{q.hint && <span className="ml-1 font-normal text-[#8C847D]">· {q.hint}</span>}</span>;
              if (q.kind === "yesno") return (
                <label key={q.key} className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#FBF7F3] p-4">
                  <input type="checkbox" checked={a[q.key] === "yes"} onChange={(e) => set(q.key, e.target.checked ? "yes" : "")} className="mt-1 h-5 w-5 accent-[var(--pk)]" />{lab}
                </label>
              );
              if (q.kind === "choice") return (
                <div key={q.key} role="radiogroup" aria-labelledby={`${id}-l`}>
                  <p id={`${id}-l`} className="mb-2">{lab}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {q.options!.map((o) => (
                      <label key={o} className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-3 text-[0.9375rem] ring-1 transition ${a[q.key] === o ? "bg-[color-mix(in_srgb,var(--pk)_8%,white)] font-semibold ring-2 ring-[var(--pk)]" : "bg-white text-[#3A3431] ring-[#E6DCD4] hover:ring-[#CFC3B9]"}`}>
                        <input type="radio" name={q.key} value={o} checked={a[q.key] === o} onChange={() => set(q.key, o)} className="accent-[var(--pk)]" />{o}
                      </label>
                    ))}
                  </div>
                </div>
              );
              return (
                <div key={q.key}>
                  <label htmlFor={id} className="mb-1.5 block">{lab}</label>
                  {q.kind === "long"
                    ? <textarea id={id} rows={4} maxLength={3000} className={`${field} py-3`} value={a[q.key] ?? ""} onChange={(e) => set(q.key, e.target.value)} />
                    : <input id={id} maxLength={300} className={`${field} h-[50px]`} value={a[q.key] ?? ""} onChange={(e) => set(q.key, e.target.value)} />}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      {err && <p className="rounded-xl bg-rose-50 px-4 py-3 text-[0.9375rem] text-rose-700" role="alert">{err}</p>}
      <button type="submit" disabled={pending} className="shop-btn inline-flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[var(--pk)] text-[1.0625rem] font-semibold text-white shadow-[0_14px_28px_-16px_var(--pk)] disabled:opacity-60">
        {pending && <Loader2 className="h-5 w-5 animate-spin" />}{again ? "Send my updated application" : "Send my application"}<ArrowRight className="h-5 w-5" />
      </button>
    </form>
  );
}
