import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleDashed, Download, Eye, FileText, LogOut, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { brokerAccess } from "@/lib/loans/broker-auth";
import { CONSENTS, fieldShown, steps as allSteps, type Field } from "@/lib/loans/form";
import { logOnce } from "@/lib/loans/log";
import { applicantNames, FILE_COLS, fileParts, serviceDb, type LoanFileRow } from "@/lib/loans/server";
import { aud, summarise } from "@/lib/loans/summary";
import { STATUS_LABEL } from "@/components/loans/status";
import { brokerSignOutAction } from "../actions";
import { AutoRefresh, BrokerMessages } from "../ui";

export const dynamic = "force-dynamic";

function show(f: Field, v: unknown): string {
  if (v == null || v === "") return "";
  const s = String(v);
  if (f.type === "money") return aud(Number(s.replace(/[^\d.]/g, "")));
  if (f.type === "multi") return s.split("|").join(", ");
  if (f.type === "check") return s === "yes" ? "Yes" : "";
  if (f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(s)) return `${+s.slice(8)}/${+s.slice(5, 7)}/${s.slice(0, 4)}`;
  return s;
}
const when = (iso: string | null, tz: string) => (iso ? new Date(iso).toLocaleString("en-AU", { timeZone: tz, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-line bg-surface p-5 print:break-inside-avoid print:border-0 print:p-0">
      <h2 className="mb-3 text-[1.0625rem] font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
function Pairs({ fields, prefix, answers }: { fields: Field[]; prefix: string; answers: Record<string, unknown> }) {
  const shown = fields.filter((f) => fieldShown(f, answers, prefix) && f.type !== "check");
  return (
    <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
      {shown.map((f) => { const v = show(f, answers[`${prefix}${f.key}`]); return (
        <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}><dt className="text-[0.75rem] text-ink-faint">{f.label}</dt><dd className={cn("text-[0.9375rem]", v ? "text-ink" : "text-ink-faint")}>{v ? <span className="whitespace-pre-wrap">{v}</span> : "—"}</dd></div>
      ); })}
    </dl>
  );
}

export default async function BrokerFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acc = await brokerAccess(id);
  if (!acc) redirect("/broker");
  const db = serviceDb();
  const { data } = await db.from("loan_files").select(FILE_COLS).eq("id", id).maybeSingle();
  const file = data as LoanFileRow | null;
  if (!file || (file.status === "closed" && acc.kind === "broker")) notFound();
  const [{ data: org }, parts, { data: sigs }] = await Promise.all([
    db.from("organisations").select("name, logo_url, timezone").eq("id", file.organisation_id).single(),
    fileParts(db, file.id),
    db.from("loan_signatures").select("applicant, signed_name, image, signed_at, ip").eq("file_id", file.id).then((r) => r, () => ({ data: null })),
  ]);
  const tz = org?.timezone ?? "Australia/Sydney";
  if (acc.kind === "broker") await logOnce(30 * 60e3, { orgId: file.organisation_id, fileId: file.id, kind: "broker", name: acc.broker.name, email: acc.broker.email, action: "viewed_file" });

  const a = file.answers;
  const names = applicantNames(file);
  const fullNames = names.map((n, i) => [a[`a${i + 1}.first_name`], a[`a${i + 1}.last_name`]].filter(Boolean).join(" ") || n);
  const steps = allSteps(file.applicants);
  const step = (k: string) => steps.find((s) => s.key === k)!;
  const s = summarise(a, file.applicants);
  const live = !!file.client_seen_at && Date.now() - new Date(file.client_seen_at).getTime() < 30_000;
  const needed = parts.requests.filter((r) => r.status === "needed" || r.status === "redo").length;
  const signed = (sigs ?? []) as { applicant: number; signed_name: string; image: string; signed_at: string; ip: string | null }[];
  const docHref = (docId: string, dl = false) => `/broker/${file.id}/doc/${docId}${dl ? "?dl=1" : ""}`;
  const groups = [...fullNames.map((n, i) => ({ t: n, list: parts.requests.filter((r) => r.applicant === i + 1) })), { t: "Application", list: parts.requests.filter((r) => !r.applicant) }].filter((g) => g.list.length);
  const list = (k: string) => (Array.isArray(a[k]) ? (a[k] as Record<string, string>[]) : []);

  return (
    <div>
      <AutoRefresh seconds={10} />
      {acc.kind === "preview" && (
        <div className="bg-amber-100 px-4 py-2 text-center text-[0.8125rem] font-medium text-amber-950 print:hidden">
          Preview — this is exactly what your brokers see. Only you (signed in to {org?.name}) can open it this way. <Link href={`/loans/${file.id}`} className="underline">Back to the loan file</Link>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur print:static">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          {acc.kind === "broker" && <Link href="/broker" className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted ring-1 ring-inset ring-line hover:text-ink print:hidden" aria-label="All applications"><ArrowLeft className="h-4 w-4" /></Link>}
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">Loan application · {org?.name}</p>
            <h1 className="truncate text-[1.1875rem] font-bold">{fullNames.join(" & ") || file.title}</h1>
          </div>
          <span className="rounded-full bg-canvas px-2.5 py-1 text-[0.75rem] font-medium ring-1 ring-inset ring-line">{STATUS_LABEL[file.status] ?? file.status}</span>
          {acc.kind === "broker" && <form action={brokerSignOutAction} className="print:hidden"><button className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] text-ink-muted ring-1 ring-inset ring-line hover:text-ink"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></button></form>}
        </div>
        <nav className="mx-auto flex max-w-6xl gap-4 overflow-x-auto px-4 pb-2 text-[0.8125rem] text-ink-muted sm:px-6 print:hidden">
          {[["summary", "Summary"], ["applicants", "Applicants"], ["loan", "Loan"], ["position", "Assets & debts"], ["costs", "Living costs"], ["documents", "Documents"], ["signed", "Consent & signatures"], ["messages", "Messages"]].map(([k, l]) => <a key={k} href={`#${k}`} className="shrink-0 hover:text-ink">{l}</a>)}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <p className="text-[0.8125rem] text-ink-muted">
          {live ? <span className="font-medium text-emerald-700 dark:text-emerald-400">● The client is filling this in right now{file.client_focus?.label ? ` — ${file.client_focus.label}` : ""}</span> : file.submitted_at ? `Signed and sent ${when(file.submitted_at, tz)}` : `Client last active ${when(file.client_seen_at, tz)} · not sent yet`}
          {" · "}{needed ? `${needed} document${needed === 1 ? "" : "s"} outstanding` : "all documents in"}
        </p>

        <section id="summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Loan amount", aud(s.amount)], ["Property value", aud(s.value)], ["LVR", s.lvr == null ? "—" : `${s.lvr}%`],
            ["Income (yearly)", aud(s.income)], ["Net position", aud(s.net)], ["Living costs / month", aud(s.monthlyLiving)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-2xl border border-line bg-surface p-4"><p className="text-[0.75rem] text-ink-faint">{l}</p><p className="mt-1 text-[1.25rem] font-bold tabular-nums">{v}</p></div>
          ))}
        </section>
        <p className="-mt-2 text-[0.75rem] text-ink-faint">Worked out from the client&apos;s answers: assets {aud(s.assets)} less debts {aud(s.liabilities)}; income includes rent ({aud(s.rentIncome)} a year); monthly repayments {aud(s.monthlyRepayments)}; card limits {aud(s.cardLimits)}.</p>

        <Section title="Applicants" id="applicants">
          <div className={cn("grid gap-6", file.applicants > 1 && "lg:grid-cols-2")}>
            {fullNames.map((n, i) => (
              <div key={i} className="space-y-4">
                <p className="text-[0.9375rem] font-semibold">{n}</p>
                <Pairs fields={step("about").perApplicant!} prefix={`a${i + 1}.`} answers={a} />
                <p className="pt-1 text-[0.8125rem] font-semibold text-ink-muted">Work & income</p>
                <Pairs fields={step("work").perApplicant!} prefix={`a${i + 1}.`} answers={a} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="The loan" id="loan">
          <Pairs fields={step("loan").fields!} prefix="" answers={a} />
          <p className="mb-2 mt-5 text-[0.8125rem] font-semibold text-ink-muted">Looking ahead</p>
          <Pairs fields={step("ahead").fields!} prefix="" answers={a} />
        </Section>

        <Section title="Assets & debts" id="position">
          {[...(step("property").lists ?? []), ...(step("assets").lists ?? []), ...(step("debts").lists ?? [])].map((l) => {
            const rows = list(l.key);
            return (
              <div key={l.key} className="mb-5 last:mb-0">
                <p className="mb-1.5 text-[0.875rem] font-semibold">{l.label}</p>
                {!rows.length ? <p className="text-[0.8125rem] text-ink-faint">{a[`${l.key}__none`] === true ? "None" : "Not answered"}</p> : (
                  <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-line">
                    <table className="w-full min-w-[520px] text-[0.8125rem]">
                      <thead className="bg-canvas text-left text-ink-faint"><tr>{l.fields.map((f) => <th key={f.key} className="px-3 py-2 font-medium">{f.label}</th>)}</tr></thead>
                      <tbody>{rows.map((r, n) => <tr key={n} className="border-t border-line">{l.fields.map((f) => <td key={f.key} className={cn("px-3 py-2", f.type === "money" && "tabular-nums")}>{show(f, r[f.key]) || <span className="text-ink-faint">—</span>}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          <Pairs fields={step("assets").fields!} prefix="" answers={a} />
        </Section>

        <Section title="Living costs (monthly)" id="costs"><Pairs fields={step("spending").fields!} prefix="" answers={a} /></Section>

        <Section title={`Documents — ${parts.requests.length - needed} of ${parts.requests.length} in`} id="documents">
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.t}>
                {groups.length > 1 && <p className="mb-1.5 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{g.t}</p>}
                <ul className="divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
                  {g.list.map((r) => {
                    const files = parts.documents.filter((d) => d.request_id === r.id);
                    return (
                      <li key={r.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                        {files.length ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : r.status === "not_applicable" ? <X className="mt-0.5 h-4 w-4 text-ink-faint" /> : <CircleDashed className="mt-0.5 h-4 w-4 text-ink-faint" />}
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-[0.875rem]", r.status === "not_applicable" && "text-ink-faint line-through")}>{r.label}</p>
                          {!files.length && <p className="text-[0.75rem] text-ink-faint">{r.status === "not_applicable" ? "Client says this doesn't apply" : "Not received yet"}</p>}
                          {files.map((d) => (
                            <div key={d.id} className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
                              <span className="inline-flex min-w-0 items-center gap-1.5"><FileText className="h-3.5 w-3.5 shrink-0 text-ink-faint" /><span className="truncate">{d.name}</span></span>
                              <a href={docHref(d.id)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300"><Eye className="h-3.5 w-3.5" />View</a>
                              <a href={docHref(d.id, true)} className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300"><Download className="h-3.5 w-3.5" />Download</a>
                              <span className="text-[0.75rem] text-ink-faint">{d.source === "xero" ? "from Xero" : d.source === "gmail" ? "from Gmail" : d.source === "email" ? "emailed in" : "uploaded"} · {when(d.created_at, tz)}</span>
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {parts.documents.some((d) => !d.request_id) && (
              <div>
                <p className="mb-1.5 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">Other files</p>
                <ul className="space-y-1.5">{parts.documents.filter((d) => !d.request_id).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
                    <span className="inline-flex min-w-0 items-center gap-1.5"><FileText className="h-3.5 w-3.5 shrink-0 text-ink-faint" /><span className="truncate font-medium">{d.name}</span></span>
                    <a href={docHref(d.id)} target="_blank" rel="noopener" className="text-brand-700 hover:underline dark:text-brand-300">View</a>
                    <a href={docHref(d.id, true)} className="text-brand-700 hover:underline dark:text-brand-300">Download</a>
                    <span className="text-[0.75rem] text-ink-faint">{d.source === "signed" ? "signed application" : d.source} · {when(d.created_at, tz)}</span>
                  </li>
                ))}</ul>
              </div>
            )}
          </div>
        </Section>

        <Section title="Consent & signatures" id="signed">
          <div className={cn("grid gap-6", file.applicants > 1 && "lg:grid-cols-2")}>
            {fullNames.map((n, i) => {
              const sig = signed.find((x) => x.applicant === i + 1);
              return (
                <div key={i}>
                  <p className="mb-2 text-[0.9375rem] font-semibold">{n}</p>
                  <ul className="space-y-1 text-[0.8125rem]">{CONSENTS.map((c) => { const ok = a[`a${i + 1}.${c.key}`] === "yes"; return <li key={c.key} className={ok ? "text-ink" : "text-ink-faint"}>{ok ? "✓" : "○"} {c.label}</li>; })}</ul>
                  {sig ? (
                    <div className="mt-3 rounded-xl bg-canvas p-3 ring-1 ring-inset ring-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sig.image} alt={`Signature of ${sig.signed_name}`} className="h-16 w-auto dark:invert" />
                      <p className="mt-1 text-[0.875rem] font-medium">{sig.signed_name}</p>
                      <p className="text-[0.75rem] text-ink-faint">Signed {when(sig.signed_at, tz)}{sig.ip ? ` · IP ${sig.ip}` : ""}</p>
                    </div>
                  ) : <p className="mt-3 text-[0.8125rem] text-ink-faint">Not signed yet.</p>}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Messages with the client" id="messages">
          <BrokerMessages fileId={file.id} msgs={parts.messages} preview={acc.kind === "preview"} clientName={names[0]} />
        </Section>
        <p className="pb-6 text-center text-[0.75rem] text-ink-faint">Private — shared with you by {org?.name}. Every view and download is recorded.</p>
      </main>
    </div>
  );
}
