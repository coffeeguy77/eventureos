import Link from "next/link";
import { ChevronRight, Plus, Settings, Paperclip } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { fmtDate, money } from "@/lib/format";
import { readPrinting } from "@/lib/printing/core";
import { PRINT_STATUS } from "@/lib/printing/status";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "open", label: "To do", statuses: ["new", "quoted", "approved", "printing", "ready"] },
  { key: "new", label: "New", statuses: ["new"] }, { key: "quoted", label: "Quoted", statuses: ["quoted"] },
  { key: "work", label: "Approved & printing", statuses: ["approved", "printing"] }, { key: "ready", label: "Ready", statuses: ["ready"] },
  { key: "done", label: "Done", statuses: ["done", "cancelled"] }, { key: "all", label: "All", statuses: [] as string[] },
] as const;

/** Print jobs: what's come in from the website, what's quoted, approved, printing and ready. */
export default async function PrintingPage({ searchParams }: { searchParams: Promise<{ v?: string; q?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const view = VIEWS.find((x) => x.key === sp.v) ?? VIEWS[0];
  let query = supabase.from("print_jobs").select("id, number, title, status, contact_name, company, total, needed_by, source, created_at, print_files(count)").eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(300);
  if (view.statuses.length) query = query.in("status", view.statuses as unknown as string[]);
  const q = (sp.q ?? "").trim().replace(/[%_,()]/g, "");
  if (q) query = query.or(`title.ilike.%${q}%,contact_name.ilike.%${q}%,company.ilike.%${q}%,number.ilike.%${q}%`);
  const { data } = await query;
  type Row = { id: string; number: string; title: string; status: string; contact_name: string | null; company: string | null; total: number; needed_by: string | null; source: string; created_at: string; print_files: { count: number }[] };
  const rows = (data ?? []) as Row[];
  const p = readPrinting(org.settings);
  return (
    <div>
      <PageHeader title="Printing" subtitle={p.enabled ? <>Customers send artwork from your <a className="underline" href={`/hire/${org.slug}/printing`} target="_blank" rel="noreferrer">Printing page</a>.</> : "The Printing page on your events website is off — turn it on in Printing settings."}
        actions={<><ButtonLink href="/printing/settings"><Settings className="h-4 w-4" />Settings</ButtonLink><ButtonLink href="/printing/new" variant="primary"><Plus className="h-4 w-4" />New print job</ButtonLink></>} />
      <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
        {VIEWS.map((v) => <Link key={v.key} href={`/printing?v=${v.key}`} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", v.key === view.key ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{v.label}</Link>)}
      </div>
      <form className="mb-4"><input type="hidden" name="v" value={view.key} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search jobs, customers, numbers" className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-[0.875rem]" /></form>
      {!rows.length ? <Card><EmptyState title="No print jobs here">Jobs from your website and ones you add appear here.</EmptyState></Card> : (
        <Card className="divide-y divide-line">
          {rows.map((r) => {
            const st = PRINT_STATUS[r.status] ?? PRINT_STATUS.new;
            const files = r.print_files?.[0]?.count ?? 0;
            return (
              <Link key={r.id} href={`/printing/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] font-medium text-ink"><span className="text-ink-muted">{r.number}</span> · {r.title}</p>
                  <p className="truncate text-[0.75rem] text-ink-muted">{[r.company, r.contact_name].filter(Boolean).join(" — ") || "No customer yet"} · {fmtDate(r.created_at.slice(0, 10), "short")}{r.needed_by ? ` · needed ${fmtDate(r.needed_by, "short")}` : ""}{r.source === "online" ? " · from website" : ""}</p>
                </div>
                {files > 0 && <span className="flex items-center gap-1 text-[0.75rem] text-ink-muted"><Paperclip className="h-3.5 w-3.5" />{files}</span>}
                <span className="text-[0.8125rem] tabular-nums text-ink">{Number(r.total) > 0 ? money(Number(r.total), org.currency) : "—"}</span>
                <Badge tone={st.tone}>{st.label}</Badge>
                <ChevronRight className="h-4 w-4 text-ink-faint" />
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
