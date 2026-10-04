import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDate, money } from "@/lib/format";
import { NewGift, GiftActions } from "@/components/bookings/gift-tools";

export const dynamic = "force-dynamic";

type G = { id: string; code: string; amount: number; balance: number; status: string; purchaser_name: string | null; purchaser_email: string | null; recipient_name: string | null; recipient_email: string | null; send_on: string | null; sent_at: string | null; expires_on: string | null; source: string; created_at: string; view_token: string; course: { name: string } | null };

export default async function GiftsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const { supabase, org } = await requireOrg();
  let query = supabase.from("booking_gifts").select("id, code, amount, balance, status, purchaser_name, purchaser_email, recipient_name, recipient_email, send_on, sent_at, expires_on, source, created_at, view_token, course:booking_courses(name)")
    .eq("organisation_id", org.id).neq("status", "pending").order("created_at", { ascending: false }).limit(300);
  if (q) { const like = `%${q.replace(/[%_,()]/g, " ")}%`; query = query.or(`code.ilike.${like},purchaser_name.ilike.${like},recipient_name.ilike.${like},purchaser_email.ilike.${like}`); }
  const [{ data, error }, { data: courses }] = await Promise.all([query, supabase.from("booking_courses").select("id, name, price").eq("organisation_id", org.id).eq("active", true).order("position")]);
  if (error) return <Card className="p-6 text-[0.875rem] text-ink-muted">Run the 0049 database update (bookings) in Supabase first.</Card>;
  const gifts = (data ?? []) as unknown as G[];
  const live = gifts.filter((g) => g.status === "active");
  const outstanding = live.reduce((t, g) => t + Number(g.balance), 0);
  const sold = gifts.filter((g) => g.source === "stripe").reduce((t, g) => t + Number(g.amount), 0);

  return (
    <>
      <PageHeader title="Gift certificates" subtitle={`${live.length} active · ${money(outstanding, org.currency)} still to be used · ${money(sold, org.currency)} sold online`} />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div>
          <form className="mb-3"><input name="q" defaultValue={q} placeholder="Search code or name" className="h-10 w-full max-w-sm rounded-lg border border-line-strong bg-surface px-3 text-[0.875rem] text-ink" /></form>
          {gifts.length === 0 ? <Card><EmptyState title="No gift certificates yet">They appear here when someone buys one on your booking page, or when you make one.</EmptyState></Card> : (
            <Card className="divide-y divide-line overflow-hidden">
              {gifts.map((g) => (
                <div key={g.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                  <div className="w-full min-w-0 sm:w-44 sm:flex-none"><p className="font-mono text-[0.8438rem] font-semibold tracking-wide text-ink">{g.code}</p><p className="text-[0.75rem] text-ink-faint">{fmtDate(g.created_at.slice(0, 10))} · {g.source === "stripe" ? "online" : g.source}</p></div>
                  <div className="min-w-0 flex-1 text-[0.8125rem]">
                    <p className="text-ink">{g.course?.name ?? "Any class"}{g.recipient_name ? ` · for ${g.recipient_name}` : ""}</p>
                    <p className="text-ink-muted">{g.purchaser_name ? `From ${g.purchaser_name}` : ""}{g.purchaser_email ? ` (${g.purchaser_email})` : ""}{g.recipient_email ? ` · emailed to ${g.recipient_email}${g.sent_at ? "" : g.send_on ? ` on ${fmtDate(g.send_on)}` : ""}` : ""}</p>
                  </div>
                  <div className="text-right text-[0.8125rem]">
                    <p className="font-semibold text-ink">{money(g.balance, org.currency, { cents: Number(g.balance) % 1 !== 0 })}<span className="font-normal text-ink-faint"> / {money(g.amount, org.currency)}</span></p>
                    <p>{g.status === "active" ? <Badge tone="green">Active{g.expires_on ? ` · until ${fmtDate(g.expires_on, "short")}` : ""}</Badge> : g.status === "redeemed" ? <Badge tone="slate">Used</Badge> : <Badge tone="red">Void</Badge>}</p>
                  </div>
                  <GiftActions id={g.id} active={g.status === "active"} viewUrl={`/book/${org.slug}/gift/${g.view_token}`} />
                </div>
              ))}
            </Card>
          )}
        </div>
        <NewGift courses={((courses ?? []) as { id: string; name: string; price: number }[]).map((c) => ({ id: c.id, name: c.name, price: Number(c.price) }))} />
      </div>
    </>
  );
}
