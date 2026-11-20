"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { createCampaignAction, keywordIdeasAction } from "@/app/(app)/marketing/actions";
import type { Idea } from "@/lib/marketing/campaign";

type Match = "EXACT" | "PHRASE" | "BROAD";
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Build a search campaign: Keyword Planner ideas → pick keywords → write the ad → create PAUSED. */
export function CampaignForm({ id, defaults, capNote }: { id: string; defaults: { name: string; url: string; daily: number; centre: { lat: number; lng: number; label: string } }; capNote: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaults.name);
  const [url, setUrl] = useState(defaults.url);
  const [daily, setDaily] = useState(String(defaults.daily));
  const [cpc, setCpc] = useState("");
  const [radius, setRadius] = useState("60");
  const [seeds, setSeeds] = useState("");
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [picked, setPicked] = useState<Record<string, Match>>({});
  const [extra, setExtra] = useState("");
  const [negatives, setNegatives] = useState("jobs\njob\ncareers\nsalary\nhiring\nbarista course\nbarista training\nfree\ndiy\nhow to\nrecipe\nmachine for sale\nbuy coffee machine\nnear me open now\nstarbucks\nmcdonalds");
  const [headlines, setHeadlines] = useState("");
  const [descs, setDescs] = useState("");
  const [path1, setPath1] = useState("");
  const [path2, setPath2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, startIdeas] = useTransition();
  const [creating, startCreate] = useTransition();

  const keywords = [...Object.entries(picked).map(([text, match]) => ({ text, match })), ...lines(extra).map((l) => {
    const m = l.match(/^\[(.+)\]$/) ? "EXACT" : l.match(/^"(.+)"$/) ? "PHRASE" : "BROAD";
    return { text: l.replace(/^[\["]|[\]"]$/g, ""), match: m as Match };
  })];
  const hl = lines(headlines), ds = lines(descs);

  return (
    <div className="space-y-5 px-5 pb-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="c-name">Campaign name</Label><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="c-url">Landing page</Label><Input id="c-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></div>
        <div><Label htmlFor="c-daily" hint={capNote}>Daily budget</Label><Input id="c-daily" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} /></div>
        <div><Label htmlFor="c-cpc" hint="max per click, per keyword to start">Starting bid</Label><Input id="c-cpc" inputMode="decimal" value={cpc} onChange={(e) => setCpc(e.target.value)} placeholder="from the planner below" /></div>
        <div><Label htmlFor="c-rad" hint={`around ${defaults.centre.label}`}>Radius (km)</Label><Input id="c-rad" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} /></div>
      </div>

      <section className="rounded-xl border border-line p-4">
        <h3 className="text-[0.875rem] font-semibold text-ink">Keywords from Google&apos;s Keyword Planner</h3>
        <p className="mt-0.5 text-[0.75rem] text-ink-muted">Searches a month and top-of-page bids are Google&apos;s figures for the ACT.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Seed words" value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder="coffee cart hire, event coffee, mobile barista" />
          <Button type="button" className="h-10 shrink-0 sm:h-9" disabled={loading} onClick={() => startIdeas(async () => {
            setErr(null);
            const r = await keywordIdeasAction(id, seeds.split(","), url);
            if (!r.ok) setErr(r.error); else setIdeas(r.data);
          })}>{loading ? "Asking Google…" : "Get ideas"}</Button>
        </div>
        {ideas && (
          <div className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[560px] text-left text-[0.8125rem]">
              <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-[0.75rem] text-ink-muted"><th className="px-3 py-2 font-medium">Use</th><th className="px-3 py-2 font-medium">Keyword</th><th className="px-3 py-2 text-right font-medium">Searches/mo</th><th className="px-3 py-2 text-right font-medium">Top-of-page bid</th><th className="px-3 py-2 font-medium">Competition</th></tr></thead>
              <tbody className="divide-y divide-line">
                {ideas.map((i) => (
                  <tr key={i.text}>
                    <td className="px-3 py-1.5">
                      <Select aria-label={`Use ${i.text}`} value={picked[i.text] ?? ""} onChange={(e) => setPicked((p) => { const n = { ...p }; if (e.target.value) n[i.text] = e.target.value as Match; else delete n[i.text]; return n; })} className="h-8 w-28">
                        <option value="">—</option><option value="PHRASE">Phrase</option><option value="EXACT">Exact</option><option value="BROAD">Broad</option>
                      </Select>
                    </td>
                    <td className="px-3 py-1.5 text-ink">{i.text}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{i.monthly ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{i.low != null ? `$${i.low.toFixed(2)}–$${(i.high ?? i.low).toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-1.5 text-ink-muted">{i.competition?.toLowerCase() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3"><Label htmlFor="c-extra" hint='one per line: "phrase", [exact] or plain for broad'>More keywords</Label><Textarea id="c-extra" rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} /></div>
        <p className="mt-2 text-[0.75rem] text-ink-muted">{keywords.length} keyword{keywords.length === 1 ? "" : "s"} chosen</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="c-h" hint={`3–15, one per line, 30 characters max (${hl.length})`}>Headlines</Label><Textarea id="c-h" rows={12} value={headlines} onChange={(e) => setHeadlines(e.target.value)} />
          {hl.filter((h) => h.length > 30).map((h) => <p key={h} className="text-[0.7188rem] text-rose-700">Too long ({h.length}): {h}</p>)}</div>
        <div><Label htmlFor="c-d" hint={`2–4, one per line, 90 characters max (${ds.length})`}>Descriptions</Label><Textarea id="c-d" rows={6} value={descs} onChange={(e) => setDescs(e.target.value)} />
          {ds.filter((d) => d.length > 90).map((d) => <p key={d} className="text-[0.7188rem] text-rose-700">Too long ({d.length}): {d}</p>)}
          <div className="mt-3 grid grid-cols-2 gap-2"><div><Label htmlFor="c-p1">Path 1</Label><Input id="c-p1" value={path1} maxLength={15} onChange={(e) => setPath1(e.target.value)} /></div><div><Label htmlFor="c-p2">Path 2</Label><Input id="c-p2" value={path2} maxLength={15} onChange={(e) => setPath2(e.target.value)} /></div></div>
        </div>
        <div className="sm:col-span-2"><Label htmlFor="c-neg" hint="one per line — searches containing these never show the ad">Negative keywords</Label><Textarea id="c-neg" rows={5} value={negatives} onChange={(e) => setNegatives(e.target.value)} /></div>
      </div>

      <FormError message={err} />
      {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[0.8125rem] text-emerald-800 ring-1 ring-inset ring-emerald-100">{done}</p>}
      <div className="flex justify-end">
        <Button variant="primary" className="h-10 w-full sm:h-9 sm:w-auto" disabled={creating || !!done} onClick={() => startCreate(async () => {
          setErr(null);
          const r = await createCampaignAction(id, {
            name, finalUrl: url.trim(), dailyBudget: Number(daily), defaultCpc: Number(cpc), radiusKm: Number(radius), centre: defaults.centre,
            keywords, negatives: lines(negatives), headlines: hl, descriptions: ds, path1: path1.trim() || undefined, path2: path2.trim() || undefined,
          });
          if (!r.ok) setErr(r.error); else { setDone(r.data); router.refresh(); }
        })}>{creating ? "Creating in Google Ads…" : "Create campaign (paused)"}</Button>
      </div>
    </div>
  );
}
