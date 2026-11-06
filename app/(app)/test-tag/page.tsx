import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { fmtDate, todayISO } from "@/lib/format";
import { tagStatus, type TagStatus } from "@/lib/testtag/core";
import { ASSET_COLS, readTagSettings, type TagAsset } from "@/lib/testtag/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { TagNav } from "@/components/testtag/nav";
import { TagBadge } from "@/components/testtag/status";
import { BatchLabels } from "@/components/testtag/batch";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test & Tag" };

export default async function TestTagHome() {
  const { supabase, org } = await requireOrg();
  const s = readTagSettings(org.settings);
  const today = todayISO(org.timezone);
  const { data, error } = await supabase.from("tag_assets").select(ASSET_COLS).eq("organisation_id", org.id).eq("status", "active").order("next_due", { ascending: true, nullsFirst: true }).limit(3000);
  if (error) {
    return (<><PageHeader eyebrow="Operations" title="Test & Tag" /><Card className="p-5 text-[0.875rem] text-ink">Test &amp; Tag needs one database update first: run <b>supabase/migrations/0102_test_tag.sql</b> in Supabase → SQL Editor, then refresh.</Card></>);
  }
  const assets = ((data ?? []) as unknown as TagAsset[]).map((a) => ({ ...a, st: tagStatus(a, today, s.soonDays) }));
  const count = (st: TagStatus) => assets.filter((a) => a.st === st).length;
  const todo = assets.filter((a) => a.st === "overdue" || a.st === "due_soon" || a.st === "failed" || a.st === "untested");
  const byOwner = new Map<string, typeof todo>();
  for (const a of todo) { const k = a.customer?.name ?? `${org.name} (our own)`; byOwner.set(k, [...(byOwner.get(k) ?? []), a]); }
  const { count: unprinted } = await supabase.from("tag_tests").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).is("printed_at", null);
  const { data: recent } = await supabase.from("tag_tests").select("id, tested_on, result, tester_name, asset:tag_assets(id, code, name)").eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(10);
  const stat = (label: string, n: number, tone: string, href: string) => (
    <Link href={href} className="rounded-xl bg-surface p-4 ring-1 ring-inset ring-line hover:ring-line-strong"><p className="text-[0.75rem] text-ink-muted">{label}</p><p className={`text-[1.5rem] font-semibold ${tone}`}>{n}</p></Link>
  );
  return (
    <>
      <PageHeader eyebrow="Operations" title="Test & Tag" subtitle="Electrical test and tag (AS/NZS 3760) for your own gear and your customers'" actions={<ButtonLink href="/test-tag/test" variant="primary">Test an item</ButtonLink>} />
      <TagNav active="/test-tag" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stat("Overdue", count("overdue"), "text-rose-600", "/test-tag/assets?status=overdue")}
        {stat(`Due in ${s.soonDays} days`, count("due_soon"), "text-amber-600", "/test-tag/assets?status=due_soon")}
        {stat("Failed", count("failed"), "text-rose-600", "/test-tag/assets?status=failed")}
        {stat("Not tested", count("untested"), "text-ink", "/test-tag/assets?status=untested")}
        {stat("In date", count("ok"), "text-emerald-600", "/test-tag/assets?status=ok")}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Card>
          <CardHeader title="Needs retagging" subtitle="Overdue first, then due soon, failed and never tested — by owner" />
          {!todo.length && <p className="border-t border-line px-5 py-8 text-center text-[0.8125rem] text-ink-muted">All in date. 🎉</p>}
          {[...byOwner.entries()].map(([owner, list]) => (
            <div key={owner} className="border-t border-line">
              <p className="bg-zinc-50 px-4 py-1.5 text-[0.75rem] font-semibold text-ink-muted dark:bg-white/5 sm:px-5">{owner} · {list.length}</p>
              <ul className="divide-y divide-line">
                {list.slice(0, 50).map((a) => (
                  <li key={a.id}><Link href={`/test-tag/assets/${a.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2 text-[0.8125rem] hover:bg-zinc-50 dark:hover:bg-white/5 sm:px-5">
                    <span className="w-28 shrink-0 font-mono text-[0.75rem] text-ink-muted">{a.code}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{a.name}{a.location ? <span className="font-normal text-ink-muted"> · {a.location}</span> : null}</span>
                    <span className="text-[0.75rem] text-ink-muted">{a.next_due ? `due ${fmtDate(a.next_due)}` : "—"}</span>
                    <TagBadge s={a.st} />
                  </Link></li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
        <div className="space-y-5 self-start">
        <Card>
          <CardHeader title="Labels to print" subtitle="On iPhone: download one file, then send it from the Zebra app → Available Files" />
          <div className="border-t border-line p-4 sm:p-5"><BatchLabels count={unprinted ?? 0} /></div>
        </Card>
        <Card>
          <CardHeader title="Recent tests" />
          <ul className="divide-y divide-line border-t border-line">
            {!(recent ?? []).length && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">No tests yet.</li>}
            {((recent ?? []) as unknown as { id: string; tested_on: string; result: string; tester_name: string | null; asset: { id: string; code: string; name: string } | null }[]).map((t) => (
              <li key={t.id}><Link href={`/test-tag/assets/${t.asset?.id}`} className="flex items-center gap-2 px-4 py-2 text-[0.8125rem] hover:bg-zinc-50 dark:hover:bg-white/5 sm:px-5">
                <span className={`w-10 shrink-0 text-[0.75rem] font-bold ${t.result === "pass" ? "text-emerald-600" : "text-rose-600"}`}>{t.result.toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{t.asset?.name} <span className="text-ink-muted">{t.asset?.code}</span></span>
                <span className="text-[0.75rem] text-ink-muted">{fmtDate(t.tested_on)}</span>
              </Link></li>
            ))}
          </ul>
        </Card>
        </div>
      </div>
    </>
  );
}
