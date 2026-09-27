import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Demo requests" };

type Row = { id: string; created_at: string; name: string; email: string; company: string | null; phone: string | null; business_type: string | null; team_size: string | null; message: string | null; status: string };

/** "Book a demo" submissions from the sales page at / (platform admins only — RLS). */
export default async function DemoRequestsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("demo_requests").select("id, created_at, name, email, company, phone, business_type, team_size, message, status").order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error(`Could not load demo requests: ${error.message}`);
  const rows = (data ?? []) as Row[];
  return (
    <div>
      <PageHeader title="Demo requests" subtitle="From “Book a demo” on the sales page. Set DEMO_REQUEST_EMAIL in Vercel to also get an email for each one." />
      <Card>
        {rows.length === 0 ? <EmptyState title="No demo requests yet" /> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="px-5 py-4 text-[0.8125rem]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">{r.name}{r.company ? <span className="font-normal text-ink-muted"> · {r.company}</span> : null}</p>
                  <p className="text-[0.75rem] text-ink-faint">{fmtDateTime(r.created_at, "Australia/Sydney")}</p>
                </div>
                <p className="mt-0.5 text-ink-muted"><a href={`mailto:${r.email}`} className="text-brand-700 underline">{r.email}</a>{r.phone ? ` · ${r.phone}` : ""}{r.business_type ? ` · ${r.business_type}` : ""}{r.team_size ? ` · ${r.team_size}` : ""}</p>
                {r.message && <p className="mt-2 whitespace-pre-line text-ink">{r.message}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
