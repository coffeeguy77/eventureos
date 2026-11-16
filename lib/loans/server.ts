import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { expiresAt, refreshAccessToken } from "@/lib/integrations/oauth";
import type { GmailPart } from "@/lib/integrations/gmail";
import { GMAIL_SEARCH, lastTwoFYs } from "./docs";

export const LOAN_BUCKET = "loan-docs";
export const newLoanToken = () => randomBytes(24).toString("base64url");

export interface LoanFileRow {
  id: string; organisation_id: string; title: string; loan_type: string | null; amount: number | null; status: string; token: string;
  inbound_address: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  applicants: number; answers: Record<string, unknown>; client_focus: { step?: string; field?: string; label?: string; at?: string } | null;
  client_seen_at: string | null; consent_name: string | null; consent_at: string | null; submitted_at: string | null; notes: string | null;
  created_at: string; updated_at: string; customer_id: string | null;
}
export const FILE_COLS = "id, organisation_id, title, loan_type, amount, status, token, inbound_address, contact_name, contact_email, contact_phone, applicants, answers, client_focus, client_seen_at, consent_name, consent_at, submitted_at, notes, created_at, updated_at, customer_id";

export interface DocRequest { id: string; label: string; hint: string | null; applicant: number | null; kind: string | null; status: string; broker_note: string | null; position: number }
export interface LoanDoc { id: string; request_id: string | null; name: string; mime: string | null; size_bytes: number | null; source: string; source_detail: string | null; created_at: string }
export interface LoanMsg { id: string; from_side: string; author: string | null; body: string; about: string | null; read_at: string | null; created_at: string }
export interface LoanConn { id: string; provider: "xero" | "gmail"; account_label: string | null; status: string; data: Record<string, unknown>; error: string | null; connected_at: string; last_pulled_at: string | null }

export const REQ_COLS = "id, label, hint, applicant, kind, status, broker_note, position";
export const DOC_COLS = "id, request_id, name, mime, size_bytes, source, source_detail, created_at";
export const MSG_COLS = "id, from_side, author, body, about, read_at, created_at";
export const CONN_COLS = "id, provider, account_label, status, data, error, connected_at, last_pulled_at";

/** A client's link → their file (service client: the link is the key). */
export async function fileByToken(db: SupabaseClient, token: string): Promise<LoanFileRow | null> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const { data } = await db.from("loan_files").select(FILE_COLS).eq("token", token).maybeSingle();
  if (!data || data.status === "closed") return null;
  return data as LoanFileRow;
}

export async function fileParts(db: SupabaseClient, fileId: string) {
  const [r, d, m, c] = await Promise.all([
    db.from("loan_doc_requests").select(REQ_COLS).eq("file_id", fileId).order("position").order("created_at"),
    db.from("loan_documents").select(DOC_COLS).eq("file_id", fileId).order("created_at"),
    db.from("loan_messages").select(MSG_COLS).eq("file_id", fileId).order("created_at").limit(300),
    db.from("loan_connections").select(CONN_COLS).eq("file_id", fileId).order("connected_at"),
  ]);
  return {
    requests: (r.data ?? []) as DocRequest[], documents: (d.data ?? []) as LoanDoc[],
    messages: (m.data ?? []) as LoanMsg[], connections: (c.data ?? []) as LoanConn[],
  };
}

/** Applicant names from the answers ("Shaun", "Cara"), falling back to "Applicant 1". */
export function applicantNames(f: Pick<LoanFileRow, "applicants" | "answers">): string[] {
  return Array.from({ length: f.applicants }, (_, i) => String(f.answers[`a${i + 1}.first_name`] ?? "").trim() || `Applicant ${i + 1}`);
}

export const safeName = (n: string) => n.replace(/[^\w.\- ()]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
export const storagePath = (orgId: string, fileId: string, name: string) => `${orgId}/${fileId}/${Date.now()}-${randomBytes(3).toString("hex")}-${safeName(name)}`;

/** Store bytes as a document on the file (and tick its request off). */
export async function saveDocument(db: SupabaseClient, f: { id: string; organisation_id: string }, doc: {
  name: string; bytes: Uint8Array | Buffer; mime: string | null; requestId: string | null; source: "upload" | "email" | "gmail" | "xero" | "broker"; detail?: string | null;
}) {
  const path = storagePath(f.organisation_id, f.id, doc.name);
  const { error: upErr } = await db.storage.from(LOAN_BUCKET).upload(path, doc.bytes, { contentType: doc.mime ?? "application/octet-stream", upsert: false });
  if (upErr) throw new Error(`Couldn't store ${doc.name}: ${upErr.message}`);
  const { error } = await db.from("loan_documents").insert({
    organisation_id: f.organisation_id, file_id: f.id, request_id: doc.requestId, name: safeName(doc.name), storage_path: path,
    mime: doc.mime, size_bytes: doc.bytes.byteLength, source: doc.source, source_detail: doc.detail ?? null,
  });
  if (error) throw new Error(`Couldn't record ${doc.name}: ${error.message}`);
  if (doc.requestId) await db.from("loan_doc_requests").update({ status: "received", updated_at: new Date().toISOString() }).eq("id", doc.requestId).eq("file_id", f.id).in("status", ["needed", "redo"]);
  await db.from("loan_files").update({ updated_at: new Date().toISOString() }).eq("id", f.id);
}

// ------------------------------------------------------------------------------------------------
// The client's own Xero / Gmail (connected with their consent)
// ------------------------------------------------------------------------------------------------

/** Read-only scopes asked of the client — nothing more than the reports and their email. */
export const LOAN_SCOPES = {
  xero: ["offline_access", "accounting.reports.profitandloss.read", "accounting.reports.balancesheet.read"],
  gmail: ["https://www.googleapis.com/auth/gmail.readonly"],
};

async function accessToken(db: SupabaseClient, conn: { id: string; provider: "xero" | "gmail" }): Promise<string> {
  const { data: c } = await db.from("loan_credentials").select("access_token, refresh_token, expires_at").eq("connection_id", conn.id).maybeSingle();
  if (!c) throw new Error("This connection has been removed — connect again.");
  if (c.expires_at && new Date(c.expires_at).getTime() > Date.now() + 60_000) return c.access_token as string;
  if (!c.refresh_token) throw new Error("The connection has expired — connect again.");
  const t = await refreshAccessToken(conn.provider === "xero" ? "xero" : "gmail2", c.refresh_token as string);
  await db.from("loan_credentials").update({ access_token: t.access_token, refresh_token: t.refresh_token ?? c.refresh_token, expires_at: expiresAt(t), updated_at: new Date().toISOString() }).eq("connection_id", conn.id);
  return t.access_token;
}

// ---- Xero: profit and loss + balance sheet for the last two financial years, for each organisation they connected

interface XRow { RowType: string; Title?: string; Cells?: { Value?: string }[]; Rows?: XRow[] }
interface XReport { ReportName?: string; ReportTitles?: string[]; Rows?: XRow[] }
export interface FlatReport { name: string; titles: string[]; rows: { type: "header" | "section" | "row" | "total"; cells: string[] }[] }

function flatten(r: XReport): FlatReport {
  const rows: FlatReport["rows"] = [];
  const walk = (list: XRow[] = []) => {
    for (const x of list) {
      if (x.RowType === "Header") rows.push({ type: "header", cells: (x.Cells ?? []).map((c) => c.Value ?? "") });
      else if (x.RowType === "Section") { if (x.Title) rows.push({ type: "section", cells: [x.Title] }); walk(x.Rows); }
      else rows.push({ type: x.RowType === "SummaryRow" ? "total" : "row", cells: (x.Cells ?? []).map((c) => c.Value ?? "") });
    }
  };
  walk(r.Rows);
  return { name: r.ReportName ?? "Report", titles: r.ReportTitles ?? [], rows };
}

export function reportCsv(r: FlatReport) {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [...r.titles.map((t) => q(t)), "", ...r.rows.map((x) => x.cells.map(q).join(","))].join("\n");
}

export async function pullXero(db: SupabaseClient, file: LoanFileRow, connId: string, today: string) {
  const { data: conn } = await db.from("loan_connections").select("id, provider, data").eq("id", connId).eq("file_id", file.id).maybeSingle();
  if (!conn) throw new Error("That Xero connection isn't on this file.");
  const token = await accessToken(db, { id: conn.id, provider: "xero" });
  const tenants = (((conn.data ?? {}) as { tenants?: { id: string; name: string }[] }).tenants ?? []);
  const fys = lastTwoFYs(today);
  const { data: req } = await db.from("loan_doc_requests").select("id").eq("file_id", file.id).eq("kind", "financials").limit(1).maybeSingle();
  const reports: { tenant: string; fy: string; pl: FlatReport; bs: FlatReport }[] = [];
  for (const t of tenants) {
    for (const fy of fys) {
      const get = async (path: string) => {
        const res = await fetch(`https://api.xero.com/api.xro/2.0/Reports/${path}`, { headers: { authorization: `Bearer ${token}`, "xero-tenant-id": t.id, accept: "application/json" }, cache: "no-store" });
        if (!res.ok) throw new Error(`Xero ${path.split("?")[0]} for ${t.name}: ${res.status} ${(await res.text()).slice(0, 160)}`);
        return flatten(((await res.json()) as { Reports?: XReport[] }).Reports?.[0] ?? {});
      };
      const pl = await get(`ProfitAndLoss?fromDate=${fy.start}&toDate=${fy.end}`);
      const bs = await get(`BalanceSheet?date=${fy.end}`);
      reports.push({ tenant: t.name, fy: fy.label, pl, bs });
      for (const [kind, r] of [["Profit and loss", pl], ["Balance sheet", bs]] as const) {
        await saveDocument(db, file, { name: `${t.name} — ${kind} ${fy.label} (from Xero).csv`, bytes: Buffer.from(reportCsv(r), "utf8"), mime: "text/csv", requestId: req?.id ?? null, source: "xero", detail: t.name });
      }
    }
  }
  await db.from("loan_connections").update({ data: { ...(conn.data as object), reports }, last_pulled_at: new Date().toISOString(), status: "connected", error: null }).eq("id", conn.id);
  return reports.length;
}

// ---- Gmail: find likely documents (attachments) for the requests; the client chooses what to share

export interface FoundEmail { id: string; kind: string; requestId: string | null; subject: string; from: string; date: string; files: { name: string; attachmentId: string; size: number; mime: string }[] }

const hdr = (p: GmailPart | undefined, n: string) => p?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
function attachments(p: GmailPart | undefined, out: FoundEmail["files"] = []) {
  if (!p) return out;
  if (p.filename && p.body?.attachmentId && /pdf|image\/(jpe?g|png|heic)/i.test(p.mimeType ?? "")) out.push({ name: p.filename, attachmentId: p.body.attachmentId, size: p.body.size ?? 0, mime: p.mimeType ?? "application/octet-stream" });
  for (const c of p.parts ?? []) attachments(c, out);
  return out;
}

export async function scanGmail(db: SupabaseClient, file: LoanFileRow, connId: string) {
  const { data: conn } = await db.from("loan_connections").select("id, data").eq("id", connId).eq("file_id", file.id).maybeSingle();
  if (!conn) throw new Error("That Gmail connection isn't on this file.");
  const token = await accessToken(db, { id: conn.id, provider: "gmail" });
  const { data: reqs } = await db.from("loan_doc_requests").select("id, kind, status").eq("file_id", file.id);
  const g = async <T,>(url: string) => {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${url}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`Gmail ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return (await res.json()) as T;
  };
  const found: FoundEmail[] = [];
  const seen = new Set<string>();
  for (const [kind, words] of Object.entries(GMAIL_SEARCH)) {
    const req = (reqs ?? []).find((r) => r.kind === kind);
    if (!req) continue;
    const list = await g<{ messages?: { id: string }[] }>(`messages?maxResults=6&q=${encodeURIComponent(`has:attachment newer_than:2y ${words}`)}`);
    for (const m of list.messages ?? []) {
      if (seen.has(m.id)) continue; seen.add(m.id);
      const msg = await g<{ id: string; payload?: GmailPart }>(`messages/${m.id}?format=full&fields=id,payload(headers,mimeType,filename,body/attachmentId,body/size,parts(mimeType,filename,body/attachmentId,body/size,parts(mimeType,filename,body/attachmentId,body/size,parts(mimeType,filename,body/attachmentId,body/size))))`);
      const files = attachments(msg.payload);
      if (!files.length) continue;
      found.push({ id: msg.id, kind, requestId: req.id as string, subject: hdr(msg.payload, "subject").slice(0, 200), from: hdr(msg.payload, "from").slice(0, 200), date: hdr(msg.payload, "date").slice(0, 60), files: files.slice(0, 6) });
    }
  }
  await db.from("loan_connections").update({ data: { ...(conn.data as object), found, scanned_at: new Date().toISOString() }, last_pulled_at: new Date().toISOString(), error: null }).eq("id", conn.id);
  return found;
}

/** Copy the attachments the client ticked into their file. */
export async function shareFromGmail(db: SupabaseClient, file: LoanFileRow, connId: string, picks: { messageId: string; attachmentId: string }[]) {
  const { data: conn } = await db.from("loan_connections").select("id, data, account_label").eq("id", connId).eq("file_id", file.id).maybeSingle();
  if (!conn) throw new Error("That Gmail connection isn't on this file.");
  const found = (((conn.data ?? {}) as { found?: FoundEmail[] }).found ?? []);
  const token = await accessToken(db, { id: conn.id, provider: "gmail" });
  let n = 0;
  for (const p of picks.slice(0, 40)) {
    const e = found.find((x) => x.id === p.messageId); const a = e?.files.find((x) => x.attachmentId === p.attachmentId);
    if (!e || !a) continue;
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${e.id}/attachments/${encodeURIComponent(a.attachmentId)}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`Couldn't download ${a.name} from Gmail (${res.status}).`);
    const j = (await res.json()) as { data?: string };
    const bytes = Buffer.from((j.data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
    await saveDocument(db, file, { name: a.name, bytes, mime: a.mime, requestId: e.requestId, source: "gmail", detail: e.subject });
    n++;
  }
  return n;
}

export function serviceDb() { return createServiceClient(); }
