import { NextResponse } from "next/server";
import { startPrintJob } from "@/lib/printing/server";

/** Public: start an online print job and get one-time upload links for the artwork. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  try {
    return NextResponse.json(await startPrintJob(body as never));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't send your job — please try again." });
  }
}
