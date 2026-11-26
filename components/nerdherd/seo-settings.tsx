"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { saveSeoSettings } from "@/app/(app)/nerd-herd/seo/actions";
import type { SeoSettings } from "@/lib/nerdherd/seo";

const lines = (v: unknown[]) => v.map((x) => (typeof x === "string" ? x : (x as { name?: string })?.name ?? "")).filter(Boolean).join("\n");
const svcLines = (v: { name: string; url?: string }[]) => v.map((s) => (s.url ? `${s.name} | ${s.url}` : s.name)).join("\n");

/** The business profile and AI search switches stored on the site (the AI fills these in; staff can correct them). */
export function SeoSettingsForm({ websiteId, settings, types, canRun }: { websiteId: string; settings: SeoSettings; types: { name: string; label: string; published: number; builder: boolean }[]; canRun: boolean }) {
  const router = useRouter();
  const b = settings.business;
  const [f, setF] = useState({
    type: b.type, name: b.name, description: b.description, phone: b.phone, email: b.email, street: b.street, locality: b.locality, region: b.region, postcode: b.postcode, country: b.country, founded: b.founded,
    logo: b.logo, image: b.image, area: lines(b.area), services: svcLines(b.services), same_as: (b.same_as ?? []).join("\n"),
    schema: settings.schema, faq_schema: settings.faq_schema, llms: settings.llms, llms_intro: settings.llms_intro, ai_crawlers: settings.ai_crawlers,
    noindex_types: settings.noindex_types, verify_google: settings.verify_google, verify_bing: settings.verify_bing,
    h1_class: settings.h1_class ?? "", alt_fill: !!settings.alt_fill,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const tick = (k: "schema" | "faq_schema" | "llms" | "alt_fill") => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.checked });

  const save = () => start(async () => {
    setMsg(null);
    const split = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const r = await saveSeoSettings(websiteId, {
      business: {
        type: f.type, name: f.name, description: f.description, phone: f.phone, email: f.email, street: f.street, locality: f.locality, region: f.region, postcode: f.postcode, country: f.country, founded: f.founded,
        logo: f.logo, image: f.image, price_range: b.price_range, area: split(f.area),
        services: split(f.services).map((l) => { const [name, url] = l.split("|").map((x) => x.trim()); return url ? { name, url } : { name }; }),
        same_as: split(f.same_as),
      },
      schema: f.schema, faq_schema: f.faq_schema, llms: f.llms, llms_intro: f.llms_intro, ai_crawlers: f.ai_crawlers as SeoSettings["ai_crawlers"],
      noindex_types: f.noindex_types, verify_google: f.verify_google, verify_bing: f.verify_bing, h1_class: f.h1_class, alt_fill: f.alt_fill,
    });
    setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
    router.refresh();
  });

  const field = (k: keyof typeof f, label: string, hint?: string) => (
    <div><Label hint={hint}>{label}</Label><Input value={String(f[k] ?? "")} onChange={set(k)} disabled={!canRun} /></div>
  );
  const hideable = types.filter((t) => t.name !== "page" && t.name !== "post");

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", "Business name")}
        {field("type", "Schema type", "e.g. GeneralContractor")}
        <div className="sm:col-span-2"><Label hint="Shown to Google and AI tools">What the business does</Label><Textarea value={f.description} onChange={set("description")} disabled={!canRun} /></div>
        {field("phone", "Phone")}
        {field("email", "Email")}
        {field("street", "Street", "optional")}
        {field("locality", "Suburb / city")}
        {field("region", "State")}
        {field("postcode", "Postcode")}
        {field("founded", "Established", "year")}
        {field("logo", "Logo address", "https://…")}
        <div><Label hint="one per line">Areas served</Label><Textarea value={f.area} onChange={set("area")} disabled={!canRun} /></div>
        <div><Label hint="one per line: Name | page address">Services</Label><Textarea value={f.services} onChange={set("services")} disabled={!canRun} /></div>
        <div className="sm:col-span-2"><Label hint="one per line: Facebook, LinkedIn, Google Business…">Profiles elsewhere</Label><Textarea value={f.same_as} onChange={set("same_as")} disabled={!canRun} className="min-h-[60px]" /></div>
      </div>

      <div className="space-y-2 border-t border-line pt-4 text-[0.8125rem]">
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.schema} onChange={tick("schema")} disabled={!canRun} /><span><span className="font-medium text-ink">Business schema</span> <span className="text-ink-muted">— name, phone, area and services in the code Google and AI tools read</span></span></label>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.faq_schema} onChange={tick("faq_schema")} disabled={!canRun} /><span><span className="font-medium text-ink">FAQ schema</span> <span className="text-ink-muted">— question-and-answer sections become answers AI tools can quote</span></span></label>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.llms} onChange={tick("llms")} disabled={!canRun} /><span><span className="font-medium text-ink">llms.txt</span> <span className="text-ink-muted">— a plain guide to the site for ChatGPT, Claude, Perplexity and Gemini (a Yoast llms.txt file takes priority)</span></span></label>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.alt_fill} onChange={tick("alt_fill")} disabled={!canRun} /><span><span className="font-medium text-ink">Fill in alt text</span> <span className="text-ink-muted">— images the theme or a widget leaves without alt text get the description saved in the media library</span></span></label>
        <div className="pl-6"><Label>llms.txt introduction</Label><Textarea value={f.llms_intro} onChange={set("llms_intro")} disabled={!canRun} className="min-h-[60px]" /></div>
        <div className="grid gap-3 pt-1 sm:grid-cols-3">
          <div><Label>AI crawlers in robots.txt</Label>
            <Select value={f.ai_crawlers} onChange={set("ai_crawlers")} disabled={!canRun}>
              <option value="allow">Welcome them (recommended)</option><option value="default">Leave robots.txt alone</option><option value="block">Block them</option>
            </Select></div>
          {field("verify_google", "Google verification code")}
          {field("verify_bing", "Bing verification code")}
          {field("h1_class", "Page-title class served as the H1", "when the theme uses an H2")}
        </div>
        {hideable.length > 0 && (
          <div className="pt-1">
            <Label hint="kept out of Google and sitemaps">Hidden from search</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {hideable.map((t) => (
                <label key={t.name} className="inline-flex items-center gap-1.5 text-[0.7812rem]">
                  <input type="checkbox" className="h-3.5 w-3.5" disabled={!canRun} checked={f.noindex_types.includes(t.name)}
                    onChange={(e) => setF({ ...f, noindex_types: e.target.checked ? [...f.noindex_types, t.name] : f.noindex_types.filter((x) => x !== t.name) })} />
                  {t.label} <span className="text-ink-faint">({t.published}{t.builder ? ", template" : ""})</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      {canRun && (
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" disabled={pending} onClick={save}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save to the site</Button>
          {msg && <span className={`text-[0.7812rem] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}
