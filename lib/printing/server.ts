import "server-only";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { publicOrg } from "@/lib/bookings/server";
import { cleanItems, priceJob, readPrinting } from "./core";

/**
 * Printing (public side): a customer sends their print job and uploads artwork straight into private storage
 * (one-time signed upload links), then the files are recorded on the job and the business is told.
 */
const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const safeName = (n: string) => n.replace(/[^\w.() -]+/g, "_").replace(/\s+/g, " ").trim().slice(-120) || "artwork";
export const ARTWORK = /\.(pdf|ai|eps|svg|png|jpe?g|tiff?|psd|zip|cdr|indd|webp|gif)$/i;
const MAX_FILE = 200 * 1024 * 1024;

export async function printingOrg(slug: string) {
  const org = await publicOrg(slug).catch(() => null);
  if (!org) return null;
  const p = readPrinting(org.rawSettings);
  return p.enabled ? { org, p } : null;
}

export interface StartInput {
  slug: string; name: string; email: string; phone: string; company?: string | null; details?: string | null; neededBy?: string | null;
  items?: unknown; cut?: boolean; files: { name: string; size: number; type?: string }[]; website?: string; t?: number;
}

export async function startPrintJob(i: StartInput) {
  if (i.website) return { ok: true as const, jobId: "", token: "", uploads: [] };
  if (i.t && Date.now() - Number(i.t) < 3000) throw new Error("Please check your details, then send again.");
  const po = await printingOrg(i.slug);
  if (!po) throw new Error("Online print orders aren't available right now — please contact us.");
  const name = str(i.name, 120), email = str(i.email, 200).toLowerCase(), phone = str(i.phone, 40);
  if (name.length < 2) throw new Error("Please add your name.");
  if (!EMAIL.test(email)) throw new Error("Please check your email address.");
  const files = (Array.isArray(i.files) ? i.files : []).slice(0, 20);
  for (const f of files) {
    if (!ARTWORK.test(String(f.name ?? ""))) throw new Error(`${f.name}: please send PDF, AI, EPS, SVG, PNG, JPG, TIFF, PSD or ZIP files.`);
    if (!(Number(f.size) > 0) || Number(f.size) > MAX_FILE) throw new Error(`${f.name} is over 200 MB — please send a smaller file or a link.`);
  }
  const db = createServiceClient();
  const { org, p } = po;
  // one online job per email every two minutes (double clicks, bots)
  const { count } = await db.from("print_jobs").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).ilike("contact_email", email.replace(/[%_]/g, "")).gte("created_at", new Date(Date.now() - 120_000).toISOString());
  if ((count ?? 0) > 0) throw new Error("We've just received a job from you — check your email, or contact us.");
  const items = cleanItems(i.items).map((x) => { const y = { ...x }; delete y.rate; return y; }); // customers never set their own price
  const price = priceJob({ items, setup: true, cut: i.cut === true }, p);
  const { data: cust } = await db.from("customers").select("id").eq("organisation_id", org.id).ilike("email", email).limit(1).maybeSingle();
  const neededBy = i.neededBy && /^\d{4}-\d{2}-\d{2}$/.test(i.neededBy) ? i.neededBy : null;
  const { data: job, error } = await db.from("print_jobs").insert({
    organisation_id: org.id, customer_id: cust?.id ?? null, contact_name: name, contact_email: email, contact_phone: phone || null, company: str(i.company, 160) || null,
    title: (items[0]?.description || str(i.details, 60) || "Print job").slice(0, 120), details: str(i.details, 4000) || null, items, setup: true, cut: i.cut === true,
    price_ex_gst: price.exGst, gst: price.gst, total: price.total, needed_by: neededBy, source: "online", created_by: null,
  }).select("id, number, upload_token").single();
  if (error) throw new Error(/print_jobs/.test(error.message) ? "Online print orders aren't available right now — please contact us." : error.message);
  const uploads = [];
  for (const f of files) {
    const path = `${org.id}/${job.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName(f.name)}`;
    const { data: s, error: e } = await db.storage.from("print-artwork").createSignedUploadUrl(path);
    if (e || !s) throw new Error("Couldn't get the upload ready — please try again.");
    uploads.push({ name: f.name, path, token: s.token });
  }
  return { ok: true as const, jobId: job.id as string, number: job.number as string, token: job.upload_token as string, uploads };
}

/** After the browser has uploaded: record the files that actually arrived, and tell the business. */
export async function finishPrintJob(jobId: string, token: string, files: { name: string; path: string; size: number; type?: string }[]) {
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[0-9a-f]{32}$/.test(token)) throw new Error("Something went wrong — please contact us.");
  const db = createServiceClient();
  const { data: job } = await db.from("print_jobs").select("id, organisation_id, number, contact_name, contact_email, contact_phone, company, details, total, upload_token, created_at").eq("id", jobId).maybeSingle();
  if (!job || job.upload_token !== token || Date.now() - Date.parse(job.created_at as string) > 90 * 86_400_000) throw new Error("This upload link has expired — please contact us.");
  const { data: listed } = await db.storage.from("print-artwork").list(`${job.organisation_id}/${job.id}`, { limit: 100 });
  const there = new Map(((listed ?? []) as { name: string; metadata?: { size?: number; mimetype?: string } }[]).map((o) => [o.name, o]));
  const rows = (Array.isArray(files) ? files : []).slice(0, 20).flatMap((f) => {
    const p = String(f.path ?? "");
    const base = p.split("/").pop() ?? "";
    if (!p.startsWith(`${job.organisation_id}/${job.id}/`) || !there.has(base)) return [];
    const o = there.get(base)!;
    return [{ organisation_id: job.organisation_id, job_id: job.id, name: str(f.name, 200) || base, path: p, size: o.metadata?.size ?? Number(f.size) ?? null, content_type: o.metadata?.mimetype ?? f.type ?? null, uploaded_by: "customer" }];
  });
  if (rows.length) await db.from("print_files").insert(rows);
  const { data: org } = await db.from("organisations").select("name, logo_url, brand_colour, contact_email").eq("id", job.organisation_id).single();
  await db.from("notifications").insert({
    organisation_id: job.organisation_id, type: "printing.new", title: `New print job ${job.number} — ${job.company ?? job.contact_name}`.slice(0, 200),
    body: `${rows.length} artwork file${rows.length === 1 ? "" : "s"}`, link: `/printing/${job.id}`, entity_type: "print_job", entity_id: job.id,
  }).then(() => undefined, () => undefined);
  if (org?.contact_email) {
    try {
      const { emailConfigured, sendEmail } = await import("@/lib/email/send");
      const { officeAlertEmail } = await import("@/lib/bookings/emails");
      if (emailConfigured()) {
        const m = officeAlertEmail({ businessName: org.name, logoUrl: org.logo_url, brand: org.brand_colour }, {
          heading: `New print job ${job.number}`,
          lines: [
            { label: "Customer", value: `${job.company ? `${job.company} — ` : ""}${job.contact_name}` },
            { label: "Contact", value: [job.contact_email, job.contact_phone].filter(Boolean).join(" · ") },
            { label: "Artwork", value: rows.length ? rows.map((r) => r.name).join(", ") : "No files yet" },
            ...(job.details ? [{ label: "Details", value: String(job.details).slice(0, 500) }] : []),
          ],
          url: `${appBaseUrl()}/printing/${job.id}`,
        });
        await sendEmail({ to: org.contact_email, ...m, replyTo: job.contact_email as string, fromName: "EventureOS" });
      }
    } catch (e) { console.error("print alert", e); }
  }
  return { ok: true as const, number: job.number as string, files: rows.length };
}

/** The customer's own job page (/hire/<business>/printing/job/<id>?t=…): the quote, approving it, sending more artwork. */
export async function jobForCustomer(jobId: string, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[0-9a-f]{32}$/.test(token)) return null;
  const db = createServiceClient();
  const { data: job } = await db.from("print_jobs").select("id, organisation_id, number, title, status, items, setup, cut, extras, price_ex_gst, gst, total, needed_by, contact_name, upload_token, quote_sent_at").eq("id", jobId).maybeSingle();
  if (!job || job.upload_token !== token) return null;
  const { data: files } = await db.from("print_files").select("name, size, created_at, uploaded_by").eq("job_id", job.id).order("created_at");
  return { job, files: files ?? [] };
}

/** More artwork for an existing job: one-time upload links (after checking the job's link). */
export async function moreArtwork(jobId: string, token: string, files: { name: string; size: number }[]) {
  const j = await jobForCustomer(jobId, token);
  if (!j || ["done", "cancelled"].includes(j.job.status as string)) throw new Error("This job can't take more files — please contact us.");
  const db = createServiceClient();
  const uploads = [];
  for (const f of (Array.isArray(files) ? files : []).slice(0, 20)) {
    if (!ARTWORK.test(String(f.name ?? ""))) throw new Error(`${f.name}: please send PDF, AI, EPS, SVG, PNG, JPG, TIFF, PSD or ZIP files.`);
    if (!(Number(f.size) > 0) || Number(f.size) > MAX_FILE) throw new Error(`${f.name} is over 200 MB.`);
    const path = `${j.job.organisation_id}/${j.job.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName(f.name)}`;
    const { data: s, error } = await db.storage.from("print-artwork").createSignedUploadUrl(path);
    if (error || !s) throw new Error("Couldn't get the upload ready — please try again.");
    uploads.push({ name: f.name, path, token: s.token });
  }
  return { ok: true as const, uploads };
}

/** The customer approves the quote. */
export async function approvePrintQuote(jobId: string, token: string) {
  const j = await jobForCustomer(jobId, token);
  if (!j) throw new Error("This link isn't valid — please contact us.");
  if (!["new", "quoted"].includes(j.job.status as string)) return { ok: true as const, already: true };
  const db = createServiceClient();
  await db.from("print_jobs").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", j.job.id);
  await db.from("notifications").insert({ organisation_id: j.job.organisation_id, type: "printing.approved", title: `Print job ${j.job.number} approved by ${j.job.contact_name ?? "the customer"}`.slice(0, 200), link: `/printing/${j.job.id}`, entity_type: "print_job", entity_id: j.job.id }).then(() => undefined, () => undefined);
  return { ok: true as const, already: false };
}
