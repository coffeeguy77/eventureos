"use server";

import { requireOrg } from "@/lib/context";
import { appInfo, isAppKey } from "@/lib/apps";

/** A business asks EventureOS to add an app. It lands in Platform admin → Demo requests (and the alert email, if set). */
export async function requestApp(key: string, note: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!isAppKey(key)) throw new Error("Refresh and try again.");
    const { supabase, org, profile, role } = await requireOrg();
    if (role !== "owner" && role !== "admin") throw new Error("Ask an owner or admin to request apps.");
    const app = appInfo(key);
    const { error } = await supabase.rpc("submit_demo_request", {
      p_name: profile.full_name || profile.email, p_email: profile.email, p_company: org.name, p_phone: null, p_business_type: null, p_team_size: null,
      p_message: `Add-on request: ${app.name} for ${org.name} (/${org.slug}).${note.trim() ? `\n\n${note.trim().slice(0, 1500)}` : ""}`, p_source: "In-app: Settings → Apps",
    });
    if (error) throw new Error(error.message);
    const to = process.env.DEMO_REQUEST_EMAIL?.trim();
    if (to) {
      try {
        const { emailConfigured, sendEmail } = await import("@/lib/email/send");
        if (emailConfigured()) {
          const text = `${org.name} (/${org.slug}) asked to add ${app.name}.\nFrom: ${profile.full_name ?? ""} <${profile.email}>${note.trim() ? `\n\n${note.trim()}` : ""}`;
          await sendEmail({ to, subject: `App request: ${app.name} for ${org.name}`, text, html: `<pre style="font-family:inherit;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>`, replyTo: profile.email, fromName: "EventureOS" });
        }
      } catch (e) { console.error("app request email", e); }
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
