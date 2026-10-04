import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { hashIntakeKey, KEY_PATTERN } from "@/lib/intake/keys";
import { importBookly, type BooklyPayload } from "@/lib/bookings/import";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The EventureOS WordPress plugin talks to this endpoint (server to server, so the key never reaches a browser).
 *   POST /api/public/wordpress
 *   Authorization: Bearer eos_live_…   (a "WordPress" key from Bookings → Website & plugin)
 *   { "action": "ping" }                                   → checks the key, returns the business's booking page
 *   { "action": "bookly_sync", "services": [...], "appointments": [...] } → copies Bookly bookings into EventureOS
 * Sending the same Bookly booking again updates it (matched on its Bookly id), so the plugin can resend safely.
 */

const MAX_BYTES = 4 * 1024 * 1024;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const key = (/^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? req.headers.get("x-eventureos-key") ?? "").trim();
  if (!KEY_PATTERN.test(key)) return json({ ok: false, error: "Missing or malformed key (Authorization: Bearer eos_live_…)" }, 401);
  let db;
  try { db = createServiceClient(); } catch { return json({ ok: false, error: "Not configured on this server" }, 503); }
  const { data: conns, error: connErr } = await db.rpc("intake_connection", { p_key_hash: hashIntakeKey(key) });
  if (connErr) return json({ ok: false, error: "Couldn't check the key" }, 500);
  const conn = (conns as { connection_id: string; organisation_id: string; org_name: string; provider: string }[] | null)?.[0];
  if (!conn || conn.provider !== "wordpress") return json({ ok: false, error: "This key isn't valid for the WordPress plugin, or it has been revoked" }, 401);
  await db.from("inbound_connections").update({ last_used_at: new Date().toISOString() }).eq("id", conn.connection_id);

  const text = await req.text();
  if (text.length > MAX_BYTES) return json({ ok: false, error: "Too much data in one go — send smaller batches" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: "The body isn't valid JSON" }, 400); }

  const { data: org } = await db.from("organisations").select("slug, name").eq("id", conn.organisation_id).single();
  if (body.action === "ping") {
    const base = (process.env.APP_URL?.trim() || "https://www.eventureos.com.au").replace(/\/+$/, "");
    return json({ ok: true, organisation: org?.name, slug: org?.slug, booking_page: `${base}/book/${org?.slug}`, embed_script: `${base}/embed.js` });
  }
  if (body.action === "bookly_sync") {
    try {
      const r = await importBookly(db, conn.organisation_id, body as unknown as BooklyPayload);
      return json({ ok: true, ...r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ ok: false, error: /booking_|does not exist|schema cache/i.test(msg) ? "EventureOS bookings aren't switched on yet (database update 0049)" : msg }, 500);
    }
  }
  return json({ ok: false, error: "Unknown action" }, 400);
}

export function GET() {
  return json({ ok: false, error: "POST with Authorization: Bearer <WordPress key>" }, 405);
}
