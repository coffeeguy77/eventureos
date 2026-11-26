import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { relative } from "@/lib/format";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MIN_VERSION, scoreTone, type GscSummary } from "@/lib/nerdherd/seo";

export const dynamic = "force-dynamic";

const vNum = (v: string) => v.split(".").map((x) => Number(x) || 0).reduce((a, b, i) => a + b / 1000 ** i, 0);
const n = (x: number) => x.toLocaleString("en-AU");

/** Every site connected through the Web Culture Connector: SEO score, things to fix, Google clicks, last run. */
export default async function SeoPage() {
  const { supabase, org } = await requireOrg();
  const [{ data: conns }, { data: rows, error }] = await Promise.all([
    supabase.from("website_connectors").select("website_id, connector_version, websites(id, domain, status, customers(name))").eq("organisation_id", org.id).limit(2000),
    supabase.from("nh_seo_sites").select("website_id, auto, score, pages, issues, gsc, last_audit_at, last_fix_at, last_error, status").eq("organisation_id", org.id),
  ]);
  type S = { website_id: string; auto: boolean; score: number | null; pages: number; issues: number; gsc: GscSummary | null; last_audit_at: string | null; last_fix_at: string | null; last_error: string | null; status: string };
  const by = new Map(((rows ?? []) as S[]).map((r) => [r.website_id, r]));
  type C = { website_id: string; connector_version: string | null; websites: { id: string; domain: string; status: string; customers: { name: string } | null } | null };
  const list = ((conns ?? []) as unknown as C[]).filter((c) => c.websites).map((c) => ({ ...c, seo: by.get(c.website_id) ?? null }))
    .sort((a, b) => (a.seo?.score ?? 101) - (b.seo?.score ?? 101) || a.websites!.domain.localeCompare(b.websites!.domain));
  const scored = list.filter((x) => x.seo?.score != null);
  const avg = scored.length ? Math.round(scored.reduce((s, x) => s + (x.seo!.score ?? 0), 0) / scored.length) : null;
  const clicks = list.reduce((s, x) => s + (x.seo?.gsc?.totals.clicks ?? 0), 0);

  return (
    <div className="space-y-5">
      {error && /does not exist|could not find/i.test(error.message) && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-800">SEO needs the 0123 database update first.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="px-5 py-4"><p className="text-[0.75rem] text-ink-muted">Sites</p><p className="text-[1.375rem] font-semibold text-ink">{list.length}</p></Card>
        <Card className="px-5 py-4"><p className="text-[0.75rem] text-ink-muted">Average SEO score</p><p className="text-[1.375rem] font-semibold text-ink">{avg ?? "—"}</p></Card>
        <Card className="px-5 py-4"><p className="text-[0.75rem] text-ink-muted">Google clicks, last 28 days</p><p className="text-[1.375rem] font-semibold text-ink">{n(clicks)}</p></Card>
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="SEO & AI search" subtitle="Sites connected through the Web Culture Connector. Automatic sites are checked and fixed by the AI every Monday morning; every change is backed up first and can be undone." />
        {list.length ? (
          <div className="divide-y divide-line border-t border-line">
            {list.map((x) => {
              const s = x.seo; const w = x.websites!;
              const old = vNum(x.connector_version ?? "0") < vNum(MIN_VERSION);
              return (
                <Link key={x.website_id} href={`/nerd-herd/seo/${x.website_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                  <Badge tone={scoreTone(s?.score ?? null)} className="w-10 justify-center">{s?.score ?? "—"}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8438rem] font-medium text-ink">{w.domain}</span>
                    <span className="block truncate text-[0.7188rem] text-ink-muted">
                      {w.customers?.name ?? "No client"}
                      {s?.last_audit_at ? ` · ${s.pages} pages · ${s.issues} to improve · checked ${relative(s.last_audit_at)}` : " · not checked yet"}
                      {s?.last_fix_at ? ` · AI fixes ${relative(s.last_fix_at)}` : ""}
                      {s?.last_error ? " · last run stopped" : ""}
                    </span>
                  </span>
                  {s?.gsc && <span className="hidden text-right text-[0.7188rem] text-ink-muted sm:block">{n(s.gsc.totals.clicks)} clicks<br />{n(s.gsc.totals.impressions)} seen</span>}
                  {old ? <Badge tone="amber">Connector {x.connector_version ?? "?"}</Badge> : (s?.auto ?? true) ? <Badge tone="brand">Automatic</Badge> : <Badge>Manual</Badge>}
                  <ChevronRight className="h-4 w-4 text-ink-faint" />
                </Link>
              );
            })}
          </div>
        ) : <div className="border-t border-line"><EmptyState title="No connected sites">Connect a WordPress site with the Web Culture Connector from Websites → the site → WordPress command ops.</EmptyState></div>}
      </Card>
    </div>
  );
}
