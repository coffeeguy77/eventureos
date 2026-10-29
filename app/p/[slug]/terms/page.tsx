import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/integrations/runtime";
import { DEFAULT_TERMS, fillTerms, readFees, readTerms } from "@/lib/accounts/core";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  const { data } = await createServiceClient().from("organisations").select("name, settings, default_payment_terms_days, contact_email, contact_phone, status").eq("slug", slug).maybeSingle();
  if (!data || data.status !== "active") return null;
  const saved = readTerms(data.settings);
  const text = fillTerms(saved || DEFAULT_TERMS, {
    business: data.name as string, payment_terms: Number(data.default_payment_terms_days ?? 14) || 14, fees: readFees(data.settings),
    email: (data.contact_email as string | null) ?? null, phone: (data.contact_phone as string | null) ?? null,
  });
  return { name: data.name as string, text, published: !!saved };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await load((await params).slug);
  return { title: { absolute: t ? `Terms and conditions · ${t.name}` : "Terms and conditions" } };
}

/** The business's terms and conditions of trade (Accounts → Fees & terms), public, linked from invoices. */
export default async function TermsPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await load((await params).slug);
  if (!t || !t.published) notFound();
  const blocks = t.text.split(/\n{2,}/);
  return (
    <article className="mx-auto max-w-3xl rounded-2xl bg-white p-6 text-[0.9375rem] leading-relaxed text-ink shadow-card ring-1 ring-line sm:p-10">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        return (
          <div key={i} className="mt-4 first:mt-0">
            {lines.map((l, k) => {
              if (/^# /.test(l)) return <h1 key={k} className="text-[1.75rem] font-semibold tracking-tight">{l.slice(2)}</h1>;
              if (/^## /.test(l)) return <h2 key={k} className="mt-6 text-[1.125rem] font-semibold">{l.slice(3)}</h2>;
              return <p key={k} className="mt-1.5 text-ink-muted">{l}</p>;
            })}
          </div>
        );
      })}
    </article>
  );
}
