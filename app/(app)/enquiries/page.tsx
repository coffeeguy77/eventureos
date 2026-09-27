import Link from "next/link";
import { requireOrg, getMembers } from "@/lib/context";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/records/filter-bar";
import { ENQUIRY_SOURCE, ENQUIRY_STATUS, ENQUIRY_STATUS_ORDER, OPEN_ENQUIRY_STATUSES } from "@/lib/status";
import { enquiryNextAction } from "@/lib/next-action";
import { fmtDate, money, relative } from "@/lib/format";
import type { Enquiry, EnquirySource, EnquiryStatus } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Ban, Inbox, ShieldAlert } from "lucide-react";
import { InboxBulkBar, RowCheck } from "@/components/enquiries/inbox-bulk";
import { SpamList, type SpamRow } from "@/components/enquiries/spam-list";
import { BlockedList, type BlockRow } from "@/components/enquiries/blocked-list";
import { SpamRules } from "@/components/enquiries/spam-rules";
import { DEFAULT_SPAM_PHRASES } from "@/lib/integrations/spam";

export const metadata = { title: "Enquiries" };

type Row = Enquiry & { customer: { name: string } | null };

export default async function EnquiriesPage({ searchParams }: {
  searchParams: Promise<{ status?: string; source?: string; assignee?: string; q?: string; folder?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrg();
  const folder = sp.folder === "spam" || sp.folder === "blocked" ? sp.folder : "inbox";
  const [{ count: spamCount }, { count: blockedCount }] = await Promise.all([
    supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("status", "spam"),
    supabase.from("email_blocklist").select("id", { count: "exact", head: true }).eq("organisation_id", org.id),
  ]);
  const folders = (
    <div className="mb-4 flex gap-1 border-b border-line">
      {([["inbox", "Inbox", Inbox, null], ["spam", "Spam", ShieldAlert, spamCount ?? 0], ["blocked", "Blocked", Ban, blockedCount ?? 0]] as const).map(([key, label, Icon, n]) => (
        <Link key={key} href={key === "inbox" ? "/enquiries" : `/enquiries?folder=${key}`} scroll={false}
          className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-1 text-[0.8438rem] font-medium",
            folder === key ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
          <Icon className="h-4 w-4" />{label}{n != null && n > 0 && <span className="rounded-full bg-zinc-100 px-1.5 text-[0.6875rem] text-ink-muted">{n}</span>}
        </Link>
      ))}
    </div>
  );
  const header = (
    <PageHeader
      title="Enquiries"
      subtitle={folder === "spam" ? "Junk and unwanted email — nothing here is lost; move it back if it's real." : folder === "blocked" ? "Senders that are never imported again." : "Every new lead, from every channel, in one inbox."}
      actions={<ButtonLink href="/enquiries/new" variant="primary">New enquiry</ButtonLink>}
    />
  );

  if (folder === "spam") {
    let q = supabase.from("enquiries").select("id, number, title, contact_name, contact_email, company, message, spam_reason, received_at")
      .eq("organisation_id", org.id).eq("status", "spam").order("received_at", { ascending: false }).limit(500);
    if (sp.q) {
      const term = sp.q.replace(/[,()%"\\]/g, " ").trim();
      if (term) q = q.or(["title", "contact_name", "contact_email", "company", "message"].map((c) => `${c}.ilike."%${term}%"`).join(","));
    }
    const [{ data, error }, { data: integ }] = await Promise.all([
      q, supabase.from("integrations").select("settings").eq("organisation_id", org.id).eq("provider", "gmail").maybeSingle(),
    ]);
    if (error) throw new Error(`Could not load spam: ${error.message}`);
    const rows: SpamRow[] = (data ?? []).map((e) => ({
      id: e.id, number: e.number, from: e.contact_name ?? e.company ?? e.contact_email ?? "Unknown sender", email: e.contact_email,
      subject: e.title, snippet: (e.message as string | null)?.replace(/\s+/g, " ").slice(0, 200) ?? null, reason: e.spam_reason, received: relative(e.received_at),
    }));
    const gs = (integ?.settings ?? {}) as { spam_auto?: boolean; spam_phrases?: string[] };
    const manager = ["owner", "admin", "manager"].includes(role);
    return (
      <div>
        {header}
        {folders}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <FilterBar searchPlaceholder="Search spam — sender, subject, message…" filters={[]} />
            </div>
            {rows.length === 0
              ? <EmptyState title={sp.q ? "Nothing in Spam matches" : "Spam is empty"}>{sp.q ? "Try another search." : "Junk that gets past your filters lands here instead of your inbox."}</EmptyState>
              : <SpamList rows={rows} />}
            <div className="border-t border-line px-4 py-2.5 text-[0.75rem] text-ink-faint">{rows.length} in Spam</div>
          </Card>
          <Card className="self-start">
            <div className="border-b border-line px-4 py-3 sm:px-5"><p className="text-[0.8438rem] font-semibold text-ink">Spam rules</p></div>
            <SpamRules auto={gs.spam_auto !== false} phrases={gs.spam_phrases ?? []} builtIn={DEFAULT_SPAM_PHRASES} canEdit={manager} />
          </Card>
        </div>
      </div>
    );
  }

  if (folder === "blocked") {
    const { data, error } = await supabase.from("email_blocklist").select("id, value, reason, hits, last_hit_at, created_at, created_by")
      .eq("organisation_id", org.id).order("created_at", { ascending: false });
    if (error) throw new Error(`Could not load blocked senders: ${error.message}`);
    const members = await getMembers(org.id);
    const who = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));
    const rows: BlockRow[] = (data ?? []).map((b) => ({ id: b.id, value: b.value, reason: b.reason, hits: b.hits, last_hit: b.last_hit_at ? relative(b.last_hit_at) : null,
      added: fmtDate(b.created_at), by: b.created_by ? who[b.created_by] ?? null : null }));
    return (
      <div>
        {header}
        {folders}
        <Card className="overflow-hidden"><BlockedList rows={rows} canEdit /></Card>
      </div>
    );
  }
  const members = await getMembers(org.id);
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name ?? m.email]));
  const statusKey = sp.status ?? "open";

  let query = supabase
    .from("enquiries")
    .select("*, customer:customers(name)")
    .eq("organisation_id", org.id)
    .order("received_at", { ascending: false })
    .limit(500);
  if (statusKey === "open") query = query.in("status", OPEN_ENQUIRY_STATUSES);
  else if (statusKey !== "all") query = query.eq("status", statusKey);
  else query = query.neq("status", "spam");
  if (sp.source) query = query.eq("source", sp.source);
  if (sp.assignee === "unassigned") query = query.is("assigned_to", null);
  else if (sp.assignee) query = query.eq("assigned_to", sp.assignee);
  if (sp.q) {
    const term = sp.q.replace(/[,()%"\\]/g, " ").trim();
    if (term) {
      const v = `"%${term}%"`;
      query = query.or(["title", "contact_name", "contact_email", "company", "venue"].map((c) => `${c}.ilike.${v}`).join(","));
    }
  }

  const [{ data, error }, { data: allStatuses, error: e2 }] = await Promise.all([
    query,
    supabase.from("enquiries").select("status").eq("organisation_id", org.id).neq("status", "spam"),
  ]);
  if (error || e2) throw new Error(`Could not load enquiries: ${(error ?? e2)!.message}`);
  const rows = (data ?? []) as Row[];
  const counts: Record<string, number> = { all: allStatuses?.length ?? 0, open: 0 };
  for (const r of allStatuses ?? []) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    if (OPEN_ENQUIRY_STATUSES.includes(r.status as EnquiryStatus)) counts.open++;
  }

  const tabs = [
    { key: "open", label: "Open" },
    ...ENQUIRY_STATUS_ORDER.map((s) => ({ key: s, label: ENQUIRY_STATUS[s].label })),
    { key: "all", label: "All" },
  ];
  const qs = (key: string) => {
    const p = new URLSearchParams();
    if (key !== "open") p.set("status", key);
    if (sp.source) p.set("source", sp.source);
    if (sp.assignee) p.set("assignee", sp.assignee);
    if (sp.q) p.set("q", sp.q);
    const s = p.toString();
    return s ? `/enquiries?${s}` : "/enquiries";
  };
  const now = new Date().toISOString();

  return (
    <div>
      {header}
      {folders}

      <div className="no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => {
          const on = t.key === statusKey;
          const c = counts[t.key] ?? 0;
          return (
            <Link key={t.key} href={qs(t.key)} scroll={false}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium",
                on ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-inset ring-line hover:text-ink")}>
              {t.label}
              <span className={cn("text-[0.6875rem]", on ? "text-white/70" : "text-ink-faint")}>{c}</span>
            </Link>
          );
        })}
      </div>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <FilterBar
            searchPlaceholder="Search name, email, company, venue…"
            filters={[
              { key: "source", label: "Source", options: Object.entries(ENQUIRY_SOURCE).map(([value, label]) => ({ value, label })) },
              { key: "assignee", label: "Assigned", options: [{ value: "unassigned", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.full_name ?? m.email }))] },
            ]}
          />
        </div>
        {rows.length > 0 && <InboxBulkBar total={rows.length} />}
        {rows.length === 0 ? (
          <EmptyState title="No enquiries match" action={<ButtonLink href="/enquiries" size="sm">Clear filters</ButtonLink>}>
            Try another status or clear your filters.
          </EmptyState>
        ) : (
          <>
          <ul className="divide-y divide-line md:hidden">
            {rows.map((e) => {
              const s = ENQUIRY_STATUS[e.status];
              const na = enquiryNextAction(e);
              const unread = e.status === "new" || e.status === "needs_review";
              return (
                <li key={e.id} className="relative flex items-start">
                  <span className="pl-4 pt-3.5"><RowCheck id={e.id} label={e.title} /></span>
                  <Link href={`/enquiries/${e.id}`} className="flex min-h-[56px] min-w-0 flex-1 items-start gap-3 px-3 py-3 active:bg-zinc-50">
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-[0.8438rem] text-ink", unread ? "font-semibold" : "font-medium")}>
                        {e.customer?.name ?? e.contact_name ?? e.contact_email ?? "Unknown"}
                      </div>
                      <div className="truncate text-[0.7812rem] text-ink-muted">{e.title}</div>
                      <div className="mt-0.5 truncate text-[0.75rem] text-ink-faint">
                        {e.event_date ? fmtDate(e.event_date) : "No date"} · {relative(e.received_at)}
                        {na.due && na.due < now ? <span className="font-medium text-rose-700"> · Overdue</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={s.tone} dot>{s.label}</Badge>
                      {e.budget ? <span className="tabular text-[0.7812rem] text-ink">{money(e.budget, org.currency, { cents: false })}</span> : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1180px] text-left text-[0.8125rem]">
              <thead>
                <tr className="border-b border-line text-[0.7188rem] font-medium uppercase tracking-wide text-ink-faint">
                  <th className="w-10 px-4 py-2.5" aria-label="Select" />
                  {["Customer", "Event", "Type", "Event date", "Received", "Source", "Budget", "Status", "Assigned", "Last contact", "Next action"].map((h) => (
                    <th key={h} className={cn("whitespace-nowrap px-4 py-2.5 font-medium", h === "Budget" && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((e) => {
                  const s = ENQUIRY_STATUS[e.status];
                  const na = enquiryNextAction(e);
                  const unread = e.status === "new" || e.status === "needs_review";
                  return (
                    <tr key={e.id} className="relative hover:bg-zinc-50/70">
                      <td className="px-4 py-3"><RowCheck id={e.id} label={e.title} /></td>
                      <td className="px-4 py-3">
                        <Link href={`/enquiries/${e.id}`} className="after:absolute after:inset-0">
                          <span className={cn("block max-w-[200px] truncate text-ink", unread ? "font-semibold" : "font-medium")}>
                            {e.customer?.name ?? e.contact_name ?? e.contact_email ?? "Unknown"}
                          </span>
                          <span className="block max-w-[200px] truncate text-[0.75rem] text-ink-faint">
                            {e.customer ? e.contact_name : e.company ?? "New contact"}
                          </span>
                        </Link>
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <span className="block truncate text-ink">{e.title}</span>
                        <span className="text-[0.75rem] text-ink-faint">ENQ-{e.number}{e.guest_count ? ` · ${e.guest_count} guests` : ""}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{e.event_type ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{fmtDate(e.event_date)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted" title={e.received_at}>{relative(e.received_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{ENQUIRY_SOURCE[e.source as EnquirySource]}</td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right text-ink">{e.budget ? money(e.budget, org.currency, { cents: false }) : "—"}</td>
                      <td className="px-4 py-3"><Badge tone={s.tone} dot>{s.label}</Badge></td>
                      <td className="px-4 py-3">
                        {e.assigned_to ? (
                          <span className="flex items-center gap-2 whitespace-nowrap text-ink-muted"><Avatar name={names[e.assigned_to]} size={20} />{names[e.assigned_to]?.split(" ")[0]}</span>
                        ) : <span className="text-[0.75rem] font-medium text-amber-700">Unassigned</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{e.last_contact_at ? relative(e.last_contact_at) : <span className="text-amber-700">Not contacted</span>}</td>
                      <td className="max-w-[220px] px-4 py-3">
                        <span className={cn("block truncate", na.urgency === "done" ? "text-ink-faint" : "text-ink")}>{na.label}</span>
                        {na.due && (
                          <span className={cn("text-[0.75rem]", na.due < now ? "font-medium text-rose-700" : "text-ink-faint")}>
                            {na.due < now ? "Overdue · " : "Due "}{relative(na.due)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        <div className="border-t border-line px-4 py-2.5 text-[0.75rem] text-ink-faint">{rows.length} enquir{rows.length === 1 ? "y" : "ies"}</div>
      </Card>
    </div>
  );
}
