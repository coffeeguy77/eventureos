import { requireOrg } from "@/lib/context";
import { readApptSettings, type ApptKind } from "@/lib/appointments/core";
import { appBaseUrl } from "@/lib/integrations/registry";
import { AppointmentsBoard, type ApptRow } from "@/components/appointments/board";
import type { Prefill } from "@/components/appointments/book-meeting";

export const metadata = { title: "Appointments" };
export const dynamic = "force-dynamic";

/** Client meetings: what needs a decision, what's coming up, and booking a new one. */
export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ open?: string; book?: string; enquiry?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, user } = await requireOrg();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data, error }, { data: staff }] = await Promise.all([
    supabase.from("appointments").select("id, title, kind, starts_at, ends_at, status, location, meeting_url, client_name, client_email, client_phone, client_company, client_note, notes, proposed_starts_at, proposed_ends_at, source, assigned_to, customer_id, created_at")
      .eq("organisation_id", org.id).gte("ends_at", since).order("starts_at").limit(400),
    supabase.from("organisation_users").select("user_id, role, user:users!organisation_users_user_id_fkey(full_name, email)").eq("organisation_id", org.id).eq("status", "active").neq("role", "customer"),
  ]);
  const s = readApptSettings(org.settings);
  // "Book a meeting" from an enquiry: start with who sent it
  let prefill: Prefill | null = null;
  if (sp.enquiry && /^[0-9a-f-]{36}$/i.test(sp.enquiry)) {
    const { data: e } = await supabase.from("enquiries").select("id, title, message, customer_id, contact_id, contact_name, contact_email, contact_phone, company, customer:customers(name), contact:contacts(first_name, last_name, email, phone)").eq("id", sp.enquiry).eq("organisation_id", org.id).maybeSingle();
    if (e) {
      const ct = e.contact as unknown as { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
      const [f, ...l] = String(e.contact_name ?? "").trim().split(/\s+/);
      prefill = {
        enquiryId: e.id as string, customerId: (e.customer_id as string | null) ?? null, customerName: (e.customer as unknown as { name: string } | null)?.name ?? null, contactId: (e.contact_id as string | null) ?? null,
        person: { firstName: ct?.first_name ?? f ?? "", lastName: ct?.last_name ?? l.join(" "), email: ct?.email ?? (e.contact_email as string | null) ?? "", phone: ct?.phone ?? (e.contact_phone as string | null) ?? "", company: (e.company as string | null) ?? "" },
        topic: String(e.title ?? "").slice(0, 200),
      };
    }
  }
  const people = ((staff ?? []) as unknown as { user_id: string; user: { full_name: string | null; email: string } | null }[]).map((m) => ({ id: m.user_id, name: m.user?.full_name || m.user?.email || "Staff" }));
  const rows: ApptRow[] = ((data ?? []) as Record<string, unknown>[]).map((a) => ({
    id: a.id as string, title: a.title as string, kind: a.kind as ApptKind, startsAt: a.starts_at as string, endsAt: a.ends_at as string, status: a.status as string,
    location: (a.location as string | null) ?? null, meetingUrl: (a.meeting_url as string | null) ?? null, clientName: (a.client_name as string | null) ?? null, clientEmail: (a.client_email as string | null) ?? null,
    clientPhone: (a.client_phone as string | null) ?? null, clientCompany: (a.client_company as string | null) ?? null, clientNote: (a.client_note as string | null) ?? null, notes: (a.notes as string | null) ?? null,
    proposedStart: (a.proposed_starts_at as string | null) ?? null, proposedEnd: (a.proposed_ends_at as string | null) ?? null, source: a.source as string, assignedTo: (a.assigned_to as string | null) ?? null, customerId: (a.customer_id as string | null) ?? null,
  }));
  return (
    <AppointmentsBoard accent={/^#[0-9a-f]{6}$/i.test(org.brand_colour ?? "") ? org.brand_colour! : "#6028EC"} rows={rows} tz={org.timezone} me={user.id} people={people} needsMigration={!!error} enabled={s.enabled}
      bookingUrl={`${appBaseUrl()}/meet/${org.slug}`} durations={s.durations} kinds={s.kinds} defaults={{ location: s.location, meetingUrl: s.meeting_url }}
      openId={sp.open && /^[0-9a-f-]{36}$/i.test(sp.open) ? sp.open : null} startBooking={sp.book === "1"} prefill={prefill} />
  );
}
