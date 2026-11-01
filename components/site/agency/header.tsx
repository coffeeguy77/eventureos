import type { PublicOrg } from "@/lib/bookings/server";
import { GROUPS, SERVICES } from "@/lib/site/agency/content";
import { darkLogo } from "./brand";
import { AgencyNav, type NavGroup } from "./nav";
import { readApptSettings } from "@/lib/appointments/core";

/** Sticky top bar: logo, Services (mega menu / drawer), LeadPages, AI apps, Support, Client login, Get a quote. */
export function AgencyHeader({ org }: { org: PublicOrg }) {
  const base = `/site/${org.slug}`;
  const groups: NavGroup[] = GROUPS.map((g) => ({
    label: g.label, text: g.text,
    items: SERVICES.filter((s) => s.group === g.key).map((s) => ({ href: `${base}/${s.slug}`, label: s.name, note: s.blurb, icon: s.icon })),
  }));
  const logo = darkLogo(org);
  const appt = readApptSettings(org.rawSettings);
  const meet = appt.enabled && appt.on_website ? [{ href: `/meet/${org.slug}`, label: appt.title === "Book a meeting" ? "Book a meeting" : appt.title }] : [];
  return (
    <AgencyNav
      name={org.name} logo={logo} home={base} groups={groups} phone={org.contact_phone}
      links={[{ href: `${base}/leadpages`, label: "LeadPages" }, { href: `${base}/ai-and-custom-apps`, label: "AI apps" }, { href: `${base}/support`, label: "Support" }, ...meet]}
      login={`/p/${org.slug}`} quote={`${base}/quote`} support={`${base}/support`}
    />
  );
}
