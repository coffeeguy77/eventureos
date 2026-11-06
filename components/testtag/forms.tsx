"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Search, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { CLASSES, INTERVALS, IMPORT_FIELDS, guessColumns, readDate, readResult, type ImportKey, type PrinterProfile } from "@/lib/testtag/core";
import { PrintLabel, PrinterBar } from "./printer";
import {
  deleteTest, findAsset, importTests, saveAsset, saveTagSettings, saveTest, searchTagCustomers, setAssetRetired, suggestCode, testLabel,
  type AssetInput, type ImportRow,
} from "@/app/(app)/test-tag/actions";
import type { TagAsset } from "@/lib/testtag/server";

/* ------------------------------------------------------------------ owner picker */

export function OwnerPicker({ value, name, onChange, ownName }: { value: string | null; name: string | null; onChange: (id: string | null, name: string | null) => void; ownName: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-zinc-50 px-3 py-2 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line dark:bg-white/5">{value ? name : `${ownName} (our own)`}</span>
        {value && <Button size="sm" variant="ghost" onClick={() => onChange(null, null)}>Make it ours</Button>}
      </div>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <Input value={q} onChange={(e) => { setQ(e.target.value); const v = e.target.value; start(async () => { const r = await searchTagCustomers(v); if (r.ok) setHits(r.data); }); }} placeholder="A customer's equipment? Search…" className="pl-9" />
        {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-faint" />}
      </div>
      {hits.length > 0 && q.length > 1 && (
        <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
          {hits.map((h) => <li key={h.id}><button type="button" onClick={() => { onChange(h.id, h.name); setQ(""); setHits([]); }} className="w-full px-3 py-2 text-left text-[0.8125rem] text-ink hover:bg-zinc-50 dark:hover:bg-white/5">{h.name}</button></li>)}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ asset fields */

const blankAsset = (interval: number): AssetInput => ({ code: "", name: "", customer_id: null, category: "", make: "", model: "", serial: "", location: "", class: "I", interval_months: interval, notes: "" });

function AssetFields({ v, set, ownName, ownerName, setOwnerName, showCode = true }: { v: AssetInput; set: (v: AssetInput) => void; ownName: string; ownerName: string | null; setOwnerName: (n: string | null) => void; showCode?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {showCode && <div><Label>Tag code</Label><Input value={v.code} onChange={(e) => set({ ...v, code: e.target.value.toUpperCase() })} /></div>}
      <div className={showCode ? "" : "sm:col-span-2"}><Label>What is it?</Label><Input value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} placeholder="e.g. Coffee grinder, 10 m extension lead" /></div>
      <div className="sm:col-span-2"><Label>Whose is it?</Label><OwnerPicker value={v.customer_id} name={ownerName} ownName={ownName} onChange={(id, n) => { set({ ...v, customer_id: id }); setOwnerName(n); }} /></div>
      <div><Label hint="optional">Location</Label><Input value={v.location} onChange={(e) => set({ ...v, location: e.target.value })} placeholder="e.g. Kitchen, Cart 2" /></div>
      <div><Label>Type</Label><Select value={v.class} onChange={(e) => set({ ...v, class: e.target.value })}>{CLASSES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select></div>
      <div className="sm:col-span-2"><Label>Retest every</Label><Select value={String(v.interval_months)} onChange={(e) => set({ ...v, interval_months: Number(e.target.value) })}>{INTERVALS.map((i) => <option key={i.months} value={i.months}>{i.label}</option>)}{!INTERVALS.some((i) => i.months === v.interval_months) && <option value={v.interval_months}>{v.interval_months} months</option>}</Select></div>
      <div><Label hint="optional">Make</Label><Input value={v.make} onChange={(e) => set({ ...v, make: e.target.value })} /></div>
      <div><Label hint="optional">Model</Label><Input value={v.model} onChange={(e) => set({ ...v, model: e.target.value })} /></div>
      <div><Label hint="optional">Serial</Label><Input value={v.serial} onChange={(e) => set({ ...v, serial: e.target.value })} /></div>
      <div><Label hint="optional">Category</Label><Input value={v.category} onChange={(e) => set({ ...v, category: e.target.value })} placeholder="e.g. Kitchen appliance" /></div>
    </div>
  );
}

export function AssetEdit({ asset, ownName }: { asset: TagAsset; ownName: string }) {
  const router = useRouter();
  const [v, setV] = useState<AssetInput>({ code: asset.code, name: asset.name, customer_id: asset.customer_id, category: asset.category ?? "", make: asset.make ?? "", model: asset.model ?? "", serial: asset.serial ?? "", location: asset.location ?? "", class: asset.class ?? "I", interval_months: asset.interval_months, notes: asset.notes ?? "" });
  const [ownerName, setOwnerName] = useState(asset.customer?.name ?? null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-3 p-4 sm:p-5">
      <AssetFields v={v} set={setV} ownName={ownName} ownerName={ownerName} setOwnerName={setOwnerName} />
      <div><Label hint="optional">Notes</Label><Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={busy} onClick={() => start(async () => { const r = await saveAsset(asset.id, v); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); if (r.ok) router.refresh(); })}>Save</Button>
        <Button variant="ghost" disabled={busy} onClick={() => start(async () => { const r = await setAssetRetired(asset.id, asset.status !== "retired"); if (r.ok) router.refresh(); else setMsg({ ok: false, text: r.error }); })}>{asset.status === "retired" ? "Bring back into service" : "Retire (no more retests)"}</Button>
        {msg && <span className={msg.ok ? "text-[0.8125rem] text-emerald-700" : "text-[0.8125rem] text-rose-600"}>{msg.text}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the test */

const blankTest = { result: "", visual: "pass", earth_ohms: "", insulation_mohms: "", leakage_ma: "", polarity: "", rcd_ms: "", notes: "" };

export function TestForm({ asset: fixed, today, defaultInterval, ownName, me, initialCode }: { asset: TagAsset | null; today: string; defaultInterval: number; ownName: string; me: string; initialCode?: string }) {
  const router = useRouter();
  const [asset, setAsset] = useState<TagAsset | null>(fixed);
  const [code, setCode] = useState(initialCode ?? "");
  const [isNew, setIsNew] = useState(false);
  const [na, setNa] = useState<AssetInput>(blankAsset(defaultInterval));
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [tv, setTv] = useState({ ...blankTest, tested_on: today, tester_name: me });
  const [done, setDone] = useState<{ testId: string; assetId: string; zpl: string; code: string; result: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const classOf = asset?.class ?? na.class;

  const lookup = (c: string) => start(async () => {
    setErr(null);
    const r = await findAsset(c);
    if (!r.ok) { setErr(r.error); return; }
    if (r.data) { setAsset(r.data); setIsNew(false); }
    else { setAsset(null); setIsNew(true); setNa({ ...blankAsset(defaultInterval), code: c.toUpperCase() }); }
  });
  useEffect(() => { if (initialCode && !fixed) lookup(initialCode); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const newTag = () => start(async () => { const r = await suggestCode(); setAsset(null); setIsNew(true); setNa({ ...blankAsset(defaultInterval), code: r.ok ? r.data : "" }); setCode(r.ok ? r.data : ""); });

  const save = () => start(async () => {
    setErr(null);
    const r = await saveTest({ assetId: asset?.id ?? null, asset: asset ? undefined : na, ...tv });
    if (!r.ok) { setErr(r.error); return; }
    setDone({ ...r.data, result: tv.result });
    router.refresh();
  });
  const again = () => { setDone(null); setTv({ ...blankTest, tested_on: today, tester_name: tv.tester_name }); if (!fixed) { setAsset(null); setIsNew(false); setCode(""); setNa(blankAsset(na.interval_months)); } };

  if (done) {
    return (
      <div className="space-y-4 p-4 sm:p-5">
        <div className={`rounded-xl p-4 text-center ring-1 ring-inset ${done.result === "pass" ? "bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30" : "bg-rose-50 text-rose-900 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30"}`}>
          <p className="text-[1.5rem] font-bold">{done.result === "pass" ? "PASS" : "FAIL — tag it out of service"}</p>
          <p className="text-[0.8125rem]">{done.code} saved</p>
        </div>
        <PrintLabel zpl={done.zpl} name={done.code} testId={done.testId} auto />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={again}>{fixed ? "Test it again" : "Next item"}</Button>
          {!fixed && <Link href={`/test-tag/assets/${done.assetId}`} className="inline-flex h-9 items-center rounded-lg px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50 dark:hover:bg-white/5">Open the asset</Link>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <PrinterBar />
      {!fixed && (
        <div className="space-y-2">
          <Label>Tag code</Label>
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) lookup(code); }} className="flex flex-wrap gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Scan or type the tag code" className="min-w-[180px] flex-1" autoCapitalize="characters" />
            <Button type="submit" disabled={busy || !code.trim()}>Find</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={newTag}>New tag</Button>
          </form>
        </div>
      )}
      {asset && (
        <div className="rounded-lg bg-zinc-50 p-3 text-[0.8125rem] ring-1 ring-inset ring-line dark:bg-white/5">
          <p className="font-semibold text-ink">{asset.code} · {asset.name}</p>
          <p className="text-ink-muted">{asset.customer?.name ?? `${ownName} (our own)`}{asset.location ? ` · ${asset.location}` : ""} · retest every {asset.interval_months} months{asset.last_tested ? ` · last tested ${asset.last_tested} (${asset.last_result})` : ""}</p>
          {!fixed && <button type="button" onClick={() => { setAsset(null); setIsNew(false); }} className="mt-1 text-[0.75rem] text-brand-700 underline">Different item</button>}
        </div>
      )}
      {!asset && isNew && (
        <div className="space-y-2 rounded-lg p-3 ring-1 ring-inset ring-line">
          <p className="text-[0.8125rem] font-medium text-ink">New item</p>
          <AssetFields v={na} set={setNa} ownName={ownName} ownerName={ownerName} setOwnerName={setOwnerName} />
        </div>
      )}

      {(asset || isNew) && (
        <>
          <div>
            <Label>Result</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["pass", "fail"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setTv({ ...tv, result: r })} className={`h-14 rounded-xl text-[1.125rem] font-bold ring-2 ring-inset transition ${tv.result === r ? (r === "pass" ? "bg-emerald-600 text-white ring-emerald-600" : "bg-rose-600 text-white ring-rose-600") : "bg-surface text-ink ring-line-strong"}`}>{r === "pass" ? "PASS" : "FAIL"}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div><Label>Date</Label><Input type="date" value={tv.tested_on} onChange={(e) => setTv({ ...tv, tested_on: e.target.value })} /></div>
            <div><Label>Visual inspection</Label><Select value={tv.visual} onChange={(e) => setTv({ ...tv, visual: e.target.value })}><option value="pass">Pass</option><option value="fail">Fail</option><option value="">Not recorded</option></Select></div>
            {classOf === "I" || classOf === "cord" ? <div><Label hint="Ω">Earth continuity</Label><Input inputMode="decimal" value={tv.earth_ohms} onChange={(e) => setTv({ ...tv, earth_ohms: e.target.value })} placeholder="e.g. 0.08" /></div> : null}
            <div><Label hint="MΩ">Insulation</Label><Input inputMode="decimal" value={tv.insulation_mohms} onChange={(e) => setTv({ ...tv, insulation_mohms: e.target.value })} placeholder="e.g. >299" /></div>
            <div><Label hint="mA">Leakage</Label><Input inputMode="decimal" value={tv.leakage_ma} onChange={(e) => setTv({ ...tv, leakage_ma: e.target.value })} /></div>
            {classOf === "cord" && <div><Label>Polarity</Label><Select value={tv.polarity} onChange={(e) => setTv({ ...tv, polarity: e.target.value })}><option value="">—</option><option value="Correct">Correct</option><option value="Incorrect">Incorrect</option></Select></div>}
            {classOf === "rcd" && <div><Label hint="ms">RCD trip time</Label><Input inputMode="decimal" value={tv.rcd_ms} onChange={(e) => setTv({ ...tv, rcd_ms: e.target.value })} /></div>}
            <div><Label>Tested by</Label><Input value={tv.tester_name} onChange={(e) => setTv({ ...tv, tester_name: e.target.value })} /></div>
          </div>
          <div><Label hint="optional">Notes</Label><Textarea value={tv.notes} onChange={(e) => setTv({ ...tv, notes: e.target.value })} placeholder={tv.result === "fail" ? "Why it failed (e.g. damaged cord) — it's on the record" : ""} /></div>
          <FormError message={err} />
          <Button variant="primary" className="h-12 w-full text-[1rem]" disabled={busy || !tv.result} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save test{tv.result ? ` — ${tv.result.toUpperCase()}` : ""}</Button>
        </>
      )}
      {!asset && !isNew && err && <FormError message={err} />}
    </div>
  );
}

/* ------------------------------------------------------------------ a test's row actions */

export function TestActions({ testId, code, canDelete }: { testId: string; code: string; canDelete: boolean }) {
  const router = useRouter();
  const [zpl, setZpl] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [busy, start] = useTransition();
  if (zpl) return <PrintLabel zpl={zpl} name={code} testId={testId} compact />;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Button size="sm" disabled={busy} onClick={() => start(async () => { const r = await testLabel(testId); if (r.ok) setZpl(r.data.zpl); })}>Label</Button>
      {canDelete && (sure
        ? <><Button size="sm" variant="danger" disabled={busy} onClick={() => start(async () => { await deleteTest(testId); router.refresh(); })}>Delete test</Button><Button size="sm" variant="ghost" onClick={() => setSure(false)}>Keep</Button></>
        : <Button size="sm" variant="ghost" onClick={() => setSure(true)} aria-label="Delete test"><Trash2 className="h-3.5 w-3.5" /></Button>)}
    </span>
  );
}

/* ------------------------------------------------------------------ import from the tester */

export function ImportPanel({ ownName, defaultInterval, me }: { ownName: string; defaultInterval: number; me: string }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Partial<Record<ImportKey, string>>>({});
  const [owner, setOwner] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [opts, setOpts] = useState({ createMissing: true, interval: defaultInterval, device: "Metrel MI 3309 BT", tester: me });
  const [result, setResult] = useState<{ imported: number; added: number; duplicates: number; skipped: { row: number; why: string }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const onFile = async (f: File) => {
    setErr(null); setResult(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true, dense: true });
      // the sheet with the most rows
      const sheet = wb.SheetNames.map((n) => wb.Sheets[n]).sort((a, b) => (XLSX.utils.sheet_to_json(b).length - XLSX.utils.sheet_to_json(a).length))[0];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      if (!data.length) throw new Error("That file has no rows.");
      const h = Object.keys(data[0]);
      setRows(data); setHeaders(h); setMap(guessColumns(h));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const mapped: ImportRow[] = useMemo(() => rows.map((r) => Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, map[f.key] ? String(r[map[f.key]!] ?? "").trim() : ""]).filter(([, v]) => v))), [rows, map]);
  const ready = mapped.filter((r) => r.code && readDate(r.date) && readResult(r.result)).length;

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="rounded-lg bg-zinc-50 p-3 text-[0.8125rem] text-ink ring-1 ring-inset ring-line dark:bg-white/5">
        <p className="font-medium">From the Metrel</p>
        <p className="mt-0.5 text-[0.75rem] text-ink-muted">Download the tests to Metrel ES Manager on the PC (USB or Bluetooth), export them to Excel or CSV, then choose the file here. Any tester&apos;s CSV/Excel works — match the columns below. Tests already imported are skipped.</p>
      </div>
      <button type="button" onClick={() => file.current?.click()} className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong py-8 text-ink-muted hover:bg-zinc-50 dark:hover:bg-white/5">
        <Upload className="h-6 w-6" /><span className="text-[0.875rem] font-medium">{rows.length ? `${rows.length} rows loaded — choose another file` : "Choose the CSV or Excel file"}</span>
      </button>
      <input ref={file} type="file" accept=".csv,.xls,.xlsx,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />

      {headers.length > 0 && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <span className="w-40 shrink-0 text-[0.8125rem] text-ink">{f.label}{["code", "date", "result"].includes(f.key) && <span className="text-rose-600"> *</span>}</span>
                <Select value={map[f.key] ?? ""} onChange={(e) => setMap({ ...map, [f.key]: e.target.value || undefined })}><option value="">— not in the file —</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}</Select>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg ring-1 ring-line">
            <table className="min-w-full text-[0.75rem]">
              <thead className="bg-zinc-50 text-left text-ink-muted dark:bg-white/5"><tr><th className="px-2 py-1.5">Asset</th><th className="px-2 py-1.5">Date</th><th className="px-2 py-1.5">Result</th><th className="px-2 py-1.5">Description</th><th className="px-2 py-1.5">Earth</th><th className="px-2 py-1.5">Insulation</th></tr></thead>
              <tbody className="divide-y divide-line">{mapped.slice(0, 6).map((r, i) => (
                <tr key={i} className="text-ink"><td className="px-2 py-1">{r.code}</td><td className="px-2 py-1">{readDate(r.date) ?? <span className="text-rose-600">{r.date || "?"}</span>}</td><td className="px-2 py-1">{readResult(r.result) ?? <span className="text-rose-600">{r.result || "?"}</span>}</td><td className="px-2 py-1">{r.name}</td><td className="px-2 py-1">{r.earth}</td><td className="px-2 py-1">{r.insulation}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>New assets in this file belong to</Label><OwnerPicker value={owner.id} name={owner.name} ownName={ownName} onChange={(id, name) => setOwner({ id, name })} /></div>
            <div><Label>Retest new assets every</Label><Select value={String(opts.interval)} onChange={(e) => setOpts({ ...opts, interval: Number(e.target.value) })}>{INTERVALS.map((i) => <option key={i.months} value={i.months}>{i.label}</option>)}</Select></div>
            <div><Label>Tester</Label><Input value={opts.device} onChange={(e) => setOpts({ ...opts, device: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-[0.8125rem] text-ink sm:col-span-2"><input type="checkbox" checked={opts.createMissing} onChange={(e) => setOpts({ ...opts, createMissing: e.target.checked })} />Add assets that aren&apos;t in EventureOS yet</label>
          </div>
          <Button variant="primary" disabled={busy || !ready} onClick={() => start(async () => { const r = await importTests(mapped, { customerId: owner.id, ...opts }); if (r.ok) { setResult(r.data); router.refresh(); } else setErr(r.error); })}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Import {ready} test{ready === 1 ? "" : "s"}</Button>
        </>
      )}
      <FormError message={err} />
      {result && (
        <div className="rounded-lg bg-emerald-50 p-3 text-[0.8125rem] text-emerald-900 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30">
          <p className="flex items-center gap-1.5 font-medium"><Check className="h-4 w-4" />Imported {result.imported} test{result.imported === 1 ? "" : "s"}{result.added ? `, ${result.added} new asset${result.added === 1 ? "" : "s"}` : ""}{result.duplicates ? `, ${result.duplicates} already there` : ""}.</p>
          {result.skipped.length > 0 && <details className="mt-1"><summary className="cursor-pointer">{result.skipped.length} skipped</summary><ul className="mt-1 list-disc pl-5 text-[0.75rem]">{result.skipped.slice(0, 50).map((s, i) => <li key={i}>Row {s.row}: {s.why}</li>)}</ul></details>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ settings + test print */

export function TagSettingsForm({ initial }: { initial: { prefix: string; licence: string | null; phone: string | null; soonDays: number; defaultInterval: number; profile: PrinterProfile } }) {
  const router = useRouter();
  const [v, setV] = useState({ ...initial, licence: initial.licence ?? "", phone: initial.phone ?? "" });
  const [zpl, setZpl] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const p = v.profile;
  const setP = (patch: Partial<PrinterProfile>) => setV({ ...v, profile: { ...p, ...patch } });
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label hint="e.g. BC → BC-000001">Tag code prefix</Label><Input value={v.prefix} onChange={(e) => setV({ ...v, prefix: e.target.value.toUpperCase() })} maxLength={8} /></div>
        <div><Label hint="optional, printed on labels">Licence / accreditation no.</Label><Input value={v.licence} onChange={(e) => setV({ ...v, licence: e.target.value })} /></div>
        <div><Label hint="printed on labels">Phone</Label><Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
        <div><Label>Alert me this many days before a retest</Label><Input type="number" min={0} max={120} value={v.soonDays} onChange={(e) => setV({ ...v, soonDays: Number(e.target.value) })} /></div>
        <div className="sm:col-span-2"><Label>Usual retest interval</Label><Select value={String(v.defaultInterval)} onChange={(e) => setV({ ...v, defaultInterval: Number(e.target.value) })}>{INTERVALS.map((i) => <option key={i.months} value={i.months}>{i.label}</option>)}</Select></div>
      </div>
      <div>
        <Label>Label</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div><span className="text-[0.6875rem] text-ink-faint">Width mm</span><Input type="number" value={p.widthMm} onChange={(e) => setP({ widthMm: Number(e.target.value) })} /></div>
          <div><span className="text-[0.6875rem] text-ink-faint">Height mm</span><Input type="number" value={p.heightMm} onChange={(e) => setP({ heightMm: Number(e.target.value) })} /></div>
          <div><span className="text-[0.6875rem] text-ink-faint">Resolution</span><Select value={String(p.dpi)} onChange={(e) => setP({ dpi: Number(e.target.value) === 300 ? 300 : 203 })}><option value="203">203 dpi</option><option value="300">300 dpi</option></Select></div>
          <div><span className="text-[0.6875rem] text-ink-faint">Darkness (0–30)</span><Input type="number" min={0} max={30} value={p.darkness ?? ""} onChange={(e) => setP({ darkness: e.target.value === "" ? null : Number(e.target.value) })} placeholder="printer's" /></div>
          <label className="flex items-end gap-2 pb-2 text-[0.8125rem] text-ink"><input type="checkbox" checked={p.rotate} onChange={(e) => setP({ rotate: e.target.checked })} />Upside down</label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={busy} onClick={() => start(async () => { const r = await saveTagSettings(v); if (r.ok) { setZpl(r.data.testZpl); setMsg({ ok: true, text: "Saved — print a test label to check it." }); router.refresh(); } else setMsg({ ok: false, text: r.error }); })}>Save</Button>
        {msg && <span className={msg.ok ? "text-[0.8125rem] text-emerald-700" : "text-[0.8125rem] text-rose-600"}>{msg.text}</span>}
      </div>
      <PrinterBar />
      {zpl && <div className="flex items-center gap-2"><span className="text-[0.8125rem] text-ink">Test label:</span><PrintLabel zpl={zpl} name="test-label" compact /><button onClick={() => setZpl(null)} aria-label="Close"><X className="h-4 w-4 text-ink-faint" /></button></div>}
    </div>
  );
}
