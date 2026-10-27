import { NextResponse } from "next/server";
import { moreArtwork } from "@/lib/printing/server";

/** Public: upload links for more artwork on an existing print job. */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  try { return NextResponse.json(await moreArtwork(String(b.jobId ?? ""), String(b.token ?? ""), (b.files ?? []) as never)); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't upload — please try again." }); }
}
