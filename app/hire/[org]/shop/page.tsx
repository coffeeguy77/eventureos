import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { shopAvailability, shopOrg, catalogue, siteLinks } from "@/lib/hire/shop";
import { OwnerEdit } from "@/components/rentals/shop/owner-edit";
import { loadItems } from "@/lib/hire/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { addDaysISO, todayISO } from "@/lib/format";
import { HireShop } from "@/components/rentals/shop/hire-shop";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const so = await shopOrg((await params).org);
  if (!so) return { title: "Not found" };
  const title = `Hire — ${so.org.name}`;
  const description = so.s.shop.intro ?? `Check what's available for your dates and book online with ${so.org.name}.`;
  return { title: { absolute: title }, description, alternates: { canonical: `/hire/${so.org.slug}/shop` }, openGraph: { title, description, siteName: so.org.name, images: so.s.shop.slides[0]?.image ? [so.s.shop.slides[0].image] : so.s.shop.heroImage ? [so.s.shop.heroImage] : so.org.logo_url ? [so.org.logo_url] : [] } };
}

/** The public hire shop: pick dates, see what's free and what it costs, and book. */
export default async function HireShopPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ from?: string; to?: string; st?: string; et?: string; add?: string }> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const so = await shopOrg(slug);
  if (!so) notFound();
  const { org, s } = so;
  const today = todayISO(org.timezone);
  const items = catalogue(await loadItems(createServiceClient(), org.id, { activeOnly: true }), s);
  const d = (v: string | undefined, f: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= today ? v : f);
  const startDate = d(sp.from, addDaysISO(today, 1));
  const fallbackEnd = s.defaultEnd > s.defaultStart ? startDate : addDaysISO(startDate, 1);
  const endDate = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && sp.to >= startDate ? sp.to : fallbackEnd;
  const tm = (v: string | undefined, f: string) => (v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : f);
  const window = { startDate, startTime: tm(sp.st, s.defaultStart), endDate, endTime: tm(sp.et, s.defaultEnd) };
  const avail = await shopAvailability(so, window).catch(() => ({}));
  const usedBrands = new Set(items.map((i) => i.brand));
  // ?add=<item id>:<qty>,… from an item's page
  const add = (sp.add ?? "").split(",").slice(0, 20).flatMap((p) => {
    const [id, q] = p.split(":");
    const it = items.find((i) => i.id === id);
    return it ? [{ id: it.id, qty: Math.max(1, Math.min(it.kind === "sale" ? 999 : it.max, Math.round(Number(q) || 1))) }] : [];
  });
  return (
    <>
    <HireShop site={siteLinks(so)}
      slug={org.slug} tz={org.timezone} today={today} currency={org.currency}
      org={{ name: org.name, logo: org.logo_url, colour: org.brand_colour, phone: org.contact_phone, email: org.contact_email, address: org.address }}
      items={items} brands={s.brands.filter((b) => usedBrands.has(b.key)).map((b) => ({ key: b.key, name: b.name }))}
      settings={{ depositPct: s.depositPct, zone: s.deliveryZone, instant: s.shop.instantBook && org.stripeReady, intro: s.shop.intro, defaultStart: s.defaultStart, defaultEnd: s.defaultEnd,
        look: { heading: s.shop.heading, heroImage: s.shop.heroImage, slides: s.shop.slides, logoSize: s.shop.logoSize } }}
      initialWindow={window} initialAvail={avail} initialAdd={add}
    />
    <OwnerEdit slug={org.slug} href="/rentals/settings" label="Edit shop" />
    </>
  );
}
