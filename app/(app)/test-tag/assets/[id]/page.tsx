import { notFound } from "next/navigation";
import { canManage, requireOrg } from "@/lib/context";
import { actorName } from "@/lib/activity";
import { fmtDate, todayISO } from "@/lib/format";
import { tagStatus } from "@/lib/testtag/core";
import { ASSET_COLS, TEST_COLS, readTagSettings, tagUrl, type TagAsset, type TagTest } from "@/lib/testtag/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { TagNav } from "@/components/testtag/nav";
import { TagBadge } from "@/components/testtag/status";
import { AssetEdit, TestActions, TestForm } from "@/components/testtag/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Asset" };

export default async function TagAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, role, profile } = await requireOrg();
  const s = readTagSettings(org.settings);
  const today = todayISO(org.timezone);
  const { data } = await supabase.from("tag_assets").select(ASSET_COLS).eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!data) notFound();
  const a = data as unknown as TagAsset;
  const { data: tests } = await supabase.from("tag_tests").select(TEST_COLS).eq("asset_id", a.id).order("tested_on", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  const T = (tests ?? []) as TagTest[];
  const reading = (t: TagTest) => [t.visual && `Visual ${t.visual}`, t.earth_ohms && `Earth ${t.earth_ohms} Ω`, t.insulation_mohms && `Insulation ${t.insulation_mohms} MΩ`, t.leakage_ma && `Leakage ${t.leakage_ma} mA`, t.polarity && `Polarity ${t.polarity}`, t.rcd_ms && `RCD ${t.rcd_ms} ms`].filter(Boolean).join(" · ");
  return (
    <>
      <PageHeader eyebrow="Test & Tag" title={`${a.code} · ${a.name}`} subtitle={<span className="inline-flex flex-wrap items-center gap-2"><TagBadge s={tagStatus(a, today, s.soonDays)} />{a.customer?.name ?? `${org.name} (our own)`}{a.next_due ? ` · next test ${fmtDate(a.next_due)}` : ""}</span>} />
      <TagNav active="/test-tag/assets" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Test it" />
            <div className="border-t border-line"><TestForm asset={a} today={today} defaultInterval={s.defaultInterval} ownName={org.name} me={actorName(profile)} /></div>
          </Card>
          <Card>
            <CardHeader title="History" subtitle={`${T.length} test${T.length === 1 ? "" : "s"}`} />
            <ul className="divide-y divide-line border-t border-line">
              {!T.length && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">Not tested yet.</li>}
              {T.map((t) => (
                <li key={t.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-[0.8125rem] sm:px-5">
                  <span className={`w-12 shrink-0 font-bold ${t.result === "pass" ? "text-emerald-600" : "text-rose-600"}`}>{t.result.toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">{fmtDate(t.tested_on)}{t.tester_name ? ` · ${t.tester_name}` : ""}{t.source === "import" ? ` · imported${t.device ? ` from ${t.device}` : ""}` : ""}{t.next_due ? ` · next ${fmtDate(t.next_due)}` : ""}</p>
                    {reading(t) && <p className="text-[0.75rem] text-ink-muted">{reading(t)}</p>}
                    {t.notes && <p className="text-[0.75rem] text-ink-muted">{t.notes}</p>}
                    <p className="text-[0.6875rem] text-ink-faint">{t.printed_at ? `Label printed ${t.print_count}×` : "Label not printed"}</p>
                  </div>
                  <TestActions testId={t.id} code={a.code} canDelete={canManage(role)} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="Details" subtitle={<a href={tagUrl(org.slug, a.code)} target="_blank" rel="noopener" className="text-brand-700 hover:underline">Public record (the label&apos;s QR code)</a>} />
          <div className="border-t border-line"><AssetEdit asset={a} ownName={org.name} /></div>
        </Card>
      </div>
    </>
  );
}
