"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { FormError, Input, Label, Textarea } from "@/components/ui/form";
import { recordQuoteLinkView, respondViaQuoteLink, type LinkRespondState } from "../actions";
import { cn } from "@/lib/cn";

/** Records the view once the page has been visible for a moment in a real browser (email link scanners don't run this). */
export function ViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    let done = false;
    const fire = () => { if (done || document.visibilityState !== "visible") return; done = true; void recordQuoteLinkView(token); };
    const t = setTimeout(fire, 1500);
    const onVis = () => { if (document.visibilityState === "visible") setTimeout(fire, 1500); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", onVis); };
  }, [token]);
  return null;
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[0.8125rem] font-medium text-ink-muted ring-1 ring-inset ring-line-strong hover:bg-zinc-50 hover:text-ink print:hidden">
      <Printer className="h-4 w-4" />Print or save as PDF
    </button>
  );
}

const btn = (primary: boolean) => cn(
  "inline-flex h-12 w-full items-center justify-center rounded-xl px-5 text-[0.9375rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-auto",
  primary ? "bg-[var(--portal-brand)] text-[color:var(--portal-brand-fg)] shadow-sm hover:brightness-95" : "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50",
);

export function LinkResponse({ token, versionNumber, total, defaultName, businessName, needsApproval }: {
  token: string; versionNumber: number; total: string; defaultName: string; businessName: string; needsApproval: boolean;
}) {
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const [state, action, pending] = useActionState<LinkRespondState, FormData>(respondViaQuoteLink, undefined);
  const [name, setName] = useState(defaultName);
  const [agree, setAgree] = useState(false);

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-[var(--portal-brand-line)] bg-[var(--portal-brand-soft)] p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <p className="mt-2 text-[1.0625rem] font-semibold text-ink">{state.decision === "accepted" ? "Thank you — your acceptance is recorded." : "Thanks for letting us know."}</p>
        <p className="mt-1 text-[0.875rem] text-ink-muted">
          {state.decision === "accepted"
            ? needsApproval ? `${businessName} will confirm your booking shortly.` : `${businessName} has been notified and will be in touch with the next steps.`
            : `${businessName} has been notified.`}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--portal-brand-line)] bg-[var(--portal-brand-soft)] p-5 sm:p-6 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.0625rem] font-semibold text-ink">{mode === "accept" ? "Accept this quote" : "Decline this quote"}</h2>
        <div className="grid w-full grid-cols-2 rounded-lg bg-surface p-0.5 ring-1 ring-inset ring-line sm:flex sm:w-auto" role="radiogroup" aria-label="Your response">
          {(["accept", "decline"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
              className={cn("h-10 rounded-md px-4 text-[0.875rem] font-medium sm:h-8 sm:text-[0.8125rem]", mode === m ? "bg-ink text-surface" : "text-ink-muted hover:text-ink")}>
              {m === "accept" ? "Accept" : "Decline"}
            </button>
          ))}
        </div>
      </div>
      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="decision" value={mode === "accept" ? "accepted" : "declined"} />
        {mode === "accept" ? (
          <>
            <p className="text-[0.875rem] text-ink-muted">
              You&apos;re accepting version {versionNumber} for <strong className="text-ink">{total}</strong>. We record your name, the date and time,
              and your connection details as a record of your acceptance.
            </p>
            {needsApproval && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-200">
                <strong>Your booking isn&apos;t confirmed until {businessName} confirms it</strong> — they may need to check staff and equipment first.
              </p>
            )}
            <div>
              <Label htmlFor="accept-name">Your full name</Label>
              <Input id="accept-name" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} required className="bg-surface text-base sm:text-[0.875rem]" />
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-[0.875rem] text-ink">
              <input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong accent-[var(--portal-brand)]" />
              <span>I accept this quote and the terms from {businessName}.</span>
            </label>
            <FormError message={state?.error} />
            <button className={btn(true)} disabled={pending || !agree || name.trim().length < 2}>{pending ? "Recording your acceptance…" : "Accept quote"}</button>
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="decline-reason" hint="Optional">Let us know why</Label>
              <Textarea id="decline-reason" name="reason" maxLength={1000} placeholder="e.g. Our plans have changed" className="bg-surface text-base sm:text-[0.875rem]" />
            </div>
            <input type="hidden" name="name" value={name} />
            <FormError message={state?.error} />
            <button className={btn(false)} disabled={pending}>{pending ? "Sending…" : "Decline quote"}</button>
          </>
        )}
      </form>
    </div>
  );
}
