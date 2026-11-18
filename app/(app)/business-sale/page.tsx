import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewUnit, SquareSync, XeroSpendSync } from "@/components/sales/ui";
import { aud } from "@/components/sales/charts";

export const dynamic = "force-dynamic";

export default async function BusinessSalesPage() {
  const { supabase, org } = await requireOrg();
  const [{ data: units }, { data: ints }, { data: locs }, { count: spendRows }] = await Promise.all([
    supabase.from("sale_units").select("id, name, kind, parent_id, square_location_ids, months").eq("organisation_id", org.id).order("position").order("created_at"),
    supabase.from("integrations").select("provider, status, account_label, settings, last_sync_at").eq("organisation_id", org.id).in("provider", ["square", "xero"]),
    supabase.from("sale_square_locations").select("location_id, name, synced_from, synced_to").eq("organisation_id", org.id).order("name"),
    supabase.from("sale_xero_spend").select("contact_id", { count: "exact", head: true }).eq("organisation_id", org.id),
  ]);
  const sq = (ints ?? []).find((i) => i.provider === "square");
  const xero = (ints ?? []).find((i) => i.provider === "xero");
  const sqOn = sq?.status === "connected" || sq?.status === "error";
  const sqSettings = (sq?.settings ?? {}) as { location_name?: string; merchant_name?: string; sales_first_done?: boolean; sales_synced_at?: string };

  // last 12 months' sales per unit for the cards
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
  const totals = new Map<string, number>();
  const { data: tot } = await supabase.rpc("sale_unit_totals", { p_org: org.id, p_from: from, p_to: today });
  for (const t of (tot ?? []) as { unit_id: string; sales: number }[]) totals.set(t.unit_id, Number(t.sales));
  const parents = (units ?? []).filter((u) => u.kind === "business").map((u) => ({ id: u.id as string, name: u.name as string }));
  const nameOf = new Map((units ?? []).map((u) => [u.id as string, u.name as string]));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Business Sales" subtitle="Get a business — or one part of it — ready to sell: real sales, the crew it takes, its actual suppliers and the profit it makes." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Square sales" subtitle={sqOn ? `${sqSettings.merchant_name ?? sq?.account_label ?? "Connected"}${sqSettings.sales_synced_at ? ` · updated ${new Date(sqSettings.sales_synced_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}` : "Connect the Square account your locations sell through."} />
          <div className="space-y-3 px-5 pb-5">
            <SquareSync connected={sqOn} firstDone={!!sqSettings.sales_first_done} />
            {(locs ?? []).length > 0 && (
              <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
                {(locs ?? []).map((l) => (
                  <li key={l.location_id as string} className="flex items-center justify-between gap-3 px-3 py-2 text-[0.8125rem]">
                    <span className="min-w-0 truncate text-ink">{l.name as string}</span>
                    <span className="shrink-0 text-[0.75rem] text-ink-faint">{l.synced_from ? `${fmtDay(l.synced_from as string)} – ${fmtDay(l.synced_to as string)}` : "not brought in yet"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Supplier spend (Xero)" subtitle={xero ? `${spendRows ?? 0 ? "What each supplier was paid, month by month (ex GST)." : "Not brought in yet."}` : "Use your actual suppliers as each business's expenses."} />
          <div className="px-5 pb-5"><XeroSpendSync connected={!!xero && xero.status !== "disconnected"} /></div>
        </Card>
      </div>

      <div className="mt-6 mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[0.9375rem] font-semibold text-ink">For sale</h2>
      </div>
      <div className="space-y-2.5">
        {(units ?? []).map((u) => (
          <Link key={u.id as string} href={`/business-sale/${u.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line hover:ring-brand-300">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold text-ink">{u.name as string}<Badge tone={u.kind === "division" ? "blue" : "neutral"}>{u.kind === "division" ? "Division" : "Whole business"}</Badge></p>
              <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
                {u.parent_id && nameOf.get(u.parent_id as string) ? `Part of ${nameOf.get(u.parent_id as string)} · ` : ""}
                {(u.square_location_ids as string[]).length ? `${(u.square_location_ids as string[]).length} Square location${(u.square_location_ids as string[]).length === 1 ? "" : "s"} · last 12 months ${aud(totals.get(u.id as string) ?? 0)} (ex GST)` : "No Square locations chosen yet"}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
          </Link>
        ))}
        {(units ?? []).length === 0 && <p className="text-[0.8125rem] text-ink-muted">Nothing for sale yet. Add the whole business, or a division such as the coffee carts or the roastery.</p>}
        <div className="pt-1"><NewUnit parents={parents} /></div>
      </div>
    </div>
  );
}

function fmtDay(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
}
