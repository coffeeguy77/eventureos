"use client";

import { useCallback, useState, useTransition } from "react";
import { Check, CircleAlert, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendSignatureTest } from "@/app/(app)/signature-actions";
import type { SignatureDesign, SignaturePerson } from "@/lib/signatures/render";
import { PersonForm } from "./person-form";
import { GmailExport } from "./gmail-export";
import { DEFAULT_PREVIEW, SignaturePreview, previewVariant, type PreviewOptions } from "./preview";
import { cn } from "@/lib/cn";

/** A person's own page: their details, a live preview, a test email, and Copy for Gmail. */
export function MySignature({ orgId, userId, design, published, version, stored, person, fallback, canEditLocked }: {
  orgId: string; userId: string; design: SignatureDesign; published: boolean; version: number | null;
  stored: SignaturePerson | null; person: SignaturePerson; fallback: SignaturePerson; canEditLocked: boolean;
}) {
  const [live, setLive] = useState<SignaturePerson>(person);
  const onPreview = useCallback((p: SignaturePerson) => setLive(p), []);
  const [opts, setOpts] = useState<PreviewOptions>(DEFAULT_PREVIEW);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function test() {
    setFlash(null);
    start(async () => {
      const r = await sendSignatureTest({ useDraft: false, variant: previewVariant(design, opts.kind) });
      setFlash(r.ok ? { ok: true, text: `Test ${r.message?.toLowerCase()}` } : { ok: false, text: r.error });
    });
  }

  return (
    <div className="space-y-6">
      {!published && (
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-200">
          The company signature hasn&apos;t been published yet, so this is a preview of the draft. You can fill in your details now — they&apos;ll be used as soon as it goes live.
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
          <h2 className="text-[0.9375rem] font-semibold text-ink">Your details</h2>
          <p className="mb-4 mt-0.5 text-[0.8125rem] text-ink-muted">Leave a box empty to use what&apos;s on your account.</p>
          <PersonForm orgId={orgId} userId={userId} stored={stored} fallback={fallback} locked={design.locked} canEditLocked={canEditLocked}
            onPreview={onPreview} showPhoto={design.layout === "photo" || design.show.photo} />
        </section>
        <section className="min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5 xl:sticky xl:top-20 xl:self-start">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[0.9375rem] font-semibold text-ink">Preview</h2>
            {published && <Button type="button" size="sm" onClick={test} disabled={pending}><Send className="h-3.5 w-3.5" />{pending ? "Sending…" : "Email me a test"}</Button>}
          </div>
          <SignaturePreview design={design} person={live} options={opts} onOptions={setOpts} compactToolbar />
          {flash && (
            <p role="status" className={cn("mt-3 inline-flex items-center gap-1.5 text-[0.8125rem]", flash.ok ? "text-emerald-700" : "text-rose-700")}>
              {flash.ok ? <Check className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}{flash.text}
            </p>
          )}
          <p className="mt-3 text-[0.75rem] text-ink-muted">
            {design.reply.mode === "smart" ? "Replies you send from EventureOS get the full signature on your first email in a conversation, and the short one after that."
              : design.reply.mode === "full" ? "Replies you send from EventureOS always get the full signature." : "Replies you send from EventureOS get the short signature."}
          </p>
        </section>
      </div>
      <section className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">Use it in Gmail</h2>
        <p className="mb-4 mt-0.5 text-[0.8125rem] text-ink-muted">For emails you write in Gmail itself. Save your details first — this uses what&apos;s saved.</p>
        {published ? <GmailExport design={design} person={person} version={version} />
          : <p className="text-[0.8125rem] text-ink-muted">Available once the company signature is published.</p>}
      </section>
    </div>
  );
}
