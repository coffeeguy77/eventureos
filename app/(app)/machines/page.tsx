import Link from "next/link";
import { ChevronRight, Globe, Plus, ReceiptText, Wrench } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { fmtDate, money } from "@/lib/format";
import { JOB_KINDS, JOB_STATUS, readMachines, type MachineJobKind, type MachineJobStatus } from "@/lib/machines/core";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "open", label: "To do", statuses: ["new", "booked", "in_progress", "waiting_parts"], kinds: [] as string[] },
  { key: "new", label: "New enquiries", statuses: ["new"], kinds: [] as string[] },
  { key: "booked", label: "Booked", statuses: ["booked"], kinds: [] as string[] },
  { key: "work", label: "In progress & parts", statuses: ["in_progress", "waiting_parts"], kinds: [] as string[] },
  { key: "sales", label: "Machine sales", statuses: [] as string[], kinds: ["sale"] },
  { key: "done", label: "Done", statuses: ["done", "cancelled"], kinds: [] as string[] },
  { key: "all", label: "All", statuses: [] as string[], kinds: [] as string[] },
] as const;

/** Coffee machine jobs: website enquiries, booked callouts, jobs in progress, and machine sale enquiries. */
export default async function MachinesPage({ searchParams }: { searchParams: Promise<{ v?: string; q?: string }> }) {
  const { supabase, org } = await requireOrg();
  const sp = await searchParams;
  const view = VIEWS.find((x) => x.key === sp.v) ?? VIEWS[0];
  let query = supabase.from("machine_jobs").select("id, number, kind, status, contact_name, company, brand, model, issue, price_inc_gst, booked_for, source, invoice_id, created_at").eq("organisation_id", org.id).order("created_at", { ascending: false }).limit(300);
  if (view.statuses.length) query = query.in("status", view.statuses as unknown as string[]);
  if (view.kinds.length) query = query.in("kind", view.kinds as unknown as string[]);
  const q = (sp.q ?? "").trim().replace(/[%_,()]/g, "");
  if (q) query = query.or(`contact_name.ilike.%${q}%,company.ilike.%${q}%,number.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%,serial.ilike.%${q}%`);
  const [{ data }, { count: fresh }] = await Promise.all([query, supabase.from("machine_jobs").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("status", "new")]);
  type Row = { id: string; number: string; kind: MachineJobKind; status: MachineJobStatus; contact_name: string | null; company: string | null; brand: string | null; model: string | null; issue: string | null; price_inc_gst: number; booked_for: string | null; source: string; invoice_id: string | null; created_at: string };
  const rows = (data ?? []) as Row[];
  const s = readMachines(org.settings);
  return (
    <div>
      <PageHeader title="Coffee machines" subtitle={s.serviceEnabled ? <>Service enquiries come in from your <a className="underline" href={`/hire/${org.slug}/repairs`} target="_blank" rel="noreferrer">Repairs page</a>{s.enabled ? <>, machine enquiries from your <a className="underline" href={`/hire/${org.slug}/machines`} target="_blank" rel="noreferrer">Coffee machines page</a></> : null}.</> : "Your Repairs page is off — turn it on in Settings."}
        actions={<><ButtonLink href="/machines/quick-sale"><ReceiptText className="h-4 w-4" />Quick sale</ButtonLink><ButtonLink href="/machines/new" variant="primary"><Plus className="h-4 w-4" />New job</ButtonLink></>} />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Link href="/machines/new?kind=repair" className="group flex items-center gap-3 rounded-2xl bg-ink p-4 text-surface shadow-sm hover:opacity-95">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><Wrench className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-[0.9375rem] font-semibold">Book a callout</span><span className="block text-[0.75rem] opacity-75">${s.calloutFirstHour} first hour, then ${s.hourly}/h {s.ratesIncGst ? "inc" : "+"} GST</span></span>
          <ChevronRight className="h-5 w-5 opacity-60 group-hover:opacity-100" />
        </Link>
        <Link href="/machines?v=new" className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line hover:bg-canvas">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-700"><Globe className="h-5 w-5" /></span>
          <span><span className="block text-[1.25rem] font-semibold tabular-nums text-ink">{fresh ?? 0}</span><span className="block text-[0.75rem] text-ink-muted">new enquiries to answer</span></span>
        </Link>
        <Link href="/machines/quick-sale" className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line hover:bg-canvas">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ReceiptText className="h-5 w-5" /></span>
          <span><span className="block text-[0.9375rem] font-semibold text-ink">Sell something</span><span className="block text-[0.75rem] text-ink-muted">Client + items → invoice</span></span>
        </Link>
      </div>

      <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
        {VIEWS.map((v) => <Link key={v.key} href={`/machines?v=${v.key}`} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", v.key === view.key ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{v.label}</Link>)}
      </div>
      <form className="mb-4"><input type="hidden" name="v" value={view.key} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search jobs, customers, machines, serials" className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-[0.875rem]" /></form>
      {!rows.length ? <Card><EmptyState title="No jobs here">Enquiries from your website and jobs you create appear here.</EmptyState></Card> : (
        <Card className="divide-y divide-line">
          {rows.map((r) => {
            const st = JOB_STATUS[r.status] ?? JOB_STATUS.new;
            const machine = [r.brand, r.model].filter(Boolean).join(" ");
            return (
              <Link key={r.id} href={`/machines/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] font-medium text-ink"><span className="text-ink-muted">{r.number}</span> · {[r.company, r.contact_name].filter(Boolean).join(" — ") || "No customer yet"}</p>
                  <p className="truncate text-[0.75rem] text-ink-muted">{JOB_KINDS[r.kind]}{machine ? ` · ${machine}` : ""}{r.issue ? ` · ${r.issue.slice(0, 80)}` : ""}</p>
                  <p className="truncate text-[0.7188rem] text-ink-faint">{r.booked_for ? `Booked ${new Date(r.booked_for).toLocaleString("en-AU", { timeZone: org.timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : `Added ${fmtDate(r.created_at.slice(0, 10), "short")}`}{r.source === "online" ? " · from website" : ""}{r.invoice_id ? " · invoiced" : ""}</p>
                </div>
                <span className="text-[0.8125rem] tabular-nums text-ink">{Number(r.price_inc_gst) > 0 ? money(Number(r.price_inc_gst), org.currency) : "—"}</span>
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
