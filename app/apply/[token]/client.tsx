"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, CircleDashed, Eye, FileText, Inbox, Loader2, Mail, MessageCircle, Paperclip,
  Plus, Search, Send, Trash2, Upload, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { SmartDateInput } from "@/components/ui/smart-date";
import { mayAnswer } from "@/lib/loans/permissions";
import { fieldShown, ownerLabel, stepProgress, steps as allSteps, type Field, type ListDef } from "@/lib/loans/form";
import type { DocRequest, LoanMsg } from "@/lib/loans/server";
import { SignaturePad } from "@/components/loans/signature-pad";
import { SchemeToggle } from "@/components/portal/scheme-toggle";
import {
  clearSignature, saveSignature, sendApplicantLink,
  disconnectGmail, finishUpload, markNotApplicable, removeUpload, rescanGmail, saveAnswers, sendClientMessage, shareGmailFiles,
  startUpload, submitApplication, viewMyDoc,
} from "./actions";

type Answers = Record<string, unknown>;
type Doc = { id: string; request_id: string | null; name: string; source: string; created_at: string };
type Conn = {
  id: string; provider: "xero" | "gmail"; label: string | null; status: string; last: string | null;
  found: { id: string; kind: string; requestId: string | null; subject: string; from: string; date: string; files: { name: string; attachmentId: string; size: number }[] }[];
  years: string[];
};

/** Money is saved as plain digits ("1000000") and shown with commas ("1,000,000") as they type. */
const plainMoney = (s: string) => { const [w, ...d] = s.replace(/[^\d.]/g, "").split("."); return d.length ? `${w}.${d.join("").slice(0, 2)}` : w; };
const withCommas = (s: string) => { const [w, d] = plainMoney(s).split("."); return (w ? Number(w).toLocaleString("en-AU") : "") + (d !== undefined ? `.${d}` : ""); };
const box = "h-11 w-full rounded-lg border border-line bg-surface px-3 text-[0.9375rem] text-ink placeholder:text-ink-faint focus:border-[var(--portal-brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--portal-brand)]/20 disabled:opacity-60";
const lab = "mb-1 block text-[0.8125rem] font-medium text-ink";
const brandBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--portal-brand)] px-5 text-[0.9375rem] font-semibold text-white disabled:opacity-50";
const plainBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[0.9375rem] font-medium text-ink ring-1 ring-inset ring-line hover:bg-canvas disabled:opacity-50";

export function ApplyClient({ token, org, file, requests: initialReqs, documents: initialDocs, messages: initialMsgs, connections, fys, flash, legal, signatures: initialSigs, me, links }: {
  signatures: { applicant: number; signed_name: string; image: string; signed_at: string }[];
  /** which applicant this link belongs to (1 = the main link) */
  me: number;
  /** links sent to other applicants (main link only) */
  links: { applicant: number; email: string | null; sent_at: string | null; last_seen_at: string | null }[];
  legal: { privacy: string | null; creditGuide: string | null };
  token: string;
  org: { name: string; logo: string | null; email: string | null; phone: string | null };
  file: { title: string; status: string; applicants: number; answers: Answers; inbound: string | null; contactName: string | null; submittedAt: string | null };
  requests: DocRequest[]; documents: Doc[]; messages: LoanMsg[]; connections: Conn[]; fys: string[];
  flash: { step: string | null; error: string | null; connected: string | null; found: number | null };
}) {
  const steps = useMemo(() => allSteps(file.applicants), [file.applicants]);
  const [answers, setAnswers] = useState<Answers>(file.answers);
  const [stepIx, setStepIx] = useState(() => Math.max(0, steps.findIndex((s) => s.key === flash.step)));
  const [status, setStatus] = useState(file.status);
  const [requests, setRequests] = useState(initialReqs);
  const [docs, setDocs] = useState(initialDocs);
  const [msgs, setMsgs] = useState(initialMsgs);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [chatOpen, setChatOpen] = useState(false);
  const [sigs, setSigs] = useState(initialSigs);
  const locked = !["invited", "in_progress"].includes(status);
  const step = steps[stepIx];
  const names = Array.from({ length: file.applicants }, (_, i) => String(answers[`a${i + 1}.first_name`] ?? "").trim() || `Applicant ${i + 1}`);

  // ---- autosave + live focus (debounced), and a gentle poll for the broker's messages
  const pending = useRef<Answers>({});
  const focus = useRef<{ step: string; field?: string; label?: string } | null>({ step: step.key });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocus = useRef<string | null>(null);
  const lastMsg = useRef<string | null>(initialMsgs.at(-1)?.created_at ?? null);
  const flush = useCallback(async () => {
    const patch = pending.current; pending.current = {};
    if (Object.keys(patch).length) setSaving("saving");
    // only tell the broker where we are when it moved or something was typed; the 6s poll alone isn't activity
    const fNow = JSON.stringify(focus.current);
    const sendFocus = fNow !== lastFocus.current || Object.keys(patch).length > 0;
    const r = await saveAnswers(token, patch, sendFocus ? focus.current : null, lastMsg.current).catch(() => null);
    if (r?.ok && sendFocus) lastFocus.current = fNow;
    if (!r || !r.ok) { pending.current = { ...patch, ...pending.current }; setSaving("error"); return; }
    if (Object.keys(patch).length) setSaving("saved");
    setStatus(r.data.status);
    setRequests(r.data.requests);
    // what the other applicant has filled in, without touching anything still being typed here
    setAnswers((cur) => ({ ...r.data.answers, ...Object.fromEntries(Object.keys(pending.current).map((k) => [k, cur[k]])) }));
    if (r.data.messages.length) {
      lastMsg.current = r.data.messages.at(-1)!.created_at;
      setMsgs((m) => [...m, ...r.data.messages.filter((x) => !m.some((y) => y.id === x.id))]);
      if (r.data.messages.some((x) => x.from_side === "broker")) setChatOpen(true);
    }
  }, [token]);
  const schedule = useCallback((ms: number) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(flush, ms); }, [flush]);
  useEffect(() => { focus.current = { step: step.key }; schedule(300); }, [step.key, schedule]);
  useEffect(() => { const f = () => { if (Object.keys(pending.current).length) flush(); }; window.addEventListener("pagehide", f); return () => window.removeEventListener("pagehide", f); }, [flush]);

  const mine = (key: string) => mayAnswer(me, key);
  const set = (key: string, value: unknown) => {
    if (locked || !mine(key)) return;
    setAnswers((a) => ({ ...a, [key]: value }));
    pending.current[key] = value;
    if (key.includes("__none")) pending.current[key] = value;
    schedule(700);
  };
  const onFocus = (field: string, label: string) => { focus.current = { step: step.key, field, label }; schedule(250); };

  const go = (i: number) => { setStepIx(Math.min(steps.length - 1, Math.max(0, i))); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const needed = requests.filter((r) => r.status === "needed" || r.status === "redo").length;
  const formSteps = steps.filter((s) => !s.special);
  const overall = Math.round((formSteps.reduce((t, s) => t + stepProgress(s, file.applicants, answers), 0) / formSteps.length) * 100);
  const unread = msgs.filter((m) => m.from_side === "broker" && !m.read_at).length;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-5 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        {org.logo ? <Image src={org.logo} alt={org.name} width={120} height={40} className="h-10 w-auto max-w-[140px] object-contain" unoptimized /> : <span className="text-[1.0625rem] font-bold">{org.name}</span>}
        <SchemeToggle className="ml-auto" />
        <div className="text-right text-[0.75rem] text-ink-muted">
          {saving === "saving" ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>
            : saving === "error" ? <span className="text-rose-600">Not saved — check your connection</span>
            : saving === "saved" ? <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" />Saved</span> : "Saves as you type"}
        </div>
      </header>
      <h1 className="mt-4 text-[1.5rem] font-bold leading-tight sm:text-[1.75rem]">{file.title}</h1>
      <p className="mt-1 text-[0.875rem] text-ink-muted">Your answers save as you go, so you can stop and come back with this link any time. {org.name} can see what you&apos;ve filled in so they can get started and help if you get stuck.</p>

      {flash.error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-[0.875rem] text-rose-800 ring-1 ring-inset ring-rose-200">{flash.error}</p>}
      {locked && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-[0.875rem] text-emerald-900 ring-1 ring-inset ring-emerald-200">Your application has been sent to {org.name}. You can still message them below.</p>}

      {/* progress + steps */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-[0.75rem] text-ink-muted"><span>{overall}% of questions answered</span><span>{needed ? `${needed} document${needed === 1 ? "" : "s"} still needed` : "All documents in"}</span></div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-[var(--portal-brand)] transition-all" style={{ width: `${overall}%` }} /></div>
        <nav className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Steps">
          {steps.map((s, i) => {
            const p = s.special === "documents" ? (requests.length ? 1 - needed / requests.length : 0) : stepProgress(s, file.applicants, answers);
            return (
              <button key={s.key} type="button" onClick={() => go(i)} aria-current={i === stepIx ? "step" : undefined}
                className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium ring-1 ring-inset",
                  i === stepIx ? "bg-[var(--portal-brand)] text-white ring-transparent" : "bg-surface text-ink-muted ring-line hover:text-ink")}>
                {!s.special && p >= 0.999 ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}{s.title}
              </button>
            );
          })}
        </nav>
      </div>

      <section className="mt-5 rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-[1.1875rem] font-semibold">{step.title}</h2>
        {step.intro && <p className="mt-0.5 text-[0.875rem] text-ink-muted">{step.intro}</p>}
        <div className="mt-4 space-y-6">
          {me > 1 && !step.special && (step.fields || step.lists) && (
            <p className="rounded-lg bg-canvas px-3 py-2 text-[0.8125rem] text-ink-muted ring-1 ring-inset ring-line">{names[0]} fills in the shared parts — you can see them here as they&apos;re added. Message us if something needs changing.</p>
          )}
          {step.perApplicant && !step.special && names.map((n, i) => (me === 1 || me === i + 1) && (
            <fieldset key={i} className={cn("space-y-3", file.applicants > 1 && "rounded-xl p-3 ring-1 ring-inset ring-line sm:p-4")}>
              {file.applicants > 1 && <legend className="px-1 text-[0.9375rem] font-semibold text-ink">{n}{i + 1 === me ? " (you)" : ""}</legend>}
              <FieldGrid fields={step.perApplicant!} prefix={`a${i + 1}.`} answers={answers} set={set} onFocus={onFocus} disabled={locked} who={file.applicants > 1 ? n : ""} />
              {me === 1 && i > 0 && step.key === "about" && <InviteApplicant token={token} applicant={i + 1} name={n} email={String(answers[`a${i + 1}.email`] ?? "")} link={links.find((l) => l.applicant === i + 1) ?? null} locked={locked} />}
            </fieldset>
          ))}
          {step.fields && <FieldGrid fields={step.fields} prefix="" answers={answers} set={set} onFocus={onFocus} disabled={locked || me > 1} who="" />}
          {step.lists?.map((l) => <ListEditor key={l.key} def={l} answers={answers} set={set} onFocus={onFocus} disabled={locked || me > 1} names={names} />)}
          {step.special === "documents" && (
            <Documents token={token} me={me} names={names} requests={requests} setRequests={setRequests} docs={docs} setDocs={setDocs} inbound={file.inbound} locked={locked} orgName={org.name}
              onFocus={(label) => { focus.current = { step: "documents", label }; schedule(200); }} />
          )}
          {step.special === "connect" && (me === 1 ? <Connect token={token} connections={connections} fys={fys} flash={flash} locked={locked} />
            : <p className="rounded-lg bg-canvas px-3 py-2.5 text-[0.875rem] text-ink-muted ring-1 ring-inset ring-line">{names[0]} connects Xero and Gmail from their link. Upload your own documents on the Documents step.</p>)}
          {step.special === "review" && (
            <Review token={token} steps={formSteps} applicants={file.applicants} answers={answers} needed={requests.filter((r) => r.status === "needed" || r.status === "redo")} names={names}
              locked={locked} orgName={org.name} onGo={(k) => go(steps.findIndex((s) => s.key === k))} onSent={() => setStatus("submitted")} flushFirst={flush}
              consents={<>
                {legal.privacy && <div className="max-h-48 overflow-y-auto rounded-xl bg-canvas px-3 py-2.5 text-[0.8125rem] text-ink-muted ring-1 ring-inset ring-line"><p className="mb-1 font-medium text-ink">Privacy statement</p><p className="whitespace-pre-wrap">{legal.privacy}</p></div>}
                {legal.creditGuide
                  ? <a href={legal.creditGuide} target="_blank" rel="noopener" onClick={() => onFocus("credit_guide", "Opened the Credit Guide")} className={cn(plainBtn, "w-full justify-start sm:w-auto")}><FileText className="h-4 w-4" />Read the Credit Guide (PDF)</a>
                  : <p className="rounded-lg bg-canvas px-3 py-2 text-[0.8125rem] text-ink-muted ring-1 ring-inset ring-line">{org.name} gives you their Credit Guide — ask them for a copy if you haven&apos;t had it.</p>}
                {names.map((n, i) => i + 1 !== me ? (
                  <OtherSigner key={i} name={n} signed={sigs.find((x) => x.applicant === i + 1) ?? null}
                    ticked={step.perApplicant!.every((f) => answers[`a${i + 1}.${f.key}`] === "yes")}
                    invite={me === 1 ? <InviteApplicant token={token} applicant={i + 1} name={n} email={String(answers[`a${i + 1}.email`] ?? "")} link={links.find((l) => l.applicant === i + 1) ?? null} locked={locked} /> : null} />
                ) : (
                  <fieldset key={i} className="space-y-3 rounded-xl p-3 ring-1 ring-inset ring-line">
                    <legend className="px-1 text-[0.9375rem] font-semibold">{file.applicants > 1 ? `${n} (you)` : "Your consent"}</legend>
                    <FieldGrid fields={step.perApplicant!} prefix={`a${i + 1}.`} answers={answers} set={set} onFocus={onFocus} disabled={locked} who={file.applicants > 1 ? n : ""} />
                    <SignBlock token={token} applicant={i + 1} who={file.applicants > 1 ? n : ""} locked={locked} suggested={[answers[`a${i + 1}.first_name`], answers[`a${i + 1}.last_name`]].filter(Boolean).join(" ")}
                      sig={sigs.find((x) => x.applicant === i + 1) ?? null} onSigned={(x) => setSigs((all) => [...all.filter((y) => y.applicant !== i + 1), ...(x ? [x] : [])])}
                      onFocus={() => onFocus(`a${i + 1}.signature`, `${file.applicants > 1 ? `${n} · ` : ""}Signing`)} />
                  </fieldset>
                ))}
              </>}
              me={me}
              consentsDone={names.every((_, i) => sigs.some((x) => x.applicant === i + 1) && step.perApplicant!.every((f) => answers[`a${i + 1}.${f.key}`] === "yes"))} />
          )}
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" disabled={stepIx === 0} onClick={() => go(stepIx - 1)} className={plainBtn}><ArrowLeft className="h-4 w-4" />Back</button>
        {stepIx < steps.length - 1 && <button type="button" onClick={() => go(stepIx + 1)} className={brandBtn}>Next: {steps[stepIx + 1].title}<ArrowRight className="h-4 w-4" /></button>}
      </div>

      <p className="mt-8 text-center text-[0.75rem] text-ink-faint">
        {org.name}{org.phone ? <> · <a href={`tel:${org.phone.replace(/[^\d+]/g, "")}`} className="underline">{org.phone}</a></> : null}{org.email ? <> · <a href={`mailto:${org.email}`} className="underline">{org.email}</a></> : null}
      </p>

      <Chat token={token} orgName={org.name} msgs={msgs} setMsgs={setMsgs} open={chatOpen} setOpen={setChatOpen} unread={unread} about={focus.current?.label ?? null} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------

function FieldInput({ f, id, value, onChange, onFocus, disabled, names = [] }: { f: Field; id: string; value: unknown; onChange: (v: string) => void; onFocus: () => void; disabled: boolean; names?: string[] }) {
  const v = value == null ? "" : String(value);
  if (f.type === "choice" || f.type === "multi") {
    const picked = f.type === "multi" ? v.split("|").filter(Boolean) : [v];
    const toggle = (o: string) => {
      onFocus();
      if (f.type === "choice") return onChange(v === o ? "" : o);
      const next = picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o];
      onChange(f.options!.filter((x) => next.includes(x)).join("|"));
    };
    return (
      <div id={id} role={f.type === "choice" ? "radiogroup" : "group"} aria-label={f.label} className="flex flex-wrap gap-2">
        {f.options!.map((o) => {
          const on = picked.includes(o);
          return (
            <button key={o} type="button" disabled={disabled} onClick={() => toggle(o)} role={f.type === "choice" ? "radio" : "checkbox"} aria-checked={on}
              className={cn("min-h-11 rounded-xl px-3.5 py-2 text-[0.875rem] font-medium ring-1 ring-inset transition-colors disabled:opacity-60",
                on ? "bg-[var(--portal-brand)]/10 text-[color:var(--portal-brand-ink)] ring-2 ring-[color:var(--portal-brand)]" : "bg-surface text-ink ring-line hover:bg-canvas")}>
              {f.type === "multi" && on && <Check className="mr-1 inline h-3.5 w-3.5" />}{o}
            </button>
          );
        })}
      </div>
    );
  }
  if (f.type === "check") return (
    <label className="flex cursor-pointer items-start gap-3 text-[0.9375rem] text-ink">
      <input id={id} type="checkbox" checked={v === "yes"} disabled={disabled} onFocus={onFocus} onChange={(e) => onChange(e.target.checked ? "yes" : "")} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--portal-brand)]" />
      <span>{f.label}{f.hint && <span className="mt-0.5 block text-[0.75rem] text-ink-faint">{f.hint}</span>}</span>
    </label>
  );
  if (f.type === "select") return (
    <select id={id} value={v} disabled={disabled} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} className={box}>
      <option value="">Choose…</option>{f.options!.map((o) => <option key={o} value={o}>{f.owner ? ownerLabel(o, names) : o}</option>)}
    </select>
  );
  if (f.type === "textarea") return <textarea id={id} value={v} disabled={disabled} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} rows={4} className={cn(box, "h-auto py-2")} />;
  if (f.type === "date") return <SmartDateInput value={/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null} onChange={(x) => onChange(x ?? "")} disabled={disabled} ariaLabel={f.label} placeholder="dd/mm/yyyy" inputClassName={box} />;
  if (f.type === "money") return (
    <span className="relative block"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">$</span>
      <input id={id} inputMode="decimal" value={withCommas(v)} disabled={disabled} onFocus={onFocus} onChange={(e) => onChange(plainMoney(e.target.value))} className={cn(box, "pl-7 tabular")} /></span>
  );
  return <input id={id} type={f.type === "number" ? "text" : f.type} inputMode={f.type === "number" ? "numeric" : f.type === "tel" ? "tel" : undefined} autoComplete="off" value={v} disabled={disabled} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} className={box} />;
}

function FieldGrid({ fields, prefix, answers, set, onFocus, disabled, who }: { fields: Field[]; prefix: string; answers: Answers; set: (k: string, v: unknown) => void; onFocus: (k: string, l: string) => void; disabled: boolean; who: string }) {
  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      {fields.filter((f) => fieldShown(f, answers, prefix)).map((f) => {
        const k = `${prefix}${f.key}`, id = `f-${k.replace(/\W/g, "-")}`;
        return (
          <div key={k} className={f.half ? "" : "sm:col-span-2"}>
            {f.type !== "check" && <label htmlFor={id} className={lab}>{f.label}</label>}
            <FieldInput f={f} id={id} value={answers[k]} disabled={disabled} onChange={(v) => set(k, v)} onFocus={() => onFocus(k, `${who ? `${who} · ` : ""}${f.label}`)} />
            {f.hint && f.type !== "check" && <p className="mt-1 text-[0.75rem] text-ink-faint">{f.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}

function ListEditor({ def, answers, set, onFocus, disabled, names }: { def: ListDef; answers: Answers; set: (k: string, v: unknown) => void; onFocus: (k: string, l: string) => void; disabled: boolean; names: string[] }) {
  const rows = (Array.isArray(answers[def.key]) ? answers[def.key] : []) as Record<string, string>[];
  const none = answers[`${def.key}__none`] === true;
  const update = (i: number, k: string, v: string) => set(def.key, rows.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[0.9375rem] font-semibold">{def.label}</h3>
        {!rows.length && (
          <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink-muted">
            <input type="checkbox" checked={none} disabled={disabled} onChange={(e) => set(`${def.key}__none`, e.target.checked)} className="h-4 w-4 accent-[var(--portal-brand)]" />None
          </label>
        )}
      </div>
      {def.hint && <p className="text-[0.75rem] text-ink-faint">{def.hint}</p>}
      <div className="mt-2 space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl bg-canvas p-3 ring-1 ring-inset ring-line">
            <div className="mb-2 flex items-center justify-between"><span className="text-[0.8125rem] font-medium capitalize text-ink-muted">{def.item} {i + 1}</span>
              {!disabled && <button type="button" onClick={() => set(def.key, rows.filter((_, n) => n !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-ink-faint hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${def.item} ${i + 1}`}><Trash2 className="h-4 w-4" /></button>}
            </div>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {def.fields.map((f) => {
                const id = `l-${def.key}-${i}-${f.key}`;
                return (
                  <div key={f.key} className={f.half ? "" : "sm:col-span-2"}>
                    <label htmlFor={id} className={lab}>{f.label}</label>
                    <FieldInput f={f} id={id} value={r[f.key]} disabled={disabled} names={names} onChange={(v) => update(i, f.key, v)} onFocus={() => onFocus(def.key, `${def.label} · ${def.item} ${i + 1} · ${f.label}`)} />
                    {f.hint && <p className="mt-1 text-[0.75rem] text-ink-faint">{f.hint}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {!disabled && <button type="button" onClick={() => { set(def.key, [...rows, {}]); if (none) set(`${def.key}__none`, false); }} className={cn(plainBtn, "mt-2 h-10 text-[0.875rem]")}><Plus className="h-4 w-4" />Add {rows.length ? "another" : "a"} {def.item}</button>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------

function Documents({ token, me, names, requests, setRequests, docs, setDocs, inbound, locked, orgName, onFocus }: {
  me: number;
  token: string; names: string[]; requests: DocRequest[]; setRequests: (f: (r: DocRequest[]) => DocRequest[]) => void; docs: Doc[]; setDocs: (f: (d: Doc[]) => Doc[]) => void;
  inbound: string | null; locked: boolean; orgName: string; onFocus: (label: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // another applicant's own link shows only their documents and the shared ones
  const groups = [...names.map((n, i) => ({ title: n, list: me === 1 || me === i + 1 ? requests.filter((r) => r.applicant === i + 1) : [] })), { title: names.length > 1 ? "For the application" : "Other documents", list: requests.filter((r) => !r.applicant) }].filter((g) => g.list.length);
  const upload = async (r: DocRequest, files: FileList | null) => {
    if (!files?.length) return;
    setErr(null); setBusy(r.id); onFocus(`Uploading: ${r.label}`);
    const sb = createClient();
    try {
      for (const f of Array.from(files)) {
        const s = await startUpload(token, r.id, f.name, f.size);
        if (!s.ok) throw new Error(s.error);
        const { error } = await sb.storage.from("loan-docs").uploadToSignedUrl(s.data.path, s.data.token, f, { contentType: f.type || undefined });
        if (error) throw new Error(`${f.name} didn't upload: ${error.message}`);
        const done = await finishUpload(token, s.data.path, r.id, f.name, f.type || null);
        if (!done.ok) throw new Error(done.error);
        setDocs((d) => [...d, done.data]);
        setRequests((all) => all.map((x) => (x.id === r.id && (x.status === "needed" || x.status === "redo") ? { ...x, status: "received" } : x)));
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    setBusy(null);
  };
  const na = async (r: DocRequest, on: boolean) => {
    const res = await markNotApplicable(token, r.id, on);
    if (!res.ok) { setErr(res.error); return; }
    setRequests((all) => all.map((x) => (x.id === r.id ? { ...x, status: on ? "not_applicable" : "needed" } : x)));
  };
  const remove = async (d: Doc) => {
    const res = await removeUpload(token, d.id);
    if (!res.ok) { setErr(res.error); return; }
    setDocs((all) => all.filter((x) => x.id !== d.id));
    if (d.request_id && !docs.some((x) => x.request_id === d.request_id && x.id !== d.id)) setRequests((all) => all.map((x) => (x.id === d.request_id && x.status === "received" ? { ...x, status: "needed" } : x)));
  };
  const view = async (d: Doc) => { const r = await viewMyDoc(token, d.id); if (r.ok) window.open(r.data, "_blank", "noopener"); else setErr(r.error); };
  return (
    <div className="space-y-5">
      {inbound && !locked && (
        <p className="flex items-start gap-2 rounded-xl bg-canvas px-3 py-2.5 text-[0.8125rem] text-ink-muted ring-1 ring-inset ring-line">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" /><span>Got them in your email? Forward the emails to <b className="select-all break-all text-ink">{inbound}</b> and the attachments land here for {orgName}. Or connect Gmail in the next step and pick them.</span>
        </p>
      )}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.875rem] text-rose-800 ring-1 ring-inset ring-rose-200">{err}</p>}
      {groups.map((g) => (
        <div key={g.title}>
          <h3 className="mb-2 text-[0.9375rem] font-semibold">{g.title}</h3>
          <ul className="divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
            {g.list.map((r) => {
              const mine = docs.filter((d) => d.request_id === r.id);
              const done = r.status === "received" || r.status === "accepted";
              return (
                <li key={r.id} className="px-3 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="mt-0.5">{done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : r.status === "not_applicable" ? <X className="h-5 w-5 text-ink-faint" /> : <CircleDashed className={cn("h-5 w-5", r.status === "redo" ? "text-amber-600" : "text-ink-faint")} />}</span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[0.9375rem] font-medium", r.status === "not_applicable" && "text-ink-faint line-through")}>{r.label}</p>
                      {r.hint && <p className="text-[0.75rem] text-ink-faint">{r.hint}</p>}
                      {r.status === "redo" && r.broker_note && <p className="mt-1 text-[0.8125rem] text-amber-800">{orgName}: {r.broker_note}</p>}
                    </div>
                    {!locked && r.status !== "not_applicable" && (
                      <label className={cn(plainBtn, "h-10 cursor-pointer text-[0.875rem]", busy === r.id && "pointer-events-none opacity-60")}>
                        {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{mine.length ? "Add more" : "Upload"}
                        <input type="file" multiple accept="application/pdf,image/*,.heic,.doc,.docx,.xls,.xlsx,.csv" className="sr-only" onChange={(e) => { upload(r, e.target.files); e.target.value = ""; }} />
                      </label>
                    )}
                  </div>
                  {mine.length > 0 && (
                    <ul className="mt-2 space-y-1 pl-8">
                      {mine.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
                          <Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{d.name}</span>
                          <button type="button" onClick={() => view(d)} className="rounded p-1.5 hover:bg-canvas hover:text-ink" aria-label={`View ${d.name}`}><Eye className="h-4 w-4" /></button>
                          {!locked && d.source !== "xero" && <button type="button" onClick={() => remove(d)} className="rounded p-1.5 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${d.name}`}><Trash2 className="h-4 w-4" /></button>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!locked && !done && (
                    <button type="button" onClick={() => na(r, r.status !== "not_applicable")} className="mt-1 pl-8 text-[0.75rem] text-ink-faint underline-offset-2 hover:text-ink hover:underline">
                      {r.status === "not_applicable" ? "Actually, I do have this" : "This doesn't apply to me"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {docs.some((d) => !d.request_id) && (
        <div>
          <h3 className="mb-2 text-[0.9375rem] font-semibold">Other files received</h3>
          <ul className="space-y-1">{docs.filter((d) => !d.request_id).map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-[0.8125rem] text-ink-muted"><FileText className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{d.name}</span>
              <button type="button" onClick={() => view(d)} className="rounded p-1.5 hover:bg-canvas hover:text-ink" aria-label={`View ${d.name}`}><Eye className="h-4 w-4" /></button></li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}

function Connect({ token, connections, fys, flash, locked }: { token: string; connections: Conn[]; fys: string[]; flash: { connected: string | null; found: number | null }; locked: boolean }) {
  const xero = connections.filter((c) => c.provider === "xero");
  const gmail = connections.find((c) => c.provider === "gmail" && c.status === "connected");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(flash.connected === "xero" ? "Xero connected — your reports are in, and we've let go of Xero again." : flash.connected === "gmail" ? `Gmail connected — ${flash.found ?? 0} email${flash.found === 1 ? "" : "s"} with likely documents found. Tick the ones to share.` : null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const key = (m: string, a: string) => `${m}|${a}`;
  const share = () => start(async () => {
    setErr(null);
    const picks = [...picked].map((k) => { const [messageId, attachmentId] = k.split("|"); return { messageId, attachmentId }; });
    const r = await shareGmailFiles(token, gmail!.id, picks);
    if (!r.ok) { setErr(r.error); return; }
    setPicked(new Set()); setMsg(`${r.data} file${r.data === 1 ? "" : "s"} shared — they're on your Documents list now.`);
    window.location.reload();
  });
  return (
    <div className="space-y-4">
      {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[0.875rem] text-emerald-900 ring-1 ring-inset ring-emerald-200">{msg}</p>}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.875rem] text-rose-800 ring-1 ring-inset ring-rose-200">{err}</p>}

      <div className="rounded-xl p-4 ring-1 ring-inset ring-line">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Xero — business financials</p>
            <p className="text-[0.8125rem] text-ink-muted">Pulls your profit and loss and balance sheet for {fys.join(" and ")}. Read only. Once they&apos;re copied we disconnect straight away — nothing else in your Xero is looked at.</p>
          </div>
          {!locked && <a href={`/api/apply/${encodeURIComponent(token)}/connect/xero`} className={brandBtn}>{xero.length ? "Pull again" : "Connect Xero"}</a>}
        </div>
        {xero.some((c) => c.years.length) && <p className="mt-2 text-[0.8125rem] text-emerald-700"><Check className="mr-1 inline h-4 w-4" />Received: {xero.flatMap((c) => c.years).join(", ")}</p>}
      </div>

      <div className="rounded-xl p-4 ring-1 ring-inset ring-line">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Gmail — find your documents</p>
            <p className="text-[0.8125rem] text-ink-muted">We search your email for the documents on your list (tax notices, statements, rates notices …) and show you what we find. <b className="text-ink">Nothing is shared until you tick it.</b> Disconnect any time.</p>
          </div>
          {!locked && !gmail && <a href={`/api/apply/${encodeURIComponent(token)}/connect/gmail`} className={brandBtn}><Inbox className="h-4 w-4" />Connect Gmail</a>}
        </div>
        {gmail && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-muted">
              <span>Connected: <b className="text-ink">{gmail.label}</b></span>
              <button type="button" disabled={pending} onClick={() => start(async () => { const r = await rescanGmail(token, gmail.id); if (r.ok) window.location.reload(); else setErr(r.error); })} className="inline-flex items-center gap-1 underline-offset-2 hover:text-ink hover:underline"><Search className="h-3.5 w-3.5" />Search again</button>
              <button type="button" disabled={pending} onClick={() => start(async () => { const r = await disconnectGmail(token, gmail.id); if (r.ok) window.location.reload(); else setErr(r.error); })} className="underline-offset-2 hover:text-rose-600 hover:underline">Disconnect</button>
            </div>
            {gmail.found.length === 0 ? <p className="mt-2 text-[0.8125rem] text-ink-faint">Nothing likely found — upload them on the Documents step instead.</p> : (
              <ul className="mt-3 space-y-2">
                {gmail.found.map((e) => (
                  <li key={e.id} className="rounded-lg bg-canvas p-2.5 ring-1 ring-inset ring-line">
                    <p className="truncate text-[0.875rem] font-medium">{e.subject || "(no subject)"}</p>
                    <p className="truncate text-[0.75rem] text-ink-faint">{e.from} · {e.date}</p>
                    <div className="mt-1.5 space-y-1">{e.files.map((f) => (
                      <label key={f.attachmentId} className="flex items-center gap-2 text-[0.8125rem]">
                        <input type="checkbox" disabled={locked} checked={picked.has(key(e.id, f.attachmentId))} onChange={(ev) => setPicked((s) => { const n = new Set(s); if (ev.target.checked) n.add(key(e.id, f.attachmentId)); else n.delete(key(e.id, f.attachmentId)); return n; })} className="h-4 w-4 accent-[var(--portal-brand)]" />
                        <Paperclip className="h-3.5 w-3.5 text-ink-faint" /><span className="min-w-0 flex-1 truncate">{f.name}</span>
                      </label>
                    ))}</div>
                  </li>
                ))}
              </ul>
            )}
            {picked.size > 0 && <button type="button" disabled={pending} onClick={share} className={cn(brandBtn, "mt-3")}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Share {picked.size} file{picked.size === 1 ? "" : "s"}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Review({ token, steps, applicants, answers, needed, names, locked, orgName, onGo, onSent, flushFirst, consents, consentsDone, me }: {
  consents: React.ReactNode; consentsDone: boolean; me: number;
  token: string; steps: ReturnType<typeof allSteps>; applicants: number; answers: Answers; needed: DocRequest[]; names: string[]; locked: boolean; orgName: string;
  onGo: (k: string) => void; onSent: () => void; flushFirst: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () => start(async () => {
    setErr(null); await flushFirst();
    const r = await submitApplication(token, name);
    if (!r.ok) { setErr(r.error); return; } onSent();
  });
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
        {steps.map((s) => {
          const p = Math.round(stepProgress(s, applicants, answers) * 100);
          return (
            <li key={s.key} className="flex items-center gap-3 px-3 py-2.5">
              {p >= 100 ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <CircleDashed className="h-5 w-5 text-ink-faint" />}
              <span className="flex-1 text-[0.9375rem]">{s.title}</span>
              <span className="text-[0.8125rem] text-ink-muted">{p}%</span>
              {p < 100 && <button type="button" onClick={() => onGo(s.key)} className="text-[0.8125rem] font-medium text-[color:var(--portal-brand-ink)] hover:underline">Finish</button>}
            </li>
          );
        })}
      </ul>
      {needed.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-[0.875rem] text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="font-medium">Still to come ({needed.length})</p>
          <ul className="mt-1 list-disc pl-5">{needed.slice(0, 12).map((r) => <li key={r.id}>{r.applicant ? `${names[r.applicant - 1]}: ` : ""}{r.label}</li>)}</ul>
          <p className="mt-1">You can send now and add these later, or <button type="button" onClick={() => onGo("documents")} className="font-medium underline">upload them</button>.</p>
        </div>
      )}
      {locked ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[0.875rem] text-emerald-900 ring-1 ring-inset ring-emerald-200">Sent. {orgName} will be in touch.</p>
      ) : (
        <div className="space-y-3">
          {consents}
          {me > 1 ? (
            <p className="rounded-xl bg-canvas px-4 py-3 text-[0.875rem] text-ink-muted ring-1 ring-inset ring-line">Once you&apos;ve ticked and signed, you&apos;re done — {names[0]} sends the application when everyone has signed.</p>
          ) : (
          <div className="rounded-xl p-4 ring-1 ring-inset ring-line">
          <p className="text-[0.875rem] text-ink-muted">By sending, you consent to {orgName} using this information and the documents you&apos;ve shared to assess and arrange your loan, including sharing them with lenders.</p>
          <label htmlFor="consent" className={cn(lab, "mt-3")}>Type your full name to send</label>
          <input id="consent" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={box} />
          {err && <p className="mt-2 text-[0.8125rem] text-rose-700">{err}</p>}
          {!consentsDone && <p className="mt-2 text-[0.8125rem] text-ink-muted">{applicants > 1 ? "Everyone ticks their boxes and signs (each from their own link) before it can be sent." : "Tick every box and sign above to send."}</p>}
          <button type="button" disabled={pending || name.trim().length < 2 || !consentsDone} onClick={send} className={cn(brandBtn, "mt-3 w-full sm:w-auto")}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send my application</button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chat({ token, orgName, msgs, setMsgs, open, setOpen, unread, about }: {
  token: string; orgName: string; msgs: LoanMsg[]; setMsgs: (f: (m: LoanMsg[]) => LoanMsg[]) => void; open: boolean; setOpen: (b: boolean) => void; unread: number; about: string | null;
}) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "end" }); }, [open, msgs.length]);
  const send = () => start(async () => {
    setErr(null);
    const r = await sendClientMessage(token, text, about);
    if (!r.ok) { setErr(r.error); return; }
    setMsgs((m) => [...m, r.data]); setText("");
  });
  const shown = msgs.filter((m) => m.from_side !== "system");
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--portal-brand)] px-5 text-[0.9375rem] font-semibold text-white shadow-lg">
      <MessageCircle className="h-5 w-5" />Stuck? Ask us{unread > 0 && <span className="rounded-full bg-white px-1.5 text-[0.75rem] font-bold text-[color:var(--portal-brand-ink)]">{unread}</span>}
    </button>
  );
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex max-h-[75dvh] flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[380px] sm:rounded-2xl">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <MessageCircle className="h-5 w-5 text-[color:var(--portal-brand-ink)]" /><p className="flex-1 font-semibold">Message {orgName}</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {shown.length === 0 && <p className="text-[0.8125rem] text-ink-muted">Not sure what to put somewhere? Ask here — {orgName} can see where you&apos;re up to.</p>}
        {shown.map((m) => (
          <div key={m.id} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-[0.875rem]", m.from_side === "client" ? "ml-auto bg-[var(--portal-brand)] text-white" : "bg-canvas text-ink ring-1 ring-inset ring-line")}>
            {m.about && m.from_side === "client" && <p className="mb-0.5 text-[0.6875rem] opacity-80">About: {m.about}</p>}
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      {err && <p className="px-4 text-[0.8125rem] text-rose-700">{err}</p>}
      <div className="flex gap-2 border-t border-line p-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Type a message…" className={cn(box, "h-auto flex-1 resize-none py-2")}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && text.trim()) { e.preventDefault(); send(); } }} />
        <button type="button" disabled={pending || !text.trim()} onClick={send} className={cn(brandBtn, "h-auto px-3")} aria-label="Send">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
      </div>
    </div>
  );
}

function SignBlock({ token, applicant, who, locked, suggested, sig, onSigned, onFocus }: {
  token: string; applicant: number; who: string; locked: boolean; suggested: string;
  sig: { applicant: number; signed_name: string; image: string; signed_at: string } | null;
  onSigned: (s: { applicant: number; signed_name: string; image: string; signed_at: string } | null) => void; onFocus: () => void;
}) {
  const [name, setName] = useState(sig?.signed_name ?? suggested);
  const [png, setPng] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (sig) return (
    <div className="rounded-xl bg-canvas p-3 ring-1 ring-inset ring-line">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sig.image} alt={`Signature of ${sig.signed_name}`} className="h-16 w-auto dark:invert" />
      <p className="mt-1 text-[0.875rem] font-medium text-ink"><Check className="mr-1 inline h-4 w-4 text-emerald-600" />Signed by {sig.signed_name}</p>
      <p className="text-[0.75rem] text-ink-faint">{new Date(sig.signed_at).toLocaleString("en-AU", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
      {!locked && <button type="button" disabled={pending} onClick={() => start(async () => { const r = await clearSignature(token, applicant); if (r.ok) { onSigned(null); setPng(null); } else setErr(r.error); })} className="mt-1 text-[0.8125rem] text-ink-muted underline-offset-2 hover:text-ink hover:underline">Sign again</button>}
      {err && <p className="mt-1 text-[0.8125rem] text-rose-700">{err}</p>}
    </div>
  );
  return (
    <div className="space-y-2" onFocusCapture={onFocus} onPointerDownCapture={onFocus}>
      <p className="text-[0.875rem] font-medium text-ink">Sign below{who ? ` — ${who}` : ""}, with your finger, stylus or mouse</p>
      <SignaturePad onChange={setPng} disabled={locked} label={`Signature${who ? ` for ${who}` : ""}`} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor={`sig-name-${applicant}`} className={lab}>Full name</label>
          <input id={`sig-name-${applicant}`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" disabled={locked} className={box} />
        </div>
        <button type="button" disabled={locked || pending || !png || name.trim().length < 2} className={brandBtn}
          onClick={() => start(async () => {
            setErr(null);
            const r = await saveSignature(token, applicant, name, png!);
            if (!r.ok) { setErr(r.error); return; }
            onSigned({ applicant, signed_name: name.trim(), image: png!, signed_at: r.data.signed_at });
          })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save signature</button>
      </div>
      {err && <p className="text-[0.8125rem] text-rose-700">{err}</p>}
    </div>
  );
}

function OtherSigner({ name, signed, ticked, invite }: { name: string; signed: { signed_name: string; signed_at: string } | null; ticked: boolean; invite: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl p-3 ring-1 ring-inset ring-line">
      <p className="text-[0.9375rem] font-semibold">{name}</p>
      {signed ? <p className="text-[0.875rem] text-emerald-700 dark:text-emerald-400"><Check className="mr-1 inline h-4 w-4" />Signed by {signed.signed_name} · {new Date(signed.signed_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</p>
        : <p className="text-[0.875rem] text-ink-muted">{ticked ? "Consents ticked — " : ""}{name} signs for themselves from their own link. Nobody can sign on their behalf.</p>}
      {!signed && invite}
    </div>
  );
}

function InviteApplicant({ token, applicant, name, email: initialEmail, link, locked }: {
  token: string; applicant: number; name: string; email: string; locked: boolean;
  link: { email: string | null; sent_at: string | null; last_seen_at: string | null } | null;
}) {
  const [email, setEmail] = useState(link?.email ?? initialEmail);
  const [msg, setMsg] = useState<string | null>(link?.sent_at ? `Link sent to ${link.email}${link.last_seen_at ? ` · ${name} opened it ${new Date(link.last_seen_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : " · not opened yet"}` : null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (locked) return null;
  const go = (send: boolean) => start(async () => {
    setErr(null);
    const r = await sendApplicantLink(token, applicant, email, send);
    if (!r.ok) { setErr(r.error); return; }
    if (send) setMsg(`Link sent to ${r.data.sent}. ${name} can fill in their own details and sign.`);
    else { await navigator.clipboard.writeText(r.data.link).catch(() => null); setMsg(`${name}'s link is copied — paste it into a text to them. It's theirs only: don't use it yourself to sign.`); }
  });
  return (
    <div className="rounded-xl bg-canvas p-3 ring-1 ring-inset ring-line">
      <p className="text-[0.875rem] font-medium text-ink">Send {name} their own link</p>
      <p className="text-[0.75rem] text-ink-muted">You can fill in {name}&apos;s details here, or send them a link to do it themselves. Either way, {name} ticks their own consents and signs from their link.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`${name}'s email`} aria-label={`${name}'s email`} className={cn(box, "h-10 min-w-0 flex-1 basis-56")} />
        <button type="button" disabled={pending} onClick={() => go(true)} className={cn(brandBtn, "h-10 text-[0.875rem]")}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{link?.sent_at ? "Send again" : "Email link"}</button>
        <button type="button" disabled={pending} onClick={() => go(false)} className={cn(plainBtn, "h-10 text-[0.875rem]")}>Copy link</button>
      </div>
      {msg && <p className="mt-2 text-[0.75rem] text-ink-muted">{msg}</p>}
      {err && <p className="mt-2 text-[0.75rem] text-rose-700">{err}</p>}
    </div>
  );
}
