import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import { AGENCY, GROUPS, SERVICES } from "@/lib/site/agency/content";
import { Wordmark } from "./brand";
import { WRAP } from "./ui";

/** Every service, how to reach us, and the client links. */
export function AgencyFooter({ org }: { org: PublicOrg }) {
  const base = `/site/${org.slug}`;
  const phone = org.contact_phone || AGENCY.phone, email = org.contact_email || AGENCY.email, address = org.address || AGENCY.address;
  const logo = org.logo_url && /^https:\/\//.test(org.logo_url) ? org.logo_url : null;
  const link = "text-[0.9375rem] text-white/70 transition hover:text-white";
  return (
    <footer className="bg-[var(--ink)] text-white">
      <div className={`${WRAP} grid gap-12 py-16 lg:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))] lg:gap-10 lg:py-20`}>
        <div>
          <Link href={base} aria-label={`${org.name} home`} className="inline-block rounded-lg"><Wordmark name={org.name} logo={logo} /></Link>
          <p className="mt-4 max-w-[34ch] text-[0.9375rem] leading-relaxed text-white/65">{AGENCY.tagline}. Designed, hosted and supported from Mitchell, ACT.</p>
          <ul className="mt-6 space-y-3 text-[0.9375rem]">
            <li><a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={`flex items-center gap-3 ${link}`}><Phone aria-hidden className="h-[18px] w-[18px] text-[var(--lime)]" strokeWidth={1.6} />{phone}</a></li>
            <li><a href={`mailto:${email}`} className={`flex items-center gap-3 ${link}`}><Mail aria-hidden className="h-[18px] w-[18px] text-[var(--lime)]" strokeWidth={1.6} />{email}</a></li>
            <li><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className={`flex items-start gap-3 ${link}`}><MapPin aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--lime)]" strokeWidth={1.6} />{address}</a></li>
          </ul>
        </div>
        {GROUPS.slice(0, 3).map((g) => (
          <nav key={g.key} aria-label={g.text}>
            <p className="text-[0.875rem] font-semibold text-white">{g.key === "grow" ? "Grow and automate" : g.label}</p>
            <ul className="mt-4 space-y-2.5">
              {SERVICES.filter((s) => s.group === g.key || (g.key === "grow" && s.group === "apps")).map((s) => <li key={s.slug}><Link href={`${base}/${s.slug}`} className={link}>{s.name}</Link></li>)}
            </ul>
          </nav>
        ))}
        <nav aria-label="Clients">
          <p className="text-[0.875rem] font-semibold text-white">Clients</p>
          <ul className="mt-4 space-y-2.5">
            <li><Link href={`/p/${org.slug}`} className={link}>Client login</Link></li>
            <li><Link href={`${base}/support`} className={link}>Lodge a support ticket</Link></li>
            <li><Link href={`/p/${org.slug}/support`} className={link}>Track a ticket</Link></li>
            <li><Link href={`${base}/quote`} className={link}>Get a quote</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div className={`${WRAP} flex flex-col gap-2 py-6 text-[0.8125rem] text-white/50 sm:flex-row sm:items-center sm:justify-between`}>
          <p>© {new Date().getFullYear()} {org.name}. Prices shown exclude GST.</p>
          <p>Canberra web design, hosting and support</p>
        </div>
      </div>
    </footer>
  );
}
