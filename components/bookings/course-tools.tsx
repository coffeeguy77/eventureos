"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronDown, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { addSession, deleteCourse, generateSessions, saveCourse, type CourseInput } from "@/app/(app)/bookings/actions";
import { parseDate, type CourseRow, type Question } from "@/lib/bookings/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";

const fail = { ok: false as const, error: "Couldn't reach the server." };
const BLANK: CourseInput = { name: "", duration_minutes: 120, price: "", capacity: 6, active: true, public: true, max_seats_per_booking: 6, waitlist: true, gift_enabled: true, questions: [], external_names: [] };

export function CourseEditor({ course, calendars, upcoming, startOpen, orgSlug }: { course: CourseRow | null; calendars: { id: string; name: string }[]; upcoming: number; startOpen: boolean; orgSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [c, setC] = useState<CourseInput>(course ? { ...course, price: String(course.price), agency_price: course.agency_price === null ? "" : String(course.agency_price) } : BLANK);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [askDel, setAskDel] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof CourseInput>(k: K, v: CourseInput[K]) => setC({ ...c, [k]: v });
  const txt = (k: keyof CourseInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never);

  const save = () => start(async () => {
    setMsg(null);
    const r = await saveCourse({ ...c, id: course?.id ?? null }).catch(() => fail);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: course ? "Saved." : "Course added — now add its dates on the right." });
    if (!course) { setC(BLANK); setOpen(false); }
    router.refresh();
  });

  if (!open) {
    return course ? (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 text-left shadow-card hover:border-brand-200">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: course.colour ?? "rgb(var(--brand-500))" }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-semibold text-ink">{course.name}</span>
          <span className="block text-[0.78rem] text-ink-muted">${Number(course.price)} · {course.duration_minutes} min · {course.capacity} seats · {upcoming} upcoming date{upcoming === 1 ? "" : "s"}</span>
        </span>
        {!course.active ? <Badge tone="slate">Off</Badge> : !course.public ? <Badge tone="amber">Hidden</Badge> : <Badge tone="green">Live</Badge>}
        <ChevronDown className="h-4 w-4 text-ink-faint" />
      </button>
    ) : (
      <Button onClick={() => setOpen(true)} className="w-full"><Plus className="h-4 w-4" />Add a course</Button>
    );
  }

  const q = c.questions ?? [];
  const setQ = (i: number, p: Partial<Question>) => set("questions", q.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[0.9375rem] font-semibold text-ink">{course ? course.name : "New course"}</p>
        <div className="flex items-center gap-1">
          {course && <a href={`/book/${orgSlug}/${course.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.78rem] font-medium text-brand-700 hover:bg-brand-50">View<ExternalLink className="h-3.5 w-3.5" /></a>}
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-[0.78rem] text-ink-muted hover:bg-zinc-100">Close</button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-4"><Label>Name</Label><Input value={c.name} onChange={txt("name")} placeholder="Home Barista Course" /></div>
        <div className="sm:col-span-2"><Label hint="web address">Link name</Label><Input value={c.slug ?? ""} onChange={txt("slug")} placeholder="auto" /></div>
        <div className="sm:col-span-2"><Label>Price per person ($)</Label><Input inputMode="decimal" value={String(c.price ?? "")} onChange={txt("price")} placeholder="150" /></div>
        <div className="sm:col-span-2"><Label>Length (minutes)</Label><Input type="number" min={15} step={15} value={c.duration_minutes} onChange={(e) => set("duration_minutes", Number(e.target.value))} /></div>
        <div className="sm:col-span-2"><Label>Seats per session</Label><Input type="number" min={1} value={c.capacity} onChange={(e) => set("capacity", Number(e.target.value))} /></div>
        <div className="sm:col-span-6"><Label hint="shown on the course list">Short description</Label><Input value={c.summary ?? ""} onChange={txt("summary")} maxLength={300} /></div>
        <div className="sm:col-span-6"><Label>Full description</Label><Textarea value={c.description ?? ""} onChange={txt("description")} className="min-h-[110px]" /></div>
        <div className="sm:col-span-3"><Label>Location</Label><Input value={c.location ?? ""} onChange={txt("location")} /></div>
        <div className="sm:col-span-3"><Label>What to bring</Label><Input value={c.what_to_bring ?? ""} onChange={txt("what_to_bring")} /></div>
        <div className="sm:col-span-4"><Label hint="https://…">Photo link</Label><Input value={c.image_url ?? ""} onChange={txt("image_url")} /></div>
        <div className="sm:col-span-2"><Label>Colour</Label><Input type="color" value={c.colour ?? "#6028EC"} onChange={txt("colour")} className="h-[38px] p-1" /></div>
        <div className="sm:col-span-3"><Label hint="blocked when full">Calendar</Label>
          <Select value={c.calendar_connection_id ?? ""} onChange={txt("calendar_connection_id")}><option value="">None</option>{calendars.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Select></div>
        <div className="sm:col-span-3"><Label>Max seats in one booking</Label><Input type="number" min={1} value={c.max_seats_per_booking} onChange={(e) => set("max_seats_per_booking", Number(e.target.value))} /></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem] text-ink">
        <label className="flex items-center gap-2"><input type="checkbox" checked={c.active} onChange={(e) => set("active", e.target.checked)} />Taking bookings</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={c.public} onChange={(e) => set("public", e.target.checked)} />Show on the booking page</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={c.waitlist} onChange={(e) => set("waitlist", e.target.checked)} />Waitlist when full</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={c.gift_enabled} onChange={(e) => set("gift_enabled", e.target.checked)} />Sell as a gift certificate</label>
      </div>

      <details className="mt-4 rounded-lg border border-line">
        <summary className="cursor-pointer px-3 py-2 text-[0.8125rem] font-medium text-ink">Agency bookings & invoices</summary>
        <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-6">
          <div className="sm:col-span-2"><Label hint="if different">Agency price ($)</Label><Input inputMode="decimal" value={String(c.agency_price ?? "")} onChange={txt("agency_price")} /></div>
          <div className="sm:col-span-2"><Label>Xero item code</Label><Input value={c.xero_item_code ?? ""} onChange={txt("xero_item_code")} /></div>
          <div className="sm:col-span-2"><Label>Xero account</Label><Input value={c.xero_account_code ?? ""} onChange={txt("xero_account_code")} /></div>
          <div className="sm:col-span-6"><Label hint="first lines of the invoice line">Invoice wording</Label><Textarea value={c.invoice_title ?? ""} onChange={txt("invoice_title")} className="min-h-[60px]" placeholder={"Barista Training\nLooking for work course"} /></div>
        </div>
      </details>
      <details className="mt-2 rounded-lg border border-line">
        <summary className="cursor-pointer px-3 py-2 text-[0.8125rem] font-medium text-ink">Questions at checkout ({q.length})</summary>
        <div className="space-y-2 border-t border-line p-3">
          {q.map((x, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_130px_auto_auto]">
              <Input value={x.label} onChange={(e) => setQ(i, { label: e.target.value })} placeholder="e.g. Do you have a coffee machine at home?" />
              <Select value={x.type} onChange={(e) => setQ(i, { type: e.target.value as Question["type"] })}><option value="text">Short answer</option><option value="textarea">Long answer</option><option value="select">Choice</option><option value="checkbox">Tick box</option></Select>
              <label className="flex items-center gap-1.5 text-[0.78rem]"><input type="checkbox" checked={!!x.required} onChange={(e) => setQ(i, { required: e.target.checked })} />Required</label>
              <button type="button" onClick={() => set("questions", q.filter((_, j) => j !== i))} className="rounded p-2 text-ink-faint hover:bg-zinc-100" aria-label="Remove question"><Trash2 className="h-4 w-4" /></button>
              {x.type === "select" && <Input className="sm:col-span-4" value={(x.options ?? []).join(", ")} onChange={(e) => setQ(i, { options: e.target.value.split(",").map((o) => o.trim()) })} placeholder="Choices, separated by commas" />}
            </div>
          ))}
          <Button size="sm" onClick={() => set("questions", [...q, { id: `q${q.length + 1}`, label: "", type: "text" }])}><Plus className="h-3.5 w-3.5" />Add a question</Button>
        </div>
      </details>
      <details className="mt-2 rounded-lg border border-line">
        <summary className="cursor-pointer px-3 py-2 text-[0.8125rem] font-medium text-ink">Names in Bookly / ClassBento</summary>
        <div className="border-t border-line p-3">
          <p className="mb-2 text-[0.78rem] text-ink-muted">So copied bookings land on this course. One per line, exactly as the other system names it.</p>
          <Textarea value={(c.external_names ?? []).join("\n")} onChange={(e) => set("external_names", e.target.value.split("\n"))} className="min-h-[60px]" />
        </div>
      </details>

      {msg && <p className={cn("mt-3 text-[0.8125rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={pending} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{course ? "Save course" : "Add course"}</Button>
        {course && !askDel && <Button variant="ghost" onClick={() => setAskDel(true)}>Delete</Button>}
        {askDel && course && (
          <span className="flex items-center gap-2 text-[0.8125rem] text-rose-800">Delete {course.name}?
            <Button size="sm" onClick={() => setAskDel(false)}>No</Button>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => start(async () => { const r = await deleteCourse(course.id).catch(() => fail); if (!r.ok) setMsg({ ok: false, text: r.error }); setAskDel(false); router.refresh(); })}>Delete</Button>
          </span>
        )}
      </div>
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SessionGenerator({ courses }: { courses: { id: string; name: string; duration: number }[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const in3 = new Date(Date.now() + 90 * 86400e3).toISOString().slice(0, 10);
  const [f, setF] = useState({ courseId: courses[0]?.id ?? "", from: today, to: in3, weekdays: [6] as number[], times: ["10:00"], every: 1, skip: "" });
  const [one, setOne] = useState({ date: "", time: "10:00" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, okText?: string) => start(async () => {
    setMsg(null);
    const r = await fn().catch(() => fail);
    setMsg(r.ok ? { ok: true, text: okText ?? String(r.data) } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <div className="sticky top-20 space-y-4">
      <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink"><CalendarPlus className="h-4 w-4" />Add repeating dates</p>
        <div className="mt-3 grid gap-2.5">
          <div><Label>Course</Label><Select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div><Label>Days</Label>
            <div className="flex flex-wrap gap-1">{DAYS.map((d, i) => (
              <button key={d} type="button" onClick={() => setF({ ...f, weekdays: f.weekdays.includes(i) ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i] })}
                className={cn("h-9 w-11 rounded-lg text-[0.78rem] font-medium ring-1 ring-inset", f.weekdays.includes(i) ? "bg-brand-500 text-on-brand ring-brand-500" : "text-ink ring-line-strong hover:bg-zinc-50")}>{d}</button>
            ))}</div>
          </div>
          <div><Label hint="one or more">Start times</Label>
            <div className="space-y-1.5">
              {f.times.map((t, i) => (
                <div key={i} className="flex gap-1.5"><Input type="time" value={t} onChange={(e) => setF({ ...f, times: f.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                  {f.times.length > 1 && <button type="button" onClick={() => setF({ ...f, times: f.times.filter((_, j) => j !== i) })} className="rounded px-2 text-ink-faint hover:bg-zinc-100" aria-label="Remove time"><Trash2 className="h-4 w-4" /></button>}</div>
              ))}
              <Button size="sm" onClick={() => setF({ ...f, times: [...f.times, "14:30"] })}><Plus className="h-3.5 w-3.5" />Another time</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2"><div><Label>From</Label><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div><div><Label>Until</Label><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div></div>
          <div><Label>How often</Label><Select value={String(f.every)} onChange={(e) => setF({ ...f, every: Number(e.target.value) })}><option value="1">Every week</option><option value="2">Every 2 weeks</option><option value="4">Every 4 weeks</option></Select></div>
          <div><Label hint="e.g. 26/12/2026, commas">Skip dates</Label><Input value={f.skip} onChange={(e) => setF({ ...f, skip: e.target.value })} placeholder="26/12/2026, 2/1/2027" /></div>
          <Button variant="primary" disabled={pending || !f.courseId} onClick={() => go(() => generateSessions({ ...f, skip: f.skip.split(",").map((x) => parseDate(x.trim())).filter((x): x is string => !!x) }))}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}Add dates
          </Button>
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <p className="text-[0.9375rem] font-semibold text-ink">Add one date</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Input type="date" value={one.date} onChange={(e) => setOne({ ...one, date: e.target.value })} />
          <Input type="time" value={one.time} onChange={(e) => setOne({ ...one, time: e.target.value })} />
        </div>
        <Button className="mt-2 w-full" disabled={pending || !one.date} onClick={() => go(() => addSession({ courseId: f.courseId, date: one.date, time: one.time }), "Date added.")}>Add</Button>
      </div>
      {msg && <p className={cn("text-[0.8125rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </div>
  );
}
