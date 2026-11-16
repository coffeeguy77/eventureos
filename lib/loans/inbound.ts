import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resendApi, type ReceivedEmail } from "@/lib/email/resend-api";
import { FILE_COLS, saveDocument, type LoanFileRow } from "./server";

/** Words that say which document an attachment is (file name + subject). */
const KIND_WORDS: [string, RegExp][] = [
  ["licence", /licen[cs]e/], ["passport", /passport/], ["medicare", /medicare/], ["noa", /notice of assessment|\bnoa\b/],
  ["company_tax", /company (tax )?return/], ["tax_return", /tax return|\bitr\b/], ["payslip", /pay ?slip|pay advice/],
  ["financials", /profit|balance sheet|financial statement/], ["home_loan", /home loan|mortgage/], ["debt_statement", /credit card|car loan|personal loan/],
  ["rates", /rates/], ["rental", /rental|lease|tenancy/],
];

/** An email forwarded to a loan file's address: every attachment becomes a document on the file. */
export async function receiveLoanEmail(db: SupabaseClient, loan: { id: string; organisation_id: string }, e: ReceivedEmail): Promise<{ outcome: string; org?: string; detail?: string }> {
  const { data } = await db.from("loan_files").select(FILE_COLS).eq("id", loan.id).maybeSingle();
  const file = data as LoanFileRow | null;
  if (!file || file.status === "closed") return { outcome: "ignored", org: loan.organisation_id, detail: "loan file closed" };
  const atts = (e.attachments ?? []).slice(0, 20);
  const { data: reqs } = await db.from("loan_doc_requests").select("id, kind, status, applicant").eq("file_id", file.id).order("position");
  let saved = 0;
  for (const a of atts) {
    if ((a.size ?? 0) > 25 * 1024 * 1024) continue;
    const meta = await resendApi<{ download_url?: string; content_type?: string; filename?: string }>(`/emails/receiving/${encodeURIComponent(e.id)}/attachments/${encodeURIComponent(a.id)}`);
    if (!meta.download_url) continue;
    const res = await fetch(meta.download_url, { cache: "no-store" });
    if (!res.ok) continue;
    const bytes = Buffer.from(await res.arrayBuffer());
    const hay = `${a.filename} ${e.subject ?? ""}`.toLowerCase();
    const kind = KIND_WORDS.find(([, re]) => re.test(hay))?.[0];
    const req = kind ? (reqs ?? []).find((r) => r.kind === kind && (r.status === "needed" || r.status === "redo")) : undefined;
    await saveDocument(db, file, { name: a.filename || "attachment", bytes, mime: meta.content_type ?? a.content_type ?? null, requestId: req?.id ?? null, source: "email", detail: `${e.from} · ${e.subject ?? ""}`.slice(0, 400) });
    saved++;
  }
  await db.from("loan_messages").insert({ organisation_id: file.organisation_id, file_id: file.id, from_side: "system",
    body: saved ? `${saved} file${saved === 1 ? "" : "s"} emailed in: ${(e.subject ?? "").slice(0, 120)}` : `An email arrived with no attachments: ${(e.subject ?? "").slice(0, 120)}` });
  return { outcome: saved ? "loan-documents" : "loan-email", org: file.organisation_id, detail: `${saved} attachment(s)` };
}
