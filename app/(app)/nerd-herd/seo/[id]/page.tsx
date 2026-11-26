import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { fmtDateTime, relative } from "@/lib/format";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GscPicker, SeoRunner, UndoChange } from "@/components/nerdherd/seo-runner";
import { SeoSettingsForm } from "@/components/nerdherd/seo-settings";
import { MIN_VERSION, scoreTone, type GscSummary, type Issue, type SeoSiteRow } from "@/lib/nerdherd/seo";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
// each step of a run is one server action call of up to ~4 minutes
export const maxDuration = 300;

const vNum = (v: string) => v.split(".").map((x) => Number(x) || 0).reduce((a, b, i) => a + b / 1000 ** i, 0);
const FIX_LABEL: Record<Issue["fix"], string> = { ai: "AI fixes", pack: "AI search pack", manual: "By hand" };
const SEV_TONE: Record<Issue["severity"], "red" | "amber" | "slate"> = { high: "red", med: "amber", low: "slate" };
const n = (x: number) => x.toLocaleString("en-AU");
const delta = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);

function Score({ value }: { value: number | null }) {
  const tone = scoreTone(value);
  const ring = { green: "ring-emerald-200 text-emerald-700 bg-emerald-50", amber: "ring-amber-200 text-amber-800 bg-amber-50", red: "ring-rose-200 text-rose-700 bg-rose-50", neutral: "ring-zinc-200 text-ink-muted bg-canvas" }[tone];
  return <div className={cn("flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full ring-4", ring)}><span className="text-[1.25rem] font-semibold leading-none">{value ?? "—"}</span><span className="text-[0.625rem]">/ 100</span></div>;
}

export default async function SeoSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, role } = await requireOrg();
  const { data: w } = await supabase.from("websites").select("id, domain, customer_id, customers(id, name)").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!w) notFound();
  const [{ data: conn }, { data: seo, error: seoErr }, { data: pages }, { data: runs }] = await Promise.all([
    supabase.from("website_connectors").select("site_url, connector_version").eq("website_id", id).maybeSingle(),
    supabase.from("nh_seo_sites").select("*").eq("website_id", id).maybeSingle(),
    supabase.from("nh_seo_pages").select("post_id, url, name, type, front, score, issues, gsc, fixed_at").eq("website_id", id).order("score", { ascending: true }).limit(500),
    supabase.from("nh_seo_runs").select("id, kind, ok, summary, changes, cost_usd, created_at").eq("website_id", id).order("created_at", { ascending: false }).limit(25),
  ]);
  const site = w as unknown as { id: string; domain: string; customers: { id: string; name: string } | null };
  const s = seo as SeoSiteRow | null;
  const can = canManage(role);
  const version = (conn?.connector_version as string | null) ?? null;
  const outdated = !conn ? "Connect this site to the Web Culture Connector first (Websites → the site → WordPress command ops)."
    : vNum(version ?? "0") < vNum(MIN_VERSION) ? `This site's connector is version ${version ?? "unknown"}; SEO needs ${MIN_VERSION}. Sites update themselves within the hour — or run an update from the site's WordPress command ops.` : null;
  const gsc = s?.gsc as GscSummary | null | undefined;
  const checks = s?.checks ?? null;
  const siteIssues = (checks?.site_issues ?? []) as Issue[];
  type P = { post_id: number; url: string; name: string; type: string; front: boolean; score: number | null; issues: Issue[]; gsc: { clicks: number; impressions: number; position: number } | null; fixed_at: string | null };
  const plist = (pages ?? []) as P[];

  return (
    <div className="space-y-5">
      <Link href="/nerd-herd/seo" className="inline-flex items-center gap-1 text-[0.7812rem] text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />SEO</Link>
      {seoErr && /does not exist|could not find/i.test(seoErr.message) && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-800">SEO needs the 0123 database update first.</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Score value={s?.score ?? null} />
        <div className="min-w-0">
          <h2 className="break-words text-[1.125rem] font-semibold text-ink">{site.domain}</h2>
          <p className="text-[0.8125rem] text-ink-muted">
            {site.customers ? <Link href={`/clients/${site.customers.id}?tab=web`} className="font-medium text-brand-600 hover:underline">{site.customers.name}</Link> : "No client"}
            {" · "}<Link href={`/nerd-herd/websites/${site.id}`} className="hover:underline">Website</Link>
            {" · "}<a href={`https://${site.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline">Visit <ExternalLink className="h-3 w-3" /></a>
            {s?.last_audit_at ? ` · checked ${relative(s.last_audit_at)}` : " · not checked yet"}
          </p>
          {s && <p className="text-[0.75rem] text-ink-muted">{s.pages} page{s.pages === 1 ? "" : "s"} · {s.issues} thing{s.issues === 1 ? "" : "s"} to improve{s.auto ? " · automatic weekly" : ""}{checks ? ` · SEO plugin: ${checks.seo_plugin === "none" ? "none (the connector stands in)" : checks.seo_plugin}` : ""}</p>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Run" subtitle="Check every page, read Search Console, set up AI search and let the AI fix titles, descriptions and alt text — database backup first, every change undoable" />
            <div className="border-t border-line px-5 py-4"><SeoRunner websiteId={id} canRun={can} auto={s?.auto ?? true} outdated={outdated} /></div>
            {s?.last_error && <p className="border-t border-line px-5 py-2 text-[0.75rem] text-rose-700">Last run stopped: {s.last_error}</p>}
          </Card>

          <Card>
            <CardHeader title="Site-wide" subtitle="Things that affect every page" />
            {siteIssues.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {siteIssues.map((i) => (
                  <li key={i.code} className="flex items-start justify-between gap-3 px-5 py-2.5">
                    <span className="text-[0.8125rem] text-ink">{i.label}</span>
                    <span className="flex shrink-0 gap-1.5"><Badge tone={SEV_TONE[i.severity]}>{i.severity === "high" ? "Important" : i.severity === "med" ? "Worth fixing" : "Minor"}</Badge><Badge tone={i.fix === "manual" ? "neutral" : "brand"}>{FIX_LABEL[i.fix]}</Badge></span>
                  </li>
                ))}
              </ul>
            ) : <div className="border-t border-line"><EmptyState title={checks ? "Nothing site-wide to fix" : "Not checked yet"} /></div>}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Pages" subtitle="Lowest scores first · Google figures are the last 28 days" />
            {plist.length ? (
              <div className="divide-y divide-line border-t border-line">
                {plist.map((p) => (
                  <div key={p.post_id} className="grid gap-2 px-5 py-2.5 sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <a href={p.url} target="_blank" rel="noreferrer" className="block truncate text-[0.8438rem] font-medium text-ink hover:underline">{p.name || p.url}{p.front ? " (homepage)" : ""}</a>
                      <span className="block truncate text-[0.7188rem] text-ink-faint">{p.url.replace(/^https?:\/\//, "")}{p.type !== "page" ? ` · ${p.type}` : ""}{p.fixed_at ? ` · AI improved ${relative(p.fixed_at)}` : ""}</span>
                      {(p.issues ?? []).length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {p.issues.slice(0, 5).map((i) => <li key={i.code} className="text-[0.75rem] text-ink-muted"><span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle", i.severity === "high" ? "bg-rose-500" : i.severity === "med" ? "bg-amber-500" : "bg-slate-300")} />{i.label}{i.fix === "ai" ? " · AI" : ""}</li>)}
                        </ul>
                      )}
                    </div>
                    <div className="flex items-start gap-3 text-right text-[0.7188rem] text-ink-muted">
                      {p.gsc ? <span>{n(p.gsc.clicks)} clicks<br />{n(p.gsc.impressions)} seen · #{p.gsc.position}</span> : null}
                      <Badge tone={scoreTone(p.score)}>{p.score ?? "—"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="border-t border-line"><EmptyState title="No pages checked yet">Press Check only, or Check and fix with AI.</EmptyState></div>}
          </Card>

          {checks?.settings && (
            <Card>
              <CardHeader title="AI search settings" subtitle="Stored on the site by the connector · the AI search pack fills these in from the site's own pages" />
              <div className="border-t border-line px-5 py-4"><SeoSettingsForm websiteId={id} settings={checks.settings} types={checks.post_types ?? []} canRun={can && !outdated} /></div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardHeader title="History" subtitle="Checks, AI changes (with undo) and their AI cost" />
            {(runs ?? []).length ? (
              <div className="divide-y divide-line border-t border-line">
                {((runs ?? []) as { id: string; kind: string; ok: boolean; summary: string | null; changes: { change_id: string; summary: string }[]; cost_usd: number; created_at: string }[]).map((r) => (
                  <details key={r.id} className="group px-5 py-2.5">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                      <span className="min-w-0 text-[0.8125rem] text-ink">{r.ok ? null : <Badge tone="red" className="mr-1.5">Stopped</Badge>}{r.summary}</span>
                      <span className="shrink-0 text-right text-[0.7188rem] text-ink-muted">{fmtDateTime(r.created_at, org.timezone)}{Number(r.cost_usd) > 0 ? <><br />US${Number(r.cost_usd).toFixed(3)}</> : null}</span>
                    </summary>
                    {(r.changes ?? []).length > 0 && (
                      <ul className="mt-2 space-y-1 border-l-2 border-line pl-3">
                        {r.changes.map((c) => <li key={c.change_id} className="flex items-start justify-between gap-3 text-[0.75rem] text-ink-muted"><span>{c.summary}</span>{can && <UndoChange websiteId={id} changeId={c.change_id} />}</li>)}
                      </ul>
                    )}
                  </details>
                ))}
              </div>
            ) : <div className="border-t border-line"><EmptyState title="Nothing run yet" /></div>}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Google Search Console" subtitle={gsc ? `${gsc.from} to ${gsc.to} vs the 28 days before` : "Clicks, impressions and searches from Google"} />
            <div className="space-y-3 border-t border-line px-5 py-4">
              <GscPicker websiteId={id} current={s?.gsc_site ?? null} canRun={can} />
              {gsc ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {([["Clicks", gsc.totals.clicks, gsc.prev.clicks, n(gsc.totals.clicks)], ["Impressions", gsc.totals.impressions, gsc.prev.impressions, n(gsc.totals.impressions)], ["Click rate", gsc.totals.ctr, gsc.prev.ctr, `${(gsc.totals.ctr * 100).toFixed(1)}%`], ["Avg position", -gsc.totals.position, -gsc.prev.position, gsc.totals.position ? `#${gsc.totals.position}` : "—"]] as [string, number, number, string][]).map(([label, now, before, shown]) => {
                      const d = delta(Math.abs(now), Math.abs(before));
                      const better = label === "Avg position" ? now > before : now > before;
                      return (
                        <div key={label} className="rounded-lg bg-canvas px-3 py-2">
                          <span className="block text-[0.6875rem] text-ink-muted">{label}</span>
                          <span className="block text-[1rem] font-semibold text-ink">{shown}</span>
                          {d != null && d !== 0 && <span className={cn("text-[0.6875rem]", better ? "text-emerald-700" : "text-rose-700")}>{label === "Avg position" ? (better ? "up" : "down") : `${d > 0 ? "+" : ""}${d}%`}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {gsc.queries.length > 0 && (
                    <div>
                      <p className="mb-1 text-[0.75rem] font-medium text-ink">Top searches</p>
                      <ul className="space-y-0.5">{gsc.queries.slice(0, 12).map((q) => <li key={q.query} className="flex justify-between gap-2 text-[0.75rem]"><span className="truncate text-ink">{q.query}</span><span className="shrink-0 text-ink-muted">{q.clicks} · {n(q.impressions)} · #{q.position}</span></li>)}</ul>
                    </div>
                  )}
                </>
              ) : <p className="text-[0.75rem] text-ink-muted">{s?.last_gsc_at ? "No Search Console data for this site yet — check the property above is the right one and that the connected Google account can see it." : "Read on the next run. Needs Google connected in Settings → Integrations (Google Ads, Analytics & Search Console)."}</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="AI search" subtitle="What ChatGPT, Claude, Perplexity and Gemini can read" />
            <dl className="space-y-2 border-t border-line px-5 py-4 text-[0.8125rem]">
              {checks ? <>
                <div className="flex justify-between gap-2"><dt className="text-ink-muted">llms.txt</dt><dd className="text-right text-ink">{checks.llms.source === "none" ? "None" : checks.llms.source === "yoast" ? "Yoast file" : checks.llms.source === "file" ? "A file on the server" : "From the connector"}{checks.llms.ok && <> · <a href={`https://${site.domain}/llms.txt`} target="_blank" rel="noreferrer" className="text-brand-600 underline">view</a></>}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-ink-muted">AI crawlers</dt><dd className="text-right text-ink">{checks.robots.blocked.length ? `Blocked: ${checks.robots.blocked.join(", ")}` : checks.settings?.ai_crawlers === "allow" ? "Welcomed" : "Allowed (not named)"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-ink-muted">Schema on the homepage</dt><dd className="text-right text-ink">{checks.schema_types.length ? checks.schema_types.join(", ") : "None"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-ink-muted">Sitemap</dt><dd className="text-right text-ink">{checks.sitemap.ok ? <a href={checks.sitemap.url} target="_blank" rel="noreferrer" className="text-brand-600 underline">Working</a> : "Not working"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-ink-muted">Google verification</dt><dd className="text-right text-ink">{checks.verify.google ? "On the site" : "Missing"}</dd></div>
                {s?.last_pack_at && <p className="pt-1 text-[0.7188rem] text-ink-muted">AI search pack applied {relative(s.last_pack_at)}</p>}
              </> : <p className="text-ink-muted">Not checked yet.</p>}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
