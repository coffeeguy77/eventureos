import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronRight, Mail, MapPin, Phone } from "lucide-react";
import { productPage, shopAvailability, shopOrg, siteLinks, type ShopItem } from "@/lib/hire/shop";
import { OwnerEdit } from "@/components/rentals/shop/owner-edit";
import { brandOf } from "@/lib/hire/core";
import { addDaysISO, todayISO } from "@/lib/format";
import { appBaseUrl } from "@/lib/integrations/registry";
import { Frame } from "@/components/rentals/shop/hire-shop";
import { Gallery, ProductBuy } from "@/components/rentals/shop/product-buy";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ org: string; item: string }> };

const plain = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { org: slug, item } = await params;
  const so = await shopOrg(slug);
  const pg = so ? await productPage(so, item) : null;
  if (!so || !pg) return { title: "Not found", robots: { index: false } };
  const brand = brandOf(so.s, pg.item.id)?.name ?? so.org.name;
  const title = pg.item.seo_title || `${pg.item.name} hire | ${brand}`;
  const description = pg.item.seo_description || plain(pg.item.description || pg.item.details).slice(0, 155) || `Hire ${pg.item.name} from ${brand}. Check your dates and book online.`;
  const url = `/hire/${so.org.slug}/shop/${pg.item.slug}`;
  return {
    title: { absolute: title }, description, alternates: { canonical: url },
    openGraph: { type: "website", title, description, url, siteName: brand, images: pg.item.images.length ? pg.item.images.slice(0, 4) : so.org.logo_url ? [so.org.logo_url] : [] },
  };
}

/** An item's own page in the hire shop — found in search, with photos, the full write-up, live availability and booking. */
export default async function HireItemPage({ params, searchParams }: Params & { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { org: slug, item } = await params;
  const sp = await searchParams;
  const so = await shopOrg(slug);
  if (!so) notFound();
  const pg = await productPage(so, item);
  if (!pg) notFound();
  const { org, s } = so;
  const { item: it, me, related, more } = pg;
  const today = todayISO(org.timezone);
  const startDate = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) && sp.from >= today ? sp.from : addDaysISO(today, 1);
  const endDate = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && sp.to >= startDate ? sp.to : s.defaultEnd > s.defaultStart ? startDate : addDaysISO(startDate, 1);
  const window = { startDate, startTime: s.defaultStart, endDate, endTime: s.defaultEnd };
  const avail = await shopAvailability(so, window).catch(() => ({}));
  const brand = brandOf(s, it.id);
  const colour = org.brand_colour && /^#[0-9a-f]{6}$/i.test(org.brand_colour) ? org.brand_colour : "#1f2937";
  const base = `/hire/${org.slug}/shop`;
  const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: org.currency, minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const paras = (it.details ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const addons = related.filter((r) => r.id !== it.id).slice(0, 6);
  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: it.name, description: plain(it.details || it.description) || undefined,
    image: it.images.length ? it.images : undefined, category: it.category ?? undefined, brand: { "@type": "Brand", name: brand?.name ?? org.name },
    offers: { "@type": "Offer", url: `${appBaseUrl()}${base}/${it.slug}`, priceCurrency: org.currency, price: me.price.toFixed(2), availability: "https://schema.org/InStock",
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut", seller: { "@type": "LocalBusiness", name: org.name, telephone: org.contact_phone ?? undefined, address: org.address ?? undefined } },
  };
  const card = (x: ShopItem) => (
    <a key={x.id} href={x.slug ? `${base}/${x.slug}` : `${base}?add=${x.id}:1`} className="flex flex-col rounded-2xl bg-white p-3 ring-1 ring-zinc-200 transition hover:shadow-md">
      {x.image && <img src={x.image} alt={x.name} loading="lazy" className="mb-3 aspect-[4/3] w-full rounded-xl object-cover" />}
      <span className="text-[0.9375rem] font-semibold leading-snug text-zinc-900">{x.name}</span>
      <span className="mt-auto pt-2 text-[0.9375rem] font-bold text-zinc-900">{money(x.price)}<span className="ml-1 text-[0.75rem] font-medium text-zinc-500">{x.priceNote}</span></span>
    </a>
  );

  return (
    <Frame org={{ name: org.name, logo: org.logo_url, phone: org.contact_phone, email: org.contact_email, address: org.address }} colour={colour} logoSize={s.shop.logoSize} home={siteLinks(so).home ?? base} links={siteLinks(so).links}>
      <OwnerEdit slug={org.slug} href={`/rentals/items/${it.id}`} label="Edit item" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8">
        <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1 text-[0.8125rem] text-zinc-500">
          <a href={base} className="hover:text-zinc-900 hover:underline">Hire</a>
          {it.category && <><ChevronRight className="h-3.5 w-3.5" /><a href={`${base}#${encodeURIComponent(it.category)}`} className="hover:text-zinc-900 hover:underline">{it.category}</a></>}
          <ChevronRight className="h-3.5 w-3.5" /><span className="text-zinc-900">{it.name}</span>
        </nav>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            {brand && s.brands.length > 1 && <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[var(--bc)]">{brand.name}</p>}
            <h1 className="mt-1 text-[2rem] font-extrabold leading-tight tracking-tight text-zinc-900 sm:text-[2.5rem]">{it.name}</h1>
            <p className="mt-2 text-[1.25rem] font-bold text-zinc-900">{money(me.price)}<span className="ml-1.5 text-[0.875rem] font-medium text-zinc-500">{me.priceNote}</span></p>
            {it.description && <p className="mt-3 max-w-2xl whitespace-pre-line text-[1.0625rem] leading-relaxed text-zinc-600">{it.description}</p>}
            {it.images.length > 0 && <div className="mt-6"><Gallery images={it.images} name={it.name} /></div>}
          </div>
          <aside className="lg:pt-2">
            <div className="lg:sticky lg:top-4">
              <ProductBuy slug={org.slug} tz={org.timezone} today={today} currency={org.currency} item={me} addons={addons} initialWindow={window} initialAvail={avail} />
            </div>
          </aside>
        </div>

        {(paras.length > 0 || it.specs.length > 0) && (
          <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
            {paras.length > 0 && (
              <section className="min-w-0">
                <h2 className="text-[1.375rem] font-bold text-zinc-900">About the {it.name}</h2>
                <div className="mt-3 max-w-3xl space-y-4 text-[1rem] leading-relaxed text-zinc-700">{paras.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>
              </section>
            )}
            {it.specs.length > 0 && (
              <section>
                <h2 className="text-[1.125rem] font-bold text-zinc-900">Details</h2>
                <dl className="mt-3 divide-y divide-zinc-100 rounded-2xl bg-white ring-1 ring-zinc-200">
                  {it.specs.map((x) => <div key={x.label} className="flex justify-between gap-4 px-4 py-3 text-[0.9375rem]"><dt className="text-zinc-500">{x.label}</dt><dd className="text-right font-medium text-zinc-900">{x.value}</dd></div>)}
                </dl>
              </section>
            )}
          </div>
        )}

        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="text-[1.375rem] font-bold text-zinc-900">You might also like</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{related.slice(0, 8).map(card)}</div>
          </section>
        )}
        {more.length > 0 && (
          <section className="mt-12">
            <h2 className="text-[1.375rem] font-bold text-zinc-900">More {it.category ?? "to hire"}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{more.map(card)}</div>
          </section>
        )}

        <section className="mt-12 grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-zinc-200 sm:grid-cols-3 sm:p-6">
          <div className="sm:col-span-3"><h2 className="text-[1.125rem] font-bold text-zinc-900">Questions about the {it.name}?</h2><p className="mt-1 text-[0.9375rem] text-zinc-600">Talk to {brand && s.brands.length > 1 ? brand.name : org.name} — happy to help plan your event.</p></div>
          {(brand?.phone ?? org.contact_phone) && <a href={`tel:${(brand?.phone ?? org.contact_phone)!.replace(/\s/g, "")}`} className="flex items-center gap-2 text-[0.9375rem] font-semibold text-zinc-900 hover:text-[var(--bc)]"><Phone className="h-4 w-4" />{brand?.phone ?? org.contact_phone}</a>}
          {(brand?.email ?? org.contact_email) && <a href={`mailto:${brand?.email ?? org.contact_email}`} className="flex items-center gap-2 break-all text-[0.9375rem] font-semibold text-zinc-900 hover:text-[var(--bc)]"><Mail className="h-4 w-4 shrink-0" />{brand?.email ?? org.contact_email}</a>}
          {org.address && <p className="flex items-start gap-2 text-[0.9375rem] text-zinc-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{org.address.replace(/\n/g, ", ")}</p>}
        </section>
      </div>
    </Frame>
  );
}
