"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input, Label, FormError } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { addConnection, removeConnection } from "@/app/(app)/marketing/actions";

export function AddClientForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add a client
      </Button>
    );
  }
  return (
    <form
      className="grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      action={(fd) => start(async () => {
        setError(null);
        const res = await addConnection(fd);
        if (res.ok) setOpen(false);
        else setError(res.error);
      })}
    >
      <div>
        <Label htmlFor="label">Client name</Label>
        <Input id="label" name="label" placeholder="Navy Uniforms" required />
      </div>
      <div>
        <Label htmlFor="property" hint="GA4 → Admin → Property details">GA4 Property ID</Label>
        <Input id="property" name="property" inputMode="numeric" placeholder="393878887" required />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
        <Button type="button" variant="ghost" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
      </div>
      {error && <div className="sm:col-span-3"><FormError message={error} /></div>}
    </form>
  );
}

export function RemoveClient({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      title={`Remove ${label}`}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.75rem] font-medium text-ink-faint hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Remove ${label} from your reporting list? This doesn't change their Google Analytics.`)) return;
        start(async () => { await removeConnection(id); });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" /> Remove
    </button>
  );
}
