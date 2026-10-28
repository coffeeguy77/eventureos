/**
 * Web Culture's agency website — every word on the agency home and service pages lives here, so it's easy to edit.
 * Prices are ex GST, taken from the billing system. Don't add statistics, awards or client names that aren't real.
 * Pure data: no React, no database.
 */

export type IconKey =
  | "design" | "wordpress" | "leadpages" | "hosting" | "maintenance" | "support" | "ads" | "seo" | "mail" | "ai"
  | "shield" | "gauge" | "map" | "phone" | "refresh" | "lock" | "chart" | "code" | "layers" | "sparkles" | "clock"
  | "check" | "users" | "plug" | "database" | "cart" | "edit" | "server" | "globe" | "ticket" | "wallet" | "search";

export type Graphic = "browser" | "gauge" | "server" | "checklist" | "ticket" | "ads" | "search" | "mail" | "flow" | "editor" | "wordpress";

export interface Price { name: string; price: string; unit: string; note?: string }
export interface Faq { q: string; a: string }
export interface Step { title: string; text: string }
export interface Benefit { icon: IconKey; title: string; text: string }

export interface Service {
  slug: string;
  /** name in menus and cards */ name: string;
  /** one line under the name in menus */ blurb: string;
  icon: IconKey;
  group: "build" | "care" | "grow" | "apps";
  metaTitle: string;
  metaDescription: string;
  /** schema.org serviceType */ serviceType: string;
  title: string;
  lede: string;
  graphic: Graphic;
  intro: string[];
  benefits: Benefit[];
  included: string[];
  pricing?: { items: Price[]; note?: string };
  process: Step[];
  faqs: Faq[];
  related: string[];
}

export const AGENCY = {
  name: "Web Culture",
  tagline: "Websites, hosting and support for Canberra businesses",
  phone: "02 6223 2222",
  email: "hello@webculture.au",
  street: "U5, 47-49 Vicars St",
  locality: "Mitchell",
  region: "ACT",
  postcode: "2911",
  address: "U5, 47-49 Vicars St, Mitchell ACT 2911",
  hours: "Monday to Friday, business hours",
  areaServed: ["Canberra", "Australian Capital Territory", "Queanbeyan", "NSW"],
  portal: (slug: string) => `/p/${slug}`,
  portalSupport: (slug: string) => `/p/${slug}/support`,
};

/** Businesses that appear in the current webculture.au portfolio. */
export const CLIENTS = ["Stonemad Stonemasons", "One Eco Garden & Landscaping", "Old2New Flooring", "National Ethnic Disability Alliance", "EMA Advisory", "Oppikofer Joinery"];

/** Short excerpts of Google reviews shown on the current webculture.au. */
export const TESTIMONIALS = [
  { quote: "Web Culture have been excellent to work with and fast to respond to any issues or problems we have had.", name: "Claudia Lam" },
  { quote: "Web Culture developed a great new website for our Society and has provided excellent and friendly follow-up service.", name: "Wendy Whitham" },
  { quote: "Web Culture post setup support has been great with assistance to set up a new page or fixing a glitch.", name: "Kim Norenbergs" },
  { quote: "Web Culture has migrated and taken on the management of Johnny Boy's Walkabout Blog. In particular, they tuned up search and SEO functionality.", name: "John Evans" },
];

/** Work completed in 2024, as published on webculture.au. */
export const YEAR_STATS = { year: 2024, items: [{ value: "63", label: "websites developed" }, { value: "87", label: "sites SEO optimised" }, { value: "57", label: "domains registered" }] };

const quoteStep: Step = { title: "Tell us what you need", text: "Fill in the quote form or call us. We'll ask a few questions and give you a clear, fixed quote — no jargon." };

export const SERVICES: Service[] = [
  {
    slug: "website-design", name: "Website design", blurb: "New websites that load fast and win work", icon: "design", group: "build",
    metaTitle: "Website Design Canberra | Web Culture",
    metaDescription: "Website design in Canberra by Web Culture. Fast, mobile-first websites built to rank on Google and turn visitors into enquiries. 40-hour builds from $4,950 + GST.",
    serviceType: "Website design",
    title: "Websites that bring in work, not just compliments",
    lede: "We design and build fast, mobile-first websites for Canberra businesses — written for your customers, set up for Google, and easy for you to update.",
    graphic: "browser",
    intro: [
      "Most small business websites look fine and do nothing. Ours are planned around one question: what do you want a visitor to do next? Call, book, ask for a quote, buy. Every page is built to make that easy.",
      "We build on WordPress or on LeadPages, our own fast website platform — we'll recommend the one that suits how you work, not the one that's easiest for us.",
    ],
    benefits: [
      { icon: "phone", title: "Built for phones first", text: "Most of your visitors are on a phone. We design for the small screen first, then make the most of wide screens." },
      { icon: "gauge", title: "Fast by default", text: "Lean pages, compressed images and good hosting. Fast sites rank better and lose fewer visitors." },
      { icon: "search", title: "Ready for Google", text: "Clean structure, page titles, descriptions and Google Analytics set up from day one." },
      { icon: "edit", title: "Yours to update", text: "We show you how to change text, photos and pages yourself, so you're never stuck waiting on us." },
    ],
    included: [
      "Up to 40 hours of design and build",
      "Responsive design for phones, tablets and desktops",
      "WordPress or LeadPages — we'll help you choose",
      "On-page SEO: titles, descriptions, headings and structure",
      "Google Analytics set up",
      "Contact and quote forms that land in your inbox",
      "Training on updating your own content",
      "Launch, redirects from your old site and a post-launch check",
    ],
    pricing: { items: [{ name: "New website build", price: "$4,950", unit: "+ GST", note: "40 hours: design, build, SEO setup, Google Analytics and CMS training" }, { name: "Extra work or features", price: "$120", unit: "+ GST / hour" }], note: "Online stores and larger sites are quoted to scope." },
    process: [
      quoteStep,
      { title: "Plan the pages", text: "We map out your pages and what each one needs to do, and agree on the look before we build." },
      { title: "Design and build", text: "You'll see the site take shape and can give feedback along the way." },
      { title: "Launch and hand over", text: "We go live, point your domain, redirect old addresses and show you how to keep it up to date." },
    ],
    faqs: [
      { q: "How long does a new website take?", a: "A typical 40-hour build takes four to eight weeks, depending mostly on how quickly we get your content and feedback. We'll give you a realistic timeline with your quote." },
      { q: "Do I need to write all the words?", a: "No. Send us what you have — notes, an old site, a brochure — and we'll shape it into web copy. We can also help with AI-assisted drafts that we edit properly." },
      { q: "Can you build an online store?", a: "Yes. We build stores on WooCommerce or Shopify depending on your products and how you want to manage orders. Stores are quoted to scope." },
      { q: "Will I lose my Google rankings if I replace my old site?", a: "Not if it's done properly. We redirect your old page addresses to the new ones so Google (and anyone with an old link) lands in the right place." },
      { q: "Who owns the website?", a: "You do. Your domain, your content and your site are yours." },
    ],
    related: ["leadpages", "wordpress", "web-hosting", "seo"],
  },
  {
    slug: "wordpress", name: "WordPress websites", blurb: "Custom WordPress builds, fixes and care", icon: "wordpress", group: "build",
    metaTitle: "WordPress Websites Canberra | Builds, Fixes & Care | Web Culture",
    metaDescription: "WordPress website design, development and support in Canberra. Custom themes, WooCommerce stores, speed fixes, plugin updates and security — from local WordPress specialists.",
    serviceType: "WordPress development",
    title: "WordPress, done properly",
    lede: "WordPress is flexible and powerful — and needs looking after. We build it cleanly, keep it updated and fix it when it breaks.",
    graphic: "wordpress",
    intro: [
      "WordPress is the right tool when you need a big content site, a WooCommerce store, memberships or something a plugin already does well. We build WordPress sites without the bloat: a sensible theme, the fewest plugins that do the job, and hosting that suits it.",
      "Already on WordPress? We take over existing sites too — tidy up, speed up, secure and look after them.",
    ],
    benefits: [
      { icon: "layers", title: "Lean builds", text: "Fewer plugins means fewer updates, fewer conflicts and fewer security holes." },
      { icon: "cart", title: "WooCommerce stores", text: "Product catalogues, payments and shipping, set up so you can run the shop yourself." },
      { icon: "shield", title: "Kept secure", text: "Core, theme and plugin updates, malware scans and backups through our maintenance checks." },
      { icon: "refresh", title: "Rescues and takeovers", text: "Hacked, slow, broken or abandoned by a previous developer? We'll get it back on its feet." },
    ],
    included: [
      "Custom WordPress design and build",
      "WooCommerce online stores",
      "Migration from other platforms or hosts",
      "Speed tuning and Core Web Vitals fixes",
      "Malware clean-up and hardening",
      "Plugin and theme updates with compatibility testing",
      "Training for you and your team",
    ],
    pricing: { items: [{ name: "New WordPress website", price: "$4,950", unit: "+ GST", note: "40-hour build" }, { name: "Maintenance check", price: "$120", unit: "+ GST / check" }, { name: "Fixes and changes", price: "$120", unit: "+ GST / hour" }] },
    process: [
      quoteStep,
      { title: "Audit or plan", text: "For an existing site we check plugins, theme, speed and security first. For a new site we plan the pages." },
      { title: "Build or fix", text: "We do the work on a copy where we can, so your live site keeps running." },
      { title: "Look after it", text: "Put it on a maintenance schedule so updates and security checks actually happen." },
    ],
    faqs: [
      { q: "Should I use WordPress or LeadPages?", a: "If you're a service business that wants enquiries and great Google results with no maintenance, LeadPages usually wins. If you need a complex store, memberships or a particular plugin, WordPress is the better fit. We'll tell you honestly." },
      { q: "My WordPress site has been hacked. Can you help?", a: "Yes. Lodge a support ticket marked urgent or call us. We'll clean it up, close the hole that let them in and get backups in place." },
      { q: "Why do WordPress sites need maintenance?", a: "WordPress, its theme and every plugin get regular updates, many of them security fixes. Skipped updates are the most common way small business sites get hacked." },
      { q: "Can you take over a site another developer built?", a: "Yes — we do it often. We'll start with a check of what's there and tell you what needs attention." },
    ],
    related: ["website-maintenance", "web-hosting", "leadpages", "website-support"],
  },
  {
    slug: "leadpages", name: "LeadPages", blurb: "Our fast website platform — no plugins to patch", icon: "leadpages", group: "build",
    metaTitle: "LeadPages — Fast Websites Without WordPress Headaches | Web Culture",
    metaDescription: "LeadPages is Web Culture's own website platform: live visual editing, apps for bookings, quotes and reviews, lightweight pages built for speed and SEO, and nothing to patch.",
    serviceType: "Website platform",
    title: "A website platform with nothing to patch",
    lede: "LeadPages is our own platform for business websites. Edit your site live, add bookings, quotes or reviews with a click, and get pages built for speed and Google — without plugin updates.",
    graphic: "editor",
    intro: [
      "We built LeadPages because we kept seeing the same thing: small businesses on WordPress paying to keep plugins updated, fighting slow page builders and worrying about security — for a site that mostly needs to explain what they do and get the phone ringing.",
      "LeadPages pages are lightweight and served as static pages, so they're quick to load and score well on Google's Core Web Vitals. You edit the real page and see your change instantly. When you need more, you add an app.",
    ],
    benefits: [
      { icon: "edit", title: "Live visual editing", text: "Click the words on your page and change them. What you see is exactly what your customers will see." },
      { icon: "layers", title: "Layouts for every section", text: "Each section has several layouts. Try a different look in a click, without rebuilding the page." },
      { icon: "plug", title: "An app marketplace", text: "Add bookings, quote forms, service-area maps, reviews and more as apps — built in, not bolted on." },
      { icon: "gauge", title: "Built for speed and SEO", text: "Lightweight static pages for strong PageSpeed and Core Web Vitals, with clean markup Google understands." },
      { icon: "refresh", title: "SEO Saver", text: "Moving from an old site? SEO Saver finds your old page addresses and redirects them, so you keep the rankings you've earned." },
      { icon: "sparkles", title: "AI-assisted content", text: "Get a strong first draft for a page or section, then make it yours." },
      { icon: "lock", title: "Nothing to patch", text: "No plugins, no theme updates, no security patches to chase. We look after the platform." },
    ],
    included: [
      "Your LeadPages website designed and set up by us",
      "Live visual editor with instant preview",
      "Apps for bookings, quotes, service-area maps, reviews and more",
      "Fast static pages on secure hosting",
      "SEO Saver redirects from your old website",
      "AI-assisted content drafting",
      "Platform updates and security handled for you",
    ],
    process: [
      quoteStep,
      { title: "We set it up", text: "We build your pages, add the apps you need and bring across your content." },
      { title: "Move without losing Google", text: "SEO Saver maps your old addresses to the new pages before we switch the domain." },
      { title: "You edit, we look after it", text: "Change things yourself any time. Platform updates happen in the background." },
    ],
    faqs: [
      { q: "Is LeadPages better than WordPress?", a: "For most service businesses — trades, professionals, local businesses that want enquiries — we think so: it's faster, simpler to edit and has nothing to patch. WordPress is still the better choice for complex stores, memberships or sites that rely on a specific plugin." },
      { q: "Will I keep my Google rankings if I move?", a: "That's what SEO Saver is for. It finds the addresses your old site used and redirects each one to the matching new page, so links and rankings carry over." },
      { q: "Can I edit it myself?", a: "Yes. You edit the real page in your browser and see the change straight away. No admin screens to learn." },
      { q: "What apps are available?", a: "Bookings, quote requests, service-area maps and reviews are a few examples, with more being added. Ask us about anything specific you need." },
      { q: "Is LeadPages the same as the US product with the same name?", a: "No. LeadPages (leadpages.com.au) is our own Australian platform, built and supported by our team." },
    ],
    related: ["website-design", "seo", "wordpress", "ai-and-custom-apps"],
  },
  {
    slug: "web-hosting", name: "Web hosting", blurb: "Fast, secure hosting with local support", icon: "hosting", group: "care",
    metaTitle: "Web Hosting Canberra | $400 + GST a year | Web Culture",
    metaDescription: "Business web hosting from Web Culture in Canberra: cPanel, CloudLinux, dual Intel Xeon Gold servers and SSD storage for $400 + GST a year, with off-server backups and local support.",
    serviceType: "Web hosting",
    title: "Hosting that's fast, safe and answered by a local",
    lede: "Business-grade web hosting with real people in Mitchell to call when something's not right.",
    graphic: "server",
    intro: [
      "Cheap hosting gets expensive the first time your site goes down and nobody answers. Our hosting runs on well-specified servers we manage ourselves, and support comes from the same team that builds websites — so we can fix the website, not just tell you the server is fine.",
    ],
    benefits: [
      { icon: "server", title: "Serious hardware", text: "Dual Intel Xeon Gold servers with fast SSD storage." },
      { icon: "shield", title: "Isolated and secure", text: "CloudLinux keeps every account in its own space, so one busy or compromised site can't drag others down." },
      { icon: "database", title: "Off-server backups", text: "Add weekly backups stored away from the server, so a bad day isn't a disaster." },
      { icon: "users", title: "Local support", text: "Call or lodge a ticket and talk to people who know your site." },
    ],
    included: [
      "cPanel/WHM hosting account",
      "CloudLinux account isolation",
      "Dual Intel Xeon Gold servers with SSD storage",
      "SSL certificate setup",
      "Email accounts on your domain",
      "Migration from your current host",
      "Local support by ticket, email or phone",
    ],
    pricing: { items: [{ name: "Annual web hosting", price: "$400", unit: "+ GST / year" }, { name: "Annual website backup", price: "$104", unit: "+ GST / year", note: "Weekly backups, stored off-server" }] },
    process: [
      quoteStep,
      { title: "We move your site", text: "We copy your site and email across and test everything before switching." },
      { title: "Switch over", text: "We update your domain settings at a quiet time, so there's little or no downtime." },
      { title: "Renew yearly", text: "One invoice a year. If something's wrong in between, lodge a ticket." },
    ],
    faqs: [
      { q: "Can you move my website from another host?", a: "Yes. We'll migrate your website and, if needed, your email, then test it before we switch your domain over." },
      { q: "Is SSL included?", a: "Yes, we set up an SSL certificate so your site loads securely over https. Paid certificates are available if you need one." },
      { q: "Do I need the backup service?", a: "We strongly recommend it. Backups stored off the server mean we can restore your site even if the server itself has a problem." },
      { q: "What happens if my hosting invoice isn't paid?", a: "We'll remind you first. If it stays unpaid, hosting can be suspended until it's sorted — the client portal shows you what's due." },
    ],
    related: ["website-maintenance", "email-and-domains", "website-support", "wordpress"],
  },
  {
    slug: "website-maintenance", name: "Website maintenance", blurb: "Scheduled updates, scans and checks", icon: "maintenance", group: "care",
    metaTitle: "Website Maintenance Canberra | WordPress Updates & Security | Web Culture",
    metaDescription: "Scheduled website maintenance checks from Web Culture: CMS and plugin updates, malware scans and compatibility testing — monthly, quarterly or six-monthly, $120 + GST per check.",
    serviceType: "Website maintenance",
    title: "Updates done. Site checked. Nothing left to chance.",
    lede: "Scheduled maintenance checks keep your website updated, secure and working — monthly, quarterly or every six months.",
    graphic: "checklist",
    intro: [
      "Websites don't stay healthy on their own. Software updates come out constantly, and the ones that get skipped are how sites get hacked or quietly break. A maintenance check is a scheduled visit where we update everything, scan for problems and make sure your site still works afterwards.",
      "Each check is billed before it's due. Once it's paid, it's booked in and done — and you can see the progress in your client portal.",
    ],
    benefits: [
      { icon: "refresh", title: "Everything updated", text: "CMS core, theme and plugins brought up to date." },
      { icon: "shield", title: "Malware scan", text: "We scan for malicious code and suspicious changes." },
      { icon: "check", title: "Tested afterwards", text: "We check pages and forms on desktop and mobile after updating, so updates don't break things." },
      { icon: "clock", title: "On a schedule", text: "Monthly, quarterly or six-monthly — pick what suits how busy your site is." },
    ],
    included: [
      "Full backup before any updates",
      "CMS core update",
      "Plugin and theme updates",
      "Malware and security scan",
      "Compatibility testing on desktop and mobile",
      "Contact forms tested",
      "A record of the work in your client portal",
    ],
    pricing: { items: [{ name: "Scheduled maintenance check", price: "$120", unit: "+ GST / check", note: "Monthly, quarterly or six-monthly" }], note: "Each check is invoiced first; the work is done once it's paid." },
    process: [
      { title: "Pick a schedule", text: "Monthly for busy or e-commerce sites, quarterly for most businesses, six-monthly for simple sites." },
      { title: "Invoice goes out", text: "You get an invoice before each check is due." },
      { title: "We do the check", text: "Once paid, we back up, update, scan and test — and note anything that needs attention." },
      { title: "See what was done", text: "The checklist and notes appear in your client portal." },
    ],
    faqs: [
      { q: "How often should my site be checked?", a: "Quarterly suits most business websites. Online stores and sites with lots of plugins are better monthly. Simple brochure sites can be fine every six months." },
      { q: "What if an update breaks something?", a: "We take a backup first, so we can roll back. If a plugin needs replacing or a fix takes longer, we'll tell you before doing extra work." },
      { q: "Do you maintain sites you didn't build?", a: "Yes, as long as we can get admin access. The first check sometimes takes longer if the site hasn't been updated in a while — we'll let you know." },
      { q: "Do LeadPages sites need maintenance checks?", a: "No. LeadPages has no plugins to update — the platform is kept up to date for you." },
    ],
    related: ["wordpress", "web-hosting", "website-support", "leadpages"],
  },
  {
    slug: "website-support", name: "Website & IT support", blurb: "Help with websites, email and servers", icon: "support", group: "care",
    metaTitle: "Website, Email & Server Support Canberra | Web Culture",
    metaDescription: "Local help for websites, email and servers in Canberra. Lodge a support ticket online, track it in your client portal, and get it fixed by Web Culture. $120 + GST an hour.",
    serviceType: "Technical support",
    title: "Something broken? Lodge a ticket and we'll sort it.",
    lede: "Website errors, email that won't send, a server acting up — tell us what's wrong and a real person in Canberra will pick it up.",
    graphic: "ticket",
    intro: [
      "We look after websites, email and servers for businesses across Canberra. Every request becomes a ticket, so nothing gets lost in an inbox — and you can follow its progress in your client portal.",
    ],
    benefits: [
      { icon: "ticket", title: "Tracked, not forgotten", text: "Every request gets a ticket number and a clear status from new to done." },
      { icon: "users", title: "Real people", text: "Our Canberra team handles your request — the same people who build and host sites." },
      { icon: "mail", title: "Email fixed properly", text: "Sending, receiving, spam folders, Outlook and phones — we get to the root of it." },
      { icon: "server", title: "Servers too", text: "cPanel, DNS, SSL and server issues handled by people who run servers every day." },
    ],
    included: [
      "Website errors, broken pages and forms",
      "Content changes and small updates",
      "Email setup and troubleshooting",
      "Domain, DNS and SSL problems",
      "Server and hosting issues",
      "Advice and consultation",
    ],
    pricing: { items: [{ name: "Website, email and server support", price: "$120", unit: "+ GST / hour" }, { name: "Consultation", price: "$120", unit: "+ GST / hour" }] },
    process: [
      { title: "Lodge a ticket", text: "Use the support form or email us. Tell us what's happening and where." },
      { title: "We triage it", text: "We look at it, ask anything we need and let you know the next step." },
      { title: "We fix it", text: "Updates are added to your ticket as we go." },
      { title: "Follow along", text: "Sign in to your client portal with a code we email you to see every update." },
    ],
    faqs: [
      { q: "How do I lodge a support request?", a: "Use the support form on this site, or email us. You'll get a ticket number straight away." },
      { q: "How do I check on my ticket?", a: "Sign in to the client portal with your email address — we send you a one-time code, no password needed — and open Support." },
      { q: "Do you support sites and email you didn't set up?", a: "Usually, yes. We'll ask for access details and let you know if anything needs a different approach." },
      { q: "How is support billed?", a: "At $120 + GST an hour. If something looks like it'll take a while, we'll tell you before we start." },
    ],
    related: ["website-maintenance", "web-hosting", "email-and-domains", "wordpress"],
  },
  {
    slug: "google-ads", name: "Google Ads", blurb: "Managed campaigns that bring in leads", icon: "ads", group: "grow",
    metaTitle: "Google Ads Management Canberra | $600 + GST a month | Web Culture",
    metaDescription: "Google Ads management for Canberra businesses: search, display, remarketing, Shopping and YouTube campaigns. 8 hours of management plus a 1-hour consult each month for $600 + GST.",
    serviceType: "Pay-per-click advertising management",
    title: "Google Ads that pay their way",
    lede: "We set up and manage Google Ads campaigns that put you in front of people searching for what you do — and keep tuning them so your budget goes further.",
    graphic: "ads",
    intro: [
      "Google Ads can fill your calendar or quietly burn your budget. The difference is in the detail: the right keywords, the right negatives, honest ad copy, landing pages that convert and someone watching the numbers every week.",
    ],
    benefits: [
      { icon: "search", title: "Search ads", text: "Appear at the top of Google for the searches that matter to your business." },
      { icon: "refresh", title: "Display and remarketing", text: "Reach people on partner websites and bring back visitors who didn't enquire the first time." },
      { icon: "cart", title: "Shopping and YouTube", text: "Product listings for online stores and video ads for awareness." },
      { icon: "chart", title: "Clear reporting", text: "A monthly consult where we go through what's working and what we're changing." },
    ],
    included: [
      "Campaign setup and keyword research",
      "Ad copy and extensions",
      "Conversion tracking",
      "8 hours of campaign management each month",
      "A 1-hour monthly consult on results",
      "Landing page recommendations",
    ],
    pricing: { items: [{ name: "Google Ads monthly management", price: "$600", unit: "+ GST / month", note: "8 hours of management plus a 1-hour consult" }], note: "Your ad spend is paid directly to Google and is separate." },
    process: [
      quoteStep,
      { title: "Set up tracking", text: "We make sure calls, forms and sales are counted so we can see what's working." },
      { title: "Launch campaigns", text: "Tight keyword lists, strong ads and sensible budgets." },
      { title: "Tune every month", text: "We cut waste, test new ads and walk you through results." },
    ],
    faqs: [
      { q: "How much should I spend on ads?", a: "It depends on your industry and goals. We'll recommend a starting budget in your quote. Ad spend goes straight to Google — our fee is separate." },
      { q: "Is there a lock-in contract?", a: "Management is billed monthly. Ask us about the terms when we quote." },
      { q: "How soon will I see results?", a: "Ads can bring traffic from day one; it usually takes a few weeks of data to tune campaigns properly." },
    ],
    related: ["seo", "website-design", "leadpages"],
  },
  {
    slug: "seo", name: "SEO & social media", blurb: "Local SEO, content and social", icon: "seo", group: "grow",
    metaTitle: "SEO Canberra | Local SEO & Social Media Management | Web Culture",
    metaDescription: "Search engine optimisation for Canberra businesses: local SEO and Google Business Profile, technical SEO, content and social media management from Web Culture.",
    serviceType: "Search engine optimisation",
    title: "Be the business Canberra finds first",
    lede: "Local SEO, technical fixes and useful content that help your business show up when people nearby search for what you do.",
    graphic: "search",
    intro: [
      "Good SEO isn't a trick. It's a fast, well-structured website, a complete Google Business Profile, pages that answer what people actually search for and a steady stream of reasons for other sites to mention you.",
      "We also manage social media for businesses that want a consistent presence without doing it themselves.",
    ],
    benefits: [
      { icon: "map", title: "Local SEO", text: "Google Business Profile, local citations and location pages for Canberra and surrounds." },
      { icon: "code", title: "Technical SEO", text: "Speed, indexing, structured data and internal links fixed at the source." },
      { icon: "edit", title: "Content that ranks", text: "Service pages and articles written for your customers and for search." },
      { icon: "users", title: "Social media management", text: "Regular, on-brand posts so your social channels stay active." },
    ],
    included: [
      "SEO audit of your current site",
      "On-page SEO: titles, descriptions, headings and structure",
      "Technical SEO: speed, indexing and schema markup",
      "Google Business Profile optimisation",
      "Local citations and ethical link building",
      "Content and landing pages",
      "Social media management (optional)",
    ],
    pricing: { items: [{ name: "SEO and social media", price: "Quoted", unit: "to your goals" }, { name: "Consultation", price: "$120", unit: "+ GST / hour" }] },
    process: [
      quoteStep,
      { title: "Audit", text: "We check your site, your competitors and what people search for." },
      { title: "Fix and build", text: "Technical fixes first, then content and local listings." },
      { title: "Measure", text: "We track rankings, traffic and enquiries and adjust the plan." },
    ],
    faqs: [
      { q: "Can you guarantee a number one ranking?", a: "No — and be wary of anyone who does. We can promise good work on the things Google says matter, and honest reporting on the results." },
      { q: "How long does SEO take?", a: "Technical fixes can help within weeks. Content and local SEO build over months." },
      { q: "Does my website platform matter?", a: "Speed and clean structure help. LeadPages sites are built light for this reason, and we tune WordPress sites too." },
    ],
    related: ["google-ads", "leadpages", "website-design"],
  },
  {
    slug: "email-and-domains", name: "Email, domains & SSL", blurb: "Domains, SSL and email that just works", icon: "mail", group: "care",
    metaTitle: "Domain Names, SSL Certificates & Business Email | Web Culture Canberra",
    metaDescription: "Domain name registration, SSL certificates and business email setup and troubleshooting in Canberra. .com.au, .au and more, managed by Web Culture.",
    serviceType: "Domain registration and email services",
    title: "Your name online, sorted",
    lede: "We register and manage domain names, set up SSL certificates and make your business email work on every device.",
    graphic: "mail",
    intro: [
      "Your domain and email are the foundation of everything online. We keep renewals on track, records tidy and email delivering — and we explain it in plain English.",
    ],
    benefits: [
      { icon: "globe", title: "Domain registration", text: ".com.au, .au, .com and more — registered in your business's name." },
      { icon: "lock", title: "SSL certificates", text: "The padlock in the browser that keeps visitors' data safe and keeps Google happy." },
      { icon: "mail", title: "Email setup", text: "Mailboxes, aliases and setup on Outlook, Mac, iPhone and Android." },
      { icon: "support", title: "Troubleshooting", text: "Mail going to spam or bouncing? We check DNS, SPF, DKIM and DMARC and fix it." },
    ],
    included: [
      "Domain name registration and renewals",
      "Domain transfers to us",
      "DNS management",
      "SSL certificate setup and renewals",
      "Business email setup on all your devices",
      "Email deliverability and troubleshooting",
    ],
    pricing: { items: [{ name: "Domains and SSL", price: "Quoted", unit: "by domain type" }, { name: "Email setup and troubleshooting", price: "$120", unit: "+ GST / hour" }] },
    process: [
      quoteStep,
      { title: "Register or transfer", text: "We register new domains or bring existing ones across." },
      { title: "Set up", text: "DNS, SSL and email configured and tested." },
      { title: "Renew on time", text: "Renewal reminders so your domain never lapses." },
    ],
    faqs: [
      { q: "Can I keep my domain if I move to you?", a: "Yes. Domains can be transferred between providers. We'll handle the paperwork." },
      { q: "Why does my email go to spam?", a: "Usually missing or wrong SPF, DKIM or DMARC records. Lodge a ticket and we'll check." },
      { q: "Do I own my domain?", a: "Yes. Domains we register are in your business's name." },
    ],
    related: ["web-hosting", "website-support", "website-design"],
  },
  {
    slug: "ai-and-custom-apps", name: "AI & custom apps", blurb: "Software, portals and AI built for your business", icon: "ai", group: "apps",
    metaTitle: "AI & Custom Business Apps Canberra | Web Culture",
    metaDescription: "Custom business software and AI integrations from Web Culture in Canberra: client portals, dashboards, automations, Claude and OpenAI integrations, Xero and Stripe connections.",
    serviceType: "Custom software development",
    title: "Software that fits your business, with AI where it helps",
    lede: "We build custom web apps, client portals and automations — and put AI to work on the jobs that eat your week.",
    graphic: "flow",
    intro: [
      "Off-the-shelf software makes you work its way. Sometimes that's fine. When it isn't, we build exactly what you need: a portal for your clients, a dashboard for your team, an automation that connects the tools you already use.",
      "We build our own products this way too — the same team, tools and approach go into client work.",
    ],
    benefits: [
      { icon: "sparkles", title: "AI integrations", text: "Claude and OpenAI built into your workflow: drafting, summarising, reading documents and images." },
      { icon: "users", title: "Client portals", text: "Give clients a place to see quotes, invoices, documents and tickets." },
      { icon: "chart", title: "Dashboards", text: "The numbers that matter, in one place, updated automatically." },
      { icon: "plug", title: "Integrations", text: "Xero, Stripe, Gmail and more — connected so data flows without retyping." },
    ],
    included: [
      "Discovery: what's slowing you down and what to build first",
      "Custom web apps that work on phones and desktops",
      "AI features using Claude and OpenAI",
      "Client portals with secure sign-in",
      "Automations between your existing tools",
      "Xero, Stripe and Gmail integrations",
      "Ongoing hosting, support and improvements",
    ],
    pricing: { items: [{ name: "Discovery consultation", price: "$120", unit: "+ GST / hour" }, { name: "Custom apps", price: "Quoted", unit: "to scope" }] },
    process: [
      { title: "Discovery", text: "We learn how your business works today and where time is being lost." },
      { title: "A small first version", text: "We build the most useful piece first, so you see value quickly." },
      { title: "Improve it with you", text: "We add features based on how your team actually uses it." },
      { title: "Host and support", text: "We run it, keep it secure and keep improving it." },
    ],
    faqs: [
      { q: "Is my data safe with AI tools?", a: "We choose providers and settings carefully, keep your data in your own systems where possible and only send AI services what a task needs." },
      { q: "How much does a custom app cost?", a: "It depends on scope. We start with a paid discovery consultation and then quote a first version you can use quickly." },
      { q: "Do you build mobile apps?", a: "We build web apps that work beautifully on phones and can be added to the home screen. Ask us if you need an app-store app." },
    ],
    related: ["website-design", "website-support", "leadpages"],
  },
];

export const serviceBySlug = (slug: string) => SERVICES.find((s) => s.slug === slug) ?? null;

/** Every page this agency site adds (for routing and the sitemap). */
export const AGENCY_PAGES = [...SERVICES.map((s) => s.slug), "quote", "support"];
export const isAgencyPage = (slug: string) => AGENCY_PAGES.includes(slug);

export const GROUPS: { key: Service["group"]; label: string; text: string }[] = [
  { key: "build", label: "Build", text: "New websites and platforms" },
  { key: "care", label: "Look after", text: "Hosting, maintenance and support" },
  { key: "grow", label: "Grow", text: "Get found and win customers" },
  { key: "apps", label: "Software", text: "Custom apps and AI" },
];

/** Things we've built — our own products, shown as proof of what we can build for you. */
export const BUILT = [
  { name: "EventureOS", kind: "Business operating system", text: "CRM, quotes, invoicing, bookings and calendars for event businesses, connected to Xero, Gmail and Stripe.", tags: ["CRM", "Xero", "Stripe"] },
  { name: "Nerd Herd", kind: "IT help desk", text: "Support tickets, website records, maintenance schedules and a client portal — it runs our own support.", tags: ["Tickets", "Client portal"] },
  { name: "SafeServe", kind: "Food safety records", text: "Delivery temperatures, food storage and display checks recorded on a phone, for cafés and kitchens.", tags: ["Compliance", "Mobile"] },
  { name: "OwnersCorp OS", kind: "Strata management", text: "Everything a self-managed owners corporation needs: levies, meetings, records and owner access.", tags: ["Portals", "Records"] },
  { name: "BookCook", kind: "AI cookbook index", text: "Uses AI vision to read cookbook pages and index every recipe so you can find it again.", tags: ["AI vision"] },
  { name: "StoryLoom", kind: "AI story generator", text: "Personalised illustrated children's stories, written and illustrated with AI.", tags: ["Generative AI"] },
  { name: "Tracepaper", kind: "Design to code", text: "Turns a website design image into responsive HTML and CSS using AI.", tags: ["AI vision", "Dev tools"] },
  { name: "Roastery app", kind: "Coffee roasting", text: "Blend calculator, green bean inventory and roast log for specialty coffee roasters.", tags: ["Inventory"] },
  { name: "Hosting billing", kind: "Automation", text: "Matches hosting accounts to invoices and suspends unpaid hosting automatically — then restores it when paid.", tags: ["Automation", "Billing"] },
];

/** LeadPages vs WordPress, as fairly as we can put it. */
export const COMPARE: { label: string; leadpages: string; wordpress: string }[] = [
  { label: "Editing", leadpages: "Edit the live page and see changes instantly", wordpress: "Admin screens, often with a page builder on top" },
  { label: "Layouts", leadpages: "Several layouts per section, swap in a click", wordpress: "Depends on the theme or page builder" },
  { label: "Features", leadpages: "Built-in apps: bookings, quotes, maps, reviews", wordpress: "Thousands of third-party plugins, varying quality" },
  { label: "Speed", leadpages: "Lightweight static pages built for Core Web Vitals", wordpress: "Depends on hosting, theme and plugins; usually needs caching" },
  { label: "Updates and security", leadpages: "Nothing to patch — handled for you", wordpress: "Core, theme and plugin updates needed regularly" },
  { label: "Moving from an old site", leadpages: "SEO Saver redirects old addresses", wordpress: "Set up redirects by hand or with a plugin" },
  { label: "Best for", leadpages: "Service businesses that want enquiries", wordpress: "Complex stores, memberships, plugin-specific needs" },
];

export const HOME_FAQS: Faq[] = [
  { q: "Where are you based?", a: "Our office is at U5, 47-49 Vicars St, Mitchell ACT. We work with businesses across Canberra and the region, and further afield too." },
  { q: "How much does a website cost?", a: "Our standard new website build is 40 hours for $4,950 + GST. Larger sites and online stores are quoted to scope." },
  { q: "Can you look after a website someone else built?", a: "Yes. We host, maintain and support plenty of sites we didn't build. We'll check it over first and tell you what we find." },
  { q: "How do I get support?", a: "Lodge a support ticket on this site or email us. You'll get a ticket number and can follow progress in the client portal." },
  { q: "WordPress or LeadPages?", a: "For most service businesses we recommend LeadPages: it's faster, easier to edit and there's nothing to patch. WordPress is the better choice for complex stores or plugin-specific features. We'll advise honestly." },
  { q: "Are your prices GST-inclusive?", a: "Prices on this site are shown excluding GST." },
];

export const QUOTE_SERVICES = ["New website", "Website redesign", "LeadPages website", "WordPress work", "Online store", "Web hosting", "Website maintenance", "Google Ads", "SEO", "Social media", "Email & domains", "AI or custom app", "Something else"];
export const BUDGETS = ["Under $2,000", "$2,000 – $5,000", "$5,000 – $10,000", "$10,000 – $25,000", "$25,000+", "Not sure yet"];
export const TIMEFRAMES = ["As soon as possible", "Within a month", "1–3 months", "3+ months", "Just exploring"];

/** Service page → the matching choice on the quote form (so "Get a quote" arrives pre-ticked). */
export const QUOTE_FOR: Record<string, string> = {
  "website-design": "New website", wordpress: "WordPress work", leadpages: "LeadPages website", "web-hosting": "Web hosting",
  "website-maintenance": "Website maintenance", "website-support": "Something else", "google-ads": "Google Ads", seo: "SEO",
  "email-and-domains": "Email & domains", "ai-and-custom-apps": "AI or custom app",
};
