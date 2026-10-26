import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { BookingRow } from "@/components/rentals/booking-row";
import { BOOKING_LIST_COLS, type BookingListRow } from "@/lib/hire/server";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const TABS = [
  { k: "upcoming", label: "Upcoming" },
  { k: "quotes", label: "Quotes" },
  { k: "out", label: "On hire" },
  { k: "returned", label: "Returned" },
  { k: "cancelled", label: "Cancelled" },
  { k: "all", label: "All" },
] as const;

export default async function HireBookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.k === sp.tab) ?? TABS[0];
  const q = (sp.q ?? "").trim().slice(0, 60);
  const { supabase, org } = await requireOrg();
  const now = new Date().toISOString();
  let query = supabase.from("hire_bookings").select(BOOKING_LIST_COLS).eq("organisation_id", org.id).limit(300);
  if (tab.k === "upcoming") query = query.in("status", ["reservation", "booked"]).order("starts_at");
  else if (tab.k === "quotes") query = query.eq("status", "quote").gte("ends_at", now).order("starts_at");
  else if (tab.k === "out") query = query.eq("status", "out").order("ends_at");
  else if (tab.k === "returned") query = query.eq("status", "returned").order("ends_at", { ascending: false });
  else if (tab.k === "cancelled") query = query.eq("status", "cancelled").order("starts_at", { ascending: false });
  else query = query.order("starts_at", { ascending: false });
  if (q) {
    if (/^h-?\d+$/i.test(q)) query = query.ilike("number", `%${q.replace(/^h-?/i, "")}%`);
    else {
      const { data: cs } = await supabase.from("customers").select("id").eq("organisation_id", org.id).ilike("name", `%${q.replace(/[%_]/g, " ")}%`).limit(50);
      const ids = ((cs ?? []) as { id: string }[]).map((c) => c.id);
      query = ids.length ? query.or(`customer_id.in.(${ids.join(",")}),title.ilike.%${q.replace(/[%_,()]/g, " ")}%`) : query.ilike("title", `%${q.replace(/[%_]/g, " ")}%`);
    }
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as BookingListRow[];
  const total = rows.filter((r) => r.status !== "cancelled").reduce((a, r) => a + Number(r.total), 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => <Link key={t.k} href={`/rentals/bookings?tab=${t.k}`} className={cn("rounded-full px-3 py-1.5 text-[0.8125rem] font-medium", t.k === tab.k ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{t.label}</Link>)}
        <form className="ml-auto w-full sm:w-auto"><input type="hidden" name="tab" value={tab.k} /><input name="q" defaultValue={q} placeholder="H-1001, client or title" aria-label="Search hire bookings" className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[0.8125rem] sm:h-9 sm:w-60" /></form>
      </div>
      {rows.length === 0 ? <Card><EmptyState title="No hire bookings here" action={<Link href="/rentals/bookings/new" className="text-[0.8125rem] font-medium text-brand-700 hover:underline">New booking</Link>} /></Card> : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-2.5 text-[0.75rem] text-ink-muted"><span>{rows.length} booking{rows.length === 1 ? "" : "s"}</span><span>Total {money(total, org.currency)}</span></div>
          <ul className="divide-y divide-line">{rows.map((b) => <BookingRow key={b.id} b={b} tz={org.timezone} currency={org.currency} />)}</ul>
        </Card>
      )}
    </div>
  );
}
