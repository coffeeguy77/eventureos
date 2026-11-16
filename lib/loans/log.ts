import "server-only";
import { headers } from "next/headers";
import { serviceDb } from "./server";

export type LogAction =
  | "signed_in" | "viewed_file" | "opened_document" | "downloaded_document" | "link_sent" | "opened_link"
  | "uploaded" | "signed" | "sent_application";

/** Record who did what on a loan file, with the time, IP and browser. Never fails the action it's recording. */
export async function logAccess(e: { orgId: string; fileId: string | null; kind: "broker" | "client" | "staff"; name?: string | null; email?: string | null; action: LogAction; detail?: string | null }) {
  try {
    const h = await headers();
    await serviceDb().from("loan_access_log").insert({
      organisation_id: e.orgId, file_id: e.fileId, actor_kind: e.kind, actor_name: e.name?.slice(0, 160) ?? null, actor_email: e.email?.slice(0, 254) ?? null,
      action: e.action, detail: e.detail?.slice(0, 400) ?? null,
      ip: (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim().slice(0, 80) || null, user_agent: (h.get("user-agent") ?? "").slice(0, 400) || null,
    });
  } catch { /* the log is best effort */ }
}

/** Log a repeat event at most once per window (page views, opening the link). */
export async function logOnce(window: number, e: Parameters<typeof logAccess>[0]) {
  try {
    let q = serviceDb().from("loan_access_log").select("id", { head: true, count: "exact" }).eq("organisation_id", e.orgId).eq("action", e.action).eq("actor_kind", e.kind).gt("at", new Date(Date.now() - window).toISOString());
    q = e.fileId ? q.eq("file_id", e.fileId) : q.is("file_id", null);
    if (e.email) q = q.eq("actor_email", e.email);
    const { count } = await q;
    if (count) return;
  } catch { /* fall through */ }
  await logAccess(e);
}
