"use client";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, Check, ExternalLink, Plus, Search, Trash2, Wand2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { findOldAddresses, saveSeoRules, saveSiteDomain, saveSitePages } from "@/app/(app)/website/actions";
import type { Check as LaunchCheck, Suggestion } from "@/lib/site/seo";
import type { NewPage } from "@/lib/site/pages";

type Page = { slug: string; title: string; eyebrow: string; intro: string; body: string; heroImage: string | null; metaTitle: string; metaDescription: string; form: "none" | "contact" | "franchise"; footer: boolean; layout?: "standard" | "franchise" };
type Rule = { from: string; to: string; status: 301 | 410; note: string };
type Hit = { path: string; kind: string; target: string | null; hits: number; last_at: string };

const Toggle = ({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex items-start gap-2.5 text-[0.8125rem] text-ink"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500" checked={on} onChange={(e) => onChange(e.target.checked)} /><span>{label}{hint && <span className="block text-[0.75rem] text-ink-muted">{hint}</span>}</span></label>
);

function useSave() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, ok?: (d: unknown) => string) => start(async () => {
    setMsg(null);
    const r = await fn().catch(() => ({ ok: false as const, error: "Couldn't reach the server — try again." }));
    setMsg(r.ok ? { ok: true, text: ok ? ok(r.data) : String(r.data) } : { ok: false, text: r.error });
  });
  const note = msg && <p role="status" className={`text-[0.8125rem] font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>;
  return { go, pending, note };
}

const blank = (): Page => ({ slug: "", title: "", eyebrow: "", intro: "", body: "", heroImage: null, metaTitle: "", metaDescription: "", form: "none", footer: true });

export function SiteForm({ slug, base, initial, pages: targets, suggestions, checks, hits, hitsReady }: {
  slug: string; base: string;
  initial: { home: boolean; domain: string | null; live: boolean; oldSite: string | null; fallback: boolean; pages: Page[]; rules: Rule[]; discovered: number };
  pages: NewPage[]; suggestions: Suggestion[]; checks: LaunchCheck[]; hits: Hit[]; hitsReady: boolean;
}) {
  const [home, setHome] = useState(initial.home);
  const [pages, setPages] = useState<Page[]>(initial.pages);
  const [open, setOpen] = useState<number | null>(null);
  const [dom, setDom] = useState({ domain: initial.domain ?? "", oldSite: initial.oldSite ?? "", live: initial.live, fallback: initial.fallback });
  const [rules, setRules] = useState<Rule[]>(initial.rules);
  const [add, setAdd] = useState({ from: "", to: "/" });
  const [bulk, setBulk] = useState("");
  const [showOk, setShowOk] = useState(false);
  const p1 = useSave(), p2 = useSave(), p3 = useSave(), p4 = useSave();
  const setPage = (i: number, p: Partial<Page>) => setPages(pages.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const groups = useMemo(() => [...new Set(targets.map((t) => t.group))], [targets]);
  const target = (v: string, on: (v: string) => void, id?: string) => (
    <Select id={id} value={targets.some((t) => t.path === v) ? v : "__other"} onChange={(e) => on(e.target.value === "__other" ? v : e.target.value)} className="min-w-0">
      {groups.map((g) => <optgroup key={g} label={g}>{targets.filter((t) => t.group === g).map((t) => <option key={t.path} value={t.path}>{t.title} — {t.path}</option>)}</optgroup>)}
      <option value="__other">Other address…</option>
    </Select>
  );
  const unsure = suggestions.filter((s) => !s.sure);
  const problems = checks.filter((c) => !c.ok);

  return (
    <div className="space-y-5">
      {/* Pages */}
      <Card>
        <CardHeader title="Home page & your pages" subtitle="A home page that introduces everything you do, plus pages like About, Contact and Franchise. Every word can also be changed on the page itself with “Edit this page”." />
        <div className="space-y-4 px-5 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-50 p-3">
            <Toggle on={home} onChange={setHome} label="Show the home page" hint="Your logo in the site menu opens it. Off: the logo opens your classes page." />
            <a href={`${base}/site/${slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600">Preview<ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
          <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
            {pages.map((p, i) => (
              <li key={i} className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setOpen(open === i ? null : i)} className="min-w-0 flex-1 text-left">
                    <span className="font-semibold text-ink">{p.title || "New page"}</span> <span className="text-[0.8125rem] text-ink-faint">/{p.slug || "…"}</span>
                    {p.form !== "none" && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[0.6875rem] text-ink-muted">{p.form} form</span>}
                  </button>
                  {p.slug && <a href={`${base}/site/${slug}/${p.slug}`} target="_blank" rel="noopener noreferrer" className="text-[0.8125rem] font-semibold text-brand-600">View</a>}
                  <button type="button" aria-label={`Remove ${p.title}`} onClick={() => { setPages(pages.filter((_, j) => j !== i)); setOpen(null); }} className="p-1 text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>
                {open === i && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div><Label htmlFor={`pt${i}`}>Title</Label><Input id={`pt${i}`} value={p.title} maxLength={120} onChange={(e) => setPage(i, { title: e.target.value, ...(p.slug ? {} : { slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }) })} /></div>
                    <div><Label htmlFor={`ps${i}`} hint="the address, e.g. about-us">Address</Label><Input id={`ps${i}`} value={p.slug} maxLength={80} onChange={(e) => setPage(i, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div>
                    <div><Label htmlFor={`pe${i}`} hint="small heading above the title">Eyebrow</Label><Input id={`pe${i}`} value={p.eyebrow} maxLength={80} onChange={(e) => setPage(i, { eyebrow: e.target.value })} /></div>
                    <div><Label htmlFor={`pi${i}`} hint="https:// link (or change it on the page)">Photo</Label><Input id={`pi${i}`} value={p.heroImage ?? ""} onChange={(e) => setPage(i, { heroImage: e.target.value || null })} /></div>
                    <div className="sm:col-span-2"><Label htmlFor={`pn${i}`}>Introduction</Label><Textarea id={`pn${i}`} rows={2} value={p.intro} maxLength={600} onChange={(e) => setPage(i, { intro: e.target.value })} /></div>
                    <div className="sm:col-span-2"><Label htmlFor={`pb${i}`} hint="blank line = new paragraph · ## heading · - list item · **bold** · [link](https://…)">Text</Label><Textarea id={`pb${i}`} rows={12} value={p.body} onChange={(e) => setPage(i, { body: e.target.value })} /></div>
                    <div><Label htmlFor={`pf${i}`}>Form on the page</Label><Select id={`pf${i}`} value={p.form} onChange={(e) => setPage(i, { form: e.target.value as Page["form"] })}><option value="none">None</option><option value="contact">Contact form</option><option value="franchise">Franchise enquiry form</option></Select></div>
                    <div><Label htmlFor={`pl${i}`}>Page design</Label><Select id={`pl${i}`} value={p.layout ?? "standard"} onChange={(e) => setPage(i, { layout: e.target.value as Page["layout"] })}><option value="standard">Text page</option><option value="franchise">Franchise sales page (with application pipeline)</option></Select></div>
                    <div className="flex items-end"><Toggle on={p.footer} onChange={(v) => setPage(i, { footer: v })} label="Link in the footer" /></div>
                    <div><Label htmlFor={`pmt${i}`} hint="for Google (optional)">Search title</Label><Input id={`pmt${i}`} value={p.metaTitle} maxLength={120} onChange={(e) => setPage(i, { metaTitle: e.target.value })} /></div>
                    <div><Label htmlFor={`pmd${i}`} hint="for Google (optional)">Search description</Label><Input id={`pmd${i}`} value={p.metaDescription} maxLength={300} onChange={(e) => setPage(i, { metaDescription: e.target.value })} /></div>
                  </div>
                )}
              </li>
            ))}
            {!pages.length && <li className="p-3 text-[0.8125rem] text-ink-muted">No pages yet.</li>}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => { setPages([...pages, blank()]); setOpen(pages.length); }}><Plus className="h-4 w-4" />Add a page</Button>
            <Button variant="primary" disabled={p1.pending} onClick={() => p1.go(() => saveSitePages({ home, pages }))}>Save pages</Button>
            {p1.note}
          </div>
        </div>
      </Card>

      {/* Domain */}
      <Card>
        <CardHeader title="Your own domain" subtitle="Show these pages at your own address (e.g. www.yourbusiness.com.au) instead of eventureos.com.au." />
        <div className="space-y-4 px-5 pb-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="d-host" hint="with www if you use it">Domain</Label><Input id="d-host" placeholder="www.yourbusiness.com.au" value={dom.domain} onChange={(e) => setDom({ ...dom, domain: e.target.value })} /></div>
            <div><Label htmlFor="d-old" hint="read for SEO Saver before you switch">Old website</Label><Input id="d-old" placeholder="https://www.yourbusiness.com.au" value={dom.oldSite} onChange={(e) => setDom({ ...dom, oldSite: e.target.value })} /></div>
          </div>
          <Toggle on={dom.fallback} onChange={(v) => setDom({ ...dom, fallback: v })} label="Old addresses with no redirect go to the closest page (else the home page)" hint="Recommended — visitors and Google never hit a dead page. Images and files are never redirected." />
          <div className={`rounded-lg p-3 ring-1 ${dom.live ? "bg-emerald-50 ring-emerald-200" : "bg-amber-50 ring-amber-200"}`}>
            <Toggle on={dom.live} onChange={(v) => setDom({ ...dom, live: v })} label={dom.live ? "Switched on — Google is told your pages live on your domain" : "Not switched on yet"}
              hint="Turn on at the moment you change your DNS. Until then, leave it off (your old website keeps working)." />
          </div>
          {dom.domain && (
            <div className="rounded-lg bg-zinc-50 p-4 text-[0.8125rem] text-ink-muted">
              <p className="font-semibold text-ink">When you&apos;re ready to switch (in Cloudflare → DNS):</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Ask us to add <b>{dom.domain}</b> and its bare domain to EventureOS’s hosting (Vercel) — it shows the exact records.</li>
                <li>Change only the <b>@</b> and <b>www</b> records to the ones Vercel shows, and set them to <b>DNS only</b> (grey cloud).</li>
                <li>Don’t touch MX or TXT records (your email) or any other subdomain (e.g. <b>app</b>).</li>
                <li>Tick “Switched on” above and save, then run the launch check below.</li>
                <li>In Google Search Console, submit <b>https://{dom.domain.replace(/^https?:\/\//, "")}/sitemap.xml</b>.</li>
              </ol>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={p2.pending} onClick={() => p2.go(() => saveSiteDomain(dom))}>Save domain</Button>
            {p2.note}
          </div>
        </div>
      </Card>

      {/* SEO Saver */}
      <Card>
        <CardHeader title="SEO Saver" subtitle="Every address your old website had, sent to the right new page with a permanent (301) redirect — so your Google rankings move with you." />
        <div className="space-y-5 px-5 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={p3.pending || !dom.oldSite} onClick={() => p3.go(() => findOldAddresses(), (d) => { const x = d as { found: number; notes: string[] }; return `Found ${x.found} old addresses (${x.notes.join(" · ")}). Reload to see the suggestions.`; })}>
              <Search className="h-4 w-4" />{p3.pending ? "Reading the old website…" : initial.discovered ? `Find old addresses again (${initial.discovered} found)` : "Find old addresses"}
            </Button>
            {p3.note}
          </div>

          {suggestions.length > 0 && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.875rem] font-semibold text-ink">Suggested redirects ({suggestions.length}) <span className="font-normal text-ink-muted">· {suggestions.length - unsure.length} sure, {unsure.length} to check</span></p>
                <Button size="sm" onClick={() => setRules([...rules, ...suggestions.filter((s) => !rules.some((r) => r.from === s.from)).map((s) => ({ from: s.from, to: s.to, status: 301 as const, note: s.why }))])}><Wand2 className="h-4 w-4" />Add all to the list below</Button>
              </div>
              <div className="max-h-[360px] overflow-auto rounded-lg ring-1 ring-line">
                <table className="w-full min-w-[620px] text-[0.8125rem]">
                  <thead className="sticky top-0 bg-zinc-50 text-left text-ink-faint"><tr><th className="px-3 py-2 font-medium">Old address</th><th className="px-3 font-medium">Goes to</th><th className="px-3 font-medium">Why</th></tr></thead>
                  <tbody className="divide-y divide-line">{suggestions.map((s) => <tr key={s.from} className={s.sure ? "" : "bg-amber-50/60"}><td className="px-3 py-1.5 font-mono text-[0.75rem]">{s.from}</td><td className="px-3 font-mono text-[0.75rem]">{s.to}</td><td className="px-3 text-ink-muted">{s.why}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-[0.875rem] font-semibold text-ink">Redirects ({rules.length})</p>
            <div className="max-h-[420px] overflow-auto rounded-lg ring-1 ring-line">
              <table className="w-full min-w-[640px] text-[0.8125rem]">
                <thead className="sticky top-0 bg-zinc-50 text-left text-ink-faint"><tr><th className="px-3 py-2 font-medium">Old address</th><th className="px-3 font-medium">Goes to</th><th className="w-10" /></tr></thead>
                <tbody className="divide-y divide-line">
                  {rules.map((r, i) => (
                    <tr key={r.from + i}>
                      <td className="px-3 py-1.5 font-mono text-[0.75rem]">{r.from}</td>
                      <td className="px-3 py-1">{r.status === 410 ? <span className="text-ink-muted">Removed (410)</span> : (
                        <div className="flex gap-2">{target(r.to, (v) => setRules(rules.map((x, j) => (j === i ? { ...x, to: v } : x))))}
                          {!targets.some((t) => t.path === r.to) && <Input value={r.to} aria-label="Address" onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} className="w-48 font-mono text-[0.75rem]" />}</div>)}</td>
                      <td className="px-2"><button type="button" aria-label={`Remove ${r.from}`} onClick={() => setRules(rules.filter((_, j) => j !== i))} className="p-1 text-ink-faint hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                  {!rules.length && <tr><td colSpan={3} className="px-3 py-3 text-ink-muted">No redirects yet. Find old addresses above, or add one.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1"><Label htmlFor="r-from" hint="ends in /* for everything under it">Old address</Label><Input id="r-from" placeholder="/old-page" value={add.from} onChange={(e) => setAdd({ ...add, from: e.target.value })} className="font-mono text-[0.8125rem]" /></div>
              <div className="min-w-[220px] flex-1"><Label htmlFor="r-to">Goes to</Label>{target(add.to, (v) => setAdd({ ...add, to: v }), "r-to")}</div>
              <Button disabled={!add.from.startsWith("/")} onClick={() => { setRules([...rules, { from: add.from, to: add.to, status: 301, note: "" }]); setAdd({ from: "", to: "/" }); }}><Plus className="h-4 w-4" />Add</Button>
            </div>
            <details className="mt-3 text-[0.8125rem]">
              <summary className="cursor-pointer font-semibold text-ink-muted">Paste many at once</summary>
              <Textarea rows={5} className="mt-2 font-mono text-[0.75rem]" placeholder={"/old-page /new-page\n/product/* /shop/p/*"} value={bulk} onChange={(e) => setBulk(e.target.value)} />
              <Button size="sm" className="mt-2" onClick={() => {
                const add = bulk.split("\n").map((l) => l.trim().split(/\s+|,|\t/)).filter((x) => x[0]?.startsWith("/") && x[1]).map(([from, to]) => ({ from, to, status: 301 as const, note: "" }));
                setRules([...rules, ...add]); setBulk("");
              }}>Add these</Button>
            </details>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={p4.pending} onClick={() => p4.go(() => saveSeoRules(rules))}>Save redirects</Button>
              {p4.note}
            </div>
          </div>

          {checks.length > 0 && (
            <div>
              <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-ink">
                Launch check {problems.length ? <span className="inline-flex items-center gap-1 text-rose-700"><AlertTriangle className="h-4 w-4" />{problems.length} to fix</span> : <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-4 w-4" />every old address lands on a page in one step</span>}
              </p>
              <p className="text-[0.75rem] text-ink-muted">Uses the saved redirects — save first, then reload.</p>
              <div className="mt-2 max-h-[320px] overflow-auto rounded-lg ring-1 ring-line">
                <table className="w-full min-w-[620px] text-[0.8125rem]">
                  <tbody className="divide-y divide-line">
                    {(showOk ? checks : problems.length ? problems : checks.slice(0, 12)).map((c) => (
                      <tr key={c.from} className={c.ok ? "" : "bg-rose-50"}><td className="px-3 py-1.5 font-mono text-[0.75rem]">{c.from}</td><td className="px-3"><ArrowRight className="inline h-3 w-3 text-ink-faint" /> <span className="font-mono text-[0.75rem]">{c.lands}</span></td><td className="px-3 text-ink-muted">{c.note}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => setShowOk(!showOk)} className="mt-2 text-[0.8125rem] font-semibold text-brand-600">{showOk ? "Show only problems" : `Show all ${checks.length}`}</button>
            </div>
          )}

          <div>
            <p className="text-[0.875rem] font-semibold text-ink">Old addresses people still land on</p>
            {!hitsReady ? <p className="text-[0.8125rem] text-ink-muted">Needs the database update 0064_site_seo.sql.</p>
              : !hits.length ? <p className="text-[0.8125rem] text-ink-muted">Nothing yet — this fills in once your domain points here.</p>
              : <ul className="mt-2 divide-y divide-line rounded-lg text-[0.8125rem] ring-1 ring-line">{hits.map((h) => <li key={h.path} className="flex flex-wrap justify-between gap-2 px-3 py-1.5"><span className="font-mono text-[0.75rem]">{h.path}</span><span className="text-ink-muted">{h.kind === "missing" ? "not found — add a redirect" : h.kind === "gone" ? "removed" : `→ ${h.target}`} · {h.hits}×</span></li>)}</ul>}
          </div>
        </div>
      </Card>
    </div>
  );
}
