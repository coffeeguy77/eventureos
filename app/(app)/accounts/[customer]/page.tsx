import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Mail, MousePointerClick, Phone } from "lucide-react";
import { requireOrg, getMembers } from "@/lib/context";
import { fmtDate, fmtDateTime, money, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { daysBetween, feeDue, feeRateFor, readFees, readTemplates } from "@/lib/accounts/core";
import { loadOwing } from "@/lib/accounts/server";
import { SiteDoctor } from "@/components/hosting/site-doctor";
import { CallPanel } from "@/components/accounts/call-panel";
import { PlanPanel, StatementPanel } from "@/components/accounts/statement-plan";
import { lastAttempts } from "@/lib/accounts/phones";
import { loadPhones } from "@/lib/accounts/phones-server";
import { CancelReminder, ChaseComposer, FeePanel, FlagForm, LogForm, PayPanel, StepDone } from "@/components/accounts/customer-tools";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { note: "Note", call: "Phone call", email: "Email", sms: "Text", promise: "Promise to pay", dispute: "Dispute", plan: "Payment plan" };

/** One customer who owes money: their unpaid invoices, every conversation and email, and what happens next. */
export default async function AccountsCustomerPage({ params, searchParams }: { params: Promise<{ customer: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { customer: id } = await params;
  const justPaid = (await searchParams).paid === "1";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org, user } = await requireOrg();
  const { data: cust } = await supabase.from("customers").select("id, name, email, phone, company").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!cust) notFound();
  const today = todayISO(org.timezone);
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const [owing, { data: notes }, { data: emails }, { data: pays }, { data: contacts }, { data: o }, members] = await Promise.all([
    loadOwing(supabase, org.id, id),
    supabase.from("collection_notes").select("id, kind, body, invoice_id, promise_date, promise_amount, remind, reminded_at, next_step, next_step_due, done_at, created_by, created_at").eq("organisation_id", org.id).eq("customer_id", id).order("created_at", { ascending: false }).limit(300),
    supabase.from("collection_emails").select("id, invoice_id, kind, template, subject, to_emails, sent_at, opened_at, open_count, clicked_at, click_count, sent_by").eq("organisation_id", org.id).eq("customer_id", id).order("sent_at", { ascending: false }).limit(300),
    supabase.from("payments").select("amount, paid_at, method, invoice:invoices!inner(number, customer_id)").eq("organisation_id", org.id).eq("invoice.customer_id", id).gte("paid_at", yearAgo).order("paid_at", { ascending: false }).limit(200),
    supabase.from("contacts").select("first_name, last_name, email, phone, is_primary").eq("organisation_id", org.id).eq("customer_id", id).order("is_primary", { ascending: false }).limit(10),
    supabase.from("organisations").select("settings").eq("id", org.id).single(),
    getMembers(org.id),
  ]);
  const who = (uid: string | null) => (uid ? members.find((m) => m.id === uid)?.full_name ?? "Team" : "EventureOS");
  const cur = org.currency;
  const total = owing.reduce((a, i) => a + i.balance, 0);
  const overdue = owing.filter((i) => i.due_date && i.due_date < today).reduce((a, i) => a + i.balance, 0);
  type Note = { id: string; kind: string; body: string | null; invoice_id: string | null; promise_date: string | null; promise_amount: number | null; remind: boolean; reminded_at: string | null; next_step: string | null; next_step_due: string | null; done_at: string | null; created_by: string | null; created_at: string };
  type Em = { id: string; invoice_id: string | null; kind: string; template: string | null; subject: string | null; to_emails: string[]; sent_at: string; opened_at: string | null; open_count: number; clicked_at: string | null; click_count: number; sent_by: string | null };
  type Pay = { amount: number; paid_at: string; method: string | null; invoice: { number: string } | null };
  const N = (notes ?? []) as Note[], E = (emails ?? []) as Em[], P = (pays ?? []) as unknown as Pay[];
  const openStep = N.find((n) => n.next_step && !n.done_at) ?? null;
  const pendingPromise = N.find((n) => n.kind === "promise" && n.remind && !n.reminded_at) ?? null;
  const invNo = (iid: string | null) => owing.find((i) => i.id === iid)?.number ?? null;
  const timeline = [
    ...N.map((n) => ({ at: n.created_at, kind: "note" as const, n })),
    ...E.map((e) => ({ at: e.sent_at, kind: "email" as const, e })),
    ...P.map((p) => ({ at: p.paid_at, kind: "pay" as const, p })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const invOpts = owing.map((i) => ({ id: i.id, number: i.number, balance: money(i.balance, cur), due: i.due_date ? (i.due_date < today ? `${daysBetween(i.due_date, today)} days overdue` : `due ${fmtDate(i.due_date, "short")}`) : "no due date" }));
  const templates = readTemplates(o?.settings).map((t) => ({ key: t.key, name: t.name }));
  // Account-keeping fees owing now (months not charged yet, at this customer's rate)
  const fees = readFees(o?.settings);
  const feeRate = feeRateFor(fees, id);
  const chargedR = await supabase.from("account_fees").select("invoice_id, months").eq("organisation_id", org.id).eq("customer_id", id);
  const charged = new Map<string, number>();
  for (const c of (chargedR.data ?? []) as { invoice_id: string; months: number }[]) charged.set(c.invoice_id, (charged.get(c.invoice_id) ?? 0) + c.months);
  const feeLines = fees.enabled ? owing.map((i) => ({ i, f: feeDue(i, today, feeRate, fees.grace_days, charged.get(i.id) ?? 0) })).filter((x) => x.f.amount > 0) : [];
  const { data: issues } = await supabase.from("account_issues").select("id, status, reason, invoice_id, created_at").eq("organisation_id", org.id).eq("customer_id", id).in("status", ["open", "investigating", "write_off"]).order("created_at", { ascending: false });
  // Their websites and hosting (Web Culture): open and check them while you're on the phone
  const [{ data: hostRows }, { data: siteRows }] = await Promise.all([
    supabase.from("hosting_accounts").select("domain").eq("organisation_id", org.id).eq("customer_id", id).limit(20),
    supabase.from("websites").select("domain").eq("organisation_id", org.id).eq("customer_id", id).limit(20),
  ]);
  const domains = [...new Set([...(hostRows ?? []), ...(siteRows ?? [])].map((x) => String((x as { domain: string }).domain ?? "").replace(/^www\./, "").toLowerCase()).filter(Boolean))];
  // Card on file (0079) and whether Stripe is connected
  const [{ data: cardRow }, { data: stripeInteg }] = await Promise.all([
    supabase.from("customer_cards").select("brand, last4, exp_month, exp_year").eq("organisation_id", org.id).eq("customer_id", id).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("integrations").select("status").eq("organisation_id", org.id).eq("provider", "stripe").maybeSingle(),
  ]);
  const cardInfo = cardRow ? (() => {
    const c = cardRow as { brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null };
    const brand = c.brand ? c.brand[0].toUpperCase() + c.brand.slice(1) : "Card";
    const expired = !!(c.exp_year && c.exp_month && (c.exp_year * 100 + c.exp_month) < Number(today.slice(0, 4)) * 100 + Number(today.slice(5, 7)));
    return { label: `${brand} ending ${c.last4 ?? "????"}`, expiry: c.exp_month && c.exp_year ? `${String(c.exp_month).padStart(2, "0")}/${String(c.exp_year).slice(-2)}` : null, expired };
  })() : null;
  const phoneData = await loadPhones(supabase, org.id, id, user.id);
  // Payment plan (0080)
  let plan: { frequency: string; instalments: { n: number; due_date: string; amount: number; status: string; last_error: string | null }[] } | null = null;
  const { data: pl, error: plErr } = await supabase.from("payment_plans").select("id, frequency").eq("organisation_id", org.id).eq("customer_id", id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!plErr && pl) {
    const { data: ins } = await supabase.from("payment_plan_instalments").select("n, due_date, amount, status, last_error").eq("plan_id", pl.id).order("n");
    plan = { frequency: pl.frequency as string, instalments: (ins ?? []) as { n: number; due_date: string; amount: number; status: string; last_error: string | null }[] };
  }
  const people = (contacts ?? []) as { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; is_primary: boolean }[];

  return (
    <>
      <Link href="/accounts" className="mb-3 inline-flex items-center gap-1 text-[0.7812rem] text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Money owing</Link>
      <PageHeader title={cust.name} subtitle={`${money(total, cur)} owing${overdue ? ` · ${money(overdue, cur)} overdue` : ""}`}
        actions={<Link href={`/clients/${cust.id}`} className="text-[0.8125rem] font-medium text-brand-700 hover:underline">Client record</Link>} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {(openStep || pendingPromise) && (
            <Card className="space-y-2 p-4">
              {openStep && <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[0.875rem]"><span className="font-semibold text-ink">Next step:</span> {openStep.next_step}{openStep.next_step_due ? <span className={openStep.next_step_due < today ? "font-medium text-rose-700" : "text-ink-muted"}> · {openStep.next_step_due < today ? "was due" : "by"} {fmtDate(openStep.next_step_due, "short")}</span> : null}</p><StepDone id={openStep.id} /></div>}
              {pendingPromise && <p className="text-[0.8125rem] text-emerald-800">Promised {pendingPromise.promise_amount ? money(Number(pendingPromise.promise_amount), cur) : "payment"} on {fmtDate(pendingPromise.promise_date)} — the invoice and pay link email that morning. <CancelReminder id={pendingPromise.id} /></p>}
            </Card>
          )}
          <Card>
            <CardHeader title="Unpaid invoices" />
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[560px] text-[0.8125rem]">
                <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-muted"><th className="px-4 py-2 font-medium">Invoice</th><th className="px-2 py-2 font-medium">Due</th><th className="px-2 py-2 text-right font-medium">Owing</th><th className="px-2 py-2 font-medium">From</th><th className="px-4 py-2 font-medium">Seen</th></tr></thead>
                <tbody>
                  {owing.map((i) => {
                    const late = i.due_date && i.due_date < today ? daysBetween(i.due_date, today) : 0;
                    return (
                      <tr key={i.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2"><Link href={`/invoices/${i.id}`} className="font-medium hover:text-brand-700 hover:underline">{i.number}</Link></td>
                        <td className={`px-2 py-2 ${late ? "font-medium text-rose-700" : "text-ink-muted"}`}>{i.due_date ? fmtDate(i.due_date, "short") : "—"}{late ? ` · ${late} days` : ""}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{money(i.balance, cur)}</td>
                        <td className="px-2 py-2 text-ink-muted">{i.origin === "xero" ? "Xero" : "EventureOS"}</td>
                        <td className="px-4 py-2 text-ink-muted">{i.first_viewed_at ? `Viewed ${i.view_count ?? 1}×` : "Not opened yet"}</td>
                      </tr>
                    );
                  })}
                  {!owing.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">Nothing owing — all paid.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          {domains.length > 0 && (
            <Card>
              <CardHeader title="Their websites" subtitle="Check a site is still with us and that their email works — often why they've gone quiet" />
              <ul className="divide-y divide-line border-t border-line">
                {domains.map((d) => <li key={d} className="px-5 py-3"><p className="mb-2 font-semibold text-ink">{d}</p><SiteDoctor domain={d} compact /></li>)}
              </ul>
            </Card>
          )}
          <PayPanel customerId={cust.id} currency={cur} card={cardInfo} stripeReady={stripeInteg?.status === "connected"} justPaid={justPaid}
            invoices={owing.map((i) => ({ id: i.id, number: i.number, balance: i.balance, overdue: !!(i.due_date && i.due_date < today), label: i.due_date ? (i.due_date < today ? `${daysBetween(i.due_date, today)} days overdue` : `due ${fmtDate(i.due_date, "short")}`) : "" }))} />
          <StatementPanel customerId={cust.id} email={cust.email ?? people.find((p) => p.email)?.email ?? null} owing={owing.length} />
          <PlanPanel customerId={cust.id} currency={cur} today={today} card={cardInfo && !cardInfo.expired ? cardInfo.label : null} plan={plan}
            invoices={owing.map((i) => ({ id: i.id, number: i.number, balance: i.balance, overdue: !!(i.due_date && i.due_date < today), label: i.due_date ? (i.due_date < today ? `${daysBetween(i.due_date, today)} days overdue` : `due ${fmtDate(i.due_date, "short")}`) : "" }))} />
          <ChaseComposer invoices={invOpts} templates={templates} />
          <Card>
            <CardHeader title="History" subtitle="Conversations, chasing emails and payments" />
            <ul className="divide-y divide-line border-t border-line">
              {timeline.map((x, k) => (
                <li key={k} className="px-5 py-3 text-[0.8125rem]">
                  {x.kind === "note" && <>
                    <p className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-ink">{KIND[x.n.kind] ?? x.n.kind}</span><span className="text-[0.75rem] text-ink-faint">{fmtDateTime(x.n.created_at, org.timezone)} · {who(x.n.created_by)}{invNo(x.n.invoice_id) ? ` · ${invNo(x.n.invoice_id)}` : ""}</span></p>
                    {x.n.body && <p className="mt-1 whitespace-pre-line text-ink">{x.n.body}</p>}
                    {x.n.kind === "promise" && x.n.promise_date && <p className="mt-1 text-emerald-800">Will pay {x.n.promise_amount ? money(Number(x.n.promise_amount), cur) : ""} on {fmtDate(x.n.promise_date)}{x.n.reminded_at ? " · reminder emailed" : x.n.remind ? " · reminder booked" : ""}</p>}
                    {x.n.next_step && <p className={`mt-1 ${x.n.done_at ? "text-ink-faint line-through" : "text-ink-muted"}`}>Next: {x.n.next_step}{x.n.next_step_due ? ` (by ${fmtDate(x.n.next_step_due, "short")})` : ""}</p>}
                  </>}
                  {x.kind === "email" && <>
                    <p className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-800"><Mail className="h-3 w-3" />{x.e.kind === "promise" ? "Promise-day email" : x.e.template === "statement" ? "Statement" : "Email"}</span><span className="text-[0.75rem] text-ink-faint">{fmtDateTime(x.e.sent_at, org.timezone)} · {x.e.kind === "promise" ? "automatic" : who(x.e.sent_by)}{invNo(x.e.invoice_id) ? ` · ${invNo(x.e.invoice_id)}` : ""}</span></p>
                    <p className="mt-1 text-ink">{x.e.subject}</p>
                    <p className="mt-1 flex flex-wrap gap-3 text-[0.75rem]">
                      <span className={x.e.opened_at ? "text-emerald-700" : "text-ink-faint"}><Eye className="mr-1 inline h-3.5 w-3.5" />{x.e.opened_at ? `Opened ${x.e.open_count > 1 ? `${x.e.open_count}×` : ""} · ${fmtDateTime(x.e.opened_at, org.timezone)}` : "Not opened yet"}</span>
                      <span className={x.e.clicked_at ? "text-emerald-700" : "text-ink-faint"}><MousePointerClick className="mr-1 inline h-3.5 w-3.5" />{x.e.template === "statement" ? (x.e.clicked_at ? `Statement opened ${x.e.click_count > 1 ? `${x.e.click_count}× ` : ""}· ${fmtDateTime(x.e.clicked_at, org.timezone)}` : "Statement not opened yet") : x.e.clicked_at ? `Pay link clicked · ${fmtDateTime(x.e.clicked_at, org.timezone)}` : "Pay link not clicked"}</span>
                    </p>
                  </>}
                  {x.kind === "pay" && <p className="font-medium text-emerald-700">Paid {money(Number(x.p.amount), cur)}{x.p.invoice ? ` on ${x.p.invoice.number}` : ""} · {fmtDateTime(x.p.paid_at, org.timezone)}{x.p.method ? ` · ${x.p.method}` : ""}</p>}
                </li>
              ))}
              {!timeline.length && <li className="px-5 py-6 text-center text-[0.8125rem] text-ink-muted">Nothing yet.</li>}
            </ul>
          </Card>
        </div>
        <aside className="space-y-5">
          <CallPanel customerId={cust.id} phones={phoneData.phones} attempts={lastAttempts(N)} xero={phoneData.xero} />
          <Card className="p-4 text-[0.8125rem]">
            <p className="font-semibold text-ink">Contact</p>
            {people.length ? people.map((p, i) => (
              <div key={i} className="mt-2">
                <p className="text-ink">{[p.first_name, p.last_name].filter(Boolean).join(" ") || "Contact"}{p.is_primary && <span className="ml-1 text-[0.6875rem] text-ink-faint">main</span>}</p>
                {p.phone && <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="flex items-center gap-1 text-brand-700"><Phone className="h-3.5 w-3.5" />{p.phone}</a>}
                {p.email && <a href={`mailto:${p.email}`} className="block break-all text-ink-muted">{p.email}</a>}
              </div>
            )) : <>
              {cust.phone && <a href={`tel:${cust.phone.replace(/\s/g, "")}`} className="mt-2 flex items-center gap-1 text-brand-700"><Phone className="h-3.5 w-3.5" />{cust.phone}</a>}
              {cust.email && <a href={`mailto:${cust.email}`} className="block break-all text-ink-muted">{cust.email}</a>}
            </>}
          </Card>
          <LogForm customerId={cust.id} invoices={invOpts} today={today} card={cardInfo && !cardInfo.expired ? cardInfo.label : null} />
          {(issues ?? []).length > 0 && (
            <Card className="p-4 text-[0.8125rem]">
              <p className="font-semibold text-ink">In the resolution centre</p>
              {(issues ?? []).map((x) => <p key={x.id} className="mt-1.5 text-ink-muted"><span className="font-medium text-violet-800">{x.status === "write_off" ? "To write off" : x.status === "investigating" ? "Investigating" : "Waiting for a decision"}</span>{invNo(x.invoice_id) ? ` · ${invNo(x.invoice_id)}` : ""} — {x.reason}</p>)}
              <Link href="/accounts/resolution" className="mt-2 inline-block font-medium text-brand-700 hover:underline">Open the resolution centre</Link>
            </Card>
          )}
          <FlagForm customerId={cust.id} invoices={invOpts} />
          <FeePanel customerId={cust.id} enabled={fees.enabled} standard={fees.percent} own={id in fees.overrides ? fees.overrides[id] : null} needsDb={!!chargedR.error}
            lines={feeLines.map(({ i, f }) => ({ number: i.number, text: `${f.months} month${f.months === 1 ? "" : "s"} × ${feeRate}%`, amount: money(f.amount, cur) }))}
            total={feeLines.length ? money(feeLines.reduce((a, x) => a + x.f.amount, 0), cur) : null} />
        </aside>
      </div>
    </>
  );
}
