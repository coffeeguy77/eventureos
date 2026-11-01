"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { saveAba, saveAutomation, setAppManager, setUnpaid } from "../actions";
import { addQualification, addStaffNote, archiveChecklist, deleteQualification, deleteStaffNote, saveBankAccount, saveChecklist, setAreaQuals } from "../people-actions";

type Res = { ok: boolean; message?: string; error?: string };
function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<Res>, after?: (r: Res) => void) => start(async () => {
    const r: Res = await fn().catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Something went wrong." });
    after?.(r);
    router.refresh();
  });
  const note = msg && <p className={cn("text-[0.75rem]", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>;
  return { pending, run, note };
}

export interface StaffExtra {
  id: string; name: string; onPayroll: boolean; manager: boolean; unpaid: boolean;
  quals: { id: string; name: string; reference: string | null; expires_on: string | null; url: string | null }[];
  notes: { id: string; body: string; author: string | null; at: string }[];
  bank: { name: string; bsb: string; last: string } | null;
}

/** Per person: sees Today in the app, documents & qualifications, managers' private notes, bank details (Wages). */
export function StaffDetailsCard({ people, today }: { people: StaffExtra[]; today: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Staff details" subtitle="Tap someone for their files: documents and qualifications (with expiry), private manager notes, bank details (Wages), whether they're paid through the roster, and who sees Today in the staff app." />
      <ul className="divide-y divide-line border-t border-line">
        {people.map((p) => {
          const exp = p.quals.filter((q) => q.expires_on && q.expires_on < today).length;
          return (
            <li key={p.id}>
              <button onClick={() => setOpen(open === p.id ? null : p.id)} className="flex w-full flex-wrap items-center gap-2 px-5 py-3 text-left text-[0.8125rem]">
                <span className="min-w-0 flex-1 font-medium text-ink">{p.name}</span>
                {p.unpaid && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.7188rem] font-semibold text-ink-muted">Not paid here</span>}
                {p.manager && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.7188rem] font-semibold text-violet-800">Sees Today</span>}
                <span className="text-[0.7188rem] text-ink-muted">{p.quals.length} doc{p.quals.length === 1 ? "" : "s"}{exp ? ` · ${exp} expired` : ""} · {p.notes.length} note{p.notes.length === 1 ? "" : "s"}{!p.onPayroll ? ` · bank ${p.bank ? "✓" : "—"}` : ""}</span>
              </button>
              {open === p.id && <PersonDetail p={p} today={today} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function PersonDetail({ p, today }: { p: StaffExtra; today: string }) {
  const { pending, run, note } = useAct();
  const [q, setQ] = useState({ name: "", reference: "", expires: "" });
  const [file, setFile] = useState<File | null>(null);
  const [n, setN] = useState("");
  const [b, setB] = useState({ name: p.bank?.name ?? p.name, bsb: p.bank?.bsb ?? "", account: "" });
  return (
    <div className="space-y-4 bg-canvas px-5 py-4 text-[0.8125rem]">
      <label className="flex items-center gap-2 text-ink"><input type="checkbox" checked={p.unpaid} disabled={pending} onChange={(e) => run(() => setUnpaid(p.id, e.target.checked))} />Not paid through the roster (e.g. an owner paid other ways) — left out of Xero timesheets, Wages and wage costs</label>
      <label className="flex items-center gap-2 text-ink"><input type="checkbox" checked={p.manager} disabled={pending} onChange={(e) => run(() => setAppManager(p.id, e.target.checked))} />Manager — sees <b>Today</b> in the staff app (who&apos;s on, late texts, wages %, checklists)</label>

      <div>
        <p className="mb-1 font-semibold text-ink">Documents &amp; qualifications</p>
        {p.quals.length === 0 && <p className="text-ink-muted">None yet.</p>}
        <ul className="space-y-1">
          {p.quals.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2">
              <span className="text-ink">{x.name}</span>{x.reference && <span className="text-ink-faint">#{x.reference}</span>}
              {x.expires_on && <span className={cn("rounded-full px-2 py-0.5 text-[0.7188rem] font-semibold", x.expires_on < today ? "bg-rose-100 text-rose-800" : "bg-zinc-100 text-ink-muted")}>{x.expires_on < today ? "expired" : "expires"} {x.expires_on}</span>}
              {x.url && <a href={x.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600"><FileText className="h-3.5 w-3.5" />View</a>}
              <button className="text-ink-faint hover:text-rose-700" disabled={pending} onClick={() => run(() => deleteQualification(x.id))} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end">
          <div><Label>Name</Label><Input value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} placeholder="e.g. RSA, Food Safety, First Aid" list="qual-names" /></div>
          <div><Label hint="optional">Number</Label><Input value={q.reference} onChange={(e) => setQ({ ...q, reference: e.target.value })} /></div>
          <div><Label hint="optional">Expires</Label><Input type="date" value={q.expires} onChange={(e) => setQ({ ...q, expires: e.target.value })} /></div>
          <div><Label hint="PDF or photo, optional">File</Label><input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-[0.75rem] text-ink-muted file:mr-2 file:rounded-md file:border-0 file:bg-surface file:px-2 file:py-1.5 file:text-ink file:ring-1 file:ring-line" /></div>
          <Button size="sm" disabled={pending || !q.name.trim()} onClick={() => { const f = new FormData(); f.set("member", p.id); f.set("name", q.name); f.set("reference", q.reference); f.set("expires", q.expires); if (file) f.set("file", file); run(() => addQualification(f), (r) => { if (r.ok) { setQ({ name: "", reference: "", expires: "" }); setFile(null); } }); }}><Plus className="h-3.5 w-3.5" />Add</Button>
        </div>
        <datalist id="qual-names"><option value="RSA" /><option value="Food Safety Supervisor" /><option value="Food Handler" /><option value="First Aid" /><option value="Working with Vulnerable People" /><option value="Visa" /><option value="Barista training" /></datalist>
      </div>

      <div>
        <p className="mb-1 font-semibold text-ink">Private notes <span className="font-normal text-ink-faint">— only managers see these</span></p>
        <ul className="space-y-1">
          {p.notes.map((x) => (
            <li key={x.id} className="rounded-lg bg-surface px-3 py-2 ring-1 ring-line">
              <p className="whitespace-pre-line text-ink">{x.body}</p>
              <p className="mt-0.5 flex items-center gap-2 text-[0.7188rem] text-ink-faint">{x.author ?? "—"} · {new Date(x.at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                <button className="hover:text-rose-700" disabled={pending} onClick={() => run(() => deleteStaffNote(x.id))}>Delete</button></p>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Textarea rows={2} className="min-w-[220px] flex-1" value={n} onChange={(e) => setN(e.target.value)} placeholder="e.g. Talked about clocking breaks on the iPad" />
          <Button size="sm" disabled={pending || !n.trim()} onClick={() => run(() => addStaffNote(p.id, n), (r) => r.ok && setN(""))}>Add note</Button>
        </div>
      </div>

      {!p.onPayroll && (
        <div>
          <p className="mb-1 font-semibold text-ink">Bank details <span className="font-normal text-ink-faint">— for the bank file in Wages (not on Xero Payroll)</span></p>
          {p.bank && <p className="mb-1 text-ink-muted">On file: {p.bank.name} · BSB {p.bank.bsb} · account ending {p.bank.last}</p>}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto_auto] sm:items-end">
            <div><Label>Name on the account</Label><Input value={b.name} maxLength={32} onChange={(e) => setB({ ...b, name: e.target.value })} /></div>
            <div><Label>BSB</Label><Input inputMode="numeric" value={b.bsb} onChange={(e) => setB({ ...b, bsb: e.target.value })} placeholder="000-000" /></div>
            <div><Label>Account number</Label><Input inputMode="numeric" autoComplete="off" value={b.account} onChange={(e) => setB({ ...b, account: e.target.value })} placeholder={p.bank ? `…${p.bank.last}` : ""} /></div>
            <Button size="sm" disabled={pending || !b.account.trim()} onClick={() => run(() => saveBankAccount(p.id, b), (r) => r.ok && setB({ ...b, account: "" }))}>Save</Button>
            {p.bank && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => saveBankAccount(p.id, null))}>Remove</Button>}
          </div>
        </div>
      )}
      {note}
    </div>
  );
}

/** What each area needs (the roster warns when someone without it is put there). */
export function AreaQualsCard({ areas }: { areas: { id: string; name: string; required_quals: string[] }[] }) {
  return (
    <Card>
      <CardHeader title="Qualifications needed" subtitle="The roster warns you when someone without a current one is put on that area (comma-separated, matching the names in Staff details)." />
      <ul className="divide-y divide-line border-t border-line">{areas.map((a) => <AreaQualRow key={a.id} a={a} />)}</ul>
    </Card>
  );
}
function AreaQualRow({ a }: { a: { id: string; name: string; required_quals: string[] } }) {
  const { pending, run, note } = useAct();
  const [v, setV] = useState(a.required_quals.join(", "));
  return (
    <li className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-[0.8125rem]">
      <span className="w-32 font-medium text-ink">{a.name}</span>
      <Input className="min-w-[200px] flex-1" value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. Food Safety, RSA" />
      <Button size="sm" disabled={pending || v === a.required_quals.join(", ")} onClick={() => run(() => setAreaQuals(a.id, v.split(",")))}>Save</Button>
      {note}
    </li>
  );
}

type Checklist = { id: string; name: string; area_id: string | null; weekdays: number[]; due_by: string | null; items: string[] };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Opening / closing / area checklists, ticked off on the café iPad and in the staff app. */
export function ChecklistsCard({ lists, areas }: { lists: Checklist[]; areas: { id: string; name: string }[] }) {
  const [edit, setEdit] = useState<Checklist | null>(null);
  return (
    <Card>
      <CardHeader title="Checklists" subtitle="Opening, closing, cleaning… staff tick them off on the café iPad (no PIN) or in the staff app; managers see progress on Today."
        action={<Button size="sm" onClick={() => setEdit({ id: "", name: "", area_id: null, weekdays: [0, 1, 2, 3, 4, 5, 6], due_by: null, items: [] })}><Plus className="h-3.5 w-3.5" />New</Button>} />
      <ul className="divide-y divide-line border-t border-line text-[0.8125rem]">
        {lists.length === 0 && <li className="px-5 py-3 text-ink-muted">None yet.</li>}
        {lists.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5">
            <span className="min-w-0 flex-1"><b className="text-ink">{c.name}</b><span className="ml-2 text-ink-muted">{c.items.length} items · {c.weekdays.length === 7 ? "every day" : c.weekdays.map((d) => DAYS[d]).join(" ")}{c.due_by ? ` · by ${c.due_by.slice(0, 5)}` : ""}</span></span>
            <Button size="sm" variant="ghost" onClick={() => setEdit(c)}>Edit</Button>
          </li>
        ))}
      </ul>
      {edit && <ChecklistEditor c={edit} areas={areas} onDone={() => setEdit(null)} />}
    </Card>
  );
}
function ChecklistEditor({ c, areas, onDone }: { c: Checklist; areas: { id: string; name: string }[]; onDone: () => void }) {
  const { pending, run, note } = useAct();
  const [v, setV] = useState({ name: c.name, areaId: c.area_id, weekdays: c.weekdays, dueBy: c.due_by?.slice(0, 5) ?? "", items: c.items.join("\n") });
  return (
    <div className="space-y-3 border-t border-line bg-canvas px-5 py-4 text-[0.8125rem]">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label>Name</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Opening" /></div>
        <div><Label hint="optional">Area</Label><Select value={v.areaId ?? ""} onChange={(e) => setV({ ...v, areaId: e.target.value || null })}><option value="">Whole café</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>
        <div><Label hint="optional">Done by</Label><Input type="time" value={v.dueBy} onChange={(e) => setV({ ...v, dueBy: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => <button key={d} onClick={() => setV({ ...v, weekdays: v.weekdays.includes(i) ? v.weekdays.filter((x) => x !== i) : [...v.weekdays, i] })} className={cn("rounded-full px-3 py-1 text-[0.75rem] font-medium ring-1", v.weekdays.includes(i) ? "bg-brand-600 text-white ring-brand-600" : "bg-surface text-ink ring-line")}>{d}</button>)}</div>
      <div><Label hint="one per line">Things to tick off</Label><Textarea rows={6} value={v.items} onChange={(e) => setV({ ...v, items: e.target.value })} placeholder={"Grinder dialled in\nMilk fridge temp checked\nTables wiped"} /></div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => saveChecklist({ id: c.id || null, name: v.name, areaId: v.areaId, weekdays: v.weekdays, dueBy: v.dueBy || null, items: v.items.split("\n") }), (r) => r.ok && onDone())}>Save</Button>
        {c.id && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => archiveChecklist(c.id), (r) => r.ok && onDone())}>Remove</Button>}
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      {note}
    </div>
  );
}

type Auto = { late: { after: number; cooldown: number; auto: boolean }; reminders: { night_before: boolean; at: string; hours_before: number }; auto_approve: boolean; limits: { week_hours: number; rest_hours: number } };

/** Late texts, shift reminders, auto-approve, workload limits. */
export function AutomationCard({ v: init, smsOn }: { v: Auto; smsOn: boolean }) {
  const { pending, run, note } = useAct();
  const [v, setV] = useState(init);
  return (
    <Card>
      <CardHeader title="Alerts & automation" subtitle="Texts go through Twilio to the staff member's mobile." />
      <div className="space-y-4 border-t border-line px-5 py-4 text-[0.8125rem]">
        {!smsOn && <p className="text-amber-800">Connect Twilio (Settings → Integrations) for late texts and reminders.</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-end gap-2 pb-2 text-ink"><input type="checkbox" checked={v.late.auto} onChange={(e) => setV({ ...v, late: { ...v.late, auto: e.target.checked } })} />Text &ldquo;running late?&rdquo; automatically</label>
          <div><Label hint="minutes after the start">…when not clocked on after</Label><Input type="number" min={1} max={120} value={v.late.after} onChange={(e) => setV({ ...v, late: { ...v.late, after: Number(e.target.value) } })} /></div>
          <div><Label hint="minutes">A manager can text again after</Label><Input type="number" min={0} max={120} value={v.late.cooldown} onChange={(e) => setV({ ...v, late: { ...v.late, cooldown: Number(e.target.value) } })} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-end gap-2 pb-2 text-ink"><input type="checkbox" checked={v.reminders.night_before} onChange={(e) => setV({ ...v, reminders: { ...v.reminders, night_before: e.target.checked } })} />Remind them the evening before</label>
          <div><Label>…at</Label><Input type="time" value={v.reminders.at} onChange={(e) => setV({ ...v, reminders: { ...v.reminders, at: e.target.value } })} /></div>
          <div><Label hint="0 = off">Or remind this many hours before</Label><Input type="number" min={0} max={24} value={v.reminders.hours_before} onChange={(e) => setV({ ...v, reminders: { ...v.reminders, hours_before: Number(e.target.value) } })} /></div>
        </div>
        <p className="-mt-2 text-[0.7188rem] text-ink-faint">Each shift gets one reminder. Texts go out within about 10 minutes of the time (sooner while the café iPad is open).</p>
        <label className="flex items-center gap-2 text-ink"><input type="checkbox" checked={v.auto_approve} onChange={(e) => setV({ ...v, auto_approve: e.target.checked })} />Approve timesheets by themselves when they match the roster, have both photos and the break is fine — Cara only checks the rest</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label hint="0 = off">Warn over this many hours a week</Label><Input type="number" min={0} max={100} value={v.limits.week_hours} onChange={(e) => setV({ ...v, limits: { ...v.limits, week_hours: Number(e.target.value) } })} /></div>
          <div><Label hint="0 = off">Warn under this many hours between shifts</Label><Input type="number" min={0} max={24} value={v.limits.rest_hours} onChange={(e) => setV({ ...v, limits: { ...v.limits, rest_hours: Number(e.target.value) } })} /></div>
        </div>
        <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => saveAutomation(v))}>Save</Button>
        {note}
      </div>
    </Card>
  );
}

type Aba = { bank: string; user_name: string; user_id: string; bsb: string; account: string; account_name: string; remitter: string };
/** The business's own bank details for the ABA bank file. */
export function AbaCard({ v: init }: { v: Aba }) {
  const { pending, run, note } = useAct();
  const [v, setV] = useState(init);
  const f = (k: keyof Aba, label: string, hint?: string, extra?: Record<string, unknown>) => (
    <div><Label hint={hint}>{label}</Label><Input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...extra} /></div>
  );
  return (
    <Card>
      <CardHeader title="Bank file (ABA)" subtitle="Your business account the Wages bank file pays from. Upload the file in your online banking (bulk / batch payments) for people paid through Wages." />
      <div className="grid gap-3 border-t border-line px-5 py-4 text-[0.8125rem] sm:grid-cols-3">
        {f("bank", "Bank", "3 letters: CBA, WBC, NAB, ANZ…", { maxLength: 3 })}
        {f("user_id", "Direct Entry user ID", "6 digits, from your bank", { inputMode: "numeric", maxLength: 6 })}
        {f("user_name", "Name on the bank's DE agreement", "up to 26", { maxLength: 26 })}
        {f("bsb", "Your BSB", undefined, { inputMode: "numeric" })}
        {f("account", "Your account number", undefined, { inputMode: "numeric", autoComplete: "off" })}
        {f("account_name", "Account name", undefined, { maxLength: 32 })}
        {f("remitter", "Shows on their statement as", "up to 16", { maxLength: 16 })}
        <div className="flex items-end"><Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => saveAba(v))}>Save</Button></div>
        <div className="sm:col-span-3">{note}</div>
      </div>
    </Card>
  );
}
