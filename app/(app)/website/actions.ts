"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/context";
import { readEvents, type EventsSettings } from "@/lib/events/core";
import { readReminders, type ReminderSettings } from "@/lib/reminders/core";
import { readCafe, type CafeSettings } from "@/lib/cafe/core";
import { IG_PROVIDER } from "@/lib/cafe/instagram";
import { cleanTheme, PRESETS, type SiteTheme } from "@/lib/site/theme";

export type Result<T = string> = { ok: true; data: T } | { ok: false; error: string };
const run = async <T,>(fn: () => Promise<T>): Promise<Result<T>> => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } };

async function manager() {
  const ctx = await requireOrg();
  if (!["owner", "admin", "manager"].includes(ctx.role)) throw new Error("Only owners, admins and managers can change the website.");
  return ctx;
}

async function saveKey(key: "events" | "reminders" | "cafe" | "site_theme", value: unknown) {
  const { supabase, org } = await manager();
  const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
  if (e1) throw new Error(e1.message);
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const { error } = await supabase.from("organisations").update({ settings: { ...settings, [key]: value } }).eq("id", org.id);
  if (error) throw new Error(error.message);
  revalidatePath("/website");
  return org.slug as string;
}

export async function saveEventsSettings(input: EventsSettings): Promise<Result> {
  return run(async () => {
    // Run it through the same reader the website uses, so only clean values are stored
    const clean = readEvents({ events: input });
    if (clean.enabled && !clean.fleet.cart && !clean.fleet.van && !clean.fleet.diy) throw new Error("Add at least one cart, van or equipment kit before switching the events pages on.");
    await saveKey("events", clean);
    return clean.enabled ? "Saved — your events pages are live." : "Saved. The events pages are switched off.";
  });
}

export async function saveReminderSettings(input: ReminderSettings): Promise<Result> {
  return run(async () => {
    const clean = readReminders({ reminders: input });
    await saveKey("reminders", clean);
    const on = Object.values(clean.sections).filter((s) => s.on).length;
    return clean.enabled && on ? `Saved — reminders are on for ${on} section${on > 1 ? "s" : ""}. They go out with the daily run.` : "Saved. Reminders are off — nothing will be sent.";
  });
}

export async function saveCafeSettings(input: CafeSettings): Promise<Result> {
  return run(async () => {
    const clean = readCafe({ cafe: input });
    if (input.appUrl && !clean.appUrl) throw new Error("The app address must be a web address starting with https://");
    if ((clean.ordering || clean.reservations) && !clean.appUrl) throw new Error("Add your ordering app's address before switching on online ordering or table bookings.");
    await saveKey("cafe", clean);
    revalidatePath("/cafe", "layout");
    return clean.enabled ? "Saved — your café pages are live." : "Saved. The café pages are switched off.";
  });
}

/** Check the ordering app answers (config + menu) — shown in the office before switching ordering on. */
export async function testCafeApp(appUrl: string): Promise<Result<{ store: string; items: number; reservations: boolean; square: string }>> {
  return run(async () => {
    await manager();
    const { cleanAppUrl } = await import("@/lib/cafe/core");
    const { appConfig, appMenu, mainLocation } = await import("@/lib/cafe/server");
    const url = cleanAppUrl(appUrl);
    if (!url) throw new Error("Enter the app's address, e.g. https://app.yourcafe.com.au");
    const cfg = await appConfig(url);
    if (!cfg.applicationId) throw new Error("The app answered, but it has no Square payment details set up.");
    const menu = await appMenu(url, mainLocation(cfg)?.id ?? null);
    return { store: cfg.storeName || "your app", items: menu.reduce((n, s) => n + s.items.length, 0), reservations: cfg.reservations, square: cfg.environment };
  });
}

export async function disconnectInstagram(): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    const { data } = await supabase.from("integrations").select("id").eq("organisation_id", org.id).eq("provider", IG_PROVIDER).maybeSingle();
    if (data) { const { error } = await supabase.rpc("disconnect_integration", { p_integration_id: data.id }); if (error) throw new Error(error.message); }
    revalidatePath("/website");
    return "Instagram disconnected — the café page shows a Follow us link instead.";
  });
}

/* ------------------------------------------------------------------ own website: pages, domain, SEO Saver */

async function patchSite(patch: Record<string, unknown>) {
  const { supabase, org } = await manager();
  const { data, error: e1 } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
  if (e1) throw new Error(e1.message);
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const site = (settings.site && typeof settings.site === "object" ? settings.site : {}) as Record<string, unknown>;
  const { error } = await supabase.from("organisations").update({ settings: { ...settings, site: { ...site, ...patch } } }).eq("id", org.id);
  if (error) throw new Error(error.message);
  revalidatePath("/website");
  revalidatePath("/site", "layout");
  return { supabase, org, settings: { ...settings, site: { ...site, ...patch } } };
}

export async function saveSitePages(input: { home: boolean; pages: unknown[]; logoSize?: string }): Promise<Result> {
  return run(async () => {
    const { readSite } = await import("@/lib/site/site");
    const clean = readSite({ site: { pages: input.pages } }).pages.map(({ index: _i, ...p }) => p);
    if (clean.length < (input.pages ?? []).length) throw new Error("Every page needs a title and an address that isn't already used (and isn't one of EventureOS's own, like hire or shop).");
    const patch: Record<string, unknown> = { home: input.home === true, pages: clean };
    if (input.logoSize !== undefined) patch.logoSize = readSite({ site: { logoSize: input.logoSize } }).logoSize;
    await patchSite(patch);
    return `Saved — ${clean.length} page${clean.length === 1 ? "" : "s"}${input.home ? " and your home page" : ""}.`;
  });
}

/** Write a page from a few key details, in the business's own name. Only what's given is used. */
export async function draftSitePage(input: { title: string; slug?: string; form?: string; facts?: string }): Promise<Result<{
  eyebrow: string; intro: string; body: string; metaTitle: string; metaDescription: string; sections: import("@/lib/site/site").PageSection[];
}>> {
  return run(async () => {
    const { supabase, org } = await manager();
    const title = String(input.title ?? "").trim().slice(0, 120);
    if (!title) throw new Error("Give the page a title first.");
    const { orgAiKey } = await import("@/lib/ai/key");
    const { callClaude, parseJSONObject } = await import("@/lib/ai/claude");
    const { readSections } = await import("@/lib/site/site");
    const key = await orgAiKey(org.id);
    if (!key) throw new Error("AI writing isn't set up yet — connect an Anthropic key in Settings → Integrations.");
    const { data: o } = await supabase.from("organisations").select("name, business_type, address, contact_phone").eq("id", org.id).single();
    const row = (o ?? {}) as { name?: string; business_type?: string | null; address?: string | null; contact_phone?: string | null };
    const facts = String(input.facts ?? "").trim().slice(0, 3000);
    const system = `You write website pages for small Australian businesses. Australian English, warm, plain and confident. No hype words ("ultimate", "unforgettable", "world-class"), no emojis, no exclamation marks.
Use ONLY the facts provided about the business. Never invent years in business, awards, numbers, staff names, prices, reviews, testimonials or guarantees. If a detail isn't given, write around it.
Text fields may use: blank line between paragraphs, "- " list items, **bold**.
Reply with ONLY a JSON object:
{"eyebrow": "2–3 words", "intro": "one or two sentences", "body": "", "sections": [ up to 4 items, each either {"type":"imageText","heading":"...","body":"1–2 short paragraphs"} or {"type":"text","heading":"...","body":"..."}, and finish with one {"type":"cta","heading":"...","body":"one line","label":"button words","link":"/contact"} ], "metaTitle": "under 60 characters", "metaDescription": "under 155 characters"}
${input.form === "contact" ? "This is the contact page: keep it short (1–2 sections), invite people to call or send a message, mention the area served if given. The page already shows the address, phone, email, a form and a map, so don't repeat them. Skip the cta." : ""}`;
    const user = `Business: ${row.name ?? org.name}\nType of business: ${row.business_type ?? "—"}\nLocation: ${row.address ? row.address.replace(/\n/g, ", ") : "—"}\nPage title: ${title}\nKey details from the owner: ${facts || "—"}`;
    const d = parseJSONObject(await callClaude(system, user, { key, maxTokens: 1800, timeoutMs: 40000, temperature: 0.5 }));
    const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    const sections = readSections((Array.isArray(d.sections) ? d.sections : []).map((x, i) => ({ ...(x as object), id: `ai${Date.now().toString(36)}${i}`, image: null, side: i % 2 ? "right" : "left" })));
    return { eyebrow: t(d.eyebrow, 80), intro: t(d.intro, 600), body: t(d.body, 8000), metaTitle: t(d.metaTitle, 120), metaDescription: t(d.metaDescription, 300), sections };
  }).then((r) => (r.ok ? r : { ok: false as const, error: /Anthropic API/.test(r.error) ? "The AI writer couldn't be reached — try again in a minute." : r.error }));
}

export async function saveSiteDomain(input: { domain: string; oldSite: string; live: boolean; fallback: boolean }): Promise<Result> {
  return run(async () => {
    const { cleanHost, readSite } = await import("@/lib/site/site");
    const domain = input.domain.trim() ? cleanHost(input.domain) : null;
    if (input.domain.trim() && !domain) throw new Error("Enter the domain like www.yourbusiness.com.au");
    const old = input.oldSite.trim().replace(/\/+$/, "");
    if (old && !/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(old)) throw new Error("Enter the old website like https://www.yourbusiness.com.au");
    if (input.live && !domain) throw new Error("Add the domain before switching it on.");
    const { settings } = await patchSite({ domain, oldSite: old || null, live: !!input.live && !!domain, fallback: input.fallback !== false });
    const s = readSite(settings);
    return s.live ? `Saved — ${s.domain} is switched on. Google will be told your pages live there.` : "Saved. Your domain is set up but not switched on yet.";
  });
}

export async function saveSeoRules(rules: { from: string; to: string; status?: number; note?: string }[]): Promise<Result> {
  return run(async () => {
    const { readSite } = await import("@/lib/site/site");
    const { cleanRules } = await import("@/lib/site/seo");
    const list = cleanRules(readSite({ site: { rules: rules.map((r, i) => ({ ...r, id: `r${Date.now().toString(36)}${i}` })) } }).rules);
    await patchSite({ rules: list });
    return `Saved — ${list.length} redirect${list.length === 1 ? "" : "s"}.`;
  });
}

/** Read the old website's addresses (sitemap + Wayback Machine) and keep the list for matching. */
export async function findOldAddresses(): Promise<Result<{ found: number; notes: string[] }>> {
  return run(async () => {
    const { supabase, org } = await manager();
    const { data } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    const { readSite } = await import("@/lib/site/site");
    const s = readSite(data?.settings);
    if (!s.oldSite) throw new Error("Add your old website's address first (e.g. https://www.yourbusiness.com.au).");
    if (s.live) throw new Error("Your domain already points at EventureOS, so the old website can't be read any more. The list found before the switch is kept.");
    const { discoverOld } = await import("@/lib/site/discover");
    const r = await discoverOld(s.oldSite);
    if (!r.found.length) throw new Error(`Couldn't find any addresses. ${r.notes.join(" · ")}`);
    await patchSite({ discovered: r.found.slice(0, 3000) });
    return { found: r.found.length, notes: r.notes };
  });
}

/* ------------------------------------------------------------------ menus: top (computer + phone) and footer */

export async function saveMenus(input: { top: unknown; footer: unknown }): Promise<Result> {
  return run(async () => {
    const { cleanSaved } = await import("@/lib/site/menus");
    const top = cleanSaved(input?.top, 0) ?? [];
    const footer = cleanSaved(input?.footer, 0) ?? [];
    await patchSite({ menus: { top, footer } });
    revalidatePath("/", "layout");
    return "Menus saved — your website shows the new menus now.";
  });
}

export async function resetMenus(which: "top" | "footer"): Promise<Result> {
  return run(async () => {
    const { supabase, org } = await manager();
    const { data } = await supabase.from("organisations").select("settings").eq("id", org.id).single();
    const site = ((data?.settings as Record<string, unknown> | null)?.site ?? {}) as Record<string, unknown>;
    const menus = { ...((site.menus as Record<string, unknown>) ?? {}) };
    delete menus[which === "top" ? "top" : "footer"];
    await patchSite({ menus });
    revalidatePath("/", "layout");
    return which === "top" ? "Top menu is back to the automatic one." : "Footer is back to the automatic one.";
  });
}

/** The site menu's colour on every page (pages can still choose their own in the page editor). */
export async function saveMenuTone(tone: "light" | "dark", resetPages = false): Promise<Result> {
  return run(async () => {
    const t = tone === "dark" ? "dark" : "light";
    await patchSite(resetPages ? { menuTone: t, pageMenu: {} } : { menuTone: t });
    revalidatePath("/", "layout");
    return resetPages ? `Every page now has a ${t} menu.` : `Site menu is ${t} on every page that hasn't chosen its own.`;
  });
}

/** Website → Look & feel: the theme of the public pages. */
export async function saveSiteTheme(input: SiteTheme): Promise<Result> {
  return run(async () => {
    const clean = cleanTheme(input);
    const slug = await saveKey("site_theme", clean);
    revalidatePath(`/site/${slug}`);
    return `Saved — your website now uses the ${PRESETS[clean.preset].name} look.`;
  });
}
