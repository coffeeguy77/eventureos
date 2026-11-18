import "server-only";
import { apiJSON, saveIntegrationSettings, type SyncContext } from "@/lib/integrations/runtime";
import { aggregateOrders, SQUARE_API, squareHeaders, type SquareLocation, type SquareOrder } from "./square";

/**
 * Square → sale_square_* tables, one location-month at a time so a year of a busy café never times out:
 * the plan (which location-months are left) lives in the integration's settings and each run carries on
 * where the last one stopped. The first run fills the last 13 months; after that each run redoes the
 * current and previous month (late refunds and edits).
 */
interface Chunk { loc: string; month: string }   // month = YYYY-MM-01
interface Plan { queue: Chunk[]; total: number; started_at: string }

const BUDGET_MS = 45_000;

function monthsBack(n: number, tz: string): string[] {
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(new Date());
  let [y, m] = now.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

/** UTC bounds of a local calendar month (padded a day each side; orders are bucketed by local day anyway). */
function monthBounds(month: string): { start: string; end: string } {
  const d = new Date(`${month}T00:00:00Z`);
  const start = new Date(d.getTime() - 86_400_000).toISOString();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) + 86_400_000);
  return { start, end: (next.getTime() > Date.now() ? new Date() : next).toISOString() };
}

async function listLocations(ctx: SyncContext): Promise<SquareLocation[]> {
  const d = await apiJSON<{ locations?: { id: string; name?: string; timezone?: string; status?: string }[] }>(ctx, `${SQUARE_API}/locations`, { headers: squareHeaders }, "Square locations");
  return (d.locations ?? []).map((l) => ({ id: l.id, name: l.name ?? "Location", timezone: l.timezone ?? ctx.org.timezone ?? "Australia/Sydney", status: l.status ?? "ACTIVE" }));
}

/** catalog variation/item id → category name */
async function categoryMap(ctx: SyncContext): Promise<Map<string, string>> {
  const cats = new Map<string, string>(), itemCat = new Map<string, string>(), varItem = new Map<string, string>();
  let cursor: string | undefined;
  for (let page = 0; page < 60; page++) {
    const d = await apiJSON<{ cursor?: string; objects?: { id: string; type: string; category_data?: { name?: string }; item_data?: { category_id?: string; categories?: { id: string }[]; reporting_category?: { id: string } }; item_variation_data?: { item_id?: string } }[] }>(
      ctx, `${SQUARE_API}/catalog/list?types=ITEM,ITEM_VARIATION,CATEGORY${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: squareHeaders }, "Square catalog");
    for (const o of d.objects ?? []) {
      if (o.type === "CATEGORY") cats.set(o.id, o.category_data?.name || "Uncategorised");
      else if (o.type === "ITEM") { const c = o.item_data?.reporting_category?.id ?? o.item_data?.categories?.[0]?.id ?? o.item_data?.category_id; if (c) itemCat.set(o.id, c); }
      else if (o.type === "ITEM_VARIATION" && o.item_variation_data?.item_id) varItem.set(o.id, o.item_variation_data.item_id);
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  const out = new Map<string, string>();
  for (const [itemId, catId] of itemCat) if (cats.has(catId)) out.set(itemId, cats.get(catId)!);
  for (const [varId, itemId] of varItem) { const c = itemCat.get(itemId); if (c && cats.has(c)) out.set(varId, cats.get(c)!); }
  return out;
}

async function ordersFor(ctx: SyncContext, loc: string, month: string, deadline: number): Promise<SquareOrder[] | null> {
  const { start, end } = monthBounds(month);
  const out: SquareOrder[] = [];
  let cursor: string | undefined;
  for (;;) {
    if (Date.now() > deadline) return null; // out of time: redo this month next run
    const body: Record<string, unknown> = {
      location_ids: [loc], limit: 500,
      query: { filter: { date_time_filter: { created_at: { start_at: start, end_at: end } }, state_filter: { states: ["COMPLETED"] } }, sort: { sort_field: "CREATED_AT", sort_order: "ASC" } },
    };
    if (cursor) body.cursor = cursor;
    const d = await apiJSON<{ orders?: SquareOrder[]; cursor?: string }>(ctx, `${SQUARE_API}/orders/search`, { method: "POST", headers: squareHeaders, body: JSON.stringify(body) }, "Square orders");
    out.push(...(d.orders ?? []));
    cursor = d.cursor;
    if (!cursor) return out;
  }
}

export async function syncSquareSales(ctx: SyncContext, opts: { full?: boolean } = {}): Promise<{ message: string; partial?: boolean; done?: number; total?: number }> {
  const deadline = Date.now() + BUDGET_MS;
  const locs = await listLocations(ctx);
  const now = new Date().toISOString();
  await ctx.db.from("sale_square_locations").upsert(locs.map((l) => ({ organisation_id: ctx.org.id, location_id: l.id, name: l.name, timezone: l.timezone, status: l.status })), { onConflict: "organisation_id,location_id" });
  const tzOf = new Map(locs.map((l) => [l.id, l.timezone]));
  const active = locs; // closed locations still have history worth selling on

  const st = ctx.integration.settings as { sales_plan?: Plan | null; sales_first_done?: boolean };
  let plan = st.sales_plan && st.sales_plan.queue?.length && !opts.full ? st.sales_plan : null;
  if (!plan) {
    const months = monthsBack(st.sales_first_done && !opts.full ? 2 : 13, ctx.org.timezone || "Australia/Sydney");
    const queue = months.flatMap((m) => active.map((l) => ({ loc: l.id, month: m })));
    plan = { queue, total: queue.length, started_at: now };
  }

  const cats = await categoryMap(ctx);
  const categoryOf = (id: string | undefined) => (id && cats.get(id)) || "Uncategorised";
  let done = 0;
  while (plan.queue.length && Date.now() < deadline) {
    const c = plan.queue[0];
    const orders = await ordersFor(ctx, c.loc, c.month, deadline);
    if (!orders) break;
    const tz = tzOf.get(c.loc) ?? ctx.org.timezone ?? "Australia/Sydney";
    const agg = aggregateOrders(orders, tz, categoryOf);
    const next = new Date(`${c.month}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
    const to = next.toISOString().slice(0, 10);
    // replace the location-month (refunds and edits change old days)
    await ctx.db.from("sale_square_daily").delete().eq("organisation_id", ctx.org.id).eq("location_id", c.loc).gte("day", c.month).lt("day", to);
    await ctx.db.from("sale_square_items").delete().eq("organisation_id", ctx.org.id).eq("location_id", c.loc).eq("month", c.month);
    const days = agg.days.filter((r) => r.day >= c.month && r.day < to).map((r) => ({ organisation_id: ctx.org.id, location_id: c.loc, ...r }));
    for (let i = 0; i < days.length; i += 1000) {
      const { error } = await ctx.db.from("sale_square_daily").insert(days.slice(i, i + 1000));
      if (error) throw new Error(`Couldn't save Square sales: ${error.message}`);
    }
    const items = agg.items.filter((r) => r.month === c.month).map((r) => ({ organisation_id: ctx.org.id, location_id: c.loc, ...r }));
    for (let i = 0; i < items.length; i += 1000) {
      const { error } = await ctx.db.from("sale_square_items").insert(items.slice(i, i + 1000));
      if (error) throw new Error(`Couldn't save Square items: ${error.message}`);
    }
    plan.queue.shift();
    done++;
  }
  const finished = plan.queue.length === 0;
  await saveIntegrationSettings(ctx, { sales_plan: finished ? null : plan, sales_first_done: st.sales_first_done || finished, sales_synced_at: finished ? now : (ctx.integration.settings as { sales_synced_at?: string }).sales_synced_at ?? null });
  if (finished) await ctx.db.from("sale_square_locations").update({ synced_at: now }).eq("organisation_id", ctx.org.id);
  const doneTotal = plan.total - plan.queue.length;
  return finished
    ? { message: `Square sales are up to date (${locs.length} location${locs.length === 1 ? "" : "s"}).`, done: doneTotal, total: plan.total }
    : { message: `Bringing in Square sales — ${doneTotal} of ${plan.total} location-months done. It carries on automatically.`, partial: true, done: doneTotal, total: plan.total };
}
