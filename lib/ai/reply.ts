import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripQuoted, localDate } from "@/lib/ai/classify";
import { ANTHROPIC_URL, ANTHROPIC_VERSION, parseJSONObject } from "@/lib/ai/claude";
import { priceJob, serviceHours, suggestedStaff, type PackageRules, type PricedService } from "@/lib/pricing/engine";

/**
 * Draft a reply to an email conversation, in the business's own voice.
 *  - Voice: the business's past replies (outbound messages that answered an inbound one) are shown as examples.
 *  - Prices: the model only chooses a package and the job details it can read from the email;
 *    the numbers come from the pricing engine and the saved price list, never from the model.
 *  - Nothing is sent: the draft lands in the reply box for a person to edit and send.
 */

export const DEFAULT_REPLY_MODEL = "claude-sonnet-5";
export const replyModel = () => process.env.AI_REPLY_MODEL?.trim() || DEFAULT_REPLY_MODEL;

interface Msg { thread_id: string; direction: string; from_email: string; from_name: string | null; subject: string | null; body_text: string | null; sent_at: string }

const clip = (s: string | null | undefined, n: number) => {
  const t = stripQuoted(s ?? "").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};

async function callClaudeRaw(system: string, user: string, maxTokens: number, timeoutMs: number) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("AI drafting needs ANTHROPIC_API_KEY set in Vercel.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST", signal: ctrl.signal,
      headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
      body: JSON.stringify({ model: replyModel(), max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.find((c) => c.type === "text")?.text;
    if (!text) throw new Error("Anthropic API returned no text");
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("The AI took too long to reply — try again.");
    throw e;
  } finally { clearTimeout(timer); }
}

/** Past question → answer pairs from other conversations, most relevant first. */
async function examples(db: SupabaseClient, orgId: string, threadId: string, text: string, limit = 6) {
  const { data } = await db.from("email_messages").select("thread_id, direction, from_email, from_name, subject, body_text, sent_at")
    .eq("organisation_id", orgId).neq("thread_id", threadId).order("sent_at", { ascending: false }).limit(1500);
  const byThread = new Map<string, Msg[]>();
  for (const m of (data ?? []) as Msg[]) { const a = byThread.get(m.thread_id) ?? []; a.push(m); byThread.set(m.thread_id, a); }
  const words = new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []));
  const pairs: { q: Msg; a: Msg; score: number }[] = [];
  for (const msgs of byThread.values()) {
    msgs.sort((x, y) => x.sent_at.localeCompare(y.sent_at));
    for (let i = 1; i < msgs.length; i++) {
      if (msgs[i].direction !== "outbound" || msgs[i - 1].direction !== "inbound") continue;
      const a = clip(msgs[i].body_text, 1500);
      if (a.length < 40) continue;
      const q = msgs[i - 1];
      const qWords = (clip(q.body_text, 2000) + " " + (q.subject ?? "")).toLowerCase().match(/[a-z]{4,}/g) ?? [];
      const overlap = qWords.filter((w) => words.has(w)).length;
      pairs.push({ q, a: msgs[i], score: overlap + (Date.parse(msgs[i].sent_at) / 1e12) });
    }
  }
  return pairs.sort((x, y) => y.score - x.score).slice(0, limit);
}

export interface DraftResult { body: string; notes: string[]; priced: boolean }

export async function draftReply(db: SupabaseClient, org: { id: string; name: string; timezone: string; currency: string }, threadId: string, senderName: string): Promise<DraftResult> {
  const { data: thread } = await db.from("email_threads").select("id, subject, customer_id, enquiry_id, extracted")
    .eq("organisation_id", org.id).eq("id", threadId).maybeSingle();
  if (!thread) throw new Error("That conversation couldn't be found.");
  const [{ data: msgs }, { data: svc }, { data: pkgs }, cust] = await Promise.all([
    db.from("email_messages").select("thread_id, direction, from_email, from_name, subject, body_text, sent_at").eq("thread_id", threadId).order("sent_at"),
    db.from("services").select("id, code, name, description, unit, unit_price, tax_rate").eq("organisation_id", org.id).eq("active", true).order("position"),
    db.from("service_packages").select("id, name, summary, rules").eq("organisation_id", org.id).eq("active", true).order("position"),
    thread.customer_id
      ? db.from("customers").select("name, invoices(issue_date, total, reference, status)").eq("id", thread.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const conv = ((msgs ?? []) as Msg[]).slice(-8);
  if (!conv.length) throw new Error("This conversation has no messages to reply to yet.");
  const convoText = conv.map((m) => `--- ${m.direction === "inbound" ? `FROM ${m.from_name ?? m.from_email}` : `FROM US (${org.name})`} · ${localDate(m.sent_at, org.timezone)}\n${clip(m.body_text, 3000)}`).join("\n\n");
  const ex = await examples(db, org.id, threadId, convoText);

  const services = ((svc ?? []) as (PricedService & { unit_price: number | string; tax_rate: number | string })[]).map((s) => ({ ...s, unit_price: Number(s.unit_price), tax_rate: Number(s.tax_rate) }));
  const packages = (pkgs ?? []) as { id: string; name: string; summary: string | null; rules: PackageRules }[];
  const history = (cust.data as { name: string; invoices: { issue_date: string; total: number; reference: string | null; status: string }[] } | null);

  const system = `You write email replies for ${org.name}, an Australian event-services business, as ${senderName}.
Match the voice, length, greeting and sign-off of the business's past replies shown as EXAMPLES. Australian English. Warm, direct, no fluff.
Never invent prices, availability, or facts not given. If something needed for a quote is missing (date, service times, number of guests/coffees, indoor/outdoor, venue), ask for it briefly.
When the customer wants pricing and you know enough, choose ONE package and give the job details; the system will calculate the price and insert it where you put the token [[QUOTE]] on its own line. Do not write any dollar amounts yourself.
Packages available: ${packages.map((p) => `"${p.name}"${p.summary ? ` (${p.summary})` : ""}`).join(", ") || "none"}.
Reply with ONLY a JSON object:
{"reply":"the email body, plain text, with [[QUOTE]] where the price table goes (omit the token if not quoting)","quote":{"package":"exact package name","start":"HH:MM","end":"HH:MM","serves":number,"staff":number|null}|null,"notes":["short notes for the person sending, e.g. assumptions to check"]}`;

  const user = `TODAY: ${localDate(new Date().toISOString(), org.timezone)} (${org.timezone})
${history ? `CUSTOMER: ${history.name} — ${history.invoices?.length ?? 0} past invoices${history.invoices?.length ? `, most recent ${[...history.invoices].sort((a, b) => b.issue_date.localeCompare(a.issue_date))[0].issue_date}` : ""}. Treat them as a returning client.` : "CUSTOMER: new or unknown."}

EXAMPLES of how we reply (question → our answer):
${ex.map((p, i) => `#${i + 1} THEY WROTE:\n${clip(p.q.body_text, 800)}\nWE REPLIED:\n${clip(p.a.body_text, 1500)}`).join("\n\n") || "(no past replies available)"}

CONVERSATION TO ANSWER (oldest first; answer the latest message):
SUBJECT: ${thread.subject ?? ""}
${convoText}`;

  const raw = await callClaudeRaw(system, user, 1500, 45000);
  const obj = parseJSONObject(raw);
  let body = typeof obj.reply === "string" ? obj.reply.trim() : "";
  if (!body) throw new Error("The AI didn't return a draft — try again.");
  const notes = Array.isArray(obj.notes) ? obj.notes.filter((n): n is string => typeof n === "string").slice(0, 5) : [];
  let priced = false;

  const q = obj.quote as { package?: string; start?: string; end?: string; serves?: number; staff?: number | null } | null;
  const hhmm = (v?: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const pkg = q?.package ? packages.find((p) => p.name.toLowerCase() === q.package!.toLowerCase()) : null;
  const s = hhmm(q?.start), e = hhmm(q?.end);
  if (pkg && s != null && e != null && Number.isFinite(Number(q?.serves))) {
    const serves = Math.max(0, Math.round(Number(q!.serves)));
    const staff = q!.staff && q!.staff > 0 ? Math.round(q!.staff) : suggestedStaff(pkg.rules, serves, serviceHours(s, e));
    const r = priceJob(pkg.rules, services, { start_minutes: s, end_minutes: e, serves, staff_count: staff, include_delivery: true });
    const fmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: org.currency }).format(n);
    const table = [
      `${pkg.name} — ${q!.start}–${q!.end}, ${serves} serves`,
      ...r.lines.map((l) => `• ${l.name}${l.quantity !== 1 ? ` × ${l.quantity}${l.unit ? " " + l.unit + (l.quantity === 1 ? "" : "s") : ""}` : ""}: ${fmt(l.line_total)}${l.kind === "staff" && l.description ? ` (${l.description})` : ""}`),
      `Subtotal ${fmt(r.subtotal)} + GST ${fmt(r.tax_total)} = ${fmt(r.total)} inc GST`,
      ...r.notes.map((n) => `Tip: ${n}`),
    ].join("\n");
    body = body.includes("[[QUOTE]]") ? body.replace("[[QUOTE]]", table) : `${body}\n\n${table}`;
    priced = true;
    notes.unshift(`Priced from your price list: ${pkg.name}, ${q!.start}–${q!.end}, ${serves} serves, ${staff} staff. Check before sending.`);
  } else {
    body = body.replace(/\n?\[\[QUOTE\]\]\n?/g, "\n");
    if (q) notes.unshift("The AI suggested a quote but details were incomplete, so no prices were added.");
  }
  return { body, notes, priced };
}
