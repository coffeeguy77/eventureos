"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type DemoState = { ok?: boolean; error?: string } | undefined;

/** "Book a demo" from the public sales page. Saved via submit_demo_request (rate-limited); optional email alert. */
export async function requestDemo(_prev: DemoState, form: FormData): Promise<DemoState> {
  // Bots: a hidden field humans never fill, and a minimum time on the page
  if (String(form.get("website") ?? "").trim()) return { ok: true };
  const started = Number(form.get("t") ?? 0);
  if (started && Date.now() - started < 2500) return { ok: true };

  const get = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const name = get("name", 120), email = get("email", 200);
  if (name.length < 2) return { error: "Please tell us your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Please enter a valid email address." };
  const row = {
    p_name: name, p_email: email, p_company: get("company", 160), p_phone: get("phone", 40),
    p_business_type: get("business_type", 80), p_team_size: get("team_size", 40), p_message: get("message", 2000),
    p_source: `${(await headers()).get("referer") ?? "sales page"}`.slice(0, 200),
  };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("submit_demo_request", row);
    if (error) return { error: error.message };
  } catch {
    return { error: "Couldn't send that just now — please try again, or email us." };
  }

  // Optional alert to the EventureOS team (set DEMO_REQUEST_EMAIL in Vercel)
  const to = process.env.DEMO_REQUEST_EMAIL?.trim();
  if (to) {
    try {
      const { emailConfigured, sendEmail } = await import("@/lib/email/send");
      if (emailConfigured()) {
        const lines = [`Name: ${name}`, `Email: ${email}`, row.p_company && `Business: ${row.p_company}`, row.p_phone && `Phone: ${row.p_phone}`,
          row.p_business_type && `Type: ${row.p_business_type}`, row.p_team_size && `Team: ${row.p_team_size}`, row.p_message && `\n${row.p_message}`].filter(Boolean) as string[];
        const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
        await sendEmail({ to, subject: `Demo request: ${name}${row.p_company ? ` (${row.p_company})` : ""}`, replyTo: email,
          text: lines.join("\n"), html: `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${esc(lines.join("\n"))}</pre>` });
      }
    } catch { /* saved already; the alert is best effort */ }
  }
  return { ok: true };
}
