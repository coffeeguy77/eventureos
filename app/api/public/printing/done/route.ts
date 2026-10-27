import { NextResponse } from "next/server";
import { finishPrintJob } from "@/lib/printing/server";

/** Public: the artwork has been uploaded — record it on the job and tell the business. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  try {
    return NextResponse.json(await finishPrintJob(String(body.jobId ?? ""), String(body.token ?? ""), (body.files ?? []) as never));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't finish — please contact us." });
  }
}
