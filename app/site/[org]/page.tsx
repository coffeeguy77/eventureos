import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, MapPin, Phone, Mail } from "lucide-react";
import { publicOrg } from "@/lib/bookings/server";
import { readSite } from "@/lib/site/site";
import { newPages } from "@/lib/site/pages";
import { copyOf, ed, edImg } from "@/lib/site/copy";
import { readEvents } from "@/lib/events/core";
import { readCafe } from "@/lib/cafe/core";
import { readShop } from "@/lib/shop/core";
import { readJobSettings } from "@/lib/jobs/core";
import { readLearnSettings } from "@/lib/learn/core";
import { readSettings } from "@/lib/bookings/core";
import { readHireSettings } from "@/lib/hire/core";
import { siteMeta } from "@/lib/site/meta";
import { SiteFrame, internalHref } from "@/components/site/site-frame";
import { ContactForm } from "@/components/events/contact-form";
import { WRAP } from "@/components/shop/frame";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string }> };

const eyebrow = "text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[var(--pk)]";
const h2 = "shop-serif text-[2.125rem] font-medium leading-[1.06] sm:text-[2.75rem]";
const btnPk = "shop-btn inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-[var(--pk)] px-8 text-[0.9375rem] font-semibold text-white shadow-[0_14px_28px_-16px_var(--pk)] hover:brightness-105";
const btnLine = "shop-btn inline-flex h-[52px] items-center justify-center gap-2 rounded-full border border-[#1F1B19] bg-white/70 px-8 text-[0.9375rem] font-semibold text-[#1F1B19] hover:bg-white";

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const org = await publicOrg((await params).org);
  if (!org) return {};
  const c = copyOf(org.rawSettings, "home");
  return siteMeta(org, `/site/${org.slug}`, { title: { absolute: c("meta.title", org.name) }, description: c("meta.description", c("hero.text", "")).slice(0, 300) || undefined });
}

/** The business's home page: what it does, a card for every part of the website, about, and a contact form. */
export default async function SiteHome({ params }: P) {
  const org = await publicOrg((await params).org);
  if (!org) notFound();
  const raw = org.rawSettings;
  const site = readSite(raw);
  const c = copyOf(raw, "home");
  const T = (key: string, fallback: string) => ({ ...ed(`copy:home.${key}`, /\n/.test(c(key, fallback)) ? c(key, fallback) : undefined), children: c(key, fallback) });
  const all = new Set(newPages(raw, org.name).map((p) => p.path));
  const ev = readEvents(raw), cafe = readCafe(raw), shop = readShop(raw), jobs = readJobSettings(raw, org.name), learn = readLearnSettings(raw), booking = readSettings(raw);
  const hire = readHireSettings(raw);
  // Coffee businesses keep their wording; everyone else gets plain, general words until they write their own
  const coffee = ev.enabled || cafe.enabled || shop.enabled || booking.enabled;
  const W = coffee
    ? { cardsTitle: "Everything coffee, in one place.", contactTitle: "Come in for a coffee." }
    : { cardsTitle: "How we can help.", contactTitle: "We'd love to hear from you." };
  const extraPages = site.pages.filter((p) => p.menu && !/^(about|contact)/.test(p.slug) && p.layout === "standard");
  const cards = [
    { k: "hireshop", on: hire.shop.enabled, title: "Hire", text: "See what's free for your dates and book online in a couple of minutes.", link: "Browse & book", img: site.images.hireshop ?? hire.shop.heroImage ?? hire.shop.slides[0]?.image ?? null },
    { k: "hire", on: all.has("/hire"), title: "Event hire", text: "Coffee carts, vans and catering for your next event.", link: "Plan your event", img: site.images.hire ?? ev.images.hero ?? null },
    { k: "classes", on: all.has("/classes"), title: "Barista classes", text: "Hands-on barista courses for home and for work.", link: "See classes", img: site.images.classes ?? booking.landing.heroImage ?? null },
    { k: "academy", on: all.has("/academy"), title: learn.name, text: "Learn online, at your own pace.", link: "Start learning", img: site.images.academy ?? learn.heroImage ?? null },
    { k: "cafe", on: all.has("/cafe"), title: "Our café", text: "Coffee, kitchen and opening hours.", link: "Visit the café", img: site.images.cafe ?? cafe.heroImage ?? null },
    { k: "shop", on: all.has("/shop"), title: "Shop coffee", text: "Freshly roasted beans, delivered.", link: "Shop now", img: site.images.shop ?? shop.heroImage ?? null },
    { k: "jobs", on: all.has("/jobs"), title: "Barista jobs", text: "Find barista work, or find staff.", link: "Job board", img: site.images.jobs ?? jobs.heroImage ?? null },
    ...extraPages.map((p) => ({ k: `page-${p.slug}`, on: true, title: p.title, text: p.intro || p.metaDescription || "", link: "Find out more", img: p.heroImage })),
  ].filter((x) => x.on);
  const href = (k: string) => k === "hireshop" ? `/hire/${org.slug}/shop` : k.startsWith("page-") ? `/site/${org.slug}/${k.slice(5)}` : internalHref(org.slug, k === "classes" ? "/classes" : `/${k}`);
  const about = site.pages.find((p) => p.slug.startsWith("about"));
  const contact = site.pages.find((p) => p.slug.startsWith("contact"));

  return (
    <SiteFrame org={org}>
      {/* Hero */}
      <section className="relative overflow-hidden">
        {site.images.hero && (
          <div className="relative h-[280px] sm:h-[380px] lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[54%]">
            <img {...edImg("site.images.hero")} src={site.images.hero} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-y-0 left-0 hidden w-56 bg-gradient-to-r from-[#FCFAF7] via-[#FCFAF7]/60 to-transparent lg:block" />
          </div>
        )}
        <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-6">
          <div className={`py-12 lg:py-[88px] ${site.images.hero ? "lg:min-h-[580px] lg:max-w-[600px]" : "max-w-[760px]"}`}>
            <p className={eyebrow} {...T("hero.eyebrow", org.name)} />
            <h1 className="shop-serif mt-4 whitespace-pre-line text-[2.75rem] font-medium leading-[1.04] tracking-[-0.02em] sm:text-[3.75rem]" {...T("hero.title", org.name)} />
            <p className="mt-5 max-w-[470px] whitespace-pre-line text-[1.125rem] leading-[1.6] text-[#2B2522]" {...T("hero.text", "")} />
            <div className="mt-8 flex flex-wrap gap-3">
              {cards[0] && <Link href={href(cards[0].k)} className={btnPk}><span {...T("hero.button1", cards[0].link)} /><ArrowRight className="h-4 w-4" /></Link>}
              {cards[1] ? <Link href={href(cards[1].k)} className={btnLine}><span {...T("hero.button2", cards[1].link)} /></Link>
                : <a href="#contact" className={btnLine}><span {...T("hero.button2", "Get in touch")} /></a>}
            </div>
            {org.address && <p className="mt-8 flex items-start gap-2 text-[0.9375rem] text-[#5E5853]"><MapPin className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--pk)]" />{org.address}</p>}
          </div>
        </div>
      </section>

      {/* What we do */}
      {cards.length > 0 && (
        <section className={`${WRAP} py-16 sm:py-20`}>
          <p className={eyebrow} {...T("cards.eyebrow", "What we do")} />
          <h2 className={`${h2} mt-2`} {...T("cards.title", W.cardsTitle)} />
          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((x) => (
              <Link key={x.k} href={href(x.k)} className="shop-card flex flex-col overflow-hidden rounded-xl bg-white shadow-[0_10px_30px_-24px_rgba(60,30,20,.45)] ring-1 ring-[#EFE6DF]">
                <div className="h-[200px] overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--pk)_10%,#FFF6F1),#F6EDE6)]">
                  {x.img ? <img {...(x.k.startsWith("page-") ? {} : edImg(`site.images.${x.k}`))} src={x.img} alt="" className="shop-zoom h-full w-full object-cover" /> : <div {...(x.k.startsWith("page-") ? {} : edImg(`site.images.${x.k}`))} className="h-full w-full" />}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="shop-serif text-[1.375rem] font-medium" {...T(`card.${x.k}.title`, x.title)} />
                  <p className="mt-2 flex-1 text-[0.9063rem] leading-relaxed text-[#5E5853]" {...T(`card.${x.k}.text`, x.text)} />
                  <span className="mt-4 inline-flex items-center gap-1 text-[0.875rem] font-semibold text-[var(--pk)]"><span {...T(`card.${x.k}.link`, x.link)} /><ArrowRight className="h-4 w-4" /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* About (left out until there's something to say) */}
      {(site.images.about || c("about.text", "") || about) && <section className="bg-[color-mix(in_srgb,var(--pk)_6%,#FFF8F5)] py-16 sm:py-20">
        <div className={`${WRAP} grid items-center gap-10 lg:grid-cols-2`}>
          {site.images.about
            ? <img {...edImg("site.images.about")} src={site.images.about} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
            : <div {...edImg("site.images.about")} className="hidden aspect-[4/3] w-full rounded-xl bg-white/60 ring-1 ring-[#EFE6DF] lg:block" />}
          <div>
            <p className={eyebrow} {...T("about.eyebrow", "About us")} />
            <h2 className={`${h2} mt-2 whitespace-pre-line`} {...T("about.title", org.name)} />
            <p className="mt-4 max-w-[520px] whitespace-pre-line text-[1rem] leading-relaxed text-[#5E5853]" {...T("about.text", "")} />
            {about && <Link href={`/site/${org.slug}/${about.slug}`} className={`${btnLine} mt-6`}><span {...T("about.button", "Our story")} /><ArrowRight className="h-4 w-4" /></Link>}
          </div>
        </div>
      </section>}

      {/* Contact */}
      <section className={`${WRAP} grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]`} id="contact">
        <div>
          <p className={eyebrow} {...T("contact.eyebrow", "Get in touch")} />
          <h2 className={`${h2} mt-2`} {...T("contact.title", W.contactTitle)} />
          <ul className="mt-6 space-y-3 text-[0.9688rem]">
            {org.address && <li className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pk)]" />{org.address}</li>}
            {org.contact_phone && <li className="flex items-center gap-3"><Phone className="h-5 w-5 shrink-0 text-[var(--pk)]" /><a href={`tel:${org.contact_phone.replace(/[^\d+]/g, "")}`} className="hover:underline">{org.contact_phone}</a></li>}
            {org.contact_email && <li className="flex items-center gap-3"><Mail className="h-5 w-5 shrink-0 text-[var(--pk)]" /><a href={`mailto:${org.contact_email}`} className="hover:underline">{org.contact_email}</a></li>}
          </ul>
          {contact && <Link href={`/site/${org.slug}/${contact.slug}`} className="mt-6 inline-flex items-center gap-1 text-[0.9375rem] font-semibold text-[var(--pk)]">All contact details<ArrowRight className="h-4 w-4" /></Link>}
        </div>
        <div className="rounded-xl bg-white p-6 ring-1 ring-[#EFE6DF] sm:p-8">
          <ContactForm slug={org.slug} section="contact" heading="Send us a message" plain />
        </div>
      </section>
    </SiteFrame>
  );
}
