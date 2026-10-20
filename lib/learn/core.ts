/**
 * Learn — the online barista course. Pure helpers (no database): settings, prices, ranks, badges, streaks,
 * the daily challenge, mastery quizzes, Markdown → blocks for lessons, marketplace commission.
 */

/* ------------------------------------------------------------------ settings (organisations.settings.learn) */

export type Plan = "with_course" | "monthly" | "yearly";
export const PLANS: Plan[] = ["with_course", "monthly", "yearly"];

export interface LearnSettings {
  /** Selling is switched on (off until the business is ready) */
  enabled: boolean;
  /** What learners see it called */
  name: string;
  tagline: string;
  prices: Record<Plan, number>;
  plans: Record<Plan, boolean>;
  /** Courses that offer the add-on at checkout (empty = every course) */
  addonCourseIds: string[];
  /** Students can still get the with-course price for this many days after their class (0 = only when booking) */
  pastStudentDays: number;
  /** Months of access for with_course and yearly */
  accessMonths: number;
  ai: { enabled: boolean; dailyMessages: number; dailyPhotos: number };
  leaderboard: boolean;
  marketplace: { enabled: boolean; listingFee: number; commissionPct: number };
  /** Email the learner when their access starts (customer emails default off) */
  welcomeEmail: boolean;
  /** Email learners a reminder before a yearly / with-course pass ends */
  renewalReminder: boolean;
}

/** Suggested starting prices (from the Replit app's Solo plan of $14.99 a month): yearly = 10 months (2 free), with a course = half the yearly. */
export const DEFAULT_PRICES: Record<Plan, number> = { monthly: 14.99, yearly: 149.9, with_course: 74.95 };

export const DEFAULT_LEARN: LearnSettings = {
  enabled: false, name: "Online Barista Course", tagline: "Keep learning after your class — lessons, quizzes, a roast simulator and an AI coach.",
  prices: { ...DEFAULT_PRICES }, plans: { with_course: true, monthly: true, yearly: true }, addonCourseIds: [], pastStudentDays: 0, accessMonths: 12,
  ai: { enabled: true, dailyMessages: 30, dailyPhotos: 5 }, leaderboard: true,
  marketplace: { enabled: false, listingFee: 0, commissionPct: 15 }, welcomeEmail: false, renewalReminder: false,
};

const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const money2 = (v: unknown, d: number) => Math.round(num(v, d, 0, 100000) * 100) / 100;
const str = (v: unknown, d: string, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : d);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readLearnSettings(orgSettings: unknown): LearnSettings {
  const raw = obj(obj(orgSettings).learn);
  const p = obj(raw.prices), pl = obj(raw.plans), ai = obj(raw.ai), mk = obj(raw.marketplace);
  return {
    enabled: raw.enabled === true,
    name: str(raw.name, DEFAULT_LEARN.name, 80),
    tagline: str(raw.tagline, DEFAULT_LEARN.tagline, 240),
    prices: { with_course: money2(p.with_course, DEFAULT_PRICES.with_course), monthly: money2(p.monthly, DEFAULT_PRICES.monthly), yearly: money2(p.yearly, DEFAULT_PRICES.yearly) },
    plans: { with_course: pl.with_course !== false, monthly: pl.monthly !== false, yearly: pl.yearly !== false },
    addonCourseIds: Array.isArray(raw.addonCourseIds) ? raw.addonCourseIds.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 100) : [],
    pastStudentDays: Math.round(num(raw.pastStudentDays, 0, 0, 365)),
    accessMonths: Math.round(num(raw.accessMonths, 12, 1, 36)),
    ai: { enabled: ai.enabled !== false, dailyMessages: Math.round(num(ai.dailyMessages, 30, 0, 500)), dailyPhotos: Math.round(num(ai.dailyPhotos, 5, 0, 100)) },
    leaderboard: raw.leaderboard !== false,
    marketplace: { enabled: mk.enabled === true, listingFee: money2(mk.listingFee, 0), commissionPct: num(mk.commissionPct, 15, 0, 100) },
    welcomeEmail: raw.welcomeEmail === true,
    renewalReminder: raw.renewalReminder === true,
  };
}

/** Is this course one that offers the online course as an add-on? */
export const courseOffersAddon = (s: LearnSettings, courseId: string) => s.enabled && s.plans.with_course && (s.addonCourseIds.length === 0 || s.addonCourseIds.includes(courseId));

/** The add-on offered on a course's booking page (null when it isn't). */
export function addonOffer(orgSettings: unknown, courseId: string) {
  const s = readLearnSettings(orgSettings);
  if (!courseOffersAddon(s, courseId)) return null;
  return { name: s.name, price: s.prices.with_course, yearly: s.prices.yearly, months: s.accessMonths, tagline: s.tagline };
}

/** "Save 50%" / "2 months free" style labels worked out from the prices (never hard-coded). */
export function priceStory(s: LearnSettings) {
  const yearAtMonthly = s.prices.monthly * 12;
  const monthsFree = s.prices.monthly > 0 ? Math.round((yearAtMonthly - s.prices.yearly) / s.prices.monthly) : 0;
  const courseSave = s.prices.yearly > 0 ? Math.round((1 - s.prices.with_course / s.prices.yearly) * 100) : 0;
  return {
    yearlySaving: Math.max(0, Math.round((yearAtMonthly - s.prices.yearly) * 100) / 100),
    monthsFree: Math.max(0, monthsFree),
    courseSavePct: Math.max(0, courseSave),
    perMonthYearly: Math.round((s.prices.yearly / 12) * 100) / 100,
    perMonthCourse: Math.round((s.prices.with_course / 12) * 100) / 100,
  };
}

export const PLAN_LABEL: Record<Plan | "comp", string> = { with_course: "12 months with a barista course", monthly: "Monthly", yearly: "Yearly", comp: "Free access" };

/* ------------------------------------------------------------------ access */

export interface AccessRow { id: string; plan: Plan | "comp"; status: string; starts_at: string | null; ends_at: string | null; renews: boolean }

/** The access that's live now (latest end wins), or null. Monthly renewals that failed keep a 7-day grace. */
export function liveAccess<T extends AccessRow>(rows: T[], now = Date.now()): T | null {
  const grace = (r: T) => (r.status === "payment_failed" ? 7 * 86400e3 : 0);
  const live = rows.filter((r) => (r.status === "active" || r.status === "payment_failed")
    && (!r.ends_at || Date.parse(r.ends_at) + grace(r) > now) && (!r.starts_at || Date.parse(r.starts_at) <= now + 60e3));
  live.sort((a, b) => (b.ends_at ? Date.parse(b.ends_at) : Infinity) - (a.ends_at ? Date.parse(a.ends_at) : Infinity));
  return live[0] ?? null;
}

/** Add whole months to a date (clamped to the end of shorter months). */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

/** A new pass starts when the current one ends (buying early never loses days). */
export function accessWindow(plan: Plan, currentEnd: string | null, months: number, now = new Date()) {
  const start = currentEnd && Date.parse(currentEnd) > now.getTime() ? currentEnd : now.toISOString();
  return { starts_at: start, ends_at: addMonths(start, plan === "monthly" ? 1 : months) };
}

/* ------------------------------------------------------------------ curriculum */

export interface Level { id: string; key: string; number: number; title: string; description: string | null; min_xp: number; xp_reward: number; position: number; published: boolean; certificate_title: string | null }
export interface Module { id: string; key: string; level_id: string; title: string; description: string | null; xp_reward: number; position: number; published: boolean }
export interface Quiz { question: string; options: string[]; correct_index: number; explanation?: string | null }
export interface Lesson { id: string; key: string; module_id: string; title: string; duration_minutes: number; xp_reward: number; content: string; key_points: string[]; quiz: Quiz | null; position: number; published: boolean }

export function readQuiz(v: unknown): Quiz | null {
  const q = obj(v);
  if (typeof q.question !== "string" || !Array.isArray(q.options)) return null;
  const options = q.options.filter((o): o is string => typeof o === "string").slice(0, 8);
  const ci = Number(q.correct_index);
  if (options.length < 2 || !Number.isInteger(ci) || ci < 0 || ci >= options.length) return null;
  return { question: q.question, options, correct_index: ci, explanation: typeof q.explanation === "string" ? q.explanation : null };
}

/** The learner's rank: the level with the highest XP threshold they've reached (ties → the lowest level number). */
export function rankFor(levels: Pick<Level, "number" | "title" | "min_xp">[], xp: number) {
  const reached = levels.filter((l) => l.min_xp <= xp).sort((a, b) => b.min_xp - a.min_xp || a.number - b.number);
  const current = reached[0] ?? null;
  const next = levels.filter((l) => l.min_xp > xp).sort((a, b) => a.min_xp - b.min_xp)[0] ?? null;
  const from = current?.min_xp ?? 0;
  const pct = next ? Math.round(((xp - from) / Math.max(1, next.min_xp - from)) * 100) : 100;
  return { current, next, pct: Math.max(0, Math.min(100, pct)), toNext: next ? next.min_xp - xp : 0 };
}

/** A level opens once the learner has its XP. */
export const levelOpen = (l: Pick<Level, "min_xp">, xp: number) => xp >= l.min_xp;

/** Mastery quiz for a module: every lesson's knowledge check. Pass mark 80%. */
export const PASS_MARK = 0.8;
export function masteryQuestions(lessons: Pick<Lesson, "id" | "title" | "quiz">[]) {
  return lessons.filter((l) => l.quiz).map((l) => ({ lessonId: l.id, lessonTitle: l.title, ...(l.quiz as Quiz) }));
}
export function gradeMastery(qs: { correct_index: number }[], answers: (number | null)[]) {
  const score = qs.reduce((n, q, i) => n + (answers[i] === q.correct_index ? 1 : 0), 0);
  return { score, outOf: qs.length, passed: qs.length > 0 && score / qs.length >= PASS_MARK };
}

/** Today's challenge: the same for everyone on a given day, rotating through the active ones. */
export function challengeFor<T>(active: T[], dayISO: string): T | null {
  if (!active.length) return null;
  const day = Math.floor(Date.parse(`${dayISO}T00:00:00Z`) / 86400e3);
  return active[((day % active.length) + active.length) % active.length];
}

/* ------------------------------------------------------------------ badges */

export type BadgeRule =
  | { kind: "lessons"; value: number } | { kind: "streak"; value: number } | { kind: "level"; value: string }
  | { kind: "roast"; value: number } | { kind: "challenges"; value: number } | { kind: "art"; value: number }
  | { kind: "module_day" } | { kind: "manual" };

export function readRule(v: unknown): BadgeRule {
  const r = obj(v);
  const n = (x: unknown) => Math.max(0, Number(x) || 0);
  switch (r.kind) {
    case "lessons": case "streak": case "roast": case "challenges": case "art": return { kind: r.kind, value: n(r.value) } as BadgeRule;
    case "level": return { kind: "level", value: String(r.value ?? "") };
    case "module_day": return { kind: "module_day" };
    default: return { kind: "manual" };
  }
}

export interface LearnerStats { lessons: number; streak: number; bestStreak: number; levelsDone: string[]; bestRoast: number; challenges: number; bestArt: number; moduleInADay: boolean }

export function earned(rule: BadgeRule, s: LearnerStats): boolean {
  switch (rule.kind) {
    case "lessons": return s.lessons >= rule.value;
    case "streak": return Math.max(s.streak, s.bestStreak) >= rule.value;
    case "level": return s.levelsDone.includes(rule.value);
    case "roast": return s.bestRoast >= rule.value;
    case "challenges": return s.challenges >= rule.value;
    case "art": return s.bestArt >= rule.value;
    case "module_day": return s.moduleInADay;
    default: return false;
  }
}

export function ruleText(rule: BadgeRule): string {
  switch (rule.kind) {
    case "lessons": return `Complete ${rule.value} lesson${rule.value === 1 ? "" : "s"}`;
    case "streak": return `${rule.value}-day streak`;
    case "level": return `Finish level ${rule.value}`;
    case "roast": return `Score ${rule.value}+ on the roast simulator`;
    case "challenges": return `Do ${rule.value} daily challenges`;
    case "art": return `Score ${rule.value}+ on a latte art photo`;
    case "module_day": return "Finish a whole module in one day";
    default: return "Given by your trainer";
  }
}

/** Finished every lesson of a module on the same day (in the business's timezone)? */
export function moduleInOneDay(modules: { id: string; lessonIds: string[] }[], done: Map<string, string>, tz: string) {
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  return modules.some((m) => m.lessonIds.length > 1 && m.lessonIds.every((id) => done.has(id)) && new Set(m.lessonIds.map((id) => day(done.get(id)!))).size === 1);
}

/* ------------------------------------------------------------------ lesson Markdown → blocks (no HTML injection) */

export type Inline = { t: string; b?: boolean };
export type Block =
  | { k: "h2" | "h3" | "p"; text: Inline[] } | { k: "ul" | "ol"; items: Inline[][] } | { k: "quote"; lines: Inline[][] }
  | { k: "table"; head: string[]; rows: string[][] } | { k: "code"; text: string } | { k: "hr" };

/** **bold** runs (the only inline style the lessons use). */
export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) { if (m.index > last) out.push({ t: s.slice(last, m.index) }); out.push({ t: m[1], b: true }); last = m.index + m[0].length; }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out.length ? out : [{ t: "" }];
}

export function parseLesson(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    const t = l.trim();
    if (!t) { i++; continue; }
    if (t.startsWith("```")) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++; blocks.push({ k: "code", text: buf.join("\n") }); continue;
    }
    if (/^-{3,}$/.test(t)) { blocks.push({ k: "hr" }); i++; continue; }
    if (t.startsWith("### ")) { blocks.push({ k: "h3", text: inline(t.slice(4)) }); i++; continue; }
    if (t.startsWith("## ")) { blocks.push({ k: "h2", text: inline(t.slice(3)) }); i++; continue; }
    if (t.startsWith("# ")) { blocks.push({ k: "h2", text: inline(t.slice(2)) }); i++; continue; }
    if (t.startsWith("|") && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      const head = cells(t); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      blocks.push({ k: "table", head, rows }); continue;
    }
    if (t.startsWith(">")) {
      const q: Inline[][] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) { const x = lines[i++].trim().replace(/^>\s?/, ""); if (x) q.push(inline(x)); }
      blocks.push({ k: "quote", lines: q }); continue;
    }
    if (/^[-•]\s/.test(t)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^[-•]\s/.test(lines[i].trim())) items.push(inline(lines[i++].trim().slice(2)));
      blocks.push({ k: "ul", items }); continue;
    }
    if (/^\d+\.\s/.test(t)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        let item = lines[i++].trim().replace(/^\d+\.\s/, "");
        // A line straight after a numbered item (no blank, not a new item) belongs to it
        while (i < lines.length && lines[i].trim() && !/^(\d+\.|[-•]|#|\||>)\s?/.test(lines[i].trim())) item += ` — ${lines[i++].trim()}`;
        items.push(inline(item));
      }
      blocks.push({ k: "ol", items }); continue;
    }
    // Paragraph: consecutive plain lines (kept as separate lines)
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|[-•]\s|\d+\.\s|>|\||```|-{3,}$)/.test(lines[i].trim())) buf.push(lines[i++].trim());
    if (!buf.length) { blocks.push({ k: "p", text: inline(t) }); i++; continue; }
    for (const b of buf) blocks.push({ k: "p", text: inline(b) });
  }
  // Lessons start with their own title as a heading — the page already shows it
  return blocks;
}

/** Reading time from the text (about 200 words a minute), at least 1. */
export const readMinutes = (md: string) => Math.max(1, Math.round(md.split(/\s+/).filter(Boolean).length / 200));

/* ------------------------------------------------------------------ marketplace */

/** The business's commission and the venue's share of a room hire. */
export function hireSplit(amount: number, commissionPct: number) {
  const a = Math.max(0, Math.round(Number(amount) * 100) / 100);
  const commission = Math.round(a * Math.max(0, Math.min(100, commissionPct))) / 100;
  return { amount: a, commission, venue: Math.round((a - commission) * 100) / 100 };
}

export const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;

/** Leaderboard name: first name and last initial, or the learner's chosen display name. */
export function boardName(displayName: string | null, fullName: string) {
  if (displayName?.trim()) return displayName.trim().slice(0, 40);
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || "Learner";
}

/* ------------------------------------------------------------------ course order and progress */

type LV = Pick<Level, "id" | "number" | "position" | "min_xp">; type MD = Pick<Module, "id" | "level_id" | "position">; type LS = Pick<Lesson, "id" | "module_id" | "position">;

/** Levels in order (by number), then their modules, then lessons. */
export function courseOrder<L extends LV, M extends MD, X extends LS>(c: { levels: L[]; modules: M[]; lessons: X[] }) {
  const levels = [...c.levels].sort((a, b) => a.number - b.number || a.position - b.position);
  const modulesOf = (levelId: string) => c.modules.filter((m) => m.level_id === levelId).sort((a, b) => a.position - b.position);
  const lessonsOf = (moduleId: string) => c.lessons.filter((l) => l.module_id === moduleId).sort((a, b) => a.position - b.position);
  const flat: { lessonId: string; moduleId: string; levelId: string }[] = [];
  for (const l of levels) for (const m of modulesOf(l.id)) for (const x of lessonsOf(m.id)) flat.push({ lessonId: x.id, moduleId: m.id, levelId: l.id });
  return { levels, modulesOf, lessonsOf, flat };
}

/** The next lesson to do: the first unfinished one in an open level (and in the free module when there's no access). */
export function nextLesson(c: { levels: LV[]; modules: MD[]; lessons: LS[] }, done: { has: (id: string) => boolean }, xp: number, opts: { access: boolean; freeModuleId: string | null }) {
  const { flat, levels } = courseOrder(c);
  const open = new Set(levels.filter((l) => xp >= l.min_xp).map((l) => l.id));
  return flat.find((f) => !done.has(f.lessonId) && open.has(f.levelId) && (opts.access || f.moduleId === opts.freeModuleId)) ?? null;
}

/** Lessons done / total, for a module or a level. */
export function countDone(lessonIds: string[], done: { has: (id: string) => boolean }) {
  const n = lessonIds.filter((id) => done.has(id)).length;
  return { done: n, total: lessonIds.length, pct: lessonIds.length ? Math.round((n / lessonIds.length) * 100) : 0 };
}
