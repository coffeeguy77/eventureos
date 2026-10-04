import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { CourseEditor, SessionGenerator } from "@/components/bookings/course-tools";
import type { CourseRow } from "@/lib/bookings/core";

export const dynamic = "force-dynamic";

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const [{ data, error }, { data: cals }, { data: upcoming }] = await Promise.all([
    supabase.from("booking_courses").select("id, slug, name, summary, description, duration_minutes, price, capacity, location, what_to_bring, image_url, colour, calendar_connection_id, active, public, position, max_seats_per_booking, waitlist, gift_enabled, agency_price, xero_item_code, xero_account_code, invoice_title, questions, external_names").eq("organisation_id", org.id).order("position").order("name"),
    supabase.from("calendar_connections").select("id, name").eq("organisation_id", org.id).order("name"),
    supabase.from("booking_sessions").select("course_id").eq("organisation_id", org.id).gt("starts_at", new Date().toISOString()).neq("status", "cancelled"),
  ]);
  if (error) return <Card className="p-6 text-[0.875rem] text-ink-muted">Run the 0049 database update (bookings) in Supabase first.</Card>;
  const courses = (data ?? []) as unknown as CourseRow[];
  const count = new Map<string, number>();
  for (const s of (upcoming ?? []) as { course_id: string }[]) count.set(s.course_id, (count.get(s.course_id) ?? 0) + 1);
  const calendars = (cals ?? []) as { id: string; name: string }[];

  return (
    <>
      <PageHeader title="Courses" subtitle="What people can book: price, seats, calendar and invoice details. Then add the dates." />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {courses.map((c) => <CourseEditor key={c.id} course={c} calendars={calendars} upcoming={count.get(c.id) ?? 0} startOpen={sp.edit === c.id} orgSlug={org.slug} />)}
          <CourseEditor course={null} calendars={calendars} upcoming={0} startOpen={courses.length === 0} orgSlug={org.slug} />
        </div>
        <div>{courses.length > 0 && <SessionGenerator courses={courses.map((c) => ({ id: c.id, name: c.name, duration: c.duration_minutes }))} />}</div>
      </div>
    </>
  );
}
