import Link from "next/link";
import { Plus } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { addDaysISO, money, todayISO } from "@/lib/format";
import { hireable, readHireSettings, usageGrid, type HireItem } from "@/lib/hire/core";
import { loadHolds, loadItems } from "@/lib/hire/server";
import { cn } from "@/lib/cn";

export const metadata = { title: "Items & rates" };
export const dynamic = "force-dynamic";

export default async function HireItemsPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  const s = readHireSettings(org.settings);
  const all = await loadItems(supabase, org.id);
  const map = new Map<string, HireItem>(all.map((i) => [i.id, i]));
  const now = Date.now();
  const { holds } = await loadHolds(supabase, org.id, now, now + 1, map, { padHours: 1 });
  const outNow = usageGrid(all, holds.filter((h) => h.status === "out"), [[now, now + 1]], 0);
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 60);
  const archived = sp.show === "archived";
  const rows = all.filter((i) => (archived ? !i.active : i.active) && (!q || `${i.name} ${i.code ?? ""} ${i.category ?? ""}`.toLowerCase().includes(q)));
  const groups = new Map<string, typeof rows>();
  for (const r of rows) { const k = r.category || "No category"; groups.set(k, [...(groups.get(k) ?? []), r]); }
  const unit = new Map(s.units.map((u) => [u.key, u.label]));
  const today = todayISO(org.timezone), soon = addDaysISO(today, 14);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/rentals/items" className={cn("rounded-full px-3 py-1.5 text-[0.8125rem] font-medium", !archived ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line")}>Active ({all.filter((i) => i.active).length})</Link>
        <Link href="/rentals/items?show=archived" className={cn("rounded-full px-3 py-1.5 text-[0.8125rem] font-medium", archived ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line")}>Archived</Link>
        <form className="ml-auto flex w-full gap-2 sm:w-auto">{archived && <input type="hidden" name="show" value="archived" />}<input name="q" defaultValue={sp.q ?? ""} placeholder="Name, code or category" aria-label="Search items" className="h-9 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[0.8125rem] sm:w-60" /></form>
        {canManage(role) && <Link href="/rentals/items/new" className={buttonClass("primary", "sm")}><Plus className="h-4 w-4" />New item</Link>}
      </div>
      {!rows.length ? <Card><EmptyState title={all.length ? "No items match" : "No items yet"}>{!all.length && "Add each thing you hire out: how many you own, its rates, bond and anything that goes with it."}</EmptyState></Card> : (
        <div className="space-y-4">
          {[...groups].map(([cat, items]) => (
            <Card key={cat} className="overflow-hidden">
              <p className="border-b border-line bg-zinc-50/70 px-5 py-2 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-muted">{cat} <span className="font-normal normal-case text-ink-faint">· {items.length}</span></p>
              <ul className="divide-y divide-line">
                {items.map((i) => {
                  const out = outNow.get(i.id)?.[0] ?? 0;
                  return (
                    <li key={i.id}>
                      <Link href={`/rentals/items/${i.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 hover:bg-zinc-50/70">
                        <div className="min-w-0 flex-1 basis-56">
                          <p className="flex flex-wrap items-center gap-2 text-[0.8438rem] font-medium text-ink">{i.name}{i.code && <span className="text-[0.75rem] font-normal text-ink-faint">#{i.code}</span>}
                            {i.kind !== "hire" && <Badge tone="slate">{i.kind === "sale" ? "Sale" : "Package"}</Badge>}
                            {i.out_of_service > 0 && <Badge tone="amber">{i.out_of_service} out of service</Badge>}
                            {((i.test_tag_due && i.test_tag_due <= soon) || (i.service_due && i.service_due <= soon)) && <Badge tone={(i.test_tag_due ?? "9") < today || (i.service_due ?? "9") < today ? "red" : "amber"}>Maintenance due</Badge>}
                          </p>
                          <p className="truncate text-[0.75rem] text-ink-muted">{i.rates.length ? i.rates.map((r) => `${unit.get(r.unit) ?? r.unit} ${money(r.price, org.currency)}`).join(" · ") : i.kind === "package" ? `${i.package_lines.length} items inside` : "No rates yet"}{i.bond > 0 ? ` · bond ${money(i.bond, org.currency)}` : ""}</p>
                        </div>
                        {i.kind === "hire" && <p className="text-right text-[0.75rem] text-ink-muted"><span className="font-semibold tabular-nums text-ink">{hireable(i) - out}</span> of {hireable(i)} in{out ? <span className="text-amber-700"> · {out} out</span> : ""}</p>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
