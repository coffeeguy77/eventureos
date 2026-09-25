"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, ArrowUpRight, CalendarClock, MapPin, RefreshCw } from "lucide-react";
import { deleteCalendarEntry, moveCalendarEntry } from "@/app/(app)/calendar/actions";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError, Select } from "@/components/ui/form";
import { Drawer } from "./drawer";
import { FALLBACK_COLOUR } from "./entry-chip";
import { KIND_LABEL, type Entry, type Resource } from "./model";
import type { GoogleStatus } from "./calendar-shell";

export function syncText(entry: Entry, res: Resource | undefined, google: GoogleStatus): { label: string; tone: "neutral" | "amber" | "green" | "red"; note: string } {
  switch (entry.syncStatus) {
    case "synced":
      return { label: "Synced", tone: "green", note: `In Google Calendar${entry.lastSyncedAt ? ` · last synced ${entry.lastSyncedAt}` : ""}.` };
    case "pending":
      return google.connected
        ? { label: "Waiting to sync", tone: "amber", note: `Queued for ${res?.name ?? "its"} Google calendar.` }
        : { label: "Not synced", tone: "amber", note: "Marked to sync, but Google Calendar isn’t connected — nothing has been sent to Google yet." };
    case "error":
      return { label: "Sync failed", tone: "red", note: google.error ?? "The last attempt to send this to Google failed." };
    default:
      return {
        label: "EventureOS only", tone: "neutral",
        note: res?.provider === "google"
          ? `${res.name} has sync switched off, so this stays in EventureOS.`
          : `${res?.name ?? "This resource"} is a local calendar — entries stay in EventureOS.`,
      };
  }
}

export function EntryPanel({ entry, entries, resources, google, canManage, onClose, onOpen }: {
  entry: Entry; entries: Map<string, Entry>; resources: Resource[]; google: GoogleStatus; canManage: boolean;
  onClose: () => void; onOpen: (id: string) => void;
}) {
  const res = resources.find((r) => r.id === entry.resourceId);
  const [target, setTarget] = useState(entry.resourceId);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | undefined>();
  const [pending, start] = useTransition();
  const sync = syncText(entry, res, google);
  const others = entry.conflictsWith.map((id) => entries.get(id)).filter((x): x is Entry => !!x);

  const move = () => start(async () => { setMsg(await moveCalendarEntry(entry.id, target)); });
  const remove = () => start(async () => {
    const r = await deleteCalendarEntry(entry.id);
    if (r?.error) { setMsg(r); setConfirming(false); } else onClose();
  });

  return (
    <Drawer onClose={onClose} accent={res?.colour ?? FALLBACK_COLOUR} title={
      <>
        <div className="flex items-center gap-2 text-[12px] text-ink-muted">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: res?.colour ?? FALLBACK_COLOUR }} />
          {res?.name ?? "Unknown resource"}
          <span className="text-ink-faint">·</span>
          {KIND_LABEL[entry.kind]}
        </div>
        <h2 className="mt-1 text-[16px] font-semibold leading-snug text-ink">{entry.title}</h2>
      </>
    }>
      <div className="space-y-5 px-5 py-4">
        {others.length > 0 && (
          <div className="rounded-lg bg-rose-50 p-3 ring-1 ring-inset ring-rose-200">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-rose-800">
              <AlertTriangle className="h-4 w-4" /> Double-booked on {res?.name}
            </p>
            <p className="mt-0.5 text-[12px] text-rose-800/80">Overlaps with:</p>
            <ul className="mt-1.5 space-y-1">
              {others.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => onOpen(o.id)} className="w-full rounded-md bg-white/70 px-2 py-1.5 text-left text-[12.5px] hover:bg-white">
                    <span className="block font-medium text-ink">{o.title}</span>
                    <span className="block text-ink-muted">{o.dateLabel} · {o.timeLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
            {canManage && <p className="mt-2 text-[12px] text-rose-800/80">Move one of them to another resource below, or delete it.</p>}
          </div>
        )}

        <dl className="space-y-3 text-[13px]">
          <div className="flex gap-3">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
            <div><dt className="sr-only">When</dt><dd className="text-ink">{entry.dateLabel}</dd><dd className="text-ink-muted">{entry.timeLabel}</dd></div>
          </div>
          {entry.location && (
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
              <div><dt className="sr-only">Location</dt><dd className="text-ink">{entry.location}</dd></div>
            </div>
          )}
          <div className="flex gap-3">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
            <div>
              <dt className="sr-only">Sync</dt>
              <dd><Badge tone={sync.tone}>{sync.label}</Badge></dd>
              <dd className="mt-1 text-[12px] text-ink-muted">{sync.note}</dd>
              {entry.externalEventId && <dd className="mt-0.5 break-all text-[11.5px] text-ink-faint">Google event ID {entry.externalEventId}</dd>}
            </div>
          </div>
        </dl>

        {entry.eventId && (
          <div className="rounded-lg border border-line p-3">
            <p className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">Event</p>
            <Link href={`/events/${entry.eventId}`} className="mt-1 flex items-center justify-between gap-2 text-[13.5px] font-medium text-ink hover:text-brand-700">
              <span className="truncate">{entry.eventNumber ? `EV-${entry.eventNumber} · ` : ""}{entry.eventName}</span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint" />
            </Link>
            {entry.customerName && <p className="text-[12.5px] text-ink-muted">{entry.customerName}</p>}
          </div>
        )}

        {canManage ? (
          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-[12.5px] font-medium text-ink">Calendar</p>
            <p className="text-[12px] text-ink-muted">The resource an entry sits on decides which Google calendar it syncs to.</p>
            <div className="flex gap-2">
              <Select aria-label="Move to resource" value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 py-0 text-[13px]">
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.provider === "google" ? (r.syncEnabled ? " · Google sync" : " · Google (sync off)") : " · local"}</option>
                ))}
              </Select>
              <Button size="md" onClick={move} disabled={pending || target === entry.resourceId}>Move</Button>
            </div>
          </div>
        ) : (
          <p className="border-t border-line pt-4 text-[12px] text-ink-muted">Only owners, admins and managers can move or delete calendar entries.</p>
        )}

        <FormError message={msg?.error} />
        {msg?.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800 ring-1 ring-inset ring-emerald-100">{msg.ok}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          {entry.eventId ? <ButtonLink href={`/events/${entry.eventId}?tab=schedule`} size="sm">Open event schedule</ButtonLink> : <span />}
          {canManage && (confirming ? (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-2 py-1.5 ring-1 ring-inset ring-rose-100">
              <span className="text-[12.5px] text-rose-800">Delete this entry?</span>
              <Button size="sm" variant="danger" onClick={remove} disabled={pending}>{pending ? "Deleting…" : "Delete"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>Keep</Button>
            </div>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>Delete entry</Button>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
