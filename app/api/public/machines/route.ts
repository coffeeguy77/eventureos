import { NextResponse } from "next/server";
import { sendMachineEnquiry } from "@/lib/machines/server";

/** Public: a repair / service / machine enquiry from the website. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  try {
    return NextResponse.json(await sendMachineEnquiry(body as never));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't send — please try again." });
  }
}
