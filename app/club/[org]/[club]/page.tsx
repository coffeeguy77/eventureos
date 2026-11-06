import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { clubCtx, accountBookings } from "@/lib/club/server";
import { currentViewer } from "@/lib/club/auth";
import { orderLink } from "@/lib/wholesale/orders";
import { todayISO } from "@/lib/format";
import { addDays } from "@/lib/events/days";
import { ClubApp, ClubLogin } from "./ui";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string; club: string }>; searchParams: Promise<{ open?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { org, club } = await params;
  const c = await clubCtx(org, club);
  if (!c) return { robots: { index: false, follow: false } };
  return { title: `${c.s.name} · ${c.account.name} — ${c.org.name}`, robots: { index: false, follow: false } };
}

const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");

export default async function ClubPage({ params, searchParams }: P) {
  const { org, club } = await params;
  const sp = await searchParams;
  const c = await clubCtx(org, club);
  if (!c) notFound();
  // On the business's own domain the page lives at /<club>; on EventureOS at /club/<business>/<club>
  const base = (await headers()).get("x-site-host") ? `/${club}` : `/club/${org}/${club}`;
  const brand = { name: c.org.name, logo: c.org.logo_url && /^https:\/\//.test(c.org.logo_url) ? c.org.logo_url : null, colour: safeColour(c.org.brand_colour), phone: c.org.contact_phone, email: c.org.settings.reply_to ?? c.org.contact_email };
  const person = await currentViewer(c);
  if (!person) return <ClubLogin org={org} club={club} clubName={c.s.name} account={c.account.name} brand={brand} />;

  const today = todayISO(c.org.timezone);
  const bookings = await accountBookings(c.db, c.account.id, addDays(today, -60));
  let wholesale: string | null = null;
  if (c.account.wholesale_customer_id) {
    const { data: w } = await c.db.from("wholesale_customers").select("order_token, active").eq("id", c.account.wholesale_customer_id).maybeSingle();
    if (w?.active && w.order_token) wholesale = orderLink(w.order_token as string);
  }
  return (
    <ClubApp
      org={org} club={club} base={base} clubName={c.s.name} account={c.account.name} brand={brand} today={today}
      me={{ id: person.id, name: person.name, staff: person.staff, actingFor: person.actingFor }} offers={c.account.offers} rates={c.account.rates} standards={c.account.standard_orders}
      billing={c.account.billing} bookings={bookings} wholesale={wholesale} open={sp.open && /^[0-9a-f-]{36}$/i.test(sp.open) ? sp.open : null}
    />
  );
}
