import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CLASSIFICATION } from "@/lib/status";
import { fmtDateTime, relative } from "@/lib/format";
import type { EmailMessage, EmailThread } from "@/lib/types";
import { cn } from "@/lib/cn";

export function Conversation({ threads, messages, tz, orgName, gmailConnected }: {
  threads: EmailThread[]; messages: EmailMessage[]; tz: string; orgName: string; gmailConnected: boolean;
}) {
  if (threads.length === 0) {
    return (
      <div className="px-5 pb-5">
        <p className="text-[12.5px] text-ink-muted">No email conversation linked yet.</p>
        <ReplyBox connected={gmailConnected} />
      </div>
    );
  }
  return (
    <div className="space-y-5 px-5 pb-5">
      {threads.map((t) => {
        const msgs = messages.filter((m) => m.thread_id === t.id).sort((a, b) => a.sent_at.localeCompare(b.sent_at));
        const c = CLASSIFICATION[t.classification];
        return (
          <section key={t.id} className="rounded-xl border border-line">
            <header className="flex flex-wrap items-center gap-2 border-b border-line bg-zinc-50/60 px-4 py-2.5">
              <h4 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{t.subject ?? "(no subject)"}</h4>
              <Badge tone={c.tone}>{c.label}{t.classification_confidence != null && t.classification === "needs_review" ? ` · ${Math.round(t.classification_confidence * 100)}%` : ""}</Badge>
              {t.state === "needs_reply" && <Badge tone="red" dot>Needs reply</Badge>}
              {t.state === "awaiting_customer" && <Badge tone="neutral">Awaiting customer</Badge>}
            </header>
            <ol className="divide-y divide-line">
              {msgs.map((m) => {
                const out = m.direction === "outbound";
                return (
                  <li key={m.id} className={cn("flex gap-3 px-4 py-3.5", out && "bg-brand-50/30")}>
                    <Avatar name={out ? orgName : m.from_name ?? m.from_email} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className={cn("text-[13px] text-ink", !m.is_read && "font-semibold")}>{m.from_name ?? m.from_email}</span>
                        <span className="text-[12px] text-ink-faint">{out ? `to ${m.to_emails.join(", ")}` : m.from_email}</span>
                        <span className="ml-auto text-[11.5px] text-ink-faint" title={fmtDateTime(m.sent_at, tz)}>{relative(m.sent_at)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-muted">{m.body_text ?? m.snippet}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      <ReplyBox connected={gmailConnected} />
    </div>
  );
}

function ReplyBox({ connected }: { connected: boolean }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-line-strong bg-zinc-50/50 px-4 py-3">
      <textarea disabled placeholder={connected ? "Write a reply…" : "Reply from EventureOS — sent through your Gmail account"} rows={2}
        className="w-full resize-none bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed" />
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[12px] text-ink-faint">
          {connected ? "Replies send from your connected Gmail and stay in Gmail." : "Gmail isn’t connected yet. Replies will send through your own Gmail and thread back here automatically."}
        </span>
        {!connected && (
          <Link href="/settings" className="shrink-0 text-[12.5px] font-medium text-brand-600 hover:text-brand-700">Connect Gmail</Link>
        )}
      </div>
    </div>
  );
}
