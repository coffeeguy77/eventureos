import { NextResponse } from "next/server";
import { recordQuoteLinkView, respondViaQuoteLink } from "@/app/q/actions";

/**
 * The customer's quote link (/q/<token>) records views and accepts/declines through this route rather than a server
 * action: some email security tools and in-app browsers send "Origin: null", which server actions reject, so the
 * customer couldn't accept. A plain route has no such check (the token is the credential).
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const token = String(body.token ?? "");
  if (body.kind === "view") { await recordQuoteLinkView(token).catch(() => undefined); return NextResponse.json({ ok: true }); }
  const form = new FormData();
  for (const k of ["token", "decision", "name", "reason"]) if (body[k] != null) form.set(k, String(body[k]));
  if (body.agree) form.set("agree", "on");
  const r = await respondViaQuoteLink(undefined, form);
  return NextResponse.json(r ?? { error: "Something went wrong — please try again." });
}
