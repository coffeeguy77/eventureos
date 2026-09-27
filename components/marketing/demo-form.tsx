"use client";

import { useActionState, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { requestDemo, type DemoState } from "@/app/demo-actions";

const TYPES = ["Catering", "Mobile bar", "Mobile coffee cart", "Event hire", "Venue", "Event planning", "Photo booth / entertainment", "Other"];
const SIZES = ["Just me", "2–5 people", "6–15 people", "16+ people"];

const field = "mt-1.5 block w-full rounded-xl border border-[rgb(var(--line)/calc(var(--line-a)*2))] bg-[rgb(var(--card)/var(--card-a))] px-4 py-3 text-[0.9375rem] text-[rgb(var(--ink))] placeholder:text-[rgb(var(--faint))] outline-none transition focus:border-[rgb(var(--accent))] focus:ring-4 focus:ring-[rgb(var(--accent)/.15)]";
const label = "block text-[0.8125rem] font-medium text-[rgb(var(--ink))]";

export function DemoForm() {
  const [state, action, pending] = useActionState<DemoState, FormData>(requestDemo, undefined);
  const [t] = useState(() => Date.now());
  if (state?.ok) {
    return (
      <div role="status" className="mk-card flex flex-col items-center p-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-[rgb(var(--accent))]" />
        <p className="mk-serif mt-4 text-[2rem] leading-tight">Thanks — we’ll be in touch.</p>
        <p className="mk-muted mt-2 max-w-sm">We’ll reply by email to find a time that suits and walk you through EventureOS with your own kind of events in mind.</p>
      </div>
    );
  }
  return (
    <form action={action} className="mk-card relative p-6 sm:p-8" aria-describedby="demo-note">
      <input type="hidden" name="t" value={t} />
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="d-name" className={label}>Your name</label><input id="d-name" name="name" required minLength={2} maxLength={120} autoComplete="name" className={field} /></div>
        <div><label htmlFor="d-email" className={label}>Work email</label><input id="d-email" name="email" type="email" required maxLength={200} autoComplete="email" className={field} /></div>
        <div><label htmlFor="d-company" className={label}>Business name</label><input id="d-company" name="company" maxLength={160} autoComplete="organization" className={field} /></div>
        <div><label htmlFor="d-phone" className={label}>Phone <span className="mk-faint font-normal">(optional)</span></label><input id="d-phone" name="phone" type="tel" maxLength={40} autoComplete="tel" className={field} /></div>
        <div><label htmlFor="d-type" className={label}>What kind of events business?</label>
          <select id="d-type" name="business_type" defaultValue="" className={field}><option value="">Choose…</option>{TYPES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label htmlFor="d-size" className={label}>Team size</label>
          <select id="d-size" name="team_size" defaultValue="" className={field}><option value="">Choose…</option>{SIZES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="sm:col-span-2"><label htmlFor="d-msg" className={label}>What would you like to sort out first? <span className="mk-faint font-normal">(optional)</span></label>
          <textarea id="d-msg" name="message" rows={3} maxLength={2000} placeholder="e.g. enquiries getting lost in the inbox, quoting takes too long, chasing deposits…" className={field} /></div>
      </div>
      {state?.error && <p role="alert" className="mt-4 rounded-xl bg-[rgb(var(--accent)/.1)] px-4 py-3 text-[0.875rem] text-[rgb(var(--ink))]">{state.error}</p>}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p id="demo-note" className="mk-faint text-[0.8125rem]">We’ll only use your details to arrange the demo.</p>
        <button disabled={pending} className="mk-btn mk-btn-primary disabled:opacity-60">{pending ? "Sending…" : <>Book a demo <ArrowRight className="h-4 w-4" /></>}</button>
      </div>
    </form>
  );
}
