/**
 * What each person on the staff list can do, and how many people a job needs.
 * Pure — used by the staff list, the job page, the dashboard and tests.
 */

export const STAFF_SKILLS = [
  { key: "coffee_cart", label: "Coffee cart" },
  { key: "coffee_van", label: "Coffee van" },
  { key: "equipment", label: "Equipment hire" },
  { key: "catering", label: "Catering" },
  { key: "driver", label: "Licence — can drive the van", short: "Licence" },
  { key: "roster", label: "Rosters / office only — not event staff", short: "Rosters only" },
] as const;
export type StaffSkill = (typeof STAFF_SKILLS)[number]["key"];
const KEYS = new Set<string>(STAFF_SKILLS.map((s) => s.key));

export const cleanSkills = (v: unknown): StaffSkill[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is StaffSkill => typeof x === "string" && KEYS.has(x)))] : [];

export const skillLabel = (k: string) => {
  const s = STAFF_SKILLS.find((x) => x.key === k) as { label: string; short?: string } | undefined;
  return s ? s.short ?? s.label : k;
};

/** Rostering / office people are never counted as people working the job. */
export const isRosterOnly = (skills: readonly string[] | null | undefined) => !!skills?.includes("roster");

/**
 * How many people the job needs, from the quote's staff lines: on each day, people = units × per unit, added up across the
 * staff lines; the busiest day wins. null when the quote has no staff lines with that detail (older quotes).
 */
export function staffNeededFromLines(lines: { details?: unknown }[]): number | null {
  const perDay = new Map<string, number>();
  let found = false;
  for (const l of lines) {
    const d = (l.details ?? null) as { kind?: string; days?: { date?: string | null; units?: number; per_unit?: number }[] } | null;
    if (d?.kind !== "staff" || !Array.isArray(d.days)) continue;
    for (const [i, day] of d.days.entries()) {
      const n = Math.max(0, Math.round(Number(day.units ?? 1) * Number(day.per_unit ?? 1)));
      if (!Number.isFinite(n)) continue;
      const k = day.date ?? `#${i}`;
      perDay.set(k, (perDay.get(k) ?? 0) + n);
      found = true;
    }
  }
  if (!found) return null;
  return Math.min(50, Math.max(...perDay.values()));
}

/** A coffee van job (someone has to drive the van there): the job or one of its quote lines says "van". */
export const isVanJob = (texts: (string | null | undefined)[]) => texts.some((t) => /\bvan\b/i.test(t ?? ""));
