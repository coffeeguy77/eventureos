import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/integrations/runtime";
import type { ApptKind } from "@/lib/appointments/core";
import { loadOrg, whenText } from "@/lib/appointments/server";
import { appBaseUrl } from "@/lib/integrations/registry";
import { ManageMeeting } from "@/components/meet/manage-meeting";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your meeting", robots: { index: false } };

const longWhen = whenText;

/** The client's private link for one meeting. */
export default async function ManagePage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  if (!/^[0-9a-f]{40,80}$/i.test(token)) notFound();
  const db = createServiceClient();
  const org = await loadOrg(db, { slug });
  if (!org) notFound();
  const { data: a } = await db.from("appointments").select("title, kind, starts_at, ends_at, status, location, meeting_url, client_email, proposed_starts_at, proposed_ends_at, source").eq("token", token).eq("organisation_id", org.id).maybeSingle();
  if (!a) notFound();
  const kind = a.kind as ApptKind;
  const how = kind === "in_person" ? `In person${a.location ? ` — ${a.location}` : ""}` : kind === "phone" ? "Phone call — we'll call you" : a.meeting_url ? `Video call — ${a.meeting_url}` : "Video call — we'll send the link";
  const accent = /^#[0-9a-f]{6}$/i.test(org.brand_colour ?? "") ? org.brand_colour! : "#6028EC";
  return (
    <ManageMeeting slug={org.slug} token={token} business={org.name} accent={accent} title={a.title as string} kind={kind} how={how} status={a.status as string}
      when={longWhen(a.starts_at as string, a.ends_at as string, org.timezone)}
      proposed={a.proposed_starts_at ? longWhen(a.proposed_starts_at as string, a.proposed_ends_at as string, org.timezone) : null}
      portal={`${appBaseUrl()}/p/${org.slug}/login`}
      durationMin={Math.round((Date.parse(a.ends_at as string) - Date.parse(a.starts_at as string)) / 60_000)}
      needsConfirm={a.status === "pending" && a.source === "office"} />
  );
}
