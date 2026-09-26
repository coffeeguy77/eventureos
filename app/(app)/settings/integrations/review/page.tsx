import Link from "next/link";
import { Fragment } from "react";
import { ArrowRight, Mail, Sparkles } from "lucide-react";
import { canManage, requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { CLASSIFICATION } from "@/lib/status";
import { fmtDate, fmtDateTime, money, relative } from "@/lib/format";
import { matchBand } from "@/lib/integrations/matching";
import { getFollowUps } from "@/lib/ai/followups";
import type { EmailClassification } from "@/lib/types";
import { cn } from "@/lib/cn";
import { CandidateActions, SuggestionForm } from "../controls";

export const metadata = { title: "Import & match review" };

interface Candidate {
  id: string; source: "gmail" | "xero"; kind: string; external_id: string; payload: Record<string, unknown>;
  suggested_customer_id: string | null; score: number | null; reasons: string[]; created_at: string;
}
interface Cust { id: string; name: string; company: string | null; email: string | null; phone: string | null; xero_contact_id: string | null; contacts: { first_name: string; last_name: string | null; email: string | null }[] }

export default async function ReviewPage() {
  const { supabase, org, role } = await requireOrg();
  const manager = canManage(role);

  const [candRes, custRes, sugRes, reviewEnqRes, followUps] = await Promise.all([
    supabase.from("import_candidates").select("id, source, kind, external_id, payload, suggested_customer_id, score, reasons, created_at")
      .eq("organisation_id", org.id).eq("status", "pending").order("score", { ascending: false, nullsFirst: false }).limit(200),
    supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").limit(1000),
    supabase.from("email_threads").select("id, subject, classification, classification_confidence, classified_by, classification_reasons, extracted, last_inbound_at, participants, customer:customers(id, name)")
      .eq("organisation_id", org.id).in("classification", ["event_enquiry", "needs_review"]).is("enquiry_id", null).is("event_id", null)
      .neq("state", "closed").is("suggestion_dismissed_at", null).order("last_inbound_at", { ascending: false, nullsFirst: false }).limit(30),
    supabase.from("enquiries").select("id, number, title, contact_name, contact_email, classification_confidence, received_at, source")
      .eq("organisation_id", org.id).eq("status", "needs_review").order("received_at", { ascending: false }).limit(30),
    getFollowUps(supabase, org),
  ]);
  for (const r of [candRes, custRes, sugRes, reviewEnqRes]) if (r.error) throw new Error(`Could not load review: ${r.error.message}`);

  const candidates = (candRes.data ?? []) as Candidate[];
  const suggestedIds = [...new Set(candidates.map((c) => c.suggested_customer_id).filter((x): x is string => !!x))];
  const { data: suggestedRows } = suggestedIds.length
    ? await supabase.from("customers").select("id, name, company, email, phone, xero_contact_id, contacts(first_name, last_name, email)").in("id", suggestedIds)
    : { data: [] };
  const suggested = new Map(((suggestedRows ?? []) as unknown as Cust[]).map((c) => [c.id, c]));
  const customers = (custRes.data ?? []) as { id: string; name: string }[];

  const threads = (sugRes.data ?? []) as unknown as {
    id: string; subject: string | null; classification: EmailClassification; classification_confidence: number | null; classified_by: string;
    classification_reasons: string[]; extracted: Record<string, unknown> | null; last_inbound_at: string | null; participants: string[]; customer: { id: string; name: string } | null;
  }[];
  const { data: firstMsgs } = threads.length
    ? await supabase.from("email_messages").select("thread_id, from_email, from_name, snippet, sent_at").in("thread_id", threads.map((t) => t.id)).eq("direction", "inbound").order("sent_at")
    : { data: [] };
  const firstByThread = new Map<string, { from_email: string; from_name: string | null; snippet: string | null }>();
  for (const m of firstMsgs ?? []) if (!firstByThread.has(m.thread_id as string)) firstByThread.set(m.thread_id as string, m as { from_email: string; from_name: string | null; snippet: string | null });

  const xero = candidates.filter((c) => c.source === "xero");
  const gmailContacts = candidates.filter((c) => c.source === "gmail" && c.kind === "contact");
  const gmailEnquiries = candidates.filter((c) => c.source === "gmail" && c.kind === "enquiry");
  const reviewEnquiries = (reviewEnqRes.data ?? []) as { id: string; number: number; title: string; contact_name: string | null; contact_email: string | null; classification_confidence: number | null; received_at: string; source: string }[];

  return (
    <div>
      <PageHeader
        eyebrow={<Link href="/settings/integrations" className="hover:text-ink">Integrations</Link>}
        title="Review"
        subtitle="Emails that might be enquiries, possible duplicate customers from Gmail and Xero, and follow-ups that are slipping. Nothing merges or gets created until you choose."
      />

      <nav className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 text-[12.5px] sm:mx-0 sm:px-0">
        {[
          ["#suggestions", "Suggestions", threads.length + reviewEnquiries.length],
          ["#follow-ups", "Follow-ups", followUps.length],
          ["#match-review", "Xero match review", xero.length],
          ["#import-review", "Gmail import review", gmailContacts.length + gmailEnquiries.length],
        ].map(([href, label, n]) => (
          <a key={href as string} href={href as string} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-2 font-medium sm:py-1.5 text-ink ring-1 ring-inset ring-line hover:bg-zinc-50">
            {label} <span className={cn("rounded-full px-1.5 text-[10.5px] font-semibold", Number(n) ? "bg-brand-50 text-brand-700" : "bg-zinc-100 text-ink-faint")}>{n}</span>
          </a>
        ))}
      </nav>

      <div className="space-y-6">
        {/* ---------------- Suggestions ---------------- */}
        <Card id="suggestions">
          <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-500" /> Suggestions — create enquiries from email</span>}
            subtitle="Emails that look like event enquiries (or that the classifier wasn't sure about) and aren't linked to an enquiry or event yet. Details are pre-filled from the email — check and edit before creating." />
          {threads.length === 0 && reviewEnquiries.length === 0 ? (
            <EmptyState title="Nothing to review">New emails that look like enquiries will show up here.</EmptyState>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {reviewEnquiries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:px-5">
                  <Badge tone="amber">Needs review</Badge>
                  <Link href={`/enquiries/${e.id}`} className="min-w-0 flex-1 basis-40 truncate text-[13px] font-medium text-ink hover:text-brand-700">ENQ-{e.number} · {e.title}</Link>
                  <span className="min-w-0 break-words text-[12px] text-ink-muted">{e.contact_name ?? e.contact_email}{e.classification_confidence != null ? ` · ${Math.round(e.classification_confidence * 100)}% sure` : ""}</span>
                  <span className="text-[11.5px] text-ink-faint">{relative(e.received_at)}</span>
                  <Link href={`/enquiries/${e.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-600 hover:text-brand-700">Open <ArrowRight className="h-3.5 w-3.5" /></Link>
                </li>
              ))}
              {threads.map((t) => {
                const x = (t.extracted ?? {}) as Record<string, string | number | boolean | null>;
                const first = firstByThread.get(t.id);
                const c = CLASSIFICATION[t.classification];
                const chips = [
                  x.event_type && String(x.event_type), x.event_date && fmtDate(String(x.event_date)), x.guest_count && `${x.guest_count} guests`,
                  x.budget && money(Number(x.budget), org.currency, { cents: false }), x.venue && String(x.venue),
                ].filter(Boolean) as string[];
                const who = (x.name as string | null) ?? first?.from_name ?? (x.email as string | null) ?? first?.from_email ?? t.participants[0] ?? "Unknown sender";
                return (
                  <li key={t.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0 text-ink-faint" />
                      <span className="min-w-0 break-words text-[13px] font-semibold text-ink">{t.subject ?? "(no subject)"}</span>
                      <Badge tone={c.tone}>{c.label}{t.classification_confidence != null ? ` · ${Math.round(t.classification_confidence * 100)}%` : ""}</Badge>
                      <span className="text-[11.5px] text-ink-faint">{t.classified_by === "ai" ? "AI" : t.classified_by === "user" ? "You" : "Rules"}</span>
                      <span className="ml-auto text-[11.5px] text-ink-faint" title={t.last_inbound_at ? fmtDateTime(t.last_inbound_at, org.timezone) : undefined}>{relative(t.last_inbound_at)}</span>
                    </div>
                    <p className="mt-1 break-words text-[12.5px] text-ink-muted">From {who}{t.customer ? <> · existing customer <Link href={`/clients/${t.customer.id}`} className="text-brand-600 hover:text-brand-700">{t.customer.name}</Link></> : ""}</p>
                    {first?.snippet && <p className="mt-1.5 line-clamp-2 break-words text-[12.5px] text-ink">{first.snippet}</p>}
                    {chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((ch) => <span key={ch} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] text-brand-700">{ch}</span>)}</div>}
                    {t.classification_reasons?.length > 0 && (
                      <ul className="mt-2 list-disc break-words pl-5 text-[12px] text-ink-faint">{t.classification_reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>
                    )}
                    <div className="mt-3">
                      <SuggestionForm threadId={t.id} values={{
                        title: x.event_type ? `${x.event_type} enquiry — ${who}` : (t.subject ?? `Enquiry from ${who}`).slice(0, 120),
                        contact_name: (x.name as string | null) ?? first?.from_name ?? null,
                        contact_email: (x.email as string | null) ?? first?.from_email ?? null,
                        contact_phone: (x.phone as string | null) ?? null, company: (x.company as string | null) ?? null,
                        event_type: (x.event_type as string | null) ?? null, event_date: (x.event_date as string | null) ?? null,
                        guest_count: (x.guest_count as number | null) ?? null, budget: (x.budget as number | null) ?? null, venue: (x.venue as string | null) ?? null,
                        website: !!x.website_form,
                      }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ---------------- Follow-up intelligence ---------------- */}
        <Card id="follow-ups">
          <CardHeader title="Follow-up intelligence" subtitle={`Quotes unanswered for ${Number(org.settings?.quote_follow_up_days ?? 3)}+ days, customers waiting over 24 hours for a reply, and events in the next 14 days with money still owing.`} />
          {followUps.length === 0 ? <EmptyState title="All caught up">Nothing is slipping right now.</EmptyState> : (
            <ul className="divide-y divide-line border-t border-line">
              {followUps.map((f, i) => (
                <li key={i}>
                  <Link href={f.href} className="flex min-h-[56px] items-start gap-3 px-4 py-3 hover:bg-zinc-50/70 active:bg-zinc-50 sm:px-5">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", f.urgency === "high" ? "bg-rose-500" : "bg-amber-400")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink">{f.title}</p>
                      <p className="break-words text-[12px] text-ink-muted">{f.detail}</p>
                    </div>
                    <Badge tone={f.kind === "quote_no_reply" ? "brand" : f.kind === "email_no_reply" ? "blue" : "amber"}>
                      {f.kind === "quote_no_reply" ? "Quote" : f.kind === "email_no_reply" ? "Email" : "Payment"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------- Xero match review ---------------- */}
        <Card id="match-review">
          <CardHeader title="Match review — Xero contacts" subtitle="Each Xero contact that isn't linked yet. Merge links it to the customer (filling only blank details) and imports its invoice history; Keep separate creates a new customer." />
          {xero.length === 0 ? <EmptyState title="No Xero contacts to review">Connect Xero and press Sync now to fetch contacts.</EmptyState> : (
            <ul className="divide-y divide-line border-t border-line">
              {xero.map((c) => (
                <CandidateItem key={c.id} c={c} existing={c.suggested_customer_id ? suggested.get(c.suggested_customer_id) ?? null : null} customers={customers} manager={manager}
                  incomingLabel="Xero" incoming={[
                    ["Name", String(c.payload.name ?? "")], ["Person", (c.payload.person as string | null) ?? null],
                    ["Email", (c.payload.email as string | null) ?? null], ["Phone", (c.payload.phone as string | null) ?? null],
                  ]} />
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------- Gmail import review ---------------- */}
        <Card id="import-review">
          <CardHeader title="Import review — Gmail history" subtitle="People and enquiry conversations found in your Gmail history. Possible matches need your confirmation, so no duplicate customers are created." />
          {gmailContacts.length + gmailEnquiries.length === 0 ? (
            <EmptyState title="Nothing from Gmail to review">Run “Import historical event enquiries” in <Link href="/settings/integrations/gmail" className="text-brand-600">Gmail settings</Link>.</EmptyState>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {gmailEnquiries.map((c) => {
                const person = (c.payload.person ?? {}) as { name?: string | null; email?: string | null; phone?: string | null; company?: string | null };
                const x = (c.payload.extracted ?? {}) as Record<string, unknown>;
                return (
                  <CandidateItem key={c.id} c={c} existing={c.suggested_customer_id ? suggested.get(c.suggested_customer_id) ?? null : null} customers={customers} manager={manager}
                    heading={<><Badge tone={CLASSIFICATION[(c.payload.classification as EmailClassification) ?? "event_enquiry"]?.tone ?? "brand"}>{CLASSIFICATION[(c.payload.classification as EmailClassification) ?? "event_enquiry"]?.label ?? "Enquiry"}</Badge> <span className="text-[13px] font-semibold text-ink">{String(c.payload.subject ?? "(no subject)")}</span> <span className="text-[11.5px] text-ink-faint">{fmtDate(String(c.payload.first_at ?? ""))}{c.payload.quote_mentioned ? " · quote mentioned" : ""}{c.payload.we_replied ? " · you replied" : ""}</span></>}
                    mergeLabel="Import for this customer" separateLabel="Import without linking"
                    incomingLabel="Gmail" incoming={[
                      ["Name", person.name ?? null], ["Email", person.email ?? null], ["Phone", person.phone ?? null], ["Company", person.company ?? null],
                      ["Event", [x.event_type, x.event_date ? fmtDate(String(x.event_date)) : null, x.guest_count ? `${x.guest_count} guests` : null].filter(Boolean).join(" · ") || null],
                    ]} />
                );
              })}
              {gmailContacts.map((c) => (
                <CandidateItem key={c.id} c={c} existing={c.suggested_customer_id ? suggested.get(c.suggested_customer_id) ?? null : null} customers={customers} manager={manager}
                  mergeLabel="Add as contact" separateLabel={c.suggested_customer_id ? "Keep separate (new customer)" : "Create customer"}
                  incomingLabel="Gmail" incoming={[
                    ["Name", (c.payload.name as string | null) ?? null], ["Email", (c.payload.email as string | null) ?? null],
                    ["Phone", (c.payload.phone as string | null) ?? null], ["Company", (c.payload.company as string | null) ?? null],
                    ["History", `${Number(c.payload.threads ?? 1)} conversation${Number(c.payload.threads ?? 1) === 1 ? "" : "s"}, last ${fmtDate(String(c.payload.last ?? ""))}`],
                  ]} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function CandidateItem({ c, existing, customers, manager, incoming, incomingLabel, heading, mergeLabel, separateLabel }: {
  c: Candidate; existing: Cust | null; customers: { id: string; name: string }[]; manager: boolean;
  incoming: [string, string | null][]; incomingLabel: string; heading?: React.ReactNode; mergeLabel?: string; separateLabel?: string;
}) {
  const score = c.score != null ? Math.round(Number(c.score)) : null;
  const band = score != null ? matchBand(score) : "none";
  const tone = band === "certain" ? "green" : band === "likely" ? "blue" : band === "possible" ? "amber" : "neutral";
  return (
    <li className="px-4 py-4 sm:px-5">
      {heading && <div className="mb-2 flex flex-wrap items-center gap-2">{heading}</div>}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
        <Side label={incomingLabel} rows={incoming} />
        <div className="flex flex-row items-center justify-center gap-2 md:flex-col md:px-2">
          {existing ? (
            <>
              <span className={cn("text-[20px] font-semibold tabular", band === "certain" ? "text-emerald-700" : band === "likely" ? "text-sky-700" : "text-amber-700")}>{score ?? 0}%</span>
              <Badge tone={tone}>{band === "certain" ? "Likely same" : band === "likely" ? "Probable match" : "Possible match"}</Badge>
            </>
          ) : <Badge tone="neutral">No match</Badge>}
        </div>
        {existing ? (
          <Side label="EventureOS" href={`/clients/${existing.id}`} rows={[
            ["Name", existing.name], ["Company", existing.company], ["Email", existing.email ?? existing.contacts.find((x) => x.email)?.email ?? null], ["Phone", existing.phone],
            ["Contacts", existing.contacts.map((x) => [x.first_name, x.last_name].filter(Boolean).join(" ")).join(", ") || null],
            ...(existing.xero_contact_id ? [["Xero", "Already linked to a Xero contact"] as [string, string]] : []),
          ]} />
        ) : (
          <div className="flex items-center rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-ink-muted">No existing customer looks like this one.</div>
        )}
      </div>
      {c.reasons?.length > 0 && <p className="mt-2 break-words text-[12px] text-ink-faint">Why: {c.reasons.join(" · ")}</p>}
      <div className="mt-3">
        <CandidateActions id={c.id} suggestedId={c.suggested_customer_id} customers={customers} canResolve={manager} mergeLabel={mergeLabel} separateLabel={separateLabel} />
      </div>
    </li>
  );
}

function Side({ label, rows, href }: { label: string; rows: [string, string | null][]; href?: string }) {
  return (
    <div className="rounded-lg bg-zinc-50/80 px-3 py-2.5 ring-1 ring-inset ring-line">
      <p className="mb-1.5 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-ink-faint">
        {label}{href && <Link href={href} className="normal-case tracking-normal text-brand-600 hover:text-brand-700">Open</Link>}
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
        {rows.filter(([, v]) => v).map(([k, v]) => (<Fragment key={k}><dt className="text-ink-faint">{k}</dt><dd className="min-w-0 truncate text-ink">{v}</dd></Fragment>))}
      </dl>
    </div>
  );
}
