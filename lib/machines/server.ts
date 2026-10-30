import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/integrations/runtime";
import { appBaseUrl } from "@/lib/integrations/registry";
import { publicOrg } from "@/lib/bookings/server";
import { notServicedBrand, readMachines, type MachineJobKind, type MachineModel, type MachineSettings } from "./core";

/**
 * Coffee machines (public side): the machines for sale (shop products in the machines category, joined to the
 * chooser facts) and the enquiry form for repairs, servicing and machine sales. Enquiries land as jobs (S-####).
 */
const EMAIL = /^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[^\s@<>"',;:()]{2,}$/;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function machinesOrg(slug: string) {
  const org = await publicOrg(slug).catch(() => null);
  if (!org) return null;
  return { org, s: readMachines(org.rawSettings) };
}

export interface ShopMachine extends MachineModel { name: string; price: number | null; image: string | null; images: string[]; short: string | null; inStock: boolean; href: string }

/** The machines for sale: active shop products in the machines category, with the chooser facts where they've been set. */
export async function loadShopMachines(db: SupabaseClient, org: { id: string; slug: string }, s: MachineSettings): Promise<ShopMachine[]> {
  const { data } = await db.from("shop_products").select("id, slug, name, short, image_url, images").eq("organisation_id", org.id).eq("category", s.shopCategory).eq("status", "active").order("position").order("name");
  const ps = (data ?? []) as { id: string; slug: string; name: string; short: string | null; image_url: string | null; images: string[] | null }[];
  if (!ps.length) return [];
  const { data: vs } = await db.from("shop_variants").select("product_id, price, active").in("product_id", ps.map((p) => p.id));
  return ps.flatMap((p) => {
    const m = s.models.find((x) => x.slug === p.slug);
    if (!m) return [];
    const prices = ((vs ?? []) as { product_id: string; price: number; active: boolean }[]).filter((v) => v.product_id === p.id && v.active).map((v) => Number(v.price));
    return [{ ...m, name: p.name, short: p.short, image: p.image_url, images: p.images ?? [], price: prices.length ? Math.min(...prices) : null, inStock: true, href: `/shop/${org.slug}/p/${p.slug}` }];
  });
}

export interface EnquiryInput {
  slug: string; kind: MachineJobKind; name: string; email: string; phone: string; company?: string; address?: string;
  brand?: string; model?: string; serial?: string; issue?: string; preferred?: string; machine?: string; website?: string; t?: number;
}

/** An enquiry from the Repairs page or the Coffee machines page. */
export async function sendMachineEnquiry(i: EnquiryInput) {
  if (i.website) return { ok: true as const, number: "" };
  if (i.t && Date.now() - Number(i.t) < 3000) throw new Error("Please check your details, then send again.");
  const mo = await machinesOrg(str(i.slug, 80));
  const kind: MachineJobKind = i.kind === "service" || i.kind === "install" || i.kind === "sale" ? i.kind : "repair";
  if (!mo || (kind === "sale" ? !mo.s.enabled : !mo.s.serviceEnabled)) throw new Error("Online enquiries aren't available right now — please contact us.");
  const { org, s } = mo;
  const name = str(i.name, 120), email = str(i.email, 200).toLowerCase(), phone = str(i.phone, 40);
  if (name.length < 2) throw new Error("Please add your name.");
  if (!EMAIL.test(email)) throw new Error("Please check your email address.");
  if (phone.replace(/\D/g, "").length < 8) throw new Error("Please add a phone number we can reach you on.");
  const brand = str(i.brand, 80);
  const issue = str(i.issue, 4000);
  if (kind !== "sale") {
    const no = notServicedBrand(brand, s) ?? notServicedBrand(`${str(i.model, 120)} ${issue.slice(0, 200)}`, s);
    if (no) throw new Error(`Sorry — we don't service ${no} machines.`);
    if (!brand) throw new Error("Please tell us the brand of your machine.");
    if (issue.length < 5) throw new Error("Please tell us what's wrong, or what you need.");
  }
  const db = createServiceClient();
  const { count } = await db.from("machine_jobs").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).ilike("contact_email", email.replace(/[%_]/g, "")).gte("created_at", new Date(Date.now() - 120_000).toISOString());
  if ((count ?? 0) > 0) throw new Error("We've just received an enquiry from you — we'll be in touch.");
  const { data: cust } = await db.from("customers").select("id").eq("organisation_id", org.id).ilike("email", email.replace(/[%_]/g, "")).limit(1).maybeSingle();
  const machine = kind === "sale" ? str(i.machine, 120) : "";
  const { data: job, error } = await db.from("machine_jobs").insert({
    organisation_id: org.id, kind, status: "new", customer_id: cust?.id ?? null, contact_name: name, contact_email: email, contact_phone: phone,
    company: str(i.company, 160) || null, site_address: str(i.address, 300) || null,
    brand: kind === "sale" ? (s.agentOf ?? null) : brand, model: kind === "sale" ? machine || null : str(i.model, 120) || null, serial: str(i.serial, 80) || null,
    issue: issue || null, preferred: str(i.preferred, 300) || null, callout: kind !== "sale", source: "online", created_by: null,
  }).select("id, number").single();
  // before the 0082 database update the job can't be saved — the enquiry is still emailed to the business below
  const missing = !!error && /machine_jobs/.test(error.message);
  if (error && !missing) throw new Error(error.message);
  const ref = (job?.number as string | undefined) ?? "";
  const link = job ? `/machines/${job.id}` : "/machines";
  const what = kind === "sale" ? `Machine enquiry${machine ? ` — ${machine}` : ""}` : `${kind === "service" ? "Service" : kind === "install" ? "Install" : "Repair"} enquiry — ${[brand, str(i.model, 120)].filter(Boolean).join(" ")}`;
  await db.from("notifications").insert({
    organisation_id: org.id, type: "machines.enquiry", title: `${ref ? `${ref}: ` : ""}${what}`.slice(0, 200), body: `${str(i.company, 160) || name}${missing ? ` · ${email} · ${phone}` : ""}`,
    link, entity_type: job ? "machine_job" : null, entity_id: job?.id ?? null,
  }).then(() => undefined, () => undefined);
  const { data: o } = await db.from("organisations").select("name, logo_url, brand_colour, contact_email").eq("id", org.id).single();
  let alerted = false;
  if (o?.contact_email) {
    try {
      const { emailConfigured, sendEmail } = await import("@/lib/email/send");
      const { officeAlertEmail } = await import("@/lib/bookings/emails");
      if (emailConfigured()) {
        const m = officeAlertEmail({ businessName: o.name, logoUrl: o.logo_url, brand: o.brand_colour }, {
          heading: `${ref ? `${ref}: ` : ""}${what}`,
          lines: [
            { label: "Customer", value: `${str(i.company, 160) ? `${str(i.company, 160)} — ` : ""}${name}` },
            { label: "Contact", value: [email, phone].join(" · ") },
            ...(str(i.address, 300) ? [{ label: "Where", value: str(i.address, 300) }] : []),
            ...(issue ? [{ label: kind === "sale" ? "Notes" : "Problem", value: issue.slice(0, 600) }] : []),
            ...(str(i.preferred, 300) ? [{ label: "When suits", value: str(i.preferred, 300) }] : []),
            ...(kind !== "sale" && (str(i.model, 120) || str(i.serial, 80)) ? [{ label: "Machine", value: [brand, str(i.model, 120), str(i.serial, 80) ? `SN ${str(i.serial, 80)}` : ""].filter(Boolean).join(" ") }] : []),
          ],
          url: `${appBaseUrl()}${link}`,
        });
        await sendEmail({ to: o.contact_email, ...m, replyTo: email, fromName: "EventureOS" });
        alerted = true;
      }
    } catch (e) { console.error("machine enquiry alert", e); }
  }
  if (missing && !alerted) throw new Error("Online enquiries aren't available right now — please contact us.");
  return { ok: true as const, number: ref };
}
