/**
 * Barista job board — shared, pure helpers (no server or browser imports).
 */

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DAY_LABEL: Record<(typeof DAYS)[number], string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
export const SLOTS = ["am", "pm", "eve"] as const;
export const SLOT_LABEL: Record<(typeof SLOTS)[number], string> = { am: "Morning", pm: "Afternoon", eve: "Evening" };
export type Availability = Partial<Record<(typeof DAYS)[number], (typeof SLOTS)[number][]>>;

export const SKILLS = [
  "Espresso", "Milk texturing", "Latte art", "Grinder dial-in", "Batch brew / filter", "Pour over", "Opening & closing", "Cash & POS",
  "Coffee cart / events", "High-volume café", "Customer service", "Food handling", "Barista trainer", "Roasting",
] as const;
export const WORK_TYPES = [
  { id: "casual", label: "Casual" }, { id: "part_time", label: "Part-time" }, { id: "full_time", label: "Full-time" },
  { id: "events", label: "Events & markets" }, { id: "one_off", label: "One-off shifts" }, { id: "weekends", label: "Weekends only" },
] as const;
export const EXPERIENCE = [
  { id: "new", label: "Just trained" }, { id: "some", label: "Some café experience" }, { id: "experienced", label: "Experienced (1–3 years)" }, { id: "pro", label: "Senior / 3+ years" },
] as const;
export const JOB_KINDS = [
  { id: "one_off", label: "One-off shift" }, { id: "event", label: "Event" }, { id: "regular", label: "Regular shift" }, { id: "ongoing", label: "Ongoing role" },
] as const;

export function readAvailability(raw: unknown): Availability {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Availability = {};
  for (const d of DAYS) {
    const v = o[d];
    if (Array.isArray(v)) { const slots = SLOTS.filter((s) => v.includes(s)); if (slots.length) out[d] = slots; }
  }
  return out;
}

/** "Weekends", "Mon–Fri", "Mon, Wed, Sat" — a short summary for cards. */
export function availabilitySummary(a: Availability) {
  const days = DAYS.filter((d) => (a[d] ?? []).length);
  if (!days.length) return "Availability not set";
  const set = days.join(",");
  if (set === "sat,sun") return "Weekends";
  if (set === "mon,tue,wed,thu,fri") return "Weekdays";
  if (days.length === 7) return "Any day";
  return days.map((d) => DAY_LABEL[d]).join(", ");
}

/** First name + last initial — what employers see before contact is shared. */
export function publicName(full: string, display?: string | null) {
  if (display?.trim()) return display.trim().slice(0, 80);
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Barista";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Distance in km between two points (haversine). */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Contact details (email/phone) never appear in a message unless the barista has shared them — a light filter for obvious attempts. */
export function looksLikeContact(text: string) {
  return /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text) || /(?:\+?61|0)[\s-]?4(?:[\s-]?\d){8}/.test(text);
}

export interface JobSettings { enabled: boolean; name: string; welcomeSubject: string; welcomeBody: string; batchSize: number; dailyLimit: number }
export function readJobSettings(orgSettings: unknown, orgName: string): JobSettings {
  const raw = (orgSettings && typeof orgSettings === "object" ? (orgSettings as Record<string, unknown>).jobs : null) as Record<string, unknown> | null;
  const r = raw && typeof raw === "object" ? raw : {};
  const str = (v: unknown, d: string, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : d);
  const n = Number(r.batchSize), d = Number(r.dailyLimit);
  return {
    enabled: r.enabled !== false,
    name: str(r.name, `${orgName} Barista Jobs`, 80),
    welcomeSubject: str(r.welcomeSubject, `Find barista work with ${orgName} — your free profile is ready`, 150),
    welcomeBody: str(r.welcomeBody, defaultWelcome(orgName), 6000),
    batchSize: Number.isFinite(n) && n > 0 ? Math.max(5, Math.min(200, Math.round(n))) : 40,
    // Welcome letters per day — keeps room in the email plan for booking emails
    dailyLimit: Number.isFinite(d) && d > 0 ? Math.max(10, Math.min(5000, Math.round(d))) : 80,
  };
}

export function defaultWelcome(orgName: string) {
  return `Hi {first_name},

You trained with us at ${orgName}, and we'd love to help you find barista work.

We've started ${orgName} Barista Jobs — a free job board where cafés, coffee carts and event companies looking for staff can find trained baristas like you. You can also see shifts and jobs they post, and get in touch.

You're in control:
• Your profile is off until you switch it on.
• Employers never see your phone number or email unless you choose to share them.
• Add your suburb so nearby employers can find you, and the days you're free — weekends only is fine.
• Your ${orgName} certificate shows on your profile, so employers know you're trained.

It takes two minutes and there's no password — just tap the button below.

Cheers,
The ${orgName} team`;
}

/** Fill {first_name} {name} etc. in the welcome letter. */
export const fillLetter = (text: string, v: { first_name: string; name: string; business: string }) =>
  text.replace(/\{(first_name|name|business)\}/g, (_, k: keyof typeof v) => v[k]);
