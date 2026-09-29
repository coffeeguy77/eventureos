"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ImageUp, Lock, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { saveSignatureProfile } from "@/app/(app)/signature-actions";
import type { PersonField, SignaturePerson } from "@/lib/signatures/render";
import { cn } from "@/lib/cn";

type Values = Record<PersonField, string>;
const FIELDS: { id: PersonField; label: string; placeholder?: string; type?: string; hint?: string; wide?: boolean }[] = [
  { id: "display_name", label: "Name" },
  { id: "pronouns", label: "Pronouns", placeholder: "e.g. she/her", hint: "Optional" },
  { id: "title", label: "Job title", placeholder: "e.g. Events Manager" },
  { id: "email", label: "Email", type: "email" },
  { id: "phone", label: "Direct phone", type: "tel", hint: "Blank = main number" },
  { id: "mobile", label: "Mobile", type: "tel", hint: "Optional" },
  { id: "booking_url", label: "Personal booking link", placeholder: "e.g. calendly.com/you", hint: "Used by the booking button", wide: true },
  { id: "extra_line", label: "Personal line", placeholder: "e.g. In the office Mon–Thu", hint: "Optional", wide: true },
];

const toValues = (p: SignaturePerson | null): Values =>
  Object.fromEntries(["display_name", "pronouns", "title", "phone", "mobile", "email", "photo_url", "extra_line", "booking_url"].map((k) => [k, (p?.[k as PersonField] as string | null) ?? ""])) as Values;

/** Crop to a centred square and scale to 256px — photos stay small and never distort in email. */
async function squarePhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 256);
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't process that image"))), "image/jpeg", 0.88));
}

/**
 * A person's own signature details. Blank fields fall back to their account (name, email) and team title,
 * shown as placeholders. Locked fields are read-only unless `canEditLocked`.
 */
export function PersonForm({ orgId, userId, stored, fallback, locked, canEditLocked, onPreview, onSaved, showPhoto }: {
  orgId: string; userId: string; stored: SignaturePerson | null; fallback: SignaturePerson;
  locked: Partial<Record<PersonField, boolean>>; canEditLocked: boolean;
  onPreview?: (p: SignaturePerson) => void; onSaved?: () => void; showPhoto: boolean;
}) {
  const [v, setV] = useState<Values>(() => toValues(stored));
  const [saved, setSaved] = useState<Values>(() => toValues(stored));
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  useEffect(() => { const s = toValues(stored); setV(s); setSaved(s); }, [stored, userId]);
  useEffect(() => {
    onPreview?.({
      ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])),
      display_name: v.display_name.trim() || fallback.display_name || null,
      title: v.title.trim() || fallback.title || null,
      email: v.email.trim() || fallback.email || null,
    });
  }, [v, fallback, onPreview]);

  const isLocked = (f: PersonField) => !canEditLocked && Boolean(locked[f]);

  function save(next = v) {
    setErr(null); setOk(false);
    start(async () => {
      const payload = Object.fromEntries(Object.entries(next).filter(([k]) => !isLocked(k as PersonField)).map(([k, x]) => [k, x.trim() || null]));
      const r = await saveSignatureProfile(userId, payload);
      if (!r.ok) return setErr(r.error);
      setSaved(next); setOk(true); onSaved?.();
      setTimeout(() => setOk(false), 2500);
    });
  }

  async function upload(f: File) {
    setErr(null);
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return setErr("Use a PNG, JPG, WebP or GIF image.");
    if (f.size > 10 * 1024 * 1024) return setErr("That image is over 10 MB.");
    setUploading(true);
    try {
      const blob = await squarePhoto(f);
      const path = `${orgId}/people/${userId}/photo-${Date.now()}.jpg`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("branding").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      const url = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
      const next = { ...v, photo_url: url };
      setV(next); save(next);
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); if (file.current) file.current.value = ""; }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
      {showPhoto && (
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-100 ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {v.photo_url ? <img src={v.photo_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-7 w-7 text-ink-faint" />}
          </span>
          <div className="flex flex-wrap gap-2">
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <Button type="button" size="sm" onClick={() => file.current?.click()} disabled={uploading || pending}><ImageUp className="h-3.5 w-3.5" />{uploading ? "Uploading…" : v.photo_url ? "Replace photo" : "Upload photo"}</Button>
            {v.photo_url && <Button type="button" size="sm" variant="ghost" onClick={() => { const next = { ...v, photo_url: "" }; setV(next); save(next); }} disabled={pending}><Trash2 className="h-3.5 w-3.5" />Remove</Button>}
            <p className="w-full text-[0.75rem] text-ink-muted">A clear head-and-shoulders shot. We crop it square and keep it small.</p>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => {
          const lockedHere = isLocked(f.id);
          const fb = f.id === "display_name" ? fallback.display_name : f.id === "title" ? fallback.title : f.id === "email" ? fallback.email : null;
          return (
            <div key={f.id} className={cn(f.wide && "sm:col-span-2")}>
              <Label htmlFor={`sig-${userId}-${f.id}`} hint={lockedHere ? undefined : f.hint}>
                <span className="inline-flex items-center gap-1.5">{f.label}{lockedHere && <span className="inline-flex items-center gap-1 text-[0.6875rem] font-normal text-ink-faint"><Lock className="h-3 w-3" />Set by your admin</span>}</span>
              </Label>
              <Input id={`sig-${userId}-${f.id}`} type={f.type ?? "text"} value={v[f.id]} disabled={lockedHere}
                placeholder={fb ?? f.placeholder ?? ""} autoComplete="off"
                onChange={(e) => setV((x) => ({ ...x, [f.id]: e.target.value }))}
                className={cn("text-base sm:text-[0.8438rem]", lockedHere && "bg-zinc-50 text-ink-muted")} />
            </div>
          );
        })}
      </div>
      <FormError message={err} />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending || !dirty}>{pending ? "Saving…" : "Save details"}</Button>
        {ok && <span className="inline-flex items-center gap-1 text-[0.8125rem] text-emerald-700"><Check className="h-4 w-4" />Saved</span>}
        {dirty && !pending && <span className="text-[0.75rem] text-ink-muted">Unsaved changes</span>}
      </div>
    </form>
  );
}
