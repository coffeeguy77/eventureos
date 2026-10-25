import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { emailConfigured } from "@/lib/email/send";
import { MODEL_LABEL, STATUS_LABEL, STATUS_TONE, qText, readQuestions } from "@/lib/franchise/core";
import { FRANCHISE_COLS, type FranchiseRow } from "@/lib/franchise/server";
import { FranchiseControls } from "@/components/franchise/controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Franchise application" };

export default async function FranchiseApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, org, role } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await supabase.from("franchise_applications").select(FRANCHISE_COLS).eq("organisation_id", org.id).eq("id", id).maybeSingle();
  if (!data) notFound();
  const a = data as unknown as FranchiseRow;
  const answers = a.answers ?? {};
  const QUESTIONS = readQuestions((org as unknown as { settings: unknown }).settings);
  const sections = [...new Set(QUESTIONS.map((q) => q.section))];
  // Answers to questions that have since been removed or renamed
  const known = new Set(QUESTIONS.map((q) => q.key));
  const extra = Object.entries(answers).filter(([k2, v]) => !known.has(k2) && k2 !== "agree" && v);
  const timeline = [
    { t: "Enquiry", at: a.created_at }, { t: "Application sent", at: a.invited_at }, { t: "Application in", at: a.applied_at },
    { t: a.status === "approved" ? "Approved" : a.status === "declined" ? "Declined" : a.status === "withdrawn" ? "Withdrawn" : "Decision", at: a.decided_at },
  ];

  return (
    <div className="space-y-5">
      <Link href="/franchise" className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Franchise</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.5rem] font-semibold text-ink">{a.name}</h1>
          <p className="mt-1 text-[0.875rem] text-ink-muted">{[a.model ? MODEL_LABEL[a.model] : null, a.location].filter(Boolean).join(" · ") || "Franchise enquiry"}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-[0.8125rem] font-semibold ring-1", STATUS_TONE[a.status])}>{STATUS_LABEL[a.status]}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Contact" />
            <ul className="space-y-2 px-5 pb-5 text-[0.9375rem]">
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-ink-faint" /><a href={`mailto:${a.email}`} className="text-brand-600 hover:underline">{a.email}</a></li>
              {a.phone && <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-ink-faint" /><a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">{a.phone}</a></li>}
              {a.location && <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-ink-faint" />{a.location}</li>}
            </ul>
            {a.message && <div className="border-t border-line px-5 py-4"><p className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">Their enquiry</p><p className="mt-1 whitespace-pre-line text-[0.9375rem] text-ink">{a.message}</p></div>}
          </Card>

          <Card>
            <CardHeader title="Application" subtitle={a.applied_at ? `Sent ${fmtDate(a.applied_at)}` : "Not filled in yet — send them the application link."} />
            {Object.keys(answers).length > 0 ? (
              <div className="space-y-5 px-5 pb-5">
                {sections.map((sec) => (
                  <div key={sec}>
                    <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-brand-600">{qText(sec, org.name)}</p>
                    <dl className="mt-2 divide-y divide-line rounded-lg ring-1 ring-line">
                      {QUESTIONS.filter((q) => q.section === sec && q.key !== "agree").map((q) => (
                        <div key={q.key} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-4">
                          <dt className="text-[0.8125rem] text-ink-muted">{qText(q.label, org.name)}</dt>
                          <dd className="whitespace-pre-line text-[0.9375rem] text-ink">{q.kind === "yesno" ? (answers[q.key] === "yes" ? "✓ Yes" : <span className="text-ink-faint">Not ticked</span>) : answers[q.key] || <span className="text-ink-faint">—</span>}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
                {extra.length > 0 && (
                  <div>
                    <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">Other answers (questions since changed)</p>
                    <dl className="mt-2 divide-y divide-line rounded-lg ring-1 ring-line">
                      {extra.map(([k2, v]) => <div key={k2} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-4"><dt className="text-[0.8125rem] text-ink-muted">{k2.replace(/_/g, " ")}</dt><dd className="whitespace-pre-line text-[0.9375rem] text-ink">{v}</dd></div>)}
                    </dl>
                  </div>
                )}
                {answers.agree === "yes" && <p className="text-[0.8125rem] text-ink-muted">✓ They confirmed their details are true and agreed to be contacted.</p>}
              </div>
            ) : <p className="px-5 pb-5 text-[0.875rem] text-ink-muted">Nothing yet.</p>}
          </Card>
        </div>

        <div className="space-y-5">
          <FranchiseControls id={a.id} status={a.status} notes={a.notes ?? ""} emailReady={emailConfigured()} invited={!!a.invited_at} />
          <Card>
            <CardHeader title="Timeline" />
            <ol className="space-y-2 px-5 pb-5 text-[0.875rem]">
              {timeline.map((s) => <li key={s.t} className="flex justify-between gap-3"><span className={s.at ? "text-ink" : "text-ink-faint"}>{s.t}</span><span className="text-ink-muted">{s.at ? fmtDate(s.at) : "—"}</span></li>)}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
