import { NextResponse } from "next/server";
import { approvePrintQuote } from "@/lib/printing/server";

/** Public: the customer approves their print quote. */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  try { return NextResponse.json(await approvePrintQuote(String(b.jobId ?? ""), String(b.token ?? ""))); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't approve — please contact us." }); }
}
