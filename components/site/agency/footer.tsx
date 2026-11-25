import Link from "next/link";
import { ArrowUpRight, Clock, Mail, MapPin, Phone } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import { AGENCY, BUILT, CATEGORIES } from "@/lib/site/agency/content";
import { readApptSettings } from "@/lib/appointments/core";
import { AgencyWordmark, Underline } from "./deco";
import { BTN, WRAP } from "./ui";

/** Deep-forest footer in five columns: brand, what we do, platforms and products, company, get in touch. */
export function AgencyFooter({ org }: { org: PublicOrg }) {
  const base = `/site/${org.slug}`;
  const phone = org.contact_phone || AGENCY.phone, email = org.contact_email || AGENCY.email, address = org.address || AGENCY.address;
  const appt = readApptSettings(org.rawSettings);
  const link = "text-[0.9375rem] text-[rgba(252,250,245,.7)] transition-colors hover:text-[var(--card)]";
  const head = "text-[0.9375rem] font-bold text-[var(--card)]";
  return (
    <footer className="ag-dark bg-[var(--ink)] text-[var(--card)]">
      <div className={`${WRAP} grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.35fr_1.1fr_1fr_0.85fr_1.25fr] lg:gap-10 lg:py-20`}>
        <div>
          <Link href={base} aria-label={`${org.name} home`} className="inline-block"><AgencyWordmark name={org.name} tone="dark" size="lg" /></Link>
          <p className="ag-serif mt-6 max-w-[22ch] text-[1.375rem] leading-snug">Good people. Great websites. <em className="text-[var(--lime)]">Seriously clever tech.</em></p>
          <p className="mt-4 text-[0.9375rem] text-[rgba(252,250,245,.65)]">Independent digital studio<br />Canberra, Australia</p>
        </div>
        <nav aria-label="What we do">
          <p className={head}>What We Do</p>
          <ul className="mt-4 space-y-2.5">{CATEGORIES.map((c) => <li key={c.key}><Link href={`${base}/${c.href}`} className={link}>{c.name}</Link></li>)}</ul>
        </nav>
        <nav aria-label="Platforms and products">
          <p className={head}>Platforms & Products</p>
          <ul className="mt-4 space-y-2.5">
            <li><Link href={`${base}/leadpages`} className={link}>LeadPages</Link></li>
            {BUILT.slice(0, 5).map((b) => <li key={b.name}><Link href={`${base}#software`} className={link}>{b.name}</Link></li>)}
            <li><Link href={`${base}/ai-and-custom-apps`} className={link}>All software</Link></li>
          </ul>
        </nav>
        <nav aria-label="Company">
          <p className={head}>Company</p>
          <ul className="mt-4 space-y-2.5">
            <li><Link href={`${base}#work`} className={link}>Our Work</Link></li>
            <li><Link href={`${base}#about`} className={link}>About Us</Link></li>
            <li><Link href={`${base}/quote`} className={link}>Contact</Link></li>
            <li><Link href={`${base}/support`} className={link}>Support</Link></li>
            <li><Link href={`/p/${org.slug}/support`} className={link}>Track a ticket</Link></li>
            <li><Link href={`/p/${org.slug}`} className={link}>Client login</Link></li>
            {appt.enabled && appt.on_website && <li><Link href={`${base}/meet`} className={link}>Book a meeting</Link></li>}
          </ul>
        </nav>
        <div>
          <p className={head}>Get in Touch</p>
          <ul className="mt-4 space-y-3.5 text-[0.9375rem]">
            <li><a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={`flex items-center gap-3 ${link}`}><Phone aria-hidden className="h-[18px] w-[18px] shrink-0 text-[var(--lime)]" strokeWidth={1.7} />{phone}</a></li>
            <li><a href={`mailto:${email}`} className={`flex items-center gap-3 ${link}`}><Mail aria-hidden className="h-[18px] w-[18px] shrink-0 text-[var(--lime)]" strokeWidth={1.7} />{email}</a></li>
            <li><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className={`flex items-start gap-3 ${link}`}><MapPin aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--lime)]" strokeWidth={1.7} />{address}</a></li>
            <li className="flex items-start gap-3 text-[rgba(252,250,245,.7)]"><Clock aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--lime)]" strokeWidth={1.7} />{AGENCY.hours}</li>
          </ul>
          <Link href={`${base}/quote`} className={`${BTN.lime} mt-7 min-h-[46px] px-5`}>Let&apos;s Talk<ArrowUpRight aria-hidden className="ag-arrow h-4 w-4" strokeWidth={2.2} /></Link>
        </div>
      </div>
      <div className="border-t border-[var(--line-dark)]">
        <div className={`${WRAP} flex flex-col gap-3 py-6 text-[0.8125rem] text-[rgba(252,250,245,.55)] md:flex-row md:items-center md:justify-between`}>
          <p>© {new Date().getFullYear()} {org.name}. Prices shown exclude GST. <a href="/sitemap.xml" className="underline-offset-4 hover:text-[var(--card)] hover:underline">Sitemap</a></p>
          <p className="relative inline-block self-start md:self-auto"><span className="ag-hand text-[1.25rem] text-[rgba(252,250,245,.75)]">Designed, developed and occasionally debugged in Canberra.</span><Underline className="absolute -bottom-1 left-0 h-2 w-full opacity-60" /></p>
        </div>
      </div>
    </footer>
  );
}
