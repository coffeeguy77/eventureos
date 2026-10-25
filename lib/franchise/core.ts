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
export function cleanAnswers(raw: Record<string, unknown>, business = "us", questions: Question[] = QUESTIONS): { ok: true; answers: Record<string, string> } | { ok: false; error: string } {
  const answers: Record<string, string> = {};
  for (const q of questions) {
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

// ------------------------------------------------------------------------------------------------ editable questions
/**
 * The business's own questions, edited in Franchise → Application questions. Saved at settings.franchise.questions;
 * until it's been edited, the built-in set above is used. Old answers to removed questions are kept on the application.
 */
export const KINDS: Question["kind"][] = ["text", "long", "choice", "yesno"];
export const KIND_LABEL: Record<Question["kind"], string> = { text: "Short answer", long: "Long answer", choice: "Pick one", yesno: "Tick box" };
const KEY = /^[a-z0-9_]{1,40}$/;
const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Validate a list of questions (from the editor or from settings). Returns null when nothing usable is there. */
export function cleanQuestions(v: unknown): { ok: true; questions: Question[] } | { ok: false; error: string } {
  if (!Array.isArray(v)) return { ok: false, error: "No questions." };
  const out: Question[] = [];
  const seen = new Set<string>();
  for (const [n, x] of v.slice(0, 60).entries()) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const label = t(o.label, 300);
    if (!label) return { ok: false, error: `Question ${n + 1} needs some words.` };
    let key = t(o.key, 40).toLowerCase();
    if (!KEY.test(key)) key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || `q${n + 1}`;
    while (seen.has(key)) key = `${key.slice(0, 36)}_${n + 1}`;
    seen.add(key);
    const kind = KINDS.includes(o.kind as Question["kind"]) ? (o.kind as Question["kind"]) : "text";
    const q: Question = { key, label, kind, section: t(o.section, 60) || "Questions" };
    const hint = t(o.hint, 200); if (hint) q.hint = hint;
    if (o.required === true) q.required = true;
    if (kind === "choice") {
      const opts = [...new Set((Array.isArray(o.options) ? o.options : []).map((x) => t(x, 120)).filter(Boolean))].slice(0, 12);
      if (opts.length < 2) return { ok: false, error: `“${label.slice(0, 40)}” needs at least two choices.` };
      q.options = opts;
    }
    out.push(q);
  }
  if (!out.length) return { ok: false, error: "Add at least one question." };
  return { ok: true, questions: out };
}

export function readQuestions(settings: unknown): Question[] {
  const f = settings && typeof settings === "object" ? (settings as Record<string, unknown>).franchise : null;
  const raw = f && typeof f === "object" ? (f as Record<string, unknown>).questions : null;
  if (!Array.isArray(raw)) return QUESTIONS;
  const c = cleanQuestions(raw);
  return c.ok ? c.questions : QUESTIONS;
}
