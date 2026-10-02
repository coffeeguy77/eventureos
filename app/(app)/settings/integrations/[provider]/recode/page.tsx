import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/context";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { buildContext } from "@/lib/integrations/sync-runner";
import { errMessage, saveIntegrationSettings } from "@/lib/integrations/runtime";
import { cleanRecodeMap } from "@/lib/integrations/xero-recode-plan";
import { itemDefaults, recodeCandidates, revenueAccounts } from "@/lib/integrations/xero-recode";
import { RecodeTool, type RecodePreview } from "./recode-tool";

export const metadata = { title: "Recode Xero invoices by item" };
export const maxDuration = 60; // each batch talks to Xero

export default async function RecodePage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "xero") notFound();
  const { supabase, org, role, user } = await requireOrg();
  const back = <Link href="/settings/integrations/xero" className="hover:text-ink">Xero</Link>;
  if (role !== "owner" && role !== "admin") {
    return <div><PageHeader eyebrow={back} title="Recode invoices by item" /><Card className="p-5 text-[0.8125rem] text-ink-muted">Only owners and admins can recode invoices in Xero.</Card></div>;
  }

  let accounts: { code: string; name: string }[] = [], items: Record<string, { name: string; account: string | null }> = {};
  let map = {} as ReturnType<typeof cleanRecodeMap>, problem: string | null = null;
  try {
    const ctx = await buildContext(supabase, "user", org.id, "xero", user.id);
    map = cleanRecodeMap(ctx.integration.settings?.recode_map);
    [accounts, items] = await Promise.all([revenueAccounts(ctx), itemDefaults(ctx)]);
    // Keep the account names for the dashboard's revenue figures (so it never has to call Xero)
    const names = Object.fromEntries(accounts.map((a) => [a.code, a.name]));
    if (JSON.stringify(names) !== JSON.stringify(ctx.integration.settings?.account_names ?? {})) {
      await saveIntegrationSettings(ctx, { account_names: names }).catch(() => undefined);
    }
  } catch (e) { problem = errMessage(e); }

  let cands: Awaited<ReturnType<typeof recodeCandidates>> = [];
  if (!problem) { try { cands = await recodeCandidates(supabase, org.id, map); } catch (e) { problem = errMessage(e); } }
  const byItem = new Map<string, RecodePreview["items"][number]>();
  for (const c of cands) for (const l of c.lines) {
    const k = `${l.item}|${l.from ?? ""}`;
    const row = byItem.get(k) ?? { item: l.item, from: l.from, to: l.to, lines: 0, amount: 0, invoices: 0, oldest: c.issue_date };
    row.lines++; row.amount += l.amount;
    if (c.issue_date && (!row.oldest || c.issue_date < row.oldest)) row.oldest = c.issue_date;
    byItem.set(k, row);
  }
  for (const r of byItem.values()) r.invoices = cands.filter((c) => c.lines.some((l) => l.item === r.item && (l.from ?? "") === (r.from ?? ""))).length;
  const { count: recodedBefore } = await supabase.from("activity_logs").select("id", { count: "exact", head: true })
    .eq("organisation_id", org.id).eq("action", "xero.recode");
  const preview: RecodePreview = {
    invoices: cands.length,
    paid: cands.filter((c) => c.status === "paid").length,
    lines: cands.reduce((a, c) => a + c.lines.length, 0),
    items: [...byItem.values()].sort((a, b) => a.item.localeCompare(b.item) || b.lines - a.lines),
    next: cands[0] ? { id: cands[0].id, number: cands[0].number, status: cands[0].status } : null,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={back} title="Recode invoices by item"
        subtitle="Move every invoice line for an item to the revenue account you choose — including paid invoices. Only the account changes: descriptions, amounts and GST stay exactly as they are." />
      {problem
        ? <Card className="p-5 text-[0.8125rem] text-rose-700">Couldn&apos;t reach Xero: {problem}</Card>
        : <RecodeTool accounts={accounts} items={items} map={map} preview={preview} currency={org.currency} alreadyTested={!!recodedBefore} />}
      <Card className="mt-6">
        <CardHeader title="Good to know" />
        <ul className="list-disc space-y-1.5 px-5 pb-5 pl-9 text-[0.7812rem] text-ink-muted">
          <li>Invoices before your Xero lock date can&apos;t be changed — they&apos;re listed as skipped with Xero&apos;s reason.</li>
          <li>Changing the account on old invoices changes those periods&apos; reports. GST is unaffected when the tax rate stays the same.</li>
          <li>Each change is recorded in the activity log. To change future invoices, also set the account on each item in Xero (Business → Products and services).</li>
          <li>Uses EventureOS&apos;s copy of your Xero invoices — press Sync now on the Xero page first if you&apos;ve made changes in Xero today.</li>
        </ul>
      </Card>
    </div>
  );
}
