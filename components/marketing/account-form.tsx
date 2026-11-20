"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { googleOptions, saveAccount, type AccountInput, type GoogleOptions } from "@/app/(app)/marketing/actions";

const MODES: { v: AccountInput["mode"]; label: string; text: string }[] = [
  { v: "auto", label: "Automatic", text: "The AI makes changes itself, within the limits below. Needs a monthly cap." },
  { v: "suggest", label: "Suggest only", text: "The AI lists changes; someone here approves each one." },
  { v: "off", label: "Off", text: "Figures and reports only — no AI changes." },
];

export function AccountForm({ id, initial, clients, currency }: { id: string | null; initial: AccountInput; clients: { id: string; name: string }[]; currency: string }) {
  const router = useRouter();
  const [f, setF] = useState<AccountInput>(initial);
  const [opts, setOpts] = useState<GoogleOptions | null>(null);
  const [optErr, setOptErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => { googleOptions().then((r) => (r.ok ? setOpts(r.data) : setOptErr(r.error))); }, []);
  const set = <K extends keyof AccountInput>(k: K, v: AccountInput[K]) => { setF((x) => ({ ...x, [k]: v })); setSaved(false); };
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const fmtAds = (x: string) => x.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");

  return (
    <form className="grid gap-4 px-5 pb-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); start(async () => {
      setErr(null);
      const r = await saveAccount(id, f);
      if (!r.ok) return setErr(r.error);
      setSaved(true);
      if (!id) router.push(`/marketing/${r.data}`); else router.refresh();
    }); }}>
      <div><Label htmlFor="mk-name">Name</Label><Input id="mk-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Bean Culture" required /></div>
      <div><Label htmlFor="mk-client" hint="for their client record and portal">Client</Label>
        <Select id="mk-client" value={f.customer_id ?? ""} onChange={(e) => { const c = clients.find((x) => x.id === e.target.value); set("customer_id", e.target.value || null); if (c && !f.name.trim()) set("name", c.name); }}>
          <option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select></div>

      <div className="sm:col-span-2">
        {optErr && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[0.7812rem] text-amber-900 ring-1 ring-inset ring-amber-100">{optErr}</p>}
        {opts?.problems.map((p) => <p key={p} className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[0.7812rem] text-amber-900 ring-1 ring-inset ring-amber-100">{p}</p>)}
        {!opts && !optErr && <p className="text-[0.75rem] text-ink-faint">Finding the Google accounts you can reach…</p>}
      </div>
      <div><Label htmlFor="mk-ads">Google Ads account</Label>
        {opts?.ads.length ? (
          <Select id="mk-ads" value={f.ads_customer_id ?? ""} onChange={(e) => set("ads_customer_id", e.target.value || null)}>
            <option value="">— none —</option>
            {f.ads_customer_id && !opts.ads.some((a) => a.id === f.ads_customer_id) && <option value={f.ads_customer_id}>{fmtAds(f.ads_customer_id)}</option>}
            {opts.ads.map((a) => <option key={a.id} value={a.id}>{a.name} ({fmtAds(a.id)}){a.testAccount ? " — test" : ""}</option>)}
          </Select>
        ) : <Input id="mk-ads" inputMode="numeric" value={f.ads_customer_id ?? ""} onChange={(e) => set("ads_customer_id", e.target.value || null)} placeholder="123-456-7890" />}
      </div>
      <div><Label htmlFor="mk-ga4">GA4 property</Label>
        <Select id="mk-ga4" value={f.ga4_property ?? ""} onChange={(e) => set("ga4_property", e.target.value || null)}>
          <option value="">— none —</option>
          {f.ga4_property && !opts?.ga4.some((g) => g.property === f.ga4_property) && <option value={f.ga4_property}>{f.ga4_property}</option>}
          {opts?.ga4.map((g) => <option key={g.property} value={g.property}>{g.name}{g.account ? ` — ${g.account}` : ""}</option>)}
        </Select></div>
      <div className="sm:col-span-2"><Label htmlFor="mk-gsc">Search Console site</Label>
        <Select id="mk-gsc" value={f.gsc_site ?? ""} onChange={(e) => set("gsc_site", e.target.value || null)}>
          <option value="">— none —</option>
          {f.gsc_site && !opts?.gsc.some((g) => g.site === f.gsc_site) && <option value={f.gsc_site}>{f.gsc_site}</option>}
          {opts?.gsc.map((g) => <option key={g.site} value={g.site}>{g.site.replace(/^sc-domain:/, "")}{g.site.startsWith("sc-domain:") ? " (whole domain)" : ""}</option>)}
        </Select></div>

      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-[0.8125rem] font-medium text-ink">AI changes in Google Ads</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <label key={m.v} className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 ${f.mode === m.v ? "border-brand-500 bg-brand-50" : "border-line"}`}>
              <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink"><input type="radio" name="mk-mode" checked={f.mode === m.v} onChange={() => set("mode", m.v)} />{m.label}</span>
              <span className="text-[0.75rem] text-ink-muted">{m.text}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div><Label htmlFor="mk-cap" hint={`${currency}, all campaigns`}>Monthly spend cap</Label><Input id="mk-cap" inputMode="decimal" value={f.monthly_cap ?? ""} onChange={(e) => set("monthly_cap", num(e.target.value))} placeholder="e.g. 1500" /></div>
      <div><Label htmlFor="mk-cpa" hint="optional">Target cost per conversion</Label><Input id="mk-cpa" inputMode="decimal" value={f.target_cpa ?? ""} onChange={(e) => set("target_cpa", num(e.target.value))} placeholder="e.g. 40" /></div>
      <div><Label htmlFor="mk-max">Most changes per day</Label><Input id="mk-max" inputMode="numeric" value={f.max_changes} onChange={(e) => set("max_changes", Number(e.target.value) || 1)} /></div>
      <div><Label htmlFor="mk-to" hint="comma between them">Send reports to</Label><Input id="mk-to" value={f.report_to} onChange={(e) => set("report_to", e.target.value)} placeholder="owner@client.com.au" /></div>
      <div className="sm:col-span-2"><Label htmlFor="mk-goals" hint="the AI reads this every day">What the client wants from Ads</Label>
        <Textarea id="mk-goals" rows={3} value={f.goals ?? ""} onChange={(e) => set("goals", e.target.value)} placeholder="e.g. Coffee cart bookings for weddings and corporate events in Canberra and the region. Not interested in coffee bean sales or barista jobs." /></div>
      <label className="flex items-center gap-2 text-[0.8125rem] text-ink sm:col-span-2"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} />Active (synced and reviewed daily)</label>
      <div className="sm:col-span-2"><FormError message={err} /></div>
      <div className="flex items-center justify-end gap-3 sm:col-span-2">
        {saved && <span className="text-[0.7812rem] text-emerald-700">Saved</span>}
        <Button variant="primary" className="h-10 w-full sm:h-9 sm:w-auto" disabled={pending}>{pending ? "Saving…" : id ? "Save changes" : "Add client"}</Button>
      </div>
    </form>
  );
}
