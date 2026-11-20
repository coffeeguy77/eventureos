/**
 * The limits the AI optimiser can't go past. The AI proposes changes; this decides which may be made.
 * Pure (no I/O) so it can be tested. Everything here is enforced in code, whatever the AI says.
 *
 *  - Only four kinds of change: pause a keyword, add a negative keyword, change a keyword's bid, change a campaign budget.
 *    It never creates or switches on campaigns, ad groups, keywords or ads, and never removes anything.
 *  - Budgets: at most ±20% per change, and every enabled campaign's daily budget × 30.4 must stay within the
 *    client's monthly cap. Once this month's spend has reached the cap, budgets can only go down.
 *  - Bids: at most ±25% per change, never below $0.10.
 *  - Keywords with a conversion in the review period are never paused.
 *  - At most max_changes per run; one change per thing per run.
 */

export type ActionKind = "pause_keyword" | "add_negative" | "set_keyword_bid" | "set_budget";

export interface Proposal {
  kind: ActionKind;
  /** keyword: ad group criterion resource name; budget: campaign budget resource name; negative: campaign resource name */
  target: string;
  value?: number;            // new daily budget or new max CPC, in the account's currency
  text?: string;             // negative keyword text
  match?: "EXACT" | "PHRASE" | "BROAD";
  reason: string;
}

export interface SnapCampaign { resource: string; id: string; name: string; status: string; budget: string; dailyBudget: number; shared: boolean }
export interface SnapKeyword { resource: string; text: string; match: string; status: string; adGroup: string; campaign: string; campaignName: string; adGroupName: string; cpc: number | null; conversions: number; cost: number; clicks: number }
export interface Snapshot {
  campaigns: SnapCampaign[];
  keywords: SnapKeyword[];
  negatives: { campaign: string; text: string; match: string }[];
  monthSpend: number;        // spend so far this calendar month
}
export interface Limits { monthlyCap: number | null; maxChanges: number; mode: "auto" | "suggest" | "off" }

export interface Decided { p: Proposal; label: string; before: Record<string, unknown>; after: Record<string, unknown>; ok: boolean; why?: string }

export const BUDGET_STEP = 0.20, BID_STEP = 0.25, MIN_BID = 0.10, DAYS_PER_MONTH = 30.4;
const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function decide(proposals: Proposal[], snap: Snapshot, lim: Limits): Decided[] {
  const out: Decided[] = [];
  const seen = new Set<string>();
  const camp = new Map(snap.campaigns.map((c) => [c.resource, c]));
  const kw = new Map(snap.keywords.map((k) => [k.resource, k]));
  // daily budgets as they'll stand after each accepted change (shared budgets counted once)
  const budgets = new Map<string, number>();
  for (const c of snap.campaigns) if (c.status === "ENABLED") budgets.set(c.budget, c.dailyBudget);
  const monthlyTotal = () => [...budgets.values()].reduce((a, b) => a + b, 0) * DAYS_PER_MONTH;
  let accepted = 0;

  for (const p of proposals) {
    const block = (label: string, why: string, before: Record<string, unknown> = {}, after: Record<string, unknown> = {}) => out.push({ p, label, before, after, ok: false, why });
    const key = `${p.kind}:${p.target}:${p.text ? norm(p.text) : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (accepted >= lim.maxChanges) { block(p.target, `Over this run's limit of ${lim.maxChanges} changes`); continue; }

    if (p.kind === "set_budget") {
      const c = snap.campaigns.find((x) => x.budget === p.target && x.status === "ENABLED");
      if (!c) { block(p.target, "Not the budget of an enabled campaign"); continue; }
      const names = snap.campaigns.filter((x) => x.budget === p.target).map((x) => x.name).join(", ");
      const label = `Daily budget — ${names}`;
      const cur = budgets.get(p.target) ?? c.dailyBudget;
      const v = round2(Number(p.value));
      if (!(v > 0)) { block(label, "No new amount given"); continue; }
      if (Math.abs(v - cur) > cur * BUDGET_STEP + 0.005) { block(label, `More than ${BUDGET_STEP * 100}% from ${cur.toFixed(2)} in one step`, { daily: cur }, { daily: v }); continue; }
      if (v > cur) {
        if (lim.monthlyCap == null) { block(label, "No monthly cap set for this client, so budgets can't go up", { daily: cur }, { daily: v }); continue; }
        if (snap.monthSpend >= lim.monthlyCap) { block(label, "This month's spend has reached the cap — budgets can only go down", { daily: cur }, { daily: v }); continue; }
        const next = monthlyTotal() - cur * DAYS_PER_MONTH + v * DAYS_PER_MONTH;
        if (next > lim.monthlyCap + 0.01) { block(label, `Daily budgets would come to ${next.toFixed(0)} a month, over the ${lim.monthlyCap.toFixed(0)} cap`, { daily: cur }, { daily: v }); continue; }
      }
      budgets.set(p.target, v);
      out.push({ p: { ...p, value: v }, label, before: { daily: cur }, after: { daily: v }, ok: true });
      accepted++;
      continue;
    }

    if (p.kind === "set_keyword_bid" || p.kind === "pause_keyword") {
      const k = kw.get(p.target);
      if (!k) { block(p.target, "Not a keyword in this account"); continue; }
      const label = `Keyword “${k.text}” (${k.match.toLowerCase()}) — ${k.campaignName} › ${k.adGroupName}`;
      if (k.status !== "ENABLED") { block(label, "Keyword isn't running"); continue; }
      if (p.kind === "pause_keyword") {
        if (k.conversions > 0) { block(label, "It has conversions — converting keywords are never paused", { status: "ENABLED" }, { status: "PAUSED" }); continue; }
        const others = snap.keywords.filter((x) => x.adGroup === k.adGroup && x.status === "ENABLED" && x.resource !== k.resource);
        if (!others.length) { block(label, "It's the last running keyword in its ad group", { status: "ENABLED" }, { status: "PAUSED" }); continue; }
        k.status = "PAUSED"; // later proposals see it paused
        out.push({ p, label, before: { status: "ENABLED" }, after: { status: "PAUSED" }, ok: true });
        accepted++;
        continue;
      }
      const cur = k.cpc;
      if (cur == null || !(cur > 0)) { block(label, "Its bid is set by the campaign's automated bidding, not per keyword"); continue; }
      const v = round2(Number(p.value));
      if (!(v >= MIN_BID)) { block(label, `Bid below ${MIN_BID.toFixed(2)}`, { cpc: cur }, { cpc: v }); continue; }
      if (Math.abs(v - cur) > cur * BID_STEP + 0.005) { block(label, `More than ${BID_STEP * 100}% from ${cur.toFixed(2)} in one step`, { cpc: cur }, { cpc: v }); continue; }
      if (v > cur && lim.monthlyCap != null && snap.monthSpend >= lim.monthlyCap) { block(label, "This month's spend has reached the cap — bids can only go down", { cpc: cur }, { cpc: v }); continue; }
      out.push({ p: { ...p, value: v }, label, before: { cpc: cur }, after: { cpc: v }, ok: true });
      accepted++;
      continue;
    }

    if (p.kind === "add_negative") {
      const c = camp.get(p.target);
      const text = (p.text ?? "").replace(/[^\p{L}\p{N}\s'&.-]/gu, " ").replace(/\s+/g, " ").trim();
      const match = p.match === "PHRASE" ? "PHRASE" : p.match === "BROAD" ? "BROAD" : "EXACT";
      if (!c) { block(p.target, "Not a campaign in this account"); continue; }
      const label = `Negative keyword “${text}” (${match.toLowerCase()}) — ${c.name}`;
      if (!text || text.length > 80 || text.split(" ").length > 10) { block(label, "Negative keyword text is empty or too long"); continue; }
      if (snap.negatives.some((n) => n.campaign === c.resource && norm(n.text) === norm(text) && n.match === match)) { block(label, "Already a negative keyword"); continue; }
      const blocksConverting = snap.keywords.find((k) => k.campaign === c.resource && k.conversions > 0 && (match === "EXACT" ? norm(k.text) === norm(text) : ` ${norm(k.text)} `.includes(` ${norm(text)} `)));
      if (blocksConverting) { block(label, `It would block the converting keyword “${blocksConverting.text}”`); continue; }
      out.push({ p: { ...p, text, match }, label, before: {}, after: { text, match }, ok: true });
      accepted++;
      continue;
    }
    block(String(p.target), `Not a change the optimiser may make (${String(p.kind)})`);
  }
  return out;
}

/** In auto mode with a cap set, allowed changes are applied; otherwise they wait for a person. */
export const applyAutomatically = (lim: Limits) => lim.mode === "auto" && lim.monthlyCap != null;
