"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Download, Loader2, PackageCheck, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importOrderEmailsNow, setOrderStatus, setRunStatus } from "@/app/(app)/wholesale/actions";
import { cn } from "@/lib/cn";

/** Print, read new order emails, and mark the whole run packed / delivered. */
export function RunActions({ run, canImport, open }: { run: string; canImport: boolean; open: { placed: number; packed: number } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const go = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, ok: (d: unknown) => string) => start(async () => {
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    setNote(r.ok ? { ok: true, text: ok((r as { data?: unknown }).data) } : { ok: false, text: (r as { error?: string }).error ?? "Something went wrong." });
    router.refresh();
  });
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {canImport && (
        <Button size="sm" disabled={pending} onClick={() => go(importOrderEmailsNow, (d) => String(d))} title="Read new Ordermentum order emails from Gmail now (it also happens every 10 minutes)">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Check for new orders
        </Button>
      )}
      {open.placed > 0 && (
        <Button size="sm" disabled={pending} onClick={() => go(() => setRunStatus(run, "packed"), (n) => `${n} order${n === 1 ? "" : "s"} marked packed.`)}><PackageCheck className="h-4 w-4" />Mark all packed</Button>
      )}
      {open.placed + open.packed > 0 && (
        <Button size="sm" disabled={pending} onClick={() => go(() => setRunStatus(run, "delivered"), (n) => `${n} order${n === 1 ? "" : "s"} marked delivered.`)}><CheckCheck className="h-4 w-4" />Mark all delivered</Button>
      )}
      <Button size="sm" variant="primary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
      {note && <span className={cn("text-[0.75rem]", note.ok ? "text-emerald-700" : "text-rose-700")}>{note.text}</span>}
    </div>
  );
}

const NEXT: Record<string, { to: "packed" | "delivered" | "placed"; label: string }[]> = {
  placed: [{ to: "packed", label: "Packed" }, { to: "delivered", label: "Delivered" }],
  packed: [{ to: "delivered", label: "Delivered" }, { to: "placed", label: "Not packed" }],
  delivered: [{ to: "placed", label: "Undo" }],
};

export function OrderStatusButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-1 print:hidden">
      {(NEXT[status] ?? []).map((n) => (
        <button key={n.to} type="button" disabled={pending} onClick={() => start(async () => { const r = await setOrderStatus(id, n.to); if (!r.ok) setErr(r.error); router.refresh(); })}
          className="rounded-md px-2 py-1 text-[0.75rem] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50">{n.label}</button>
      ))}
      {err && <span className="text-[0.7188rem] text-rose-700">{err}</span>}
    </span>
  );
}
