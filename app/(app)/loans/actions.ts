"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { todayISO } from "@/lib/format";
import { defaultDocs } from "@/lib/loans/docs";
import {
  CONN_COLS, DOC_COLS, FILE_COLS, LOAN_BUCKET, MSG_COLS, newLoanToken, REQ_COLS, serviceDb,
  type DocRequest, type LoanConn, type LoanDoc, type LoanFileRow, type LoanMsg,
} from "@/lib/loans/server";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const run = async <T,>(fn: () => Promise<T>): Promise<R<T>> => {
  try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." }; }
};

async function desk() {
  const ctx = await requireOrg();
  if (ctx.role === "staff" || ctx.role === "customer") throw new Error("Only the office team can work on loan files.");
  return ctx;
}
async function own(fileId: string) {
  const ctx = await desk();
  if (!UUID.test(fileId)) throw new Error("That loan file link isn't valid.");
  const { data, error } = await ctx.supabase.from("loan_files").select(FILE_COLS).eq("id", fileId).eq("organisation_id", ctx.org.id).maybeSingle();
  if (error) throw new Error(/loan_files/.test(error.message) ? "Run the database update 0106_loans.sql first." : error.message);
  if (!data) throw new Error("That loan file doesn't exist, or you can't see it.");
  return { ...ctx, file: data as LoanFileRow };
}

export async function createLoanFile(i: { title: string; contact_name: string; contact_email: string; contact_phone: string; applicants: number; loan_type: string; amount: string }): Promise<R<{ id: string }>> {
  return run(async () => {
    const { supabase, org, user } = await desk();
    const name = String(i.contact_name ?? "").trim().slice(0, 160);
    const title = (String(i.title ?? "").trim() || (name ? `${name} — loan application` : "Loan application")).slice(0, 160);
    const email = String(i.contact_email ?? "").trim().toLowerCase().slice(0, 254);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That email address doesn't look right.");
    const { newForwardingAddress } = await import("@/lib/email/inbound");
    const amount = Number(String(i.amount ?? "").replace(/[^\d.]/g, ""));
    const { data: f, error } = await supabase.from("loan_files").insert({
      organisation_id: org.id, title, contact_name: name || null, contact_email: email || null, contact_phone: String(i.contact_phone ?? "").trim().slice(0, 40) || null,
      applicants: Math.min(4, Math.max(1, Math.round(Number(i.applicants) || 1))), loan_type: String(i.loan_type ?? "").trim().slice(0, 80) || null,
      amount: amount > 0 ? amount : null, token: newLoanToken(), inbound_address: newForwardingAddress(`loan-${(name || "client").split(/\s+/)[0]}`), created_by: user.id,
      answers: name ? { "a1.first_name": name.split(/\s+/)[0], "a1.last_name": name.split(/\s+/).slice(1).join(" "), ...(email ? { "a1.email": email } : {}) } : {},
    }).select("id, applicants").single();
    if (error) throw new Error(/loan_files/.test(error.message) ? "Run the database update 0106_loans.sql first." : `Couldn't create the file: ${error.message}`);
    const today = todayISO(org.timezone);
    const rows: Record<string, unknown>[] = [];
    let pos = 0;
    for (const d of defaultDocs(today)) {
      if (d.perApplicant) for (let a = 1; a <= f.applicants; a++) rows.push({ organisation_id: org.id, file_id: f.id, label: d.label, hint: d.hint ?? null, kind: d.kind, applicant: a, position: pos++ });
      else rows.push({ organisation_id: org.id, file_id: f.id, label: d.label, hint: d.hint ?? null, kind: d.kind, applicant: null, position: pos++ });
    }
    const { error: rErr } = await supabase.from("loan_doc_requests").insert(rows);
    if (rErr) throw new Error(`File made, but the document list didn't save: ${rErr.message}`);
    revalidatePath("/loans");
    return { id: f.id as string };
  });
}

export interface LiveFile {
  file: LoanFileRow; requests: DocRequest[]; documents: LoanDoc[]; messages: LoanMsg[];
  connections: Pick<LoanConn, "id" | "provider" | "account_label" | "status" | "last_pulled_at" | "error">[];
  xeroReports: { tenant: string; fy: string }[]; gmailFound: number;
}

/** Everything on the file, for the live view (polled every few seconds while it's open). */
export async function liveFile(fileId: string): Promise<R<LiveFile>> {
  return run(async () => {
    const { supabase, file } = await own(fileId);
    const [r, d, m, c] = await Promise.all([
      supabase.from("loan_doc_requests").select(REQ_COLS).eq("file_id", file.id).order("position").order("created_at"),
      supabase.from("loan_documents").select(DOC_COLS).eq("file_id", file.id).order("created_at"),
      supabase.from("loan_messages").select(MSG_COLS).eq("file_id", file.id).order("created_at").limit(300),
      supabase.from("loan_connections").select(CONN_COLS).eq("file_id", file.id).order("connected_at"),
    ]);
    const conns = (c.data ?? []) as LoanConn[];
    // client messages the broker has now seen
    const unread = ((m.data ?? []) as LoanMsg[]).filter((x) => x.from_side === "client" && !x.read_at).map((x) => x.id);
    if (unread.length) await supabase.from("loan_messages").update({ read_at: new Date().toISOString() }).in("id", unread);
    return {
      file, requests: (r.data ?? []) as DocRequest[], documents: (d.data ?? []) as LoanDoc[], messages: (m.data ?? []) as LoanMsg[],
      connections: conns.map(({ id, provider, account_label, status, last_pulled_at, error }) => ({ id, provider, account_label, status, last_pulled_at, error })),
      xeroReports: conns.filter((x) => x.provider === "xero").flatMap((x) => (((x.data ?? {}) as { reports?: { tenant: string; fy: string }[] }).reports ?? []).map((y) => ({ tenant: y.tenant, fy: y.fy }))),
      gmailFound: conns.filter((x) => x.provider === "gmail" && x.status === "connected").reduce((t, x) => t + ((((x.data ?? {}) as { found?: unknown[] }).found ?? []).length), 0),
    };
  });
}

export async function sendBrokerMessage(fileId: string, body: string, about: string | null): Promise<R<LoanMsg>> {
  return run(async () => {
    const { supabase, file, org, profile } = await own(fileId);
    const text = String(body ?? "").trim().slice(0, 4000);
    if (!text) throw new Error("Type a message first.");
    const { data, error } = await supabase.from("loan_messages").insert({ organisation_id: org.id, file_id: file.id, from_side: "broker", author: (profile?.full_name as string | undefined) ?? org.name, body: text, about: about?.slice(0, 200) ?? null }).select(MSG_COLS).single();
    if (error) throw new Error(`Couldn't send: ${error.message}`);
    return data as LoanMsg;
  });
}

export async function setRequest(fileId: string, requestId: string, patch: { status?: string; broker_note?: string | null; label?: string }): Promise<R<null>> {
  return run(async () => {
    const { supabase, file } = await own(fileId);
    if (!UUID.test(requestId)) throw new Error("Not found.");
    const u: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status && ["needed", "received", "accepted", "not_applicable", "redo"].includes(patch.status)) u.status = patch.status;
    if (patch.broker_note !== undefined) u.broker_note = patch.broker_note ? String(patch.broker_note).trim().slice(0, 1000) : null;
    if (patch.label !== undefined && String(patch.label).trim()) u.label = String(patch.label).trim().slice(0, 200);
    const { error } = await supabase.from("loan_doc_requests").update(u).eq("id", requestId).eq("file_id", file.id);
    if (error) throw new Error(error.message);
    return null;
  });
}

export async function addRequest(fileId: string, label: string, applicant: number | null, hint: string): Promise<R<null>> {
  return run(async () => {
    const { supabase, file, org } = await own(fileId);
    const l = String(label ?? "").trim().slice(0, 200);
    if (!l) throw new Error("What document do you need?");
    const { data: last } = await supabase.from("loan_doc_requests").select("position").eq("file_id", file.id).order("position", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("loan_doc_requests").insert({ organisation_id: org.id, file_id: file.id, label: l, hint: String(hint ?? "").trim().slice(0, 400) || null,
      applicant: applicant && applicant >= 1 && applicant <= file.applicants ? applicant : null, position: (last?.position ?? 0) + 1 });
    if (error) throw new Error(error.message);
    return null;
  });
}

export async function removeRequest(fileId: string, requestId: string): Promise<R<null>> {
  return run(async () => {
    const { supabase, file } = await own(fileId);
    if (!UUID.test(requestId)) throw new Error("Not found.");
    const { error } = await supabase.from("loan_doc_requests").delete().eq("id", requestId).eq("file_id", file.id);
    if (error) throw new Error(error.message);
    return null;
  });
}

export async function updateLoanFile(fileId: string, patch: { status?: string; title?: string; notes?: string; amount?: string; applicants?: number }): Promise<R<null>> {
  return run(async () => {
    const { supabase, file, org } = await own(fileId);
    const u: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status && ["invited", "in_progress", "submitted", "reviewing", "lodged", "approved", "settled", "closed"].includes(patch.status)) u.status = patch.status;
    if (patch.title !== undefined && patch.title.trim()) u.title = patch.title.trim().slice(0, 160);
    if (patch.notes !== undefined) u.notes = patch.notes.slice(0, 8000) || null;
    if (patch.amount !== undefined) { const a = Number(String(patch.amount).replace(/[^\d.]/g, "")); u.amount = a > 0 ? a : null; }
    if (patch.applicants !== undefined) {
      const n = Math.min(4, Math.max(1, Math.round(Number(patch.applicants) || 1)));
      if (n > file.applicants) {
        // add the per-applicant documents for the new applicants
        const { data: per } = await supabase.from("loan_doc_requests").select("label, hint, kind, position").eq("file_id", file.id).eq("applicant", 1);
        const rows = [];
        for (let a = file.applicants + 1; a <= n; a++) for (const p of per ?? []) rows.push({ organisation_id: org.id, file_id: file.id, label: p.label, hint: p.hint, kind: p.kind, applicant: a, position: p.position });
        if (rows.length) await supabase.from("loan_doc_requests").insert(rows);
      }
      u.applicants = n;
    }
    const { error } = await supabase.from("loan_files").update(u).eq("id", file.id);
    if (error) throw new Error(error.message);
    revalidatePath("/loans");
    return null;
  });
}

/** A short-lived link to open or download a document. */
export async function loanDocLink(fileId: string, docId: string): Promise<R<string>> {
  return run(async () => {
    const { file } = await own(fileId);
    if (!UUID.test(docId)) throw new Error("Not found.");
    const db = serviceDb();
    const { data: d } = await db.from("loan_documents").select("storage_path, name").eq("id", docId).eq("file_id", file.id).maybeSingle();
    if (!d) throw new Error("Not found.");
    const { data } = await db.storage.from(LOAN_BUCKET).createSignedUrl(d.storage_path, 300);
    if (!data) throw new Error("Couldn't open it.");
    return data.signedUrl;
  });
}

/** Email the client their link (from the business's Gmail when connected). */
export async function emailLoanLink(fileId: string, origin: string): Promise<R<string>> {
  return run(async () => {
    const { file, org } = await own(fileId);
    const to = file.contact_email ?? (file.answers["a1.email"] as string | undefined);
    if (!to) throw new Error("Add the client's email first.");
    const base = /^https:\/\/[a-z0-9.-]+$/i.test(origin) ? origin : (process.env.APP_URL?.trim() || "https://www.eventureos.com.au");
    const link = `${base}/apply/${file.token}`;
    const first = (file.contact_name ?? "").split(/\s+/)[0] || "there";
    const text = `Hi ${first},\n\nHere's your secure link to start your loan application with ${org.name}:\n${link}\n\nIt saves as you go, so you can stop and come back any time. Upload your documents there too — or connect Xero or Gmail and they're found for you. If you get stuck, message us from the page and we'll help.\n\nThanks,\n${org.name}`;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const html = `<p>Hi ${esc(first)},</p><p>Here's your secure link to start your loan application with ${esc(org.name)}:</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#6028EC;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Start my application</a></p><p>It saves as you go, so you can stop and come back any time. Upload your documents there too — or connect Xero or Gmail and they're found for you. If you get stuck, message us from the page and we'll help.</p><p>Thanks,<br>${esc(org.name)}</p>`;
    const { sendAsBusiness } = await import("@/lib/email/business-send");
    const r = await sendAsBusiness(serviceDb(), org.id, { to: [to], subject: `Your loan application with ${org.name}`, html, text });
    return `Sent to ${to}${r.via === "gmail" ? " from your Gmail" : ""}.`;
  });
}

// ---------------------------------------------------------------------------
// Settings: the broker's Credit Guide (PDF) and privacy statement, shown to clients before they send
// ---------------------------------------------------------------------------

export async function startCreditGuideUpload(name: string, size: number): Promise<R<{ path: string; token: string }>> {
  return run(async () => {
    const { org, role } = await desk();
    if (role !== "owner" && role !== "admin") throw new Error("Only owners and admins can change this.");
    if (!/\.pdf$/i.test(name)) throw new Error("Upload the Credit Guide as a PDF.");
    if (!(size > 0) || size > 20 * 1024 * 1024) throw new Error("The PDF can be up to 20 MB.");
    const path = `${org.id}/_settings/credit-guide-${Date.now()}.pdf`;
    const { data, error } = await serviceDb().storage.from(LOAN_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Couldn't start the upload: ${error?.message ?? "unknown"}`);
    return { path, token: data.token };
  });
}

export async function saveLoanSettings(i: { privacy?: string; credit_guide?: { path: string; name: string } | null }): Promise<R<null>> {
  return run(async () => {
    const { org, role } = await desk();
    if (role !== "owner" && role !== "admin") throw new Error("Only owners and admins can change this.");
    const db = serviceDb();
    const { data: o } = await db.from("organisations").select("settings").eq("id", org.id).single();
    const settings = (o?.settings ?? {}) as Record<string, unknown>;
    const loans = { ...((settings.loans ?? {}) as Record<string, unknown>) };
    if (i.privacy !== undefined) loans.privacy = String(i.privacy).trim().slice(0, 6000);
    if (i.credit_guide !== undefined) {
      if (i.credit_guide && !i.credit_guide.path.startsWith(`${org.id}/_settings/`)) throw new Error("That upload isn't yours.");
      const old = (loans.credit_guide as { path?: string } | undefined)?.path;
      if (old && old !== i.credit_guide?.path) await db.storage.from(LOAN_BUCKET).remove([old]);
      loans.credit_guide = i.credit_guide ? { path: i.credit_guide.path, name: String(i.credit_guide.name).slice(0, 160), at: new Date().toISOString() } : null;
    }
    const { error } = await db.from("organisations").update({ settings: { ...settings, loans } }).eq("id", org.id);
    if (error) throw new Error(error.message);
    revalidatePath("/loans/settings");
    return null;
  });
}
