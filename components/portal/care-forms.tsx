"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Megaphone, Paperclip, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtBytes, MAX_FILE_BYTES, MAX_FILES, TILE_LABEL, type HomeTile, type TicketFile } from "@/lib/nerdherd/care";
import { money } from "@/lib/format";
import { buyHours, getUploadLinks, replyWithFiles, requestAds, savePrefs, submitRequest, type CareState } from "@/app/p/[slug]/care/actions";

const field = "block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[0.9375rem] text-ink placeholder:text-ink-faint focus:border-[var(--portal-brand)] focus:outline-none";
const label = "block text-[0.875rem] font-semibold text-ink";
const primary = "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--portal-brand)] px-6 font-semibold text-[color:var(--portal-brand-fg)] shadow-sm hover:brightness-95 disabled:opacity-50";

/* ------------------------------------------------------------------ files: straight to storage, then their paths go with the form */

type Picked = { key: string; name: string; size: number; state: "uploading" | "done" | "error"; file?: TicketFile; error?: string };
export function FilePicker({ getLinks, onBusy }: { getLinks: (list: { name: string; size: number; type: string }[]) => Promise<{ ok: true; data: { path: string; token: string; name: string; size: number; type: string }[] } | { ok: false; error: string }>; onBusy?: (b: boolean) => void }) {
  const [items, setItems] = useState<Picked[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = items.some((i) => i.state === "uploading");
  useEffect(() => { onBusy?.(busy); }, [busy, onBusy]);

  async function add(list: FileList | null) {
    setErr(null);
    const files = Array.from(list ?? []);
    if (!files.length) return;
    if (items.length + files.length > MAX_FILES) { setErr(`Attach up to ${MAX_FILES} files.`); return; }
    const big = files.find((f) => f.size > MAX_FILE_BYTES);
    if (big) { setErr(`"${big.name}" is over 10 MB — share a link to it in the details instead.`); return; }
    const fresh: Picked[] = files.map((f) => ({ key: `${f.name}-${f.size}-${Math.random()}`, name: f.name, size: f.size, state: "uploading" }));
    setItems((x) => [...x, ...fresh]);
    const links = await getLinks(files.map((f) => ({ name: f.name, size: f.size, type: f.type })));
    if (!links.ok) { setItems((x) => x.map((i) => (fresh.some((f) => f.key === i.key) ? { ...i, state: "error", error: links.error } : i))); return; }
    const sb = createClient();
    await Promise.all(files.map(async (f, n) => {
      const l = links.data[n];
      const { error } = await sb.storage.from("ticket-files").uploadToSignedUrl(l.path, l.token, f, { contentType: f.type || "application/octet-stream" });
      setItems((x) => x.map((i) => (i.key === fresh[n].key ? (error ? { ...i, state: "error", error: error.message } : { ...i, state: "done", file: { path: l.path, name: l.name, size: l.size, type: l.type } }) : i)));
    }));
    if (input.current) input.current.value = "";
  }
  const done = items.filter((i) => i.state === "done" && i.file).map((i) => i.file!);
  return (
    <div>
      <input type="hidden" name="uploads" value={JSON.stringify(done)} />
      <input ref={input} type="file" multiple className="sr-only" id="care-files" onChange={(e) => add(e.target.files)} />
      <label htmlFor="care-files" className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-[0.875rem] font-semibold text-ink ring-1 ring-inset ring-line-strong hover:bg-zinc-50"><Paperclip className="h-4 w-4" />Attach files</label>
      <span className="ml-2 text-[0.8125rem] text-ink-faint">Screenshots, logos, documents — up to {MAX_FILES}, 10 MB each</span>
      {err && <p role="alert" className="mt-2 text-[0.8125rem] font-medium text-rose-700">{err}</p>}
      {items.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {items.map((i) => (
            <li key={i.key} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2 text-[0.8125rem] ring-1 ring-line">
              <span className="min-w-0 truncate text-ink">{i.name} <span className="text-ink-faint">· {fmtBytes(i.size)}</span></span>
              <span className="flex shrink-0 items-center gap-2">
                {i.state === "uploading" ? <Loader2 className="h-4 w-4 animate-spin text-ink-faint" /> : i.state === "error" ? <span className="text-rose-700">{i.error ?? "Failed"}</span> : <span className="text-emerald-700">Attached</span>}
                {i.state !== "uploading" && <button type="button" aria-label={`Remove ${i.name}`} onClick={() => setItems((x) => x.filter((y) => y.key !== i.key))}><X className="h-4 w-4 text-ink-faint hover:text-ink" /></button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ request tasks / lodge a job / report a problem */

export type RequestType = "tasks" | "job" | "problem";
export function RequestForm({ slug, customers, sites, type: initial, site, presetTasks, presetSubject, hoursLeft, minHours, canTasks }: {
  slug: string; customers: { id: string; name: string }[]; sites: { id: string; domain: string; customer_id: string | null }[];
  type: RequestType; site: string | null; presetTasks: string[]; presetSubject: string; hoursLeft: string | null; minHours: number; canTasks: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<RequestType>(initial === "tasks" && !canTasks ? "job" : initial);
  const [tasks, setTasks] = useState<string[]>(presetTasks.length ? presetTasks : [""]);
  const [uploading, setUploading] = useState(false);
  const [state, action, pending] = useActionState<CareState, FormData>(submitRequest, {});
  useEffect(() => { if (state.ok && state.id) router.push(`/p/${slug}/support/${state.id}?sent=1`); }, [state, router, slug]);
  const kinds: { k: RequestType; t: string; b: string; icon: typeof Send }[] = [
    ...(canTasks ? [{ k: "tasks" as const, t: "Request tasks", b: `From your prepaid hours${hoursLeft ? ` · ${hoursLeft} left` : ""}`, icon: Send }] : []),
    { k: "job", t: "Lodge a job", b: "Something new or bigger — we'll quote it first", icon: Sparkles },
    { k: "problem", t: "Report a problem", b: "Something's broken or not working", icon: AlertTriangle },
  ];
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="type" value={type} />
      <fieldset>
        <legend className={label}>What do you need?</legend>
        <div className={`mt-2 grid gap-2 ${kinds.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {kinds.map((k) => (
            <button key={k.k} type="button" onClick={() => setType(k.k)} aria-pressed={type === k.k}
              className={`flex items-start gap-3 rounded-2xl p-4 text-left ring-1 transition ${type === k.k ? "bg-[var(--portal-brand-soft)] ring-2 ring-[var(--portal-brand)]" : "bg-surface ring-line-strong hover:ring-[var(--portal-brand-line)]"}`}>
              <k.icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--portal-brand-ink)]" />
              <span><span className="block font-semibold text-ink">{k.t}</span><span className="block text-[0.8125rem] text-ink-muted">{k.b}</span></span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        {customers.length > 1 ? (
          <label className={label}>Account
            <select name="customer" className={`${field} mt-1.5`}>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
        ) : <input type="hidden" name="customer" value={customers[0]?.id ?? ""} />}
        {sites.length > 0 && (
          <label className={label}>Website
            <select name="website" defaultValue={site ?? ""} className={`${field} mt-1.5`}><option value="">Not about a particular site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}</select>
          </label>
        )}
      </div>
      <label className={label}>{type === "problem" ? "What's wrong?" : type === "tasks" ? "Give this list a title" : "What's the job?"}
        <input name="subject" required maxLength={300} defaultValue={presetSubject} className={`${field} mt-1.5`}
          placeholder={type === "problem" ? "e.g. The contact form isn't sending" : type === "tasks" ? "e.g. Menu and price updates" : "e.g. Add an online booking page"} />
      </label>
      {type === "problem" && (
        <fieldset>
          <legend className={label}>How bad is it?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {[["down", "The site is down", "Or a key part, like checkout"], ["broken", "Something's broken", "But the site still works"], ["minor", "Not urgent", "Fix it when you can"]].map(([v, t, b], n) => (
              <label key={v} className="flex cursor-pointer items-start gap-3 rounded-2xl bg-surface p-3.5 ring-1 ring-line-strong has-[:checked]:ring-2 has-[:checked]:ring-[var(--portal-brand)]">
                <input type="radio" name="urgency" value={v} defaultChecked={n === 1} className="mt-1 accent-[var(--portal-brand)]" />
                <span><span className="block font-semibold text-ink">{t}</span><span className="block text-[0.8125rem] text-ink-muted">{b}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {type === "tasks" && (
        <div>
          <p className={label}>Tasks</p>
          <p className="text-[0.8125rem] text-ink-muted">One change per line. Each request uses at least {minHours === 1 ? "1 hour" : `${minHours} hours`} of your block, then the time we spend to the next 15 minutes — so group small changes into one list.</p>
          <ol className="mt-2 space-y-2">
            {tasks.map((t, n) => (
              <li key={n} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-[0.8125rem] text-ink-faint">{n + 1}.</span>
                <input name="task" value={t} onChange={(e) => setTasks((x) => x.map((y, i) => (i === n ? e.target.value : y)))} maxLength={200} className={field} placeholder={n === 0 ? "e.g. Change the Saturday opening hours to 8–2" : "Another change"} />
                {tasks.length > 1 && <button type="button" aria-label={`Remove task ${n + 1}`} onClick={() => setTasks((x) => x.filter((_, i) => i !== n))} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-zinc-100 hover:text-ink"><Trash2 className="h-4 w-4" /></button>}
              </li>
            ))}
          </ol>
          {tasks.length < 40 && <button type="button" onClick={() => setTasks((x) => [...x, ""])} className="mt-2 inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-[var(--portal-brand-ink)]"><Plus className="h-4 w-4" />Add a task</button>}
        </div>
      )}
      <label className={label}>{type === "tasks" ? "Anything else we should know?" : "Details"}
        <textarea name="details" rows={5} className={`${field} mt-1.5`} placeholder={type === "problem" ? "Which page, what you clicked, what happened, when it started…" : "Links to pages, wording, how you'd like it to look…"} />
      </label>
      <FilePicker getLinks={(l) => getUploadLinks(slug, l)} onBusy={setUploading} />
      {state.error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[0.875rem] font-medium text-rose-800 ring-1 ring-rose-200">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className={primary} disabled={pending || uploading}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{type === "tasks" ? "Send my tasks" : type === "job" ? "Send for a quote" : "Report it"}</button>
        <p className="text-[0.8125rem] text-ink-muted">{type === "tasks" ? "We'll start on them and reply here." : type === "job" ? "We'll reply with a quote before any work starts." : "We'll look at it and reply here. If the site is down, call us too."}</p>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ reply on a request, with files */

export function ReplyWithFiles({ slug, ticket }: { slug: string; ticket: string }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [uploading, setUploading] = useState(false);
  const [n, setN] = useState(0);
  const [state, action, pending] = useActionState<CareState, FormData>(replyWithFiles, {});
  useEffect(() => { if (state.ok) { ref.current?.reset(); setN((x) => x + 1); router.refresh(); } }, [state, router]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticket" value={ticket} />
      <textarea name="body" rows={4} className={field} placeholder="Write a reply…" aria-label="Reply" />
      <FilePicker key={n} getLinks={(l) => getUploadLinks(slug, l)} onBusy={setUploading} />
      {state.error && <p role="alert" className="text-[0.875rem] font-medium text-rose-700">{state.error}</p>}
      <button className={primary} disabled={pending || uploading}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send reply</button>
    </form>
  );
}

/* ------------------------------------------------------------------ buy hours */

export function BuyHours({ slug, customer, packs, currency, rate }: { slug: string; customer: string; packs: { hours: number; discountPct: number; exGst: number; incGst: number; saved: number }[]; currency: string; rate: number }) {
  const [state, action, pending] = useActionState<CareState, FormData>(buyHours, {});
  const [pick, setPick] = useState<number>(packs[1]?.hours ?? packs[0]?.hours ?? 0);
  useEffect(() => { if (state.ok && state.pay) window.location.href = `/pay/${state.pay}`; }, [state]);
  return (
    <form action={action} className="space-y-4" id="buy">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="customer" value={customer} />
      <input type="hidden" name="hours" value={pick} />
      <div className="grid gap-3 sm:grid-cols-3">
        {packs.map((p) => (
          <button key={p.hours} type="button" onClick={() => setPick(p.hours)} aria-pressed={pick === p.hours}
            className={`relative rounded-[22px] p-5 text-left transition ${pick === p.hours ? "bg-[var(--portal-brand-soft)] ring-2 ring-[var(--portal-brand)]" : "bg-surface ring-1 ring-line-strong hover:ring-[var(--portal-brand-line)]"}`}>
            {p.discountPct > 0 && <span className="absolute right-4 top-4 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-emerald-800">Save {p.discountPct}%</span>}
            <span className="block text-[2rem] font-semibold leading-none text-ink">{p.hours} hours</span>
            <span className="mt-2 block text-[1.125rem] font-semibold text-ink">{money(p.incGst, currency)}</span>
            <span className="block text-[0.8125rem] text-ink-muted">{money(p.exGst, currency)} + GST{p.saved > 0 ? ` · you save ${money(p.saved * 1.1, currency, { cents: false })}` : ""}</span>
            <span className="mt-2 block text-[0.75rem] text-ink-faint">{money(Math.round((p.exGst / p.hours) * 100) / 100, currency)}/hr + GST{p.discountPct ? ` (normally ${money(rate, currency, { cents: false })})` : ""}</span>
          </button>
        ))}
      </div>
      {state.error && <p role="alert" className="text-[0.875rem] font-medium text-rose-700">{state.error}</p>}
      <button className={primary} disabled={pending || !pick}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Buy {pick} hours and pay</button>
      <p className="text-[0.8125rem] text-ink-muted">You&apos;ll go straight to a secure payment page. The hours are ready as soon as it&apos;s paid.</p>
    </form>
  );
}

/* ------------------------------------------------------------------ add Google Ads */

export function AdsAddOn({ slug, customer }: { slug: string; customer: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CareState, FormData>(requestAds, {});
  useEffect(() => { if (state.ok && state.id) router.push(`/p/${slug}/support/${state.id}?sent=1`); }, [state, router, slug]);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={`${primary} mt-4`}><Megaphone className="h-4 w-4" />Add Google Ads to my package</button>;
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="customer" value={customer} />
      <label className={label}>Monthly ad budget you have in mind
        <input name="budget" maxLength={60} className={`${field} mt-1.5`} placeholder="e.g. $300 a month — or “not sure, advise me”" />
      </label>
      <label className={label}>What do you want more of?
        <textarea name="goal" rows={3} maxLength={2000} className={`${field} mt-1.5`} placeholder="e.g. More bookings for our weekend classes" />
      </label>
      {state.error && <p role="alert" className="text-[0.875rem] font-medium text-rose-700">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send</button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex h-11 items-center rounded-full px-5 font-semibold text-ink-muted hover:text-ink">Cancel</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ customise the home page */

export function Customise({ slug, customer, order: initialOrder, hidden: initialHidden, available }: { slug: string; customer: string; order: HomeTile[]; hidden: HomeTile[]; available: HomeTile[] }) {
  const router = useRouter();
  const [order, setOrder] = useState<HomeTile[]>(initialOrder.filter((t) => available.includes(t)));
  const [hidden, setHidden] = useState<HomeTile[]>(initialHidden);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const move = (i: number, d: -1 | 1) => setOrder((o) => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; });
  async function save() {
    setSaving(true); setMsg(null);
    const r = await savePrefs(slug, customer, order, hidden);
    setSaving(false);
    if (r.error) setMsg(r.error); else { router.push(`/p/${slug}`); router.refresh(); }
  }
  return (
    <div className="space-y-4">
      <ol className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface ring-1 ring-line">
        {order.map((t, i) => {
          const off = hidden.includes(t);
          return (
            <li key={t} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className="w-6 text-[0.8125rem] text-ink-faint">{i + 1}</span>
              <span className={`min-w-0 flex-1 font-medium ${off ? "text-ink-faint line-through" : "text-ink"}`}>{TILE_LABEL[t]}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${TILE_LABEL[t]} up`} className="grid h-10 w-10 place-items-center rounded-full text-ink-muted hover:bg-zinc-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${TILE_LABEL[t]} down`} className="grid h-10 w-10 place-items-center rounded-full text-ink-muted hover:bg-zinc-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => setHidden((h) => (off ? h.filter((x) => x !== t) : [...h, t]))} aria-pressed={!off}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-semibold ring-1 ring-inset ${off ? "text-ink-muted ring-line-strong" : "bg-[var(--portal-brand-soft)] text-[var(--portal-brand-ink)] ring-[var(--portal-brand-line)]"}`}>
                {off ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{off ? "Hidden" : "Shown"}
              </button>
            </li>
          );
        })}
      </ol>
      {msg && <p role="alert" className="text-[0.875rem] font-medium text-rose-700">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} className={primary} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save my layout</button>
        <button type="button" onClick={() => { setOrder([...available]); setHidden([]); }} className="inline-flex h-11 items-center rounded-full px-5 font-semibold text-ink-muted hover:text-ink">Reset to the standard layout</button>
      </div>
    </div>
  );
}
