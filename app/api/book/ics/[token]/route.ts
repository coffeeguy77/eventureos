import { NextResponse } from "next/server";
import { bookingByToken, bookUrl, orgById } from "@/lib/bookings/server";
import { icsEvent } from "@/lib/bookings/core";
import { createServiceClient } from "@/lib/integrations/runtime";

export const dynamic = "force-dynamic";

/** "Add to calendar" file for a booking (Apple Calendar, Outlook…). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createServiceClient();
  const b = await bookingByToken(token, db).catch(() => null);
  if (!b || !["confirmed", "attended"].includes(b.status)) return new NextResponse("Booking not found", { status: 404 });
  const org = await orgById(db, b.organisation_id);
  const manage = bookUrl(org, `/manage/${b.manage_token}`);
  const body = icsEvent({ uid: `${b.id}@eventureos.com.au`, start: b.session.starts_at, end: b.session.ends_at, title: `${b.course.name} — ${org.name}`,
    description: `Booking ${b.reference} · ${b.seats} seat${b.seats === 1 ? "" : "s"}${b.course.what_to_bring ? `\nWhat to bring: ${b.course.what_to_bring}` : ""}\nChange or cancel: ${manage}`,
    location: b.course.location, url: manage, organiser: org.name });
  return new NextResponse(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${b.reference}.ics"`, "cache-control": "no-store" } });
}
