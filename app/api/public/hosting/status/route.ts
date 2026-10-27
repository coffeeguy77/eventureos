import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { siteStatus } from "@/lib/hosting/server";

export const dynamic = "force-dynamic";

/** For the Web Culture status WordPress plugin: GET ?key=<site key> → is this site switched off, and what to show. */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const s = await siteStatus(createServiceClient(), key).catch(() => null);
  if (!s) return NextResponse.json({ ok: false, error: "Unknown site key" }, { status: 404, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ ok: true, ...s }, { headers: { "cache-control": "no-store" } });
}
