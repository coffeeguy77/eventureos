"use client";
import { useActionState, useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeRedbarkKeyAction, saveRedbarkKeyAction, type ActionState } from "./actions";

/** Paste / replace / remove the business's Redbark API key (bank feeds). Never shown again after saving. */
export function RedbarkKeyForm({ hasKey }: { hasKey: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveRedbarkKeyAction, undefined);
  const [open, setOpen] = useState(!hasKey);
  const [removing, start] = useTransition();
  const [removed, setRemoved] = useState<ActionState>(undefined);
  const msg = removed ?? state;
  return (
    <div className="space-y-2">
      {open ? (
        <form action={action} className="space-y-2">
          <label htmlFor="rb-key" className="block text-[0.7812rem] font-medium text-ink">Redbark API key</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="rb-key" name="key" type="password" autoComplete="off" spellCheck={false} placeholder="rbk_live_…" required
              className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 font-mono text-base text-ink sm:text-[0.8125rem]" />
            <Button type="submit" variant="primary" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Save</Button>
          </div>
          <p className="text-[0.75rem] text-ink-faint">Redbark → Settings → API &amp; MCP. It&apos;s checked with Redbark, stored where no browser can read it, and never shown again.</p>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>Replace key</Button>
          <Button size="sm" variant="ghost" disabled={removing} onClick={() => start(async () => { setRemoved(await removeRedbarkKeyAction()); })}>Remove</Button>
        </div>
      )}
      {msg?.error && <p className="text-[0.75rem] text-rose-600" role="alert">{msg.error}</p>}
      {msg?.ok && <p className="text-[0.75rem] text-emerald-700" role="status">{msg.ok}</p>}
    </div>
  );
}
