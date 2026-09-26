"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { ActionForm, SubmitButton } from "../forms";
import { removeLogo, saveBrandColour, saveLogo } from "../actions";

export interface BrandingOrg {
  id: string;
  name: string;
  logoUrl: string | null;
  brandColour: string;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  address: string | null;
}

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

// ---- colour maths (WCAG 2.x) ----
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const validHex = (h: string) => /^#[0-9a-fA-F]{6}$/.test(h);

export function BrandingEditor({ org, canEdit }: { org: BrandingOrg; canEdit: boolean }) {
  const [colour, setColour] = useState(org.brandColour.toUpperCase());
  const shown = validHex(colour) ? colour : org.brandColour;
  const onBrand = contrast("#FFFFFF", shown) >= contrast("#16151D", shown) ? "#FFFFFF" : "#16151D";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        <section>
          <h4 className="text-[13px] font-semibold text-ink">Logo</h4>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">PNG, JPG, WebP or GIF up to 2 MB. A wide logo on a transparent background works best.</p>
          <div className="mt-3">
            <LogoUploader org={org} canEdit={canEdit} />
          </div>
        </section>

        <section>
          <h4 className="text-[13px] font-semibold text-ink">Brand colour</h4>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">Used for buttons and headings in the customer portal and on quotes.</p>
          {canEdit ? (
            <ActionForm action={saveBrandColour} className="mt-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="brand_colour_picker">Colour</Label>
                  <input
                    id="brand_colour_picker"
                    type="color"
                    value={shown}
                    onChange={(e) => setColour(e.target.value.toUpperCase())}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-line-strong bg-white p-1 sm:h-9"
                  />
                </div>
                <div className="min-w-0 flex-1 sm:w-32 sm:flex-none">
                  <Label htmlFor="brand_colour">Hex</Label>
                  <Input id="brand_colour" name="brand_colour" value={colour} maxLength={7}
                    onChange={(e) => setColour(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
                    className="font-mono uppercase" />
                </div>
                <SubmitButton pendingLabel="Saving…" className="w-full sm:w-auto">Save colour</SubmitButton>
              </div>
              <ContrastCheck colour={shown} />
            </ActionForm>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-ink">
              <span className="h-6 w-6 rounded-md ring-1 ring-inset ring-black/10" style={{ background: shown }} />
              <span className="font-mono">{shown}</span>
            </div>
          )}
        </section>

        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-[12.5px] text-ink-muted ring-1 ring-inset ring-line">
          Business name and contact details come from <a href="/settings" className="font-medium text-brand-600 hover:text-brand-700">Organisation</a> settings.
        </p>
      </div>

      <div className="space-y-4">
        <PortalPreview org={org} colour={shown} onBrand={onBrand} />
        <QuotePreview org={org} colour={shown} />
      </div>
    </div>
  );
}

function ContrastCheck({ colour }: { colour: string }) {
  const white = contrast("#FFFFFF", colour);
  const onWhite = contrast(colour, "#FFFFFF");
  const rows = [
    { label: "White text on your colour (buttons, header)", ratio: white },
    { label: "Your colour as text on white (links, headings)", ratio: onWhite },
  ];
  return (
    <div className="mt-4 space-y-1.5">
      {rows.map((r) => {
        const level = r.ratio >= 7 ? "AAA" : r.ratio >= 4.5 ? "AA" : r.ratio >= 3 ? "Large text only" : "Fails";
        const good = r.ratio >= 4.5;
        return (
          <div key={r.label} className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="text-ink-muted">{r.label}</span>
            <span className={cn("tabular shrink-0 font-medium", good ? "text-emerald-700" : r.ratio >= 3 ? "text-amber-700" : "text-rose-700")}>
              {r.ratio.toFixed(2)}:1 · {level}
            </span>
          </div>
        );
      })}
      {white < 4.5 && (
        <p className="text-[12px] text-amber-800">
          White text is hard to read on this colour. The portal will use dark text on buttons instead — or pick a deeper shade.
        </p>
      )}
    </div>
  );
}

function LogoMark({ org, size = 36 }: { org: BrandingOrg; size?: number }) {
  if (org.logoUrl) {
    return <img src={org.logoUrl} alt={`${org.name} logo`} style={{ height: size, maxWidth: size * 4 }} className="w-auto object-contain" />;
  }
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.38 }} className="inline-flex items-center justify-center rounded-lg bg-zinc-100 font-semibold text-ink-muted">
      {initials(org.name)}
    </span>
  );
}

function LogoUploader({ org, canEdit }: { org: BrandingOrg; canEdit: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function upload(file: File) {
    setError(null);
    const ext = TYPES[file.type];
    if (!ext) return setError("Use a PNG, JPG, WebP or GIF image.");
    if (file.size > MAX_BYTES) return setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 2 MB.`);
    start(async () => {
      try {
        const supabase = createClient();
        const path = `${org.id}/logo-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("branding").upload(path, file, {
          contentType: file.type, cacheControl: "31536000", upsert: false,
        });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        await saveLogo(path);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 min-w-[64px] items-center justify-center rounded-lg border border-dashed border-line-strong bg-canvas px-3">
          <LogoMark org={org} size={40} />
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" id="logo-file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
            <Button type="button" size="sm" disabled={pending} onClick={() => input.current?.click()} className="h-10 sm:h-8">
              <ImageUp className="h-3.5 w-3.5" /> {pending ? "Uploading…" : org.logoUrl ? "Replace logo" : "Upload logo"}
            </Button>
            {org.logoUrl && (
              <Button type="button" size="sm" variant="ghost" disabled={pending} className="h-10 sm:h-8"
                onClick={() => {
                  if (!window.confirm("Remove your logo? Your business name will show instead.")) return;
                  setError(null);
                  start(async () => {
                    try { await removeLogo(); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't remove the logo"); }
                  });
                }}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            )}
          </div>
        )}
      </div>
      {!canEdit && <p className="mt-2 text-[12px] text-ink-faint">Only owners and admins can change the logo.</p>}
      {error && <div className="mt-3"><FormError message={error} /></div>}
    </div>
  );
}

function PortalPreview({ org, colour, onBrand }: { org: BrandingOrg; colour: string; onBrand: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Customer portal preview</div>
      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark org={org} size={28} />
            {!org.logoUrl && <span className="truncate text-[13.5px] font-semibold text-ink">{org.name}</span>}
          </div>
          <span className="shrink-0 text-[12px] text-ink-muted">emma@example.com</span>
        </div>
        <div className="px-4 py-4" style={{ background: colour, color: onBrand }}>
          <div className="text-[12px] opacity-80">Your booking with {org.name}</div>
          <div className="mt-0.5 text-[17px] font-semibold">Smith Wedding · Sat 14 March</div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="text-[12.5px] text-ink-muted">Quote Q-1042 is ready to review</div>
          <span className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium" style={{ background: colour, color: onBrand }}>Review quote</span>
        </div>
        <div className="border-t border-line bg-canvas px-4 py-2.5 text-[11.5px] text-ink-muted">
          Questions? {[org.contactEmail, org.contactPhone].filter(Boolean).join(" · ") || "Add contact details in Organisation settings"}
        </div>
      </div>
    </div>
  );
}

function QuotePreview({ org, colour }: { org: BrandingOrg; colour: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Quote header preview</div>
      <div className="rounded-xl border border-line bg-white px-4 py-4 shadow-card sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <LogoMark org={org} size={36} />
            {!org.logoUrl && <div className="mt-1.5 text-[14px] font-semibold text-ink">{org.name}</div>}
          </div>
          <div className="min-w-0 break-words text-right text-[11.5px] leading-relaxed text-ink-muted">
            {org.logoUrl && <div className="font-medium text-ink">{org.name}</div>}
            {org.address && <div className="whitespace-pre-line">{org.address}</div>}
            {org.contactEmail && <div>{org.contactEmail}</div>}
            {org.contactPhone && <div>{org.contactPhone}</div>}
            {org.website && <div>{org.website.replace(/^https?:\/\//, "")}</div>}
          </div>
        </div>
        <div className="my-3 h-[3px] rounded-full" style={{ background: colour }} />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[18px] font-semibold tracking-tight" style={{ color: contrast(colour, "#FFFFFF") >= 3 ? colour : "#16151D" }}>Quote Q-1042</div>
          <div className="text-[12px] text-ink-muted">Issued 2 Feb · Valid until 16 Feb</div>
        </div>
        <div className="mt-1 text-[12.5px] text-ink-muted">Prepared for Emma Smith — Smith Wedding</div>
      </div>
    </div>
  );
}
