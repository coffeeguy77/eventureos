import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Public website enquiry endpoint.
 *   POST /api/public/enquiry/<org-slug>?key=<public_form_key>
 * Accepts JSON, application/x-www-form-urlencoded or multipart/form-data.
 * Fields: name, email, phone, company, event_type, event_date (YYYY-MM-DD), guests, budget, venue, message, title,
 *         key (if not in the query string), redirect (optional thank-you URL for plain HTML forms),
 *         website (honeypot — leave empty; bots that fill it get a fake success).
 * Calls rpc capture_website_enquiry as the anonymous role (no session); the RPC validates the key,
 * rate-limits, matches existing customers and notifies the team.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

const FIELDS = ["name", "email", "phone", "company", "event_type", "event_date", "guests", "budget", "venue", "message", "title"] as const;
const ALIASES: Record<string, (typeof FIELDS)[number]> = {
  full_name: "name", your_name: "name", mobile: "phone", tel: "phone", organisation: "company", organization: "company",
  date: "event_date", guest_count: "guests", number_of_guests: "guests", location: "venue", type: "event_type", event: "event_type",
  comments: "message", details: "message", subject: "title",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function readBody(req: NextRequest): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  if (type.includes("application/json")) {
    const j = (await req.json()) as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("Expected a JSON object");
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) if (v != null && typeof v !== "object") out[k] = String(v);
    return out;
  }
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) if (typeof v === "string" && !(k in out)) out[k] = v;
    return out;
  }
  throw new Error("Send the form as JSON, application/x-www-form-urlencoded or multipart/form-data");
}

function wantsHTML(req: NextRequest, body: Record<string, string>) {
  return !!body.redirect || (req.headers.get("accept") ?? "").includes("text/html");
}

function safeRedirect(target: string | undefined) {
  if (!target) return null;
  try {
    const u = new URL(target);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch { return null; }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function thankYou(reference: string | null, error?: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${error ? "Something went wrong" : "Thanks — we've got your enquiry"}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;color:#18181b;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{max-width:420px;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#52525b;line-height:1.5;margin:0 0 12px}a{color:#6028ec}</style></head>
<body><main>${error
    ? `<h1>We couldn't send your enquiry</h1><p>${esc(error)}</p><p><a href="javascript:history.back()">Go back and try again</a></p>`
    : `<h1>Thanks — we've got your enquiry</h1><p>We'll be in touch shortly.${reference ? ` Your reference is <strong>${esc(reference)}</strong>.` : ""}</p><p><a href="javascript:history.back()">Back to the website</a></p>`}
</main></body></html>`;
  return new NextResponse(html, { status: error ? 400 : 200, headers: { ...CORS, "content-type": "text/html; charset=utf-8" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: Record<string, string> = {};
  const error = (msg: string) =>
    wantsHTML(req, body) ? thankYou(null, msg) : new NextResponse(msg, { status: 400, headers: { ...CORS, "content-type": "text/plain; charset=utf-8" } });

  try {
    body = await readBody(req);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't read the form");
  }
  const html = wantsHTML(req, body);
  const redirectTo = safeRedirect(body.redirect);

  // Honeypot: real people never see or fill the `website` field. Pretend it worked.
  if ((body.website ?? "").trim()) {
    if (redirectTo) return NextResponse.redirect(redirectTo, 303);
    return html ? thankYou(null) : NextResponse.json({ ok: true, reference: null }, { headers: CORS });
  }

  const key = req.nextUrl.searchParams.get("key") ?? body.key ?? "";
  if (!key) return error("Missing form key");

  const payload: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    const field = (FIELDS as readonly string[]).includes(k) ? k : ALIASES[k];
    if (field && v.trim() && !payload[field]) payload[field] = v.trim().slice(0, 5000);
  }
  if (!payload.name && (body.first_name || body.last_name)) payload.name = [body.first_name, body.last_name].filter(Boolean).join(" ").trim();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) return new NextResponse("Enquiry capture isn't configured", { status: 503, headers: CORS });
  const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: rpcError } = await supabase.rpc("capture_website_enquiry", { p_slug: slug, p_key: key, p_payload: payload, p_ip: clientIp(req) });
  if (rpcError) {
    const known = /Invalid form key|Name or email is required|Invalid email|Too many enquiries/.exec(rpcError.message);
    return error(known ? known[0] + (known[0] === "Too many enquiries" ? " — please try again shortly" : "") : "Couldn't save the enquiry");
  }
  const reference = (data as { reference?: string } | null)?.reference ?? null;
  if (redirectTo) {
    const u = new URL(redirectTo);
    if (reference) u.searchParams.set("reference", reference);
    return NextResponse.redirect(u.toString(), 303);
  }
  if (html) return thankYou(reference);
  return NextResponse.json({ ok: true, reference }, { headers: CORS });
}

/** The sender's IP for rate limiting. On Vercel, x-real-ip is set by the platform and can't be spoofed by the sender. */
function clientIp(req: NextRequest | Request): string | null {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || null;
}
