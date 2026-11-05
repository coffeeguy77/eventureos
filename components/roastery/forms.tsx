"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { addWeighedBatches, deleteRoast, importRecorder, logRoast, moveStock, saveCoffee, updateRoast, type CoffeeInput } from "@/app/(app)/roastery/actions";

export interface CoffeeOpt { id: string; name: string; batch_kg: number; lossPct: number | null; lossOwn: boolean }
type Res = { ok: true } | { ok: false; error: string };
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const kg2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<Res & { data?: unknown }>, okText: string | ((d: unknown) => string), after?: () => void) => start(async () => {
    const r = await fn();
    if (r.ok) { setMsg({ ok: true, text: typeof okText === "function" ? okText(r.data) : okText }); after?.(); router.refresh(); }
    else setMsg({ ok: false, text: r.error });
  });
  return { pending, msg, run, setMsg };
}
function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return msg.ok ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[0.7812rem] text-emerald-800 ring-1 ring-inset ring-emerald-100">{msg.text}</p> : <FormError message={msg.text} />;
}
const Spin = ({ on }: { on: boolean }) => (on ? <Loader2 className="h-4 w-4 animate-spin" /> : null);

/* ---------------------------------------------------------------- coffee */
export function CoffeeForm({ initial, onDone }: { initial?: CoffeeInput & { id?: string }; onDone?: () => void }) {
  const [c, setC] = useState<CoffeeInput>(initial ?? { name: "", batch_kg: 30 });
  const { pending, msg, run } = useRun();
  const set = (p: Partial<CoffeeInput>) => setC((o) => ({ ...o, ...p }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveCoffee(c), initial?.id ? "Saved." : `${c.name} added.`, () => { if (!initial?.id) setC({ name: "", batch_kg: 30 }); onDone?.(); }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="cf-name">Coffee</Label><Input id="cf-name" required value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Brazil" /></div>
        <div><Label htmlFor="cf-origin" hint="Farm, region, lot">Origin</Label><Input id="cf-origin" value={c.origin ?? ""} onChange={(e) => set({ origin: e.target.value })} /></div>
        <div><Label htmlFor="cf-sup">Supplier</Label><Input id="cf-sup" value={c.supplier ?? ""} onChange={(e) => set({ supplier: e.target.value })} /></div>
        <div><Label htmlFor="cf-proc">Process</Label><Input id="cf-proc" value={c.process ?? ""} onChange={(e) => set({ process: e.target.value })} placeholder="Washed, natural…" /></div>
        <div><Label htmlFor="cf-batch" hint="Green kg you usually load">Batch size (kg)</Label><Input id="cf-batch" type="number" inputMode="decimal" min={0.1} step="0.5" required value={c.batch_kg} onChange={(e) => set({ batch_kg: e.target.value })} /></div>
        <div><Label htmlFor="cf-re" hint="Flag when stock falls to this">Reorder at (kg)</Label><Input id="cf-re" type="number" inputMode="decimal" min={0} step="1" value={c.reorder_kg ?? ""} onChange={(e) => set({ reorder_kg: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label htmlFor="cf-notes">Notes</Label><Textarea id="cf-notes" rows={2} value={c.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></div>
        {initial?.id && <label className="flex items-center gap-2 text-[0.8125rem] text-ink sm:col-span-2"><input type="checkbox" className="h-4 w-4" checked={!!c.archived} onChange={(e) => set({ archived: e.target.checked })} />No longer stocked (hide from lists)</label>}
      </div>
      <Msg msg={msg} />
      <Button type="submit" variant="primary" disabled={pending}><Spin on={pending} />{initial?.id ? "Save coffee" : "Add coffee"}</Button>
    </form>
  );
}

/* ---------------------------------------------------------------- stock in / count / adjust */
export function StockForm({ coffees, coffeeId }: { coffees: CoffeeOpt[]; coffeeId?: string }) {
  const [mode, setMode] = useState<"received" | "count" | "adjust">("received");
  const [cid, setCid] = useState(coffeeId ?? coffees[0]?.id ?? "");
  const [kg, setKg] = useState(""); const [cost, setCost] = useState(""); const [note, setNote] = useState(""); const [at, setAt] = useState(nowLocal());
  const { pending, msg, run } = useRun();
  if (!coffees.length) return <p className="text-[0.8125rem] text-ink-muted">Add a green coffee first.</p>;
  const tabs = [{ k: "received", l: "Green received" }, { k: "count", l: "Stock-take" }, { k: "adjust", l: "Correction ±" }] as const;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => moveStock({ coffee_id: cid, mode, kg, cost_per_kg: cost, note, happened_at: new Date(at).toISOString() }), mode === "received" ? "Added to stock." : mode === "count" ? "Stock set to your count." : "Stock corrected.", () => { setKg(""); setNote(""); }); }}>
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((x) => <button type="button" key={x.k} onClick={() => setMode(x.k)} className={cn("rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", mode === x.k ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{x.l}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {!coffeeId && <div className="sm:col-span-2"><Label htmlFor="sf-c">Coffee</Label><Select id="sf-c" value={cid} onChange={(e) => setCid(e.target.value)}>{coffees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>}
        <div><Label htmlFor="sf-kg" hint={mode === "count" ? "What's on the floor now" : mode === "adjust" ? "e.g. -2.5 for spillage" : undefined}>{mode === "received" ? "Green kg received" : mode === "count" ? "Counted green kg" : "Correction (kg)"}</Label>
          <Input id="sf-kg" type="number" inputMode="decimal" step="0.001" required value={kg} onChange={(e) => setKg(e.target.value)} /></div>
        {mode === "received" ? <div><Label htmlFor="sf-cost" hint="ex GST, landed">Cost per kg ($)</Label><Input id="sf-cost" type="number" inputMode="decimal" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
          : <div><Label htmlFor="sf-note">Note</Label><Input id="sf-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "count" ? "Stock-take" : "Why"} /></div>}
        <div><Label htmlFor="sf-at">When</Label><Input id="sf-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></div>
        {mode === "received" && <div><Label htmlFor="sf-note2" hint="Invoice, lot, bags">Note</Label><Input id="sf-note2" value={note} onChange={(e) => setNote(e.target.value)} /></div>}
      </div>
      <Msg msg={msg} />
      <Button type="submit" variant="primary" disabled={pending}><Spin on={pending} />{mode === "received" ? "Add to stock" : mode === "count" ? "Set stock to count" : "Save correction"}</Button>
    </form>
  );
}

/* ---------------------------------------------------------------- log a roast / weighed batches */
export function RoastForm({ coffees, coffeeId }: { coffees: CoffeeOpt[]; coffeeId?: string }) {
  const [many, setMany] = useState(false);
  const [cid, setCid] = useState(coffeeId ?? coffees[0]?.id ?? "");
  const c = coffees.find((x) => x.id === cid);
  const [green, setGreen] = useState(c ? String(c.batch_kg) : "30");
  const [r, setR] = useState<Record<string, string>>({});
  const [list, setList] = useState("");
  const [deduct, setDeduct] = useState(true);
  const [at, setAt] = useState(nowLocal());
  const { pending, msg, run } = useRun();
  if (!coffees.length) return <p className="text-[0.8125rem] text-ink-muted">Add a green coffee first.</p>;
  const g = Number(green) || 0, est = c?.lossPct != null && g ? g * (1 - c.lossPct / 100) : null;
  const rk = Number(r.roasted_kg) || 0;
  const f = (k: string, label: string, hint?: string, type = "number", step = "0.1") => <div><Label htmlFor={`rf-${k}`} hint={hint}>{label}</Label><Input id={`rf-${k}`} type={type} inputMode={type === "number" ? "decimal" : undefined} step={step} value={r[k] ?? ""} onChange={(e) => setR((o) => ({ ...o, [k]: e.target.value }))} /></div>;
  const mmssToS = (v?: string) => { if (!v) return null; const m = /^(\d+):(\d{1,2})$/.exec(v.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : Number(v) || null; };
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (many) run(() => addWeighedBatches({ coffee_id: cid, green_kg: green, roasted: list, roasted_at: new Date(at).toISOString(), deduct }), (d) => `${(d as { n: number }).n} batches added.`, () => setList(""));
      else run(() => logRoast({ coffee_id: cid, green_kg: green, roasted_kg: r.roasted_kg, roasted_at: new Date(at).toISOString(), profile: r.profile, first_crack_s: mmssToS(r.fc), end_s: mmssToS(r.end), drop_c: r.drop_c, dtr_pct: r.dtr_pct, score: r.score, notes: r.notes, deduct }), "Roast logged.", () => setR({}));
    }}>
      <div className="flex flex-wrap gap-1.5">
        {[{ k: false, l: "One roast" }, { k: true, l: "Several weighed batches" }].map((x) => <button type="button" key={x.l} onClick={() => setMany(x.k)} className={cn("rounded-full px-3 py-1.5 text-[0.7812rem] font-medium", many === x.k ? "bg-ink text-surface" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink")}>{x.l}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {!coffeeId && <div><Label htmlFor="rf-c">Coffee</Label><Select id="rf-c" value={cid} onChange={(e) => { setCid(e.target.value); const n = coffees.find((x) => x.id === e.target.value); if (n) setGreen(String(n.batch_kg)); }}>{coffees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></div>}
        <div><Label htmlFor="rf-g" hint={many ? "per batch" : undefined}>Green kg in</Label><Input id="rf-g" type="number" inputMode="decimal" min={0.01} step="0.05" required value={green} onChange={(e) => setGreen(e.target.value)} /></div>
        {many ? (
          <div className="sm:col-span-2"><Label htmlFor="rf-list" hint="Comma or space between batches">Roasted kg out, each batch</Label><Input id="rf-list" required value={list} onChange={(e) => setList(e.target.value)} placeholder="25.8, 25.95, 25.95, 25.95" /></div>
        ) : (<>
          <div><Label htmlFor="rf-r" hint={est ? `expected ≈ ${kg2(est)}` : "weigh after cooling"}>Roasted kg out</Label><Input id="rf-r" type="number" inputMode="decimal" step="0.01" value={r.roasted_kg ?? ""} onChange={(e) => setR((o) => ({ ...o, roasted_kg: e.target.value }))} />
            {rk > 0 && g > 0 && <p className="mt-1 text-[0.75rem] text-ink-muted">Loss {((g - rk) / g * 100).toFixed(1)} %{c?.lossPct != null ? ` · ${c.lossOwn ? "this coffee" : "all coffees"} average ${c.lossPct.toFixed(1)} %` : ""}</p>}</div>
          {f("profile", "Profile", "optional", "text")}
          {f("fc", "First crack", "m:ss", "text")}
          {f("end", "Roast time", "m:ss", "text")}
          {f("drop_c", "Drop °C")}
          {f("dtr_pct", "DTR %")}
          {f("score", "Cup score", "add later if you like", "number", "0.25")}
          <div className="sm:col-span-2"><Label htmlFor="rf-notes">Notes</Label><Textarea id="rf-notes" rows={2} value={r.notes ?? ""} onChange={(e) => setR((o) => ({ ...o, notes: e.target.value }))} /></div>
        </>)}
        <div><Label htmlFor="rf-at">When</Label><Input id="rf-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></div>
        <label className="flex items-center gap-2 self-end pb-2 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} />Take the green off stock</label>
      </div>
      <Msg msg={msg} />
      <Button type="submit" variant="primary" disabled={pending}><Spin on={pending} />{many ? "Add batches" : "Log roast"}</Button>
    </form>
  );
}

/* ---------------------------------------------------------------- weigh / score a roast later */
export function RoastEdit({ id, green, roasted, score, notes, lossPct }: { id: string; green: number; roasted: number | null; score: number | null; notes: string | null; lossPct: number | null }) {
  const [open, setOpen] = useState(false);
  const [rk, setRk] = useState(roasted != null ? String(roasted) : ""); const [sc, setSc] = useState(score != null ? String(score) : ""); const [nt, setNt] = useState(notes ?? "");
  const { pending, msg, run } = useRun();
  const v = Number(rk);
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>{roasted == null ? "Weigh" : "Edit"}</Button>;
  return (
    <form className="mt-2 grid gap-2 rounded-lg bg-canvas p-3 ring-1 ring-line sm:grid-cols-[1fr_1fr_2fr_auto]" onSubmit={(e) => { e.preventDefault(); run(() => updateRoast({ id, roasted_kg: rk, score: sc, notes: nt }), "Saved.", () => setOpen(false)); }}>
      <div><Label htmlFor={`we-${id}`} hint={lossPct != null ? `≈ ${kg2(green * (1 - lossPct / 100))}` : undefined}>Roasted kg</Label><Input id={`we-${id}`} type="number" inputMode="decimal" step="0.01" value={rk} onChange={(e) => setRk(e.target.value)} />
        {v > 0 && <p className="mt-1 text-[0.75rem] text-ink-muted">Loss {((green - v) / green * 100).toFixed(1)} %</p>}</div>
      <div><Label htmlFor={`ws-${id}`}>Cup score</Label><Input id={`ws-${id}`} type="number" inputMode="decimal" step="0.25" value={sc} onChange={(e) => setSc(e.target.value)} /></div>
      <div><Label htmlFor={`wn-${id}`}>Tasting notes</Label><Input id={`wn-${id}`} value={nt} onChange={(e) => setNt(e.target.value)} /></div>
      <div className="flex items-end gap-2"><Button type="submit" variant="primary" size="sm" disabled={pending}><Spin on={pending} />Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
      <div className="sm:col-span-4"><Msg msg={msg} /></div>
      <div className="sm:col-span-4"><button type="button" className="text-[0.75rem] text-rose-700 underline" onClick={() => { if (confirm("Delete this roast? If it was taken off green stock, that stock goes back.")) run(() => deleteRoast(id), "Deleted."); }}>Delete roast</button></div>
    </form>
  );
}

/* ---------------------------------------------------------------- roast recorder import */
export function RecorderImport() {
  const [deduct, setDeduct] = useState(true);
  const { pending, msg, run } = useRun();
  return (
    <Card>
      <CardHeader title="Import from the roast recorder" subtitle="Choose roasts\index.csv from Documents\RoastRecorder on the roaster PC. Each roast is added once, so import as often as you like." />
      <div className="space-y-3 border-t border-line px-5 py-4">
        <label className="flex items-center gap-2 text-[0.8125rem] text-ink"><input type="checkbox" className="h-4 w-4" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} />Take each new roast&apos;s green weight off stock</label>
        <label className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-surface px-3.5 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50", pending && "opacity-60")}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Choose index.csv
          <input type="file" accept=".csv,text/csv" className="sr-only" disabled={pending} onChange={async (e) => {
            const file = e.target.files?.[0]; e.target.value = "";
            if (!file) return;
            const text = await file.text();
            run(() => importRecorder(text, deduct), (d) => {
              const x = d as { added: number; skipped: number; already: number; newCoffees: string[] };
              return `${x.added} roast${x.added === 1 ? "" : "s"} added` + (x.already ? `, ${x.already} already here` : "") + (x.skipped ? `, ${x.skipped} skipped (no coffee or batch weight set)` : "") + (x.newCoffees.length ? `. New coffees: ${x.newCoffees.join(", ")}.` : ".");
            });
          }} />
        </label>
        <Msg msg={msg} />
      </div>
    </Card>
  );
}
