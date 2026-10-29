"use client";

import { useActionState } from "react";
import { setOwnPassword } from "../../actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";

export function NewPasswordForm() {
  const [s, action, pending] = useActionState(setOwnPassword, undefined);
  return (
    <form action={action} className="mt-5 space-y-4 lg:mt-8">
      <div><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" autoComplete="new-password" placeholder="New password (8+ characters)" minLength={8} required autoFocus /></div>
      <div><Label htmlFor="again">Type it again</Label><Input id="again" name="again" type="password" autoComplete="new-password" placeholder="Type it again" minLength={8} required /></div>
      <FormError message={s?.error} />
      <Button variant="primary" className="h-11 w-full sm:h-9" disabled={pending}>{pending ? "Saving…" : "Save my new password"}</Button>
    </form>
  );
}
