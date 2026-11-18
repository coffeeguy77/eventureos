import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ClientTabs } from "@/components/ui/client-tabs";
import { cn } from "@/lib/cn";
import { monthList, unitPnl, type DailyRow, type ExpenseLine, type SpendRow, type StaffLine } from "@/lib/sales/pnl";
import { BarList, MonthlyChart } from "@/components/sales/charts";
import { aud } from "@/lib/sales/format";
import { CrewEditor, ExpenseEditor, UnitSetup, type SupplierOption } from "@/components/sales/ui";
import type { ExpenseInput, StaffInput } from "../actions";
import { EquipmentPanel, ListingDetails, StartListing, TourPanel, type EquipmentRow } from "@/components/sales/listing";
import type { TourSpace } from "@/components/sales/tour";
import { BuyersPanel, ReportEditor, type BuyerRow, type SectionRow } from "@/components/sales/report";
import { DEFAULT_NDA } from "@/lib/sales/public";
import { readPage } from "@/lib/sales/page-settings";
import { suggestCoffeeCategories } from "@/lib/sales/stats";
import { unitStats } from "@/lib/sales/stats-server";
import { SalesPageEditor } from "@/components/sales/page-editor";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIODS = [3, 6, 12, 24, 36];

/** All rows of a query, 1000 at a time. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 100; i++) {
    const { data, error } = await page(i * 1000, i * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function addMonths(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const dim = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), dim));
  return target.toISOString().slice(0, 10);
}
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function SaleUnitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string; tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const { supabase, org } = await requireOrg();
  const { data: unit } = await supabase.from("sale_units").select("id, name, kind, parent_id, square_location_ids, exclude_categories, super_pct, months, notes").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!unit) notFound();

  const n = PERIODS.includes(Number(sp.m)) ? Number(sp.m) : Number(unit.months) || 12;
  const tz = (org as { timezone?: string | null }).timezone || "Australia/Sydney";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  // e.g. 19 Nov last year → 18 Nov today for 12 months
  const from = new Date(Date.parse(`${addMonths(today, -n)}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
  const months = monthList(today, n + (from.endsWith("-01") ? 0 : 1));
  const locIds = (unit.square_location_ids as string[]) ?? [];
  const exclude = (unit.exclude_categories as string[]) ?? [];

  const [{ data: staffRows }, { data: expRows }, { data: locRows }] = await Promise.all([
    supabase.from("sale_staff").select("role, headcount, pay_type, annual, hourly, hours_per_shift, shifts_per_week, weeks_per_year, super_pct, notes").eq("unit_id", id).eq("organisation_id", org.id).order("position"),
    supabase.from("sale_expenses").select("kind, source, xero_contact_id, name, share_pct, annual, notes").eq("unit_id", id).eq("organisation_id", org.id).order("position"),
    supabase.from("sale_square_locations").select("location_id, name").eq("organisation_id", org.id).order("name"),
  ]);
  // the listing (and its 360° walkthrough and equipment) — needs database update 0111
  const { data: listing } = await supabase.from("sale_listings").select("id, title, source, details, photos, tour").eq("unit_id", id).eq("organisation_id", org.id).order("created_at").limit(1).maybeSingle();
  const { data: equipRows } = listing
    ? await supabase.from("sale_equipment").select("id, name, category, division, brand, condition, secondhand_value, replacement_cost, included").eq("listing_id", listing.id).order("position")
    : { data: [] };
  // report, page settings and buyers — need database update 0112 (until then these tabs say so)
  const [secRes, buyRes, pageRes] = listing ? await Promise.all([
    supabase.from("sale_report_sections").select("id, key, title, subtitle, body, bullets, table_data, visibility, source").eq("listing_id", listing.id).order("position"),
    supabase.from("sale_buyers").select("id, name, email, phone, company, token, status, nda_signed_at, nda_signed_name, last_seen_at, views, created_at").eq("listing_id", listing.id).order("created_at"),
    supabase.from("sale_listings").select("slug, is_public, nda_required, nda_text").eq("id", listing.id).single(),
  ]) : [null, null, null];
  const needs0112 = !!(secRes?.error || buyRes?.error || pageRes?.error);
  const catLocs = locIds.length ? locIds : (locRows ?? []).map((l) => l.location_id as string);
  const [daily, { data: items }, { data: cats }, spendAll] = await Promise.all([
    locIds.length
      ? all<DailyRow>((a, b) => supabase.rpc("sale_unit_data", { p_org: org.id, p_locs: locIds, p_from: months[0], p_to: today, p_exclude: exclude }).range(a, b))
      : Promise.resolve([] as DailyRow[]),
    locIds.length
      ? supabase.rpc("sale_unit_items", { p_org: org.id, p_locs: locIds, p_from: from, p_to: today, p_exclude: exclude, p_limit: 15 })
      : Promise.resolve({ data: [] as { item: string; category: string; qty: number; sales: number }[] }),
    catLocs.length ? supabase.rpc("sale_unit_categories", { p_org: org.id, p_locs: catLocs }) : Promise.resolve({ data: [] as { category: string; sales: number }[] }),
    all<{ contact_id: string; contact_name: string; month: string; amount: number }>((a, b) =>
      supabase.from("sale_xero_spend").select("contact_id, contact_name, month, amount").eq("organisation_id", org.id).gte("month", months[0]).order("contact_id").order("month").range(a, b)),
  ]);

  const staff: StaffLine[] = (staffRows ?? []).map((s) => ({ role: s.role as string, headcount: Number(s.headcount), pay_type: s.pay_type as "annual" | "hourly", annual: s.annual == null ? null : Number(s.annual), hourly: s.hourly == null ? null : Number(s.hourly), hours_per_shift: s.hours_per_shift == null ? null : Number(s.hours_per_shift), shifts_per_week: s.shifts_per_week == null ? null : Number(s.shifts_per_week), weeks_per_year: s.weeks_per_year == null ? null : Number(s.weeks_per_year), super_pct: s.super_pct == null ? null : Number(s.super_pct) }));
  const expenses: ExpenseLine[] = (expRows ?? []).map((e) => ({ kind: e.kind as "cogs" | "overhead", source: e.source as "xero" | "manual", xero_contact_id: (e.xero_contact_id as string | null) ?? null, name: e.name as string, share_pct: Number(e.share_pct), annual: e.annual == null ? null : Number(e.annual) }));
  const spend: SpendRow[] = spendAll.map((s) => ({ contact_id: s.contact_id, month: s.month, amount: Number(s.amount) }));
  // the RPC has already taken excluded categories off, so nothing more to exclude here
  // before the first Square sale nothing is counted (no wages or costs against months with no sales brought in)
  const firstSale = daily.reduce<string | null>((m, d) => (d.category === "" && Number(d.orders) > 0 && (!m || d.day < m) ? d.day : m), null);
  const countFrom = firstSale && firstSale > from ? firstSale : from;
  const p = unitPnl({ months, today, from: countFrom, to: today, daily: daily.map((d) => ({ ...d, sales: Number(d.sales), orders: Number(d.orders) })), exclude: [], staff, superPct: Number(unit.super_pct), expenses, spend });

  // the sales page: its settings, the big numbers from Square, and profit over the last 12 months for the valuation
  const page = listing ? readPage(listing.details) : null;
  const catList = ((cats ?? []) as { category: string; sales: number }[]).filter((c) => !exclude.some((x) => x.toLowerCase() === c.category.toLowerCase())).map((c) => ({ category: c.category, sales: Number(c.sales) }));
  const suggested = suggestCoffeeCategories(catList.map((c) => c.category));
  const stats = listing && page && locIds.length ? await unitStats(supabase, org.id, { square_location_ids: locIds, exclude_categories: exclude }, page.coffee_categories ?? suggested, page.years).catch(() => null) : null;
  let profit12 = p.totals.profit;
  if (listing && n !== 12) {
    const from12 = new Date(Date.parse(`${addMonths(today, -12)}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
    const months12 = monthList(today, 12 + (from12.endsWith("-01") ? 0 : 1));
    const d12 = n > 12 ? daily : locIds.length ? await all<DailyRow>((a, b) => supabase.rpc("sale_unit_data", { p_org: org.id, p_locs: locIds, p_from: months12[0], p_to: today, p_exclude: exclude }).range(a, b)) : [];
    const s12 = n > 12 ? spend : (await all<{ contact_id: string; month: string; amount: number }>((a, b) => supabase.from("sale_xero_spend").select("contact_id, month, amount").eq("organisation_id", org.id).gte("month", months12[0]).order("contact_id").order("month").range(a, b))).map((x) => ({ ...x, amount: Number(x.amount) }));
    const first12 = d12.reduce<string | null>((m, d) => (d.category === "" && Number(d.orders) > 0 && (!m || d.day < m) ? d.day : m), null);
    profit12 = unitPnl({ months: months12, today, from: first12 && first12 > from12 ? first12 : from12, to: today, daily: d12.map((d) => ({ ...d, sales: Number(d.sales), orders: Number(d.orders) })), exclude: [], staff, superPct: Number(unit.super_pct), expenses, spend: s12 }).totals.profit;
  }

  // supplier picker: what each supplier was paid over the period (whole months from the period's first month)
  const sup = new Map<string, SupplierOption>();
  for (const s of spendAll) { const o = sup.get(s.contact_id) ?? { id: s.contact_id, name: s.contact_name, total: 0 }; o.total += Number(s.amount); sup.set(s.contact_id, o); }
  const suppliers = [...sup.values()].map((s) => ({ ...s, total: Math.round(s.total * 100) / 100 })).sort((a, b) => b.total - a.total);
  const locName = new Map((locRows ?? []).map((l) => [l.location_id as string, l.name as string]));
  const t = p.totals;
  const hasSales = daily.length > 0;

  const staffInit: StaffInput[] = (staffRows ?? []).map((s) => ({ role: s.role as string, headcount: Number(s.headcount), pay_type: s.pay_type as "annual" | "hourly", annual: s.annual as number | null, hourly: s.hourly as number | null, hours_per_shift: s.hours_per_shift as number | null, shifts_per_week: s.shifts_per_week as number | null, weeks_per_year: s.weeks_per_year as number | null, super_pct: s.super_pct as number | null, notes: s.notes as string | null }));
  const expInit: ExpenseInput[] = (expRows ?? []).map((e) => ({ kind: e.kind as "cogs" | "overhead", source: e.source as "xero" | "manual", xero_contact_id: e.xero_contact_id as string | null, name: e.name as string, share_pct: Number(e.share_pct), annual: e.annual as number | null, notes: e.notes as string | null }));

  const tiles: [string, string, string?, boolean?][] = [
    ["Sales (ex GST)", aud(t.sales), `${t.orders.toLocaleString("en-AU")} orders`],
    ["Profit", aud(t.profit), t.margin == null ? undefined : `${t.margin}% of sales`, t.profit < 0],
    ["Gross profit", aud(t.gross), t.sales > 0 ? `${Math.round((t.gross / t.sales) * 1000) / 10}% after cost of goods` : undefined],
    ["Wages + super", aud(t.wages), t.sales > 0 ? `${Math.round((t.wages / t.sales) * 1000) / 10}% of sales` : undefined],
    ["Average sale", aud(t.avgOrder, true), "per order"],
  ];

  const overview = (
    <div className="space-y-4 px-4 sm:px-0">
      {!hasSales && (
        <Card className="p-4 text-[0.8125rem] text-ink-muted">
          {locIds.length ? "No Square sales in this period yet — bring them in on the Business Sales page." : "Choose this sale's Square locations in Setup to see its sales."}
        </Card>
      )}
      <div className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 lg:grid-cols-5">
        {tiles.map(([l, v, sub, bad]) => (
          <div key={l} className="rounded-2xl bg-surface p-3.5 ring-1 ring-line">
            <p className="text-[0.75rem] text-ink-muted">{l}</p>
            <p className={cn("mt-1 text-[1.125rem] font-semibold tabular-nums text-ink", bad && "text-rose-600")}>{v}</p>
            {sub && <p className="mt-0.5 text-[0.75rem] text-ink-faint">{sub}</p>}
          </div>
        ))}
      </div>
      <Card>
        <CardHeader title="Month by month" subtitle={`${fmtDay(countFrom)} – ${fmtDay(today)}.${countFrom > from ? ` Square sales start ${fmtDay(countFrom)} — earlier months show no data.` : ""} Part months (shaded) count wages and typed-in costs for the days covered.`} />
        <div className="px-4 pb-4 sm:px-5"><MonthlyChart months={p.months} /></div>
      </Card>
      <Card>
        <CardHeader title="Profit and loss" subtitle={`${fmtDay(countFrom)} – ${fmtDay(today)}, ex GST`} />
        <dl className="divide-y divide-line px-5 pb-4 text-[0.875rem]">
          {([["Sales", t.sales, false], ["Cost of goods", -t.cogs, false], ["Gross profit", t.gross, true], ["Wages + super", -t.wages, false], ["Overheads", -t.overheads, false], ["Profit", t.profit, true]] as [string, number, boolean][]).map(([l, v, strong]) => (
            <div key={l} className="flex items-baseline justify-between gap-3 py-2">
              <dt className={cn(strong ? "font-semibold text-ink" : "text-ink-muted")}>{l}</dt>
              <dd className={cn("tabular-nums", strong ? "font-semibold text-ink" : "text-ink", v < 0 && strong && "text-rose-600")}>{aud(v)}</dd>
            </div>
          ))}
        </dl>
        {(t.cogs === 0 || t.wages === 0) && <p className="px-5 pb-4 text-[0.75rem] text-ink-faint">{t.wages === 0 ? "No crew yet — add the standard crew on the Crew tab. " : ""}{t.cogs === 0 ? "No cost of goods yet — add suppliers on the Expenses tab." : ""}</p>}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {p.byLocation.length > 1 && (
          <Card><CardHeader title="By location" /><div className="px-5 pb-5"><BarList rows={p.byLocation.map((l) => ({ label: locName.get(l.location_id) ?? l.location_id, value: l.sales, sub: `${l.orders.toLocaleString("en-AU")} orders` }))} /></div></Card>
        )}
        <Card><CardHeader title="Average day" subtitle="Sales by day of the week" /><div className="px-5 pb-5">
          <BarList color="var(--s3)" rows={[1, 2, 3, 4, 5, 6, 0].map((d) => p.byWeekday[d]).filter((w) => w.days > 0).map((w) => ({ label: w.label, value: w.avg, sub: `${w.days} days` }))} note="No trading days yet." />
        </div></Card>
        <Card><CardHeader title="By Square category" subtitle={exclude.length ? `Leaving out: ${exclude.join(", ")}` : undefined} /><div className="px-5 pb-5">
          <BarList color="var(--s2)" rows={p.byCategory.slice(0, 12).map((c) => ({ label: c.category || "Uncategorised", value: c.sales }))} note="No category sales yet." />
        </div></Card>
        <Card><CardHeader title="Best sellers" /><div className="px-5 pb-5">
          <BarList color="var(--s6)" rows={((items ?? []) as { item: string; qty: number; sales: number }[]).map((i) => ({ label: i.item, value: Number(i.sales), sub: `× ${Math.round(Number(i.qty)).toLocaleString("en-AU")}` }))} note="No items yet." />
        </div></Card>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/business-sale" className="mb-3 inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Business Sales</Link>
      <PageHeader title={unit.name as string} subtitle={unit.kind === "division" ? "A division for sale" : "The whole business for sale"} />
      <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {PERIODS.map((m) => (
          <Link key={m} href={`/business-sale/${id}?m=${m}`} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium ring-1 ring-inset", m === n ? "bg-ink text-surface ring-ink" : "text-ink-muted ring-line hover:text-ink")}>Last {m} months</Link>
        ))}
      </div>
      <ClientTabs className="-mx-4 sm:mx-0 [&>div:first-child]:sm:px-0" initial={sp.tab} tabs={[
        { key: "overview", label: "Sales & profit", content: overview },
        ...(listing ? [
          { key: "tour", label: "360° tour", count: (listing.tour as TourSpace[]).length, content: <div className="px-4 sm:px-0"><TourPanel orgId={org.id} listingId={listing.id as string} spaces={listing.tour as TourSpace[]} /></div> },
          { key: "listing", label: "Listing", content: <div className="px-4 sm:px-0"><ListingDetails title={listing.title as string} details={listing.details as Record<string, unknown>} photos={(listing.photos as string[]) ?? []} source={listing.source as string} /></div> },
          { key: "equipment", label: "Equipment", count: (equipRows ?? []).length, content: <div className="px-4 sm:px-0"><EquipmentPanel listingId={listing.id as string} items={(equipRows ?? []).map((e) => ({ ...e, secondhand_value: Number(e.secondhand_value), replacement_cost: Number(e.replacement_cost) })) as EquipmentRow[]} /></div> },
        ] : []),
        ...(listing ? [
          { key: "salespage", label: "Sales page", content: <div className="px-4 sm:px-0">{page && <SalesPageEditor listingId={listing.id as string} initial={page} suggested={suggested} categories={catList} years={stats?.years ?? []} profit12={profit12} equipmentValue={(equipRows ?? []).filter((e) => e.included).reduce((t, e) => t + Number(e.secondhand_value), 0)} />}</div> },
          { key: "report", label: "Report", count: (secRes?.data ?? []).length, content: <div className="px-4 sm:px-0">{needs0112 ? <p className="text-[0.8125rem] text-ink-muted">Run the database update 0112_sale_report_buyers.sql in Supabase to use the report.</p> : <ReportEditor listingId={listing.id as string} sections={((secRes?.data ?? []) as SectionRow[]).map((x) => ({ ...x, bullets: Array.isArray(x.bullets) ? x.bullets.map(String) : [], table_data: Array.isArray(x.table_data) ? x.table_data : null }))} />}</div> },
          { key: "buyers", label: "Buyers", count: (buyRes?.data ?? []).length, content: <div className="px-4 sm:px-0">{needs0112 ? <p className="text-[0.8125rem] text-ink-muted">Run the database update 0112_sale_report_buyers.sql in Supabase to give buyers access.</p> : <BuyersPanel listing={{ id: listing.id as string, title: listing.title as string, slug: (pageRes?.data?.slug as string | null) ?? null, is_public: !!pageRes?.data?.is_public, nda_required: pageRes?.data?.nda_required !== false, nda_text: (pageRes?.data?.nda_text as string | null) ?? null, defaultNda: DEFAULT_NDA }} buyers={(buyRes?.data ?? []) as BuyerRow[]} />}</div> },
        ] : [{ key: "page", label: "Buyer page", content: <div className="px-4 sm:px-0"><StartListing unitId={id} /></div> }]),
        { key: "crew", label: "Crew", count: staffInit.length, content: <div className="px-4 sm:px-0"><p className="mb-3 text-[0.8125rem] text-ink-muted">The standard crew it takes to run {unit.name as string} — what a buyer would pay. Wages count evenly through the year.</p><CrewEditor unitId={id} initial={staffInit} superPct={Number(unit.super_pct)} /></div> },
        { key: "expenses", label: "Expenses", count: expInit.length, content: <div className="px-4 sm:px-0"><p className="mb-3 text-[0.8125rem] text-ink-muted">This business&apos;s actual suppliers from Xero (all of it, or its share), plus anything typed in such as rent.</p><ExpenseEditor unitId={id} initial={expInit} suppliers={suppliers} months={months.length} /></div> },
        { key: "setup", label: "Setup", content: <div className="px-4 sm:px-0"><UnitSetup unit={{ id, name: unit.name as string, kind: unit.kind as "business" | "division", square_location_ids: locIds, exclude_categories: exclude, super_pct: Number(unit.super_pct), months: Number(unit.months), notes: (unit.notes as string | null) ?? null }} locations={(locRows ?? []).map((l) => ({ id: l.location_id as string, name: l.name as string }))} categories={((cats ?? []) as { category: string; sales: number }[]).map((c) => ({ category: c.category, sales: Number(c.sales) }))} /></div> },
      ]} />
    </div>
  );
}
