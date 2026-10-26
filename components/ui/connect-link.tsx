import Link from "next/link";

/** "Xero not connected · Connect" — always a way to the Integrations page to fix it. */
export function NotConnected({ name, note, className }: { name: string; note?: string; className?: string }) {
  return (
    <Link href="/settings/integrations" className={className ?? "text-ink-faint hover:text-brand-700"} title={`Connect ${name} in Settings → Integrations`}>
      {name} not connected{note ? ` · ${note}` : ""} · <span className="font-medium text-brand-700 underline underline-offset-2">Connect</span>
    </Link>
  );
}
