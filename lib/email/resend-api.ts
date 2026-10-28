import "server-only";

/**
 * Resend's management API (domains, webhooks, received emails) — server only, with RESEND_API_KEY.
 * Docs: https://resend.com/docs/api-reference (domains: create/get/update/verify; webhooks: list/update/create;
 * emails/receiving/{id}). Fails loudly with Resend's own message.
 */
const BASE = "https://api.resend.com";

export class ResendError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function resendApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new ResendError("Email isn't set up — RESEND_API_KEY is missing in Vercel.", 503);
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text) as { message?: string }; if (j.message) msg = j.message; } catch { /* keep text */ }
    if (res.status === 401 || res.status === 403) msg = `${msg} (the Resend API key may be "sending only" — it needs full access to manage domains and webhooks)`;
    throw new ResendError(`Resend ${res.status}: ${msg}`, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface ResendRecord { record: string; name: string; type: string; value: string; status: string; ttl?: string | number; priority?: number }
export interface ResendDomain {
  id: string; name: string; status: string; region?: string; records?: ResendRecord[];
  capabilities?: { sending?: "enabled" | "disabled"; receiving?: "enabled" | "disabled" };
}

export const listDomains = () => resendApi<{ data: ResendDomain[] }>("/domains").then((r) => r.data ?? []);
export const getDomain = (id: string) => resendApi<ResendDomain>(`/domains/${encodeURIComponent(id)}`);
export const verifyDomain = (id: string) => resendApi<{ id: string }>(`/domains/${encodeURIComponent(id)}/verify`, { method: "POST" });
export const createDomain = (name: string, opts: { receiving?: boolean; region?: string } = {}) =>
  resendApi<ResendDomain>("/domains", { method: "POST", body: { name, ...(opts.region ? { region: opts.region } : {}), capabilities: { sending: "enabled", receiving: opts.receiving ? "enabled" : "disabled" } } });
export const updateDomain = (id: string, body: Record<string, unknown>) => resendApi<{ id: string }>(`/domains/${encodeURIComponent(id)}`, { method: "PATCH", body });
export const deleteDomain = (id: string) => resendApi<{ id: string }>(`/domains/${encodeURIComponent(id)}`, { method: "DELETE" });

export interface ResendWebhook { id: string; endpoint: string; events: string[]; status?: string; signing_secret?: string }
export const listWebhooks = () => resendApi<{ data: ResendWebhook[] }>("/webhooks").then((r) => r.data ?? []);
export const updateWebhook = (id: string, body: { endpoint?: string; events?: string[]; status?: string }) => resendApi<{ id: string }>(`/webhooks/${encodeURIComponent(id)}`, { method: "PATCH", body });
export const createWebhook = (endpoint: string, events: string[]) => resendApi<ResendWebhook>("/webhooks", { method: "POST", body: { endpoint, events } });

export interface ReceivedEmail {
  id: string; from: string; to: string[]; cc?: string[]; bcc?: string[]; reply_to?: string[]; subject: string | null;
  html: string | null; text: string | null; headers?: Record<string, string | string[]>; message_id?: string | null; created_at: string;
  received_for?: string[]; attachments?: { id: string; filename: string; content_type?: string; size?: number }[];
  authentication?: { spf?: string; dkim?: string; dmarc?: string } | null;
}
export const getReceivedEmail = (id: string) => resendApi<ReceivedEmail>(`/emails/receiving/${encodeURIComponent(id)}`);
