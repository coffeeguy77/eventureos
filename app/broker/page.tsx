import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { currentBroker } from "@/lib/loans/broker-auth";
import { serviceDb } from "@/lib/loans/server";
import { STATUS_LABEL } from "@/components/loans/status";
import { aud } from "@/lib/loans/summary";
import { brokerSignOutAction } from "./actions";
import { BrokerSignIn } from "./ui";
import { SchemeToggle } from "@/components/portal/scheme-toggle";

export const dynamic = "force-dynamic";

export default async function BrokerHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const broker = await currentBroker().catch(() => null);
  if (!broker) {
    return (
      <main className="relative grid min-h-dvh place-items-center px-4">
        <SchemeToggle className="absolute right-4 top-4" />
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">Broker portal</p>
          <h1 className="mt-1 text-[1.375rem] font-bold">Sign in</h1>
          <p className="mb-5 mt-1 text-[0.875rem] text-ink-muted">For brokers a client has shared their loan application with.</p>
          <BrokerSignIn error={(await searchParams).error ?? null} />
        </div>
      </main>
    );
  }
  const db = serviceDb();
  const [{ data: org }, { data: links }] = await Promise.all([
    db.from("organisations").select("name").eq("id", broker.organisation_id).single(),
    db.from("loan_file_brokers").select("file_id").eq("broker_id", broker.id),
  ]);
  const ids = (links ?? []).map((l) => l.file_id as string);
  const { data: files } = ids.length ? await db.from("loan_files").select("id, title, status, amount, applicants, answers, submitted_at, updated_at").in("id", ids).neq("status", "closed").order("updated_at", { ascending: false }) : { data: [] };
  return (
    <div>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1"><p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">Broker portal · {org?.name}</p><p className="font-semibold">{broker.name}{broker.company ? ` · ${broker.company}` : ""}</p></div>
          <SchemeToggle />
          <form action={brokerSignOutAction}><button className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] text-ink-muted ring-1 ring-inset ring-line hover:text-ink"><LogOut className="h-4 w-4" />Sign out</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="text-[1.375rem] font-bold">Loan applications shared with you</h1>
        {!files?.length ? <p className="mt-4 rounded-xl border border-dashed border-line p-6 text-center text-[0.875rem] text-ink-muted">Nothing shared with you right now.</p> : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {files.map((f) => {
              const a = (f.answers ?? {}) as Record<string, unknown>;
              const names = Array.from({ length: f.applicants as number }, (_, i) => [a[`a${i + 1}.first_name`], a[`a${i + 1}.last_name`]].filter(Boolean).join(" ")).filter(Boolean);
              return (
                <li key={f.id}><Link href={`/broker/${f.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-canvas">
                  <div className="min-w-0 flex-1"><p className="font-medium">{f.title}</p><p className="text-[0.8125rem] text-ink-muted">{names.join(" & ") || "—"}{a.amount ? ` · ${aud(Number(String(a.amount).replace(/[^\d.]/g, "")))}` : ""}</p></div>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[0.75rem] text-ink-muted ring-1 ring-inset ring-line">{STATUS_LABEL[f.status as string] ?? f.status}</span>
                  <ChevronRight className="h-4 w-4 text-ink-faint" />
                </Link></li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
