import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/integrations/runtime";
import { eventsOrg, packageFor, priceList } from "@/lib/events/server";
import { HIRE_KINDS, offered, type HireKind } from "@/lib/events/core";
import { EventsFrame, serif, WRAP, eyebrow } from "@/components/events/frame";
import { QuoteBuilder } from "@/components/events/builder";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const eo = await eventsOrg((await params).org);
  if (!eo) return { title: "Not found" };
  return { title: `Get a quote — coffee cart, van & equipment hire | ${eo.org.name}`, description: `Build your event online: choose a coffee cart, coffee van or equipment only, add days, hours and baristas, and we'll email your quote.`, alternates: { canonical: `/hire/${eo.org.slug}/quote` } };
}

/** Signed in to the client portal? Fill in their details. Never fails the page. */
async function portalPrefill(orgId: string) {
  const blank = { name: "", email: "", phone: "", company: "", signedIn: false };
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user?.email) return blank;
    const db = createServiceClient();
    const { data: c } = await db.from("contacts").select("first_name, last_name, phone, customer_id").eq("organisation_id", orgId).eq("portal_user_id", user.id).limit(1).maybeSingle();
    let company = "";
    if (c?.customer_id) {
      const { data: cu } = await db.from("customers").select("name").eq("id", c.customer_id).eq("organisation_id", orgId).maybeSingle();
      const n = (cu?.name as string | undefined) ?? "";
      const person = [c.first_name, c.last_name].filter(Boolean).join(" ");
      if (n && n !== person) company = n;
    }
    return { name: c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "", email: user.email, phone: (c?.phone as string) ?? "", company, signedIn: !!c };
  } catch { return blank; }
}

export default async function QuotePage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ kind?: string }> }) {
  const eo = await eventsOrg((await params).org);
  if (!eo) notFound();
  const { org, s, today } = eo;
  const sp = await searchParams;
  const kinds = offered(s);
  const initial = HIRE_KINDS.includes(sp.kind as HireKind) ? (sp.kind as HireKind) : null;
  const [{ packages }, me] = await Promise.all([priceList(createServiceClient(), org.id), portalPrefill(org.id)]);
  // Only the "2 baristas" rule of thumb goes to the browser — never prices
  const hints = Object.fromEntries(kinds.map((k) => {
    const x = packageFor(k, s, packages)?.rules.extra_staff;
    return [k, x ? { serves_over: x.serves_over, max_service_hours: x.max_service_hours } : null];
  }));
  const { name, email, phone, company, signedIn } = me;
  return (
    <EventsFrame org={org} s={s} active="quote">
      <section className="py-10 sm:py-14" data-section="builder">
        <div className={WRAP}>
          <div className="mb-8 max-w-[760px]">
            <p className={eyebrow}>Quote builder</p>
            <h1 className={`${serif} mt-3 text-[2.5rem] font-semibold leading-[1.05] sm:text-[3.25rem]`}>Build your event</h1>
            <p className="mt-3 text-[1.0625rem] text-[#5E5853]">Tell us what you need and we&apos;ll check the calendar as you go. Your itemised quote comes by email{s.leadDays ? ` — book ${s.leadDays}+ days ahead to lock your date in` : ""}.</p>
          </div>
          <QuoteBuilder slug={org.slug} today={today} kinds={kinds} initialKind={initial} hints={hints} signedIn={signedIn}
            prefill={{ name, email, phone, company }}
            s={{ labels: s.labels, blurbs: s.blurbs, fleet: s.fleet, leadDays: s.leadDays, stickerPrice: s.stickerPrice, stickerSize: s.stickerSize }} />
        </div>
      </section>
    </EventsFrame>
  );
}
