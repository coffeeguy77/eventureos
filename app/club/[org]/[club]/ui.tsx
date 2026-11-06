"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronLeft, ChevronRight, List, Loader2, Lock, Minus, Plus, Trash2, X, ShoppingBag, Coffee } from "lucide-react";
import { daysText, priceOrder, serviceHours, type ClubDay, type ClubRates, type Offer, type StandardOrder, type PricedLine } from "@/lib/club/core";
import type { ClubBooking } from "@/lib/club/server";
import { bookAction, removeQuoteAction, saveQuoteAction, sendCodeAction, signOutAction, verifyCodeAction } from "./actions";

interface Brand { name: string; logo: string | null; colour: string; phone: string | null; email: string | null }
const aud = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
const input = "h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-[0.9375rem] text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200";
const label = "mb-1 block text-[0.8125rem] font-medium text-zinc-700";

function Header({ brand, clubName, account, right }: { brand: Brand; clubName: string; account: string; right?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {brand.logo ? <img src={brand.logo} alt={brand.name} className="h-10 w-auto max-w-[140px] object-contain" /> : <span className="text-[1.125rem] font-semibold text-zinc-900">{brand.name}</span>}
        <div className="min-w-0 border-l border-zinc-200 pl-3">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: brand.colour }}>{clubName}</p>
          <p className="truncate text-[1rem] font-semibold text-zinc-900">{account}</p>
        </div>
      </div>
      {right}
    </header>
  );
}

/* ------------------------------------------------------------------ sign in */

export function ClubLogin({ org, club, clubName, account, brand }: { org: string; club: string; clubName: string; account: string; brand: Brand }) {
  const router = useRouter();
  const [who, setWho] = useState("");
  const [ticket, setTicket] = useState<{ ticket: string; to: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const send = () => start(async () => {
    setErr(null);
    const r = await sendCodeAction(org, club, who);
    if (r.ok) { setTicket(r.data); setCode(""); } else setErr(r.error);
  });
  const verify = () => start(async () => {
    setErr(null);
    const r = await verifyCodeAction(org, club, ticket!.ticket, code);
    if (r.ok) router.refresh(); else setErr(r.error);
  });
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <Header brand={brand} clubName={clubName} account={account} />
        <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <h1 className="text-[1.25rem] font-semibold tracking-tight text-zinc-900">Sign in to book</h1>
          {!ticket ? (
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-4 space-y-3">
              <p className="text-[0.875rem] text-zinc-600">Use the email or mobile {brand.name} has for you at {account}. We&apos;ll send a one-time code — no password.</p>
              <div><label className={label} htmlFor="who">Email or mobile</label><input id="who" className={input} value={who} onChange={(e) => setWho(e.target.value)} autoComplete="email" inputMode="email" placeholder="you@company.com.au or 04…" /></div>
              <button disabled={busy || !who.trim()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[0.9375rem] font-semibold text-white disabled:opacity-50" style={{ background: brand.colour }}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Send my code</button>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="mt-4 space-y-3">
              <p className="text-[0.875rem] text-zinc-600">If you&apos;re on the list, a 6-digit code is on its way to {ticket.to}.</p>
              <div><label className={label} htmlFor="code">Code</label><input id="code" className={`${input} text-center text-[1.25rem] tracking-[0.4em]`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus /></div>
              <button disabled={busy || code.length !== 6} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[0.9375rem] font-semibold text-white disabled:opacity-50" style={{ background: brand.colour }}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Sign in</button>
              <button type="button" onClick={() => { setTicket(null); setErr(null); }} className="w-full text-[0.8125rem] text-zinc-500 underline">Use a different email or mobile</button>
            </form>
          )}
          {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[0.8125rem] text-red-700 ring-1 ring-red-100">{err}</p>}
        </div>
        <p className="mt-6 text-center text-[0.75rem] text-zinc-500">Not on the list? Contact {brand.name}{brand.phone ? ` on ${brand.phone}` : ""}{brand.email ? ` or ${brand.email}` : ""}.</p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ the club */

interface Props {
  org: string; club: string; base: string; clubName: string; account: string; brand: Brand; today: string; me: { id: string | null; name: string; staff: string | null; actingFor: string | null };
  offers: Offer[]; rates: ClubRates; standards: StandardOrder[]; billing: "on_booking" | "monthly"; bookings: ClubBooking[]; wholesale: string | null; open: string | null;
}
type Draft = { booked?: boolean; id: string | null; title: string; venue: string; address: string; notes: string; days: ClubDay[]; carts: number; van: number; baristas: number; coffees: number; hours: number };

const blank = (offers: Offer[]): Draft => ({ id: null, title: "", venue: "", address: "", notes: "", days: [{ date: "", start: null, finish: null }], carts: offers.includes("cart") ? 1 : 0, van: 0, baristas: 0, coffees: 0, hours: 0 });
const fromBooking = (b: ClubBooking): Draft => ({ id: b.id, title: b.title, venue: b.venue ?? "", address: b.address ?? "", notes: b.notes ?? "", days: b.days.length ? b.days : [{ date: "", start: null, finish: null }], carts: b.carts, van: b.van, baristas: b.baristas, coffees: b.coffees, hours: 0 });
const what = (b: Pick<ClubBooking, "carts" | "van" | "baristas" | "coffees">) => [b.carts ? `${b.carts} cart${b.carts > 1 ? "s" : ""}` : "", b.van ? `${b.van} van${b.van > 1 ? "s" : ""}` : "", b.baristas ? `${b.baristas} barista${b.baristas > 1 ? "s" : ""}` : "", b.coffees ? `${b.coffees} coffees` : ""].filter(Boolean).join(" · ");
const stamp = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "");

export function ClubApp(p: Props) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [draft, setDraft] = useState<Draft | null>(() => { const b = p.open ? p.bookings.find((x) => x.id === p.open && x.status === "quote") : null; return b ? fromBooking(b) : null; });
  const [viewing, setViewing] = useState<ClubBooking | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const openBooking = (b: ClubBooking) => (b.status === "quote" ? setDraft(fromBooking(b)) : setViewing(b));
  const editBooked = (b: ClubBooking) => { setViewing(null); setDraft({ ...fromBooking(b), booked: true }); };
  const upcoming = p.bookings.filter((b) => (b.last_day ?? "") >= p.today);
  const past = p.bookings.filter((b) => (b.last_day ?? "") < p.today).reverse();
  const quotes = upcoming.filter((b) => b.status === "quote").length;

  const acceptNow = (b: ClubBooking) => start(async () => {
    const r = await bookAction(p.org, p.club, b.id);
    if (r.ok) { setFlash(`${b.title} is booked${r.data.invoice ? ` — invoice ${r.data.invoice} is on its way` : ""}.`); router.refresh(); } else setFlash(r.error);
  });

  return (
    <main className="min-h-screen bg-zinc-50 px-4 pb-16 pt-6">
      <div className="mx-auto max-w-4xl">
        {p.me.staff && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-[0.8125rem] text-amber-900 ring-1 ring-amber-200">
            <span><b>Staff view</b> — {p.me.actingFor ? `booking on behalf of ${p.me.actingFor} (their emails go to them)` : `you're in as ${p.me.staff}`}. The client sees this page without this bar.</span>
            <button onClick={() => start(async () => { await signOutAction(p.org, p.club); router.refresh(); })} className="font-semibold underline">Leave staff view</button>
          </div>
        )}
        <Header brand={p.brand} clubName={p.clubName} account={p.account} right={
          <div className="flex items-center gap-3 text-[0.8125rem] text-zinc-600">
            <span className="hidden sm:inline">Hi {(p.me.actingFor ?? p.me.staff ?? p.me.name).split(/\s+/)[0]}</span>
            <button onClick={() => start(async () => { await signOutAction(p.org, p.club); router.refresh(); })} className="rounded-lg px-2.5 py-1.5 font-medium text-zinc-700 ring-1 ring-zinc-300 hover:bg-white">Sign out</button>
          </div>
        } />

        {p.wholesale && (
          <nav className="mt-5 inline-flex rounded-xl bg-white p-1 ring-1 ring-zinc-200">
            <span className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.875rem] font-semibold text-white" style={{ background: p.brand.colour }}><Coffee className="h-4 w-4" />Event hire</span>
            <a href={p.wholesale} target="_blank" rel="noopener" className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.875rem] font-medium text-zinc-700 hover:bg-zinc-50"><ShoppingBag className="h-4 w-4" />Wholesale</a>
          </nav>
        )}

        <section className="mt-5 flex flex-wrap items-center gap-2">
          <button onClick={() => setDraft(blank(p.offers))} className="flex h-11 items-center gap-1.5 rounded-xl px-4 text-[0.9375rem] font-semibold text-white" style={{ background: p.brand.colour }}><Plus className="h-4 w-4" />New booking</button>
          {p.standards.map((s, i) => (
            <button key={i} onClick={() => setDraft({ ...blank(p.offers), carts: s.carts, van: s.van, baristas: s.baristas, coffees: s.coffees, hours: s.hours, title: "" })} className="h-11 rounded-xl bg-white px-4 text-[0.875rem] font-medium text-zinc-800 ring-1 ring-zinc-300 hover:bg-zinc-50">
              {s.name}<span className="ml-1.5 text-zinc-500">({what(s)}{s.hours ? `, ${s.hours} hrs` : ""})</span>
            </button>
          ))}
          <div className="ml-auto inline-flex rounded-xl bg-white p-1 ring-1 ring-zinc-200">
            {([["list", List, "List"], ["calendar", CalendarDays, "Calendar"]] as const).map(([k, Icon, l]) => (
              <button key={k} onClick={() => setView(k)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium ${view === k ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}><Icon className="h-4 w-4" />{l}</button>
            ))}
          </div>
        </section>

        {flash && <p className="mt-4 flex items-start justify-between gap-3 rounded-xl bg-white px-4 py-3 text-[0.875rem] text-zinc-800 ring-1 ring-zinc-200"><span>{flash}</span><button onClick={() => setFlash(null)} aria-label="Dismiss"><X className="h-4 w-4 text-zinc-400" /></button></p>}
        {quotes > 0 && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[0.875rem] text-red-800 ring-1 ring-red-100">{quotes} quote{quotes > 1 ? "s aren't" : " isn't"} booked yet — open {quotes > 1 ? "one" : "it"} and hit <b>Book</b> to lock in the date.</p>}

        {view === "list" ? (
          <section className="mt-5 space-y-3">
            {!upcoming.length && <p className="rounded-2xl bg-white p-8 text-center text-[0.9375rem] text-zinc-500 ring-1 ring-zinc-200">Nothing coming up. Tap <b>New booking</b> to start a quote.</p>}
            {upcoming.map((b) => <Card key={b.id} b={b} brand={p.brand} onOpen={() => openBooking(b)} onBook={() => acceptNow(b)} busy={busy} />)}
            {past.length > 0 && (
              <details className="pt-4">
                <summary className="cursor-pointer text-[0.8125rem] font-medium text-zinc-500">Recent ({past.length})</summary>
                <div className="mt-3 space-y-3 opacity-80">{past.map((b) => <Card key={b.id} b={b} brand={p.brand} onOpen={() => openBooking(b)} busy={busy} />)}</div>
              </details>
            )}
          </section>
        ) : (
          <Month bookings={p.bookings} today={p.today} onOpen={openBooking} colour={p.brand.colour} />
        )}

        <p className="mt-10 text-center text-[0.75rem] text-zinc-500">
          {p.billing === "monthly" ? "Bookings are invoiced together at the end of each month." : "Your invoice is sent when you book."} Questions? {p.brand.phone ? `Call ${p.brand.phone}` : ""}{p.brand.phone && p.brand.email ? " or " : ""}{p.brand.email ? `email ${p.brand.email}` : ""}.
        </p>
      </div>

      {draft && <Editor p={p} draft={draft} onClose={() => setDraft(null)} onDone={(m) => { setDraft(null); setFlash(m); router.refresh(); }} />}
      {viewing && <Viewer b={viewing} brand={p.brand} onClose={() => setViewing(null)} onEdit={p.me.staff ? () => editBooked(viewing) : undefined} />}
    </main>
  );
}

function Badge({ b }: { b: ClubBooking }) {
  return b.status === "booked"
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-emerald-700 ring-1 ring-emerald-200"><Check className="h-3 w-3" />Booked</span>
    : <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">Not booked</span>;
}

function Card({ b, brand, onOpen, onBook, busy }: { b: ClubBooking; brand: Brand; onOpen: () => void; onBook?: () => void; busy: boolean }) {
  const quote = b.status === "quote";
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 sm:p-5 ${quote ? "ring-red-300" : "ring-zinc-200"}`} style={quote ? { borderLeft: "4px solid #dc2626" } : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2"><Badge b={b} /><span className="text-[0.75rem] text-zinc-400">#{b.number}</span></div>
          <p className="mt-1.5 text-[1rem] font-semibold text-zinc-900">{b.title}</p>
          <p className="text-[0.875rem] text-zinc-700">{daysText(b.days)}{b.days[0]?.start ? ` · ${b.days[0].start}–${b.days[0].finish ?? ""}` : ""}</p>
          <p className="text-[0.8125rem] text-zinc-500">{what(b)}{b.venue || b.address ? ` · ${b.venue || b.address}` : ""}</p>
          <p className="mt-1.5 text-[0.75rem] text-zinc-500">{quote ? `Quote by ${b.created_by_name ?? "—"}${b.updated_by_name && b.updated_by_name !== b.created_by_name ? `, changed by ${b.updated_by_name}` : ""}` : `Booked by ${b.booked_by_name ?? "—"} · ${stamp(b.booked_at)}`}</p>
        </button>
        <div className="flex flex-col items-end gap-2">
          <p className="text-[1rem] font-semibold text-zinc-900">{aud(b.total)}<span className="ml-1 text-[0.6875rem] font-normal text-zinc-500">inc GST</span></p>
          {quote && onBook && <button disabled={busy} onClick={onBook} className="h-9 rounded-lg px-3.5 text-[0.8125rem] font-semibold text-white disabled:opacity-50" style={{ background: brand.colour }}>Book</button>}
        </div>
      </div>
    </div>
  );
}

function Month({ bookings, today, onOpen, colour }: { bookings: ClubBooking[]; today: string; onOpen: (b: ClubBooking) => void; colour: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = new Date(`${month}-01T12:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const byDay = useMemo(() => { const m = new Map<string, ClubBooking[]>(); for (const b of bookings) for (const d of b.days) m.set(d.date, [...(m.get(d.date) ?? []), b]); return m; }, [bookings]);
  const shift = (n: number) => { const d = new Date(first); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  return (
    <section className="mt-5 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="rounded-lg p-2 hover:bg-zinc-100" aria-label="Previous month"><ChevronLeft className="h-5 w-5 text-zinc-600" /></button>
        <p className="text-[0.9375rem] font-semibold text-zinc-900">{new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}</p>
        <button onClick={() => shift(1)} className="rounded-lg p-2 hover:bg-zinc-100" aria-label="Next month"><ChevronRight className="h-5 w-5 text-zinc-600" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.6875rem] font-medium uppercase text-zinc-400">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => (
          <div key={i} className={`min-h-[64px] rounded-lg p-1 sm:min-h-[84px] ${d ? "bg-zinc-50" : ""} ${d === today ? "ring-2 ring-zinc-400" : ""}`}>
            {d && <p className="text-[0.75rem] text-zinc-500">{Number(d.slice(8))}</p>}
            {d && (byDay.get(d) ?? []).map((b) => (
              <button key={b.id} onClick={() => onOpen(b)} title={`${b.title} — ${b.status === "quote" ? "not booked" : `booked by ${b.booked_by_name}`}`}
                className={`mt-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[0.625rem] font-medium sm:text-[0.6875rem] ${b.status === "quote" ? "bg-red-100 text-red-800 ring-1 ring-red-300" : "text-white"}`}
                style={b.status === "booked" ? { background: colour } : undefined}>{b.title}</button>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-4 text-[0.75rem] text-zinc-500"><span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: colour }} />Booked</span><span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-100 ring-1 ring-red-300" />Not booked</span></p>
    </section>
  );
}

function Lines({ lines, subtotal, total }: { lines: PricedLine[]; subtotal: number; total: number }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
      {!lines.length && <p className="text-[0.8125rem] text-zinc-500">Choose a date and what you need to see the price.</p>}
      {lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-3 border-b border-zinc-200 py-1.5 last:border-0">
          <div className="min-w-0"><p className="text-[0.875rem] font-medium text-zinc-900">{l.label}</p><p className="text-[0.75rem] text-zinc-500">{l.qty} × {aud(l.unit)} · {l.note}</p></div>
          <p className="shrink-0 text-[0.875rem] font-medium text-zinc-900">{aud(l.amount)}</p>
        </div>
      ))}
      {lines.length > 0 && (
        <div className="mt-2 space-y-0.5 text-right text-[0.8125rem] text-zinc-600">
          <p>Subtotal {aud(subtotal)} · GST {aud(Math.round(subtotal * 10) / 100)}</p>
          <p className="text-[1.0625rem] font-semibold text-zinc-900">Total {aud(total)}</p>
        </div>
      )}
    </div>
  );
}

function Stepper({ name, value, set, max }: { name: string; value: number; set: (n: number) => void; max: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-300">
      <span className="text-[0.875rem] font-medium text-zinc-800">{name}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => set(Math.max(0, value - 1))} className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-100 text-zinc-700" aria-label={`Fewer ${name}`}><Minus className="h-4 w-4" /></button>
        <span className="w-6 text-center text-[1rem] font-semibold text-zinc-900">{value}</span>
        <button type="button" onClick={() => set(Math.min(max, value + 1))} className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-100 text-zinc-700" aria-label={`More ${name}`}><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

const addHours = (t: string, h: number) => { const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + Math.round(h * 60); return m < 1440 ? `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` : "23:59"; };

function Editor({ p, draft, onClose, onDone }: { p: Props; draft: Draft; onClose: () => void; onDone: (m: string) => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const has = (o: Offer) => p.offers.includes(o);
  const timesNeeded = has("baristas") || has("van");
  const others = useMemo(() => p.bookings.filter((b) => b.status === "booked" && b.carts > 0 && b.id !== d.id).flatMap((b) => b.days.map((x) => x.date)), [p.bookings, d.id]);
  const days = d.days.filter((x) => x.date);
  const priced = priceOrder({ days: [...days].sort((a, b) => a.date.localeCompare(b.date)), carts: d.carts, van: d.van, baristas: d.baristas, coffees: d.coffees }, p.rates, others);
  const setDay = (i: number, patch: Partial<ClubDay>) => setD((x) => ({ ...x, days: x.days.map((y, j) => {
    if (j !== i) return y;
    const n = { ...y, ...patch };
    if (patch.start && x.hours && !y.finish) n.finish = addHours(patch.start, x.hours);
    return n;
  }) }));
  const addDay = () => setD((x) => { const last = x.days[x.days.length - 1]; let next = ""; if (last?.date) { const t = new Date(`${last.date}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); next = t.toISOString().slice(0, 10); } return { ...x, days: [...x.days, { date: next, start: last?.start ?? null, finish: last?.finish ?? null }] }; });
  const save = (book: boolean) => start(async () => {
    setErr(null);
    const r = await saveQuoteAction(p.org, p.club, d.id, { title: d.title, venue: d.venue, address: d.address, notes: d.notes, order: { days, carts: d.carts, van: d.van, baristas: d.baristas, coffees: d.coffees } }, book);
    if (!r.ok) { setErr(r.error); return; }
    if (r.data.changed) { onDone(`Booking changed — the job and deliveries are updated.${r.data.invoiceToFix ? ` Invoice ${r.data.invoiceToFix} wasn't changed: update it in Invoices.` : ""}`); return; }
    onDone(r.data.booked ? `${d.title} is booked${r.data.invoice ? ` — invoice ${r.data.invoice} is on its way` : ""}. You'll get a confirmation email.` : `Quote saved. It stays editable until someone books it.`);
  });
  const remove = () => start(async () => {
    if (!d.id) { onClose(); return; }
    const r = await removeQuoteAction(p.org, p.club, d.id);
    if (r.ok) onDone("Quote removed."); else setErr(r.error);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><p className={`text-[0.75rem] font-semibold uppercase tracking-wide ${d.booked ? "text-amber-700" : "text-red-600"}`}>{d.booked ? "Booked · staff change" : d.id ? "Quote · not booked" : "New quote"}</p><h2 className="text-[1.25rem] font-semibold text-zinc-900">{d.title || "Your booking"}</h2></div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-zinc-100" aria-label="Close"><X className="h-5 w-5 text-zinc-500" /></button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={label}>Job / client</label><input className={input} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Smith wedding, or the conference name" /></div>
          <div><label className={label}>Venue</label><input className={input} value={d.venue} onChange={(e) => setD({ ...d, venue: e.target.value })} placeholder="e.g. Ballroom, Level 1" /></div>
          <div><label className={label}>Address</label><input className={input} value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} placeholder="Street, suburb" /></div>
        </div>

        <div className="mt-5">
          <p className={label}>{d.days.length > 1 ? "Days" : "Date"}</p>
          <div className="space-y-2">
            {d.days.map((x, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-200">
                <div className="min-w-[150px] flex-1"><span className="text-[0.6875rem] text-zinc-500">Date</span><input type="date" min={p.today} className={input} value={x.date} onChange={(e) => setDay(i, { date: e.target.value })} /></div>
                {timesNeeded && <>
                  <div className="w-[118px]"><span className="text-[0.6875rem] text-zinc-500">Service starts</span><input type="time" className={input} value={x.start ?? ""} onChange={(e) => setDay(i, { start: e.target.value || null })} /></div>
                  <div className="w-[118px]"><span className="text-[0.6875rem] text-zinc-500">Finishes</span><input type="time" className={input} value={x.finish ?? ""} onChange={(e) => setDay(i, { finish: e.target.value || null })} /></div>
                </>}
                {d.days.length > 1 && <button type="button" onClick={() => setD({ ...d, days: d.days.filter((_, j) => j !== i) })} className="grid h-11 w-11 place-items-center rounded-xl text-zinc-500 hover:bg-white" aria-label="Remove day"><Trash2 className="h-4 w-4" /></button>}
                {d.baristas > 0 && serviceHours(x) > 0 && <p className="w-full text-[0.75rem] text-zinc-500">{serviceHours(x)} hrs service</p>}
              </div>
            ))}
          </div>
          <button type="button" onClick={addDay} className="mt-2 flex items-center gap-1.5 text-[0.8125rem] font-medium text-zinc-700 underline"><Plus className="h-3.5 w-3.5" />Add another day</button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {has("cart") && <Stepper name="Coffee carts" value={d.carts} set={(n) => setD({ ...d, carts: n })} max={6} />}
          {has("van") && <Stepper name="Coffee van" value={d.van} set={(n) => setD({ ...d, van: n })} max={2} />}
          {has("baristas") && <Stepper name="Baristas" value={d.baristas} set={(n) => setD({ ...d, baristas: n })} max={10} />}
          {has("coffees") && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-300">
              <span className="text-[0.875rem] font-medium text-zinc-800">Coffees</span>
              <input type="number" min={0} step={10} inputMode="numeric" value={d.coffees || ""} onChange={(e) => setD({ ...d, coffees: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className="h-9 w-24 rounded-lg border border-zinc-300 px-2 text-right text-[0.9375rem] text-zinc-900" placeholder="0" />
            </div>
          )}
        </div>
        {priced.covered.length > 0 && <p className="mt-2 text-[0.8125rem] text-emerald-700">No delivery charge{priced.covered.length > 1 ? " on some days" : ""} — a cart is already with you around then.</p>}

        <div className="mt-4"><label className={label}>Notes for us (optional)</label><textarea className={`${input} h-20 py-2`} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Access, power, contact on the day…" /></div>

        <div className="mt-5"><Lines lines={priced.lines} subtotal={priced.subtotal} total={priced.total} /></div>
        {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[0.8125rem] text-red-700 ring-1 ring-red-100">{err}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {d.id && !d.booked && <button disabled={busy} onClick={remove} className="h-11 rounded-xl px-4 text-[0.875rem] font-medium text-red-700 hover:bg-red-50">Remove quote</button>}
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            {!d.booked && <button disabled={busy} onClick={() => save(false)} className="h-11 rounded-xl bg-white px-4 text-[0.9375rem] font-medium text-zinc-800 ring-1 ring-zinc-300 hover:bg-zinc-50 disabled:opacity-50">Save quote</button>}
            <button disabled={busy} onClick={() => save(!d.booked)} className="flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[0.9375rem] font-semibold text-white disabled:opacity-50" style={{ background: p.brand.colour }}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}<Lock className="h-4 w-4" />{d.booked ? "Save changes" : "Book it"}</button>
          </div>
        </div>
        <p className="mt-2 text-right text-[0.75rem] text-zinc-500">Booking locks it in{p.billing === "monthly" ? " (invoiced at month end)" : " and sends your invoice"}.</p>
      </div>
    </div>
  );
}

function Viewer({ b, brand, onClose, onEdit }: { b: ClubBooking; brand: Brand; onClose: () => void; onEdit?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><Badge b={b} /><h2 className="mt-1.5 text-[1.25rem] font-semibold text-zinc-900">{b.title}</h2></div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-zinc-100" aria-label="Close"><X className="h-5 w-5 text-zinc-500" /></button>
        </div>
        <dl className="mt-4 space-y-2 text-[0.875rem]">
          <div className="flex gap-3"><dt className="w-24 shrink-0 text-zinc-500">When</dt><dd className="text-zinc-900">{b.days.map((x) => `${daysText([x])}${x.start ? ` ${x.start}–${x.finish ?? ""}` : ""}`).join("; ")}</dd></div>
          <div className="flex gap-3"><dt className="w-24 shrink-0 text-zinc-500">What</dt><dd className="text-zinc-900">{what(b)}</dd></div>
          {(b.venue || b.address) && <div className="flex gap-3"><dt className="w-24 shrink-0 text-zinc-500">Where</dt><dd className="text-zinc-900">{[b.venue, b.address].filter(Boolean).join(", ")}</dd></div>}
          <div className="flex gap-3"><dt className="w-24 shrink-0 text-zinc-500">Booked by</dt><dd className="text-zinc-900">{b.booked_by_name} · {stamp(b.booked_at)}</dd></div>
          {b.notes && <div className="flex gap-3"><dt className="w-24 shrink-0 text-zinc-500">Notes</dt><dd className="whitespace-pre-line text-zinc-900">{b.notes}</dd></div>}
        </dl>
        <div className="mt-4"><Lines lines={b.lines} subtotal={b.subtotal} total={b.total} /></div>
        {onEdit && <button onClick={onEdit} className="mt-4 h-10 w-full rounded-xl bg-amber-50 text-[0.875rem] font-semibold text-amber-900 ring-1 ring-amber-200">Staff: change this booking</button>}
        <p className="mt-4 flex items-center gap-2 text-[0.8125rem] text-zinc-500"><Lock className="h-4 w-4" />Booked and locked. Need a change? Contact {brand.name}{brand.phone ? ` on ${brand.phone}` : ""}.</p>
      </div>
    </div>
  );
}
