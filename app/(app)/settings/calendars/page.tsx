import Link from "next/link";
import { canManage, requireOrg } from "@/lib/context";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/form";
import { relative } from "@/lib/format";
import { ActionButton, ActionForm, SubmitButton, Toggle } from "../forms";
import { addCalendar, deleteCalendar, setCalendarSync, setDefaultCalendar, updateCalendar } from "../actions";

export const metadata = { title: "Calendars & resources" };

const PROVIDER: Record<string, string> = { local: "EventureOS", google: "Google Calendar", microsoft: "Microsoft" };

export default async function CalendarsPage() {
  const { supabase, org, role } = await requireOrg();
  const canEdit = canManage(role);

  const [calsRes, googleRes, countsRes] = await Promise.all([
    supabase
      .from("calendar_connections")
      .select("id, name, colour, provider, is_default, sync_enabled, external_calendar_id, created_at")
      .eq("organisation_id", org.id)
      .order("is_default", { ascending: false })
      .order("created_at"),
    supabase
      .from("integrations")
      .select("status, account_label, last_sync_at, last_error")
      .eq("organisation_id", org.id)
      .eq("provider", "google_calendar")
      .maybeSingle(),
    supabase.from("calendar_events").select("calendar_connection_id").eq("organisation_id", org.id).gte("ends_at", new Date().toISOString()),
  ]);
  if (calsRes.error) throw new Error(`Could not load calendars: ${calsRes.error.message}`);
  const cals = calsRes.data ?? [];
  const google = googleRes.data;
  const googleConnected = google?.status === "connected" || google?.status === "syncing";
  const upcoming = new Map<string, number>();
  for (const r of countsRes.data ?? []) upcoming.set(r.calendar_connection_id, (upcoming.get(r.calendar_connection_id) ?? 0) + 1);

  return (
    <>
      <Card>
        <CardHeader
          title="Calendars & resources"
          subtitle="One calendar per thing that can be double-booked — a cart, a bar, a van, a team. New confirmed events go on the default calendar."
        />
        <div className={googleConnected ? "mx-5 mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800 ring-1 ring-inset ring-emerald-100"
          : "mx-5 mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 ring-1 ring-inset ring-amber-100"}>
          {googleConnected ? (
            <>Google Calendar is connected{google?.account_label ? ` (${google.account_label})` : ""}
              {google?.last_sync_at ? ` · last sync ${relative(google.last_sync_at)}` : " · not synced yet"}. Calendars with sync on are pushed to Google.</>
          ) : (
            <>Google Calendar isn’t connected, so sync switches are saved but <strong>nothing is sent to Google yet</strong>.{" "}
              <Link href="/settings/integrations" className="font-medium underline underline-offset-2">Connect Google Calendar</Link> to start syncing.</>
          )}
        </div>
        {!canEdit && (
          <p className="mx-5 mb-4 rounded-lg bg-zinc-50 px-3 py-2 text-[12.5px] text-ink-muted ring-1 ring-inset ring-line">
            Only owners, admins and managers can change calendars.
          </p>
        )}
        {cals.length === 0 ? (
          <EmptyState title="No calendars yet">Add one below — confirmed events need a calendar to appear on.</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {cals.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  {canEdit ? (
                    <ActionForm action={updateCalendar} showOk={false}>
                      <input type="hidden" name="id" value={c.id} />
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="color" name="colour" defaultValue={c.colour} aria-label={`Colour for ${c.name}`}
                          className="h-10 w-11 shrink-0 cursor-pointer rounded-md border border-line-strong bg-white p-0.5 sm:h-8 sm:w-10" />
                        <Input name="name" defaultValue={c.name} aria-label="Calendar name" maxLength={80} required className="h-10 min-w-0 flex-1 py-1 sm:h-8 sm:w-full sm:max-w-[240px] sm:flex-none" />
                        <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…" className="h-10 sm:h-8">Save</SubmitButton>
                      </div>
                    </ActionForm>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: c.colour }} />
                      <span className="min-w-0 truncate text-[13.5px] font-medium text-ink">{c.name}</span>
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                    <Badge tone="neutral">{PROVIDER[c.provider] ?? c.provider}</Badge>
                    {c.is_default && <Badge tone="brand">Default</Badge>}
                    <span>{upcoming.get(c.id) ?? 0} upcoming {upcoming.get(c.id) === 1 ? "entry" : "entries"}</span>
                    {c.external_calendar_id && <span className="min-w-0 max-w-full truncate font-mono text-[11px] text-ink-faint">{c.external_calendar_id}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  <label className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                    <Toggle on={c.sync_enabled} action={setCalendarSync.bind(null, c.id)} label={`Google sync for ${c.name}`} disabled={!canEdit} />
                    Google sync{c.sync_enabled && !googleConnected && <span className="text-amber-700">(waiting for connection)</span>}
                  </label>
                  {canEdit && !c.is_default && (
                    <ActionButton action={setDefaultCalendar.bind(null, c.id)} variant="ghost">Make default</ActionButton>
                  )}
                  {canEdit && !c.is_default && (
                    <ActionButton action={deleteCalendar.bind(null, c.id)} variant="danger" confirm={`Delete the calendar "${c.name}"?`}>
                      Delete
                    </ActionButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canEdit && (
        <Card>
          <CardHeader title="Add a calendar" subtitle="e.g. “Cart 2”, “Bar trailer”, “Site visits”." />
          <div className="border-t border-line px-4 py-5 sm:px-5">
            <ActionForm action={addCalendar} resetOnOk>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="new_cal_colour">Colour</Label>
                  <input id="new_cal_colour" type="color" name="colour" defaultValue="#0EA5E9"
                    className="h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-white p-1 sm:h-9" />
                </div>
                <div className="min-w-0 flex-1 sm:min-w-[200px]">
                  <Label htmlFor="new_cal_name">Name</Label>
                  <Input id="new_cal_name" name="name" required maxLength={80} placeholder="Cart 2" />
                </div>
                <SubmitButton pendingLabel="Adding…" className="w-full sm:w-auto">Add calendar</SubmitButton>
              </div>
            </ActionForm>
          </div>
        </Card>
      )}
    </>
  );
}
