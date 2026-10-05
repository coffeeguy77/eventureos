"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award, Loader2 } from "lucide-react";
import { issueManualCertificate, renameCertificate, setCertificateStatus } from "@/app/(app)/bookings/certificate-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";

const fail = { ok: false as const, error: "Couldn't reach the server." };

export function CertificateRow({ c, orgSlug }: { c: { id: string; number: string; person_name: string; course_name: string; date: string; status: string; verify_token: string }; orgSlug: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(c.person_name);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<{ ok: true; data: string } | { ok: false; error: string }>) => start(async () => { const r = await fn().catch(() => fail); setMsg(r.ok ? r.data : r.error); if (r.ok) { setEdit(false); router.refresh(); } });
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3", c.status === "revoked" && "opacity-60")}>
      <span className="w-20 shrink-0 font-mono text-[0.78rem] text-ink-faint">{c.number}</span>
      <span className="min-w-0 flex-1">
        {edit ? (
          <span className="flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 py-1" /><Button size="sm" variant="primary" disabled={pending} onClick={() => go(() => renameCertificate(c.id, name))}>Save</Button><Button size="sm" onClick={() => setEdit(false)}>Cancel</Button></span>
        ) : <span className="block truncate text-[0.875rem] font-medium text-ink">{c.person_name}</span>}
        <span className="block text-[0.78rem] text-ink-muted">{c.course_name} · {c.date}</span>
      </span>
      {c.status === "revoked" && <Badge tone="red">Withdrawn</Badge>}
      <span className="flex items-center gap-1 text-[0.75rem] font-medium">
        <a href={`/api/book/certificate/${c.verify_token}`} target="_blank" rel="noopener noreferrer" className="rounded px-2 py-1 text-brand-700 hover:bg-brand-50">PDF</a>
        <a href={`/book/${orgSlug}/certificate/${c.verify_token}`} target="_blank" rel="noopener noreferrer" className="rounded px-2 py-1 text-ink-muted hover:bg-zinc-100">View</a>
        {!edit && <button type="button" onClick={() => setEdit(true)} className="rounded px-2 py-1 text-ink-muted hover:bg-zinc-100">Fix name</button>}
        <button type="button" disabled={pending} onClick={() => go(() => setCertificateStatus(c.id, c.status === "revoked" ? "issued" : "revoked"))} className="rounded px-2 py-1 text-ink-muted hover:bg-zinc-100">{c.status === "revoked" ? "Restore" : "Withdraw"}</button>
      </span>
      {msg && <span className="w-full text-[0.72rem] text-ink-muted">{msg}</span>}
    </div>
  );
}

export function ManualCertificate({ courses, student }: { courses: { id: string; name: string }[]; student: { id: string; name: string; email: string | null; note: string | null } | null }) {
  const router = useRouter();
  const [f, setF] = useState({ name: student?.name ?? "", courseId: courses[0]?.id ?? "", date: "", email: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      {student ? (
        <div className="mb-2"><p className="text-[0.875rem] font-semibold text-ink">{student.name} <span className="font-normal text-ink-muted">{student.email}</span></p>{student.note && <p className="text-[0.78rem] text-amber-800">{student.note}</p>}</div>
      ) : <p className="mb-2 flex items-center gap-2 text-[0.875rem] font-semibold text-ink"><Award className="h-4 w-4" />Issue a certificate</p>}
      <div className={cn("grid gap-2", student ? "sm:grid-cols-[1fr_1fr_150px_auto]" : "")}>
        <div><Label>Name on certificate</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label>Course</Label><Select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        {!student && <div><Label hint="so it shows in their account">Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>}
        <div><Label>Date done</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="flex items-end"><Button variant="primary" className="w-full" disabled={pending || !f.name.trim() || !f.date} onClick={() => start(async () => {
          const r = await issueManualCertificate({ studentId: student?.id ?? null, name: f.name, courseId: f.courseId, date: f.date, email: f.email }).catch(() => fail);
          setMsg(r.ok ? { ok: true, text: "Issued — they can download it from their account." } : { ok: false, text: r.error });
          if (r.ok) { if (!student) setF({ ...f, name: "", date: "", email: "" }); router.refresh(); }
        })}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Issue</Button></div>
      </div>
      {!student && <p className="mt-2 text-[0.72rem] text-ink-faint">For someone who did a course before bookings were in EventureOS. With their email, it appears in their account when they sign in.</p>}
      {msg && <p className={cn("mt-2 text-[0.78rem] font-medium", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</p>}
    </div>
  );
}
