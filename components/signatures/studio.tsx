"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Brush, Building2, Check, CircleAlert, History, LayoutTemplate, Link2, Loader2, Plus, Redo2, Rocket, RotateCcw, Send, ShieldCheck, Trash2, Undo2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import {
  CTA_PRESETS, FONTS, HEX, contrastRatio, darkenFor, LAYOUTS, LOCKABLE, SOCIAL_NETWORKS, missingFields, normaliseDesign, webUrl,
  type OrgBranding, type SignatureDesign, type SignaturePerson, type SocialNetwork,
} from "@/lib/signatures/render";
import { publishSignature, restoreSignatureVersion, saveSignatureDraft, sendSignatureTest } from "@/app/(app)/signature-actions";
import { DEFAULT_PREVIEW, SignaturePreview, SignatureThumb, previewVariant, type PreviewOptions } from "./preview";
import { LogoPicker } from "./logo-picker";
import { cn } from "@/lib/cn";

export interface StudioPerson { userId: string; name: string; person: SignaturePerson }
export interface StudioVersion { version: number; note: string | null; publishedAt: string; by: string | null }

type Section = "layout" | "brand" | "company" | "links" | "rules";
const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "layout", label: "Layout", icon: LayoutTemplate },
  { id: "brand", label: "Brand", icon: Brush },
  { id: "company", label: "Company", icon: Building2 },
  { id: "links", label: "Links", icon: Link2 },
  { id: "rules", label: "Rules", icon: ShieldCheck },
];

const SHOW_LABELS: [keyof SignatureDesign["show"], string][] = [
  ["title", "Job title"], ["company", "Company name"], ["pronouns", "Pronouns"], ["phone", "Direct phone"], ["mobile", "Mobile"],
  ["email", "Email"], ["website", "Website"], ["address", "Address"], ["logo", "Logo"], ["photo", "Photo"],
  ["social", "Social links"], ["cta", "Button"], ["extra", "Personal line"], ["tagline", "Tagline"], ["disclaimer", "Disclaimer"],
];

const fmt = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-1.5">
      <span className="min-w-0"><span className="block text-[0.8125rem] text-ink">{label}</span>{hint && <span className="block text-[0.75rem] text-ink-muted">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
        className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-brand-500" : "bg-zinc-300")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour`} className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-surface p-1" />
        <Input value={text} maxLength={7} onChange={(e) => { setText(e.target.value); if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase()); }} className="font-mono text-base sm:text-[0.8125rem]" />
      </div>
    </div>
  );
}

function Range({ label, value, min, max, step = 1, onChange, unit = "px" }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div>
      <Label hint={`${value}${unit}`}>{label}</Label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand-500" />
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("h-9 flex-1 rounded-lg text-[0.8125rem] font-medium ring-1 ring-inset", value === v ? "bg-brand-50 text-brand-800 ring-brand-300" : "text-ink-muted ring-line-strong hover:text-ink")}>{l}</button>
      ))}
    </div>
  );
}

/**
 * The master signature studio: edit rail · live preview · publish and versions.
 * Drafts autosave; nothing reaches anyone's emails until it's published.
 */
export function SignatureStudio({ orgId, initial, published, publishedVersion, branding, people, meId, versions, saved: initiallySaved }: {
  orgId: string;
  initial: SignatureDesign; published: SignatureDesign | null; publishedVersion: number | null; branding: OrgBranding;
  people: StudioPerson[]; meId: string; versions: StudioVersion[]; saved: boolean;
}) {
  const [design, setDesign] = useState(initial);
  const [past, setPast] = useState<SignatureDesign[]>([]);
  const [future, setFuture] = useState<SignatureDesign[]>([]);
  const [section, setSection] = useState<Section>("layout");
  const [preview, setPreview] = useState<PreviewOptions>(DEFAULT_PREVIEW);
  const [who, setWho] = useState(people.some((p) => p.userId === meId) ? meId : people[0]?.userId);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(initiallySaved ? "saved" : "idle");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [live, setLive] = useState<{ design: SignatureDesign | null; version: number | null }>({ design: published, version: publishedVersion });
  const [publishing, setPublishing] = useState(false);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  const person = people.find((p) => p.userId === who)?.person ?? { display_name: "Your Name", title: "Job title", email: "you@example.com" };
  const unpublished = !live.design || JSON.stringify(live.design) !== JSON.stringify(design);

  // Autosave the draft ~0.8s after the last change
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await saveSignatureDraft(design);
      if (r.ok) { setSaveState("saved"); setSaveErr(null); } else { setSaveState("error"); setSaveErr(r.error); }
    }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [design]);

  const update = useCallback((fn: (d: SignatureDesign) => SignatureDesign) => {
    setDesign((d) => {
      const next = fn(d); // normalised on save — trimming here would eat spaces while typing
      if (JSON.stringify(next) === JSON.stringify(d)) return d;
      setPast((p) => [...p.slice(-49), d]);
      setFuture([]);
      return next;
    });
  }, []);
  const undo = () => { const prev = past[past.length - 1]; if (!prev) return; setPast(past.slice(0, -1)); setFuture([design, ...future]); setDesign(prev); };
  const redo = () => { const next = future[0]; if (!next) return; setFuture(future.slice(1)); setPast([...past, design]); setDesign(next); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const set = <K extends keyof SignatureDesign>(k: K, v: SignatureDesign[K]) => update((d) => ({ ...d, [k]: v }));
  const tok = (p: Partial<SignatureDesign["tokens"]>) => update((d) => ({ ...d, tokens: { ...d.tokens, ...p } }));
  const show = (p: Partial<SignatureDesign["show"]>) => update((d) => ({ ...d, show: { ...d.show, ...p } }));
  const co = (p: Partial<SignatureDesign["company"]>) => update((d) => ({ ...d, company: { ...d.company, ...p } }));

  function doPublish() {
    setFlash(null);
    start(async () => {
      const r = await publishSignature(design, note);
      if (!r.ok) return setFlash({ tone: "err", text: r.error });
      setLive({ design, version: (live.version ?? 0) + 1 });
      setPublishing(false); setNote("");
      setFlash({ tone: "ok", text: `${r.message}. Replies sent from EventureOS use it from now on.` });
    });
  }
  function doRestore(v: number) {
    setFlash(null);
    start(async () => {
      const r = await restoreSignatureVersion(v);
      if (!r.ok) return setFlash({ tone: "err", text: r.error });
      if (r.design) update(() => r.design as SignatureDesign);
      setShowVersions(false);
      setFlash({ tone: "ok", text: r.message ?? "Restored" });
    });
  }
  function doTest() {
    setFlash(null);
    start(async () => {
      const r = await sendSignatureTest({ useDraft: true, draft: design, asUserId: who, variant: previewVariant(design, preview.kind) });
      setFlash(r.ok ? { tone: "ok", text: `Test ${r.message?.toLowerCase()}` } : { tone: "err", text: r.error });
    });
  }

  const missingCount = useMemo(() => people.filter((p) => missingFields(design, p.person).length).length, [people, design]);

  /* ------------------------------------------------------------ panels */
  const panel = (() => {
    switch (section) {
      case "layout": return (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[0.8125rem] font-semibold text-ink">Layout</p>
            <div className="grid grid-cols-2 gap-2.5">
              {LAYOUTS.map((l) => (
                <button key={l.id} type="button" onClick={() => set("layout", l.id)} aria-pressed={design.layout === l.id}
                  className={cn("group overflow-hidden rounded-xl text-left ring-1 ring-inset transition", design.layout === l.id ? "ring-2 ring-brand-500" : "ring-line-strong hover:ring-brand-300")}>
                  <div className="flex h-[84px] items-center overflow-hidden bg-white px-3">
                    <SignatureThumb design={{ ...design, layout: l.id, show: { ...design.show, photo: l.id === "photo" ? true : design.show.photo, disclaimer: false, cta: false, social: false } }} person={person} scale={0.4} className="w-full" />
                  </div>
                  <div className="border-t border-line px-2.5 py-2">
                    <p className="text-[0.8125rem] font-semibold text-ink">{l.name}</p>
                    <p className="text-[0.6875rem] leading-snug text-ink-muted">{l.hint}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[0.8125rem] font-semibold text-ink">What to show</p>
            <p className="mb-2 text-[0.75rem] text-ink-muted">Anything a person hasn't filled in is left out — no gaps.</p>
            <div className="grid grid-cols-2 gap-1.5">
              {SHOW_LABELS.map(([k, l]) => (
                <button key={k} type="button" role="switch" aria-checked={design.show[k]} onClick={() => show({ [k]: !design.show[k] })}
                  className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] ring-1 ring-inset transition-colors",
                    design.show[k] ? "bg-brand-50/70 text-ink ring-brand-200" : "text-ink-muted ring-line hover:text-ink")}>
                  <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded ring-1 ring-inset", design.show[k] ? "bg-brand-500 ring-brand-500 text-white" : "ring-line-strong")}>
                    {design.show[k] && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 truncate">{l}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
      case "brand": return (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <ColourField label="Accent" value={design.tokens.primary} onChange={(v) => tok({ primary: v })} />
            <ColourField label="Links" value={design.tokens.link} onChange={(v) => tok({ link: v })} />
            <ColourField label="Text" value={design.tokens.text} onChange={(v) => tok({ text: v })} />
            <ColourField label="Secondary text" value={design.tokens.muted} onChange={(v) => tok({ muted: v })} />
          </div>
          {(() => {
            const low = ([["link", "Links", 4.5], ["muted", "Secondary text", 4.5], ["text", "Text", 4.5], ["primary", "Accent (your name)", 3]] as const)
              .filter(([k, , t]) => contrastRatio(design.tokens[k]) < t);
            if (!low.length) return null;
            return (
              <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-[0.75rem] text-amber-900 ring-1 ring-inset ring-amber-200">
                <p className="flex items-start gap-1.5"><CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{low.map(([, l]) => l).join(", ")} {low.length === 1 ? "is" : "are"} hard to read on white ({low.map(([k]) => `${contrastRatio(design.tokens[k]).toFixed(1)}:1`).join(", ")}; aim for {low.some(([, , t]) => t === 4.5) ? "4.5:1" : "3:1"}).</span></p>
                <button type="button" className="mt-1.5 font-semibold underline" onClick={() => tok(Object.fromEntries(low.map(([k, , t]) => [k, darkenFor(design.tokens[k], t)])))}>
                  Use a darker shade of the same colour
                </button>
              </div>
            );
          })()}
          {branding.brand_colour && HEX.test(branding.brand_colour) && design.tokens.primary !== branding.brand_colour.toLowerCase() && (
            <button type="button" onClick={() => tok({ primary: branding.brand_colour!.toLowerCase(), link: branding.brand_colour!.toLowerCase() })} className="text-[0.75rem] font-medium text-brand-700 hover:underline">
              Use your brand colour ({branding.brand_colour})
            </button>
          )}
          <div>
            <Label hint="Email-safe fonts only">Font</Label>
            <Select value={design.tokens.font} onChange={(e) => tok({ font: e.target.value as SignatureDesign["tokens"]["font"] })} className="text-base sm:text-[0.8438rem]">
              {FONTS.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.stack }}>{f.name}</option>)}
            </Select>
          </div>
          <div><Label>Text size</Label><Seg label="Text size" value={design.tokens.size} options={[[13, "Small"], [14, "Standard"], [15, "Large"]]} onChange={(v) => tok({ size: v })} /></div>
          <Range label="Photo size" value={design.tokens.photoSize} min={48} max={96} step={4} onChange={(v) => tok({ photoSize: v })} />
          <div><Label>Photo shape</Label><Seg label="Photo shape" value={design.tokens.photoShape} options={[["circle", "Circle"], ["rounded", "Rounded"], ["square", "Square"]]} onChange={(v) => tok({ photoShape: v })} /></div>
          <Toggle on={design.tokens.divider} onChange={(v) => tok({ divider: v })} label="Accent divider" hint="A thin line in your accent colour between the logo and the details" />
        </div>
      );
      case "company": return (
        <div className="space-y-4">
          <LogoPicker orgId={orgId} brandLogo={branding.logo_url ?? null} company={design.company} width={design.tokens.logoWidth}
            onCompany={(c, w) => update((d) => ({ ...d, show: { ...d.show, logo: true }, company: { ...d.company, ...c }, tokens: w ? { ...d.tokens, logoWidth: w } : d.tokens }))}
            onWidth={(w) => tok({ logoWidth: w })} />
          <div><Label hint="Read aloud by screen readers; shown if images are blocked">Logo description</Label><Input value={design.company.logoAlt} maxLength={80} onChange={(e) => co({ logoAlt: e.target.value })} className="text-base sm:text-[0.8438rem]" /></div>
          <div><Label>Company name</Label><Input value={design.company.name} maxLength={80} onChange={(e) => co({ name: e.target.value })} className="text-base sm:text-[0.8438rem]" /></div>
          <div><Label>Website</Label><Input value={design.company.website} maxLength={300} onChange={(e) => co({ website: e.target.value })} placeholder="beanculture.com.au" className="text-base sm:text-[0.8438rem]" />
            {design.company.website && !webUrl(design.company.website) && <p className="mt-1 text-[0.75rem] text-rose-700">That doesn't look like a web address.</p>}</div>
          <div><Label hint="Used when someone has no direct number">Main phone</Label><Input value={design.company.phone} maxLength={40} onChange={(e) => co({ phone: e.target.value })} className="text-base sm:text-[0.8438rem]" /></div>
          <div><Label>Address</Label><Input value={design.company.address} maxLength={200} onChange={(e) => co({ address: e.target.value })} className="text-base sm:text-[0.8438rem]" /></div>
          <div><Label hint="Optional">Tagline</Label><Input value={design.company.tagline} maxLength={120} placeholder="e.g. Specialty coffee for events across Canberra" onChange={(e) => co({ tagline: e.target.value })} className="text-base sm:text-[0.8438rem]" /></div>
        </div>
      );
      case "links": return (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[0.8125rem] font-semibold text-ink">Social links</p>
            <div className="space-y-2">
              {design.social.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <Select value={s.network} aria-label="Network" onChange={(e) => set("social", design.social.map((x, j) => (j === i ? { ...x, network: e.target.value as SocialNetwork } : x)))} className="w-[8.5rem] shrink-0 text-base sm:text-[0.8438rem]">
                    {SOCIAL_NETWORKS.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </Select>
                  <Input value={s.url} aria-label={`${s.network} link`} placeholder="instagram.com/yourpage" onChange={(e) => set("social", design.social.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} className="text-base sm:text-[0.8438rem]" />
                  <button type="button" aria-label="Remove" onClick={() => set("social", design.social.filter((_, j) => j !== i))} className="shrink-0 rounded-lg px-2 text-ink-faint hover:bg-zinc-100 hover:text-ink"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {design.social.length < 8 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => set("social", [...design.social, { network: (SOCIAL_NETWORKS.find((n) => !design.social.some((s) => s.network === n.id))?.id ?? "instagram"), url: "" }])}>
                  <Plus className="h-3.5 w-3.5" />Add a link
                </Button>
              )}
              <p className="text-[0.75rem] text-ink-muted">Shown as text links — they work even when images are blocked.</p>
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <Toggle on={design.show.cta} onChange={(v) => show({ cta: v })} label="Button" hint="One clear call to action" />
            {design.show.cta && (
              <div className="mt-3 space-y-3">
                <div>
                  <Label>Button text</Label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {CTA_PRESETS.map((p) => (
                      <button key={p} type="button" onClick={() => update((d) => ({ ...d, cta: { ...d.cta, label: p } }))}
                        className={cn("rounded-full px-2.5 py-1 text-[0.75rem] ring-1 ring-inset", design.cta.label === p ? "bg-brand-50 text-brand-800 ring-brand-300" : "text-ink-muted ring-line-strong hover:text-ink")}>{p}</button>
                    ))}
                  </div>
                  <Input value={design.cta.label} maxLength={40} onChange={(e) => update((d) => ({ ...d, cta: { ...d.cta, label: e.target.value } }))} className="text-base sm:text-[0.8438rem]" />
                </div>
                <div><Label>Button link</Label><Input value={design.cta.url} maxLength={300} placeholder="beanculture.com.au/quote" onChange={(e) => update((d) => ({ ...d, cta: { ...d.cta, url: e.target.value } }))} className="text-base sm:text-[0.8438rem]" />
                  {design.cta.url && !webUrl(design.cta.url) && <p className="mt-1 text-[0.75rem] text-rose-700">That doesn't look like a web address.</p>}</div>
                <Toggle on={design.cta.personal} onChange={(v) => update((d) => ({ ...d, cta: { ...d.cta, personal: v } }))} label="Use each person's own booking link when they have one" />
              </div>
            )}
          </div>
        </div>
      );
      case "rules": return (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[0.8125rem] font-semibold text-ink">Replies</p>
            <div className="space-y-1.5" role="radiogroup" aria-label="Reply signature">
              {([
                ["smart", "Smart (recommended)", "Full signature on your first email in a conversation, the short one after that"],
                ["full", "Always full", "Every email gets the full signature"],
                ["compact", "Always short on replies", "Replies get the short signature"],
              ] as const).map(([v, l, h]) => (
                <button key={v} type="button" role="radio" aria-checked={design.reply.mode === v} onClick={() => update((d) => ({ ...d, reply: { ...d.reply, mode: v } }))}
                  className={cn("flex w-full items-start gap-3 rounded-xl p-3 text-left ring-1 ring-inset", design.reply.mode === v ? "bg-brand-50/60 ring-brand-300" : "ring-line-strong hover:bg-zinc-50")}>
                  <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ring-1", design.reply.mode === v ? "bg-brand-500 ring-brand-500" : "ring-line-strong")}>{design.reply.mode === v && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
                  <span><span className="block text-[0.8125rem] font-medium text-ink">{l}</span><span className="block text-[0.75rem] text-ink-muted">{h}</span></span>
                </button>
              ))}
            </div>
            <div className="mt-2"><Toggle on={design.reply.compactLogo} onChange={(v) => update((d) => ({ ...d, reply: { ...d.reply, compactLogo: v } }))} label="Small logo on the short signature" /></div>
          </div>
          <div className="border-t border-line pt-4">
            <p className="text-[0.8125rem] font-semibold text-ink">Locked details</p>
            <p className="mb-2 text-[0.75rem] text-ink-muted">Locked details can only be changed by owners and admins (in People).</p>
            <div className="divide-y divide-line">
              {LOCKABLE.map((f) => <Toggle key={f.id} on={Boolean(design.locked[f.id])} onChange={(v) => update((d) => ({ ...d, locked: { ...d.locked, [f.id]: v } }))} label={f.name} />)}
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <Toggle on={design.show.disclaimer} onChange={(v) => show({ disclaimer: v })} label="Disclaimer" hint="Your own wording — we don't add any legal text" />
            {design.show.disclaimer && <Textarea value={design.disclaimer} maxLength={600} onChange={(e) => set("disclaimer", e.target.value)} placeholder="e.g. This email and any attachments are confidential…" className="mt-2 text-base sm:text-[0.8438rem]" />}
          </div>
        </div>
      );
    }
  })();

  return (
    <div className="space-y-4">
      {/* Status + actions */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem]">
          <span className="inline-flex items-center gap-2 font-medium text-ink">
            <span className={cn("h-2 w-2 rounded-full", live.version ? "bg-emerald-500" : "bg-zinc-300")} />
            {live.version ? `Live: version ${live.version}` : "Not published yet"}
          </span>
          {unpublished && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.75rem] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">{live.version ? "Unpublished changes" : "Draft"}</span>}
          <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-ink-muted" aria-live="polite">
            {saveState === "saving" && <><Loader2 className="h-3 w-3 animate-spin" />Saving draft…</>}
            {saveState === "saved" && <><Check className="h-3 w-3" />Draft saved</>}
            {saveState === "error" && <span className="text-rose-700">{saveErr}</span>}
          </span>
          {missingCount > 0 && <Link href="/settings/signatures?tab=people" className="text-[0.75rem] font-medium text-amber-800 hover:underline">{missingCount} {missingCount === 1 ? "person has" : "people have"} missing details</Link>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={undo} disabled={!past.length} title="Undo (⌘Z)"><Undo2 className="h-3.5 w-3.5" /><span className="sr-only">Undo</span></Button>
          <Button type="button" size="sm" variant="ghost" onClick={redo} disabled={!future.length} title="Redo (⇧⌘Z)"><Redo2 className="h-3.5 w-3.5" /><span className="sr-only">Redo</span></Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowVersions((s) => !s)} aria-expanded={showVersions}><History className="h-3.5 w-3.5" />Versions</Button>
          <Button type="button" size="sm" onClick={doTest} disabled={pending}><Send className="h-3.5 w-3.5" />Send me a test</Button>
          <Button type="button" size="sm" variant="primary" onClick={() => setPublishing(true)} disabled={pending || !unpublished}><Rocket className="h-3.5 w-3.5" />Publish</Button>
        </div>
      </div>

      {flash && (
        <div role="status" className={cn("flex items-start gap-2 rounded-xl px-4 py-2.5 text-[0.8125rem] ring-1 ring-inset", flash.tone === "ok" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-rose-200")}>
          {flash.tone === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{flash.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setFlash(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {publishing && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
          <p className="text-[0.875rem] font-semibold text-ink">Publish version {(live.version ?? 0) + 1}?</p>
          <p className="mt-0.5 text-[0.8125rem] text-ink-muted">Every reply sent from EventureOS will use it straight away. Signatures people have copied into Gmail won't change until they copy them again.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="What changed? (optional, e.g. New booking button)" className="text-base sm:text-[0.8438rem]"
              onKeyDown={(e) => { if (e.key === "Enter") doPublish(); }} autoFocus />
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="primary" onClick={doPublish} disabled={pending}>{pending ? "Publishing…" : "Publish"}</Button>
              <Button type="button" variant="ghost" onClick={() => setPublishing(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {showVersions && (
        <div className="rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-[0.8125rem] font-semibold text-ink">Published versions</p>
            <button type="button" aria-label="Close" onClick={() => setShowVersions(false)} className="rounded p-1 text-ink-faint hover:bg-zinc-100 hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
          {versions.length === 0 && (!live.version) ? <p className="px-4 py-4 text-[0.8125rem] text-ink-muted">Nothing published yet.</p> : (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto">
              {versions.map((v) => (
                <li key={v.version} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-10 shrink-0 text-[0.8125rem] font-semibold tabular-nums text-ink">v{v.version}</span>
                  <span className="min-w-0 flex-1 text-[0.8125rem]">
                    <span className="block truncate text-ink">{v.note || "No note"}</span>
                    <span className="block text-[0.75rem] text-ink-muted">{fmt(v.publishedAt)}{v.by ? ` · ${v.by}` : ""}{v.version === live.version ? " · live" : ""}</span>
                  </span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => doRestore(v.version)} disabled={pending}><RotateCcw className="h-3.5 w-3.5" />Load into draft</Button>
                </li>
              ))}
              {live.version && !versions.some((v) => v.version === live.version) && <li className="px-4 py-2.5 text-[0.75rem] text-ink-muted">v{live.version} was just published — reload to see it here.</li>}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Edit rail */}
        <div className="min-w-0 rounded-xl border border-line bg-surface shadow-card">
          <nav aria-label="Signature settings" className="grid grid-cols-5 border-b border-line px-1 pt-1">
            {SECTIONS.map((s) => {
              const I = s.icon;
              return (
                <button key={s.id} type="button" onClick={() => setSection(s.id)} aria-current={section === s.id ? "page" : undefined}
                  className={cn("flex min-w-0 flex-col items-center gap-1 border-b-2 px-1 pb-2 pt-2 text-[0.75rem] font-medium", section === s.id ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
                  <I className={cn("h-4 w-4", section === s.id && "text-brand-600")} /><span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="p-4">{panel}</div>
        </div>

        {/* Preview */}
        <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.8125rem] font-semibold text-ink">Preview</p>
              {people.length > 0 && (
                <label className="flex items-center gap-2 text-[0.75rem] text-ink-muted">
                  Preview as
                  <Select value={who} onChange={(e) => setWho(e.target.value)} className="h-8 w-auto py-0 text-base sm:text-[0.8125rem]">
                    {people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
                  </Select>
                </label>
              )}
            </div>
            <SignaturePreview design={design} person={person} options={preview} onOptions={setPreview} />
            {missingFields(design, person).length > 0 && (
              <p className="mt-2 text-[0.75rem] text-amber-800">
                Missing for this person: {missingFields(design, person).map((f) => LOCKABLE.find((x) => x.id === f)?.name ?? (f === "photo_url" ? "Photo" : f)).join(", ")}.{" "}
                <Link href="/settings/signatures?tab=people" className="font-medium underline">Fill in</Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
