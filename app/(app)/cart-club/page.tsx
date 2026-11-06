import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { money, todayISO } from "@/lib/format";
import { daysText, OFFER_LABEL, cleanOffers } from "@/lib/club/core";
import { clubUrl, readClubSettings } from "@/lib/club/server";
import { appBaseUrl } from "@/lib/integrations/registry";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddClient, ClubSettingsForm } from "@/components/club/office";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cart Club" };

/** Special clients who book carts on their own page, at their own rates. */
export default async function CartClubPage() {
  const { org } = await requireOrg();
  const db = createServiceClient();
  const s = readClubSettings(org.settings);
  const today = todayISO(org.timezone);
  const { data: accts, error } = await db.from("cart_club_accounts").select("id, slug, name, enabled, offers, billing, customer_id").eq("organisation_id", org.id).order("name");
  if (error) {
    return (<>
      <PageHeader eyebrow="Events" title={s.name} subtitle="A booking page for your special clients" />
      <Card className="p-5 text-[0.875rem] text-ink">Cart Club needs one database update before it can be used: run <b>supabase/migrations/0101_cart_club.sql</b> in Supabase → SQL Editor, then refresh this page.</Card>
    </>);
  }
  const ids = (accts ?? []).map((a) => a.id as string);
  const [{ data: people }, { data: bookings }] = await Promise.all([
    ids.length ? db.from("cart_club_people").select("account_id").in("account_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("cart_club_bookings").select("id, account_id, number, status, title, days, carts, van, baristas, coffees, total, created_by_name, booked_by_name, first_day, last_day").in("account_id", ids).neq("status", "cancelled").gte("last_day", today).order("first_day").limit(200) : Promise.resolve({ data: [] }),
  ]);
  type B = { id: string; account_id: string; number: number; status: string; title: string; days: { date: string }[]; carts: number; van: number; baristas: number; coffees: number; total: number; created_by_name: string | null; booked_by_name: string | null };
  const B = (bookings ?? []) as B[];
  const count = (id: string, st: string) => B.filter((b) => b.account_id === id && b.status === st).length;
  const nameOf = new Map((accts ?? []).map((a) => [a.id as string, a.name as string]));
  const orgLike = { slug: org.slug, settings: org.settings };
  return (
    <>
      <PageHeader eyebrow="Events" title={s.name} subtitle="Special clients book on their own page, at their own rates — quotes stay editable until they hit Book" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Clients" subtitle={`${(accts ?? []).filter((a) => a.enabled).length} on ${s.name}`} />
            <ul className="divide-y divide-line border-t border-line">
              {!(accts ?? []).length && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">No clients yet — add one on the right, or use “Add to Cart Club” on any client.</li>}
              {(accts ?? []).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/cart-club/${a.id}`} className="text-[0.875rem] font-semibold text-ink hover:text-brand-700 hover:underline">{a.name}</Link>
                    <p className="text-[0.75rem] text-ink-muted">{cleanOffers(a.offers).map((o) => OFFER_LABEL[o]).join(", ")} · {a.billing === "monthly" ? "month-end invoice" : "invoice on booking"} · {(people ?? []).filter((p) => p.account_id === a.id).length} people</p>
                  </div>
                  {count(a.id as string, "quote") > 0 && <Badge tone="red">{count(a.id as string, "quote")} not booked</Badge>}
                  {count(a.id as string, "booked") > 0 && <Badge tone="green">{count(a.id as string, "booked")} booked</Badge>}
                  {!a.enabled && <Badge tone="slate">Off</Badge>}
                  {a.enabled && <a href={clubUrl(orgLike, a.slug as string)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-brand-700 hover:underline">/{a.slug}<ExternalLink className="h-3 w-3" /></a>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Coming up" subtitle="Quotes and bookings from every club client" />
            <ul className="divide-y divide-line border-t border-line">
              {!B.length && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">Nothing coming up.</li>}
              {B.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="w-28 shrink-0 font-medium text-ink">{daysText(b.days)}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/cart-club/${b.account_id}`} className="font-medium text-ink hover:underline">{nameOf.get(b.account_id)} — {b.title}</Link>
                    <p className="text-[0.75rem] text-ink-muted">{[b.carts && `${b.carts} cart`, b.van && `${b.van} van`, b.baristas && `${b.baristas} barista`, b.coffees && `${b.coffees} coffees`].filter(Boolean).join(" · ")} · {b.status === "booked" ? `booked by ${b.booked_by_name}` : `quote by ${b.created_by_name}`}</p>
                  </div>
                  <span className="text-ink">{money(Number(b.total))}</span>
                  <Badge tone={b.status === "booked" ? "green" : "red"}>{b.status === "booked" ? "Booked" : "Not booked"}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-5">
          <Card><AddClient /></Card>
          <Card>
            <CardHeader title="Settings" subtitle="For every club client" />
            <ClubSettingsForm name={s.name} codes={s.codes as unknown as Record<string, string>} base={s.base} eventureUrl={`${appBaseUrl().replace(/^https?:\/\//, "")}/club/${org.slug}`} />
          </Card>
        </div>
      </div>
    </>
  );
}
