import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { billToDraft } from "@/lib/nerdherd/project-billing";
import { entryKey, readItems, readLinks, toProject, type ProjectLink } from "@/lib/nerdherd/projects";

/**
 * Nerd Herd → Projects: the dev chat (Claude Code, Cursor…) logs its work straight onto a project.
 *   GET  — the project as the client sees it, plus open requests from the client's people (so the chat knows what's asked)
 *   POST — add time entries (and optionally update where it's up to, next steps and documents); new billable time goes
 *          onto the project's draft invoice. Nothing is ever sent to the client.
 * Auth: "Authorization: Bearer nhp_…" — the project's key from its page in EventureOS (only a hash is stored).
 */
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

async function auth(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!/^nhp_[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const db = createServiceClient();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: key } = await db.from("nh_project_keys").select("project_id, organisation_id").eq("token_hash", hash).maybeSingle();
  if (!key) return null;
  const [{ data: row }, { data: org }] = await Promise.all([
    db.from("nh_projects").select("*").eq("id", key.project_id).eq("organisation_id", key.organisation_id).maybeSingle(),
    db.from("organisations").select("id, currency, timezone, settings").eq("id", key.organisation_id).maybeSingle(),
  ]);
  if (!row || !org) return null;
  await db.from("nh_project_keys").update({ last_used_at: new Date().toISOString() }).eq("project_id", key.project_id);
  return { db, org: org as { id: string; currency: string; timezone: string; settings: unknown }, p: toProject(row as Record<string, unknown>) };
}

export async function GET(req: Request) {
  const a = await auth(req);
  if (!a) return bad("That key isn't valid. Make a new one on the project's page in EventureOS.", 401);
  const { data: tk } = await a.db.from("support_tickets").select("number, subject, status, created_at").eq("project_id", a.p.id).not("status", "in", "(resolved,closed)").order("created_at").limit(100);
  const p = a.p;
  return NextResponse.json({
    ok: true,
    project: { name: p.name, status: p.status, status_note: p.status_note, summary: p.summary, phases: p.phases, open_items: p.open_items, links: p.links, docs_url: p.docs_url, docs: p.docs },
    open_requests: tk ?? [],
  });
}

export async function POST(req: Request) {
  const a = await auth(req);
  if (!a) return bad("That key isn't valid. Make a new one on the project's page in EventureOS.", 401);
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return bad("Send JSON."); }
  const { db, org, p } = a;

  // Time entries
  const raw = Array.isArray(body.entries) ? body.entries : [];
  if (raw.length > 50) return bad("Send at most 50 entries at a time.");
  const entries: Record<string, unknown>[] = [];
  for (const [i, x] of raw.entries()) {
    const o = (x ?? {}) as Record<string, unknown>;
    const date = String(o.date ?? ""), hours = Number(o.hours), work = typeof o.work === "string" ? o.work.trim().slice(0, 2000) : "";
    if (!ISO.test(date) || !(hours > 0 && hours <= 24) || !work) return bad(`Entry ${i + 1} needs date (YYYY-MM-DD), hours (more than 0, up to 24) and work.`);
    const to = typeof o.date_to === "string" && ISO.test(o.date_to) && o.date_to > date ? o.date_to : null;
    const t = (v: unknown) => (typeof v === "string" && TIME.test(v) ? v.padStart(5, "0") : null);
    entries.push({ organisation_id: org.id, project_id: p.id, work_date: date, start_time: t(o.start), end_time: t(o.end), hours: Math.round(hours * 100) / 100, work,
      kind: o.kind === "staff" ? "staff" : "ai", source: typeof o.source === "string" ? o.source.slice(0, 60) : "dev chat", billable: o.billable !== false, ...(to ? { work_date_to: to } : {}) });
  }
  const { data: have } = await db.from("nh_project_time").select("work_date, start_time, hours").eq("project_id", p.id);
  const seen = new Set(((have ?? []) as { work_date: string; start_time: string | null; hours: number }[]).map(entryKey));
  const fresh = entries.filter((e) => !seen.has(entryKey(e as { work_date: string; start_time: string | null; hours: number })));
  if (fresh.length) {
    const { error } = await db.from("nh_project_time").insert(fresh);
    if (error) return bad(`Couldn't save the time: ${error.message}`, 500);
  }

  // Where it's up to, next steps, documents and links
  const patch: Record<string, unknown> = {};
  if (typeof body.status_note === "string") patch.status_note = body.status_note.trim().slice(0, 500) || null;
  if (Array.isArray(body.open_items)) patch.open_items = readItems(body.open_items);
  else if (Array.isArray(body.add_open_items) || Array.isArray(body.done_items)) {
    const done = new Set(readItems(body.done_items).map((x) => x.toLowerCase()));
    patch.open_items = [...p.open_items.filter((x) => !done.has(x.toLowerCase())), ...readItems(body.add_open_items).filter((x) => !p.open_items.includes(x))].slice(0, 60);
  }
  const merge = (list: ProjectLink[], add: unknown) => { const m = new Map(list.map((l) => [l.url, l])); for (const l of readLinks(add)) m.set(l.url, l); return [...m.values()].slice(0, 60); };
  if (Array.isArray(body.docs)) patch.docs = merge(p.docs, body.docs);
  if (Array.isArray(body.links)) patch.links = merge(p.links, body.links);
  if (typeof body.docs_url === "string" && /^https:\/\/\S+$/.test(body.docs_url)) patch.docs_url = body.docs_url.slice(0, 500);
  patch.updated_at = new Date().toISOString();
  const { error: pErr } = await db.from("nh_projects").update(patch).eq("id", p.id);
  if (pErr) return bad(`Time saved, but the project details weren't: ${pErr.message}`, 500);

  // New billable time onto the draft invoice (never sent — you review and send it)
  let invoice: { number: string; created: boolean } | null = null;
  if (body.bill !== false && fresh.some((e) => e.billable)) {
    const r = await billToDraft(db, org, p.id, null).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    if (r && "error" in r) return bad(`Time saved, but it wasn't added to the draft invoice: ${r.error}`, 500);
    if (r) invoice = { number: r.number, created: r.created };
  }
  if (fresh.length) {
    const hrs = Math.round(fresh.reduce((x, e) => x + Number(e.hours), 0) * 100) / 100;
    await db.from("notifications").insert({ organisation_id: org.id, type: "project.time_logged", title: `Dev chat logged ${hrs} hrs on ${p.name}`,
      body: invoice ? `Added to draft ${invoice.number}` : "Not billed yet", link: `/nerd-herd/projects/${p.id}`, entity_type: "project", entity_id: p.id }).then(() => undefined, () => undefined);
  }
  return NextResponse.json({ ok: true, added: fresh.length, skipped: entries.length - fresh.length, invoice });
}
