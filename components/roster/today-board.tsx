"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, MessageSquare, Phone } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Board } from "@/lib/roster/today";
import { wageColour } from "./wage-gauge";

type Res = { ok: boolean; message?: string; error?: string };
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/**
 * Today at a glance (office Roster page and the staff app's Today): wages vs sales, who's on / on a break / late, with
 * Call and "Running late?" text buttons (after an automatic text, the button counts down before it can be sent again),
 * checklists, documents expiring. Refreshes itself every minute.
 */
export function TodayBoard({ board, onText, tz }: { board: Board; onText?: (shiftId: string) => Promise<Res>; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); const r = setInterval(() => router.refresh(), 60_000); return () => { clearInterval(t); clearInterval(r); }; }, [router]);
  const mins = (iso: string | null) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000)) : 0);
  const t = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const pct = board.sales && board.sales > 0 ? Math.round((board.wages.cost / board.sales) * 100) : null;
  const text = (id: string) => onText && start(async () => {
    const r: Res = await onText(id).catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    setMsg(r.ok ? { ok: true, text: r.message ?? "Sent." } : { ok: false, text: r.error ?? "Not sent." });
    router.refresh();
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-canvas px-2 py-2 ring-1 ring-line"><p className="text-[0.6875rem] uppercase tracking-wide text-ink-faint">Wages today</p><p className="text-[1.0625rem] font-bold text-ink">{money(board.wages.cost)}</p><p className="text-[0.6875rem] text-ink-faint">{board.wages.hours} h rostered</p></div>
        <div className="rounded-xl bg-canvas px-2 py-2 ring-1 ring-line"><p className="text-[0.6875rem] uppercase tracking-wide text-ink-faint">Sales so far</p><p className="text-[1.0625rem] font-bold text-ink">{board.sales == null ? "—" : money(board.sales)}</p><p className="text-[0.6875rem] text-ink-faint">Square</p></div>
        <div className="rounded-xl bg-canvas px-2 py-2 ring-1 ring-line"><p className="text-[0.6875rem] uppercase tracking-wide text-ink-faint">Wages %</p>
          <p className="text-[1.0625rem] font-bold" style={{ color: wageColour(pct, board.target.good, board.target.bad) }}>{pct == null ? "—" : `${pct}%`}</p>
          <span className="mx-auto mt-1 block h-1.5 w-full max-w-[6rem] rounded-full" style={{ background: `linear-gradient(90deg, #16a34a ${(board.target.good / (board.target.bad + 20)) * 100}%, #f59e0b, #dc2626 ${(board.target.bad / (board.target.bad + 20)) * 100}%)` }} /></div>
      </div>
      {board.salesNote && <p className="text-[0.7188rem] text-ink-faint">{board.salesNote}</p>}

      {board.rows.length === 0 ? <p className="rounded-xl bg-canvas px-3 py-3 text-[0.8125rem] text-ink-muted ring-1 ring-line">Nobody is rostered today.</p> : (
        <ul className="space-y-2">
          {board.rows.map((r, i) => {
            const b = mins(r.breakSince);
            const wait = r.resendAt ? Math.max(0, Math.ceil((Date.parse(r.resendAt) - now) / 1000)) : 0;
            const late = r.state === "late";
            return (
              <li key={i} className={cn("rounded-xl bg-canvas px-3 py-2.5 ring-1", late ? "ring-rose-300" : "ring-line")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-semibold text-ink">{r.name}</span>
                    <span className="block text-[0.7188rem] text-ink-muted">{r.shift ?? "Not rostered"}</span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.7188rem] font-semibold",
                    r.state === "on" && "bg-emerald-100 text-emerald-800",
                    r.state === "break" && (b >= board.breakMax ? "bg-rose-100 text-rose-800" : b >= board.breakMin ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"),
                    late && "bg-rose-100 text-rose-800", r.state === "unrostered" && "bg-sky-100 text-sky-800",
                    (r.state === "due" || r.state === "done") && "bg-zinc-100 text-ink-muted")}>
                    {r.state === "on" ? `On since ${t(r.since!)}` : r.state === "break" ? `Break · ${b} min` : late ? `Late · ${mins(r.start)} min` : r.state === "done" ? "Done" : r.state === "unrostered" ? `On since ${t(r.since!)}` : "Later today"}
                  </span>
                </div>
                {(late || r.alert) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {r.phone && <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface px-3 text-[0.8125rem] font-semibold text-ink ring-1 ring-line-strong"><Phone className="h-4 w-4" />Call</a>}
                    {onText && r.shiftId && r.phone && late && (
                      <button disabled={pending || wait > 0} onClick={() => text(r.shiftId!)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface px-3 text-[0.8125rem] font-semibold text-ink ring-1 ring-line-strong disabled:opacity-60">
                        <MessageSquare className="h-4 w-4" />{wait > 0 ? `Text again in ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, "0")}` : r.alert ? "Text again" : "Text: running late?"}
                      </button>
                    )}
                    {!r.phone && late && <span className="text-[0.7188rem] text-ink-faint">No mobile number on file</span>}
                    {r.alert && <span className={cn("text-[0.7188rem]", r.alert.ok ? "text-ink-muted" : "text-rose-700")}>{r.alert.ok ? "Texted" : "Text failed"} {t(r.alert.at)}{r.alert.by === "auto" ? " (automatic)" : ` by ${r.alert.by}`}{r.alert.error ? ` — ${r.alert.error}` : ""}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p className={cn("text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}

      {board.checklists.length > 0 && (
        <div className="space-y-2">
          {board.checklists.map((c) => {
            const done = c.items.filter((x) => x.done).length;
            return (
              <details key={c.id} className="rounded-xl bg-canvas px-3 py-2 ring-1 ring-line">
                <summary className="flex cursor-pointer items-center gap-2 text-[0.8125rem]">
                  {done === c.items.length ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-ink-faint" />}
                  <b className="flex-1 text-ink">{c.name}</b><span className="text-ink-muted">{done}/{c.items.length}{c.dueBy ? ` · by ${c.dueBy}` : ""}</span>
                </summary>
                <ul className="mt-2 space-y-1 text-[0.8125rem]">
                  {c.items.map((x, i) => <li key={i} className={cn("flex gap-2", x.done ? "text-ink-muted" : "text-ink")}>{x.done ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />}<span>{x.text}{x.by ? <span className="text-ink-faint"> — {x.by}</span> : null}</span></li>)}
                </ul>
              </details>
            );
          })}
        </div>
      )}
      {board.expiring.length > 0 && (
        <div className="rounded-xl bg-canvas px-3 py-2 text-[0.8125rem] ring-1 ring-line">
          <p className="mb-1 font-semibold text-ink">Documents to renew</p>
          {board.expiring.map((x, i) => <p key={i} className={x.expired ? "text-rose-700" : "text-orange-700"}>{x.name} — {x.qual} {x.expired ? "expired" : "expires"} {x.expires}</p>)}
        </div>
      )}
    </div>
  );
}
