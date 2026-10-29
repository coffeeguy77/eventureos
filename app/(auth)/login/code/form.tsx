"use client";

import { useActionState } from "react";
import { loginWithCode, type CodeState } from "../../actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";

export function CodeForm() {
  const [s, action, pending] = useActionState(loginWithCode, { step: "email" } as CodeState);
  return (
    <form action={action} className="mt-5 space-y-4 lg:mt-8">
      {s.step === "email" ? (
        <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" placeholder="Email" defaultValue={s.email} required autoFocus /></div>
      ) : (
        <>
          <input type="hidden" name="email" value={s.email} />
          {s.message && <p className="text-[0.8125rem] text-ink-muted">{s.message}</p>}
          <div><Label htmlFor="code">Code from the email</Label><Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Code from the email" required autoFocus /></div>
        </>
      )}
      <FormError message={s.error} />
      {s.step === "email"
        ? <Button variant="primary" name="intent" value="send" className="h-11 w-full sm:h-9" disabled={pending}>{pending ? "Sending…" : "Email me a sign-in code"}</Button>
        : <div className="space-y-2">
            <Button variant="primary" name="intent" value="verify" className="h-11 w-full sm:h-9" disabled={pending}>{pending ? "Checking…" : "Sign in"}</Button>
            <Button variant="ghost" name="intent" value="resend" formNoValidate className="h-11 w-full sm:h-9" disabled={pending}>Send a new code</Button>
          </div>}
    </form>
  );
}
