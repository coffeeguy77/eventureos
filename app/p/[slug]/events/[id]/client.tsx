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
/* Section tabs: keeps the active tab scrolled into view on phones     */
/* ------------------------------------------------------------------ */

export function PortalTabsNav({ className, label, children }: { className?: string; label: string; children: React.ReactNode }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const box = nav.current;
    const el = box?.querySelector<HTMLElement>("[aria-current=page]");
    if (!box || !el || box.scrollWidth <= box.clientWidth) return;
    const left = el.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    if (left < box.scrollLeft || left + el.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollLeft = Math.max(0, left - (box.clientWidth - el.offsetWidth) / 2);
    }
  });
  return <nav ref={nav} className={className} aria-label={label}>{children}</nav>;
}

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
        <h3 className="text-[16px] font-semibold text-ink sm:text-[15px]">{mode === "accept" ? "Accept this quote" : "Decline this quote"}</h3>
        <div className="grid w-full grid-cols-2 rounded-lg bg-white p-0.5 ring-1 ring-inset ring-line sm:flex sm:w-auto" role="radiogroup" aria-label="Your response">
          {(["accept", "decline"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn("h-10 rounded-md px-3 text-[14px] font-medium sm:h-auto sm:py-1 sm:text-[12.5px]", mode === m ? "bg-ink text-white" : "text-ink-muted hover:text-ink")}
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
            <label className="flex cursor-pointer items-start gap-3 py-1 text-[14px] text-ink sm:gap-2.5 sm:py-0 sm:text-[13px]">
              <input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong accent-[var(--portal-brand)] sm:h-4 sm:w-4" />
              <span>I accept the quote and terms from {businessName}.</span>
            </label>
            <FormError message={state?.error} />
            <button className={portalButton("primary", "h-12 w-full text-[15px] sm:h-10 sm:w-auto sm:text-[13.5px]")} disabled={pending || !agree || name.trim().length < 2}>
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
            <button className={portalButton("secondary", "h-12 w-full text-[15px] sm:h-10 sm:w-auto sm:text-[13.5px]")} disabled={pending}>
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
      <Textarea id="message-body" name="body" required maxLength={5000} rows={3} enterKeyHint="send" placeholder={placeholder ?? "Type your message…"}
        onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.form?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 300); }} />
      <FormError message={state?.error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-center text-[12px] text-ink-faint sm:text-left">{state?.ok ? "Sent — we'll reply here." : "We'll reply here in your portal."}</p>
        <button className={portalButton("primary", "h-12 w-full text-[15px] sm:h-10 sm:w-auto sm:text-[13.5px]")} disabled={pending}>{pending ? "Sending…" : "Send message"}</button>
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

export function UploadButton({ slug, eventId, orgId, customerId, requestId, requestName, label = "Upload", fullOnMobile = false }: {
  slug: string; eventId: string; orgId: string; customerId: string; requestId: string | null; requestName?: string; label?: string;
  /** Stretch to the full row width on phones (for list rows). */
  fullOnMobile?: boolean;
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
    <div className={cn("flex flex-col items-end gap-1.5", fullOnMobile && "w-full items-stretch sm:w-auto sm:items-end")}>
      <input ref={input} type="file" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label={label} />
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className={portalButton(requestId ? "primary" : "secondary", fullOnMobile ? "h-11 w-full text-[14px] sm:h-9 sm:w-auto sm:text-[13px]" : "h-10 text-[13px] sm:h-9")}>
        <Upload className="h-4 w-4" />{busy ? "Uploading…" : label}
      </button>
      {error && <p role="alert" className={cn("max-w-xs text-right text-[12px] text-rose-700", fullOnMobile && "max-w-none text-left sm:max-w-xs sm:text-right")}>{error}</p>}
    </div>
  );
}
