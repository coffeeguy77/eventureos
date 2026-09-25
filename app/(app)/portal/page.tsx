import Link from "next/link";
import { headers } from "next/headers";
import { ExternalLink, Globe, Mail, Phone } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { fmtDate, initials, relative } from "@/lib/format";
import { cancelDocumentRequest } from "./actions";
import { CopyLink, RequestDocumentForm } from "./controls";

export const metadata = { title: "Customer Portal" };

export default async function PortalAdminPage() {
  const { supabase, org, role } = await requireOrg();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const portalUrl = `${proto}://${host}/p/${org.slug}`;

  const [brandRes, contactsRes, actRes, msgRes, evRes, reqRes] = await Promise.all([
    supabase.from("organisations").select("name, logo_url, brand_colour, contact_email, contact_phone, website").eq("id", org.id).single(),
    supabase.from("contacts").select("id, first_name, last_name, email, customer_id, customer:customers(id, name)")
      .eq("organisation_id", org.id).not("portal_user_id", "is", null).order("first_name"),
    supabase.from("activity_logs").select("customer_id, created_at, summary")
      .eq("organisation_id", org.id).eq("actor_type", "customer").order("created_at", { ascending: false }).limit(500),
    supabase.from("portal_messages").select("id, customer_id, event_id, body, created_at, read_at, customer:customers(name)")
      .eq("organisation_id", org.id).eq("author_type", "customer").order("created_at", { ascending: false }).limit(10),
    supabase.from("events").select("id, name, event_date, customer:customers(name)")
      .eq("organisation_id", org.id).not("status", "in", "(cancelled,completed)").order("event_date", { ascending: true, nullsFirst: false }).limit(300),
    supabase.from("documents").select("id, name, created_at, event_id, event:events(name), customer:customers(name)")
      .eq("organisation_id", org.id).eq("requested_from_customer", true).order("created_at", { ascending: false }),
  ]);
  for (const r of [brandRes, contactsRes, actRes, msgRes, evRes, reqRes]) if (r.error) throw new Error(`Could not load the portal settings: ${r.error.message}`);

  const brand = brandRes.data!;
  const colour = /^#[0-9a-f]{6}$/i.test(brand.brand_colour ?? "") ? brand.brand_colour : "#6D4AFF";
  type One<T> = T | T[] | null;
  const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  const lastByCustomer = new Map<string, { at: string; summary: string }>();
  for (const a of actRes.data ?? []) {
    if (a.customer_id && !lastByCustomer.has(a.customer_id)) lastByCustomer.set(a.customer_id, { at: a.created_at, summary: a.summary });
  }
  const contacts = (contactsRes.data ?? []).map((c) => ({ ...c, customer: one(c.customer as One<{ id: string; name: string }>) }));
  const messages = (msgRes.data ?? []).map((m) => ({ ...m, customer: one(m.customer as One<{ name: string }>) }));
  const events = (evRes.data ?? []).map((e) => {
    const cust = one(e.customer as One<{ name: string }>);
    return { id: e.id, label: `${e.name}${cust ? ` — ${cust.name}` : ""}${e.event_date ? ` (${fmtDate(e.event_date)})` : ""}` };
  });
  const requests = (reqRes.data ?? []).map((d) => ({ ...d, event: one(d.event as One<{ name: string }>), customer: one(d.customer as One<{ name: string }>) }));
  const manager = canManage(role);

  return (
    <div>
      <PageHeader
        title="Customer Portal"
        subtitle="A branded space where your customers see their bookings, accept quotes, upload documents and message you."
        actions={<ButtonLink href={`/p/${org.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open portal</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Your portal link" subtitle="Share this with customers — in your quote emails, email signature or booking confirmations." />
            <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-50 px-3 py-2 font-mono text-[12.5px] text-ink ring-1 ring-inset ring-line">{portalUrl}</code>
              <CopyLink url={portalUrl} />
            </div>
            <div className="border-t border-line px-5 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">How customers sign in</p>
              <ol className="mt-2 space-y-1.5 text-[13px] text-ink">
                <li>1. They open the link and enter the email address their booking is under.</li>
                <li>2. We email them a one-time 6-digit code — no password to remember.</li>
                <li>3. Once verified, they see only the events, quotes, invoices and shared documents for their own customer record.</li>
              </ol>
              <p className="mt-3 text-[12.5px] text-ink-muted">
                The email must match the customer&apos;s email or one of their contacts in EventureOS. Internal notes, draft quotes and internal documents are never shown.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Customers with portal access" subtitle="People who have signed in and been linked to their bookings." />
            {contacts.length === 0 ? (
              <EmptyState title="No one has signed in yet">Share your portal link — customers get access the first time they verify their email.</EmptyState>
            ) : (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead>
                    <tr className="text-left text-[11.5px] uppercase tracking-wide text-ink-faint">
                      <th className="px-5 py-2.5 font-medium">Contact</th>
                      <th className="px-3 py-2.5 font-medium">Customer</th>
                      <th className="px-5 py-2.5 font-medium">Last portal activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {contacts.map((c) => {
                      const last = lastByCustomer.get(c.customer_id);
                      const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
                      return (
                        <tr key={c.id}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={name} size={26} />
                              <div className="min-w-0">
                                <p className="truncate text-ink">{name}</p>
                                <p className="truncate text-[11.5px] text-ink-faint">{c.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {c.customer ? <Link href={`/clients/${c.customer.id}`} className="text-ink hover:text-brand-700">{c.customer.name}</Link> : "—"}
                          </td>
                          <td className="px-5 py-3 text-ink-muted">
                            {last ? <><span className="text-ink">{relative(last.at)}</span><span className="block truncate text-[11.5px] text-ink-faint">{last.summary}</span></> : "No activity yet"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent customer messages" subtitle="Reply from the event's Communication tab." />
            {messages.length === 0 ? (
              <EmptyState title="No portal messages yet" />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {messages.map((m) => (
                  <li key={m.id}>
                    <Link href={m.event_id ? `/events/${m.event_id}?tab=communication` : `/clients/${m.customer_id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-zinc-50">
                      <Avatar name={m.customer?.name ?? "Customer"} size={26} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-[13px] text-ink">
                          <span className="font-medium">{m.customer?.name ?? "Customer"}</span>
                          {!m.read_at && <Badge tone="red">New</Badge>}
                          <span className="ml-auto shrink-0 text-[11.5px] text-ink-faint">{relative(m.created_at)}</span>
                        </p>
                        <p className="truncate text-[12.5px] text-ink-muted">{m.body}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Branding" subtitle="What customers see." action={<Link href="/settings/branding" className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700">Edit in Settings</Link>} />
            <div className="px-5 pb-5">
              <div className="overflow-hidden rounded-xl border border-line">
                <div className="h-1" style={{ background: colour }} />
                <div className="flex items-center gap-3 bg-white px-4 py-3">
                  {brand.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={brand.logo_url} alt={brand.name} className="h-8 w-auto max-w-[140px] object-contain" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-semibold text-white" style={{ background: colour }}>{initials(brand.name)}</span>
                  )}
                  <span className="truncate text-[14px] font-semibold text-ink">{brand.name}</span>
                </div>
                <div className="border-t border-line bg-zinc-50 px-4 py-3">
                  <span className="inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-medium text-white" style={{ background: colour }}>Accept quote</span>
                </div>
              </div>
              <dl className="mt-4 space-y-2 text-[12.5px]">
                <div className="flex items-center gap-2 text-ink-muted"><span className="h-3.5 w-3.5 rounded-full ring-1 ring-line" style={{ background: colour }} />Brand colour {colour}</div>
                <div className="flex items-center gap-2 text-ink-muted"><Mail className="h-3.5 w-3.5" />{brand.contact_email ?? <span className="text-amber-700">No contact email set</span>}</div>
                <div className="flex items-center gap-2 text-ink-muted"><Phone className="h-3.5 w-3.5" />{brand.contact_phone ?? <span className="text-ink-faint">No phone set</span>}</div>
                <div className="flex items-center gap-2 text-ink-muted"><Globe className="h-3.5 w-3.5" />{brand.website ?? <span className="text-ink-faint">No website set</span>}</div>
                {!brand.logo_url && <p className="pt-1 text-ink-faint">No logo uploaded — customers see your initials instead.</p>}
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader title="Request a document" subtitle="The customer sees it under Documents with an upload button." />
            <RequestDocumentForm events={events} />
          </Card>

          <Card>
            <CardHeader title="Waiting on customers" subtitle="Requested documents not yet uploaded." />
            {requests.length === 0 ? (
              <p className="px-5 pb-5 text-[12.5px] text-ink-muted">Nothing outstanding.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {requests.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-ink">{d.name}</p>
                      <p className="truncate text-[11.5px] text-ink-faint">
                        {d.customer?.name ?? "Customer"}
                        {d.event && <> · <Link href={`/events/${d.event_id}?tab=documents`} className="hover:text-ink">{d.event.name}</Link></>}
                        {" · "}requested {relative(d.created_at)}
                      </p>
                    </div>
                    {manager && (
                      <form action={cancelDocumentRequest}>
                        <input type="hidden" name="id" value={d.id} />
                        <button className="text-[12px] text-ink-faint hover:text-rose-700">Cancel</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
