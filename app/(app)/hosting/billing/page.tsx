import Link from "next/link";
import { Download } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { money } from "@/lib/format";
import { loadBillingCheck } from "@/lib/hosting/billing-check";
import { describeSchedule, type Unit } from "@/lib/recurring/core";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmClient, MatchNow } from "@/components/hosting/billing-tools";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const GROUPS = [
  { key: "owing", label: "Owing", hint: "Overdue hosting invoices.", tone: "red" },
  { key: "missing", label: "No invoice found", hint: "We know the client, but there's no hosting invoice in the last 13 months and no repeating invoice. Possibly hosted for free.", tone: "amber" },
  { key: "no_repeat", label: "Billed, no repeating invoice", hint: "Hosting invoices went out in the last year, but nothing repeats — raised by hand, or yearly.", tone: "amber" },
  { key: "confirm", label: "Client to confirm", hint: "A likely client, but not certain. Tap the right one.", tone: "blue" },
  { key: "unknown", label: "No client found", hint: "Nothing links this site to a client. Open it to link one.", tone: "neutral" },
  { key: "billed", label: "Billed and up to date", hint: "A repeating invoice bills this site and nothing is overdue.", tone: "green" },
] as const;

/** Every hosting account against its client, repeating invoice and what's owing — and the gaps. */
export default async function BillingCheckPage({ searchParams }: { searchParams: Promise<{ g?: string; q?: string }> }) {
  const { org } = await requireOrg();
  const sp = await searchParams;
  const r = await loadBillingCheck(createServiceClient(), org.id);
  const count = (k: string) => r.rows.filter((x) => x.group === k).length;
  const g = GROUPS.find((x) => x.key === sp.g)?.key ?? (count("owing") ? "owing" : "missing");
  const meta = GROUPS.find((x) => x.key === g)!;
  const q = (sp.q ?? "").trim().toLowerCase();
  let rows = r.rows.filter((x) => (sp.g === "orphans" ? false : x.group === g) && (!q || [x.domain, x.customer, x.username, x.serverEmail].filter(Boolean).join(" ").toLowerCase().includes(q)));
  if (g === "owing") rows = rows.sort((a, b) => b.owing - a.owing);
  const owingTotal = r.rows.filter((x) => x.group === "owing").reduce((a, x) => a + x.owing, 0);
  const monthly = r.rows.flatMap((x) => x.recurring).filter((x) => x.status === "active").reduce((a, x) => a + (x.unit === "week" ? (x.total * 52) / 12 / x.every : x.total / x.every), 0);
  const showOrphans = sp.g === "orphans";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <Card className="p-3"><p className="text-[1.25rem] font-semibold">{r.rows.length}</p><p className="text-[0.75rem] text-ink-muted">sites on your servers</p></Card>
          <Card className="p-3"><p className="text-[1.25rem] font-semibold">{r.rows.filter((x) => x.recurring.length).length}</p><p className="text-[0.75rem] text-ink-muted">with a repeating invoice</p></Card>
          <Card className="p-3"><p className="text-[1.25rem] font-semibold text-rose-700">{money(owingTotal, org.currency)}</p><p className="text-[0.75rem] text-ink-muted">overdue on {count("owing")} sites</p></Card>
          <Card className="p-3"><p className="text-[1.25rem] font-semibold">{money(monthly, org.currency)}</p><p className="text-[0.75rem] text-ink-muted">a month repeating (switched on)</p></Card>
        </div>
        <div className="flex flex-col items-end gap-2">
          <MatchNow first={r.recurringCount === 0} />
          <a href="/hosting/billing/export" className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-ink-muted underline"><Download className="h-3.5 w-3.5" />Download as a spreadsheet (CSV)</a>
        </div>
      </div>
      {r.recurringCount === 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.8125rem] text-amber-900">Xero's repeating invoices aren't pulled in yet — press <strong>Pull repeating invoices & match</strong>. They come in paused, so nothing is invoiced twice.</p>}

      <div className="no-scrollbar flex flex-wrap gap-1.5">
        {GROUPS.map((x) => <Link key={x.key} href={`/hosting/billing?g=${x.key}`} className={cn("rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", !showOrphans && x.key === g ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{x.label} <span className="opacity-60">{count(x.key)}</span></Link>)}
        <Link href="/hosting/billing?g=orphans" className={cn("rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", showOrphans ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>Repeating, no site <span className="opacity-60">{r.orphanRecurring.length}</span></Link>
      </div>

      {showOrphans ? (
        <>
          <p className="text-[0.8125rem] text-ink-muted">Hosting repeating invoices that don't match a site on your servers — a site that's moved or closed but is still billed, a SiteGround site not added yet, or a reference that needs fixing.</p>
          {!r.orphanRecurring.length ? <Card><EmptyState title="None">Every hosting repeating invoice matches a site.</EmptyState></Card> : (
            <Card className="divide-y divide-line">{r.orphanRecurring.map((o) => (
              <Link key={o.id} href={`/hosting/recurring/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                <div className="min-w-0 flex-1"><p className="truncate text-[0.875rem] font-medium">{o.customer} <span className="font-normal text-ink-muted">· {o.name}</span></p><p className="truncate text-[0.75rem] text-ink-muted">{o.reference ?? "no reference"} · {o.status}</p></div>
                <span className="text-[0.8125rem] tabular-nums">{money(o.total, org.currency)}</span>
              </Link>
            ))}</Card>
          )}
        </>
      ) : (
        <>
          <p className="text-[0.8125rem] text-ink-muted">{meta.hint}</p>
          <form><input type="hidden" name="g" value={g} /><input name="q" defaultValue={sp.q ?? ""} placeholder="Search domains, clients, emails" className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-[0.875rem]" /></form>
          {!rows.length ? <Card><EmptyState title="Nothing here">No sites in this list.</EmptyState></Card> : (
            <Card className="divide-y divide-line">{rows.map((x) => (
              <div key={x.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Link href={`/hosting/${x.id}`} className="text-[0.875rem] font-medium text-ink hover:underline">{x.domain}</Link>
                  {x.suspended && <Badge tone="red" className="ml-2">Suspended</Badge>}
                  <p className="truncate text-[0.75rem] text-ink-muted">{[x.customer ? `${x.customer}${!x.linked ? " (will link on Match)" : ""}` : null, x.server, x.username, x.serverEmail].filter(Boolean).join(" · ")}</p>
                  {x.recurring.length > 0 && <p className="truncate text-[0.75rem] text-ink-muted">{x.recurring.map((rc) => `${rc.name} — ${money(rc.total, org.currency)} ${describeSchedule(rc.every, rc.unit as Unit).toLowerCase()}${rc.status !== "active" ? ` (${rc.status})` : ""}`).join("; ")}</p>}
                  {g === "confirm" && x.suggestion && <div className="mt-1.5"><ConfirmClient accountId={x.id} options={[{ id: x.suggestion.id, name: x.suggestion.name, reasons: x.suggestion.reasons }, ...x.others]} /></div>}
                </div>
                {x.owing > 0 && <span className="text-right text-[0.8125rem] tabular-nums">{money(x.owing, org.currency)}{x.daysOverdue > 0 && <span className="block text-[0.6875rem] text-rose-700">{x.daysOverdue} days over</span>}</span>}
              </div>
            ))}</Card>
          )}
        </>
      )}
    </div>
  );
}
