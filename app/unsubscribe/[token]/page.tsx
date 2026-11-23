import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { UnsubscribeButton } from "./button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

/** Public: stop a business's mail-outs to this client. */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const db = createServiceClient();
  const { data } = await db.from("nh_mailout_sends").select("email, customer_id, organisations(name), customers(unsubscribed_at)").eq("token", token).maybeSingle();
  if (!data) notFound();
  const d = data as unknown as { email: string; organisations: { name: string } | null; customers: { unsubscribed_at: string | null } | null };
  const business = d.organisations?.name ?? "this business";
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-surface p-7 text-center shadow-card ring-1 ring-line">
        <h1 className="text-[1.375rem] font-semibold text-ink">Emails from {business}</h1>
        <p className="mt-2 text-[0.9375rem] text-ink-muted">For {d.email}</p>
        <div className="mt-6"><UnsubscribeButton token={token} business={business} done={!!d.customers?.unsubscribed_at} /></div>
        <p className="mt-6 text-[0.8125rem] text-ink-faint">This only stops news and offers. You&apos;ll still get invoices and replies about your own requests.</p>
      </div>
    </div>
  );
}
