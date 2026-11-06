import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { fmtDate, todayISO } from "@/lib/format";
import { STATUS_LABEL, tagStatus, type TagStatus } from "@/lib/testtag/core";
import { ASSET_COLS, readTagSettings, type TagAsset } from "@/lib/testtag/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { TagNav } from "@/components/testtag/nav";
import { TagBadge } from "@/components/testtag/status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test & Tag assets" };

export default async function TagAssets({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; owner?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const s = readTagSettings(org.settings);
  const today = todayISO(org.timezone);
  let q = supabase.from("tag_assets").select(ASSET_COLS).eq("organisation_id", org.id).order("code").limit(2000);
  const term = (sp.q ?? "").trim().replace(/[%_,()\\]/g, " ").slice(0, 60);
  if (term) q = q.or(`code.ilike.%${term}%,name.ilike.%${term}%,location.ilike.%${term}%,serial.ilike.%${term}%`);
  if (sp.owner === "own") q = q.is("customer_id", null);
  else if (sp.owner && /^[0-9a-f-]{36}$/i.test(sp.owner)) q = q.eq("customer_id", sp.owner);
  const { data, error } = await q;
  const all = ((data ?? []) as unknown as TagAsset[]).map((a) => ({ ...a, st: tagStatus(a, today, s.soonDays) }));
  const list = sp.status && sp.status in STATUS_LABEL ? all.filter((a) => a.st === sp.status) : all.filter((a) => a.st !== "retired");
  const owners = [...new Map(all.filter((a) => a.customer).map((a) => [a.customer!.id, a.customer!.name])).entries()].sort((x, y) => x[1].localeCompare(y[1]));
  return (
    <>
      <PageHeader eyebrow="Test & Tag" title="Assets" subtitle={`${list.length} shown`} actions={<ButtonLink href="/test-tag/test" variant="primary">Test an item</ButtonLink>} />
      <TagNav active="/test-tag/assets" />
      {error && <Card className="mb-4 p-4 text-[0.8125rem] text-ink">Run the 0102 database update first.</Card>}
      <form className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_220px_auto]">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search code, item, location, serial…" className="h-10 rounded-lg bg-surface px-3 text-[0.875rem] text-ink ring-1 ring-inset ring-line-strong" />
        <select name="status" defaultValue={sp.status ?? ""} className="h-10 rounded-lg bg-surface px-2 text-[0.875rem] text-ink ring-1 ring-inset ring-line-strong">
          <option value="">All in service</option>{(Object.keys(STATUS_LABEL) as TagStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
        </select>
        <select name="owner" defaultValue={sp.owner ?? ""} className="h-10 rounded-lg bg-surface px-2 text-[0.875rem] text-ink ring-1 ring-inset ring-line-strong">
          <option value="">Everyone&apos;s</option><option value="own">{org.name} (our own)</option>{owners.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <button className="h-10 rounded-lg bg-brand-600 px-4 text-[0.875rem] font-medium text-white">Filter</button>
      </form>
      <Card>
        <ul className="divide-y divide-line">
          {!list.length && <li className="px-5 py-8 text-center text-[0.8125rem] text-ink-muted">No assets here yet — test an item or import from your tester.</li>}
          {list.map((a) => (
            <li key={a.id}><Link href={`/test-tag/assets/${a.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[0.8125rem] hover:bg-zinc-50 dark:hover:bg-white/5 sm:px-5">
              <span className="w-28 shrink-0 font-mono text-[0.75rem] text-ink-muted">{a.code}</span>
              <span className="min-w-0 flex-1"><span className="font-medium text-ink">{a.name}</span><span className="block truncate text-[0.75rem] text-ink-muted">{a.customer?.name ?? "Our own"}{a.location ? ` · ${a.location}` : ""}</span></span>
              <span className="text-[0.75rem] text-ink-muted">{a.next_due ? `next ${fmtDate(a.next_due)}` : "not tested"}</span>
              <TagBadge s={a.st} />
            </Link></li>
          ))}
        </ul>
      </Card>
    </>
  );
}
