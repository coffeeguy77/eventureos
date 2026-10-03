import "server-only";
import { timingSafeEqual } from "node:crypto";
import { Download, FileText } from "lucide-react";
import { createServiceClient } from "@/lib/integrations/runtime";
import { fmtDate } from "@/lib/format";
import { fileSize, groupByCategory, type LibraryDoc } from "@/lib/documents/library";

/** The organisation behind a share link, if the token is right. */
export async function publicLibraryOrg(slug: string, token: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await createServiceClient().from("organisations").select("id, name, timezone, settings").eq("slug", slug).maybeSingle();
  const have = (data?.settings as Record<string, unknown> | null)?.docs_share_token;
  if (!data || typeof have !== "string" || have.length !== token.length || !timingSafeEqual(Buffer.from(have), Buffer.from(token))) return null;
  return data as { id: string; name: string; timezone: string };
}

export function DocList({ docs, base }: { docs: LibraryDoc[]; base: string }) {
  if (!docs.length) return <p className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-[0.875rem] text-ink-muted">No documents to show right now.</p>;
  return (
    <div className="mt-6 space-y-5">
      {groupByCategory(docs).map(([category, list]) => (
        <section key={category}>
          <h2 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wide text-ink-faint">{category}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {list.map((d) => (
              <li key={d.id}>
                <a href={`${base}/${d.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-50">
                  <FileText className="h-5 w-5 shrink-0 text-[color:var(--portal-brand-ink)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium text-ink">{d.name}</span>
                    <span className="block text-[0.75rem] text-ink-muted">{[d.description, d.expires_on ? `Valid until ${fmtDate(d.expires_on)}` : null, fileSize(d.size_bytes)].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Download className="h-4 w-4 shrink-0 text-ink-faint" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
