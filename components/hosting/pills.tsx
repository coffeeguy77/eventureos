import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HostingPill = { id: string; domain: string; suspended: boolean };

/** Hosting accounts per client (quietly empty before the hosting update). */
export async function hostingByClient(supabase: SupabaseClient, orgId: string, customerIds?: string[]) {
  const map = new Map<string, HostingPill[]>();
  let q = supabase.from("hosting_accounts").select("id, domain, suspended, customer_id").eq("organisation_id", orgId).not("customer_id", "is", null).order("domain").limit(5000);
  if (customerIds) { if (!customerIds.length) return map; q = q.in("customer_id", customerIds.slice(0, 500)); }
  const { data, error } = await q;
  if (error) return map;
  for (const r of (data ?? []) as (HostingPill & { customer_id: string })[]) map.set(r.customer_id, [...(map.get(r.customer_id) ?? []), { id: r.id, domain: r.domain, suspended: r.suspended }]);
  return map;
}

/** Green pill per hosting account; red when it's suspended. */
export function HostingPills({ list, max = 3, link = true }: { list?: HostingPill[]; max?: number; link?: boolean }) {
  if (!list?.length) return null;
  const cls = (s: boolean) => `relative z-[1] inline-flex max-w-[220px] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset ${s ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`;
  return (
    <span className="flex flex-wrap gap-1">
      {list.slice(0, max).map((h) => link
        ? <Link key={h.id} href={`/hosting/${h.id}`} title={h.suspended ? `${h.domain} — suspended` : h.domain} className={`${cls(h.suspended)} hover:underline`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${h.suspended ? "bg-rose-500" : "bg-emerald-500"}`} /><span className="truncate">{h.domain}</span></Link>
        : <span key={h.id} className={cls(h.suspended)}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${h.suspended ? "bg-rose-500" : "bg-emerald-500"}`} /><span className="truncate">{h.domain}</span></span>)}
      {list.length > max && <span className="text-[0.6875rem] text-ink-faint">+{list.length - max}</span>}
    </span>
  );
}
