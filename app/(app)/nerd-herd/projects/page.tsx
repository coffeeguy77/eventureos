import Link from "next/link";
import { canManage, requireOrg } from "@/lib/context";
import { fmtDate, money } from "@/lib/format";
import { readNerd } from "@/lib/nerdherd/core";
import { STATUS_LABEL, toEntry, toProject, totals } from "@/lib/nerdherd/projects";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewProject } from "@/components/nerdherd/project-tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

/** Nerd Herd → Projects: ongoing client work with a running time log and bill. */
export default async function Projects() {
  const { supabase, org, role } = await requireOrg();
  const { data, error } = await supabase.from("nh_projects").select("*, customers(name)").eq("organisation_id", org.id).neq("status", "archived").order("updated_at", { ascending: false });
  if (error) return <Card><EmptyState title="Run the Projects update first">Open Supabase → SQL editor and run supabase/migrations/0118_nh_projects.sql, then refresh.</EmptyState></Card>;
  const rows = (data ?? []) as (Record<string, unknown> & { customers: { name: string } | null })[];
  const ids = rows.map((r) => r.id as string);
  const [{ data: time }, { data: clients }] = await Promise.all([
    ids.length ? supabase.from("nh_project_time").select("*").in("project_id", ids) : Promise.resolve({ data: [] }),
    supabase.from("customers").select("id, name").eq("organisation_id", org.id).order("name").limit(2000),
  ]);
  const entries = ((time ?? []) as Record<string, unknown>[]).map((t) => ({ ...toEntry(t), project_id: t.project_id as string }));
  const rate = readNerd(org.settings).hourlyRate;
  const tone = { active: "brand", on_hold: "amber", complete: "green", archived: "neutral" } as const;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader title="Projects" subtitle="Ongoing work billed as it goes — the client follows it, asks for changes and sees what's owed in their portal." />
        {rows.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {rows.map((r) => {
              const p = toProject(r);
              const mine = entries.filter((e) => e.project_id === p.id);
              const all = totals(mine, p.margin_percent, p.rate ?? rate);
              const unbilled = totals(mine.filter((e) => !e.billed_invoice_id), p.margin_percent, p.rate ?? rate);
              const last = mine.map((e) => e.work_date).sort().pop();
              return (
                <li key={p.id}>
                  <Link href={`/nerd-herd/projects/${p.id}`} className="flex flex-wrap items-start gap-3 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold text-ink">{p.name}<Badge tone={tone[p.status]}>{STATUS_LABEL[p.status]}</Badge></p>
                      <p className="text-[0.8125rem] text-ink-muted">{r.customers?.name ?? "Client"}{p.status_note ? ` · ${p.status_note}` : ""}</p>
                    </div>
                    <div className="text-right text-[0.8125rem]">
                      <p className="font-semibold text-ink">{all.recorded} hrs recorded</p>
                      <p className="text-ink-muted">{unbilled.hours > 0 ? `${money(unbilled.incGst, org.currency)} unbilled` : "All billed"}{last ? ` · last ${fmtDate(last)}` : ""}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState title="No projects yet">Start one for a client with ongoing work — a build, an upgrade, a retainer.</EmptyState>}
      </Card>
      {canManage(role) && (
        <Card>
          <CardHeader title="Start a project" />
          <NewProject clients={(clients ?? []) as { id: string; name: string }[]} />
        </Card>
      )}
    </div>
  );
}
