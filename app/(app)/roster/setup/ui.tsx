"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { CATEGORIES, CATEGORY_LABEL, RULE_PRESETS, type AwardRules, type Category, type EmploymentType } from "@/lib/roster/award";
import { testRosterText, addHoliday, archiveArea, newKioskLink, removeHoliday, saveArea, saveAwardRules, saveRosterOptions, saveRosterPerson, saveXeroPayroll, setKioskPin } from "../actions";

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
  return { pending, run, note, setMsg };
}

type Area = { id: string; name: string; colour: string | null; active: boolean };
type Person = { id: string; name: string; email: string | null; role: string | null; on_roster: boolean; employment_type: EmploymentType; default_area_id: string | null; hourly_rate: number | null; xero_employee_id: string | null; has_pin: boolean; flat: boolean };

export function PeopleCard({ people, areas, payroll, orgRate }: { people: Person[]; areas: Area[]; payroll: { id: string; name: string; email: string | null }[] | null; orgRate: number }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? people : people.filter((p) => p.on_roster);
  return (
    <Card>
      <CardHeader title="Who's on the roster" subtitle="Tick everyone who can do café shifts. Base rate = their Monday–Friday rate, for cost estimates (Xero Payroll pays the real rate). People not on Xero Payroll (e.g. subs off the books) can still be rostered — their café shifts go to Wages, not Xero."
        action={<button onClick={() => setShowAll(!showAll)} className="text-[0.75rem] font-medium text-brand-600">{showAll ? "Only people on the roster" : `Show all staff (${people.length})`}</button>} />
      {list.length === 0 && <p className="border-t border-line px-5 py-4 text-[0.8125rem] text-ink-muted">Nobody yet — tap “Show all staff” and tick the café team. Add new people in Settings → Team.</p>}
      <ul className="divide-y divide-line border-t border-line">
        {list.map((p) => <PersonRow key={p.id} p={p} areas={areas} payroll={payroll} orgRate={orgRate} />)}
      </ul>
    </Card>
  );
}

function PersonRow({ p, areas, payroll, orgRate }: { p: Person; areas: Area[]; payroll: { id: string; name: string; email: string | null }[] | null; orgRate: number }) {
  const { pending, run, note } = useAct();
  const guess = payroll?.find((e) => (p.email && e.email === p.email.toLowerCase()) || e.name.toLowerCase() === p.name.toLowerCase());
  const [v, setV] = useState({ onRoster: p.on_roster, employmentType: p.employment_type, areaId: p.default_area_id, xeroEmployeeId: p.xero_employee_id ?? guess?.id ?? null, hourlyRate: p.hourly_rate, flat: p.flat });
  const [pin, setPin] = useState("");
  const dirty = v.onRoster !== p.on_roster || v.employmentType !== p.employment_type || v.areaId !== p.default_area_id || (v.xeroEmployeeId ?? null) !== (p.xero_employee_id ?? null) || v.hourlyRate !== p.hourly_rate || v.flat !== p.flat;
  return (
    <li className="grid gap-3 px-5 py-3 text-[0.8125rem] lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={v.onRoster} onChange={(e) => setV({ ...v, onRoster: e.target.checked })} />
        <span className="min-w-0"><span className="block font-medium text-ink">{p.name}</span><span className="block truncate text-[0.7188rem] text-ink-faint">{p.email ?? "No email — can't use the app"}</span></span>
      </label>
      <div><Label>Employment</Label>
        <Select value={v.flat ? "flat" : v.employmentType} onChange={(e) => e.target.value === "flat" ? setV({ ...v, flat: true }) : setV({ ...v, flat: false, employmentType: e.target.value as EmploymentType })}>
          <option value="casual">Casual (award)</option><option value="part_time">Part-time (award)</option><option value="full_time">Full-time (award)</option><option value="flat">Agreed flat rate</option>
        </Select></div>
      <div><Label>Usual area</Label>
        <Select value={v.areaId ?? ""} onChange={(e) => setV({ ...v, areaId: e.target.value || null })}>
          <option value="">—</option>{areas.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select></div>
      <div><Label>{v.flat ? "Flat rate $/h" : "Base rate $/h"}</Label><Input type="number" min={0} step="0.01" placeholder={String(orgRate)} value={v.hourlyRate ?? ""} onChange={(e) => setV({ ...v, hourlyRate: e.target.value === "" ? null : Number(e.target.value) })} /></div>
      <div><Label>Xero Payroll</Label>
        {payroll ? (
          <Select value={v.xeroEmployeeId ?? ""} onChange={(e) => setV({ ...v, xeroEmployeeId: e.target.value || null })}>
            <option value="">Not on payroll — pay through Wages</option>{payroll.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        ) : <p className="py-2 text-[0.75rem] text-ink-faint">{p.xero_employee_id ? "Matched" : "Connect Xero Payroll"}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={dirty ? "primary" : "secondary"} disabled={pending || !dirty} onClick={() => run(() => saveRosterPerson(p.id, v))}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Save</Button>
        <Input className="w-20" inputMode="numeric" maxLength={4} placeholder={p.has_pin ? "••••" : "PIN"} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-label="Café iPad PIN" />
        <Button size="sm" disabled={pending || pin.length !== 4} onClick={() => run(() => setKioskPin(p.id, pin), (r) => r.ok && setPin(""))}>Set PIN</Button>
      </div>
      {note && <div className="lg:col-span-6">{note}</div>}
      {guess && !p.xero_employee_id && <p className="text-[0.7188rem] text-ink-muted lg:col-span-6">Matched to {guess.name} in Xero Payroll by {p.email && guess.email === p.email.toLowerCase() ? "email" : "name"} — save to keep it.</p>}
    </li>
  );
}

export function AreasCard({ areas }: { areas: Area[] }) {
  const { pending, run, note } = useAct();
  const [name, setName] = useState("");
  const [colour, setColour] = useState("#6028EC");
  return (
    <Card>
      <CardHeader title="Areas" subtitle="Where people work — each shift is in an area, and shows in its colour." />
      <ul className="divide-y divide-line border-t border-line text-[0.8125rem]">
        {areas.filter((a) => a.active).map((a) => <AreaRow key={a.id} a={a} />)}
      </ul>
      <div className="flex flex-wrap items-end gap-2 border-t border-line px-5 py-3">
        <div className="min-w-[180px] flex-1"><Label htmlFor="new-area">New area</Label><Input id="new-area" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Barista, Floor, Kitchen" /></div>
        <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} className="h-9 w-12 rounded border border-line" aria-label="Colour" />
        <Button size="sm" variant="primary" disabled={pending || !name.trim()} onClick={() => run(() => saveArea({ name, colour }), (r) => r.ok && setName(""))}><Plus className="h-3.5 w-3.5" />Add</Button>
      </div>
      {note && <div className="px-5 pb-3">{note}</div>}
    </Card>
  );
}

function AreaRow({ a }: { a: Area }) {
  const { pending, run, note } = useAct();
  const [name, setName] = useState(a.name);
  const [colour, setColour] = useState(a.colour ?? "#a1a1aa");
  return (
    <li className="flex flex-wrap items-center gap-2 px-5 py-2.5">
      <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} className="h-8 w-10 rounded border border-line" aria-label="Colour" />
      <Input className="max-w-xs" value={name} onChange={(e) => setName(e.target.value)} />
      <Button size="sm" disabled={pending || (name === a.name && colour === (a.colour ?? "#a1a1aa"))} onClick={() => run(() => saveArea({ id: a.id, name, colour }))}>Save</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => archiveArea(a.id))}>Hide</Button>
      {note}
    </li>
  );
}

export function XeroPayrollCard({ xeroOn, payrollOn, error, rates, earnings, status }: { xeroOn: boolean; payrollOn: boolean; error: string | null; rates: { id: string; name: string }[]; earnings: Partial<Record<Category, string>>; status: "DRAFT" | "APPROVED" }) {
  const { pending, run, note } = useAct();
  const [map, setMap] = useState(earnings);
  const [st, setSt] = useState(status);
  return (
    <Card>
      <CardHeader title="Xero Payroll" subtitle="Approved timesheets go to Xero Payroll with the hours split by award category. Xero applies each person's pay rates." />
      <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
        {!xeroOn ? <p className="text-ink-muted">Connect Xero first (Settings → Integrations).</p>
          : !payrollOn ? (
            <div className="space-y-2">
              <p className="text-ink-muted">EventureOS needs permission to read your payroll employees and pay items, and to add timesheets. Xero will ask you to approve it.</p>
              <a href="/api/integrations/xero/connect?payroll=1" className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3 text-[0.8125rem] font-medium text-white hover:bg-brand-700">Connect Xero Payroll</a>
            </div>
          ) : error ? (
            <div className="space-y-2"><p className="text-rose-700">Xero Payroll didn&rsquo;t answer: {error}</p>
              <a href="/api/integrations/xero/connect?payroll=1" className="text-[0.8125rem] font-medium text-brand-600">Reconnect Xero Payroll</a></div>
          ) : (
            <>
              <p className="text-ink-muted">Choose the Xero earnings rate for each kind of hours. Leave one blank if your award setup doesn&rsquo;t use it — those hours then go as Ordinary.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {CATEGORIES.map((c) => (
                  <div key={c}><Label>{CATEGORY_LABEL[c]}</Label>
                    <Select value={map[c] ?? ""} onChange={(e) => setMap({ ...map, [c]: e.target.value || undefined })}>
                      <option value="">—</option>{rates.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select></div>
                ))}
              </div>
              <div className="max-w-xs"><Label>Timesheets arrive in Xero as</Label>
                <Select value={st} onChange={(e) => setSt(e.target.value as "DRAFT" | "APPROVED")}>
                  <option value="APPROVED">Approved — ready for the pay run</option><option value="DRAFT">Draft — check them in Xero first</option>
                </Select></div>
              <Button size="sm" variant="primary" disabled={pending || !map.ordinary} onClick={() => run(() => saveXeroPayroll({ earnings: map, status: st }))}>Save</Button>
              {!map.ordinary && <p className="text-[0.75rem] text-amber-800">Ordinary is needed at least.</p>}
            </>
          )}
        {note}
      </div>
    </Card>
  );
}

export function PayRulesCard({ rules }: { rules: AwardRules }) {
  const { pending, run, note } = useAct();
  const [r, setR] = useState(rules);
  const types: [EmploymentType, string][] = [["casual", "Casual"], ["part_time", "Part-time"], ["full_time", "Full-time"]];
  const cols: [keyof AwardRules["casual"], string][] = [["weekday", "Mon–Fri"], ["saturday", "Sat"], ["sunday", "Sun"], ["public_holiday", "Public hol."], ["overtime_150", "OT first"], ["overtime_200", "OT after"], ["min_hours", "Min. hours"],
    ...(r.loadings === "replace" ? [["evening", "Evening"], ["late_night", "Late night"]] as [keyof AwardRules["casual"], string][] : [])];
  const setT = (t: EmploymentType, k: keyof AwardRules["casual"], v: number) => setR({ ...r, [t]: { ...r[t], [k]: v } });
  return (
    <Card>
      <CardHeader title="Pay rules" subtitle="How hours are split (weekend, public holiday, evening, overtime) and the multipliers for cost estimates. Check them against the current Fair Work pay guide for your award." />
      <div className="space-y-4 border-t border-line px-5 py-4 text-[0.8125rem]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.75rem] text-ink-muted">Start from:</span>
          {Object.entries(RULE_PRESETS).map(([k, p]) => <Button key={k} size="sm" onClick={() => setR(p.rules)}>{p.label}</Button>)}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[640px] text-[0.75rem]">
            <thead><tr><th className="py-1 pr-3 text-left font-medium text-ink-muted" />{cols.map(([, l]) => <th key={l} className="px-1 py-1 text-left font-medium text-ink-muted">{l}</th>)}</tr></thead>
            <tbody>
              {types.map(([t, label]) => (
                <tr key={t}>
                  <td className="py-1 pr-3 font-medium text-ink">{label}</td>
                  {cols.map(([k]) => <td key={k} className="px-1 py-1"><Input type="number" step="0.05" min={0} className="w-20" value={r[t][k]} onChange={(e) => setT(t, k, Number(e.target.value))} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[0.7188rem] text-ink-faint">Multipliers are of the base rate (casual ones include the 25% casual loading). Minimum hours: a shorter shift is paid up to this.</p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div><Label hint="Mon–Fri">Evening / late hours are</Label>
            <Select value={r.loadings} onChange={(e) => setR({ ...r, loadings: e.target.value as "add" | "replace" })}>
              <option value="replace">Paid at their own rate</option><option value="add">A $ loading on top</option>
            </Select></div>
          <div><Label hint="Mon–Fri">Evening from</Label><Input type="time" value={r.evening_from} onChange={(e) => setR({ ...r, evening_from: e.target.value })} /></div>
          <div><Label hint="Mon–Fri, from midnight">Late night until</Label><Input type="time" value={r.late_to} onChange={(e) => setR({ ...r, late_to: e.target.value })} /></div>
          {r.loadings === "add" && <><div><Label hint="per hour">Evening $</Label><Input type="number" step="0.01" min={0} value={r.evening_dollars} onChange={(e) => setR({ ...r, evening_dollars: Number(e.target.value) })} /></div>
          <div><Label hint="per hour">Late night $</Label><Input type="number" step="0.01" min={0} value={r.late_night_dollars} onChange={(e) => setR({ ...r, late_night_dollars: Number(e.target.value) })} /></div></>}
          <div><Label hint="hours a week">Overtime after</Label><Input type="number" step="0.5" min={0} placeholder="none" value={r.weekly_overtime ?? ""} onChange={(e) => setR({ ...r, weekly_overtime: e.target.value === "" ? null : Number(e.target.value) })} /></div>
          <div><Label hint="hours in a shift">Daily overtime after</Label><Input type="number" step="0.5" min={0} placeholder="none" value={r.daily_overtime ?? ""} onChange={(e) => setR({ ...r, daily_overtime: e.target.value === "" ? null : Number(e.target.value) })} /></div>
          <div><Label hint="each week">First OT hours</Label><Input type="number" step="0.5" min={0} value={r.overtime_first_hours} onChange={(e) => setR({ ...r, overtime_first_hours: Number(e.target.value) })} /></div>
          <label className="flex items-end gap-2 pb-2 text-[0.75rem] text-ink"><input type="checkbox" checked={r.casual_overtime} onChange={(e) => setR({ ...r, casual_overtime: e.target.checked })} />Casuals get overtime</label>
        </div>
        <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => saveAwardRules(r))}>Save pay rules</Button>
        {note}
      </div>
    </Card>
  );
}

export function OptionsCard({ rounding, grace, googleCalendar, geofence, kioskSet, slug }: { rounding: number; grace: number; googleCalendar: boolean; geofence: { lat: number; lng: number; metres: number } | null; kioskSet: boolean; slug: string }) {
  const { pending, run, note } = useAct();
  const [v, setV] = useState({ rounding, grace, googleCalendar, geofence });
  const [link, setLink] = useState<string | null>(null);
  const here = () => navigator.geolocation?.getCurrentPosition((p) => setV((x) => ({ ...x, geofence: { lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6, metres: x.geofence?.metres ?? 150 } })));
  return (
    <Card>
      <CardHeader title="Clocking on" subtitle="Staff clock on and off in the staff app on their phone, or on a café iPad with their PIN." />
      <div className="space-y-4 border-t border-line px-5 py-4 text-[0.8125rem]">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label hint="minutes">Round clock times to</Label><Input type="number" min={0} max={60} value={v.rounding} onChange={(e) => setV({ ...v, rounding: Number(e.target.value) })} /></div>
          <div><Label hint="minutes">Pay rostered times if within</Label><Input type="number" min={0} max={60} value={v.grace} onChange={(e) => setV({ ...v, grace: Number(e.target.value) })} /></div>
          <label className="flex items-end gap-2 pb-2 text-[0.75rem] text-ink"><input type="checkbox" checked={v.googleCalendar} onChange={(e) => setV({ ...v, googleCalendar: e.target.checked })} />Also put published shifts on Google Calendar</label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label hint="phones only">Clock on near the café</Label>
            <p className="text-[0.75rem] text-ink-muted">{v.geofence ? `Within ${v.geofence.metres} m of ${v.geofence.lat}, ${v.geofence.lng}` : "Anywhere"}</p></div>
          <Button size="sm" onClick={here}><MapPin className="h-3.5 w-3.5" />Use where I am now</Button>
          {v.geofence && <Input type="number" className="w-24" min={50} max={2000} value={v.geofence.metres} onChange={(e) => setV({ ...v, geofence: { ...v.geofence!, metres: Number(e.target.value) } })} aria-label="Metres" />}
          {v.geofence && <Button size="sm" variant="ghost" onClick={() => setV({ ...v, geofence: null })}>Anywhere</Button>}
        </div>
        <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => saveRosterOptions(v))}>Save</Button>
        <div className="rounded-lg bg-zinc-50 px-3 py-3">
          <p className="font-medium text-ink">Café iPad</p>
          <p className="text-[0.75rem] text-ink-muted">Open this link on the café iPad and add it to the home screen. Staff tap their name and enter their PIN to clock on, start a break, or clock off. {kioskSet ? "Making a new link stops the old one working." : ""}</p>
          {link ? <p className="mt-2 break-all rounded bg-white px-2 py-1.5 font-mono text-[0.75rem] ring-1 ring-line">{`${window.location.origin}/crew/${slug}/kiosk?k=${link}`}</p> : null}
          <Button size="sm" className="mt-2" disabled={pending} onClick={() => run(() => newKioskLink(), (r) => r.ok && r.message && setLink(r.message))}>{kioskSet ? "Make a new iPad link" : "Make the iPad link"}</Button>
          {link && <p className="mt-1 text-[0.7188rem] text-amber-800">Copy it now — it isn&rsquo;t shown again.</p>}
        </div>
        {note && !link ? note : null}
      </div>
    </Card>
  );
}

export function HolidaysCard({ holidays }: { holidays: { holiday_date: string; name: string }[] }) {
  const { pending, run, note } = useAct();
  const [d, setD] = useState("");
  const [n, setN] = useState("");
  return (
    <Card>
      <CardHeader title="Public holidays" subtitle="Hours on these days are paid as public holiday hours." />
      <ul className="divide-y divide-line border-t border-line text-[0.8125rem]">
        {holidays.map((h) => (
          <li key={h.holiday_date} className="flex items-center gap-3 px-5 py-2">
            <span className="w-36 text-ink-muted">{fmtDate(h.holiday_date, "weekday")} {h.holiday_date.slice(0, 4)}</span><span className="flex-1 text-ink">{h.name}</span>
            <button className="text-[0.75rem] text-ink-faint hover:text-rose-700" disabled={pending} onClick={() => run(() => removeHoliday(h.holiday_date))}>Remove</button>
          </li>
        ))}
        {holidays.length === 0 && <li className="px-5 py-3 text-ink-muted">None added yet.</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-2 border-t border-line px-5 py-3">
        <div><Label htmlFor="h-date">Date</Label><Input id="h-date" type="date" value={d} onChange={(e) => setD(e.target.value)} /></div>
        <div className="min-w-[180px] flex-1"><Label htmlFor="h-name">Name</Label><Input id="h-name" value={n} onChange={(e) => setN(e.target.value)} placeholder="e.g. Canberra Day" /></div>
        <Button size="sm" variant="primary" disabled={pending || !d || !n.trim()} onClick={() => run(() => addHoliday(d, n), (r) => { if (r.ok) { setD(""); setN(""); } })}>Add</Button>
      </div>
      {note && <div className="px-5 pb-3">{note}</div>}
    </Card>
  );
}

type PastPay = { periods: { start: string | null; end: string | null; paid: string | null }[]; people: { employeeId: string; name: string; runs: number; lines: { earningsRateId: string; name: string; rate: number | null; hours: number; amount: number }[] }[]; fetched_at?: string };

/** What the last pay runs in Xero paid each person — the rates and earnings rates to copy. */
export function PastPayCard({ past }: { past: PastPay | null }) {
  return (
    <Card>
      <CardHeader title="Past pay runs (from Xero)" subtitle={past?.periods.length ? `The last ${past.periods.length} posted pay runs${past.periods[past.periods.length - 1]?.start ? `, from ${fmtDate(past.periods[past.periods.length - 1].start)}` : ""}. Use these rates for each person's base rate, and to match the earnings rates above.` : undefined} />
      <div className="border-t border-line px-5 py-4 text-[0.8125rem]">
        {!past ? (
          <div className="space-y-2"><p className="text-ink-muted">EventureOS needs one more Xero permission to read past pay runs and payslips.</p>
            <a href="/api/integrations/xero/connect?payroll=1" className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3 text-[0.8125rem] font-medium text-white hover:bg-brand-700">Reconnect Xero Payroll</a></div>
        ) : !past.people.length ? <p className="text-ink-muted">No posted pay runs found in Xero.</p> : (
          <div className="space-y-4">
            {past.people.map((p) => (
              <div key={p.employeeId}>
                <p className="font-semibold text-ink">{p.name} <span className="font-normal text-ink-faint">· {p.runs} pay run{p.runs === 1 ? "" : "s"}</span></p>
                <table className="mt-1 w-full max-w-xl text-[0.75rem]">
                  <tbody>
                    {p.lines.map((l, i) => (
                      <tr key={i} className="border-b border-line/60"><td className="py-1 pr-3 text-ink">{l.name}</td><td className="py-1 pr-3 text-right tabular-nums">{l.hours} h</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{l.rate != null ? `$${l.rate.toFixed(2)}/h` : "—"}</td><td className="py-1 text-right tabular-nums text-ink-muted">${l.amount.toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {past.fetched_at && <p className="text-[0.7188rem] text-ink-faint">Read from Xero {new Date(past.fetched_at).toLocaleString()}.</p>}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Send a test of the weekly roster text (what that person gets), to them or to another mobile. */
export function TextsCard({ people, monday, smsOn }: { people: { id: string; name: string; phone: string | null }[]; monday: string; smsOn: boolean }) {
  const { pending, run, note } = useAct();
  const [who, setWho] = useState(people[0]?.id ?? "");
  const [to, setTo] = useState("");
  const p = people.find((x) => x.id === who);
  return (
    <Card>
      <CardHeader title="Text messages" subtitle="When Cara publishes, tick “Text staff” and each person gets their shifts for the week and a link to the staff app. Staff need a mobile number in Settings → Team." />
      <div className="space-y-3 border-t border-line px-5 py-4 text-[0.8125rem]">
        {!smsOn ? <p className="text-ink-muted">Connect Twilio in Settings → Integrations first.</p> : (
          <>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <div><Label>Whose roster (this week)</Label>
                <Select value={who} onChange={(e) => setWho(e.target.value)}>{people.map((x) => <option key={x.id} value={x.id}>{x.name}{x.phone ? "" : " — no mobile yet"}</option>)}</Select></div>
              <div><Label hint="optional">Send it to this mobile instead</Label><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder={p?.phone ?? "04xx xxx xxx"} inputMode="tel" /></div>
              <Button size="sm" variant="primary" disabled={pending || !who || (!to.trim() && !p?.phone)} onClick={() => run(() => testRosterText(who, monday, to || null))}>Send a test text</Button>
            </div>
            <p className="text-[0.7188rem] text-ink-faint">It reads like: “Hi Cara, your Bean Culture roster for w/c 2 Nov: Tue 6:30am–3pm, Thu 6:30am–3pm… Details, swaps &amp; clock on: (link)”.</p>
          </>
        )}
        {note}
      </div>
    </Card>
  );
}
