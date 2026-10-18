/**
 * The do-it-yourself coffee guide shown to clients who hire the equipment only: how much coffee and milk to buy.
 * Quantities only — never prices or per-cup costs. Pure — used by the client portal calculator and tests.
 *
 * Guide figures (from the business):
 * - 1 kg of beans = 50 double shots at 20 g → 50 × 12oz cups, or up to 100 × 6oz cups (no waste).
 * - Milk: about 15 × 6oz coffees per 2 L.
 * - For 100 people: 2 L almond, 2 L oat, 1 L soy, 1 L lactose free (scaled to the number of guests).
 */
export const DIY_GUIDE = {
  gramsPerCup: { "6oz": 10, "12oz": 20 },
  /** Cups per 2 L of milk. 12oz is taken as twice the milk of a 6oz. */
  cupsPer2L: { "6oz": 15, "12oz": 7.5 },
  /** Litres of each alternative milk per 100 guests */
  altPer100: [
    { name: "Almond", litres: 2 },
    { name: "Oat", litres: 2 },
    { name: "Soy", litres: 1 },
    { name: "Lactose free", litres: 1 },
  ],
} as const;

export type CupSize = "6oz" | "12oz";
export interface GuideInput { guests: number; perGuest: number; size: CupSize }
export interface GuideResult {
  cups: number;
  coffeeKg: number;         // exact, no waste
  coffeeBags: number;       // whole 1 kg bags to buy
  milkLitres: number;       // total milk, rounded up to whole litres
  regularLitres: number;    // full cream / regular
  alternatives: { name: string; litres: number }[];
}

const up = (n: number) => Math.max(0, Math.ceil(n - 1e-9));

export function diyGuide(input: GuideInput): GuideResult {
  const guests = Math.max(0, Math.min(10000, Math.round(Number(input.guests) || 0)));
  const per = Math.max(0, Math.min(10, Number(input.perGuest) || 0));
  const size: CupSize = input.size === "12oz" ? "12oz" : "6oz";
  const cups = up(guests * per);
  const coffeeKg = (cups * DIY_GUIDE.gramsPerCup[size]) / 1000;
  const milkExact = (cups / DIY_GUIDE.cupsPer2L[size]) * 2;
  const milkLitres = up(milkExact);
  const alternatives = cups === 0 ? DIY_GUIDE.altPer100.map((a) => ({ name: a.name, litres: 0 }))
    : DIY_GUIDE.altPer100.map((a) => ({ name: a.name, litres: Math.max(1, up((a.litres * guests) / 100)) }));
  const altTotal = alternatives.reduce((t, a) => t + a.litres, 0);
  return { cups, coffeeKg, coffeeBags: up(coffeeKg), milkLitres, regularLitres: Math.max(0, milkLitres - altTotal), alternatives };
}

/** Does this quote include do-it-yourself equipment hire? (a line or section saying "DIY" or "equipment") */
export const hasDiyHire = (texts: (string | null | undefined)[]) => texts.some((t) => /\bDIY\b|equipment/i.test(t ?? ""));
