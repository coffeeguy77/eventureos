"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormError, Label, Textarea } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { saveLoanSettings, startCreditGuideUpload } from "@/app/(app)/loans/actions";

export function LoanSettingsForm({ canEdit, privacy, placeholder, guide }: { canEdit: boolean; privacy: string; placeholder: string; guide: { name: string; at: string | null } | null }) {
  const router = useRouter();
  const [text, setText] = useState(privacy);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const upload = (file: File | undefined) => file && start(async () => {
    setErr(null);
    const s = await startCreditGuideUpload(file.name, file.size);
    if (!s.ok) { setErr(s.error); return; }
    const { error } = await createClient().storage.from("loan-docs").uploadToSignedUrl(s.data.path, s.data.token, file, { contentType: "application/pdf" });
    if (error) { setErr(`Upload failed: ${error.message}`); return; }
    const r = await saveLoanSettings({ credit_guide: { path: s.data.path, name: file.name } });
    if (!r.ok) { setErr(r.error); return; }
    router.refresh();
  });
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-[1rem] font-semibold text-ink">Credit Guide</h2>
        <p className="mt-0.5 text-[0.8125rem] text-ink-muted">Clients open it from their form and tick that they&apos;ve received and read it. Without one, that tick isn&apos;t asked.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {guide ? <span className="inline-flex items-center gap-2 text-[0.875rem] text-ink"><FileText className="h-4 w-4 text-ink-faint" />{guide.name}</span> : <span className="text-[0.875rem] text-ink-faint">None uploaded</span>}
          {canEdit && (
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-[0.875rem] font-medium text-ink ring-1 ring-inset ring-line hover:bg-canvas">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{guide ? "Replace PDF" : "Upload PDF"}
              <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          )}
          {canEdit && guide && <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await saveLoanSettings({ credit_guide: null }); if (!r.ok) setErr(r.error); else router.refresh(); })}>Remove</Button>}
        </div>
      </Card>
      <Card className="p-5">
        <Label htmlFor="ls-privacy" hint="leave blank for the standard wording">Privacy statement</Label>
        <Textarea id="ls-privacy" rows={7} value={text} disabled={!canEdit} placeholder={placeholder} onChange={(e) => { setText(e.target.value); setSaved(false); }} />
        <p className="mt-1 text-[0.75rem] text-ink-muted">Shown above the consent ticks: privacy, Credit Guide, credit checks, best interests, and that the information is true.</p>
        {canEdit && <Button className="mt-3" variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveLoanSettings({ privacy: text }); if (!r.ok) setErr(r.error); else setSaved(true); })}>{saved ? <Check className="h-4 w-4" /> : null}Save</Button>}
      </Card>
      <FormError message={err} />
    </div>
  );
}
