import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";

/** The "stop these reminders" link in a come-back-and-finish email. */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  let ok = false;
  if (/^[0-9a-f]{32}$/.test(t)) {
    const db = createServiceClient();
    const { data } = await db.from("site_carts").select("email, organisation_id").eq("stop_token", t).maybeSingle();
    if (data) {
      // Stop every reminder for this email with this business
      await db.from("site_carts").update({ status: "stopped" }).eq("organisation_id", data.organisation_id).eq("email", data.email);
      ok = true;
    }
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reminders stopped</title>
<style>body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#FCFAF7;color:#151312;display:grid;place-items:center;min-height:100vh}main{max-width:440px;padding:32px;text-align:center}h1{font-size:1.5rem}p{color:#5E5853;line-height:1.6}</style></head>
<body><main><h1>${ok ? "Done — no more reminders" : "That link has expired"}</h1><p>${ok ? "We won't send you any more reminders about unfinished orders or quotes." : "If you're still getting reminders, just reply to one and we'll stop them."}</p></main></body></html>`;
  return new NextResponse(html, { status: ok ? 200 : 404, headers: { "content-type": "text/html; charset=utf-8" } });
}
