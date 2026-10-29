"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, Search, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { checkAllSites, type QuickRow } from "@/app/(app)/hosting/doctor-actions";
import { SiteDoctor } from "./site-doctor";
import { cn } from "@/lib/cn";

/** Check any domain, or every hosting account at once (problems first). */
export function CheckAll() {
  const [domain, setDomain] = useState("");
  const [one, setOne] = useState<string | null>(null);
  const [rows, setRows] = useState<QuickRow[] | null>(null);
  const [noServers, setNoServers] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"problems" | "all">("problems");
  const [pending, start] = useTransition();
  const runAll = () => start(async () => {
    setErr(null);
    const r = await checkAllSites();
    if (!r.ok) { setErr(r.error); return; }
    setRows(r.data.rows); setNoServers(r.data.ours === 0);
  });
  const shown = (rows ?? []).filter((r) => filter === "all" || r.emailLevel === "bad" || r.web !== "ours");
  const problems = (rows ?? []).filter((r) => r.emailLevel === "bad" || r.web !== "ours").length;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Check a domain" subtitle="Any website — a client's, a prospect's, or one that's just been moved" />
        <div className="border-t border-line px-5 py-4">
          <form onSubmit={(e) => { e.preventDefault(); setOne(domain.trim() || null); }} className="flex flex-wrap gap-2">
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com.au" aria-label="Domain to check" className="max-w-xs" />
            <Button type="submit"><Search className="h-3.5 w-3.5" />Show</Button>
          </form>
          {one && <div className="mt-4" key={one}><SiteDoctor domain={one} /></div>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Check every hosting account" subtitle="Is each site still pointing at our servers, and is its email working? Takes up to a minute." />
        <div className="border-t border-line px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={pending} onClick={runAll}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}{pending ? "Checking every account…" : rows ? "Check again" : "Check all accounts"}</Button>
            {rows && <span className="text-[0.8125rem] text-ink-muted"><strong className={problems ? "text-rose-700" : "text-emerald-700"}>{problems} need attention</strong> of {rows.length}</span>}
            {rows && <div className="ml-auto flex gap-1">{(["problems", "all"] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-full px-3 py-1 text-[0.75rem] font-medium", filter === f ? "bg-ink text-surface" : "text-ink-muted ring-1 ring-line hover:text-ink")}>{f === "problems" ? "Problems" : "All"}</button>)}</div>}
          </div>
          {noServers && <p className="mt-3 text-[0.8125rem] text-amber-800">Add your servers in Hosting → Servers so we know which addresses are yours.</p>}
          {err && <p role="alert" className="mt-3 text-[0.8125rem] text-rose-700">{err}</p>}
        </div>
        {rows && (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[720px] text-[0.8125rem]">
              <thead><tr className="border-b border-line text-left text-[0.75rem] text-ink-muted"><th className="px-5 py-2 font-medium">Domain</th><th className="px-2 py-2 font-medium">Client</th><th className="px-2 py-2 font-medium">Website</th><th className="px-2 py-2 font-medium">Email</th><th className="px-5 py-2 font-medium">DNS at</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2"><Link href={`/hosting/${r.id}`} className="font-medium hover:text-brand-700 hover:underline">{r.domain}</Link>{r.suspended && <span className="ml-1 text-[0.6875rem] text-rose-700">suspended</span>}</td>
                    <td className="px-2 py-2 text-ink-muted">{r.customerId ? <Link href={`/accounts/${r.customerId}`} className="hover:underline">{r.customer}</Link> : "—"}</td>
                    <td className={cn("px-2 py-2", r.web === "ours" ? "text-emerald-700" : "font-semibold text-rose-700")} title={r.webTo}>{r.web === "ours" ? "With us" : r.web === "elsewhere" ? `Elsewhere (${r.webTo})` : r.error ?? "No address"}</td>
                    <td className={cn("px-2 py-2", r.emailLevel === "bad" ? "font-semibold text-rose-700" : r.emailLevel === "ok" ? "text-emerald-700" : "text-ink")}>{r.email}</td>
                    <td className="px-5 py-2 text-ink-muted">{r.dns ?? "—"}</td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={5} className="px-5 py-6 text-center text-ink-muted">No problems found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
