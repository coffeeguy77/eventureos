/**
 * Sales bonuses (pure): a team member's % of an invoice's ex-GST amount, earned as the customer pays it.
 * Rates per person live in settings.bonuses.people[userId] = { build, maintenance }.
 */
export type BonusKind = "build" | "maintenance" | "other";
export const KIND_LABEL: Record<BonusKind, string> = { build: "New website build", maintenance: "Maintenance", other: "Other" };
export interface BonusRates { build: number; maintenance: number }

const pct = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : 0; };

export function readBonusRates(settings: unknown): Record<string, BonusRates> {
  const b = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).bonuses : null) as Record<string, unknown> | null;
  const people = (b?.people && typeof b.people === "object" ? b.people : {}) as Record<string, unknown>;
  const out: Record<string, BonusRates> = {};
  for (const [id, v] of Object.entries(people)) {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const x = { build: pct(r.build), maintenance: pct(r.maintenance) };
    if (x.build || x.maintenance) out[id] = x;
  }
  return out;
}

/** What a bonus is worth now: on the ex-GST amount, in proportion to what the customer has paid. */
export function bonusFigures(inv: { subtotal: number; total: number; amount_paid: number; status: string }, rate: number) {
  const exGst = Math.round(Number(inv.subtotal) * 100) / 100;
  const full = Math.round(exGst * rate) / 100;
  const share = inv.status === "void" ? 0 : Number(inv.total) > 0 ? Math.min(1, Math.max(0, Number(inv.amount_paid) / Number(inv.total))) : 0;
  const earned = Math.round(full * share * 100) / 100;
  return { exGst, full, earned, paidInFull: share >= 0.999, share };
}
