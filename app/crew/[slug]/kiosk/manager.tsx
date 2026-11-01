"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Delete, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { kioskManagerRemove, kioskManagerSave, kioskManagerStart, kioskManagerVerify, kioskManagerWeek, kioskManagers, type MgrShift } from "./manager-actions";
import { Sheet } from "./sheet";

const fmt = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const field = "h-12 w-full rounded-xl border border-line-strong bg-surface px-3 text-[1rem] text-ink";
const IDLE_MS = 5 * 60_000;

/**
 * Manager access on the café iPad: choose who you are → PIN → the code texted to your phone → the roster from today
 * for a week (no pay): change times or who's on, add a shift, delete one, or mark someone sick. Locks after 5 minutes idle.
 */
export function ManagerAccess({ slug, token, onClose }: { slug: string; token: string; onClose: () => void }) {
  const [step, setStep] = useState<"who" | "pin" | "code" | "roster">("who");
  const [managers, setManagers] = useState<{ id: string; name: string }[] | null>(null);
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [digits, setDigits] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [pass, setPass] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(Date.now());

  useEffect(() => { void kioskManagers(slug, token).then((r) => (r.ok ? setManagers(r.people) : setError(r.error))); }, [slug, token]);
  // locks itself when left alone
  useEffect(() => { const t = setInterval(() => { if (Date.now() - last.current > IDLE_MS) onClose(); }, 5000); return () => clearInterval(t); }, [onClose]);
  const touch = () => { last.current = Date.now(); };

  const need = step === "code" ? 6 : 4;
  const submit = async (d: string) => {
    if (!who) return;
    setBusy(true); setError(null);
    if (step === "pin") {
      const r = await kioskManagerStart(slug, token, who.id, d).catch(() => ({ ok: false as const, error: "No connection." }));
      if (r.ok) { setSentTo(r.to); setStep("code"); } else setError(r.error);
    } else {
      const r = await kioskManagerVerify(slug, token, who.id, d).catch(() => ({ ok: false as const, error: "No connection." }));
      if (r.ok) { setPass(r.pass); setStep("roster"); } else setError(r.error);
    }
    setDigits(""); setBusy(false);
  };
  const press = (k: string) => {
    touch();
    if (busy) return;
    const next = k === "del" ? digits.slice(0, -1) : (digits + k).slice(0, need);
    setDigits(next);
    if (next.length === need) void submit(next);
  };

  if (step === "roster" && pass && who) return <ManagerRoster slug={slug} token={token} pass={pass} name={who.name} onClose={onClose} touch={touch} />;
  return (
    <Sheet title="Manager access" onClose={onClose}>
      <div className="mx-auto max-w-sm" onPointerDown={touch}>
        {step === "who" && (
          <>
            <p className="mb-3 text-[1.0625rem] text-ink-muted">Who are you?</p>
            {!managers && !error && <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />}
            {managers?.length === 0 && <p className="text-ink-muted">No managers are set up. In the office: Roster → Setup → Team → Staff details → tick &ldquo;Manager — sees Today&rdquo;.</p>}
            <div className="grid gap-2">{managers?.map((m) => <button key={m.id} onClick={() => { setWho(m); setStep("pin"); setDigits(""); setError(null); }} className="h-14 rounded-2xl bg-canvas text-[1.125rem] font-semibold text-ink ring-1 ring-line">{m.name}</button>)}</div>
          </>
        )}
        {(step === "pin" || step === "code") && who && (
          <>
            <p className="text-center text-[1.375rem] font-bold text-ink">{who.name.split(" ")[0]}</p>
            <p className="text-center text-[1rem] text-ink-muted">{step === "pin" ? "Enter your PIN" : `Enter the 6-digit code we texted to ${sentTo}`}</p>
            <div className="my-4 flex justify-center gap-3">{Array.from({ length: need }).map((_, i) => <span key={i} className={cn("h-4 w-4 rounded-full ring-2", i < digits.length ? "bg-ink ring-ink" : "ring-ink-faint")} />)}</div>
            <div className="grid grid-cols-3 gap-2.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} onClick={() => press(d)} className="h-16 rounded-2xl bg-canvas text-[1.5rem] font-semibold text-ink ring-1 ring-line">{d}</button>)}
              <button onClick={() => { setStep("who"); setDigits(""); setError(null); }} className="h-16 rounded-2xl text-[0.9375rem] text-ink-muted">Back</button>
              <button onClick={() => press("0")} className="h-16 rounded-2xl bg-canvas text-[1.5rem] font-semibold text-ink ring-1 ring-line">0</button>
              <button onClick={() => press("del")} className="flex h-16 items-center justify-center rounded-2xl bg-canvas text-ink-muted ring-1 ring-line" aria-label="Delete"><Delete className="h-6 w-6" /></button>
            </div>
            {busy && <p className="mt-3 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-ink-muted" /></p>}
          </>
        )}
        {error && <p className="mt-3 text-center text-[1rem] font-medium text-rose-600">{error}</p>}
      </div>
    </Sheet>
  );
}

type Draft = { id: string | null; date: string; start: string; finish: string; memberId: string | null; areaId: string | null; notes: string; text: boolean };

function ManagerRoster({ slug, token, pass, name, onClose, touch }: { slug: string; token: string; pass: string; name: string; onClose: () => void; touch: () => void }) {
  const [data, setData] = useState<{ shifts: MgrShift[]; people: { id: string; name: string; phone: boolean }[]; areas: { id: string; name: string }[]; today: string } | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await kioskManagerWeek(slug, token, pass).catch(() => ({ ok: false as const, error: "No connection." }));
    if (r.ok) { setData(r); setDay((d) => d ?? r.today); } else setMsg({ ok: false, text: r.error });
  }, [slug, token, pass]);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) => {
    touch(); setBusy(true);
    const r = await fn().catch(() => ({ ok: false as const, error: "No connection." }));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    if (r.ok) { setDraft(null); await load(); }
  };
  const days = data ? Array.from({ length: 7 }, (_, i) => addDays(data.today, i)) : [];
  const list = data?.shifts.filter((s) => s.date === day) ?? [];
  return (
    <Sheet title={`Roster — ${name.split(" ")[0]}`} onClose={onClose}>
      <div onPointerDown={touch}>
        <p className="-mt-2 mb-3 text-[0.875rem] text-ink-faint">Changes go live in the staff app straight away. Locks after 5 minutes without a tap.</p>
        {!data && <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />}
        {data && (
          <>
            <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
              {days.map((d) => <button key={d} onClick={() => { setDay(d); setDraft(null); }} className={cn("whitespace-nowrap rounded-full px-4 py-2 text-[0.9375rem] font-semibold ring-1", d === day ? "bg-[var(--crew-brand)] text-white ring-transparent" : "bg-canvas text-ink ring-line")}>{d === data.today ? "Today" : dayLabel(d)}</button>)}
            </div>
            <ul className="space-y-2">
              {list.map((s) => (
                <li key={s.id}>
                  <button onClick={() => { touch(); setDraft({ id: s.id, date: s.date, start: s.start, finish: s.finish, memberId: s.memberId, areaId: s.areaId, notes: s.notes ?? "", text: true }); }}
                    className={cn("flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left ring-1", draft?.id === s.id ? "bg-surface ring-2 ring-[var(--crew-brand)]" : "bg-canvas ring-line")}>
                    <span className="min-w-0"><span className={cn("block truncate text-[1.0625rem] font-semibold", s.name ? "text-ink" : "text-amber-600")}>{s.name ?? "Open shift — nobody yet"}</span>{s.area && <span className="block text-[0.875rem] text-ink-muted">{s.area}</span>}</span>
                    <span className="shrink-0 text-[1rem] tabular-nums text-ink">{fmt(s.start)} – {fmt(s.finish)}</span>
                  </button>
                  {draft?.id === s.id && <ShiftForm draft={draft} setDraft={setDraft} data={data} busy={busy}
                    onSave={() => run(() => kioskManagerSave(slug, token, pass, draft))}
                    onSick={s.memberId ? () => run(() => kioskManagerRemove(slug, token, pass, s.id, "sick", false)) : undefined}
                    onDelete={() => run(() => kioskManagerRemove(slug, token, pass, s.id, "delete", draft.text))} />}
                </li>
              ))}
              {list.length === 0 && <li className="text-ink-muted">No shifts on this day.</li>}
            </ul>
            {draft && !draft.id ? <ShiftForm draft={draft} setDraft={setDraft} data={data} busy={busy} onSave={() => run(() => kioskManagerSave(slug, token, pass, draft))} />
              : <button onClick={() => { touch(); setDraft({ id: null, date: day ?? data.today, start: "07:00", finish: "15:00", memberId: null, areaId: data.areas[0]?.id ?? null, notes: "", text: true }); }} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[1.0625rem] font-semibold text-surface"><Plus className="h-5 w-5" />Add a shift</button>}
          </>
        )}
        {msg && <p className={cn("mt-3 text-[1rem] font-medium", msg.ok ? "text-emerald-600" : "text-rose-600")}>{msg.text}</p>}
      </div>
    </Sheet>
  );
}

function ShiftForm({ draft, setDraft, data, busy, onSave, onSick, onDelete }: {
  draft: Draft; setDraft: (d: Draft | null) => void; data: { people: { id: string; name: string; phone: boolean }[]; areas: { id: string; name: string }[] }; busy: boolean;
  onSave: () => void; onSick?: () => void; onDelete?: () => void;
}) {
  const [sure, setSure] = useState(false);
  const who = data.people.find((p) => p.id === draft.memberId);
  return (
    <div className="mt-2 space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[0.875rem] text-ink-muted">Who<select value={draft.memberId ?? ""} onChange={(e) => setDraft({ ...draft, memberId: e.target.value || null })} className={field}><option value="">Open shift — anyone can take it</option>{data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-[0.875rem] text-ink-muted">Area<select value={draft.areaId ?? ""} onChange={(e) => setDraft({ ...draft, areaId: e.target.value || null })} className={field}><option value="">—</option>{data.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="text-[0.875rem] text-ink-muted">Start<input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} className={field} /></label>
        <label className="text-[0.875rem] text-ink-muted">Finish<input type="time" value={draft.finish} onChange={(e) => setDraft({ ...draft, finish: e.target.value })} className={field} /></label>
      </div>
      <label className="block text-[0.875rem] text-ink-muted">Note for the shift (shows when they clock on)<textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[1rem] text-ink" /></label>
      {who && <label className="flex items-center gap-2 text-[1rem] text-ink"><input type="checkbox" className="h-5 w-5" checked={draft.text} disabled={!who.phone} onChange={(e) => setDraft({ ...draft, text: e.target.checked })} />Text {who.name.split(" ")[0]} about this{!who.phone ? " (no mobile on file)" : ""}</label>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={onSave} className="h-12 flex-1 rounded-xl bg-[var(--crew-brand)] px-5 text-[1rem] font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : draft.id ? "Save changes" : "Add shift"}</button>
        {onSick && <button disabled={busy} onClick={onSick} className="h-12 rounded-xl bg-amber-500 px-4 text-[1rem] font-semibold text-white disabled:opacity-50">Called in sick</button>}
        {onDelete && (!sure ? <button onClick={() => setSure(true)} className="h-12 rounded-xl px-4 text-[1rem] font-medium text-rose-600 ring-1 ring-line">Delete</button>
          : <button disabled={busy} onClick={onDelete} className="h-12 rounded-xl bg-rose-600 px-4 text-[1rem] font-semibold text-white">Yes, delete</button>)}
        <button onClick={() => setDraft(null)} className="h-12 rounded-xl px-4 text-[1rem] text-ink-muted">Cancel</button>
      </div>
      {onSick && <p className="text-[0.8125rem] text-ink-faint">Called in sick keeps the shift and makes it open — staff can pick it up in the app.</p>}
    </div>
  );
}
