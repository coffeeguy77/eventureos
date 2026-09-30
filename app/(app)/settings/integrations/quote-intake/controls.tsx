"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";
import { CopyField } from "../stripe/copy-field";
import { createIntakeConnection, revokeIntakeConnection, type KeyState } from "./actions";

export function NewConnection() {
  const [state, action, pending] = useActionState<KeyState, FormData>(createIntakeConnection, undefined);
  if (state?.key) {
    return (
      <div className="space-y-3 rounded-xl bg-amber-50/70 p-4 ring-1 ring-inset ring-amber-200">
        <p className="flex items-start gap-2 text-[0.8125rem] font-medium text-amber-900"><KeyRound className="mt-0.5 h-4 w-4 shrink-0" />Key for “{state.label}” — copy it now. It won&apos;t be shown again.</p>
        <CopyField value={state.key} label="Copy key" />
        <p className="text-[0.75rem] text-amber-900/80">Paste it into your quote form&apos;s server settings (never into a web page). If it&apos;s lost, revoke this connection and make a new one.</p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <Label htmlFor="intake-label">Name this connection</Label>
        <Input id="intake-label" name="label" placeholder="e.g. Bean Culture online quote" maxLength={80} />
      </div>
      <input type="hidden" name="provider" value="leadpages" />
      <Button type="submit" variant="primary" disabled={pending}>{pending ? "Creating…" : "Create connection key"}</Button>
      {state?.error && <div className="sm:basis-full"><FormError message={state.error} /></div>}
    </form>
  );
}

/** Two-step revoke (no browser confirm dialog). */
export function RevokeButton({ id, label }: { id: string; label: string }) {
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!ask) return <Button size="sm" variant="ghost" onClick={() => setAsk(true)}>Revoke</Button>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-[0.75rem]">
      <span className="flex items-center gap-1 text-rose-800"><TriangleAlert className="h-3.5 w-3.5" />Stop accepting quotes from “{label}”?</span>
      <Button size="sm" variant="danger" disabled={pending} onClick={() => start(async () => { const r = await revokeIntakeConnection(id); if (r.error) setErr(r.error); })}>{pending ? "Revoking…" : "Yes, revoke"}</Button>
      <Button size="sm" variant="ghost" onClick={() => setAsk(false)}>Cancel</Button>
      {err && <span className="basis-full text-rose-700">{err}</span>}
    </span>
  );
}
