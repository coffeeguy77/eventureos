"use client";

import { useActionState } from "react";
import { signUp } from "../actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, undefined);
  if (state?.message) {
    return <p className="mt-8 rounded-lg bg-brand-50 px-4 py-3 text-[13.5px] text-brand-800 ring-1 ring-inset ring-brand-100">{state.message}</p>;
  }
  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <Label htmlFor="full_name">Your name</Label>
        <Input id="full_name" name="full_name" autoComplete="name" required autoFocus />
      </div>
      <div>
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password" hint="8+ characters">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <FormError message={state?.error} />
      <Button variant="primary" className="w-full" disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button>
    </form>
  );
}
