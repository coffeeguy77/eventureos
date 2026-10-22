import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";
import { publicOrg } from "@/lib/bookings/server";
import { blocks, inline, readSite, type InfoPage } from "@/lib/site/site";
import { ed, edImg } from "@/lib/site/copy";
import { siteMeta } from "@/lib/site/meta";
import { SiteFrame } from "@/components/site/site-frame";
import { ContactForm } from "@/components/events/contact-form";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ org: string; page: string }> };

async function load(p: P) {
  const { org: slug, page } = await p.params;
  const org = await publicOrg(slug);
  if (!org) return null;
  const pg = readSite(org.rawSettings).pages.find((x) => x.slug === page);
  return pg ? { org, pg } : null;
}

export async function generateMetadata(p: P): Promise<Metadata> {
  const x = await load(p);
  if (!x) return {};
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

/** One of the business's own pages (About, Contact, Franchise, …): heading, photo, text, and a form when it has one. */
export default async function InfoPageView(p: P) {
  const x = await load(p);
  if (!x) notFound();
  const { org, pg } = x;
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
    </SiteFrame>
  );
}
