"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { EVENT_TYPES } from "@/lib/status";
import {
  createEnquiryFromThread, disconnect, refileThread, resolveCandidate, runGmailImport, saveCalendarSettings,
  emailCleanup, saveGmailSettings, saveXeroSettings, syncNow, type ActionState, type CleanupState,
} from "./actions";

function Result({ state }: { state: ActionState }) {
  if (state?.error) return <FormError message={state.error} />;
  if (state?.ok) return <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800 ring-1 ring-inset ring-emerald-100">{state.ok}</p>;
  return null;
}

export function SyncNowButton({ provider, label = "Sync now", full = false, variant = "secondary" }: { provider: string; label?: string; full?: boolean; variant?: "secondary" | "primary" | "ghost" }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(syncNow.bind(null, provider), undefined);
  return (
    <form action={action} className="contents">
      {full && <input type="hidden" name="full" value="1" />}
      <Button size="sm" variant={variant} disabled={pending}>
        <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} /> {pending ? "Syncing…" : label}
      </Button>
      {state && <div className="basis-full"><Result state={state} /></div>}
    </form>
  );
}

export function DisconnectButton({ provider, name }: { provider: string; name: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>();
  return (
    <>
      <Button size="sm" variant="danger" disabled={pending}
        onClick={() => {
          if (!confirm(`Disconnect ${name}? Syncing stops and EventureOS forgets the access tokens. Records already synced stay in EventureOS.`)) return;
          start(async () => setState(await disconnect(provider)));
        }}>
        {pending ? "Disconnecting…" : "Disconnect"}
      </Button>
      {state && <div className="basis-full"><Result state={state} /></div>}
    </>
  );
}

export interface GmailFilterValues {
  filter_mode: "matching" | "all";
  filter_keywords: string[];
  website_subject_patterns: string[];
  website_form_senders: string[];
  filter_allow_senders: string[];
  filter_block_senders: string[];
  ai_enabled: boolean;
  initial_days: number;
}

export function GmailSettingsForm({ values, aiConfigured }: { values: GmailFilterValues; aiConfigured: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveGmailSettings, undefined);
  const [mode, setMode] = useState(values.filter_mode);
  return (
    <form action={action} className="grid gap-5 px-5 pb-5 sm:grid-cols-2">
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-[13px] font-medium text-ink">Which emails come into EventureOS?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ["matching", "Only matching emails", "Recommended. Web-form emails, your keywords, and replies from customers you already have. Everything else stays in Gmail only."],
            ["all", "Everything in the inbox", "Every email except newsletters and blocked senders. Busy, but nothing is missed."],
          ] as const).map(([v, title, desc]) => (
            <label key={v} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
              mode === v ? "border-brand-300 bg-brand-50/60 ring-1 ring-inset ring-brand-200" : "border-line hover:border-line-strong")}>
              <input type="radio" name="filter_mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="mt-1 accent-brand-600" />
              <span><span className="block text-[13.5px] font-medium">{title}</span><span className="mt-0.5 block text-[12.5px] leading-snug text-ink-muted">{desc}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="sm:col-span-2">
        <Label htmlFor="website_subject_patterns" hint="one per line — matches the start of the subject">Web-form subject lines</Label>
        <Textarea id="website_subject_patterns" name="website_subject_patterns" rows={3} defaultValue={values.website_subject_patterns.join("\n")}
          placeholder={"Coffee Cart Hire Message From\nCatering Enquiry From"} />
        <p className="mt-1 text-[12px] leading-snug text-ink-faint">
          Emails whose subject <strong className="font-medium text-ink-muted">starts with</strong> one of these are always imported as website enquiries, and the customer&apos;s details are read from the form.
          Use <code className="rounded bg-zinc-100 px-1">*</code> for a part that changes, e.g. <code className="rounded bg-zinc-100 px-1">* Message From</code>.
        </p>
      </div>

      <div>
        <Label htmlFor="filter_keywords" hint="one per line">Keywords</Label>
        <Textarea id="filter_keywords" name="filter_keywords" rows={6} defaultValue={values.filter_keywords.join("\n")}
          placeholder={"coffee cart\ncoffee van\nhire\nevent\ncatering"} readOnly={mode === "all"} className={cn(mode === "all" && "opacity-50")} />
        <p className="mt-1 text-[12px] leading-snug text-ink-faint">An email is imported if its subject or message mentions any of these. “hire” also matches hires, hired and hiring. Newsletters are skipped even if they mention a keyword.</p>
      </div>
      <div className="grid content-start gap-4">
        <div>
          <Label htmlFor="filter_allow_senders" hint="email or @domain, one per line">Always import from</Label>
          <Textarea id="filter_allow_senders" name="filter_allow_senders" rows={2} defaultValue={values.filter_allow_senders.join("\n")} placeholder={"@myvenuepartner.com.au"} />
        </div>
        <div>
          <Label htmlFor="filter_block_senders" hint="email or @domain, one per line">Never import from</Label>
          <Textarea id="filter_block_senders" name="filter_block_senders" rows={2} defaultValue={values.filter_block_senders.join("\n")} placeholder={"@paypal.com.au\nnoreply@shop.example"} />
        </div>
      </div>

      <details className="rounded-xl border border-line px-4 py-3 sm:col-span-2">
        <summary className="cursor-pointer text-[13px] font-medium">More settings</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="website_form_senders" hint="one per line">Website form senders</Label>
            <Textarea id="website_form_senders" name="website_form_senders" rows={3} defaultValue={values.website_form_senders.join("\n")}
              placeholder={"forms@yourdomain.com.au\nwordpress@yourdomain.com.au"} />
            <p className="mt-1 text-[12px] text-ink-faint">Every email from these addresses is a website enquiry.</p>
          </div>
          <div className="grid content-start gap-4">
            <div>
              <Label htmlFor="initial_days">First sync looks back</Label>
              <Select id="initial_days" name="initial_days" defaultValue={String(values.initial_days)}>
                {[7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} days</option>)}
              </Select>
            </div>
            <div>
              <Label>AI classification</Label>
              <label className={cn("flex items-start gap-2 text-[13px]", !aiConfigured && "text-ink-faint")}>
                <input type="checkbox" name="ai_enabled" defaultChecked={values.ai_enabled} disabled={!aiConfigured} className="mt-0.5" />
                <span>Use Claude to classify new emails and extract event details.{" "}
                  {aiConfigured ? "Falls back to the rules engine on any error." : <>Needs <code className="rounded bg-zinc-100 px-1">ANTHROPIC_API_KEY</code> — the rules engine is used until then.</>}
                </span>
              </label>
            </div>
          </div>
        </div>
      </details>

      <div className="sm:col-span-2"><Result state={state} /></div>
      <div className="flex justify-end sm:col-span-2"><Button size="md" variant="primary" disabled={pending} className="w-full sm:w-auto">{pending ? "Saving…" : "Save email filters"}</Button></div>
    </form>
  );
}

export function EmailCleanupPanel() {
  const [state, action, pending] = useActionState<CleanupState, FormData>(emailCleanup, undefined);
  return (
    <form action={action} className="grid gap-3 px-5 pb-5">
      {state?.preview ? (
        <>
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-100">
            <strong className="font-semibold">{state.preview.threads} conversation{state.preview.threads === 1 ? "" : "s"}</strong> ({state.preview.messages} email{state.preview.messages === 1 ? "" : "s"}) don&apos;t match your filters
            {state.preview.enquiries ? <>, including <strong className="font-semibold">{state.preview.enquiries} enquir{state.preview.enquiries === 1 ? "y" : "ies"}</strong> nobody has worked on yet</> : null}.
            They&apos;ll be removed from EventureOS only — your Gmail isn&apos;t touched. Anything linked to a customer or event, or an enquiry someone has updated, is kept.
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="submit" name="step" value="preview" variant="secondary" size="md" disabled={pending}>Check again</Button>
            <Button type="submit" name="step" value="run" variant="danger" size="md" disabled={pending}>{pending ? "Removing…" : `Remove ${state.preview.threads} conversation${state.preview.threads === 1 ? "" : "s"}`}</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.5px] text-ink-muted">Save your filters first, then check which already-imported emails no longer match.</p>
          <Button type="submit" name="step" value="preview" variant="secondary" size="md" disabled={pending}>{pending ? "Checking…" : "Check imported email"}</Button>
        </div>
      )}
      {state?.error && <FormError message={state.error} />}
      {state?.ok && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800 ring-1 ring-inset ring-emerald-100">{state.ok}</p>}
    </form>
  );
}

export function ImportForm({ months, inProgress }: { months: number; inProgress: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(runGmailImport, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 px-5 pb-5">
      <div>
        <Label htmlFor="months">Look back</Label>
        <Select id="months" name="months" defaultValue={String(months)} className="w-40">
          {[3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} months</option>)}
        </Select>
      </div>
      {inProgress && (
        <label className="flex items-center gap-2 pb-2 text-[12.5px] text-ink-muted"><input type="checkbox" name="restart" value="1" /> Start again from the newest mail</label>
      )}
      <Button variant="primary" size="md" disabled={pending}>{pending ? "Scanning Gmail…" : inProgress ? "Continue import" : "Import historical event enquiries"}</Button>
      <div className="basis-full"><Result state={state} /></div>
    </form>
  );
}

export interface CalendarRow { id: string; name: string; colour: string; external_calendar_id: string | null; sync_enabled: boolean; entries: number }

export function CalendarSettingsForm({ rows, calendars, kinds, pullBusy }: {
  rows: CalendarRow[]; calendars: { id: string; summary: string; primary?: boolean }[]; kinds: string[]; pullBusy: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveCalendarSettings, undefined);
  const KINDS: [string, string][] = [["event", "Events"], ["site_visit", "Site visits"], ["setup", "Setups"], ["hold", "Holds"]];
  return (
    <form action={action} className="px-5 pb-5">
      {rows.length === 0 ? (
        <p className="mb-4 text-[13px] text-ink-muted">You don&apos;t have any EventureOS calendars (resources) yet. Add one on the Calendar page, then map it here.</p>
      ) : (
        <div className="-mx-5 mb-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead><tr className="border-y border-line bg-zinc-50/60 text-left text-[11.5px] uppercase tracking-wide text-ink-faint">
              <th className="px-5 py-2 font-medium">EventureOS calendar</th><th className="px-3 py-2 font-medium">Google calendar</th><th className="px-3 py-2 font-medium">Sync</th><th className="px-5 py-2 text-right font-medium">Entries</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2.5"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: r.colour }} />{r.name}</td>
                  <td className="px-3 py-2.5">
                    <select name={`cal_${r.id}`} defaultValue={r.external_calendar_id ?? ""} className={cn(inputClass, "h-8 py-0 text-[12.5px]")}>
                      <option value="">Don&apos;t sync</option>
                      {calendars.map((c) => <option key={c.id} value={c.id}>{c.summary}{c.primary ? " (primary)" : ""}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5"><input type="checkbox" name={`sync_${r.id}`} defaultChecked={r.sync_enabled} aria-label={`Sync ${r.name}`} /></td>
                  <td className="tabular px-5 py-2.5 text-right text-ink-muted">{r.entries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-medium text-ink">Which entries sync</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {KINDS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" name={`kind_${k}`} defaultChecked={kinds.includes(k)} /> {label}</label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" name="pull_busy" defaultChecked={pullBusy} className="mt-0.5" />
          <span>Show busy time from these Google calendars in EventureOS (next 90 days) so double-bookings are visible.</span>
        </label>
      </div>
      <div className="mt-4"><Result state={state} /></div>
      <div className="mt-3 flex justify-end"><Button size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save calendar sync"}</Button></div>
    </form>
  );
}

export function XeroSettingsForm({ values, tenants }: {
  values: { push_invoices: string; sales_account_code: string; tax_type: string; tenant_id: string | null; quote_acceptance_action: string; deposit_percent: number };
  tenants: { tenantId: string; tenantName: string | null }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveXeroSettings, undefined);
  return (
    <form action={action} className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
      {tenants.length > 1 && (
        <div className="sm:col-span-2">
          <Label htmlFor="tenant_id">Xero organisation</Label>
          <Select id="tenant_id" name="tenant_id" defaultValue={values.tenant_id ?? ""}>
            {tenants.map((t) => <option key={t.tenantId} value={t.tenantId}>{t.tenantName ?? t.tenantId}</option>)}
          </Select>
        </div>
      )}
      <div>
        <Label htmlFor="quote_acceptance_action">When a quote is accepted</Label>
        <Select id="quote_acceptance_action" name="quote_acceptance_action" defaultValue={values.quote_acceptance_action}>
          <option value="deposit_invoice">Create a deposit invoice</option>
          <option value="full_invoice">Create the full invoice</option>
          <option value="manual">Do nothing — I&apos;ll invoice manually</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="deposit_percent" hint="%">Deposit</Label>
        <Input id="deposit_percent" name="deposit_percent" inputMode="decimal" defaultValue={values.deposit_percent} />
      </div>
      <div>
        <Label htmlFor="push_invoices">Send EventureOS invoices to Xero</Label>
        <Select id="push_invoices" name="push_invoices" defaultValue={values.push_invoices}>
          <option value="off">Don&apos;t send</option>
          <option value="draft">As drafts (approve in Xero)</option>
          <option value="authorised">As approved invoices</option>
        </Select>
        <p className="mt-1 text-[12px] text-ink-faint">Only for customers matched to a Xero contact. After that, Xero decides the amounts and payment status.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="sales_account_code">Sales account</Label><Input id="sales_account_code" name="sales_account_code" defaultValue={values.sales_account_code} /></div>
        <div><Label htmlFor="tax_type">Tax type</Label><Input id="tax_type" name="tax_type" defaultValue={values.tax_type} /></div>
        <p className="col-span-2 -mt-1 text-[12px] text-ink-faint">Defaults: 200 (Sales) and OUTPUT (GST on income). Amounts are sent GST-inclusive.</p>
      </div>
      <div className="sm:col-span-2"><Result state={state} /></div>
      <div className="flex justify-end sm:col-span-2"><Button size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save Xero settings"}</Button></div>
    </form>
  );
}

export function CandidateActions({ id, suggestedId, customers, canResolve, mergeLabel = "Merge", separateLabel = "Keep separate" }: {
  id: string; suggestedId: string | null; customers: { id: string; name: string }[]; canResolve: boolean; mergeLabel?: string; separateLabel?: string;
}) {
  const [mState, merge, mPending] = useActionState<ActionState, FormData>(resolveCandidate.bind(null, id, "merge"), undefined);
  const [kState, keep, kPending] = useActionState<ActionState, FormData>(resolveCandidate.bind(null, id, "keep_separate"), undefined);
  const [iState, ignore, iPending] = useActionState<ActionState, FormData>(resolveCandidate.bind(null, id, "ignore"), undefined);
  const state = mState ?? kState ?? iState;
  const busy = mPending || kPending || iPending;
  if (state?.ok) return <Result state={state} />;
  if (!canResolve) return <p className="text-[12px] text-ink-faint">Ask an owner, admin or manager to resolve this.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={merge} className="flex flex-wrap items-center gap-2">
          <select name="customer_id" defaultValue={suggestedId ?? ""} aria-label="Customer to merge with" className={cn(inputClass, "h-8 w-56 py-0 text-[12.5px]")}>
            <option value="">Choose customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button size="sm" variant="primary" disabled={busy}>{mPending ? "Merging…" : mergeLabel}</Button>
        </form>
        <form action={keep}><Button size="sm" variant="secondary" disabled={busy}>{kPending ? "Saving…" : separateLabel}</Button></form>
        <form action={ignore}><Button size="sm" variant="ghost" disabled={busy}>{iPending ? "…" : "Ignore"}</Button></form>
      </div>
      <Result state={state} />
    </div>
  );
}

export function SuggestionForm({ threadId, values }: {
  threadId: string;
  values: { title: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; company: string | null; event_type: string | null; event_date: string | null; guest_count: number | null; budget: number | null; venue: string | null; website: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(createEnquiryFromThread.bind(null, threadId), undefined);
  const [refiling, start] = useTransition();
  const [refiled, setRefiled] = useState<ActionState>();
  if (state?.ok || refiled?.ok) return <Result state={state?.ok ? state : refiled} />;
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Create enquiry from email</Button>
        <select aria-label="File as" disabled={refiling} defaultValue="" className={cn(inputClass, "h-8 w-auto py-0 text-[12.5px]")}
          onChange={(e) => { const v = e.target.value; if (v) start(async () => setRefiled(await refileThread(threadId, v))); }}>
          <option value="">Not an enquiry…</option>
          <option value="general_email">File as general email</option>
          <option value="supplier">File as supplier</option>
          <option value="existing_event">It&apos;s about an existing event</option>
          <option value="spam">Mark as spam</option>
          <option value="dismiss">Dismiss suggestion</option>
        </select>
        {refiled?.error && <FormError message={refiled.error} />}
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-lg border border-line bg-zinc-50/50 p-3 sm:grid-cols-3">
      <input type="hidden" name="source" value={values.website ? "website" : "email"} />
      <div className="sm:col-span-3"><Label htmlFor={`t-${threadId}`}>Title</Label><Input id={`t-${threadId}`} name="title" defaultValue={values.title} required /></div>
      <div><Label>Name</Label><Input name="contact_name" defaultValue={values.contact_name ?? ""} /></div>
      <div><Label>Email</Label><Input name="contact_email" type="email" defaultValue={values.contact_email ?? ""} /></div>
      <div><Label>Phone</Label><Input name="contact_phone" defaultValue={values.contact_phone ?? ""} /></div>
      <div><Label>Company</Label><Input name="company" defaultValue={values.company ?? ""} /></div>
      <div>
        <Label>Event type</Label>
        <Select name="event_type" defaultValue={values.event_type ?? ""}>
          <option value="">—</option>
          {[...new Set([...(values.event_type ? [values.event_type] : []), ...EVENT_TYPES])].map((t) => <option key={t}>{t}</option>)}
        </Select>
      </div>
      <div><Label>Event date</Label><Input name="event_date" type="date" defaultValue={values.event_date ?? ""} /></div>
      <div><Label>Guests</Label><Input name="guest_count" inputMode="numeric" defaultValue={values.guest_count ?? ""} /></div>
      <div><Label>Budget</Label><Input name="budget" inputMode="decimal" defaultValue={values.budget ?? ""} /></div>
      <div><Label>Venue</Label><Input name="venue" defaultValue={values.venue ?? ""} /></div>
      <div className="sm:col-span-3"><Result state={state} /></div>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={pending}>{pending ? "Creating…" : "Create enquiry"}</Button>
      </div>
    </form>
  );
}

export function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-950 p-3 pr-20 text-[11.5px] leading-relaxed text-zinc-100"><code>{text}</code></pre>
      <button type="button" aria-label={label}
        onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11.5px] text-white hover:bg-white/20">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
