import type { PublicOrg } from "@/lib/bookings/server";
import { CATEGORIES } from "@/lib/site/agency/content";
import { AgencyNav, type NavCategory } from "./nav";
import { readApptSettings } from "@/lib/appointments/core";

/** Sticky top bar: logo, Our Work, What We Do (six categories), LeadPages, Software, About Us, Support, Client login, Let's Talk. */
export function AgencyHeader({ org }: { org: PublicOrg }) {
  const base = `/site/${org.slug}`;
  const categories: NavCategory[] = CATEGORIES.map((c) => ({
    name: c.name, intro: c.intro, icon: c.icon, href: `${base}/${c.href}`,
    links: c.links.map((l) => ({ href: `${base}/${l.slug}`, label: l.label })),
  }));
  const appt = readApptSettings(org.rawSettings);
  const meet = appt.enabled && appt.on_website ? [{ href: `${base}/meet`, label: appt.title === "Book a meeting" ? "Book a meeting" : appt.title }] : [];
  return (
    <AgencyNav
      name={org.name} home={base} categories={categories} phone={org.contact_phone}
      links={[{ href: `${base}/leadpages`, label: "LeadPages" }, { href: `${base}/ai-and-custom-apps`, label: "Software" }, { href: `${base}#about`, label: "About Us" }, { href: `${base}/support`, label: "Support" }, ...meet]}
      login={`/p/${org.slug}`} talk={`${base}/quote`}
    />
  );
}
