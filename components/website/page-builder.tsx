"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Columns2, Image as ImageIcon, ImagePlus, Images, Loader2, Megaphone, Plus, Sparkles, Trash2, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { uploadPhoto } from "@/components/ui/photo-upload";
import { draftSitePage } from "@/app/(app)/website/actions";
import type { PageSection } from "@/lib/site/site";

export type BuilderPage = {
  slug: string; title: string; eyebrow: string; intro: string; body: string; heroImage: string | null; metaTitle: string; metaDescription: string;
  form: "none" | "contact" | "franchise"; footer: boolean; layout?: "standard" | "franchise"; sections: PageSection[]; menu: boolean;
};

const id = () => Math.random().toString(36).slice(2, 10);
export const blankPage = (): BuilderPage => ({ slug: "", title: "", eyebrow: "", intro: "", body: "", heroImage: null, metaTitle: "", metaDescription: "", form: "none", footer: true, sections: [], menu: true });

/** Ready-made starting points. The words are general — the business makes them its own (or has them written). */
export const STARTERS: { key: string; label: string; make: () => BuilderPage }[] = [
  { key: "blank", label: "Blank page", make: blankPage },
  { key: "contact", label: "Contact page", make: () => ({ ...blankPage(), slug: "contact", title: "Contact us", eyebrow: "Get in touch", intro: "Questions, quotes or bookings — we're happy to help. Send us a message or give us a call.", form: "contact" }) },
  { key: "about", label: "About page", make: () => ({ ...blankPage(), slug: "about-us", title: "About us", eyebrow: "Our story", sections: [{ id: id(), type: "imageText", image: null, heading: "Who we are", body: "", side: "left", label: "", link: "" }, { id: id(), type: "cta", heading: "Let's talk about your event", body: "", label: "Contact us", link: "/contact" }] }) },
  { key: "services", label: "Services page", make: () => ({ ...blankPage(), slug: "services", title: "What we do", eyebrow: "Services", sections: [{ id: id(), type: "imageText", image: null, heading: "", body: "", side: "left", label: "", link: "" }, { id: id(), type: "imageText", image: null, heading: "", body: "", side: "right", label: "", link: "" }, { id: id(), type: "gallery", heading: "Recent work", images: [] }] }) },
];

const NEW: Record<PageSection["type"], () => PageSection> = {
  text: () => ({ id: id(), type: "text", heading: "", body: "" }),
  imageText: () => ({ id: id(), type: "imageText", image: null, heading: "", body: "", side: "left", label: "", link: "" }),
  image: () => ({ id: id(), type: "image", image: null, caption: "", wide: false }),
  gallery: () => ({ id: id(), type: "gallery", heading: "", images: [] }),
  cta: () => ({ id: id(), type: "cta", heading: "", body: "", label: "", link: "" }),
};
const KINDS: { type: PageSection["type"]; label: string; icon: typeof Type }[] = [
  { type: "imageText", label: "Photo + words", icon: Columns2 }, { type: "text", label: "Words", icon: Type },
  { type: "image", label: "Photo", icon: ImageIcon }, { type: "gallery", label: "Gallery", icon: Images }, { type: "cta", label: "Button band", icon: Megaphone },
];
const TEXT_HINT = "blank line = new paragraph · ## heading · - list item · **bold** · [link](/contact)";

function PhotoPick({ orgId, value, onChange, onError, label = "Photo" }: { orgId: string; value: string | null; onChange: (v: string | null) => void; onError: (m: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setBusy(true);
        try { onChange(await uploadPhoto(orgId, "site", f, 2400)); } catch (er) { onError(er instanceof Error ? er.message : "Couldn't upload that photo."); } finally { setBusy(false); }
      }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {value ? <img src={value} alt="" className="h-16 w-24 rounded-md object-cover ring-1 ring-line" /> : <span className="grid h-16 w-24 place-items-center rounded-md bg-canvas text-ink-faint ring-1 ring-line"><ImageIcon className="h-5 w-5" /></span>}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => ref.current?.click()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{value ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}</Button>
        {value && <Button size="sm" variant="ghost" onClick={() => onChange(null)}><Trash2 className="h-4 w-4" />Remove</Button>}
      </div>
    </div>
  );
}

/** One page, fully editable: words, photos, blocks (photo + words, galleries, button bands), its form, menus and search text. */
export function PageFields({ i, p, orgId, set, onError }: { i: number; p: BuilderPage; orgId: string; set: (patch: Partial<BuilderPage>) => void; onError: (m: string) => void }) {
  const [facts, setFacts] = useState("");
  const [drafting, startDraft] = useTransition();
  const [aiNote, setAiNote] = useState<string | null>(null);
  const gref = useRef<HTMLInputElement>(null);
  const [galleryFor, setGalleryFor] = useState<string | null>(null);
  const [gBusy, setGBusy] = useState(false);
  const sec = (sid: string, patch: Partial<PageSection>) => set({ sections: p.sections.map((x) => (x.id === sid ? ({ ...x, ...patch } as PageSection) : x)) });
  const move = (k: number, d: number) => { const a = [...p.sections]; const j = k + d; if (j < 0 || j >= a.length) return; [a[k], a[j]] = [a[j], a[k]]; set({ sections: a }); };
  const franchise = p.layout === "franchise";
  const draft = () => startDraft(async () => {
    setAiNote(null);
    const r = await draftSitePage({ title: p.title, slug: p.slug, form: p.form, facts });
    if (!r.ok) { onError(r.error); return; }
    const d = r.data;
    // keep photos already chosen: fill the words into existing blocks first, then add the rest
    const photos = p.sections.filter((x) => x.type === "imageText").map((x) => (x as Extract<PageSection, { type: "imageText" }>).image);
    let n = 0;
    const blocks = d.sections.map((x) => (x.type === "imageText" ? { ...x, image: photos[n++] ?? null } : x));
    const kept = p.sections.filter((x) => x.type === "gallery" || x.type === "image");
    set({ eyebrow: p.eyebrow || d.eyebrow, intro: d.intro || p.intro, body: d.body || p.body, metaTitle: d.metaTitle || p.metaTitle, metaDescription: d.metaDescription || p.metaDescription, sections: [...blocks, ...kept] });
    setAiNote("Written — read it through and change anything that isn't quite right, then Save pages.");
  });

  return (
    <div className="mt-3 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor={`pt${i}`}>Title</Label><Input id={`pt${i}`} value={p.title} maxLength={120} onChange={(e) => set({ title: e.target.value, ...(p.slug ? {} : { slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }) })} /></div>
        <div><Label htmlFor={`ps${i}`} hint="the address, e.g. about-us">Address</Label><Input id={`ps${i}`} value={p.slug} maxLength={80} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div>
      </div>

      {!franchise && (
        <div className="rounded-lg bg-canvas p-3">
          <Label htmlFor={`pai${i}`} hint="a few key details">Write this page for me</Label>
          <Textarea id={`pai${i}`} rows={2} value={facts} onChange={(e) => setFacts(e.target.value)} placeholder="e.g. Family business since 2012, based in Mitchell ACT, deliver across Canberra, arcade games, pinball, pool tables and party hire, set up and pack down included" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" disabled={drafting || !p.title.trim()} onClick={draft}>{drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Write it</Button>
            <span className="text-[0.75rem] text-ink-faint">{aiNote ?? "Uses only what you tell it — nothing made up. Your photos stay put."}</span>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor={`pe${i}`} hint="small heading above the title">Eyebrow</Label><Input id={`pe${i}`} value={p.eyebrow} maxLength={80} onChange={(e) => set({ eyebrow: e.target.value })} /></div>
        <div><Label>Top photo</Label><PhotoPick orgId={orgId} value={p.heroImage} onChange={(v) => set({ heroImage: v })} onError={onError} /></div>
        <div className="sm:col-span-2"><Label htmlFor={`pn${i}`}>Introduction</Label><Textarea id={`pn${i}`} rows={2} value={p.intro} maxLength={600} onChange={(e) => set({ intro: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label htmlFor={`pb${i}`} hint={TEXT_HINT}>Main text</Label><Textarea id={`pb${i}`} rows={6} value={p.body} onChange={(e) => set({ body: e.target.value })} /></div>
      </div>

      {!franchise && (
        <div>
          <p className="text-[0.8125rem] font-semibold text-ink">Blocks</p>
          <p className="text-[0.75rem] text-ink-muted">Shown under the main text, in this order.</p>
          <input ref={gref} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={async (e) => {
            const files = Array.from(e.target.files ?? []); e.target.value = "";
            const g = p.sections.find((x) => x.id === galleryFor);
            if (!g || g.type !== "gallery" || !files.length) return;
            setGBusy(true);
            try {
              const urls: string[] = [];
              for (const f of files.slice(0, 24 - g.images.length)) urls.push(await uploadPhoto(orgId, "site", f, 1800));
              sec(g.id, { images: [...g.images, ...urls] } as Partial<PageSection>);
            } catch (er) { onError(er instanceof Error ? er.message : "Couldn't upload those photos."); } finally { setGBusy(false); }
          }} />
          <ol className="mt-2 space-y-3">
            {p.sections.map((x, k) => (
              <li key={x.id} className="rounded-lg bg-surface p-3 ring-1 ring-line">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{KINDS.find((q) => q.type === x.type)?.label}</span>
                  <span className="ml-auto flex gap-1">
                    <button type="button" aria-label="Move up" disabled={k === 0} onClick={() => move(k, -1)} className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-canvas disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" aria-label="Move down" disabled={k === p.sections.length - 1} onClick={() => move(k, 1)} className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-canvas disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" aria-label="Remove block" onClick={() => set({ sections: p.sections.filter((y) => y.id !== x.id) })} className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </span>
                </div>
                {x.type === "text" && <div className="grid gap-2">
                  <Input aria-label="Heading" placeholder="Heading (optional)" value={x.heading} maxLength={160} onChange={(e) => sec(x.id, { heading: e.target.value })} />
                  <Textarea aria-label="Text" rows={5} placeholder={TEXT_HINT} value={x.body} onChange={(e) => sec(x.id, { body: e.target.value })} />
                </div>}
                {x.type === "imageText" && <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <PhotoPick orgId={orgId} value={x.image} onChange={(v) => sec(x.id, { image: v })} onError={onError} />
                    <Select aria-label="Photo side" value={x.side} onChange={(e) => sec(x.id, { side: e.target.value === "right" ? "right" : "left" })} className="w-auto"><option value="left">Photo on the left</option><option value="right">Photo on the right</option></Select>
                  </div>
                  <Input aria-label="Heading" placeholder="Heading" value={x.heading} maxLength={160} onChange={(e) => sec(x.id, { heading: e.target.value })} />
                  <Textarea aria-label="Text" rows={4} placeholder={TEXT_HINT} value={x.body} onChange={(e) => sec(x.id, { body: e.target.value })} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input aria-label="Button label" placeholder="Button (optional), e.g. Book now" value={x.label} maxLength={60} onChange={(e) => sec(x.id, { label: e.target.value })} />
                    <Input aria-label="Button link" placeholder="Link, e.g. /contact or https://…" value={x.link} maxLength={400} onChange={(e) => sec(x.id, { link: e.target.value })} />
                  </div>
                </div>}
                {x.type === "image" && <div className="grid gap-2">
                  <PhotoPick orgId={orgId} value={x.image} onChange={(v) => sec(x.id, { image: v })} onError={onError} />
                  <Input aria-label="Caption" placeholder="Caption (optional)" value={x.caption} maxLength={200} onChange={(e) => sec(x.id, { caption: e.target.value })} />
                  <label className="flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={x.wide} onChange={(e) => sec(x.id, { wide: e.target.checked })} />Extra wide</label>
                </div>}
                {x.type === "gallery" && <div className="grid gap-2">
                  <Input aria-label="Heading" placeholder="Heading (optional)" value={x.heading} maxLength={160} onChange={(e) => sec(x.id, { heading: e.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    {x.images.map((u) => (
                      <span key={u} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-16 w-16 rounded-md object-cover ring-1 ring-line" />
                        <button type="button" aria-label="Remove photo" onClick={() => sec(x.id, { images: x.images.filter((y) => y !== u) } as Partial<PageSection>)} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-rose-600 shadow ring-1 ring-line"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                    {x.images.length < 24 && <button type="button" disabled={gBusy} onClick={() => { setGalleryFor(x.id); gref.current?.click(); }} className="grid h-16 w-16 place-items-center rounded-md border border-dashed border-line-strong text-ink-faint hover:text-ink">{gBusy && galleryFor === x.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}</button>}
                  </div>
                </div>}
                {x.type === "cta" && <div className="grid gap-2">
                  <Input aria-label="Heading" placeholder="Heading, e.g. Ready to book?" value={x.heading} maxLength={160} onChange={(e) => sec(x.id, { heading: e.target.value })} />
                  <Input aria-label="Text" placeholder="A line of text (optional)" value={x.body} maxLength={600} onChange={(e) => sec(x.id, { body: e.target.value })} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input aria-label="Button label" placeholder="Button, e.g. Get a quote" value={x.label} maxLength={60} onChange={(e) => sec(x.id, { label: e.target.value })} />
                    <Input aria-label="Button link" placeholder="Link, e.g. /contact" value={x.link} maxLength={400} onChange={(e) => sec(x.id, { link: e.target.value })} />
                  </div>
                </div>}
              </li>
            ))}
          </ol>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {KINDS.map((q) => <Button key={q.type} size="sm" variant="ghost" onClick={() => set({ sections: [...p.sections, NEW[q.type]()] })}><q.icon className="h-4 w-4" />{q.label}</Button>)}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor={`pf${i}`}>Form on the page</Label><Select id={`pf${i}`} value={p.form} onChange={(e) => set({ form: e.target.value as BuilderPage["form"] })}><option value="none">None</option><option value="contact">Contact form (with your address, phone and a map)</option><option value="franchise">Franchise enquiry form</option></Select></div>
        <div><Label htmlFor={`pl${i}`}>Page design</Label><Select id={`pl${i}`} value={p.layout ?? "standard"} onChange={(e) => set({ layout: e.target.value as BuilderPage["layout"] })}><option value="standard">Standard page</option><option value="franchise">Franchise sales page (with application pipeline)</option></Select></div>
        <label className="flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={p.menu} onChange={(e) => set({ menu: e.target.checked })} />Show in the top menu</label>
        <label className="flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={p.footer} onChange={(e) => set({ footer: e.target.checked })} />Link in the footer</label>
        <div><Label htmlFor={`pmt${i}`} hint="for Google (optional)">Search title</Label><Input id={`pmt${i}`} value={p.metaTitle} maxLength={120} onChange={(e) => set({ metaTitle: e.target.value })} /></div>
        <div><Label htmlFor={`pmd${i}`} hint="for Google (optional)">Search description</Label><Input id={`pmd${i}`} value={p.metaDescription} maxLength={300} onChange={(e) => set({ metaDescription: e.target.value })} /></div>
      </div>
    </div>
  );
}
