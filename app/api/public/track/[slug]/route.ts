import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";

/**
 * Website analytics beacon: page views, sections scrolled into view, clicks, form starts/submits, cart adds.
 *   POST /api/public/track/<org-slug>  { v: visitorId, s: sessionId, e: [{ k, sec, p, l, r, d }] }
 * Anonymous random ids only — no names, emails or IP addresses are stored.
 */
const KINDS = new Set(["view", "click", "form_start", "form_submit", "cart_add", "checkout_start", "purchase", "quote_start", "quote_submit"]);
const ID = /^[A-Za-z0-9_-]{6,40}$/;
const BOT = /bot|crawl|spider|slurp|preview|lighthouse|headless|facebookexternalhit|embedly/i;
const cut = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const orgIds = new Map<string, { id: string | null; at: number }>();

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || BOT.test(req.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  let body: { v?: unknown; s?: unknown; e?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return new NextResponse(null, { status: 204 }); }
  const v = typeof body.v === "string" && ID.test(body.v) ? body.v : null;
  const s = typeof body.s === "string" && ID.test(body.s) ? body.s : null;
  if (!v || !s || !Array.isArray(body.e)) return new NextResponse(null, { status: 204 });

  const db = createServiceClient();
  let hit = orgIds.get(slug);
  if (!hit || Date.now() - hit.at > 10 * 60e3) {
    const { data } = await db.from("organisations").select("id").eq("slug", slug).eq("status", "active").maybeSingle();
    hit = { id: data?.id ?? null, at: Date.now() };
    orgIds.set(slug, hit);
  }
  if (!hit.id) return new NextResponse(null, { status: 204 });

  const rows = body.e.slice(0, 25).map((x) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const k = typeof o.k === "string" && KINDS.has(o.k) ? o.k : null;
    const d = o.d === "mobile" || o.d === "tablet" || o.d === "desktop" ? o.d : null;
    return k ? { organisation_id: hit!.id, visitor: v, session: s, kind: k, section: cut(o.sec, 30), path: cut(o.p, 300), label: cut(o.l, 160), referrer: cut(o.r, 300), device: d } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length) {
    const { error } = await db.from("site_events").insert(rows);
    if (error) console.error("[track]", error.message);
  }
  return new NextResponse(null, { status: 204 });
}
