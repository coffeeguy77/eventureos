import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { hashIntakeKey, KEY_PATTERN } from "@/lib/intake/keys";
import { normaliseIntake } from "@/lib/intake/normalise";

export const dynamic = "force-dynamic";

/**
 * Quote intake — another system (e.g. a LeadPages quote form) sends a finished online quote.
 *   POST /api/public/quote-intake
 *   Authorization: Bearer eos_live_…   (the connection key from Settings → Integrations → Quote intake)
 *   Content-Type: application/json     (payload contract v1 — see lib/intake/normalise.ts)
 * Server-to-server only: no CORS, so the key is never put in a web page.
 * Creates or matches the customer and makes an enquiry, event and DRAFT quote with the same lines.
 * Sending the same external_id again is safe: an unchanged version is ignored, a newer version
 * refreshes the draft (or flags it for review if the quote has already been sent).
 */

const MAX_BYTES = 256 * 1024;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const key = (/^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? req.headers.get("x-eventureos-key") ?? "").trim();
  if (!KEY_PATTERN.test(key)) return json({ ok: false, error: "Missing or malformed connection key (Authorization: Bearer eos_live_…)" }, 401);

  let db;
  try { db = createServiceClient(); } catch { return json({ ok: false, error: "Quote intake isn't configured on this server" }, 503); }

  const { data: conns, error: connErr } = await db.rpc("intake_connection", { p_key_hash: hashIntakeKey(key) });
  if (connErr) { console.error("intake_connection failed", connErr.message); return json({ ok: false, error: "Couldn't check the connection key" }, 500); }
  const conn = (conns as { connection_id: string; organisation_id: string; org_name: string }[] | null)?.[0];
  if (!conn || (conn as { provider?: string }).provider === "wordpress") return json({ ok: false, error: "This connection key isn't valid or has been revoked" }, 401);

  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json({ ok: false, error: "Send the quote as application/json" }, 415);
  const rawText = await req.text();
  if (rawText.length > MAX_BYTES) return json({ ok: false, error: "The quote is too large" }, 413);
  let raw: unknown;
  try { raw = JSON.parse(rawText); } catch { return json({ ok: false, error: "The body isn't valid JSON" }, 400); }

  const record = async (externalId: string | null, message: string) => {
    const { error } = await db.rpc("intake_record_error", {
      p_connection_id: conn.connection_id, p_external_id: externalId ?? "", p_message: message,
      p_payload: raw && typeof raw === "object" ? raw : {},
    });
    if (error) console.error("intake_record_error failed", error.message);
  };

  const n = normaliseIntake(raw);
  if (!n.ok) { await record(n.external_id, n.error); return json({ ok: false, error: n.error }, 422); }

  const { data, error } = await db.rpc("intake_external_quote", { p_connection_id: conn.connection_id, p_payload: n.payload });
  if (error) {
    console.error("intake_external_quote failed", error.message);
    await record(n.payload.external_id, error.message);
    return json({ ok: false, error: "EventureOS couldn't save the quote — it's been logged for the team" }, 500);
  }
  return json(data as Record<string, unknown>);
}

export function GET() {
  return json({ ok: false, error: "POST a quote here as JSON with Authorization: Bearer <connection key>" }, 405);
}
