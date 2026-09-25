"use client";

import { useActionState } from "react";
import { portalSignIn, type SignInState } from "../actions";
import { FormError, Input, Label } from "@/components/ui/form";
import { portalButton } from "../ui";

export function PortalSignInForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(portalSignIn, { step: "email" });

  if (state.step === "code" && state.email) {
    return (
      <div className="space-y-4">
        {state.message && (
          <p className="rounded-lg bg-[var(--portal-brand-soft)] px-3 py-2.5 text-[13px] text-ink ring-1 ring-inset ring-[var(--portal-brand-line)]">
            {state.message} It can take a minute to arrive — check your spam folder too.
          </p>
        )}
        <form action={action} className="space-y-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="email" value={state.email} />
          <input type="hidden" name="intent" value="verify" />
          <div>
            <Label htmlFor="code">Sign-in code</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,12}"
              maxLength={12}
              placeholder="123456"
              required
              autoFocus
              className="h-12 text-center font-mono text-[20px] tracking-[0.4em]"
            />
          </div>
          <FormError message={state.error} />
          <button className={portalButton("primary", "w-full")} disabled={pending}>
            {pending ? "Checking…" : "Sign in"}
          </button>
        </form>
        <div className="flex items-center justify-between text-[12.5px]">
          <form action={action}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="intent" value="restart" />
            <button className="text-ink-muted hover:text-ink" disabled={pending}>Use a different email</button>
          </form>
          <form action={action}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="email" value={state.email} />
            <input type="hidden" name="intent" value="resend" />
            <button className="font-medium text-[color:var(--portal-brand-ink)] hover:underline" disabled={pending}>Send a new code</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="intent" value="send" />
      <div>
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} required autoFocus />
      </div>
      <FormError message={state.error} />
      <button className={portalButton("primary", "w-full")} disabled={pending}>
        {pending ? "Sending code…" : "Email me a sign-in code"}
      </button>
    </form>
  );
}
