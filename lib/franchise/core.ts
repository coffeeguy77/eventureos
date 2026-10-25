/**
 * Franchise (brand licence) applications — the steps, and the application form's questions.
 * enquiry → invited (sent the application link) → applied → reviewing → approved / declined (or withdrawn)
 */
export const FRANCHISE_STATUSES = ["enquiry", "invited", "applied", "reviewing", "approved", "declined", "withdrawn"] as const;
export type FranchiseStatus = (typeof FRANCHISE_STATUSES)[number];
export const STATUS_LABEL: Record<FranchiseStatus, string> = {
  enquiry: "New enquiry", invited: "Application sent", applied: "Application in", reviewing: "Reviewing", approved: "Approved", declined: "Declined", withdrawn: "Withdrawn",
};
export const STATUS_TONE: Record<FranchiseStatus, string> = {
  enquiry: "bg-sky-50 text-sky-700 ring-sky-200", invited: "bg-violet-50 text-violet-700 ring-violet-200", applied: "bg-amber-50 text-amber-800 ring-amber-200",
  reviewing: "bg-orange-50 text-orange-700 ring-orange-200", approved: "bg-emerald-50 text-emerald-700 ring-emerald-200", declined: "bg-zinc-100 text-zinc-600 ring-zinc-200", withdrawn: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};

export const MODELS = ["cafe", "kiosk", "licence", "unsure"] as const;
export type FranchiseModel = (typeof MODELS)[number];
export const MODEL_LABEL: Record<FranchiseModel, string> = { cafe: "A café", kiosk: "A kiosk / coffee bar", licence: "Brand licence for an existing business", unsure: "Not sure yet" };

export type Question = { key: string; label: string; hint?: string; kind: "text" | "long" | "choice" | "yesno"; options?: string[]; required?: boolean; section: string };

/** The application form, in order. Answers are stored as typed (answers jsonb). */
export const QUESTIONS: Question[] = [
  { section: "About you", key: "suburb", label: "Where do you live?", hint: "Suburb and state", kind: "text", required: true },
  { section: "About you", key: "background", label: "Tell us about your work background", kind: "long", required: true },
  { section: "About you", key: "hospitality", label: "Have you worked in hospitality or coffee?", kind: "choice", options: ["Yes — I've run a café or coffee business", "Yes — I've worked in one", "A little", "No, I'd be new to it"], required: true },
  { section: "About you", key: "partners", label: "Will anyone run the business with you?", hint: "Partners, family, investors", kind: "long" },
  { section: "Your plans", key: "model", label: "What would you like to open?", kind: "choice", options: Object.values(MODEL_LABEL), required: true },
  { section: "Your plans", key: "area", label: "Where would you like to open?", hint: "Suburb, shopping centre or street", kind: "text", required: true },
  { section: "Your plans", key: "site", label: "Do you have a site in mind?", kind: "choice", options: ["Yes — I have a lease or offer", "Yes — I'm looking at one", "Not yet"], required: true },
  { section: "Your plans", key: "existing", label: "If you already run a business, tell us about it", hint: "Name, address, how long it's traded", kind: "long" },
  { section: "Your plans", key: "timing", label: "When would you like to open?", kind: "choice", options: ["Within 3 months", "3–6 months", "6–12 months", "Just exploring"], required: true },
  { section: "Your plans", key: "hours", label: "Will you work in the business day to day?", kind: "choice", options: ["Yes, full time", "Part time", "No — I'd employ a manager"], required: true },
  { section: "Money", key: "budget", label: "Roughly how much can you invest, including fit-out?", kind: "choice", options: ["Under $50k", "$50k–$100k", "$100k–$250k", "Over $250k", "Prefer to discuss"], required: true },
  { section: "Money", key: "funding", label: "How would you fund it?", kind: "choice", options: ["My own savings", "Bank loan", "Mix of savings and finance", "Investor / partner", "Not sure yet"], required: true },
  { section: "Why us", key: "why", label: "Why {business}, and why now?", kind: "long", required: true },
  { section: "Why us", key: "questions", label: "Anything you'd like to ask us?", kind: "long" },
  { section: "Why us", key: "agree", label: "The details I've given are true, and {business} may contact me about my application", kind: "yesno", required: true },
];

/** Check and tidy an application before saving. */
export function cleanAnswers(raw: Record<string, unknown>, business = "us"): { ok: true; answers: Record<string, string> } | { ok: false; error: string } {
  const answers: Record<string, string> = {};
  for (const q of QUESTIONS) {
    const v = typeof raw[q.key] === "string" ? (raw[q.key] as string).trim().slice(0, q.kind === "long" ? 3000 : 300) : "";
    if (q.kind === "choice" && v && !q.options?.includes(v)) return { ok: false, error: `Pick one of the options for “${q.label}”.` };
    if (q.kind === "yesno" && v && v !== "yes") return { ok: false, error: "Tick the box to confirm." };
    if (q.required && !v) return { ok: false, error: q.kind === "yesno" ? "Tick the box to confirm your details are true." : `Please answer “${qText(q.label, business)}”.` };
    if (v) answers[q.key] = v;
  }
  return { ok: true, answers };
}

export const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/** Put the business's name into a question. */
export const qText = (s: string, business: string) => s.replace(/\{business\}/g, business);
