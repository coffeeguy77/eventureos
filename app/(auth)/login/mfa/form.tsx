"use client";

import { useActionState } from "react";
import { verifyMfaLogin } from "../../actions";
import { signOut } from "@/app/(app)/shell-actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";

export function MfaForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifyMfaLogin, undefined);
  return (
    <>
      <form action={action} className="mt-5 space-y-4 lg:mt-8">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="code">Code</Label>
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} placeholder="123456" required autoFocus className="text-center font-mono text-[1.125rem] tracking-[0.3em]" />
        </div>
        <FormError message={state?.error} />
        <Button variant="primary" className="h-11 w-full sm:h-9" disabled={pending}>{pending ? "Checking…" : "Continue"}</Button>
      </form>
      <p className="mt-4 text-[0.8125rem] text-ink-muted">Lost your phone? Ask the owner of your business to turn off two-step sign-in for you (Settings → Team), then sign in and set it up again.</p>
      <form action={signOut} className="mt-3"><button className="text-[0.8125rem] font-medium text-brand-600 hover:text-brand-700">Sign out</button></form>
    </>
  );
}
