import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { addDaysISO, fmtDate, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { BASE_LABEL } from "@/lib/pricing/units";
import { analysePrices, isDrop, isRise, money, type ProductPrices } from "@/lib/pricing/analysis";
import { loadPriceRows } from "@/lib/pricing/data";
import { matchesSearch } from "@/lib/pricing/core";
import { ChangeCell, Sparkline } from "@/components/pricing/charts";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "changes", label: "Changed · 90 days" },
  { key: "rises", label: "Rises" },
  { key: "save", label: "Could save" },
  { key: "drops", label: "Discounts" },
  { key: "all", label: "All products" },
] as const;
type View = (typeof VIEWS)[number]["key"];

/** Supplier prices from your invoices: what's gone up, where you could save, and every supplier's price for a product. */
export default async function PricingPage({ searchParams }: { searchParams: Promise<{ v?: string; s?: string; q?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const view: View = (VIEWS.find((x) => x.key === sp.v)?.key ?? "changes");
  const q = (sp.q ?? "").trim().slice(0, 80);
  const today = todayISO(org.timezone);
  const windowStart = addDaysISO(today, -90);
  const [rows, { data: sups }] = await Promise.all([
    loadPriceRows(supabase, org.id),
    supabase.from("price_suppliers").select("id, name").eq("organisation_id", org.id).order("name"),
  ]);
  const supName = new Map(((sups ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const all = analysePrices(rows, { windowStart, today });
  const invoices = new Set(rows.map((r) => r.delivery_id)).size;
  const qs = (v: string, s?: string) => `/pricing?v=${v}${s ? `&s=${s}` : ""}`;
  const itemHref = (p: ProductPrices) => `/pricing/item?s=${p.supplierId}&k=${encodeURIComponent(p.matchKey)}`;

  const searchBox = (
    <form action="/pricing" className="relative mb-5">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <input name="q" defaultValue={q} placeholder="Search products before you order — e.g. vanilla syrup, oat milk, 8oz cups" aria-label="Search products"
        className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-24 text-[0.875rem] outline-none focus:border-brand-500" />
      <button type="submit" className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-md bg-ink px-3 text-[0.8125rem] font-medium text-surface">Search</button>
    </form>
  );

  if (!all.length) {
    return (
      <>
        <PageHeader eyebrow="Pricing" title="Supplier prices" subtitle="Every line of every supplier invoice, tracked over time — so price creep and incorrect invoices stand out." />
        <Card><EmptyState title="No prices yet" action={<ButtonLink href="/pricing/suppliers" variant="primary">Set up suppliers</ButtonLink>}>
          Add your suppliers and the email address their invoices come from. EventureOS reads the PDF invoices from your Gmail — including past ones, so you start with history.
        </EmptyState></Card>
      </>
    );
  }

  // ---------------------------------------------------------------- search: every supplier's price for what you're about to order
  if (q) {
    const found = all.filter((p) => matchesSearch(`${p.description} ${supName.get(p.supplierId) ?? ""}`, q));
    const groups = (["L", "kg", "ea"] as const).map((u) => ({ u, list: found.filter((p) => p.baseUnit === u).sort((a, b) => a.latest.price - b.latest.price) })).filter((g) => g.list.length);
    return (
      <>
        <PageHeader eyebrow="Pricing" title={`“${q}”`} subtitle="Latest price from each supplier, cheapest first. Compared per litre or kg where the pack size is on the invoice. Ex GST." actions={<ButtonLink href="/pricing" size="sm">All prices</ButtonLink>} />
        {searchBox}
        {!groups.length ? <Card><EmptyState title="Nothing found">No product on your invoices matches “{q}”. Try a shorter word.</EmptyState></Card> : groups.map((g) => {
          const cheapest = g.list[0];
          return (
            <Card key={g.u} className="mb-5">
              <CardHeader title={g.u === "ea" ? "Priced each" : `Priced per ${g.u}`} subtitle={`${g.list.length} product${g.list.length === 1 ? "" : "s"} · ${new Set(g.list.map((p) => p.supplierId)).size} supplier${new Set(g.list.map((p) => p.supplierId)).size === 1 ? "" : "s"}`} />
              <ul className="divide-y divide-line border-t border-line">
                {g.list.map((p) => {
                  const stale = p.latest.date < addDaysISO(today, -120);
                  const extra = p === cheapest || cheapest.latest.price <= 0 ? null : Math.round(((p.latest.price - cheapest.latest.price) / cheapest.latest.price) * 1000) / 10;
                  return (
                    <li key={p.key}>
                      <Link href={itemHref(p)} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-zinc-50">
                        <div className="min-w-0 flex-1 basis-60">
                          <p className="text-[0.875rem] font-medium text-ink">{p.description}
                            {p === cheapest && g.list.length > 1 && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-emerald-700">Cheapest</span>}
                          </p>
                          <p className="text-[0.75rem] text-ink-faint">{supName.get(p.supplierId)} · {p.orders} order{p.orders === 1 ? "" : "s"} · last bought {fmtDate(p.latest.date, "short")}{stale ? " (a while ago — price may have changed)" : ""}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[1rem] font-semibold tabular-nums text-ink">{money(p.latest.price)}<span className="text-[0.75rem] font-normal text-ink-faint">{BASE_LABEL[p.baseUnit]}</span></p>
                          <p className="text-[0.75rem] text-ink-muted tabular-nums">{money(p.latest.unitPrice)} per invoice unit{extra !== null && extra > 0 ? <span className="text-rose-700"> · +{extra}% vs cheapest</span> : null}</p>
                        </div>
                        <ChangeCell p={p} />
                        <Sparkline points={p.history} width={90} height={26} label={`${p.description} price`} />
                        <ChevronRight className="h-4 w-4 text-ink-faint" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </>
    );
  }

  // ---------------------------------------------------------------- overview
  let list = all.filter((p) => !sp.s || p.supplierId === sp.s);
  const since = (p: ProductPrices, d: string) => !!p.changedOn && p.changedOn >= d;
  if (view === "changes") list = list.filter((p) => since(p, windowStart));
  if (view === "rises") list = list.filter((p) => isRise(p) && since(p, windowStart));
  if (view === "drops") list = list.filter((p) => isDrop(p) && since(p, windowStart));
  if (view === "save") list = list.filter((p) => p.potentialSaving >= 1).sort((a, b) => b.potentialSaving - a.potentialSaving);
  else list.sort((a, b) => view === "all" ? a.description.localeCompare(b.description) : (b.changedOn ?? "").localeCompare(a.changedOn ?? "") || Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
  const recent = all.filter((p) => since(p, addDaysISO(today, -30)));
  const rises = recent.filter(isRise), drops = recent.filter(isDrop);
  const extra = rises.reduce((a, p) => a + (p.lastOrderImpact ?? 0), 0);
  const potential = all.reduce((a, p) => a + p.potentialSaving, 0);
  const spend12 = all.reduce((a, p) => a + p.spend12, 0);
  const bySupplier = [...all.reduce((m, p) => m.set(p.supplierId, (m.get(p.supplierId) ?? 0) + p.spend12), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader eyebrow="Pricing" title="Supplier prices" subtitle="From your invoices, ex GST. Compared per kg or litre where the pack size is printed, so a pack change isn't mistaken for a price change." />
      {searchBox}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile href={qs("rises", sp.s)} label="Price rises" hint="last 30 days" value={String(rises.length)} tone={rises.length ? "red" : undefined} sub={rises.length ? `about ${money(extra)} more on the latest orders` : "No rises"} />
        <Tile href={qs("drops", sp.s)} label="Discounts" hint="last 30 days" value={String(drops.length)} tone={drops.length ? "green" : undefined} sub={drops.length ? "Prices that came down" : "No discounts"} />
        <Tile href={qs("save", sp.s)} label="Could save" hint="per year" value={money(potential, 0)} tone={potential >= 1 ? "red" : undefined} sub="Paying your best price of the last 12 months again" />
        <Tile href={qs("all", sp.s)} label="Spend" hint="last 12 months" value={money(spend12, 0)} sub={`${all.length} products · ${invoices} invoices`} />
      </div>
      <div className="no-scrollbar mb-2 mt-5 flex gap-1.5 overflow-x-auto">
        {VIEWS.map((x) => <Link key={x.key} href={qs(x.key, sp.s)} className={cn("shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[0.7812rem] font-medium", view === x.key ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{x.label}</Link>)}
      </div>
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
        <Link href={qs(view)} className={cn("shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[0.7812rem] font-medium", !sp.s ? "bg-brand-50 text-brand-800 ring-1 ring-brand-200" : "text-ink-muted ring-1 ring-line hover:text-ink")}>All suppliers</Link>
        {((sups ?? []) as { id: string; name: string }[]).filter((s) => all.some((p) => p.supplierId === s.id)).map((s) => (
          <Link key={s.id} href={qs(view, s.id)} className={cn("shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[0.7812rem] font-medium", sp.s === s.id ? "bg-brand-50 text-brand-800 ring-1 ring-brand-200" : "text-ink-muted ring-1 ring-line hover:text-ink")}>{s.name}</Link>
        ))}
      </div>
      <Card>
        {!list.length ? <EmptyState title={view === "save" ? "You're paying your best recent price on everything" : view === "rises" ? "No price rises in the last 90 days" : "No price changes in the last 90 days"}>Check back after the next invoices.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[0.8125rem]">
              <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-muted">
                <th className="px-4 py-2 font-medium">Product</th><th className="px-2 py-2 text-right font-medium">Latest</th><th className="px-2 py-2 text-right font-medium">Before</th>
                <th className="px-2 py-2 font-medium">Change</th><th className="px-2 py-2 font-medium">Changed</th><th className="px-2 py-2 text-right font-medium">On last order</th>
                {view === "save" && <><th className="px-2 py-2 text-right font-medium">Best (12 mo)</th><th className="px-2 py-2 text-right font-medium">Could save / yr</th></>}
                <th className="px-2 py-2 font-medium">Last 90 days</th>
              </tr></thead>
              <tbody>
                {list.map((p) => {
                  const u = BASE_LABEL[p.baseUnit];
                  return (
                    <tr key={p.key} className="border-b border-line last:border-0 hover:bg-zinc-50">
                      <td className="px-4 py-2.5"><Link href={itemHref(p)} className="font-medium hover:text-brand-700 hover:underline">{p.description}</Link>
                        <span className="block text-[0.7188rem] text-ink-faint">{supName.get(p.supplierId)} · {p.orders} order{p.orders === 1 ? "" : "s"} · latest {fmtDate(p.latest.date, "short")}</span></td>
                      <td className="px-2 py-2.5 text-right tabular-nums"><span className="font-semibold">{money(p.latest.price)}</span><span className="text-ink-faint">{u}</span></td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-ink-muted">{p.previous ? <>{money(p.previous.price)}<span className="text-ink-faint">{u}</span></> : "—"}</td>
                      <td className="px-2 py-2.5"><ChangeCell p={p} /></td>
                      <td className="px-2 py-2.5 text-ink-muted">{p.changedOn ? fmtDate(p.changedOn, "short") : "—"}</td>
                      <td className={cn("px-2 py-2.5 text-right tabular-nums", (p.lastOrderImpact ?? 0) > 0 ? "text-rose-700" : (p.lastOrderImpact ?? 0) < 0 ? "text-emerald-700" : "text-ink-faint")}>{p.lastOrderImpact && Math.abs(p.lastOrderImpact) >= 0.01 ? `${p.lastOrderImpact > 0 ? "+" : ""}${money(p.lastOrderImpact)}` : "—"}</td>
                      {view === "save" && <>
                        <td className="px-2 py-2.5 text-right tabular-nums">{p.best12 ? <>{money(p.best12.price)}<span className="text-ink-faint">{u}</span><span className="block text-[0.6875rem] text-ink-faint">{fmtDate(p.best12.date, "short")}</span></> : "—"}</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-rose-700">{money(p.potentialSaving, 0)}<span className="block text-[0.6875rem] font-normal text-ink-faint">+{(p.overBestPct ?? 0).toFixed(1)}% now</span></td>
                      </>}
                      <td className="px-2 py-2.5"><Sparkline points={p.history.filter((h) => h.date >= windowStart)} label={`${p.description} price`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {bySupplier.length > 1 && (
        <Card className="mt-5">
          <CardHeader title="Spend by supplier" subtitle="Last 12 months, ex GST, from the invoices read so far" />
          <ul className="divide-y divide-line border-t border-line">
            {bySupplier.map(([id, amt]) => (
              <li key={id} className="flex items-center gap-3 px-5 py-2.5 text-[0.8125rem]">
                <span className="w-32 shrink-0 truncate font-medium sm:w-48">{supName.get(id) ?? "Supplier"}</span>
                <span className="h-2 min-w-[32px] flex-1 overflow-hidden rounded-full bg-zinc-100"><span className="block h-full rounded-full bg-brand-500" style={{ width: `${spend12 ? (amt / spend12) * 100 : 0}%` }} /></span>
                <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{money(amt, 0)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-3 text-[0.75rem] text-ink-faint">“Could save” = how much less you&apos;d pay over a year, at your current buying rate, at the best price you&apos;ve paid in the last 12 months. “Before” is the last different price. “On last order” is roughly how much more (or less) the latest invoice cost than it would have at that price.</p>
    </>
  );
}

function Tile({ href, label, hint, value, sub, tone }: { href: string; label: string; hint: string; value: string; sub: string; tone?: "red" | "green" }) {
  return (
    <Link href={href} className="block rounded-xl border border-line bg-surface p-4 shadow-card transition hover:border-brand-300">
      <p className="text-[0.75rem] font-medium text-ink-muted">{label} <span className="font-normal text-ink-faint">· {hint}</span></p>
      <p className={cn("mt-1 text-[1.5rem] font-semibold tabular-nums leading-tight", tone === "red" ? "text-rose-700" : tone === "green" ? "text-emerald-700" : "text-ink")}>{value}</p>
      <p className="mt-0.5 truncate text-[0.75rem] text-ink-muted" title={sub}>{sub}</p>
    </Link>
  );
}
