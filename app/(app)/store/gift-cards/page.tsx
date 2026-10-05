import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDate, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ShopGiftCards() {
  const { supabase, org } = await requireOrg();
  const { data } = await supabase.from("shop_gift_cards").select("id, code, amount, balance, status, purchaser_name, purchaser_email, recipient_name, recipient_email, send_on, sent_at, expires_on, created_at, view_token, source").eq("organisation_id", org.id).neq("status", "pending").order("created_at", { ascending: false }).limit(300);
  const live = (data ?? []).filter((g) => g.status === "active");
  return (
    <>
      <PageHeader title="Coffee gift cards" subtitle={`${live.length} active · ${money(live.reduce((a, g) => a + Number(g.balance), 0), org.currency)} still to be spent. Course gift certificates are under Bookings.`} />
      {!data?.length ? <Card><EmptyState title="No coffee gift cards yet">They appear here when someone buys one in the shop.</EmptyState></Card> : (
        <Card className="divide-y divide-line overflow-hidden">
          {data.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[0.8125rem]">
              <div className="w-44"><p className="font-mono font-semibold text-ink">{g.code}</p><p className="text-ink-faint">{fmtDate((g.created_at as string).slice(0, 10))}</p></div>
              <div className="min-w-0 flex-1"><p className="text-ink">{g.recipient_name ? `For ${g.recipient_name}` : "—"}{g.purchaser_name ? ` · from ${g.purchaser_name}` : ""}</p><p className="text-ink-muted">{g.purchaser_email}{g.recipient_email ? ` → ${g.recipient_email}${g.sent_at ? "" : g.send_on ? ` on ${g.send_on}` : ""}` : ""}</p></div>
              <p className="font-semibold text-ink">{money(g.balance, org.currency, { cents: true })}<span className="font-normal text-ink-faint"> / {money(g.amount, org.currency)}</span></p>
              <Badge tone={g.status === "active" ? "green" : g.status === "redeemed" ? "slate" : "red"}>{g.status === "active" ? "Active" : g.status === "redeemed" ? "Used" : "Void"}</Badge>
              <a href={`/shop/${org.slug}/gift-card/${g.view_token}`} target="_blank" rel="noreferrer" className="font-medium text-ink underline">View</a>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
