import { canManage, requireOrg } from "@/lib/context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { todayISO } from "@/lib/format";
import { QuickInvoice, type Invitee } from "@/components/invoices/quick-invoice";
import { nameFromEmail, plainText, readNotes } from "@/lib/invoices/from-calendar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice a job" };

/** Invoice a job from the calendar (booked over the phone, no quote): choose the customer, build the lines, send. */
export default async function QuickInvoicePage({ searchParams }: { searchParams: Promise<{ entry?: string; event?: string; customer?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return <Card className="mx-auto max-w-3xl p-6 text-[0.8125rem] text-ink-muted">Only owners, admins and managers can raise invoices.</Card>;
  const tz = org.timezone;
  const UUID = /^[0-9a-f-]{36}$/i;

  type EntryRow = { id: string; title: string; starts_at: string; ends_at: string; all_day: boolean; location: string | null; event_id: string | null; customer_id: string | null; description: string | null; attendees: string[] | null; html_link: string | null };
  type EvRow = { id: string; name: string; event_date: string | null; venue: string | null; customer_id: string };
  let entry: EntryRow | null = null;
  if (sp.entry && UUID.test(sp.entry)) {
    const { data } = await supabase.from("calendar_events").select("id, title, starts_at, ends_at, all_day, location, event_id, customer_id, description, attendees, html_link").eq("id", sp.entry).eq("organisation_id", org.id).maybeSingle();
    entry = data as EntryRow | null;
  }
  const eventId = (sp.event && UUID.test(sp.event) ? sp.event : null) ?? entry?.event_id ?? null;
  let ev: EvRow | null = null;
  if (eventId) {
    const { data } = await supabase.from("events").select("id, name, event_date, venue, customer_id").eq("id", eventId).eq("organisation_id", org.id).maybeSingle();
    ev = data as EvRow | null;
  }
  const entryDate = entry ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(entry.starts_at)) : null;

  // The calendar entry's details: notes, times, and who was invited (not our own people)
  const hm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const notes = plainText(entry?.description);
  const read = readNotes(`${entry?.title ?? ""}\n${notes}`);
  let invitees: Invitee[] = [];
  if (entry?.attendees?.length) {
    const { data: staff } = await supabase.from("organisation_users").select("user:users(email)").eq("organisation_id", org.id);
    const ours = new Set([org.contact_email, ...((staff ?? []) as unknown as { user: { email: string | null } | null }[]).map((x) => x.user?.email)].filter((e): e is string => !!e).map((e) => e.toLowerCase()));
    const ourDomains = new Set([...ours].map((e) => e.split("@")[1]).filter((d) => d && !/^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|bigpond)\./.test(d)));
    const emails = [...new Set(entry.attendees.map((e) => e.trim().toLowerCase()))].filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !ours.has(e) && !ourDomains.has(e.split("@")[1]) && !/calendar\.google\.com$|resource\./.test(e)).slice(0, 12);
    if (emails.length) {
      const or = emails.map((e) => `email.ilike.${e.replace(/[,()]/g, "")}`).join(",");
      const [{ data: custs }, { data: conts }, { data: msgs }] = await Promise.all([
        supabase.from("customers").select("id, name, email").eq("organisation_id", org.id).or(or).limit(50),
        supabase.from("contacts").select("first_name, last_name, email, customer:customers(id, name)").eq("organisation_id", org.id).or(or).limit(50),
        supabase.from("email_messages").select("from_email, from_name").eq("organisation_id", org.id).in("from_email", emails).not("from_name", "is", null).limit(100),
      ]);
      invitees = emails.map((e) => {
        const c = ((custs ?? []) as { id: string; name: string; email: string | null }[]).find((x) => x.email?.toLowerCase() === e);
        const k = ((conts ?? []) as unknown as { first_name: string; last_name: string | null; email: string | null; customer: { id: string; name: string } | null }[]).find((x) => x.email?.toLowerCase() === e);
        const m = ((msgs ?? []) as { from_email: string; from_name: string | null }[]).find((x) => x.from_email.toLowerCase() === e && x.from_name && !x.from_name.includes("@"));
        const person = k ? [k.first_name, k.last_name].filter(Boolean).join(" ") : (m?.from_name?.replace(/^"|"$/g, "") ?? nameFromEmail(e));
        const match = c ? { id: c.id, name: c.name } : k?.customer ? { id: k.customer.id, name: k.customer.name } : null;
        return { email: e, name: person, match };
      });
    }
  }
  const cal = entry ? {
    title: entry.title, when: entry.all_day ? "All day" : `${hm(entry.starts_at)}–${hm(entry.ends_at)}`, start: entry.all_day ? null : hm(entry.starts_at), finish: entry.all_day ? null : hm(entry.ends_at),
    location: entry.location, notes, link: entry.html_link, phones: read.phones, coffees: read.coffees, setup: read.setup, serviceStart: read.serviceStart, serviceFinish: read.serviceFinish,
  } : null;

  const [custRes, svcRes, invRes] = await Promise.all([
    supabase.from("customers").select("id, name, payment_terms_days").eq("organisation_id", org.id).order("name").limit(5000),
    supabase.from("services").select("id, name, description, unit_price, tax_rate, unit, code, xero_account_code, category").eq("organisation_id", org.id).eq("active", true).order("category").order("position"),
    ev ? supabase.from("invoices").select("id, number, total").eq("organisation_id", org.id).eq("event_id", ev.id).neq("status", "void") : Promise.resolve({ data: [] }),
  ]);
  const settings = org.settings as { default_payment_terms_days?: number };
  const terms = Number.isFinite(Number(settings.default_payment_terms_days)) ? Number(settings.default_payment_terms_days) : 14;

  const startCustomer = ev?.customer_id ?? entry?.customer_id ?? (sp.customer && UUID.test(sp.customer) ? sp.customer : null) ?? invitees.find((x) => x.match)?.match?.id ?? "";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Invoices" title="Invoice a job" subtitle="For a job booked over the phone — no quote needed. Copy a past invoice, use their rates or your price list, then send." />
      <QuickInvoice
        entryId={entry?.id ?? null} eventId={ev?.id ?? null}
        customers={((custRes.data ?? []) as { id: string; name: string; payment_terms_days: number | null }[]).map((c) => ({ id: c.id, name: c.name, terms: c.payment_terms_days }))}
        priceList={((svcRes.data ?? []) as { id: string; name: string; description: string | null; unit_price: number; tax_rate: number; unit: string | null; code: string | null; xero_account_code: string | null; category: string | null }[])}
        initial={{ customer: startCustomer, name: ev?.name ?? entry?.title ?? "", date: ev?.event_date ?? entryDate ?? todayISO(tz), venue: ev?.venue ?? entry?.location ?? "" }}
        existing={((invRes.data ?? []) as { id: string; number: string; total: number }[]).map((x) => ({ ...x, total: Number(x.total) }))}
        today={todayISO(tz)} terms={terms} currency={org.currency} cal={cal} invitees={invitees}
      />
    </div>
  );
}
