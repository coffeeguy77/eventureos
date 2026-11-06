import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { fmtDateTime, money, todayISO } from "@/lib/format";
import { daysText } from "@/lib/club/core";
import { ACCOUNT_COLS, BOOKING_COLS, clubUrl, readClubSettings, toAccount, type ClubBooking } from "@/lib/club/server";
import { appBaseUrl } from "@/lib/integrations/registry";
import { addDaysISO } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AccountForm, CancelBooking, ClubToggle, PeoplePanel, ResyncRuns, type PersonView } from "@/components/club/office";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cart Club client" };

export default async function CartClubAccount({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { org } = await requireOrg();
  const db = createServiceClient();
  const { data: row } = await db.from("cart_club_accounts").select(ACCOUNT_COLS).eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!row) notFound();
  const a = toAccount(row);
  const s = readClubSettings(org.settings);
  const today = todayISO(org.timezone);
  const [{ data: people }, { data: bookings }, { data: wholesale }, { data: twilio }, { data: runs }] = await Promise.all([
    db.from("cart_club_people").select("id, name, email, phone, active, welcomed_at, last_seen_at").eq("account_id", a.id).order("name"),
    db.from("cart_club_bookings").select(`${BOOKING_COLS}, invoice:invoices(id, number)`).eq("account_id", a.id).gte("last_day", addDaysISO(today, -90)).order("first_day").limit(200),
    db.from("wholesale_customers").select("id, name").eq("organisation_id", org.id).eq("active", true).order("name").limit(500),
    db.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "twilio").maybeSingle(),
    db.from("cart_club_runs").select("starts, ends, carts").eq("account_id", a.id).gte("ends", today).order("starts"),
  ]);
  type BB = ClubBooking & { invoice: { id: string; number: string } | null };
  const B = (bookings ?? []) as unknown as BB[];
  const url = clubUrl({ slug: org.slug, settings: org.settings }, a.slug);
  const prefix = s.base ? s.base.replace(/^https?:\/\//, "") : `${appBaseUrl().replace(/^https?:\/\//, "")}/club/${org.slug}`;
  return (
    <>
      <PageHeader eyebrow={<Link href="/cart-club" className="hover:underline">{s.name}</Link>} title={a.name}
        subtitle={a.enabled ? url.replace(/^https?:\/\//, "") : "Switched off — their page is closed"}
        actions={<div className="flex flex-wrap items-center gap-2">
          {a.enabled && <a href={url} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[0.7812rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">Open their page<ExternalLink className="h-3.5 w-3.5" /></a>}
          <Link href={`/clients/${a.customer_id}`} className="inline-flex h-8 items-center rounded-lg px-3 text-[0.7812rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50">Client</Link>
          <ClubToggle id={a.id} enabled={a.enabled} customerId={a.customer_id} />
        </div>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Bookings" subtitle="Red = quote not booked yet. Booking locks it, adds the job and calendar entries, and invoices per the settings." />
            <ul className="divide-y divide-line border-t border-line">
              {!B.length && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">No bookings yet.</li>}
              {B.map((b) => (
                <li key={b.id} className={`flex flex-wrap items-start gap-3 px-4 py-3 text-[0.8125rem] sm:px-5 ${b.status === "quote" ? "border-l-4 border-l-rose-500" : ""} ${b.status === "cancelled" ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={b.status === "booked" ? "green" : b.status === "quote" ? "red" : "slate"}>{b.status === "booked" ? "Booked" : b.status === "quote" ? "Not booked" : "Cancelled"}</Badge>
                      <span className="font-semibold text-ink">#{b.number} {b.title}</span>
                    </div>
                    <p className="mt-0.5 text-ink">{daysText(b.days)}{b.days[0]?.start ? ` · ${b.days[0].start}–${b.days[0].finish ?? ""}` : ""}{b.venue || b.address ? ` · ${b.venue || b.address}` : ""}</p>
                    <p className="text-[0.75rem] text-ink-muted">{[b.carts && `${b.carts} cart${b.carts > 1 ? "s" : ""}`, b.van && `${b.van} van`, b.baristas && `${b.baristas} barista${b.baristas > 1 ? "s" : ""}`, b.coffees && `${b.coffees} coffees`].filter(Boolean).join(" · ")}
                      {" · "}{b.status === "booked" ? `booked by ${b.booked_by_name} ${fmtDateTime(b.booked_at, org.timezone)}` : `quote by ${b.created_by_name ?? "—"}`}</p>
                    <p className="mt-1 flex flex-wrap gap-3 text-[0.75rem]">
                      {b.event_id && <Link href={`/events/${b.event_id}`} className="font-medium text-brand-700 hover:underline">Job</Link>}
                      {b.invoice && <Link href={`/invoices/${b.invoice.id}`} className="font-medium text-brand-700 hover:underline">Invoice {b.invoice.number}</Link>}
                      {b.status === "booked" && !b.invoice && a.billing === "monthly" && <span className="text-ink-muted">On the month-end invoice</span>}
                      {b.follow_up_at && b.status === "quote" && <span className="text-ink-muted">Follow-up sent</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-semibold text-ink">{money(Number(b.total))}</span>
                    {b.status !== "cancelled" && <CancelBooking id={b.id} />}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[0.75rem] text-ink-muted sm:px-5">
              <span>{(runs ?? []).length ? `Deliveries on the calendar: ${(runs ?? []).map((r) => `${daysText([{ date: r.starts as string }])}${r.ends !== r.starts ? `–${daysText([{ date: r.ends as string }])}` : ""} (${r.carts})`).join(", ")}` : "No deliveries coming up."}</span>
              <ResyncRuns id={a.id} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Settings" subtitle="What they can book, their rates and how they're invoiced" />
            <AccountForm a={a} wholesale={(wholesale ?? []) as { id: string; name: string }[]} urlPrefix={prefix} />
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="People" subtitle="Anyone here can sign in, make quotes and book. Their name goes on what they do." />
          <PeoplePanel accountId={a.id} people={(people ?? []) as PersonView[]} smsReady={twilio?.status === "connected"} />
        </Card>
      </div>
    </>
  );
}
