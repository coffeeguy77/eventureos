"use server";

import { cleanAnswers } from "@/lib/loans/form";
import {
  DOC_COLS, fileByToken, LOAN_BUCKET, MSG_COLS, REQ_COLS, safeName, scanGmail, serviceDb, shareFromGmail, storagePath,
  type DocRequest, type LoanDoc, type LoanMsg,
} from "@/lib/loans/server";

type R<T> = { ok: true; data: T } | { ok: false; error: string };
const run = async <T,>(fn: () => Promise<T>): Promise<R<T>> => {
  try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." }; }
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function open(token: string) {
  const db = serviceDb();
  const f = await fileByToken(db, token);
  if (!f) throw new Error("This link isn't active any more — contact your broker.");
  return { db, f };
}
const locked = (status: string) => !["invited", "in_progress"].includes(status);

/**
 * Autosave: the changed answers (merged into what's saved) and what they're looking at right now, so the broker can
 * watch and help. Returns broker messages since `since` so the page can show them without a reload.
 */
export async function saveAnswers(token: string, patch: Record<string, unknown>, focus: { step: string; field?: string; label?: string } | null, since: string | null): Promise<R<{ messages: LoanMsg[]; requests: DocRequest[]; status: string }>> {
  return run(async () => {
    const { db, f } = await open(token);
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { client_seen_at: now };
    if (focus) update.client_focus = { step: String(focus.step).slice(0, 40), field: focus.field ? String(focus.field).slice(0, 80) : null, label: focus.label ? String(focus.label).slice(0, 160) : null, at: now };
    if (patch && Object.keys(patch).length && !locked(f.status)) {
      const clean = cleanAnswers(patch, f.applicants);
      if (Object.keys(clean).length) {
        update.answers = { ...f.answers, ...clean };
        update.updated_at = now;
        if (f.status === "invited") update.status = "in_progress";
      }
    }
    await db.from("loan_files").update(update).eq("id", f.id);
    let mq = db.from("loan_messages").select(MSG_COLS).eq("file_id", f.id).in("from_side", ["broker", "system"]).order("created_at").limit(50);
    if (since) mq = mq.gt("created_at", since);
    const [{ data: msgs }, { data: reqs }] = await Promise.all([mq, db.from("loan_doc_requests").select(REQ_COLS).eq("file_id", f.id).order("position").order("created_at")]);
    // broker messages they've now seen
    const unread = (msgs ?? []).filter((m) => m.from_side === "broker" && !m.read_at).map((m) => m.id);
    if (unread.length) await db.from("loan_messages").update({ read_at: now }).in("id", unread);
    return { messages: (msgs ?? []) as LoanMsg[], requests: (reqs ?? []) as DocRequest[], status: (update.status as string) ?? f.status };
  });
}

export async function sendClientMessage(token: string, body: string, about: string | null): Promise<R<LoanMsg>> {
  return run(async () => {
    const { db, f } = await open(token);
    const text = String(body ?? "").trim().slice(0, 4000);
    if (!text) throw new Error("Type a message first.");
    const author = String(f.answers["a1.first_name"] ?? f.contact_name ?? "Client").slice(0, 160);
    const { data, error } = await db.from("loan_messages").insert({ organisation_id: f.organisation_id, file_id: f.id, from_side: "client", author, body: text, about: about ? String(about).slice(0, 200) : null }).select(MSG_COLS).single();
    if (error) throw new Error(`Couldn't send: ${error.message}`);
    return data as LoanMsg;
  });
}

/** A one-time upload link straight to private storage (big files don't go through our server). */
export async function startUpload(token: string, requestId: string | null, name: string, size: number): Promise<R<{ path: string; signedUrl: string; token: string }>> {
  return run(async () => {
    const { db, f } = await open(token);
    if (locked(f.status)) throw new Error("Your application has been sent — email any extra documents to your broker.");
    if (requestId && !UUID.test(requestId)) throw new Error("That document isn't on your list.");
    if (!(size > 0) || size > 25 * 1024 * 1024) throw new Error("Files can be up to 25 MB — try a smaller scan or photo.");
    const path = storagePath(f.organisation_id, f.id, name);
    const { data, error } = await db.storage.from(LOAN_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Couldn't start the upload: ${error?.message ?? "unknown"}`);
    return { path, signedUrl: data.signedUrl, token: data.token };
  });
}

export async function finishUpload(token: string, path: string, requestId: string | null, name: string, mime: string | null): Promise<R<LoanDoc>> {
  return run(async () => {
    const { db, f } = await open(token);
    if (!path.startsWith(`${f.organisation_id}/${f.id}/`) || path.includes("..")) throw new Error("That upload isn't for this application.");
    const dir = path.slice(0, path.lastIndexOf("/")), base = path.slice(path.lastIndexOf("/") + 1);
    const { data: list } = await db.storage.from(LOAN_BUCKET).list(dir, { search: base, limit: 1 });
    const obj = list?.find((o) => o.name === base);
    if (!obj) throw new Error("The file didn't arrive — please try again.");
    let req: string | null = null;
    if (requestId && UUID.test(requestId)) {
      const { data: r } = await db.from("loan_doc_requests").select("id").eq("id", requestId).eq("file_id", f.id).maybeSingle();
      req = r?.id ?? null;
    }
    const size = Number((obj.metadata as { size?: number } | null)?.size ?? 0) || null;
    const { data, error } = await db.from("loan_documents").insert({
      organisation_id: f.organisation_id, file_id: f.id, request_id: req, name: safeName(name), storage_path: path, mime: mime ? String(mime).slice(0, 120) : null, size_bytes: size, source: "upload",
    }).select(DOC_COLS).single();
    if (error) throw new Error(`Couldn't save the file: ${error.message}`);
    const now = new Date().toISOString();
    if (req) await db.from("loan_doc_requests").update({ status: "received", updated_at: now }).eq("id", req).in("status", ["needed", "redo"]);
    await db.from("loan_files").update({ updated_at: now, client_seen_at: now, ...(f.status === "invited" ? { status: "in_progress" } : {}) }).eq("id", f.id);
    return data as LoanDoc;
  });
}

/** Take back a file they uploaded (before they send the application). */
export async function removeUpload(token: string, docId: string): Promise<R<null>> {
  return run(async () => {
    const { db, f } = await open(token);
    if (locked(f.status)) throw new Error("Your application has been sent — ask your broker to remove it.");
    if (!UUID.test(docId)) throw new Error("Not found.");
    const { data: d } = await db.from("loan_documents").select("id, storage_path, request_id, source").eq("id", docId).eq("file_id", f.id).maybeSingle();
    if (!d || d.source === "xero") throw new Error("That file can't be removed here.");
    await db.storage.from(LOAN_BUCKET).remove([d.storage_path]);
    await db.from("loan_documents").delete().eq("id", d.id);
    if (d.request_id) {
      const { count } = await db.from("loan_documents").select("id", { count: "exact", head: true }).eq("request_id", d.request_id);
      if (!count) await db.from("loan_doc_requests").update({ status: "needed", updated_at: new Date().toISOString() }).eq("id", d.request_id).eq("status", "received");
    }
    return null;
  });
}

/** "This doesn't apply to me" (or undo). */
export async function markNotApplicable(token: string, requestId: string, na: boolean): Promise<R<null>> {
  return run(async () => {
    const { db, f } = await open(token);
    if (!UUID.test(requestId)) throw new Error("Not found.");
    const { data: r } = await db.from("loan_doc_requests").select("id, status").eq("id", requestId).eq("file_id", f.id).maybeSingle();
    if (!r) throw new Error("Not found.");
    if (na && !["needed", "redo"].includes(r.status)) return null;
    await db.from("loan_doc_requests").update({ status: na ? "not_applicable" : "needed", updated_at: new Date().toISOString() }).eq("id", r.id);
    return null;
  });
}

/** Their uploaded files, to view (short-lived link). */
export async function viewMyDoc(token: string, docId: string): Promise<R<string>> {
  return run(async () => {
    const { db, f } = await open(token);
    if (!UUID.test(docId)) throw new Error("Not found.");
    const { data: d } = await db.from("loan_documents").select("storage_path, name").eq("id", docId).eq("file_id", f.id).maybeSingle();
    if (!d) throw new Error("Not found.");
    const { data } = await db.storage.from(LOAN_BUCKET).createSignedUrl(d.storage_path, 120);
    if (!data) throw new Error("Couldn't open it.");
    return data.signedUrl;
  });
}

export async function rescanGmail(token: string, connId: string): Promise<R<number>> {
  return run(async () => {
    const { db, f } = await open(token);
    if (!UUID.test(connId)) throw new Error("Not found.");
    return (await scanGmail(db, f, connId)).length;
  });
}

export async function shareGmailFiles(token: string, connId: string, picks: { messageId: string; attachmentId: string }[]): Promise<R<number>> {
  return run(async () => {
    const { db, f } = await open(token);
    if (locked(f.status)) throw new Error("Your application has been sent — email any extra documents to your broker.");
    if (!UUID.test(connId)) throw new Error("Not found.");
    const n = await shareFromGmail(db, f, connId, Array.isArray(picks) ? picks : []);
    if (n) await db.from("loan_messages").insert({ organisation_id: f.organisation_id, file_id: f.id, from_side: "system", body: `${n} document${n === 1 ? "" : "s"} shared from Gmail.` });
    return n;
  });
}

/** Disconnect their Gmail: tokens and the list of emails found are deleted (documents they shared stay). */
export async function disconnectGmail(token: string, connId: string): Promise<R<null>> {
  return run(async () => {
    const { db, f } = await open(token);
    if (!UUID.test(connId)) throw new Error("Not found.");
    const { data: c } = await db.from("loan_credentials").select("access_token").eq("connection_id", connId).maybeSingle();
    if (c?.access_token) { const { revokeGoogleToken } = await import("@/lib/integrations/oauth"); await revokeGoogleToken(c.access_token as string); }
    await db.from("loan_credentials").delete().eq("connection_id", connId);
    await db.from("loan_connections").update({ status: "disconnected", data: {} }).eq("id", connId).eq("file_id", f.id);
    await db.from("loan_messages").insert({ organisation_id: f.organisation_id, file_id: f.id, from_side: "system", body: "Gmail disconnected." });
    return null;
  });
}

/** Send the application to the broker (they can still message; answers lock). */
export async function submitApplication(token: string, consentName: string): Promise<R<null>> {
  return run(async () => {
    const { db, f } = await open(token);
    if (locked(f.status)) return null;
    const name = String(consentName ?? "").trim().slice(0, 160);
    if (name.length < 2) throw new Error("Type your full name to confirm.");
    const { CONSENTS } = await import("@/lib/loans/form");
    const { data: org } = await db.from("organisations").select("settings").eq("id", f.organisation_id).single();
    const hasGuide = !!((org?.settings ?? {}) as { loans?: { credit_guide?: { path?: string } } }).loans?.credit_guide?.path;
    for (let a = 1; a <= f.applicants; a++) for (const c of CONSENTS) {
      if (c.key === "c_credit_guide" && !hasGuide) continue;
      if (f.answers[`a${a}.${c.key}`] !== "yes") throw new Error(`Please tick "${c.label}"${f.applicants > 1 ? ` for applicant ${a}` : ""}.`);
    }
    const now = new Date().toISOString();
    await db.from("loan_files").update({ status: "submitted", submitted_at: now, consent_name: name, consent_at: now, updated_at: now }).eq("id", f.id);
    await db.from("loan_messages").insert({ organisation_id: f.organisation_id, file_id: f.id, from_side: "system", body: `Application sent by ${name}.` });
    return null;
  });
}
