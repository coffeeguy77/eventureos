import { Phone } from "lucide-react";
import type { PublicOrg } from "@/lib/bookings/server";
import { readSiteNav } from "@/lib/site-nav";
import { SectionNav, type SectionLink } from "@/components/site/section-nav";

/**
 * The Barista lessons section menu — on the classes page (where the links jump down the page, floating over the photo)
 * and on every other lessons page (course pages, account…), where the same links lead back to the classes page.
 */
export function LessonsNav({ org, links, phone, onLanding = false }: { org: PublicOrg; links?: { href: string; label: string }[]; phone?: string | null; onLanding?: boolean }) {
  const base = `/${org.slug}`;
  const at = (hash: string) => (onLanding ? hash : `${base}${hash}`);
  const list: { href: string; label: string }[] = links ?? [
    { href: "#courses", label: "Courses" }, { href: "#book", label: "Dates" },
    ...(org.stripeReady ? [{ href: "#gift", label: "Gift vouchers" }] : []),
    ...(org.settings.faqs.length ? [{ href: "#faq", label: "FAQ" }] : []),
    ...(org.address || org.contact_phone ? [{ href: "#location", label: "Contact" }] : []),
  ];
  const tel = phone ?? org.contact_phone;
  const items: SectionLink[] = list.map((l) => ({ key: l.href, href: l.href.startsWith("#") ? at(l.href) : l.href, label: l.label }));
  return (
    <SectionNav org={org} label="Barista lessons" title={readSiteNav(org.rawSettings).lessons} titleHref={onLanding ? "#top" : base} links={items}
      floatable={onLanding} defaultStyle={onLanding ? "float" : "bar"}
      actions={tel ? (
        <a href={`tel:${tel.replace(/[^\d+]/g, "")}`} aria-label={`Call ${tel}`} className="inline-flex h-10 items-center gap-2 rounded-full px-2.5 text-[15px] font-semibold hover:bg-black/5">
          <Phone className="h-4 w-4 text-[var(--b)]" /><span className="hidden lg:inline">{tel}</span>
        </a>
      ) : null}
      cta={{ href: at("#book"), label: "Book now", track: "Book now (section menu)" }} />
  );
}
