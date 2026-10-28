/** schema.org structured data for the agency site (home: ProfessionalService; service pages: Service + breadcrumbs). Pure. */
import { AGENCY, SERVICES, type Service } from "./content";

type Org = { name: string; slug: string; contact_phone: string | null; contact_email: string | null; logo_url: string | null };

/** Absolute address for structured data (canonical may be a path while the business isn't on its own domain yet). */
export const absUrl = (u: string, origin = process.env.APP_URL?.trim() || "https://www.eventureos.com.au") => (/^https?:\/\//.test(u) ? u : `${origin.replace(/\/$/, "")}${u}`);

export function businessLd(org: Org, url: string) {
  const u = absUrl(url);
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${u}#business`,
    name: org.name,
    url: u,
    ...(org.logo_url ? { logo: org.logo_url, image: org.logo_url } : {}),
    telephone: org.contact_phone || AGENCY.phone,
    email: org.contact_email || AGENCY.email,
    address: { "@type": "PostalAddress", streetAddress: AGENCY.street, addressLocality: AGENCY.locality, addressRegion: AGENCY.region, postalCode: AGENCY.postcode, addressCountry: "AU" },
    areaServed: AGENCY.areaServed.map((name) => ({ "@type": "Place", name })),
    priceRange: "$$",
    hasOfferCatalog: {
      "@type": "OfferCatalog", name: "Web services",
      itemListElement: SERVICES.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s.name, description: s.metaDescription, url: `${u.replace(/\/$/, "")}/${s.slug}` } })),
    },
  };
}

/** "$4,950" → 4950; null for "Quoted". */
const amount = (p: string) => { const n = Number(p.replace(/[^\d.]/g, "")); return /\d/.test(p) && Number.isFinite(n) ? n : null; };

export function serviceLd(org: Org, s: Service, url: string, homeUrl: string) {
  const u = absUrl(url), home = absUrl(homeUrl);
  const offers = (s.pricing?.items ?? []).map((p) => ({ p, n: amount(p.price) })).filter((x) => x.n !== null).map(({ p, n }) => ({
    "@type": "Offer", name: p.name, price: n, priceCurrency: "AUD", description: [p.unit, p.note].filter(Boolean).join(". "),
    priceSpecification: { "@type": "PriceSpecification", price: n, priceCurrency: "AUD", valueAddedTaxIncluded: false },
  }));
  return [
    {
      "@context": "https://schema.org", "@type": "Service", name: s.name, serviceType: s.serviceType, description: s.metaDescription, url: u,
      provider: { "@type": "ProfessionalService", "@id": `${home}#business`, name: org.name, url: home, telephone: org.contact_phone || AGENCY.phone },
      areaServed: AGENCY.areaServed.map((name) => ({ "@type": "Place", name })),
      ...(offers.length ? { offers } : {}),
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [{ "@type": "ListItem", position: 1, name: org.name, item: home }, { "@type": "ListItem", position: 2, name: s.name, item: u }],
    },
  ];
}
