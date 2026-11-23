import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { fmtHours, readCare } from "@/lib/nerdherd/care";
import { loadBlock } from "@/lib/nerdherd/care-server";
import { readNerd } from "@/lib/nerdherd/core";
import { RequestForm, type RequestType } from "@/components/portal/care-forms";
import { isUuid, requirePortal } from "../../portal-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "New request", robots: { index: false, follow: false } };

/** Request tasks from prepaid hours, lodge a one-off job for a quote, or report a problem — one form, three kinds. */
export default async function NewRequest({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ type?: string; site?: string; updates?: string; about?: string }> }) {
  const { slug } = await params;
  const q = await searchParams;
  const { org, customerIds, customers } = await requirePortal(slug);
  const svc = createServiceClient();
  const [{ data: ws }, { data: o }, block] = await Promise.all([
    svc.from("websites").select("id, domain, customer_id, status").eq("organisation_id", org.id).in("customer_id", customerIds).neq("status", "archived").order("domain"),
    svc.from("organisations").select("settings").eq("id", org.id).single(),
    loadBlock(svc, org.id, customerIds),
  ]);
  const sites = (ws ?? []) as { id: string; domain: string; customer_id: string | null }[];
  const care = readCare(o?.settings);
  const nerd = readNerd(o?.settings);
  const canTasks = care.enabled && !!block;
  const type: RequestType = q.type === "tasks" || q.type === "problem" ? q.type : "job";
  const site = q.site && isUuid(q.site) && sites.some((s) => s.id === q.site) ? q.site : null;

  // "Ask us to update these" from a site card: list what's waiting as the tasks
  let presetTasks: string[] = [];
  let presetSubject = q.about === "care" ? "Tell me about a website care plan" : "";
  if (site && q.updates) {
    const { data: c } = await svc.from("website_connectors").select("wp_version, wp_update, plugins, themes").eq("website_id", site).maybeSingle();
    const conn = c as { wp_version: string | null; wp_update: string | null; plugins: { name: string; version: string; update: string | null }[] | null; themes: { name: string; version: string; update: string | null }[] | null } | null;
    if (conn) {
      presetTasks = [
        ...(conn.wp_update ? [`Update WordPress ${conn.wp_version ?? ""} → ${conn.wp_update}`] : []),
        ...(conn.plugins ?? []).filter((p) => p?.update).map((p) => `Update ${p.name} ${p.version} → ${p.update}`),
        ...(conn.themes ?? []).filter((t) => t?.update).map((t) => `Update theme ${t.name} ${t.version} → ${t.update}`),
      ].slice(0, 40);
      presetSubject = `Run the waiting updates on ${sites.find((s) => s.id === site)?.domain ?? "my site"}`;
    }
  }

  return (
    <div className="mx-auto max-w-[860px] space-y-6">
      <Link href={`/p/${slug}`} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Your account</Link>
      <div>
        <h1 className="portal-serif text-[2.25rem] font-semibold leading-tight text-ink">How can we help?</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">Everything you send lands with our team, and every reply stays here with your request.</p>
      </div>
      <div className="rounded-[24px] bg-surface p-5 ring-1 ring-line sm:p-7">
        <RequestForm slug={slug} customers={customers} sites={sites} type={type} site={site} presetTasks={presetTasks} presetSubject={presetSubject}
          hoursLeft={block && block.boughtMin > 0 ? fmtHours(block.leftMin) : null} minHours={nerd.minHours} canTasks={canTasks} />
      </div>
      {canTasks && block && block.leftMin <= 0 && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[0.875rem] text-amber-900 ring-1 ring-amber-200">
          You&apos;ve no prepaid hours left. <Link href={`/p/${slug}/care/hours#buy`} className="font-semibold underline">Buy a block</Link>, or lodge it as a job and we&apos;ll quote it.
        </p>
      )}
    </div>
  );
}
