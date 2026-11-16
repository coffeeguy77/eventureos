import Link from "next/link";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { fmtDateTime, money } from "@/lib/format";
import { NewLoanFile } from "@/components/loans/new-file";
import { STATUS_LABEL, statusTone } from "@/components/loans/status";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function LoansPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { supabase, org } = await requireOrg();
  const show = (await searchParams).show === "all" ? "all" : "open";
  let q = supabase.from("loan_files").select("id, title, status, contact_name, amount, applicants, client_seen_at, updated_at, submitted_at")
    .eq("organisation_id", org.id).order("updated_at", { ascending: false }).limit(300);
  if (show === "open") q = q.not("status", "in", "(settled,closed)");
  const [{ data: files }, { data: reqs }, { data: unread }] = await Promise.all([
    q,
    supabase.from("loan_doc_requests").select("file_id, status").eq("organisation_id", org.id),
    supabase.from("loan_messages").select("file_id").eq("organisation_id", org.id).eq("from_side", "client").is("read_at", null),
  ]);
  const docs = new Map<string, { need: number; all: number }>();
  for (const r of reqs ?? []) { const d = docs.get(r.file_id) ?? { need: 0, all: 0 }; d.all++; if (r.status === "needed" || r.status === "redo") d.need++; docs.set(r.file_id, d); }
  const msgs = new Map<string, number>();
  for (const m of unread ?? []) msgs.set(m.file_id, (msgs.get(m.file_id) ?? 0) + 1);
  const now = Date.now();
  return (
    <div>
      <PageHeader title="Loan files" subtitle="Your clients' applications — they fill them in from a private link while you watch, and their documents come in by upload, email, Gmail or Xero."
        actions={<div className="flex gap-2"><Link href="/loans/settings" className="inline-flex h-9 items-center rounded-lg px-3 text-[0.875rem] font-medium text-ink ring-1 ring-inset ring-line hover:bg-canvas">Settings</Link><NewLoanFile /></div>} />
      <div className="mb-3 flex gap-2 text-[0.8125rem]">
        <Link href="/loans" className={cn("rounded-full px-3 py-1 ring-1 ring-inset", show === "open" ? "bg-brand-50 text-brand-800 ring-brand-200" : "text-ink-muted ring-line")}>Open</Link>
        <Link href="/loans?show=all" className={cn("rounded-full px-3 py-1 ring-1 ring-inset", show === "all" ? "bg-brand-50 text-brand-800 ring-brand-200" : "text-ink-muted ring-line")}>All</Link>
      </div>
      {!files?.length ? (
        <EmptyState title="No loan files yet">Add a client — they get a link to fill in their application and send their documents.</EmptyState>
      ) : (
        <Card className="divide-y divide-line">
          {files.map((f) => {
            const d = docs.get(f.id); const live = f.client_seen_at && now - new Date(f.client_seen_at).getTime() < 30_000;
            return (
              <Link key={f.id} href={`/loans/${f.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-ink">{live && <span className="relative flex h-2.5 w-2.5" title="Filling it in now"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>}{f.title}</p>
                  <p className="text-[0.8125rem] text-ink-muted">{f.contact_name ?? "—"}{f.amount ? ` · ${money(f.amount)}` : ""} · updated {fmtDateTime(f.updated_at, org.timezone)}</p>
                </div>
                {(msgs.get(f.id) ?? 0) > 0 && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[0.75rem] font-semibold text-on-brand">{msgs.get(f.id)} new</span>}
                {d && <span className="text-[0.8125rem] text-ink-muted">{d.all - d.need}/{d.all} docs</span>}
                <span className={cn("rounded-full px-2 py-0.5 text-[0.75rem] font-medium ring-1 ring-inset", statusTone(f.status))}>{STATUS_LABEL[f.status] ?? f.status}</span>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
