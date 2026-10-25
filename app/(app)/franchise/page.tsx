import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, ListChecks } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { readSite } from "@/lib/site/site";
import { MODEL_LABEL, STATUS_LABEL, STATUS_TONE, type FranchiseModel, type FranchiseStatus } from "@/lib/franchise/core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Franchise" };

const VIEWS = [
  { key: "open", label: "To do", statuses: ["enquiry", "invited", "applied", "reviewing"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "closed", label: "Declined / withdrawn", statuses: ["declined", "withdrawn"] },
] as const;

/** Franchise: enquiries from the franchise page → application → review → approve / decline. */
export default async function FranchisePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { supabase, org, role } = await requireOrg();
  if (!["owner", "admin", "manager"].includes(role)) redirect("/dashboard");
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view) ?? VIEWS[0];
  const { data, error } = await supabase.from("franchise_applications").select("id, status, name, email, location, model, created_at, applied_at").eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(500);
  const page = readSite((org as unknown as { settings: unknown }).settings).pages.find((p) => p.layout === "franchise" || p.form === "franchise");
  type Row = { id: string; status: FranchiseStatus; name: string; email: string; location: string | null; model: FranchiseModel | null; created_at: string; applied_at: string | null };
  const all = (data ?? []) as Row[];
  const rows = all.filter((r) => (view.statuses as readonly string[]).includes(r.status));
  const counts = Object.fromEntries(VIEWS.map((v) => [v.key, all.filter((r) => (v.statuses as readonly string[]).includes(r.status)).length]));
  const stage = (s: FranchiseStatus) => all.filter((r) => r.status === s).length;

  return (
    <>
      <PageHeader eyebrow="Growth" title="Franchise" subtitle="People who've asked about a franchise or brand licence. Send them the application, review it, then approve or decline."
        actions={<span className="flex flex-wrap items-center gap-4"><Link href="/franchise/questions" className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600"><ListChecks className="h-3.5 w-3.5" />Application questions</Link>
          {page && <a href={`/site/${org.slug}/${page.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-600">View franchise page<ExternalLink className="h-3.5 w-3.5" /></a>}</span>} />
      {error ? (
        <Card><EmptyState title="Franchise needs a database update">Run <code>0066_franchise.sql</code> in Supabase → SQL editor, then refresh.</EmptyState></Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["enquiry", "invited", "applied", "reviewing"] as const).map((s) => (
              <div key={s} className="rounded-xl bg-surface p-3 ring-1 ring-line"><p className="text-[0.75rem] text-ink-muted">{STATUS_LABEL[s]}</p><p className="mt-1 text-[1.5rem] font-semibold tabular-nums">{stage(s)}</p></div>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {VIEWS.map((v) => <Link key={v.key} href={`/franchise?view=${v.key}`} className={cn("rounded-full px-3 py-1.5 text-[0.8125rem] font-medium", v.key === view.key ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{v.label}{counts[v.key] ? ` (${counts[v.key]})` : ""}</Link>)}
          </div>
          {rows.length === 0 ? (
            <Card><EmptyState title={view.key === "open" ? "No enquiries waiting" : "Nothing here yet"}>{page ? "Enquiries from your franchise page land here." : "Add a page with the “Franchise sales page” design in Website → Pages, domain & SEO."}</EmptyState></Card>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`/franchise/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50">
                      <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{r.name}</span><span className="block truncate text-[0.8125rem] text-ink-muted">{[r.location, r.model ? MODEL_LABEL[r.model] : null].filter(Boolean).join(" · ") || r.email}</span></span>
                      <span className={cn("rounded-full px-2.5 py-1 text-[0.75rem] font-semibold ring-1", STATUS_TONE[r.status])}>{STATUS_LABEL[r.status]}</span>
                      <span className="w-24 text-right text-[0.8125rem] text-ink-faint">{fmtDate(r.applied_at ?? r.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
