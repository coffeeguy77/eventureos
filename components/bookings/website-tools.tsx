"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, KeyRound, Loader2, Upload } from "lucide-react";
import { createPluginKey, importCsvAction, revokePluginKey, saveBookingSettings } from "@/app/(app)/bookings/actions";
import type { BookingSettings, Landing } from "@/lib/bookings/core";
import type { CsvRow } from "@/lib/bookings/import";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";

const fail = { ok: false as const, error: "Couldn't reach the server." };

export function CopyField({ value, label, multiline, open }: { value: string; label?: string; multiline?: boolean; open?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1800); }).catch(() => undefined);
  return (
    <div>
      {label && <p className="mb-1 text-[0.75rem] font-medium text-ink-muted">{label}</p>}
      <div className="flex items-stretch gap-1.5">
        {multiline
          ? <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg bg-zinc-50 px-3 py-2 font-mono text-[0.75rem] text-ink ring-1 ring-inset ring-line">{value}</pre>
          : <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg bg-zinc-50 px-3 py-2 font-mono text-[0.75rem] text-ink ring-1 ring-inset ring-line" />}
        <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 text-[0.75rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50" aria-label="Copy">
          {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{done ? "Copied" : "Copy"}
        </button>
        {open && <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center rounded-lg px-2.5 text-ink-muted ring-1 ring-inset ring-line-strong hover:bg-zinc-50" aria-label="Open"><ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>
    </div>
  );
}

interface Key { id: string; label: string; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }

export function PluginKeys({ keys }: { keys: Key[] }) {
  const router = useRouter();
  const [fresh, setFresh] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const live = keys.filter((k) => !k.revoked_at);
  return (
    <div className="space-y-2">
      {fresh && (
        <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-200">
          <p className="mb-1.5 text-[0.78rem] font-medium text-amber-900">Copy this key now — it won&apos;t be shown again. Paste it into the plugin settings in WordPress.</p>
          <CopyField value={fresh} />
        </div>
      )}
      {live.map((k) => (
        <div key={k.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[0.8125rem] ring-1 ring-inset ring-line">
          <KeyRound className="h-4 w-4 shrink-0 text-ink-faint" />
          <span className="min-w-0 flex-1 truncate"><b className="font-medium text-ink">{k.label}</b> <span className="font-mono text-[0.75rem] text-ink-faint">{k.key_prefix}…</span><span className="block text-[0.72rem] text-ink-faint">{k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString("en-AU")}` : "Not used yet"}</span></span>
          <button type="button" disabled={pending} onClick={() => start(async () => { const r = await revokePluginKey(k.id).catch(() => fail); setMsg(r.ok ? r.data : r.error); router.refresh(); })} className="text-[0.75rem] font-medium text-rose-700 hover:underline">Revoke</button>
        </div>
      ))}
      <Button size="sm" disabled={pending} onClick={() => start(async () => {
        setMsg(null);
        const r = await createPluginKey("WordPress website").catch(() => fail);
        if (r.ok) { setFresh(r.data.key); router.refresh(); } else setMsg(r.error);
      })}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}Make a plugin key</Button>
      {msg && <p className="text-[0.78rem] text-ink-muted">{msg}</p>}
    </div>
  );
}

/** A small CSV reader (quoted fields, commas or semicolons, Excel BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = (src.split("\n")[0].match(/;/g)?.length ?? 0) > (src.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((c) => c.trim())) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const FIELDS: { key: keyof CsvRow; label: string; match: RegExp }[] = [
  { key: "date", label: "Date", match: /^(date|session date|class date|start date|appointment date|booking date|start)$/i },
  { key: "time", label: "Time", match: /^(time|start time|session time|class time)$/i },
  { key: "course", label: "Course", match: /^(course|class|service|event|class name|experience|product)$/i },
  { key: "name", label: "Name", match: /^(name|customer|customer name|full name|guest|guest name|attendee|student)$/i },
  { key: "email", label: "Email", match: /^(e-?mail|customer email|email address)$/i },
  { key: "phone", label: "Phone", match: /^(phone|mobile|customer phone|phone number)$/i },
  { key: "seats", label: "Seats", match: /^(seats|qty|quantity|persons|number of persons|guests|tickets|spots)$/i },
  { key: "status", label: "Status", match: /^(status|booking status)$/i },
  { key: "ref", label: "Reference", match: /^(id|ref|reference|booking id|booking ref|order|order id|booking number)$/i },
  { key: "paid", label: "Paid", match: /^(paid|amount|total|price|amount paid)$/i },
];

export function CsvImport() {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Partial<Record<keyof CsvRow, number>>>({});
  const [source, setSource] = useState("import");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const load = async (f: File) => {
    setMsg(null);
    const data = parseCsv(await f.text());
    if (data.length < 2) { setMsg({ ok: false, text: "That file has no rows." }); return; }
    const head = data[0].map((h) => h.trim());
    const m: Partial<Record<keyof CsvRow, number>> = {};
    for (const fl of FIELDS) { const i = head.findIndex((h) => fl.match.test(h)); if (i >= 0) m[fl.key] = i; }
    // "Start" with date and time together → use for both
    if (m.date !== undefined && m.time === undefined) m.time = m.date;
    setMap(m); setRows(data);
    setSource(/bento/i.test(f.name) ? "classbento" : /bookly/i.test(f.name) ? "bookly" : "import");
  };
  const ready = rows && ["date", "time", "course", "name"].every((k) => map[k as keyof CsvRow] !== undefined);
  return (
    <div>
      <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} />
      <Button size="sm" onClick={() => file.current?.click()}><Upload className="h-3.5 w-3.5" />Choose CSV file</Button>
      {rows && (
        <div className="mt-3 space-y-2 rounded-lg bg-zinc-50 p-3">
          <p className="text-[0.78rem] text-ink-muted">{rows.length - 1} rows. Check the columns:</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FIELDS.map((fl) => (
              <label key={fl.key} className="text-[0.75rem] text-ink">{fl.label}{["date", "time", "course", "name"].includes(fl.key) ? " *" : ""}
                <select value={map[fl.key] ?? ""} onChange={(e) => setMap({ ...map, [fl.key]: e.target.value === "" ? undefined : Number(e.target.value) })} className="mt-0.5 block w-full rounded border border-line-strong bg-surface px-1.5 py-1 text-[0.75rem]">
                  <option value="">—</option>{rows[0].map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
            <label className="text-[0.75rem] text-ink">Came from
              <select value={source} onChange={(e) => setSource(e.target.value)} className="mt-0.5 block w-full rounded border border-line-strong bg-surface px-1.5 py-1 text-[0.75rem]"><option value="import">Other</option><option value="classbento">ClassBento</option><option value="bookly">Bookly</option><option value="woocommerce">WooCommerce</option></select>
            </label>
          </div>
          <Button size="sm" variant="primary" disabled={!ready || pending} onClick={() => start(async () => {
            const list: CsvRow[] = rows.slice(1).map((r) => {
              const g = (k: keyof CsvRow) => (map[k] !== undefined ? (r[map[k]!] ?? "").trim() : "");
              return { date: g("date"), time: g("time"), course: g("course"), name: g("name"), email: g("email"), phone: g("phone"), seats: g("seats"), status: g("status"), ref: g("ref"), paid: g("paid"), source };
            });
            const res = await importCsvAction(list).catch(() => fail);
            setMsg(res.ok ? { ok: true, text: res.data } : { ok: false, text: res.error });
            if (res.ok) { setRows(null); router.refresh(); }
          })}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Import {rows.length - 1} rows</Button>
        </div>
      )}
      {msg && <p className={cn("mt-2 text-[0.78rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </div>
  );
}

export function SettingsForm({ initial }: { initial: BookingSettings }) {
  const router = useRouter();
  const [s, setS] = useState({ ...initial, gift_amounts_text: initial.gift_amounts.join(", "), facebook: initial.social.facebook ?? "", instagram: initial.social.instagram ?? "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const num = (k: keyof BookingSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  const txt = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value });
  const chk = (k: keyof BookingSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.checked });
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <h2 className="text-[0.9375rem] font-semibold text-ink">How bookings work</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label hint="min 30">Hold a seat while paying (min)</Label><Input type="number" min={30} max={120} value={s.hold_minutes} onChange={num("hold_minutes")} /></div>
        <div><Label>Customers can change / cancel up to (hours before)</Label><Input type="number" min={0} value={s.cancel_hours} onChange={num("cancel_hours")} /></div>
        <div><Label hint="0 = off">Reminder email (hours before)</Label><Input type="number" min={0} value={s.reminder_hours} onChange={num("reminder_hours")} /></div>
        <div><Label hint="min 36 (law)">Gift certificates valid (months)</Label><Input type="number" min={36} value={s.gift_expiry_months} onChange={num("gift_expiry_months")} /></div>
        <div className="sm:col-span-2"><Label hint="besides course gifts, e.g. 50, 100">Gift dollar amounts</Label><Input value={s.gift_amounts_text} onChange={txt("gift_amounts_text")} /></div>
        <div className="sm:col-span-2"><Label hint="for the thank-you email">Review link</Label><Input value={s.review_url ?? ""} onChange={txt("review_url")} placeholder="https://g.page/r/…" /></div>
        <div className="sm:col-span-2"><Label hint="default: business email">New-booking alerts to</Label><Input type="email" value={s.notify_email ?? ""} onChange={txt("notify_email")} /></div>
        <div className="sm:col-span-2"><Label hint="default: business email">Customer replies go to</Label><Input type="email" value={s.reply_to ?? ""} onChange={txt("reply_to")} /></div>
        <div className="sm:col-span-2"><Label>Facebook page</Label><Input value={s.facebook} onChange={txt("facebook")} placeholder="https://facebook.com/…" /></div>
        <div className="sm:col-span-2"><Label>Instagram</Label><Input value={s.instagram} onChange={txt("instagram")} placeholder="https://instagram.com/…" /></div>
        <div className="sm:col-span-2 lg:col-span-4"><Label hint="top of the booking page">Welcome text</Label><Textarea value={s.intro ?? ""} onChange={txt("intro")} className="min-h-[60px]" /></div>
        <div className="sm:col-span-2 lg:col-span-4"><Label hint="customers tick to agree">Booking terms</Label><Textarea value={s.terms ?? ""} onChange={txt("terms")} className="min-h-[80px]" placeholder="Cancellation and refund policy…" /></div>
      </div>
      <div className="mt-5 rounded-lg border border-line p-3">
        <p className="text-[0.8438rem] font-semibold text-ink">Questions people ask</p>
        <p className="mb-2 text-[0.75rem] text-ink-muted">Shown beside the booking form, e.g. “Do I get a certificate?”, “Is there parking?”. What to bring and where you are come from each course.</p>
        <div className="space-y-2">
          {s.faqs.map((f, i) => (
            <div key={i} className="grid gap-1.5 rounded-lg bg-zinc-50 p-2 sm:grid-cols-[1fr_auto]">
              <Input value={f.q} placeholder="Question" onChange={(e) => setS({ ...s, faqs: s.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
              <button type="button" onClick={() => setS({ ...s, faqs: s.faqs.filter((_, j) => j !== i) })} className="rounded px-2 text-[0.75rem] font-medium text-rose-700 hover:bg-rose-50">Remove</button>
              <Textarea value={f.a} placeholder="Answer" className="min-h-[56px] sm:col-span-2" onChange={(e) => setS({ ...s, faqs: s.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
            </div>
          ))}
          {s.faqs.length < 12 && <Button size="sm" onClick={() => setS({ ...s, faqs: [...s.faqs, { q: "", a: "" }] })}>Add a question</Button>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[0.8125rem] text-ink">
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.enabled} onChange={chk("enabled")} />Online booking on</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.show_seats_left} onChange={chk("show_seats_left")} />Show seats left</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.waitlist} onChange={chk("waitlist")} />Waitlist when full</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.followup} onChange={chk("followup")} />Thank-you email after the class</label>
      </div>
      {msg && <p className={cn("mt-3 text-[0.8125rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      <Button variant="primary" className="mt-4" disabled={pending} onClick={() => start(async () => {
        setMsg(null);
        // The landing page has its own editor and save button
        const { gift_amounts_text, facebook, instagram, landing: _landing, ...rest } = s;
        const r = await saveBookingSettings({ ...rest, faqs: rest.faqs.filter((f) => f.q.trim() && f.a.trim()), gift_amounts: gift_amounts_text.split(/[,\s]+/).map(Number).filter((n) => n > 0), social: { facebook, instagram } }).catch(() => fail);
        setMsg(r.ok ? { ok: true, text: r.data } : { ok: false, text: r.error });
        if (r.ok) router.refresh();
      })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save settings</Button>
    </div>
  );
}

/** The public booking page as a landing page: what search engines show, the headline, photo, highlights and text sections. */
export function LandingForm({ initial, pageUrl }: { initial: Landing; pageUrl: string }) {
  const router = useRouter();
  const [l, setL] = useState({ ...initial, highlightsText: initial.highlights.join("\n"), heroImage: initial.heroImage ?? "", title: initial.title ?? "", description: initial.description ?? "", headline: initial.headline ?? "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const sections = l.sections;
  const setSection = (i: number, k: "heading" | "body", v: string) => setL({ ...l, sections: sections.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[0.9375rem] font-semibold text-ink">Booking page &amp; search (SEO)</h2>
        <a href={pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-700 hover:underline">Open the page <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
      <p className="mt-1 text-[0.8125rem] text-ink-muted">Your booking page is a full landing page: courses with photos, the booking form, and these words — so people searching (e.g. &ldquo;barista course Canberra&rdquo;) can find it.</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div><Label hint={`${l.title.length}/70`}>Search title</Label><Input value={l.title} maxLength={70} onChange={(e) => setL({ ...l, title: e.target.value })} placeholder="Barista Courses Canberra | Your Business" /></div>
        <div><Label>Headline on the page</Label><Input value={l.headline} maxLength={120} onChange={(e) => setL({ ...l, headline: e.target.value })} placeholder="Barista courses in Canberra" /></div>
        <div className="lg:col-span-2"><Label hint={`${l.description.length}/160 suggested`}>Search description</Label><Textarea value={l.description} maxLength={300} className="min-h-[60px]" onChange={(e) => setL({ ...l, description: e.target.value })} /></div>
        <div><Label hint="https://… (leave blank to use the first course photo)">Top photo</Label><Input value={l.heroImage} onChange={(e) => setL({ ...l, heroImage: e.target.value })} /></div>
        <div><Label hint="one per line, up to 6">Highlights</Label><Textarea value={l.highlightsText} className="min-h-[96px]" onChange={(e) => setL({ ...l, highlightsText: e.target.value })} placeholder={"Small groups\nDigital certificate"} /></div>
      </div>
      <div className="mt-5">
        <p className="mb-2 text-[0.8125rem] font-semibold text-ink">Text sections <span className="font-normal text-ink-muted">(shown under the courses — up to 8)</span></p>
        <div className="space-y-3">
          {sections.map((x, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-3">
              <div className="flex gap-2"><Input value={x.heading} placeholder="Heading" onChange={(e) => setSection(i, "heading", e.target.value)} />
                <button type="button" onClick={() => setL({ ...l, sections: sections.filter((_, j) => j !== i) })} className="rounded px-2 text-[0.75rem] font-medium text-rose-700 hover:bg-rose-50">Remove</button></div>
              <Textarea value={x.body} placeholder="Text (blank line = new paragraph)" className="min-h-[110px]" onChange={(e) => setSection(i, "body", e.target.value)} />
            </div>
          ))}
          {sections.length < 8 && <Button size="sm" onClick={() => setL({ ...l, sections: [...sections, { heading: "", body: "" }] })}>Add a section</Button>}
        </div>
      </div>
      {msg && <p className={cn("mt-3 text-[0.8125rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
      <Button variant="primary" className="mt-4" disabled={pending} onClick={() => start(async () => {
        setMsg(null);
        const landing: Landing = { title: l.title || null, description: l.description || null, headline: l.headline || null, heroImage: l.heroImage || null,
          highlights: l.highlightsText.split(/\n/).map((x) => x.trim()).filter(Boolean), sections: sections.filter((x) => x.heading.trim() && x.body.trim()) };
        const r = await saveBookingSettings({ landing }).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
        setMsg(r.ok ? { ok: true, text: "Saved — the page is updated." } : { ok: false, text: r.error });
        if (r.ok) router.refresh();
      })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save page</Button>
    </div>
  );
}
