import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";
import { publicOrg } from "@/lib/bookings/server";
import { blocks, inline, matchRule, readSite, type InfoPage, type PageSection } from "@/lib/site/site";
import { ed, edImg } from "@/lib/site/copy";
import { canonicalFor, siteMeta } from "@/lib/site/meta";
import { SiteFrame, internalHref } from "@/components/site/site-frame";
import { ContactForm } from "@/components/events/contact-form";
import { FranchiseLanding } from "@/components/site/franchise-landing";
import { agencyMode } from "@/lib/site/agency/server";
import { isAgencyPage, serviceBySlug } from "@/lib/site/agency/content";
import { serviceLd } from "@/lib/site/agency/ld";
import { AgencyFrame } from "@/components/site/agency/frame";
import { AgencyLanding } from "@/components/site/agency/landing";
import { AgencyQuote, AgencySupport, QUOTE_FAQS, SUPPORT_FAQS } from "@/components/site/agency/pages";
import { JsonLd, faqLd } from "@/components/site/agency/ui";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string; page: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

/**
 * A web/IT agency (Nerd Herd) also has service, quote and support pages written in code. A page the business made
 * itself with the same address always wins.
 */
async function loadAgency(p: P) {
  const { org: slug, page } = await p.params;
  if (!isAgencyPage(page) || !(await agencyMode(slug))) return null;
  const org = await publicOrg(slug);
  if (!org || readSite(org.rawSettings).pages.some((x) => x.slug === page)) return null;
  return { org, page };
}

const AGENCY_META: Record<string, { title: string; description: string }> = {
  quote: { title: "Get a Quote | Website Design, Hosting & Apps", description: "Request a quote for a new website, LeadPages or WordPress site, hosting, maintenance, Google Ads, SEO or a custom app. Canberra-based, clear prices." },
  support: { title: "Lodge a Support Ticket | Website, Email & Server Help", description: "Lodge a support request for your website, email or server. Get a ticket number straight away and track progress in the client portal." },
};

async function load(p: P) {
  const { org: slug, page } = await p.params;
  const org = await publicOrg(slug);
  if (!org) return null;
  const pg = readSite(org.rawSettings).pages.find((x) => x.slug === page);
  return pg ? { org, pg } : null;
}

export async function generateMetadata(p: P): Promise<Metadata> {
  const x = await load(p);
  if (!x) {
    const a = await loadAgency(p);
    if (!a) return {};
    const s = serviceBySlug(a.page), m = AGENCY_META[a.page];
    return siteMeta(a.org, `/site/${a.org.slug}/${a.page}`, s
      ? { title: { absolute: s.metaTitle.replace(/\| Web Culture$/, `| ${a.org.name}`) }, description: s.metaDescription }
      : { title: { absolute: `${m.title} | ${a.org.name}` }, description: m.description });
  }
  return siteMeta(x.org, `/site/${x.org.slug}/${x.pg.slug}`, {
    title: { absolute: x.pg.metaTitle || `${x.pg.title} | ${x.org.name}` },
    description: (x.pg.metaDescription || x.pg.intro || x.pg.body.replace(/[#*\-\n[\]()]+/g, " ")).replace(/\s+/g, " ").trim().slice(0, 300) || undefined,
  });
}

function Text({ s }: { s: string }) {
  return <>{inline(s).map((p, i) => p.t === "b" ? <strong key={i} className="font-semibold text-[#151312]">{p.v}</strong>
    : p.t === "a" ? (/^https?:/.test(p.href) ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--pk)] underline underline-offset-2">{p.v}</a> : <Link key={i} href={p.href} className="font-medium text-[var(--pk)] underline underline-offset-2">{p.v}</Link>)
    : <span key={i}>{p.v}</span>)}</>;
}

function Body({ pg }: { pg: InfoPage }) {
  return (
    <div {...ed(`site.pages.${pg.index}.body`, pg.body)} className="space-y-4 text-[1rem] leading-[1.75] text-[#3A3431]">
      {blocks(pg.body).map((b, i) => b.t === "h"
        ? <h2 key={i} className="shop-serif pt-4 text-[1.625rem] font-medium leading-tight text-[#151312]"><Text s={b.text} /></h2>
        : b.t === "ul" ? <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-[var(--pk)]">{b.items.map((it, j) => <li key={j}><Text s={it} /></li>)}</ul>
        : <p key={i}><Text s={b.text} /></p>)}
    </div>
  );
}

function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-4 text-[1rem] leading-[1.75] text-[#3A3431]">
      {blocks(text).map((b, i) => b.t === "h"
        ? <h3 key={i} className="shop-serif pt-2 text-[1.375rem] font-medium leading-tight text-[#151312]"><Text s={b.text} /></h3>
        : b.t === "ul" ? <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-[var(--pk)]">{b.items.map((it, j) => <li key={j}><Text s={it} /></li>)}</ul>
        : <p key={i}><Text s={b.text} /></p>)}
    </div>
  );
}

function Btn({ label, link, slug }: { label: string; link: string; slug: string }) {
  if (!label || !link) return null;
  const cls = "shop-btn inline-flex h-[52px] items-center justify-center rounded-full bg-[var(--pk)] px-8 text-[0.9375rem] font-semibold text-white hover:brightness-105";
  if (/^https:/.test(link)) return <a href={link} target="_blank" rel="noopener noreferrer" className={cls}>{label}</a>;
  // clean addresses (/contact, /hire/…) work on both the business's domain and EventureOS
  const href = /^\/(site|hire|shop|cafe|jobs|academy|book)\/[a-z0-9-]+/.test(link) || link.includes("#") ? link : internalHref(slug, link);
  return <Link href={href} className={cls}>{label}</Link>;
}

/** The blocks under a page's text: photo + words, photos, galleries, call-to-action bands. */
function Sections({ sections, slug }: { sections: PageSection[]; slug: string }) {
  return (
    <div className="space-y-16 pb-16 sm:space-y-20 sm:pb-20">
      {sections.map((x) => {
        if (x.type === "text") return (
          <section key={x.id} className="mx-auto max-w-[760px] px-5 sm:px-6">
            {x.heading && <h2 className="shop-serif mb-4 text-[2rem] font-medium leading-tight">{x.heading}</h2>}
            {x.body && <Rich text={x.body} />}
          </section>
        );
        if (x.type === "imageText") return (
          <section key={x.id} className="mx-auto grid max-w-[1200px] items-center gap-8 px-5 sm:px-6 lg:grid-cols-2 lg:gap-14">
            {x.image && <img src={x.image} alt={x.heading} loading="lazy" className={`aspect-[4/3] w-full rounded-xl object-cover ${x.side === "right" ? "lg:order-2" : ""}`} />}
            <div className={x.image ? "" : "lg:col-span-2 max-w-[760px]"}>
              {x.heading && <h2 className="shop-serif mb-4 text-[2rem] font-medium leading-tight">{x.heading}</h2>}
              {x.body && <Rich text={x.body} />}
              {x.label && x.link && <div className="mt-6"><Btn label={x.label} link={x.link} slug={slug} /></div>}
            </div>
          </section>
        );
        if (x.type === "image") return (
          <figure key={x.id} className={`mx-auto px-5 sm:px-6 ${x.wide ? "max-w-[1400px]" : "max-w-[960px]"}`}>
            {x.image && <img src={x.image} alt={x.caption} loading="lazy" className="w-full rounded-xl object-cover" />}
            {x.caption && <figcaption className="mt-3 text-center text-[0.875rem] text-[#5E5853]">{x.caption}</figcaption>}
          </figure>
        );
        if (x.type === "gallery") return (
          <section key={x.id} className="mx-auto max-w-[1200px] px-5 sm:px-6">
            {x.heading && <h2 className="shop-serif mb-6 text-[2rem] font-medium leading-tight">{x.heading}</h2>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{x.images.map((u, i) => <img key={u + i} src={u} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />)}</div>
          </section>
        );
        return (
          <section key={x.id} className="mx-auto max-w-[1200px] px-5 sm:px-6">
            <div className="rounded-2xl bg-[color-mix(in_srgb,var(--pk)_8%,#FFF8F5)] px-6 py-10 text-center sm:px-12 sm:py-14">
              {x.heading && <h2 className="shop-serif text-[2rem] font-medium leading-tight">{x.heading}</h2>}
              {x.body && <p className="mx-auto mt-3 max-w-[560px] text-[1.0625rem] text-[#5E5853]">{x.body}</p>}
              {x.label && x.link && <div className="mt-6"><Btn label={x.label} link={x.link} slug={slug} /></div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** One of the business's own pages (About, Contact, Franchise, …): heading, photo, text, and a form when it has one. */
export default async function InfoPageView(p: P) {
  const x = await load(p);
  if (!x) {
    const a = await loadAgency(p);
    if (a) return agencyPage(a.org, a.page, p);
    // A page that's been replaced: follow the SEO Saver's redirect for its old address
    const { org: slug, page } = await p.params;
    const org = await publicOrg(slug).catch(() => null);
    const m = org ? matchRule(readSite(org.rawSettings).rules, `/${page}`) : null;
    if (org && m && m.status === 301) permanentRedirect(m.to.startsWith("https://") ? m.to : internalHref(org.slug, m.to));
    notFound();
  }
  const { org, pg } = x;
  if (pg.layout === "franchise") return <SiteFrame org={org}><FranchiseLanding org={org} pg={pg} /></SiteFrame>;
  const i = pg.index;
  const contact = pg.form === "contact";
  return (
    <SiteFrame org={org}>
      <section className="border-b border-[#EFE6DF] bg-[color-mix(in_srgb,var(--pk)_5%,#FFF9F6)]">
        <div className={`mx-auto grid max-w-[1200px] items-center gap-8 px-5 py-12 sm:px-6 sm:py-16 ${pg.heroImage ? "lg:grid-cols-[1.1fr_0.9fr]" : ""}`}>
          <div className={pg.heroImage ? "" : "max-w-[780px]"}>
            {pg.eyebrow && <p {...ed(`site.pages.${i}.eyebrow`)} className="text-[0.8125rem] font-semibold uppercase tracking-[0.16em] text-[var(--pk)]">{pg.eyebrow}</p>}
            <h1 {...ed(`site.pages.${i}.title`)} className="shop-serif mt-3 text-[2.5rem] font-medium leading-[1.05] tracking-[-0.015em] sm:text-[3.25rem]">{pg.title}</h1>
            {pg.intro && <p {...ed(`site.pages.${i}.intro`)} className="mt-4 max-w-[620px] text-[1.125rem] leading-relaxed text-[#2B2522]">{pg.intro}</p>}
          </div>
          {pg.heroImage && <img {...edImg(`site.pages.${i}.heroImage`)} src={pg.heroImage} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />}
        </div>
      </section>

      <div className={`mx-auto grid max-w-[1200px] gap-12 px-5 py-12 sm:px-6 sm:py-16 ${pg.form !== "none" ? "lg:grid-cols-[minmax(0,1fr)_420px]" : ""}`}>
        <div className={pg.form === "none" ? "max-w-[760px]" : ""}>
          {pg.body ? <Body pg={pg} /> : <div {...ed(`site.pages.${i}.body`, "")} className="min-h-[2rem]" />}
          {contact && (
            <ul className="mt-8 space-y-3 text-[0.9688rem]">
              {org.address && <li className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pk)]" /><span>{org.address} · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(org.address)}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--pk)]">Get directions</a></span></li>}
              {org.contact_phone && <li className="flex items-center gap-3"><Phone className="h-5 w-5 shrink-0 text-[var(--pk)]" /><a href={`tel:${org.contact_phone.replace(/[^\d+]/g, "")}`} className="hover:underline">{org.contact_phone}</a></li>}
              {org.contact_email && <li className="flex items-center gap-3"><Mail className="h-5 w-5 shrink-0 text-[var(--pk)]" /><a href={`mailto:${org.contact_email}`} className="hover:underline">{org.contact_email}</a></li>}
            </ul>
          )}
          {contact && org.address && (
            <iframe title={`Map — ${org.address}`} src={`https://www.google.com/maps?q=${encodeURIComponent(org.address)}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
              className="mt-8 h-[320px] w-full rounded-xl border-0 ring-1 ring-[#EFE6DF]" />
          )}
        </div>
        {pg.form !== "none" && (
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-xl bg-white p-6 ring-1 ring-[#EFE6DF] sm:p-7">
              <p className="shop-serif mb-4 text-[1.5rem] font-medium">{pg.form === "franchise" ? "Ask about a franchise" : "Send us a message"}</p>
              <ContactForm slug={org.slug} section={pg.form} heading={pg.form === "franchise" ? "Franchise enquiry" : "Contact"} plain
                messageHint={pg.form === "franchise" ? "Tell us a little about you and where you'd like to start" : "How can we help?"} />
            </div>
          </aside>
        )}
      </div>
      {pg.sections.length > 0 && <Sections sections={pg.sections} slug={org.slug} />}
    </SiteFrame>
  );
}

async function agencyPage(org: NonNullable<Awaited<ReturnType<typeof publicOrg>>>, page: string, p: P) {
  if (page === "support") return <AgencyFrame org={org}><JsonLd data={faqLd(SUPPORT_FAQS)} /><AgencySupport org={org} /></AgencyFrame>;
  if (page === "quote") {
    const sp = (await p.searchParams) ?? {};
    const pre = typeof sp.service === "string" ? sp.service.slice(0, 60) : undefined;
    return <AgencyFrame org={org}><JsonLd data={faqLd(QUOTE_FAQS)} /><AgencyQuote org={org} preselect={pre} /></AgencyFrame>;
  }
  const s = serviceBySlug(page);
  if (!s) notFound();
  const path = `/site/${org.slug}/${s.slug}`;
  return (
    <AgencyFrame org={org}>
      <JsonLd data={serviceLd(org, s, canonicalFor(org, path), canonicalFor(org, `/site/${org.slug}`))} />
      <JsonLd data={faqLd(s.faqs)} />
      <AgencyLanding org={org} s={s} />
    </AgencyFrame>
  );
}
