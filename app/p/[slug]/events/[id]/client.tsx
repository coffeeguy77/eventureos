"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FormError, Input, Label, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { recordPortalUpload, respondToQuote, sendPortalMessage, type ActionResult } from "../../actions";
import { portalButton } from "../../ui";

/* ------------------------------------------------------------------ */
/* Accept / decline a quote                                            */
/* ------------------------------------------------------------------ */

export function QuoteResponse({ slug, eventId, versionId, versionNumber, total, defaultName, businessName }: {
  slug: string; eventId: string; versionId: string; versionNumber: number; total: string; defaultName: string; businessName: string;
}) {
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(respondToQuote, undefined);
  const [name, setName] = useState(defaultName);
  const [agree, setAgree] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--portal-brand-line)] bg-[var(--portal-brand-soft)] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">{mode === "accept" ? "Accept this quote" : "Decline this quote"}</h3>
        <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-inset ring-line">
          {(["accept", "decline"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn("rounded-md px-3 py-1 text-[12.5px] font-medium", mode === m ? "bg-ink text-white" : "text-ink-muted hover:text-ink")}
            >
              {m === "accept" ? "Accept" : "Decline"}
            </button>
          ))}
        </div>
      </div>

      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="version_id" value={versionId} />
        <input type="hidden" name="decision" value={mode === "accept" ? "accepted" : "declined"} />

        {mode === "accept" ? (
          <>
            <p className="text-[13px] text-ink-muted">
              You&apos;re accepting version {versionNumber} for <strong className="text-ink">{total}</strong>. We&apos;ll record your name,
              the date and time, and your connection details as a record of your acceptance.
            </p>
            <div>
              <Label htmlFor="accept-name">Your full name</Label>
              <Input id="accept-name" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} required className="bg-white" />
            </div>
            <label className="flex items-start gap-2.5 text-[13px] text-ink">
              <input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line-strong accent-[var(--portal-brand)]" />
              <span>I accept the quote and terms from {businessName}.</span>
            </label>
            <FormError message={state?.error} />
            <button className={portalButton("primary", "w-full sm:w-auto")} disabled={pending || !agree || name.trim().length < 2}>
              {pending ? "Recording your acceptance…" : "Accept quote"}
            </button>
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="decline-reason" hint="Optional">Let us know why</Label>
              <Textarea id="decline-reason" name="reason" maxLength={1000} placeholder="e.g. Our plans have changed, or the budget doesn't work for us" className="bg-white" />
            </div>
            <input type="hidden" name="name" value={name} />
            <FormError message={state?.error} />
            <button className={portalButton("secondary", "w-full sm:w-auto")} disabled={pending}>
              {pending ? "Sending…" : "Decline quote"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

export function MessageForm({ slug, eventId, placeholder }: { slug: string; eventId: string; placeholder?: string }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(sendPortalMessage, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="event_id" value={eventId} />
      <Label htmlFor="message-body">Ask a question or send a message</Label>
      <Textarea id="message-body" name="body" required maxLength={5000} placeholder={placeholder ?? "Type your message…"} />
      <FormError message={state?.error} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-ink-faint">{state?.ok ? "Sent — we'll reply here." : "We'll reply here in your portal."}</p>
        <button className={portalButton("primary")} disabled={pending}>{pending ? "Sending…" : "Send message"}</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Upload a requested document                                         */
/* ------------------------------------------------------------------ */

const MAX_BYTES = 25 * 1024 * 1024;

function safeFileName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(-120);
  return cleaned || "file";
}

export function UploadButton({ slug, eventId, orgId, customerId, requestId, requestName, label = "Upload" }: {
  slug: string; eventId: string; orgId: string; customerId: string; requestId: string | null; requestName?: string; label?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) { setError("That file is over 25 MB. Please send a smaller file."); return; }
    if (file.size === 0) { setError("That file is empty."); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const path = `${orgId}/portal/${customerId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      const res = await recordPortalUpload({
        slug, eventId, requestId,
        name: requestName ? `${requestName} — ${file.name}`.slice(0, 200) : file.name,
        path, mime: file.type || null, size: file.size,
      });
      if (res.error) throw new Error(res.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed — please try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <input ref={input} type="file" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label={label} />
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className={portalButton(requestId ? "primary" : "secondary", "h-9 text-[13px]")}>
        <Upload className="h-4 w-4" />{busy ? "Uploading…" : label}
      </button>
      {error && <p role="alert" className="max-w-xs text-right text-[12px] text-rose-700">{error}</p>}
    </div>
  );
}
