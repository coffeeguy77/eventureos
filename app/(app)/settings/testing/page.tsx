import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, FlaskConical } from "lucide-react";
import { requireOrg } from "@/lib/context";
import { createServiceClient } from "@/lib/integrations/runtime";
import { Card } from "@/components/ui/card";
import { TEST_CODE, readTesting } from "@/lib/testing/core";
import { fmtDate, money } from "@/lib/format";
import { ClearTests, TestingSwitch } from "./controls";

export const metadata = { title: "Testing" };
export const dynamic = "force-dynamic";

type Row = { id: string; title: string; detail: string; when: string; href: string | null };

export default async function TestingPage() {
  const { org, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") redirect("/settings");
  const db = createServiceClient();
  const testing = readTesting(org.settings);
  const slug = org.slug;

  const [bk, gf, od, gc, st] = await Promise.all([
    db.from("bookings").select("id, reference, status, contact_name, contact_email, created_at, manage_token, course:booking_courses(name), session:booking_sessions(starts_at)").eq("organisation_id", org.id).eq("is_test", true).order("created_at", { ascending: false }).limit(200),
    db.from("booking_gifts").select("id, code, amount, status, recipient_name, created_at, view_token, course:booking_courses(name)").eq("organisation_id", org.id).eq("is_test", true).order("created_at", { ascending: false }).limit(200),
    db.from("shop_orders").select("id, number, status, kind, total, subtotal, name, created_at, view_token").eq("organisation_id", org.id).eq("is_test", true).order("created_at", { ascending: false }).limit(200),
    db.from("shop_gift_cards").select("id, code, amount, status, recipient_name, created_at, view_token").eq("organisation_id", org.id).eq("is_test", true).order("created_at", { ascending: false }).limit(200),
    db.from("booking_students").select("id", { count: "exact", head: true }).eq("organisation_id", org.id).eq("is_test", true),
  ]);
  const ready = !bk.error;

  const groups: { title: string; rows: Row[] }[] = ready ? [
    { title: "Class bookings", rows: ((bk.data ?? []) as unknown as { id: string; reference: string; status: string; contact_name: string; contact_email: string | null; created_at: string; manage_token: string; course: { name: string } | null; session: { starts_at: string } | null }[])
      .map((b) => ({ id: b.id, title: `${b.reference} · ${b.course?.name ?? "Class"}`, detail: `${b.contact_name}${b.contact_email ? ` (${b.contact_email})` : ""} · ${b.status}${b.session ? ` · class ${fmtDate(b.session.starts_at.slice(0, 10), "long")}` : ""}`, when: b.created_at, href: `/book/${slug}/done/${b.manage_token}` })) },
    { title: "Gift certificates", rows: ((gf.data ?? []) as unknown as { id: string; code: string; amount: number; status: string; recipient_name: string | null; created_at: string; view_token: string; course: { name: string } | null }[])
      .map((g) => ({ id: g.id, title: `${g.code} · ${g.course?.name ?? money(g.amount, org.currency)}`, detail: `${g.recipient_name ? `For ${g.recipient_name} · ` : ""}${g.status}`, when: g.created_at, href: `/book/${slug}/gift/${g.view_token}` })) },
    { title: "Shop orders", rows: ((od.data ?? []) as unknown as { id: string; number: number; status: string; kind: string; subtotal: number; name: string | null; created_at: string; view_token: string }[])
      .map((o) => ({ id: o.id, title: `Order #${o.number}${o.kind === "gift_card" ? " · gift card" : ""}`, detail: `${o.name ?? ""} · ${money(o.subtotal, org.currency)} value · ${o.status}`, when: o.created_at, href: `/shop/${slug}/order/${o.view_token}` })) },
    { title: "Coffee gift cards", rows: ((gc.data ?? []) as unknown as { id: string; code: string; amount: number; status: string; recipient_name: string | null; created_at: string; view_token: string }[])
      .map((g) => ({ id: g.id, title: `${g.code} · ${money(g.amount, org.currency)}`, detail: `${g.recipient_name ? `For ${g.recipient_name} · ` : ""}${g.status}`, when: g.created_at, href: `/shop/${slug}/gift-card/${g.view_token}` })) },
  ] : [];
  const total = groups.reduce((n, g) => n + g.rows.length, 0) + (st.count ?? 0);

  const tryLinks = [
    { label: "Gift certificate (barista class)", href: `/book/${slug}/gift?code=${TEST_CODE}` },
    { label: "Coffee gift card", href: `/shop/${slug}/gift-card?code=${TEST_CODE}` },
    { label: "Book a class", href: `/book/${slug}` },
    { label: "Coffee shop", href: `/shop/${slug}?code=${TEST_CODE}` },
    { label: "Academy (as you)", href: `/academy/${slug}` },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-ink"><FlaskConical className="h-[18px] w-[18px] text-brand-600" />Testing</h2>
        <p className="mt-0.5 max-w-2xl text-[0.8125rem] text-ink-muted">
          Try every checkout as a customer would — without paying, and without anything counting as real. When you&apos;re done, clear it all with one button.
        </p>
      </div>

      {!ready && <Card className="border-amber-200 bg-amber-50 p-5 text-[0.875rem] text-amber-900">Run the <strong>0065 test mode</strong> database update in Supabase first — then this page lists your test results.</Card>}

      <Card className="space-y-4 p-5">
        <div>
          <p className="text-[0.875rem] font-semibold text-ink">The test code</p>
          <p className="mt-1 text-[0.8125rem] text-ink-muted">Use <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-semibold text-ink">{TEST_CODE.toLowerCase()}</code> as the promo code on a class booking, a gift certificate, a one-off coffee order or a coffee gift card. It makes everything free, and whatever it creates:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.8125rem] text-ink-muted">
            <li>never takes a seat in a class and never shows in the calendar, bookings, orders, gift lists or reports;</li>
            <li>sends the real customer emails to the email you type in — with <strong>TEST</strong> in the subject — but nothing to the office;</li>
            <li>stamps certificates and gift cards <strong>“Test — not valid”</strong>. A test gift certificate or gift card can be used to book a class or buy coffee, and that booking or order is a test too.</li>
          </ul>
        </div>
        <TestingSwitch enabled={testing.enabled} />
        <div className="flex flex-wrap gap-2">
          {tryLinks.map((l) => <Link key={l.href} href={l.href} target="_blank" className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-[0.8125rem] font-medium text-ink hover:bg-zinc-200">{l.label}<ExternalLink className="h-3.5 w-3.5" /></Link>)}
        </div>
        <p className="text-[0.8125rem] text-ink-muted"><strong>Academy:</strong> while you&apos;re signed in to EventureOS as the owner, the Academy opens as your own test student — every level and lesson open, no coach limits, nothing to pay. Use a private window to see it as a customer.</p>
      </Card>

      {ready && (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.875rem] font-semibold text-ink">Test results <span className="font-normal text-ink-muted">· {total} record{total === 1 ? "" : "s"}</span></p>
            <ClearTests count={total} />
          </div>
          {total === 0 && <p className="text-[0.8125rem] text-ink-muted">Nothing yet. Try one of the links above with the test code.</p>}
          {groups.filter((g) => g.rows.length).map((g) => (
            <div key={g.title}>
              <p className="mb-1.5 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{g.title}</p>
              <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
                {g.rows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[0.8125rem]">
                    <span className="min-w-0"><span className="block font-medium text-ink">{r.title}</span><span className="block truncate text-ink-muted">{r.detail}</span></span>
                    <span className="flex shrink-0 items-center gap-3 text-ink-faint">{fmtDate(r.when.slice(0, 10))}{r.href && <Link href={r.href} target="_blank" className="font-medium text-brand-600 hover:underline">Open</Link>}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {(st.count ?? 0) > 0 && <p className="text-[0.8125rem] text-ink-muted">Plus {st.count} test student{st.count === 1 ? "" : "s"} (including your Academy test login and its progress).</p>}
        </Card>
      )}
    </div>
  );
}
