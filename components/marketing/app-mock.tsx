/**
 * Faithful, lightweight recreations of the EventureOS interface (dark mode, pink accent) for the sales page.
 * Sample data is invented — no real customers. Each mock is a <figure role="img"> with a plain-language label.
 */
import {
  BarChart3, Bell, Calendar, CalendarCheck2, Check, ChevronDown, CircleDollarSign, ClipboardList, CreditCard, FileText, Globe,
  Inbox, LayoutDashboard, Mail, Plus, Receipt, Search, Settings, ShieldAlert, Sparkles, Users, Workflow,
} from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const NAV = [
  { i: LayoutDashboard, l: "Dashboard" }, { i: Inbox, l: "Enquiries", n: 7 }, { i: Workflow, l: "CRM" }, { i: FileText, l: "Quotes" },
  { i: CalendarCheck2, l: "Events" }, { i: Calendar, l: "Calendar" }, { i: Users, l: "Clients" }, { i: Receipt, l: "Invoices" },
  { i: CreditCard, l: "Payments" }, { i: Globe, l: "Customer Portal" }, { i: BarChart3, l: "Reports" }, { i: Settings, l: "Settings" },
];

export function AppFrame({ active, children, label, compact, className }: { active: string; children: React.ReactNode; label: string; compact?: boolean; className?: string }) {
  return (
    <figure role="img" aria-label={label} className={cx("mk-app relative text-left", className)}>
      <div className="flex items-center gap-2 border-b a-line px-4 py-2.5" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="mx-auto hidden rounded-md a-raise px-3 py-0.5 text-[10px] a-faint sm:block">app.eventureos.com.au</span>
      </div>
      <div className="flex" aria-hidden>
        {!compact && (
          <aside className="hidden w-[168px] shrink-0 border-r a-line py-3 md:block">
            <p className="mb-3 px-4 font-[family-name:var(--mk-serif)] text-[19px] leading-none tracking-tight">Eventure<span className="a-pink">OS</span></p>
            <ul className="space-y-0.5 px-2">
              {NAV.map(({ i: I, l, n }) => (
                <li key={l} className={cx("flex items-center gap-2 rounded-md px-2 py-[5px] text-[11px]", l === active ? "bg-[rgb(var(--a-pink)/.14)] text-white" : "a-muted")}>
                  <I className={cx("h-3.5 w-3.5", l === active && "a-pink")} />{l}
                  {n ? <span className="ml-auto rounded-full a-pink-bg px-1.5 text-[9px] font-semibold">{n}</span> : null}
                </li>
              ))}
            </ul>
          </aside>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 border-b a-line px-4 py-2">
            <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border a-line px-2.5 text-[10.5px] a-faint"><Search className="h-3 w-3" />Search clients, events, quotes…</div>
            <span className="hidden h-7 items-center gap-1 rounded-md a-pink-bg px-2.5 text-[10.5px] font-semibold sm:flex"><Plus className="h-3 w-3" />Create</span>
            <Bell className="h-3.5 w-3.5 a-muted" />
            <span className="hidden items-center gap-1 rounded-md border a-line px-2 py-1 text-[10px] sm:flex">Your business <ChevronDown className="h-3 w-3" /></span>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </figure>
  );
}

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-xl border a-line a-surface", className)}>
      <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5"><p className="text-[11px] font-semibold">{title}</p>{action}</div>
      <div className="px-3 pb-3">{children}</div>
    </div>
  );
}
const Chip = ({ children, tone = "muted" }: { children: React.ReactNode; tone?: "pink" | "green" | "amber" | "blue" | "muted" }) => (
  <span className={cx("a-chip", {
    pink: "bg-[rgb(var(--a-pink)/.15)] text-[rgb(var(--a-pink))]", green: "bg-[#34d399]/10 text-[#6ee7b7]", amber: "bg-[#fbbf24]/10 text-[#fcd34d]",
    blue: "bg-[#38bdf8]/10 text-[#7dd3fc]", muted: "bg-white/5 text-[rgb(var(--a-muted))]",
  }[tone])}>{children}</span>
);

/* ------------------------------------------------------------------ Dashboard */
export function DashboardMock() {
  const kpis = [["New enquiries", "7", "2 from your website form"], ["Quotes awaiting reply", "5", "$18,640 in play"], ["Events this week", "4", "2 need staff"], ["Outstanding", "$6,320", "1 overdue"]];
  const upcoming = [
    ["Thu 14", "Harbour & Vine — wedding", "Mobile bar · 180 guests", "Confirmed", "green"],
    ["Fri 15", "Northside Tech Summit", "Coffee cart · 2 days", "Deposit paid", "blue"],
    ["Sat 16", "Aurora Gala dinner", "Catering · 240 guests", "Staff needed", "amber"],
    ["Sun 17", "Wren & Co. launch", "Grazing + bar", "Quote accepted", "pink"],
  ] as const;
  return (
    <AppFrame active="Dashboard" label="EventureOS dashboard: new enquiries, quotes awaiting reply, this week's events and outstanding invoices, with a booking waiting for approval.">
      <p className="text-[15px] font-semibold tracking-tight">Good morning, Sam</p>
      <p className="mb-3 text-[10.5px] a-muted">Here’s what’s happening with your event business today.</p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {kpis.map(([k, v, s]) => (
          <div key={k} className="rounded-xl border a-line a-surface p-2.5">
            <p className="text-[9.5px] uppercase tracking-wide a-faint">{k}</p>
            <p className="mt-1 text-[18px] font-semibold tabular-nums">{v}</p>
            <p className="text-[9.5px] a-muted">{s}</p>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-[#fbbf24]/25 bg-[#fbbf24]/[.07] px-3 py-2 text-[10.5px] text-[#fde68a]">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" /><span><strong>Booking waiting for approval</strong> — Wren & Co. accepted last night for an event <strong>tomorrow</strong>. Not confirmed until you approve.</span>
        <span className="ml-auto shrink-0 rounded-md a-pink-bg px-2 py-0.5 text-[10px] font-semibold">Approve</span>
      </div>
      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Upcoming events" action={<span className="text-[10px] a-pink">Calendar</span>}>
          <ul className="divide-y divide-[rgb(var(--a-line))]">
            {upcoming.map(([d, n, s, st, t]) => (
              <li key={n} className="flex items-center gap-2.5 py-1.5">
                <span className="w-9 shrink-0 rounded-md a-raise py-1 text-center text-[9.5px] font-semibold leading-tight">{d.split(" ")[0]}<br /><span className="text-[12px]">{d.split(" ")[1]}</span></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium">{n}</span><span className="block truncate text-[9.5px] a-muted">{s}</span></span>
                <Chip tone={t}>{st}</Chip>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Needs attention">
          <ul className="space-y-1.5 text-[10.5px]">
            <li className="flex gap-2"><Mail className="mt-0.5 h-3 w-3 shrink-0 a-pink" /><span>Reply to <strong>Olivia</strong> — asked about 150 coffees on Saturday</span></li>
            <li className="flex gap-2"><FileText className="mt-0.5 h-3 w-3 shrink-0 a-muted" /><span>Q-1038 sent 3 days ago — follow up</span></li>
            <li className="flex gap-2"><Receipt className="mt-0.5 h-3 w-3 shrink-0 text-[#fcd34d]" /><span>INV-2291 overdue · $1,180</span></li>
            <li className="flex gap-2"><Users className="mt-0.5 h-3 w-3 shrink-0 a-muted" /><span>Roster 2 staff for Aurora Gala</span></li>
          </ul>
        </Panel>
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------------------ Enquiries */
export function EnquiriesMock({ compact }: { compact?: boolean }) {
  const rows = [
    ["Olivia Chen", "Corporate breakfast · 150 coffees · Sat 23 Nov", "Website form", "New", "pink"],
    ["Marcus Webb", "Wedding bar for 120 — is 12 April free?", "Gmail", "Event enquiry", "blue"],
    ["Priya N.", "Re: Q-1038 — can we add a second bartender?", "Gmail", "Reply", "muted"],
    ["Aurora Gala Committee", "Menu changes for the gala dinner", "Gmail", "Linked to event", "green"],
  ] as const;
  return (
    <AppFrame compact={compact} active="Enquiries" label="The EventureOS enquiries inbox: website-form and Gmail enquiries sorted automatically, with spam kept in a separate folder.">
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
        <span className="rounded-md bg-white/10 px-2 py-1 font-medium">Inbox · 7</span><span className="rounded-md px-2 py-1 a-muted">Spam · 23</span><span className="rounded-md px-2 py-1 a-muted">Blocked senders</span>
        <span className="ml-auto flex items-center gap-1 a-faint"><Sparkles className="h-3 w-3 a-pink" />Sorted as they arrive</span>
      </div>
      <ul className="divide-y divide-[rgb(var(--a-line))] rounded-xl border a-line a-surface">
        {rows.map(([n, s, src, st, t]) => (
          <li key={n} className="flex items-center gap-2.5 px-3 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full a-raise text-[10px] font-semibold">{n.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium">{n}</span><span className="block truncate text-[10px] a-muted">{s}</span></span>
            <span className="hidden text-[9.5px] a-faint sm:block">{src}</span>
            <Chip tone={t}>{st}</Chip>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 rounded-xl border border-[rgb(var(--a-pink)/.3)] bg-[rgb(var(--a-pink)/.06)] p-3 text-[10.5px]">
        <p className="mb-1 flex items-center gap-1.5 font-semibold"><Sparkles className="h-3 w-3 a-pink" />Draft reply — in your voice</p>
        <p className="a-muted">Hi Olivia — lovely to hear from you! Saturday 23 November is free. For 150 coffees over a three-hour service we’d bring the cart with two baristas…</p>
        <p className="mt-1.5 text-[9.5px] a-faint">Prices come from your price list, never from the AI.</p>
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------------------ Quote builder */
export function QuoteMock({ compact }: { compact?: boolean }) {
  const lines = [["Mobile bar hire", "1 × $650.00", "$650.00"], ["Bartender · 5 hrs (from 30 min before service)", "2 × $375.00", "$750.00"], ["Delivery, setup & pack-down", "1 × $250.00", "$250.00"], ["Signature cocktail on arrival", "180 × $9.00", "$1,620.00"]];
  return (
    <AppFrame compact={compact} active="Quotes" label="The EventureOS quote builder pricing a job from the business's own price list, with a staffing suggestion and a live total including GST.">
      <div className="mb-2 flex items-center justify-between"><div><p className="text-[13px] font-semibold">Q-1042 · Harbour & Vine wedding</p><p className="text-[10px] a-muted">Version 2 · valid until 30 Nov</p></div><Chip tone="pink">Ready to send</Chip></div>
      <div className="rounded-xl border border-[rgb(var(--a-pink)/.35)] a-surface p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold"><CircleDollarSign className="h-3.5 w-3.5 a-pink" />Price a job</p>
        <div className="mb-2 grid grid-cols-4 gap-1.5 text-[10px]">
          {[["Service starts", "6:00 pm"], ["Service ends", "10:30 pm"], ["Guests", "180"], ["Staff", "2"]].map(([k, v]) => (
            <div key={k}><p className="a-faint">{k}</p><p className="mt-0.5 rounded-md border a-line px-2 py-1">{v}</p></div>
          ))}
        </div>
        <table className="w-full text-[10.5px]"><tbody>
          {lines.map(([a, b, c]) => <tr key={a} className="border-t a-line"><td className="py-1.5 pr-2">{a}</td><td className="whitespace-nowrap py-1.5 text-right a-muted">{b}</td><td className="whitespace-nowrap py-1.5 pl-3 text-right font-medium">{c}</td></tr>)}
          <tr className="border-t a-line"><td className="pt-2 a-muted" colSpan={2}>Subtotal $3,270.00 + GST $327.00</td><td className="pt-2 text-right text-[12px] font-semibold">$3,597.00</td></tr>
        </tbody></table>
        <p className="mt-2 flex gap-1.5 rounded-lg bg-[#fbbf24]/[.08] px-2 py-1.5 text-[10px] text-[#fde68a]"><Sparkles className="mt-0.5 h-3 w-3 shrink-0" />180 guests over 4½ hours — your rules suggest a second bartender. Added.</p>
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------------------ Event page */
export function EventMock({ compact }: { compact?: boolean }) {
  return (
    <AppFrame compact={compact} active="Events" label="An EventureOS event page: confirmed booking with staff rostered, client contacts, calendar status and the next action.">
      <p className="text-[10px] a-faint">Events / EV-2187</p>
      <p className="text-[15px] font-semibold tracking-tight">Harbour & Vine — wedding</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] a-muted"><Chip tone="green">Confirmed</Chip><span>Sat 14 Dec · 6:00–10:30 pm</span><span>· 180 guests</span><span>· Harbour & Vine Estate</span></div>
      <div className="mt-2 flex gap-3 border-b a-line text-[10.5px]">
        {["Overview", "Communication", "Quote", "Schedule", "Tasks", "Invoice", "Payments"].map((t, i) => <span key={t} className={cx("pb-1.5", i === 0 ? "border-b-2 border-[rgb(var(--a-pink))] text-white" : "a-muted")}>{t}</span>)}
      </div>
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <Panel title="Working this event">
          {[["Jess (roster)", "Added to every event"], ["Tom", "Bartender · sees what’s included, not prices"], ["Aisha", "Bartender"]].map(([n, r]) => (
            <p key={n} className="flex items-center gap-2 py-1 text-[10.5px]"><span className="grid h-5 w-5 place-items-center rounded-full a-raise text-[9px]">{n[0]}</span><span><span className="font-medium">{n}</span> <span className="a-faint">· {r}</span></span></p>
          ))}
        </Panel>
        <Panel title="People on this booking">
          {[["Emma Hart", "Main contact"], ["Leo (planner)", "Invited to the portal"]].map(([n, r]) => (
            <p key={n} className="flex items-center justify-between py-1 text-[10.5px]"><span className="font-medium">{n}</span><span className="a-faint">{r}</span></p>
          ))}
          <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[#6ee7b7]"><Check className="h-3 w-3" />On Google Calendar — staff and client invited</p>
        </Panel>
      </div>
      <div className="mt-2.5 flex items-center gap-2 rounded-xl a-raise px-3 py-2 text-[10.5px]"><ClipboardList className="h-3.5 w-3.5 a-pink" />Next: send final run sheet to Emma <span className="ml-auto a-faint">due Fri</span></div>
    </AppFrame>
  );
}

/* ------------------------------------------------------------------ Customer portal */
export function PortalMock({ compact }: { compact?: boolean }) {
  return (
    <figure role="img" aria-label="The customer portal a client sees: their quote with an accept button, their invoice with pay by card, and messages." className={cx("mk-app relative text-left", compact ? "" : "")}>
      <div aria-hidden className="bg-[#f6f5f2] text-[#18171f]">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3"><p className="text-[13px] font-semibold">Your events business</p><span className="text-[10px] text-black/50">Emma Hart</span></div>
        <div className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-black/40">Your booking</p>
          <p className="text-[15px] font-semibold">Harbour & Vine — wedding</p>
          <p className="text-[10.5px] text-black/60">Saturday 14 December · 180 guests</p>
          <div className="mt-3 rounded-xl border border-black/10 bg-white p-3">
            <p className="text-[11px] font-semibold">Accept this quote</p>
            <p className="mt-0.5 text-[10px] text-black/60">Version 2 for <strong className="text-black">$3,597.00</strong>. We’ll record your name, the date and time.</p>
            <div className="mt-2 rounded-md border border-black/15 px-2 py-1.5 text-[10.5px]">Emma Hart</div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[10px]"><span className="grid h-3 w-3 place-items-center rounded-sm bg-[#e21d6e] text-white"><Check className="h-2 w-2" /></span>I accept the quote and terms.</p>
            <span className="mt-2 inline-block rounded-lg bg-[#e21d6e] px-3 py-1.5 text-[10.5px] font-semibold text-white">Accept quote</span>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl border border-black/10 bg-white p-3">
            <div><p className="text-[11px] font-semibold">Deposit invoice INV-2302</p><p className="text-[10px] text-black/60">$1,079.10 · due today</p></div>
            <span className="flex items-center gap-1 rounded-lg bg-[#18171f] px-3 py-1.5 text-[10.5px] font-semibold text-white"><CreditCard className="h-3 w-3" />Pay by card</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ Reports */
export function ReportsMock({ compact }: { compact?: boolean }) {
  const months = [42, 55, 48, 63, 71, 58, 80, 92, 76, 88, 99, 84];
  const booked = [30, 44, 52, 50, 66, 70, 62, 85, 90, 80, 95, 100];
  return (
    <AppFrame compact={compact} active="Reports" label="EventureOS reports: revenue and booked value by month, enquiries by source, quote win rate and response time.">
      <p className="text-[13px] font-semibold">Reports</p><p className="mb-2.5 text-[10px] a-muted">How the business is really going.</p>
      <div className="grid gap-2.5 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Revenue and booked value by month">
          <svg viewBox="0 0 240 90" className="h-[110px] w-full">
            {months.map((v, i) => <rect key={i} x={6 + i * 19.5} y={86 - v * .8} width="8" height={v * .8} rx="2" fill="rgb(255 77 166)" opacity=".9" />)}
            {booked.map((v, i) => <rect key={"b" + i} x={14.5 + i * 19.5} y={86 - v * .8} width="8" height={v * .8} rx="2" fill="rgb(124 77 255)" opacity=".75" />)}
          </svg>
          <p className="flex gap-3 text-[9.5px] a-muted"><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[rgb(255,77,166)]" />Payments received</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[rgb(124,77,255)]" />Booked (accepted quotes)</span></p>
        </Panel>
        <div className="space-y-2.5">
          <Panel title="Enquiries by source">
            {[["Website form", 64], ["Gmail", 48], ["Phone", 18]].map(([l, v]) => (
              <div key={l as string} className="mb-1.5"><p className="flex justify-between text-[10px]"><span>{l}</span><span className="a-muted">{v}</span></p><div className="h-1.5 rounded-full a-raise"><div className="h-1.5 rounded-full bg-[rgb(var(--a-pink))]" style={{ width: `${(v as number) / .7}%` }} /></div></div>
            ))}
          </Panel>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border a-line a-surface p-2.5"><p className="text-[9.5px] uppercase a-faint">Quote win rate</p><p className="text-[17px] font-semibold">62%</p></div>
            <div className="rounded-xl border a-line a-surface p-2.5"><p className="text-[9.5px] uppercase a-faint">First reply</p><p className="text-[17px] font-semibold">1h 40m</p></div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------------------ Calendar week */
export function CalendarMock({ compact }: { compact?: boolean }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const items: [number, number, number, string, string][] = [
    [0, 1, 2, "Site visit · Estate", "muted"], [3, 3, 3, "Harbour & Vine", "pink"], [4, 0, 5, "Tech Summit · day 1", "violet"],
    [5, 0, 5, "Tech Summit · day 2", "violet"], [5, 5, 3, "Aurora Gala", "pink"], [6, 2, 2, "Wren & Co.", "amber"],
  ];
  return (
    <AppFrame compact={compact} active="Calendar" label="The EventureOS calendar: a week of events, deliveries and site visits alongside your Google Calendar.">
      <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-semibold">December · week 50</p><span className="flex items-center gap-1 text-[10px] text-[#6ee7b7]"><Check className="h-3 w-3" />Synced with Google Calendar</span></div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1"><div className="grid min-w-[560px] grid-cols-7 gap-1.5">
        {days.map((d, i) => (
          <div key={d} className="min-h-[150px] rounded-lg border a-line a-surface p-1.5">
            <p className="mb-1 text-[9.5px] a-faint">{d} {9 + i}</p>
            {items.filter((x) => x[0] === i).map(([, top, h, l, c]) => (
              <div key={l} style={{ marginTop: top * 3 }} className={cx("mb-1 rounded-md px-1.5 py-1 text-[9.5px] leading-tight", {
                pink: "bg-[rgb(var(--a-pink)/.18)] text-[rgb(var(--a-pink))]", violet: "bg-[rgb(124_77_255/.2)] text-[#b9a4ff]",
                amber: "bg-[#fbbf24]/10 text-[#fde68a]", muted: "bg-white/5 a-muted",
              }[c])}>{l}<span className="block opacity-70">{h > 3 ? "All day" : "6 pm"}</span></div>
            ))}
          </div>
        ))}
      </div></div>
    </AppFrame>
  );
}
