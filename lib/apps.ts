/**
 * The EventureOS app catalogue: the core every business gets, and the apps that are switched on per business by the
 * platform owner (Platform admin → Clients). One list drives the menus, page locks, the admin ticks, the client's
 * Settings → Apps screen and the public /apps page — so they never disagree.
 */

export const APP_KEYS = ["rentals", "bookings", "learn", "store", "offers", "wholesale", "kitchen", "wages", "website", "franchise", "pricing", "printing"] as const;
export type AppKey = (typeof APP_KEYS)[number];
export type AppIcon = "tent" | "ticket" | "graduation" | "coffee" | "percent" | "truck" | "chef" | "wallet" | "monitor" | "handshake" | "tag" | "printer";

export interface AppInfo {
  key: AppKey;
  name: string;
  /** back-end pages that belong to the app */
  paths: string[];
  icon: AppIcon;
  tagline: string;
  description: string;
  features: string[];
  /** the kinds of business it suits */
  for: string;
}

export const APPS: AppInfo[] = [
  {
    key: "rentals", name: "Hire", paths: ["/rentals"], icon: "tent",
    tagline: "Hire out equipment without double-booking it.",
    description: "Your items, stock and rates, with every booking checked live against what's free, including turnaround time between hires.",
    features: [
      "Cheapest rate mix worked out for any hire length (half day, day, week)",
      "Live stock checks, with who has it, when it's free and what to send instead",
      "Packages and items that go together, added for you",
      "Today board: going out, coming back, overdue",
      "Pick lists, delivery dockets, return counts and bonds",
      "Use and earnings per item, so you know what to buy more of",
    ],
    for: "Event hire, party hire, AV, marquees, coffee carts",
  },
  {
    key: "bookings", name: "Classes & courses", paths: ["/bookings"], icon: "ticket",
    tagline: "Sell seats in classes, workshops and courses.",
    description: "Courses and sessions people book and pay for online, with waitlists, gift vouchers, certificates and agency billing.",
    features: [
      "Online booking and card payment for every session",
      "Waitlists that fill themselves when seats free up",
      "Gift vouchers and promo codes",
      "Certificates issued when students finish",
      "Agencies and case managers billed by invoice",
      "Sessions blocked on your calendar when they're full",
    ],
    for: "Training schools, workshops, tastings, experiences",
  },
  {
    key: "learn", name: "Academy", paths: ["/learn"], icon: "graduation",
    tagline: "An online learning app with your name on it.",
    description: "Levels, lessons, quizzes, badges and challenges that students work through on their phone, with an AI coach.",
    features: [
      "Levels, modules and lessons with quizzes",
      "Badges and challenges to keep students going",
      "AI coach and photo feedback",
      "Paid or free access, and venue bookings",
    ],
    for: "Trainers and schools who teach a skill",
  },
  {
    key: "store", name: "Shop", paths: ["/store"], icon: "coffee",
    tagline: "Sell online: products, subscriptions and gift cards.",
    description: "An online shop on your own website, with customer accounts, shipping and subscriptions built in.",
    features: [
      "Products with options and stock",
      "Subscriptions and gift cards",
      "Coupons and website banners",
      "Parcels and shipping",
      "Customer accounts and order history",
    ],
    for: "Anyone with products to sell",
  },
  {
    key: "offers", name: "Offers", paths: ["/offers"], icon: "percent",
    tagline: "Promo codes you can share anywhere.",
    description: "Promo codes for classes, gift certificates and the shop, with a share link, a printable QR poster and a website ribbon.",
    features: ["Promo codes for classes, gift certificates and the shop", "Share links and QR posters", "A ribbon across your website"],
    for: "Businesses running promotions",
  },
  {
    key: "wholesale", name: "Wholesale", paths: ["/wholesale"], icon: "truck",
    tagline: "Take and deliver trade orders.",
    description: "Wholesale customers order from their own link at their own prices. You get packing run sheets and invoices.",
    features: ["Ordering link for each customer", "Price groups and minimum orders", "Delivery run sheets", "Orders imported from email (e.g. Ordermentum)"],
    for: "Producers supplying cafés, offices and venues",
  },
  {
    key: "kitchen", name: "Kitchen", paths: ["/kitchen"], icon: "chef",
    tagline: "From catering orders to a prep list.",
    description: "A run sheet for each day, what to make, and the order list for your suppliers, worked out from upcoming catering and your recipes.",
    features: ["Daily kitchen run sheets", "Recipes with ingredients and nutrition", "Supplier order lists", "Food labels"],
    for: "Caterers and event kitchens",
  },
  {
    key: "wages", name: "Wages", paths: ["/wages"], icon: "wallet",
    tagline: "Staff hours and pay, without the spreadsheet.",
    description: "Shifts from your events and roster, extra hours staff add on the day, and what's owed to each person.",
    features: ["Shifts and rosters", "Extra hours for approval", "What's owed and what's paid", "Staff see their own pay"],
    for: "Teams paid by the shift",
  },
  {
    key: "website", name: "Website", paths: ["/website"], icon: "monitor",
    tagline: "Your website, joined to everything else.",
    description: "Pages, menus and SEO on your own domain, with booking, hire, shop and enquiry forms built in.",
    features: ["Pages and menus you edit yourself", "Your own domain", "SEO redirects that keep your Google rankings", "Booking, hire and shop pages built in"],
    for: "Businesses that want one system for site and bookings",
  },
  {
    key: "pricing", name: "Pricing", paths: ["/pricing"], icon: "tag",
    tagline: "Catch price creep before it costs you.",
    description: "Supplier invoices read straight from your email, every line's price tracked over time, and the cheapest supplier for each product when you order.",
    features: ["Invoices read from Gmail automatically", "Price rises and incorrect invoices flagged", "Price history for every product", "Compare suppliers before you order"],
    for: "Anyone buying stock from several suppliers",
  },
  {
    key: "printing", name: "Printing", paths: ["/printing"], icon: "printer",
    tagline: "Print jobs quoted, artwork collected, invoiced.",
    description: "Customers upload their artwork on your website, you quote by the lineal metre with setup and cutting, and turn the job into an invoice.",
    features: ["Artwork uploads from your website", "Quotes priced by the lineal metre", "Customers approve online", "One click to invoice"],
    for: "Sign, banner and sticker printers",
  },
  {
    key: "franchise", name: "Franchise", paths: ["/franchise"], icon: "handshake",
    tagline: "Win and onboard franchisees and licensees.",
    description: "A franchise page that sells the opportunity, and a pipeline from enquiry to approved application.",
    features: ["Franchise landing page", "Application form you can edit", "Pipeline from enquiry to approval"],
    for: "Brands licensing their name",
  },
];

/** What every business gets. */
export const CORE: { name: string; text: string }[] = [
  { name: "Enquiries", text: "Website forms and Gmail in one inbox, sorted by AI." },
  { name: "Clients & CRM", text: "Every client's history, jobs, emails and money." },
  { name: "Quotes", text: "Price lists and rules, accepted online." },
  { name: "Events & calendar", text: "Jobs, rosters and Google Calendar." },
  { name: "Invoices & payments", text: "Card payments with Stripe, synced to Xero." },
  { name: "Customer portal", text: "Clients see quotes, invoices and receipts." },
  { name: "To-do & reports", text: "What needs doing, and how the business is going." },
];

export const isAppKey = (k: unknown): k is AppKey => typeof k === "string" && (APP_KEYS as readonly string[]).includes(k);
export const appInfo = (k: AppKey) => APPS.find((a) => a.key === k)!;

/** null = everything (businesses set up before app access existed); otherwise exactly these apps. */
export type AppAccess = Set<AppKey> | null;
export function readAppAccess(raw: unknown): AppAccess {
  if (!Array.isArray(raw)) return null;
  return new Set(raw.filter(isAppKey));
}
export const appAllowed = (access: AppAccess, k: AppKey) => access === null || access.has(k);

/** The app a back-end page belongs to (null = core). */
export function appForPath(path: string): AppKey | null {
  for (const a of APPS) if (a.paths.some((p) => path === p || path.startsWith(p + "/"))) return a.key;
  return null;
}

export const PLAN_KEYS = ["trial", "starter", "growth", "scale"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];
export const PLAN_NAMES: Record<PlanKey, string> = { trial: "Trial", starter: "Starter", growth: "Growth", scale: "Scale" };

/** Which apps each plan includes (set in Platform admin → Plans). Until it's set, every plan includes every app. */
export function readPlanApps(raw: unknown): Record<PlanKey, AppKey[]> {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as Record<PlanKey, AppKey[]>;
  for (const p of PLAN_KEYS) out[p] = Array.isArray(o[p]) ? (o[p] as unknown[]).filter(isAppKey) : [...APP_KEYS];
  return out;
}

export function cleanAppList(raw: unknown): AppKey[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(isAppKey))] : [];
}
