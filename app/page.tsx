import type { Metadata } from "next";
import { SalesPage } from "@/components/marketing/sales-page";

const URL = "https://www.eventureos.com.au";
const TITLE = "EventureOS — Event management software for event businesses";
const DESCRIPTION =
  "Event booking software and CRM for event companies: enquiries, clients, quotes, bookings, Google Calendar, a customer portal, card payments and reporting in one connected system. Works with Gmail, Xero and Stripe.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  keywords: ["event management software", "event booking software", "CRM for event companies", "catering software", "mobile bar booking software", "event hire software"],
  openGraph: {
    type: "website", url: URL, siteName: "EventureOS", title: TITLE, description: DESCRIPTION, locale: "en_AU",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "EventureOS — the operating system for event businesses" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/brand/og.png"] },
  robots: { index: true, follow: true },
};

const FAQ_LD = [
  ["Who is EventureOS for?", "Event businesses that quote, book and deliver jobs — caterers, mobile bars and coffee carts, event hire, venues, planners and entertainment."],
  ["Do I have to change my email or my accounting software?", "No. EventureOS connects to the Gmail and Xero you already use. Gmail stays your mailbox and Xero stays your books."],
  ["How do my customers pay?", "Every invoice can have a secure card-payment link, and customers with a portal login can pay from there. Payments go to your own Stripe account and are recorded against the invoice, and in Xero if the invoice lives there."],
  ["Which tools does it connect to?", "Gmail, Google Calendar, Xero and Stripe. Outlook / Microsoft 365, MYOB and QuickBooks aren’t supported yet."],
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${URL}/#org`, name: "EventureOS", url: URL, logo: `${URL}/brand/eventureos-logo.png` },
    {
      "@type": "SoftwareApplication", name: "EventureOS", url: URL, applicationCategory: "BusinessApplication", operatingSystem: "Web browser",
      description: DESCRIPTION, publisher: { "@id": `${URL}/#org` }, image: `${URL}/brand/og.png`,
      featureList: ["Enquiry capture from Gmail and website forms", "Client CRM", "Quote builder with price list rules", "Online quote acceptance", "Google Calendar sync", "Customer portal", "Card payments with Stripe", "Xero integration", "Reporting"],
    },
    { "@type": "FAQPage", mainEntity: FAQ_LD.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ],
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SalesPage />
    </>
  );
}
