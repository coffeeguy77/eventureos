import { notFound } from "next/navigation";
import { brandVars } from "@/app/p/[slug]/portal-data";
import { todayISO } from "@/lib/format";
import { defaultPrivacy, lastTwoFYs } from "@/lib/loans/docs";
import { fileByToken, fileParts, serviceDb } from "@/lib/loans/server";
import type { FoundEmail } from "@/lib/loans/server";
import { ApplyClient } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your loan application", robots: { index: false, follow: false }, referrer: "no-referrer" };

const safeColour = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#6028EC");

export default async function ApplyPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ step?: string; error?: string; connected?: string; found?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const db = serviceDb();
  const file = await fileByToken(db, token);
  if (!file) notFound();
  const [{ data: org }, parts, sigRes] = await Promise.all([
    db.from("organisations").select("name, logo_url, brand_colour, contact_email, contact_phone, timezone, settings").eq("id", file.organisation_id).single(),
    fileParts(db, file.id),
    db.from("loan_signatures").select("applicant, signed_name, image, signed_at").eq("file_id", file.id).then((r) => r, () => ({ data: null })),
  ]);
  const { logOnce } = await import("@/lib/loans/log");
  await logOnce(30 * 60e3, { orgId: file.organisation_id, fileId: file.id, kind: "client", name: String(file.answers["a1.first_name"] ?? file.contact_name ?? "Client"), action: "opened_link" });
  if (!org) notFound();
  const today = todayISO(org.timezone ?? "Australia/Sydney");
  // what the client may see about their own connections: Gmail finds (theirs), Xero just names and years
  const connections = parts.connections.filter((c) => c.status === "connected" || c.provider === "xero").map((c) => ({
    id: c.id, provider: c.provider, label: c.account_label, status: c.status, last: c.last_pulled_at,
    found: c.provider === "gmail" && c.status === "connected" ? (((c.data ?? {}) as { found?: FoundEmail[] }).found ?? []).map((e) => ({ id: e.id, kind: e.kind, requestId: e.requestId, subject: e.subject, from: e.from, date: e.date, files: e.files.map((x) => ({ name: x.name, attachmentId: x.attachmentId, size: x.size })) })) : [],
    years: c.provider === "xero" ? [...new Set((((c.data ?? {}) as { reports?: { fy: string; tenant: string }[] }).reports ?? []).map((r) => `${r.tenant} ${r.fy}`))] : [],
  }));
  const ls = ((org.settings ?? {}) as { loans?: { privacy?: string; credit_guide?: { path?: string } } }).loans ?? {};
  const guide = ls.credit_guide?.path ? (await db.storage.from("loan-docs").createSignedUrl(ls.credit_guide.path, 60 * 60)).data?.signedUrl ?? null : null;
  const privacy = ls.privacy?.trim() || defaultPrivacy(org.name);
  return (
    <main style={brandVars(safeColour(org.brand_colour))} className="min-h-dvh bg-canvas text-ink">
      <div className="h-1 bg-[var(--portal-brand)]" />
      <ApplyClient
        token={token}
        org={{ name: org.name, logo: org.logo_url, email: org.contact_email, phone: org.contact_phone }}
        file={{ title: file.title, status: file.status, applicants: file.applicants, answers: file.answers, inbound: file.inbound_address, contactName: file.contact_name, submittedAt: file.submitted_at }}
        requests={parts.requests}
        documents={parts.documents.map((d) => ({ id: d.id, request_id: d.request_id, name: d.name, source: d.source, created_at: d.created_at }))}
        messages={parts.messages.filter((m) => m.from_side !== "system" || /connected|shared|added|sent/i.test(m.body))}
        connections={connections}
        fys={lastTwoFYs(today).map((f) => f.label)}
        legal={{ privacy, creditGuide: guide }}
        signatures={((sigRes.data ?? []) as { applicant: number; signed_name: string; image: string; signed_at: string }[])}
        flash={{ step: sp.step ?? null, error: sp.error ?? null, connected: sp.connected ?? null, found: sp.found ? Number(sp.found) : null }}
      />
    </main>
  );
}
