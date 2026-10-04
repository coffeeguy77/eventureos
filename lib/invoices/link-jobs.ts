import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchInvoiceToJob, type InvoiceForMatch, type JobForMatch } from "./match-job";

/**
 * Attach invoices that came from Xero to the job they're for, when the invoice names the job's date and the
 * client has exactly one job on that date. Runs after each Xero sync. Never changes an invoice already on a job.
 * Returns how many were linked.
 */
export async function linkInvoicesToJobs(db: SupabaseClient, orgId: string): Promise<number> {
  const since = new Date(Date.now() - 548 * 86400e3).toISOString().slice(0, 10); // ~18 months
  const { data: invs } = await db.from("invoices").select("id, customer_id, issue_date, line_items, reference")
    .eq("organisation_id", orgId).is("event_id", null).neq("status", "void").gte("issue_date", since).limit(2000);
  const list = (invs ?? []) as InvoiceForMatch[];
  if (!list.length) return 0;
  const customers = [...new Set(list.map((i) => i.customer_id))];
  const jobs: JobForMatch[] = [];
  for (let i = 0; i < customers.length; i += 200) {
    const { data } = await db.from("events").select("id, customer_id, event_date").eq("organisation_id", orgId)
      .in("customer_id", customers.slice(i, i + 200)).not("event_date", "is", null).neq("status", "cancelled");
    jobs.push(...((data ?? []) as JobForMatch[]));
  }
  if (!jobs.length) return 0;
  let linked = 0;
  for (const inv of list) {
    const jobId = matchInvoiceToJob(inv, jobs);
    if (!jobId) continue;
    const { error } = await db.from("invoices").update({ event_id: jobId }).eq("id", inv.id).eq("organisation_id", orgId).is("event_id", null);
    if (!error) linked++;
  }
  return linked;
}
