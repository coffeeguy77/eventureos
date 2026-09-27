import Link from "next/link";
import { canManage, requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/form";
import { fmtDateTime, relative } from "@/lib/format";
import type { Tone } from "@/lib/status";
import { ActionButton, ActionForm, SubmitButton, Toggle } from "../forms";
import { addStandardRule, saveAutomationSettings, setRuleEnabled } from "../actions";
import { QUOTE_ACCEPTANCE_ACTIONS, STANDARD_RULES, TRIGGER_ORDER, type QuoteAcceptanceAction, type TriggerType } from "../constants";

export const metadata = { title: "Automations" };

type RuleAction = { type: string; params?: Record<string, unknown> };
type Settings = { action: QuoteAcceptanceAction; deposit: number; terms: number; followUp: number; payBefore: boolean; approval: "off" | "short_notice" | "all"; approvalDays: number };

function whenText(trigger: string, s: Settings) {
  switch (trigger) {
    case "enquiry.created": return "a new event enquiry arrives from your website form";
    case "quote.no_reply": return `a quote hasn’t been replied to after ${s.followUp} ${s.followUp === 1 ? "day" : "days"}`;
    case "quote.accepted": return s.approval === "all" ? "a customer accepts a quote and an owner or admin approves the booking"
      : s.approval === "short_notice" ? `a customer accepts a quote (bookings within ${s.approvalDays} ${s.approvalDays === 1 ? "day" : "days"} of the event wait for an owner or admin to approve first)`
      : "a customer accepts a quote";
    case "invoice.paid": return "an invoice becomes paid in Xero";
    default: return trigger.replace(/[._]/g, " ");
  }
}

function actionText(a: RuleAction, s: Settings) {
  switch (a.type) {
    case "assign_round_robin": return "assign it to the team member with the fewest open enquiries";
    case "notify_team": return "notify the team";
    case "flag_follow_up": return "flag the event for follow-up";
    case "create_task": return `create a “${String(a.params?.title ?? "Follow up")}” task for the assigned person`;
    case "set_event_status": return `mark the event ${String(a.params?.status ?? "confirmed")}`;
    case "create_calendar_event": return "add it to the default calendar";
    case "create_invoice":
      return s.action === "deposit_invoice" ? `create a ${s.deposit}% deposit invoice (due in ${s.terms} days${s.payBefore ? ", or now if the event is sooner" : ""})`
        : s.action === "full_invoice" ? `create an invoice for the full amount (due in ${s.terms} days${s.payBefore ? ", or now if the event is sooner" : ""})`
        : "skip invoicing — you raise invoices manually";
    case "notify_assigned": return "notify the assigned team member";
    case "mark_deposit_paid": return "record the payment and mark the deposit paid";
    case "update_portal": return "update the customer portal";
    default: return a.type.replace(/_/g, " ");
  }
}

const OFF_NOTE: Record<string, string> = {
  "enquiry.created": "When off, website enquiries still arrive and notify everyone, but nobody is assigned automatically.",
  "quote.no_reply": "When off, no follow-up tasks are created.",
  "quote.accepted": "When off, the acceptance is recorded and you’re notified — nothing else happens.",
  "invoice.paid": "When off, payments seen in Xero aren’t applied to events automatically.",
};

const RUN_TONE: Record<string, Tone> = { success: "green", error: "red", skipped: "slate", pending: "amber" };

export default async function AutomationsPage() {
  const { supabase, org, role } = await requireOrg();
  const canToggle = canManage(role);
  const canSettings = role === "owner" || role === "admin";

  const [rulesRes, orgRes, intRes, runsRes] = await Promise.all([
    supabase.from("automation_rules").select("id, name, trigger_type, actions, enabled, updated_at").eq("organisation_id", org.id).order("created_at"),
    supabase.from("organisations").select("settings").eq("id", org.id).single(),
    supabase.from("integrations").select("provider, status").eq("organisation_id", org.id),
    supabase
      .from("automation_runs")
      .select("id, status, result, trigger_payload, created_at, rule:automation_rules(name, trigger_type)")
      .eq("organisation_id", org.id)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  if (rulesRes.error) throw new Error(`Could not load automations: ${rulesRes.error.message}`);
  if (orgRes.error) throw new Error(`Could not load settings: ${orgRes.error.message}`);
  if (runsRes.error) throw new Error(`Could not load automation history: ${runsRes.error.message}`);

  const raw = (orgRes.data.settings ?? {}) as Record<string, unknown>;
  const s: Settings = {
    action: (raw.quote_acceptance_action as QuoteAcceptanceAction) in QUOTE_ACCEPTANCE_ACTIONS ? (raw.quote_acceptance_action as QuoteAcceptanceAction) : "deposit_invoice",
    deposit: Number(raw.deposit_percent ?? 30),
    terms: Number(raw.default_payment_terms_days ?? 14),
    followUp: Number(raw.quote_follow_up_days ?? 3),
    payBefore: raw.pay_before_event === true,
    approval: raw.booking_approval === "all" || raw.booking_approval === "short_notice" ? raw.booking_approval : "off",
    approvalDays: Number.isInteger(Number(raw.booking_approval_days)) ? Number(raw.booking_approval_days) : 2,
  };
  const connected = new Set((intRes.data ?? []).filter((i) => i.status === "connected" || i.status === "syncing").map((i) => i.provider));
  const xero = connected.has("xero");
  const gmail = connected.has("gmail");

  const rules = rulesRes.data ?? [];
  const missing = TRIGGER_ORDER.filter((t) => !rules.some((r) => r.trigger_type === t));
  const ordered = [...rules].sort((a, b) => {
    const ia = TRIGGER_ORDER.indexOf(a.trigger_type as TriggerType), ib = TRIGGER_ORDER.indexOf(b.trigger_type as TriggerType);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  function dependency(trigger: string): { tone: "ok" | "warn" | "info"; text: React.ReactNode } | null {
    switch (trigger) {
      case "invoice.paid":
        return xero ? { tone: "ok", text: "Needs Xero — connected." }
          : { tone: "warn", text: <>Needs Xero, which isn’t connected — this rule can’t run yet. <Link href="/settings/integrations" className="underline underline-offset-2">Connect Xero</Link></> };
      case "quote.accepted":
        return xero ? { tone: "ok", text: "Xero is connected, so invoices created here can be sent to Xero." }
          : { tone: "info", text: "Xero isn’t connected — invoices are created in EventureOS only." };
      case "enquiry.created":
        return { tone: "info", text: <>Runs for your <Link href="/settings/website-form" className="underline underline-offset-2">website form</Link>. {gmail ? "Gmail is connected for email enquiries." : "Email enquiries need Gmail, which isn’t connected."}</> };
      case "quote.no_reply":
        return { tone: "info", text: "Checked automatically every 15 minutes." };
      default:
        return null;
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Automations"
          subtitle="Rules that do the routine work for you. Everything they do is written to the activity log."
        />
        {!canToggle && (
          <p className="mx-5 mb-4 rounded-lg bg-zinc-50 px-3 py-2 text-[0.7812rem] text-ink-muted ring-1 ring-inset ring-line">
            Only owners, admins and managers can switch automations on or off.
          </p>
        )}
        {ordered.length === 0 ? (
          <EmptyState title="No automations yet">Add the standard rules below.</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {ordered.map((r) => {
              const acts = (Array.isArray(r.actions) ? r.actions : []) as RuleAction[];
              const dep = dependency(r.trigger_type);
              return (
                <li key={r.id} className="flex gap-3 px-4 py-4 sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words text-[0.8438rem] font-medium text-ink">{r.name}</span>
                      <Badge tone={r.enabled ? "green" : "slate"} dot>{r.enabled ? "On" : "Off"}</Badge>
                    </div>
                    <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink">
                      <span className="mr-1 rounded bg-brand-50 px-1.5 py-0.5 text-[0.6562rem] font-semibold uppercase tracking-wide text-brand-700">When</span>
                      {whenText(r.trigger_type, s)}
                    </p>
                    <div className="mt-1 flex gap-1 text-[0.8125rem] leading-relaxed text-ink">
                      <span className="mr-1 h-fit rounded bg-emerald-50 px-1.5 py-0.5 text-[0.6562rem] font-semibold uppercase tracking-wide text-emerald-700">Then</span>
                      {acts.length ? (
                        <ol className="list-inside list-decimal space-y-0.5 marker:text-ink-faint">
                          {acts.map((a, i) => <li key={i}>{actionText(a, s)}</li>)}
                        </ol>
                      ) : <span className="text-ink-muted">no actions configured</span>}
                    </div>
                    {dep && (
                      <p className={dep.tone === "warn" ? "mt-2 text-[0.75rem] text-amber-800" : dep.tone === "ok" ? "mt-2 text-[0.75rem] text-emerald-700" : "mt-2 text-[0.75rem] text-ink-muted"}>
                        {dep.text}
                      </p>
                    )}
                    {!r.enabled && OFF_NOTE[r.trigger_type] && <p className="mt-1 text-[0.75rem] text-ink-faint">{OFF_NOTE[r.trigger_type]}</p>}
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <Toggle on={r.enabled} action={setRuleEnabled.bind(null, r.id)} label={`Turn ${r.enabled ? "off" : "on"} “${r.name}”`} disabled={!canToggle} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {missing.length > 0 && (
          <div className="border-t border-line px-4 py-4 sm:px-5">
            <div className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-faint">Standard rules you don’t have yet</div>
            <ul className="mt-2 space-y-2">
              {missing.map((t) => (
                <li key={t} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 text-[0.8125rem]">
                    <span className="font-medium text-ink">{STANDARD_RULES[t].name}</span>
                    <span className="text-ink-muted"> — when {whenText(t, s)}</span>
                  </div>
                  {canToggle && (
                    <ActionButton action={addStandardRule.bind(null, t)} size="sm">Add rule</ActionButton>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="When a quote is accepted"
          subtitle="What the “Quote accepted” automation does about invoicing, plus follow-up timing."
        />
        <div className="border-t border-line px-4 py-5 sm:px-5">
          {canSettings ? (
            <ActionForm action={saveAutomationSettings}>
              <fieldset>
                <legend className="mb-2 text-[0.7812rem] font-medium text-ink">On acceptance</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(QUOTE_ACCEPTANCE_ACTIONS) as QuoteAcceptanceAction[]).map((k) => (
                    <label key={k} className="flex cursor-pointer gap-2.5 rounded-lg border border-line p-3 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/60">
                      <input type="radio" name="quote_acceptance_action" value={k} defaultChecked={s.action === k} className="mt-0.5 accent-brand-500" />
                      <span>
                        <span className="block text-[0.8125rem] font-medium text-ink">{QUOTE_ACCEPTANCE_ACTIONS[k].label}</span>
                        <span className="block text-[0.75rem] text-ink-muted">{QUOTE_ACCEPTANCE_ACTIONS[k].hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="deposit_percent" hint="%">Deposit</Label>
                  <Input id="deposit_percent" name="deposit_percent" type="number" min={1} max={100} step="0.5" defaultValue={s.deposit} required />
                </div>
                <div>
                  <Label htmlFor="default_payment_terms_days" hint="days">Payment terms</Label>
                  <Input id="default_payment_terms_days" name="default_payment_terms_days" type="number" min={0} max={120} defaultValue={s.terms} required />
                </div>
                <div>
                  <Label htmlFor="quote_follow_up_days" hint="days">Flag quote follow-up after</Label>
                  <Input id="quote_follow_up_days" name="quote_follow_up_days" type="number" min={1} max={60} defaultValue={s.followUp} required />
                </div>
              </div>
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/60">
                <input type="checkbox" name="pay_before_event" defaultChecked={s.payBefore} className="mt-0.5 h-4 w-4 rounded border-line-strong text-brand-600" />
                <span>
                  <span className="block text-[0.8125rem] font-medium text-ink">Payment required before the event</span>
                  <span className="block text-[0.75rem] text-ink-muted">
                    If the event is sooner than the payment terms, the invoice is due immediately — to lock in the date and secure the equipment and staff.
                    E.g. 7-day terms and an event in 2 days: due today. Also the default on the New invoice screen.
                  </span>
                </span>
              </label>

              <fieldset className="mt-6">
                <legend className="mb-1 text-[0.7812rem] font-medium text-ink">Booking approval</legend>
                <p className="mb-2 text-[0.75rem] text-ink-muted">
                  A held booking isn’t confirmed: no calendar entry, no invoice, and the customer sees “waiting for us to confirm”.
                  Owners and admins get a notification and an email, and approve it on the event page.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    ["off", "No approval", "Accepting a quote confirms the booking straight away."],
                    ["short_notice", "Short-notice bookings", "Hold bookings for events within the days below."],
                    ["all", "Every booking", "No booking is confirmed until an owner or admin approves it."],
                  ] as const).map(([k, label, hint]) => (
                    <label key={k} className="flex cursor-pointer gap-2.5 rounded-lg border border-line p-3 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/60">
                      <input type="radio" name="booking_approval" value={k} defaultChecked={s.approval === k} className="mt-0.5 accent-brand-500" />
                      <span>
                        <span className="block text-[0.8125rem] font-medium text-ink">{label}</span>
                        <span className="block text-[0.75rem] text-ink-muted">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 max-w-[16rem]">
                  <Label htmlFor="booking_approval_days" hint="days">Short notice means the event is within</Label>
                  <Input id="booking_approval_days" name="booking_approval_days" type="number" min={0} max={60} defaultValue={s.approvalDays} required />
                  <p className="mt-1 text-[0.7188rem] text-ink-faint">0 = same day only · 1 = today or tomorrow · 2 = up to the day after tomorrow</p>
                </div>
              </fieldset>
              <div className="mt-6 flex justify-end">
                <SubmitButton pendingLabel="Saving…" className="w-full sm:w-auto">Save settings</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <div className="space-y-1.5 text-[0.8125rem] text-ink">
              <p><span className="text-ink-muted">On acceptance:</span> {QUOTE_ACCEPTANCE_ACTIONS[s.action].label}</p>
              <p><span className="text-ink-muted">Deposit:</span> {s.deposit}% · <span className="text-ink-muted">Payment terms:</span> {s.terms} days{s.payBefore ? " (or now if the event is sooner)" : ""} · <span className="text-ink-muted">Follow-up after:</span> {s.followUp} days</p>
              <p><span className="text-ink-muted">Booking approval:</span> {s.approval === "all" ? "every booking" : s.approval === "short_notice" ? `events within ${s.approvalDays} days` : "off"}</p>
              <p className="pt-1 text-[0.75rem] text-ink-faint">Only owners and admins can change these.</p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent automation runs" subtitle="The last 25 times an automation did something." />
        {(runsRes.data ?? []).length === 0 ? (
          <EmptyState title="Nothing has run yet">Runs appear here when a quote is accepted or a follow-up is flagged.</EmptyState>
        ) : (
          <>
          <ul className="divide-y divide-line border-t border-line md:hidden">
            {(runsRes.data ?? []).map((run) => {
              const rule = run.rule as unknown as { name: string } | null;
              const result = (run.result ?? {}) as Record<string, unknown>;
              const payload = (run.trigger_payload ?? {}) as Record<string, unknown>;
              const done = Array.isArray(result.actions) ? (result.actions as string[]).map((a) => a.replace(/_/g, " ")).join(", ") : result.task_id ? "follow-up task created" : result.error ? String(result.error) : "—";
              const eventId = typeof payload.event_id === "string" ? payload.event_id : null;
              return (
                <li key={run.id} className="flex min-h-[56px] items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.8438rem] font-medium text-ink">{rule?.name ?? "Deleted rule"}</div>
                    <div className="break-words text-[0.7812rem] text-ink-muted">
                      {done}
                      {eventId && <> · <Link href={`/events/${eventId}`} className="text-brand-600 hover:text-brand-700">event</Link></>}
                    </div>
                    <div className="mt-0.5 text-[0.75rem] text-ink-faint">{relative(run.created_at)}</div>
                  </div>
                  <Badge tone={RUN_TONE[run.status] ?? "neutral"} className="shrink-0">{run.status}</Badge>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto border-t border-line md:block">
            <table className="w-full min-w-[560px] text-[0.8125rem]">
              <thead>
                <tr className="text-left text-[0.7188rem] uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2.5 font-medium">When</th>
                  <th className="px-3 py-2.5 font-medium">Rule</th>
                  <th className="px-3 py-2.5 font-medium">Result</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(runsRes.data ?? []).map((run) => {
                  const rule = run.rule as unknown as { name: string } | null;
                  const result = (run.result ?? {}) as Record<string, unknown>;
                  const payload = (run.trigger_payload ?? {}) as Record<string, unknown>;
                  const done = Array.isArray(result.actions) ? (result.actions as string[]).map((a) => a.replace(/_/g, " ")).join(", ") : result.task_id ? "follow-up task created" : result.error ? String(result.error) : "—";
                  const eventId = typeof payload.event_id === "string" ? payload.event_id : null;
                  return (
                    <tr key={run.id}>
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink-muted" title={fmtDateTime(run.created_at, org.timezone)}>{relative(run.created_at)}</td>
                      <td className="px-3 py-2.5 text-ink">{rule?.name ?? "Deleted rule"}</td>
                      <td className="px-3 py-2.5 text-ink-muted">
                        {done}
                        {eventId && <> · <Link href={`/events/${eventId}`} className="text-brand-600 hover:text-brand-700">event</Link></>}
                      </td>
                      <td className="px-5 py-2.5"><Badge tone={RUN_TONE[run.status] ?? "neutral"}>{run.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </>
  );
}
