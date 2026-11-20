import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { addDaysISO, money, relative, todayISO } from "@/lib/format";
import { missingEnv } from "@/lib/integrations/registry";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

const MODE: Record<string, { label: string; tone: "green" | "amber" | "neutral" }> = { auto: { label: "AI automatic", tone: "green" }, suggest: { label: "AI suggests", tone: "amber" }, off: { label: "Reports only", tone: "neutral" } };

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const { data: conn } = await supabase.from("integrations").select("status, account_label, last_error").eq("organisation_id", org.id).eq("provider", "google_marketing").maybeSingle();
  const connected = !!conn && ["connected", "syncing", "error"].includes(conn.status as string);
  const missing = missingEnv("google_marketing");
  const tokenSet = !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const { data: accts } = await supabase.from("mk_accounts").select("id, name, mode, monthly_cap, ads_customer_id, ga4_property, gsc_site, active, last_run_at, last_error, ads_currency").eq("organisation_id", org.id).order("name");
  const list = (accts ?? []) as { id: string; name: string; mode: string; monthly_cap: number | null; ads_customer_id: string | null; ga4_property: string | null; gsc_site: string | null; active: boolean; last_run_at: string | null; last_error: string | null; ads_currency: string | null }[];
  const since = addDaysISO(todayISO(org.timezone), -30);
  const { data: daily } = list.length ? await supabase.from("mk_daily").select("account_id, cost, conversions").eq("source", "ads").eq("dim", "").gte("day", since).in("account_id", list.map((a) => a.id)) : { data: [] };
  const sums = new Map<string, { cost: number; conv: number }>();
  for (const r of (daily ?? []) as { account_id: string; cost: number; conversions: number }[]) { const s = sums.get(r.account_id) ?? { cost: 0, conv: 0 }; s.cost += Number(r.cost); s.conv += Number(r.conversions); sums.set(r.account_id, s); }
  const { count: waiting } = await supabase.from("mk_changes").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("status", "proposed");

  return (
    <div>
      <PageHeader title="Marketing" subtitle="Clients' Google Ads, Analytics and Search Console — reviewed by AI every morning, reported monthly."
        actions={connected ? <ButtonLink href="/marketing/new" variant="primary">Add client</ButtonLink> : undefined} />
      {sp.error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[0.8125rem] text-rose-800 ring-1 ring-inset ring-rose-100">{sp.error}</p>}
      {sp.connected && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-[0.8125rem] text-emerald-800 ring-1 ring-inset ring-emerald-100">Google connected{conn?.account_label ? ` as ${conn.account_label}` : ""}. Now add your first client.</p>}

      <Card className="mb-5">
        <CardHeader title="Google connection" subtitle="One Google login that can reach your clients' Ads (best: your manager account), GA4 and Search Console." />
        <div className="flex flex-wrap items-center gap-3 px-5 pb-5 text-[0.8125rem]">
          {connected ? <Badge tone={conn!.status === "error" ? "amber" : "green"} dot>{conn!.status === "error" ? "Needs attention" : "Connected"}</Badge> : <Badge tone="neutral" dot>Not connected</Badge>}
          {connected && <span className="text-ink">{conn!.account_label}</span>}
          {!tokenSet && <Badge tone="amber">Google Ads developer token not set yet</Badge>}
          <span className="ml-auto" />
          {missing.length ? <span className="text-[0.75rem] text-amber-800">Set {missing.join(", ")} in Vercel first.</span>
            : <a href="/api/integrations/google_marketing/connect" className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-[0.8125rem] font-medium text-white hover:bg-brand-700 sm:h-9">{connected ? "Reconnect / change account" : "Connect Google"}</a>}
        </div>
        {conn?.last_error && <p className="px-5 pb-4 text-[0.75rem] text-rose-700">{conn.last_error}</p>}
      </Card>

      {(waiting ?? 0) > 0 && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900 ring-1 ring-inset ring-amber-100">{waiting} AI change{waiting === 1 ? "" : "s"} waiting for approval — open the client to approve or turn them down.</p>}

      <Card>
        <CardHeader title="Clients" subtitle="Last 30 days of Google Ads" />
        {list.length === 0 ? (
          <EmptyState title="No clients yet">{connected ? "Add a client and choose their Google Ads account, GA4 property and Search Console site." : "Connect Google first."}</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {list.map((a) => {
              const s = sums.get(a.id);
              const cur = a.ads_currency ?? org.currency;
              return (
                <li key={a.id}>
                  <Link href={`/marketing/${a.id}`} className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3.5 hover:bg-zinc-50/70">
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block truncate text-[0.875rem] font-medium text-ink">{a.name}{!a.active && <span className="ml-2 text-[0.75rem] font-normal text-ink-faint">(paused)</span>}</span>
                      <span className="block text-[0.75rem] text-ink-faint">{[a.ads_customer_id && "Ads", a.ga4_property && "GA4", a.gsc_site && "Search Console"].filter(Boolean).join(" · ") || "Nothing linked yet"}{a.last_run_at ? ` · reviewed ${relative(a.last_run_at)}` : ""}</span>
                    </span>
                    <span className="w-28 text-[0.8125rem] tabular-nums text-ink">{s ? money(s.cost, cur, { cents: false }) : "—"}<span className="block text-[0.7188rem] text-ink-faint">spend{a.monthly_cap ? ` · cap ${money(a.monthly_cap, cur, { cents: false })}/mo` : ""}</span></span>
                    <span className="w-24 text-[0.8125rem] tabular-nums text-ink">{s ? Math.round(s.conv * 10) / 10 : "—"}<span className="block text-[0.7188rem] text-ink-faint">conversions</span></span>
                    <span className="w-24 text-[0.8125rem] tabular-nums text-ink">{s && s.conv > 0 ? money(s.cost / s.conv, cur) : "—"}<span className="block text-[0.7188rem] text-ink-faint">per conversion</span></span>
                    <Badge tone={MODE[a.mode]?.tone ?? "neutral"}>{MODE[a.mode]?.label ?? a.mode}</Badge>
                    {a.last_error && <span className="w-full text-[0.75rem] text-rose-700">{a.last_error}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
